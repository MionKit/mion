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

// Entry is the in-Go shape that mirrors TS-side `Entry`.
// Code is the JS-stripped factory body; BodyHash is byte-compatible.
//
// sourceFile/callPos are unexported origin-tracking fields used internally
// by ExtractFromProgramCached to build cross-file collision diagnostics. They're
// elided from JSON serialisation (unexported) and from the module render
// (the module emitter reads only Key()/ParamNames/Code/BodyHash).
type Entry struct {
	// ID identifies this pure function: the package that owns it and a hash of
	// the body that ships (`@acme/text#pf_9Zt1bRm4cVaPqL`). Built by IDFor; it is
	// the registry key everywhere.
	ID string
	// BindingName is the identifier the registration is assigned to, or empty
	// for one written straight into a call. It names nothing in the id — the
	// hash does that — and exists because a hash is unreadable in a diagnostic
	// and unusable as a generated constant's name.
	BindingName string
	ParamNames  []string
	Code        string
	// PureFnDependencies is the sorted, deduped list of pure-fn ids this
	// factory accesses via `utl.getPureFn` / `usePureFn` / `getCompiledPureFn`
	// calls. Statically extracted by extractDeps during the same purity walk;
	// absent when the factory has no first parameter to identify utl through.
	PureFnDependencies []string
	// FactoryArgStart / FactoryArgEnd are the byte offsets of the user's
	// factory argument expression in the `registerPureFnFactory(factory)`
	// call. Used by the Vite plugin to replace that span with
	// the pure fn's entry-module import binding so the canonical fn body
	// lives only in the emitted pureFns cache module.
	FactoryArgStart int
	FactoryArgEnd   int
	// FilePath is the absolute source path the entry was extracted from.
	// Stable across requests for one Program. Used by the emitter when
	// the wire `Replacement.File` field needs to be populated.
	FilePath string
	// IDInjectPos / IDInjectText drive id injection: `registerPureFn(fn, id?)`
	// leaves the trailing `id?` slot empty at author time, so the build splices
	// the id in. IDInjectPos is the byte offset of the call's closing `)` (the
	// point insertion), and IDInjectText is the literal to splice (with a
	// leading `, ` unless the call already ends with a trailing comma). Empty
	// IDInjectText means the call already wrote its id, so nothing is spliced.
	IDInjectPos  int
	IDInjectText string
	// CalleeName / CalleeModule / Form are report-only attribution fields,
	// populated by extractOne and surfaced through the pure-fn build report
	// (protocol.PureFnSite) — never used by the module render or the rewrite.
	// CalleeName is the identifier the site invoked (a primitive registrar, a
	// framework wrapper, or a renamed import); CalleeModule is the
	// nearest-package.json / ambient-module name of the file declaring that
	// callee. Form is "direct" | "factory".
	CalleeName   string
	CalleeModule string
	Form         string

	sourceFile *ast.SourceFile
	callPos    int
}

// Key returns the cache key the virtual module uses to look up this entry: its
// id, verbatim.
func (p Entry) Key() string {
	return p.ID
}

// SourceFileLookup is the narrow program-side surface ExtractFromProgramCached
// needs. *program.Program satisfies it.
type SourceFileLookup interface {
	SourceFile(absPath string) *ast.SourceFile
}

// FileCache memoizes per-file extraction results for the lifetime of ONE
// Program — source files are immutable within a Program, so a file's raw
// entries/diagnostics never change between requests. Only the per-file AST
// walk + purity checks are cached; the cross-file fold (dedup + PFE9004
// collision detection) is set-dependent and re-runs cheaply on every call.
// The resolver owns one instance and drops it on Program swap / reset.
// Not safe for concurrent use (same constraint as the package).
type FileCache struct {
	entries map[string][]Entry
	diags   map[string][]diagnostics.Diagnostic
	ctx     *resolveCtx
}

// resolver returns the Program-wide resolve context, built on first use. It
// must be shared: an id is the hash of a body carrying its dependencies' ids,
// so the memo only pays for itself when every file resolves against one. A nil
// cache (the uncached lane) gets a throwaway context, which is still correct,
// just not reused.
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

// ExtractFromProgramCached walks every file in `files`, finds calls to
// `registerPureFnFactory(...)` whose resolved signature carries the
// expected marker brands (CompTimeArgs<string> + PureFunction<F>
// on slots 0, 1), and returns (deduped entries, diagnostics).
//
// Discovery is two-layered: a cheap callee-name filter
// (`pureFnFactoryCalleeName`) rules out unrelated calls without paying
// for signature resolution, then a brand check on the resolved
// signature verifies the call is the real, branded
// `registerPureFnFactory` from the marker package (not a user's
// same-named local function). The brands are the correctness contract;
// the name is a fast-path filter only.
//
// Diagnostics never block compilation — they're surfaced via the Vite
// plugin's `this.warn` channel using the canonical tsc-compatible
// format. Note: marker-shape diagnostics (non-literal id / factory) are
// emitted by `resolver.scanCall` via CTA001 / PFN001,
// NOT here. This pass emits only purefn-specific diagnostics:
// PFE9004 (cross-file collision), PFE9005 (destructured factory
// param), PFE9006-9011 (purity), PFE9013 (deps).
//
// Dedup semantics (per plan):
//
//	Key not seen          → add to entries
//	Key seen, same hash   → silently skip (idempotent re-registration)
//	Key seen, different   → append PFE9004 diagnostic with Related = winner;
//	                         first occurrence kept in entries
//
// Order: entries sorted by Key (alphabetical); diagnostics sorted by Site
// (filepath, line, col) — both deterministic for stable test fixtures.
//
// The per-Program FileCache is optional: cached files skip the AST walk +
// purity checks entirely, fresh files are extracted and stored. A nil cache
// degrades to a plain uncached walk.
func ExtractFromProgramCached(typeChecker *checker.Checker, markerOpts marker.Options, lookup SourceFileLookup, files []string, cache *FileCache) ([]Entry, []diagnostics.Diagnostic) {
	var entries []Entry
	var diags []diagnostics.Diagnostic
	seen := map[string]int{} // key → index in entries (the winner)
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

// RawEntries returns EVERY extracted entry across `files` WITHOUT the cross-file
// idempotent dedup ExtractFromProgramCached applies — one entry per call site,
// duplicates included. It is the source for per-file REWRITES: every
// registration call site must be rewritten (its factory swapped for the entry
// binding, and the computed id spliced into the empty trailing slot), even
// two same-file calls that share a body. Dedup is correct for the emitted MODULE
// (one row per id — the graph collapses duplicate ids) and for PFE9004
// collisions, but a deduped list drops the loser's byte offsets, so the
// un-rewritten duplicate would lose its injected id and throw at runtime.
// Uses the same per-Program FileCache, so it never re-walks a file
// ExtractFromProgramCached already cached.
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

// extractFromSourceFile is the per-file extraction core: walk every
// CallExpression and ask the context for its entry. Going through the memo is
// what keeps a helper that five files depend on from being extracted six times:
// whichever dependent reached it first already finished it.
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

// ParamHasMarker reports whether the parameter's resolved type carries the
// specified marker brand: the one parameter-level brand check every call-site
// extractor (this package and the batches extractor) shares, so a marker
// recognised here is recognised identically there.
func ParamHasMarker(typeChecker *checker.Checker, markerOpts marker.Options, paramSymbol *ast.Symbol, want marker.Kind) bool {
	return paramHasMarker(typeChecker, markerOpts, paramSymbol, want)
}

// paramHasMarker reports whether the parameter's resolved type carries
// the specified marker brand. Wraps marker.DetectAny with the kind
// filter.
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
	// CompTimeArgs is the zero-cost identity marker (markers.ts) — invisible to
	// DetectAny on the resolved type, so recognise it off the parameter's
	// `CompTimeArgs<…>` annotation node (matches the resolver's scan path).
	if comptimeargs.IsCompTimeArgsParamNode(typeChecker, paramSymbol, markerOpts) {
		return marker.KindCompTimeArgs, true
	}
	return 0, false
}

// pureFnFormMarker reports whether a parameter carries one of the two pure-fn
// FORM markers and, if so, whether the argument is the DIRECT form (wrap=true,
// `PureFunction<F>` — the arg is the pure fn itself, wrapped into `() => fn`) or
// the FACTORY form (wrap=false, `PureFunctionFactory<F>` — the arg is a factory,
// emitted as-is). The marker on this parameter is what carries the intent through
// a wrapper, so a renamed / re-exported registrar resolves the same way.
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

// extractOne processes a single CallExpression: a pure-fn registration
// (`registerPureFn` / `registerPureFnFactory`, or any wrapper carrying the same
// marker brands) is extracted, anything else is skipped. The factory-vs-direct
// intent rides the pure-fn parameter's marker. Returns (nil, nil) when the call
// is not a registration, or when an argument can't be resolved to its literal
// form.
//
// Marker-shape validation (non-inline factory) is emitted as CTA001 / PFN001 by
// `resolver.scanCall` — this function does NOT double-report. Only purefn
// specific diagnostics are emitted here (PFE9005, PFE9006-9011, PFE9013,
// PFE9014).
//
// The returned Entry carries internal-only fields (sourceFile, callPos) that
// the caller uses for cross-file collision reporting; these never reach the
// wire.
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

// attachCallee records the report-only callee attribution on a freshly
// extracted entry: the callee identifier the site invoked and the module that
// declares it. A nil entry (the call resolved to no entry) is a
// no-op. The callee NAME is read syntactically off the call — `f(...)` or
// `ns.f(...)` — so it names exactly what the source wrote (a primitive
// registrar, a framework wrapper, or a renamed import). The callee MODULE comes
// from the resolved signature's declaration, so a wrapper resolves to the
// package that declares the wrapper (e.g. `@acme/toolkit`), not to
// `@mionjs/run-types`. Both are cheap add-ons over data extraction already
// touched, so they only run when the report is being built.
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

// calleeIdentifierName returns the text of the call's callee identifier —
// `f(...)` yields "f", `ns.f(...)` yields "f" (the accessed member). Anything
// else (a computed / complex callee) yields "".
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

// extractRegistration turns one registration call into an Entry:
// `registerPureFn(fn, id?)` (direct) / `registerPureFnFactory(factory, id?)`
// (factory), or any wrapper carrying the same brands. The pure-fn argument is
// rewritten to the entry-module tuple, and the empty trailing `id?` slot is
// spliced with the id, so a library wrapper injects an identity that matches a
// direct call byte-for-byte.
//
// An id ALREADY written at the call site (the generated built-in constants, or
// a re-scan of rewritten source) is verified against the computed one instead
// of being trusted: a mismatch is PFE9014 and yields no entry, because letting
// it through would register one body under two ids.
func (ctx *resolveCtx) extractRegistration(sourceFile *ast.SourceFile, call *ast.Node, callExpr *ast.CallExpression, wrap bool, fnParamIndex, idParamIndex int) (*Entry, []diagnostics.Diagnostic) {
	if callExpr.Arguments == nil || len(callExpr.Arguments.Nodes) <= fnParamIndex {
		return nil, nil
	}
	args := callExpr.Arguments.Nodes

	fnNode, fnResult := comptimeargs.CheckLiteralFunction(ctx.typeChecker, args[fnParamIndex])
	// Non-inline arg (a `null` hollow registration, a forwarded wrapper param,
	// or a re-scanned rewritten `__rt_pf…` binding): PFN001 is the resolver's
	// job — bail quietly, so the rewrite is idempotent and wrapper bodies
	// forwarding `fn` don't extract.
	if !fnResult.Ok {
		return nil, nil
	}

	entry, diags := ctx.buildPureFnEntry(sourceFile, call, fnNode, args[fnParamIndex], wrap)
	if entry == nil {
		return nil, diags
	}

	if len(args) > idParamIndex {
		written, result := comptimeargs.ResolveLiteralString(ctx.typeChecker, args[idParamIndex])
		// An id that does not resolve to a literal is a forwarded wrapper
		// parameter we cannot read; there is nothing to verify, so it rides
		// through and the registrar sees whatever the caller passed.
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
	// Inject the id only when its slot is genuinely empty. Optional non-marker
	// gaps between the last written argument and the id slot are padded with
	// `undefined` so the id lands at its declared parameter index.
	entry.IDInjectPos = call.End() - 1
	entry.IDInjectText = TrailingArgText(entry.ID, callExpr.Arguments.HasTrailingComma(), idParamIndex-len(args))
	return entry, diags
}

// TrailingArgText renders the spliced trailing argument(s) an injection lane
// appends at a call's closing `)` — the quoted id (a pure fn's, the batches
// lane's `"b_<hash>"`), preceded by one `undefined` per skipped optional slot
// (`undefinedPadding`) and by `, ` unless the call already ends with a trailing
// comma (in which case the position sits right after a separator and a leading
// comma would produce an empty `f(a,, …)` argument). Exported so every lane
// that splices a trailing id renders the byte-identical text.
func TrailingArgText(id string, trailingComma bool, undefinedPadding int) string {
	text := strings.Repeat("undefined, ", undefinedPadding) + jsquote.Single(id)
	if trailingComma {
		return text
	}
	return ", " + text
}

// pureFnCode returns the type-stripped code for a pure-fn argument, honoring the
// form:
//   - FACTORY (wrap=false): the arg IS the factory — strip its body (a block or a
//     concise-body expression), which `createPureFnJS` re-wraps as
//     `function(<params>){<body>}`.
//   - DIRECT (wrap=true): the arg IS the pure fn — render it as `return <fn>;`
//     (mirroring the override lane), so the synthesised zero-arg factory
//     `function(){ return <fn> }` yields it. `stripTypesFromExpr` over the whole
//     function node produces the `return`-wrapped form.
//
// `lowerings` are replacement spans applied along with the type stripping: the
// imported ids a body reaches another pure fn through, rewritten to their
// quoted literals, so the emitted body carries no free identifier.
//
// ok is false when a factory-form arg has no body.
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

// buildPureFnEntry is the extraction every registration runs against its
// resolved pure-fn node, in the one order the pieces allow: the factory's
// dependencies first (they decide what the body lowers to), then the code, then
// the id (a registration bound to no name is identified by that code), then the
// body hash, then purity.
//
// The FACTORY form (wrap=false) extracts the factory's parameter names (+ the
// PFE9005 destructuring guard, since the emitter reconstructs
// `function(<params>){…}` by name) and its static pure-fn dependencies (the
// `utl.getPureFn(id)` calls its body reaches). The DIRECT form (wrap=true) has
// neither: the synthesised factory takes no `utl` and the pure fn is emitted
// verbatim inside `return <fn>;`, so its own params ride along untouched.
//
// `fnArg` is the argument node whose byte span the plugin rewrites to the
// entry-module tuple.
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
		// Param-name extraction + destructuring guard.
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
		// Static dep extraction — walk the factory body for calls like
		// `<utlName>.getPureFn(slugify)` and collect the ids they resolve to
		// (the first param identifies `utl`), plus the spans to lower.
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

	// Purity validation — port of the reference eslint rules'
	// `pure-functions.ts` rule. Emits PFE9006-PFE9011 diagnostics for
	// this/await/yield, dynamic import, forbidden identifiers, and
	// closure-variable references. Build never fails; the entry still
	// emits even when violations exist (same posture as PFE9005). Runs on the
	// pure fn itself for BOTH forms — a captured variable is unsafe either way.
	// The lowered dep arguments are exempt: they are literals by the time the
	// body ships, so they are not captures.
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

// siteFromFile reproduces a site from a previously-captured file + pos pair,
// used when the winner of a collision lives in a different file from the
// duplicate.
func siteFromFile(sourceFile *ast.SourceFile, pos int) diagnostics.Site {
	if sourceFile == nil {
		return diagnostics.Site{}
	}
	line, col := textpos.LineCol(sourceFile, pos)
	return diagnostics.Site{
		FilePath:  sourceFile.FileName(),
		StartLine: line,
		StartCol:  col,
		EndLine:   line,
		EndCol:    col,
	}
}
