package purefunctions

import (
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/comptimeargs"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsquote"
	"github.com/mionkit/mion/ts-go-runtypes/internal/textpos"
)

// Entry is one extracted pure-fn registration; Code is the JS-stripped factory body.
// sourceFile/callPos track where it came from and never leave this package.
type Entry struct {
	// ID is the package that owns this pure function plus a hash of the body that ships
	// (`@acme/text#pf_9Zt1bRm4cVaPqL`), and is the registry key everywhere.
	ID string
	// BindingName is the identifier the registration is assigned to, empty for one written
	// straight into a call. It reaches no id: a hash is what identifies, but it is unreadable
	// in a diagnostic and unusable as a generated constant's name.
	BindingName string
	ParamNames  []string
	Code        string
	// PureFnDependencies is the sorted, deduped list of pure-fn ids this factory reaches
	// through its tracked `utl` lookups, absent when it has no first parameter to identify
	// utl through.
	PureFnDependencies []string
	// FactoryArgStart / FactoryArgEnd are the byte offsets of the factory argument in the
	// `registerPureFnFactory(factory)` call. The span is replaced with the entry-module import
	// binding, so the body lives only in the emitted cache module.
	FactoryArgStart int
	FactoryArgEnd   int
	// FilePath is the absolute source path the entry was extracted from, stable across
	// requests for one Program.
	FilePath string
	// IDInjectPos / IDInjectText drive id injection: `registerPureFn(fn, id?)` leaves the
	// trailing slot empty at author time, so the build splices the id in at the call's closing
	// `)`. Empty IDInjectText means the call already wrote its id.
	IDInjectPos  int
	IDInjectText string
	// CalleeName / CalleeModule / Form are report-only attribution, surfaced through
	// protocol.PureFnSite and never read by the module render or the rewrite. CalleeName is
	// the identifier the site invoked, CalleeModule the nearest-package.json / ambient-module
	// name of the file declaring it, Form "direct" or "factory".
	CalleeName   string
	CalleeModule string
	Form         string

	sourceFile *ast.SourceFile
	callPos    int
}

// Key returns the cache key this entry is looked up by: its id, verbatim.
func (p Entry) Key() string {
	return p.ID
}

// SourceFileLookup is the narrow program-side surface ExtractFromProgramCached
// needs. *program.Program satisfies it.
type SourceFileLookup interface {
	SourceFile(absPath string) *ast.SourceFile
}

// FileCache memoizes per-file extraction results for the lifetime of ONE Program: source files
// are immutable within a Program, so a file's raw entries and diagnostics never change between
// requests. The cross-file dedup is set-dependent and re-runs cheaply on every call. The resolver
// owns one instance and drops it on Program swap / reset. Not safe for concurrent use.
type FileCache struct {
	entries map[string][]Entry
	diags   map[string][]diagnostics.Diagnostic
	ctx     *resolveCtx
}

// resolver returns the Program-wide resolve context, built on first use. It must be shared: an id
// is the hash of a body carrying its dependencies' ids, so the memo only pays for itself when
// every file resolves against one. A nil cache gets a throwaway context, correct but not reused.
func (cache *FileCache) resolver(typeChecker *checker.Checker, markerOpts marker.Options) *resolveCtx {
	if cache == nil {
		return newResolveCtx(typeChecker, markerOpts)
	}
	if cache.ctx == nil {
		cache.ctx = newResolveCtx(typeChecker, markerOpts)
	}
	return cache.ctx
}

// NewFileCache returns an empty per-Program extraction memo.
func NewFileCache() *FileCache {
	return &FileCache{entries: map[string][]Entry{}, diags: map[string][]diagnostics.Diagnostic{}}
}

func (cache *FileCache) get(filePath string) ([]Entry, []diagnostics.Diagnostic, bool) {
	if cache == nil {
		return nil, nil, false
	}
	entries, ok := cache.entries[filePath]
	if !ok {
		return nil, nil, false
	}
	return entries, cache.diags[filePath], true
}

func (cache *FileCache) put(filePath string, entries []Entry, diagnostics []diagnostics.Diagnostic) {
	if cache == nil {
		return
	}
	cache.entries[filePath] = entries
	cache.diags[filePath] = diagnostics
}

// ExtractFromProgramCached walks every file in `files` for registration calls and returns the
// deduped entries plus their diagnostics.
//
// Discovery is two-layered: a cheap callee-name filter rules out unrelated calls without paying
// for signature resolution, then the brand check on the resolved signature decides. The brands are
// the correctness contract, the name is a fast-path filter only.
//
// Marker-shape diagnostics (non-literal id / factory) are emitted by `resolver.scanCall` via
// CTA001 / PFN001, NOT here; this pass emits only PFE9005 (destructured factory param),
// PFE9006-9011 (purity) and PFE9013 (deps).
//
// Entries come out sorted by Key and diagnostics by Site, both deterministic for stable fixtures.
// The per-Program FileCache is optional: a nil cache degrades to a plain uncached walk.
func ExtractFromProgramCached(typeChecker *checker.Checker, markerOpts marker.Options, lookup SourceFileLookup, files []string, cache *FileCache) ([]Entry, []diagnostics.Diagnostic) {
	var entries []Entry
	var diags []diagnostics.Diagnostic
	seen := map[string]int{} // key → index in entries
	ctx := cache.resolver(typeChecker, markerOpts)

	for _, filePath := range files {
		fileEntries, fileDiags, cached := cache.get(filePath)
		if !cached {
			sourceFile := lookup.SourceFile(filePath)
			if sourceFile == nil {
				continue
			}
			fileEntries, fileDiags = ctx.extractFromSourceFile(sourceFile)
			cache.put(filePath, fileEntries, fileDiags)
		}
		diags = append(diags, fileDiags...)
		for _, entry := range fileEntries {
			// One id is one body: the id IS the hash of the body that ships, so
			// a repeat is the same function written twice, never a conflict.
			if _, dup := seen[entry.Key()]; dup {
				continue
			}
			seen[entry.Key()] = len(entries)
			entries = append(entries, entry)
		}
	}

	sort.SliceStable(entries, func(i, j int) bool {
		return entries[i].Key() < entries[j].Key()
	})
	sort.SliceStable(diags, func(i, j int) bool {
		a, b := diags[i].Site, diags[j].Site
		if a.FilePath != b.FilePath {
			return a.FilePath < b.FilePath
		}
		if a.StartLine != b.StartLine {
			return a.StartLine < b.StartLine
		}
		return a.StartCol < b.StartCol
	})
	return entries, diags
}

// RawEntries returns EVERY extracted entry across `files`, one per call site, duplicates
// included. It is the source for per-file REWRITES: every registration call site must be
// rewritten, even two same-file calls that share a body. Dedup is correct for the emitted MODULE,
// which collapses duplicate ids, but a deduped list drops the loser's byte offsets, so the
// un-rewritten duplicate would lose its injected id and throw at runtime. Shares the per-Program
// FileCache, so it never re-walks a file ExtractFromProgramCached already cached.
func RawEntries(typeChecker *checker.Checker, markerOpts marker.Options, lookup SourceFileLookup, files []string, cache *FileCache) []Entry {
	ctx := cache.resolver(typeChecker, markerOpts)
	var all []Entry
	for _, filePath := range files {
		fileEntries, fileDiags, cached := cache.get(filePath)
		if !cached {
			sourceFile := lookup.SourceFile(filePath)
			if sourceFile == nil {
				continue
			}
			fileEntries, fileDiags = ctx.extractFromSourceFile(sourceFile)
			cache.put(filePath, fileEntries, fileDiags)
		}
		all = append(all, fileEntries...)
	}
	return all
}

// extractFromSourceFile asks the context for the entry of every CallExpression. Going through the
// memo keeps a helper five files depend on from being extracted six times.
func (ctx *resolveCtx) extractFromSourceFile(sourceFile *ast.SourceFile) ([]Entry, []diagnostics.Diagnostic) {
	var entries []Entry
	var diagnostics []diagnostics.Diagnostic
	findCalls(sourceFile, func(call *ast.Node) {
		entry, diags, cycle := ctx.entryFor(sourceFile, call)
		if cycle {
			return // the site that closed the cycle reported PFE9015
		}
		diagnostics = append(diagnostics, diags...)
		if entry != nil {
			entries = append(entries, *entry)
		}
	})
	return entries, diagnostics
}

// findCalls invokes cb for every CallExpression in sourceFile.
func findCalls(sourceFile *ast.SourceFile, cb func(*ast.Node)) {
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		if node.Kind == ast.KindCallExpression {
			cb(node)
		}
		node.ForEachChild(visit)
		return false
	}
	sourceFile.AsNode().ForEachChild(visit)
}

// ParamHasMarker reports whether the parameter's resolved type carries the marker brand: the one
// parameter-level check this package and the batches extractor share, so both recognise a marker
// identically.
func ParamHasMarker(typeChecker *checker.Checker, markerOpts marker.Options, paramSymbol *ast.Symbol, want marker.Kind) bool {
	return paramHasMarker(typeChecker, markerOpts, paramSymbol, want)
}

// paramHasMarker wraps marker.DetectAny with a kind filter.
func paramHasMarker(typeChecker *checker.Checker, markerOpts marker.Options, paramSymbol *ast.Symbol, want marker.Kind) bool {
	kind, ok := paramMarkerKind(typeChecker, markerOpts, paramSymbol)
	return ok && kind == want
}

// paramMarkerKind returns the marker kind a parameter carries (and true), or
// (0, false) when it carries none. One DetectAny pass, plus the CompTimeArgs
// zero-cost-identity fallback recognised off the annotation node.
func paramMarkerKind(typeChecker *checker.Checker, markerOpts marker.Options, paramSymbol *ast.Symbol) (marker.Kind, bool) {
	if paramSymbol == nil {
		return 0, false
	}
	paramType := checker.Checker_getTypeOfSymbol(typeChecker, paramSymbol)
	if kind, _, matched := marker.DetectAny(typeChecker, paramType, markerOpts); matched {
		return kind, true
	}
	// CompTimeArgs is the zero-cost identity marker (markers.ts), invisible to DetectAny on
	// the resolved type, so it is recognised off the annotation node, as the resolver's scan
	// path does.
	if comptimeargs.IsCompTimeArgsParamNode(typeChecker, paramSymbol, markerOpts) {
		return marker.KindCompTimeArgs, true
	}
	return 0, false
}

// pureFnFormMarker reports whether a parameter carries a pure-fn FORM marker and, if so, whether
// the argument is the DIRECT form (wrap=true, `PureFunction<F>`, the arg is the pure fn itself) or
// the FACTORY form (wrap=false, `PureFunctionFactory<F>`, the arg is a factory, emitted as-is).
// The marker carries that intent through a wrapper, so a renamed registrar resolves the same way.
func pureFnFormMarker(typeChecker *checker.Checker, markerOpts marker.Options, paramSymbol *ast.Symbol) (matched, wrap bool) {
	kind, ok := paramMarkerKind(typeChecker, markerOpts, paramSymbol)
	if !ok {
		return false, false
	}
	switch kind {
	case marker.KindPureFunction:
		return true, true
	case marker.KindPureFunctionFactory:
		return true, false
	}
	return false, false
}

// extractOne extracts a single CallExpression when it is a pure-fn registration, the
// factory-vs-direct intent riding the pure-fn parameter's marker. Returns (nil, nil) when the call
// is not a registration, or when an argument cannot be resolved to its literal form.
//
// Marker-shape validation (non-inline factory) is emitted as CTA001 / PFN001 by
// `resolver.scanCall`; this function does NOT double-report, and emits only PFE9005,
// PFE9006-9011, PFE9013 and PFE9014.
func (ctx *resolveCtx) extractOne(sourceFile *ast.SourceFile, call *ast.Node) (*Entry, []diagnostics.Diagnostic) {
	callExpr := call.AsCallExpression()
	if callExpr == nil {
		return nil, nil
	}
	matched, wrap, fnParamIndex, idParamIndex := ctx.isPureFnRegistration(call)
	if !matched {
		return nil, nil
	}
	entry, diags := ctx.extractRegistration(sourceFile, call, callExpr, wrap, fnParamIndex, idParamIndex)
	ctx.attachCallee(entry, call, callExpr)
	return entry, diags
}

// attachCallee records the report-only callee attribution. The NAME is read syntactically off the
// call, so it is exactly what the source wrote (a primitive registrar, a framework wrapper, a
// renamed import). The MODULE comes from the resolved signature's declaration, so a wrapper
// resolves to the package declaring the wrapper (`@acme/toolkit`), not to `@mionjs/run-types`.
func (ctx *resolveCtx) attachCallee(entry *Entry, call *ast.Node, callExpr *ast.CallExpression) {
	if entry == nil {
		return
	}
	entry.CalleeName = calleeIdentifierName(callExpr)
	signature := checker.Checker_getResolvedSignature(ctx.typeChecker, call, nil, 0)
	if signature == nil {
		return
	}
	entry.CalleeModule = marker.DeclaringModuleOfNode(checker.Signature_declaration(signature), marker.WithDefaults(ctx.markerOpts).FS)
}

// calleeIdentifierName returns the text of the call's callee identifier: `f(...)` and `ns.f(...)`
// both yield "f", anything more complex yields "".
func calleeIdentifierName(callExpr *ast.CallExpression) string {
	if callExpr == nil || callExpr.Expression == nil {
		return ""
	}
	expr := callExpr.Expression
	switch expr.Kind {
	case ast.KindIdentifier:
		return expr.Text()
	case ast.KindPropertyAccessExpression:
		name := expr.AsPropertyAccessExpression().Name()
		if name != nil {
			return name.Text()
		}
	}
	return ""
}

// extractRegistration turns one registration call into an Entry. The pure-fn argument is
// rewritten to the entry-module tuple and the empty trailing `id?` slot is spliced with the id, so
// a library wrapper injects an identity matching a direct call byte-for-byte.
//
// An id ALREADY written at the call site (the generated built-in constants, or a re-scan of
// rewritten source) is verified against the computed one rather than trusted: a mismatch is
// PFE9014 and yields no entry, because letting it through would register one body under two ids.
func (ctx *resolveCtx) extractRegistration(sourceFile *ast.SourceFile, call *ast.Node, callExpr *ast.CallExpression, wrap bool, fnParamIndex, idParamIndex int) (*Entry, []diagnostics.Diagnostic) {
	if callExpr.Arguments == nil || len(callExpr.Arguments.Nodes) <= fnParamIndex {
		return nil, nil
	}
	args := callExpr.Arguments.Nodes

	fnNode, fnResult := comptimeargs.CheckLiteralFunction(ctx.typeChecker, args[fnParamIndex])
	// A non-inline arg (a hollow `null` registration, a forwarded wrapper param, a re-scanned
	// `__rt_pf…` binding) is the resolver's PFN001 to report. Bailing quietly keeps the rewrite
	// idempotent and stops a wrapper forwarding `fn` from extracting.
	if !fnResult.Ok {
		return nil, nil
	}

	entry, diags := ctx.buildPureFnEntry(sourceFile, call, fnNode, args[fnParamIndex], wrap)
	if entry == nil {
		return nil, diags
	}

	if len(args) > idParamIndex {
		written, result := comptimeargs.ResolveLiteralString(ctx.typeChecker, args[idParamIndex])
		// An id that does not resolve to a literal is an unreadable forwarded wrapper
		// parameter: nothing to verify, so the registrar sees whatever the caller passed.
		if result.Ok && written.Text() != entry.ID {
			diags = append(diags, diagnostics.New(
				diagnostics.CodePureFnIdMismatch,
				siteFromNode(sourceFile, args[idParamIndex]),
				written.Text(),
				entry.ID,
			))
			return nil, diags
		}
		return entry, diags
	}
	// The id is injected only into a genuinely empty slot; an optional non-marker gap before it
	// is padded with `undefined` so the id lands at its declared parameter index.
	entry.IDInjectPos = call.End() - 1
	entry.IDInjectText = TrailingArgText(entry.ID, callExpr.Arguments.HasTrailingComma(), idParamIndex-len(args))
	return entry, diags
}

// TrailingArgText renders the arguments an injection lane splices at a call's closing `)`: the
// quoted id, one `undefined` per skipped optional slot, and a leading `, ` unless the call already
// ends with a trailing comma, where one more would produce an empty `f(a,, …)` argument.
// Exported so every lane splicing a trailing id renders byte-identical text.
func TrailingArgText(id string, trailingComma bool, undefinedPadding int) string {
	text := strings.Repeat("undefined, ", undefinedPadding) + jsquote.Single(id)
	if trailingComma {
		return text
	}
	return ", " + text
}

// pureFnCode returns the type-stripped code for a pure-fn argument, by form:
//   - FACTORY (wrap=false): the arg IS the factory, so its body is stripped and `createPureFnJS`
//     re-wraps it as `function(<params>){<body>}`.
//   - DIRECT (wrap=true): the arg IS the pure fn, rendered as `return <fn>;` (as the override lane
//     does), so the synthesised zero-arg factory yields it.
//
// `lowerings` are replacement spans applied along with the type stripping: the imported ids a body
// reaches another pure fn through, rewritten to quoted literals, so the emitted body carries no
// free identifier. ok is false when a factory-form arg has no body.
func pureFnCode(sourceFile *ast.SourceFile, fnNode *ast.Node, wrap bool, lowerings []textRange) (string, bool) {
	if wrap {
		return stripTypesFromExpr(sourceFile, fnNode, lowerings), true
	}
	body := fnNode.Body()
	if body == nil {
		return "", false
	}
	if body.Kind == ast.KindBlock {
		return stripTypesFromBlock(sourceFile, body, lowerings), true
	}
	return stripTypesFromExpr(sourceFile, body, lowerings), true
}

// buildPureFnEntry runs the extraction in the one order the pieces allow: the factory's
// dependencies first (they decide what the body lowers to), then the code, then the id, which is
// that code's hash, then purity.
//
// The FACTORY form (wrap=false) extracts the factory's parameter names (plus the PFE9005
// destructuring guard, the emitter reconstructing `function(<params>){…}` by name) and its static
// pure-fn dependencies. The DIRECT form (wrap=true) has neither: the synthesised factory takes no
// `utl` and the pure fn is emitted verbatim inside `return <fn>;`, its own params untouched.
//
// `fnArg` is the argument node whose byte span the rewrite replaces.
func (ctx *resolveCtx) buildPureFnEntry(sourceFile *ast.SourceFile, call *ast.Node, fnNode *ast.Node, fnArg *ast.Node, wrap bool) (*Entry, []diagnostics.Diagnostic) {
	var diags []diagnostics.Diagnostic
	var paramNames []string
	var pureFnDependencies []string
	var lowerings []textRange
	var exempt []textRange
	if !wrap {
		fnLike := fnNode.FunctionLikeData()
		if fnLike == nil || fnLike.Parameters == nil {
			return nil, diags
		}
		paramNames = make([]string, 0, len(fnLike.Parameters.Nodes))
		for _, paramNode := range fnLike.Parameters.Nodes {
			paramDecl := paramNode.AsParameterDeclaration()
			nameNode := paramDecl.Name()
			if nameNode == nil || nameNode.Kind != ast.KindIdentifier {
				diags = append(diags, diagnostics.New(
					diagnostics.CodeDestructuredParam,
					siteFromNode(sourceFile, paramNode),
					ctx.siteID(sourceFile, call),
				))
				return nil, diags
			}
			paramNames = append(paramNames, nameNode.Text())
		}
		// The factory's first parameter is what identifies `utl` in its body.
		utlName := ""
		if len(fnLike.Parameters.Nodes) > 0 {
			firstParamDecl := fnLike.Parameters.Nodes[0].AsParameterDeclaration()
			if firstParamDecl != nil {
				firstParamName := firstParamDecl.Name()
				if firstParamName != nil && firstParamName.Kind == ast.KindIdentifier {
					utlName = firstParamName.Text()
				}
			}
		}
		var depDiags []diagnostics.Diagnostic
		pureFnDependencies, lowerings, exempt, depDiags = ctx.extractDeps(sourceFile, fnNode, utlName)
		diags = append(diags, depDiags...)
	}

	code, ok := pureFnCode(sourceFile, fnNode, wrap, lowerings)
	if !ok {
		return nil, diags
	}
	// The body here is the LOWERED one, carrying its dependencies' ids in place
	// of the bindings they were written with. That is what makes the hash an
	// identity: two registrations share an id only when they ship the same
	// function, dependencies included.
	id := IDFor(ctx.markerOpts, sourceFile.FileName(), CodeHash(code))

	// Purity emits PFE9006-PFE9011 without withholding output: the entry still emits when
	// violations exist, the same posture as PFE9005. It runs on the pure fn itself for BOTH
	// forms, a captured variable being unsafe either way. The lowered dep arguments are exempt,
	// being literals by the time the body ships.
	diags = append(diags, checkPurity(sourceFile, fnNode, exempt)...)

	form := "factory"
	if wrap {
		form = "direct"
	}
	entry := &Entry{
		ID:                 id,
		BindingName:        bindingNameOf(call),
		ParamNames:         paramNames,
		Code:               code,
		PureFnDependencies: pureFnDependencies,
		FactoryArgStart:    fnArg.Pos(),
		FactoryArgEnd:      fnArg.End(),
		FilePath:           sourceFile.FileName(),
		Form:               form,
		sourceFile:         sourceFile,
		callPos:            call.Pos(),
	}
	return entry, diags
}

// siteID names a registration in a diagnostic raised before its id can be
// computed, which is why a registration bound to no name reads `#(unnamed)`
// here rather than carrying its body hash.
func (ctx *resolveCtx) siteID(sourceFile *ast.SourceFile, call *ast.Node) string {
	name := bindingNameOf(call)
	if name == "" {
		name = "(unnamed)"
	}
	return IDFor(ctx.markerOpts, sourceFile.FileName(), name)
}

// siteFromNode builds a 1-based diagnostics.Site for the node's start/end.
func siteFromNode(sourceFile *ast.SourceFile, node *ast.Node) diagnostics.Site {
	return textpos.NodeSite(sourceFile.FileName(), sourceFile, node)
}
