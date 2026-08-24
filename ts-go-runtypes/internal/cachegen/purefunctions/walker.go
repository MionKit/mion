package purefunctions

import (
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/compiler/comptimeargs"
	"github.com/mionkit/ts-runtypes/internal/compiler/marker"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/jsquote"
	"github.com/mionkit/ts-runtypes/internal/textpos"
)

// Entry is the in-Go shape that mirrors TS-side `Entry`.
// Code is the JS-stripped factory body; BodyHash is byte-compatible.
//
// sourceFile/callPos are unexported origin-tracking fields used internally
// by ExtractFromProgramCached to build cross-file collision diagnostics. They're
// elided from JSON serialisation (unexported) and from the module render
// (the module emitter reads only Key()/ParamNames/Code/BodyHash).
type Entry struct {
	Namespace    string
	FunctionName string
	ParamNames   []string
	Code         string
	BodyHash     string
	// PureFnDependencies is the sorted, deduped list of
	// `"<namespace>::<fnName>"` keys this pure-fn factory accesses via
	// `utl.getPureFn` / `usePureFn` / `getCompiledPureFn` /
	// `findCompiledPureFn` calls. Statically extracted by extractDeps
	// during the same purity walk; absent when the factory has no first
	// parameter to identify utl through.
	PureFnDependencies []string
	// FactoryArgStart / FactoryArgEnd are the byte offsets of the user's
	// factory argument expression in the `registerPureFnFactory(pureFnId,
	// factory)` call. Used by the Vite plugin to replace that span with
	// the pure fn's entry-module import binding so the canonical fn body
	// lives only in the emitted pureFns cache module.
	FactoryArgStart int
	FactoryArgEnd   int
	// FilePath is the absolute source path the entry was extracted from.
	// Stable across requests for one Program. Used by the emitter when
	// the wire `Replacement.File` field needs to be populated.
	FilePath string
	// HashInjectPos / HashInjectText drive the anonymous-lane hash injection:
	// registerAnonymousPureFn(fn, hash?) leaves the trailing `hash?` slot empty
	// at author time, so the plugin splices `"rt::<bodyHash>"` in. HashInjectPos
	// is the byte offset of the call's closing `)` (the point insertion), and
	// HashInjectText is the literal to splice (with a leading `, ` unless the
	// call already ends with a trailing comma). Empty HashInjectText marks the
	// named lane, which injects nothing.
	HashInjectPos  int
	HashInjectText string
	// CalleeName / CalleeModule / Lane / Form are report-only attribution
	// fields, populated by extractOne and surfaced through the pure-fn build
	// report (protocol.PureFnSite) — never used by the module render or the
	// rewrite. CalleeName is the identifier the site invoked (a primitive
	// registrar, a framework wrapper, or a renamed import); CalleeModule is the
	// nearest-package.json / ambient-module name of the file declaring that
	// callee. Lane is "named" | "anonymous"; Form is "direct" | "factory".
	CalleeName   string
	CalleeModule string
	Lane         string
	Form         string

	sourceFile *ast.SourceFile
	callPos    int
}

// Key returns the cache key the virtual module uses to look up this entry.
func (p Entry) Key() string {
	return p.Namespace + "::" + p.FunctionName
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

	for _, filePath := range files {
		fileEntries, fileDiags, cached := cache.get(filePath)
		if !cached {
			sourceFile := lookup.SourceFile(filePath)
			if sourceFile == nil {
				continue
			}
			fileEntries, fileDiags = extractFromSourceFile(typeChecker, markerOpts, sourceFile)
			cache.put(filePath, fileEntries, fileDiags)
		}
		diags = append(diags, fileDiags...)
		for _, entry := range fileEntries {
			if winnerIdx, dup := seen[entry.Key()]; dup {
				winner := entries[winnerIdx]
				if winner.BodyHash == entry.BodyHash {
					continue // idempotent re-registration
				}
				diags = append(diags, diagnostics.NewWithRelated(
					diagnostics.CodeBodyHashCollision,
					siteFromFile(entry.sourceFile, entry.callPos),
					[]string{entry.Key()},
					diagnostics.Related{
						Site:    siteFromFile(winner.sourceFile, winner.callPos),
						Message: "First registered here with bodyHash=" + winner.BodyHash,
					},
				))
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
// binding, and for the anonymous lane the injected `"rt::<hash>"` spliced), even
// two same-file calls that share a body. Dedup is correct for the emitted MODULE
// (one row per key — the graph collapses duplicate keys) and for PFE9004
// collisions, but a deduped list drops the loser's byte offsets, so the anonymous
// lane's un-rewritten duplicate would lose its injected hash and throw at runtime.
// Uses the same per-Program FileCache, so it never re-walks a file
// ExtractFromProgramCached already cached.
func RawEntries(typeChecker *checker.Checker, markerOpts marker.Options, lookup SourceFileLookup, files []string, cache *FileCache) []Entry {
	var all []Entry
	for _, filePath := range files {
		fileEntries, fileDiags, cached := cache.get(filePath)
		if !cached {
			sourceFile := lookup.SourceFile(filePath)
			if sourceFile == nil {
				continue
			}
			fileEntries, fileDiags = extractFromSourceFile(typeChecker, markerOpts, sourceFile)
			cache.put(filePath, fileEntries, fileDiags)
		}
		all = append(all, fileEntries...)
	}
	return all
}

// extractFromFile walks a single source file resolved from lookup and
// returns its pure-fn entries + extractor-side diagnostics (PFE9005 +
// purity violations + dep diagnostics). Called by the dep-validation
// Index's lazy expansion (index.go) when a recorded rt dep points at a
// file the main scan didn't cover.
//
// Does NOT perform cross-file collision detection (PFE9004) — the
// caller folds entries into a shared map and surfaces collisions there.
// A nil/missing source file yields (nil, nil); the caller decides
// whether that is an error.
func extractFromFile(typeChecker *checker.Checker, markerOpts marker.Options, lookup SourceFileLookup, filePath string) ([]Entry, []diagnostics.Diagnostic) {
	sourceFile := lookup.SourceFile(filePath)
	if sourceFile == nil {
		return nil, nil
	}
	return extractFromSourceFile(typeChecker, markerOpts, sourceFile)
}

// extractFromSourceFile is the per-file extraction core: build symbol
// table, walk every CallExpression, dispatch to extractOne. Called by
// the ExtractFromProgramCached loop body (which already holds a
// *SourceFile in hand) and by the lookup-driven extractFromFile above.
func extractFromSourceFile(typeChecker *checker.Checker, markerOpts marker.Options, sourceFile *ast.SourceFile) ([]Entry, []diagnostics.Diagnostic) {
	var entries []Entry
	var diagnostics []diagnostics.Diagnostic
	findCalls(sourceFile, func(call *ast.Node) {
		entry, diags := extractOne(typeChecker, markerOpts, sourceFile, call)
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

// pureFnFactoryCalleeName is the well-known identifier the walker uses
// as a cheap pre-filter before resolving signatures. tsgo's signature
// resolution is one of its heaviest operations; running it for every
// CallExpression in every file (most of which are unrelated to
// purefns) is wasteful when a string compare on the callee identifier
// rules out 99% of calls immediately.
//
// The name is NOT the contract — the marker brands are. After the
// pre-filter the brand check via `isPureFnFactoryCall` still runs and
// verifies the call's signature really matches `(CompTimeArgs<string>,
// PureFunction<F> | null)`. A user's own
// `function registerPureFnFactory()` declared elsewhere is rejected by
// the brand check even if it passes the name filter. Calls under a
// DIFFERENT callee name — a renamed import (`import {… as regPF}`) or a
// framework wrapper whose params carry the same brands (mion's
// `registerPureFnFactory('mionjs::x', …)` convention behind its own
// factory) — reach the brand check through the secondary pre-filter:
// a first argument that is a string literal shaped like a
// "<ns>::<name>" pure-fn id (`firstArgIsPureFnIdLiteral`). Only a call
// that matches NEITHER cheap filter (renamed callee AND a traced-const
// id) is missed by extraction.
//
// Compile-time validation (CTA001 / PFN001 on bad args) is a separate
// concern handled by `resolver.scanCall`, which walks every call
// regardless of name and emits diagnostics from the brand alone. So
// the pre-filters here only short-circuit the EXTRACTION pass — the
// user-facing type-checking guarantees come from the brands either
// way.
const pureFnFactoryCalleeName = "registerPureFnFactory"

// pureFnCalleeName is the DIRECT-form named registrar (registerPureFn). Same
// cheap pre-filter role as pureFnFactoryCalleeName — the brands are the contract.
const pureFnCalleeName = "registerPureFn"

// firstArgIsPureFnIdLiteral is the secondary extraction pre-filter: the
// call's first argument is a string literal containing "::" — the
// `<namespace>::<functionName>` pure-fn id shape. This lets renamed
// imports and branded wrapper factories reach the (authoritative) brand
// check without paying signature resolution on every unrelated call;
// false positives are rejected there.
func firstArgIsPureFnIdLiteral(callExpr *ast.CallExpression) bool {
	if callExpr.Arguments == nil || len(callExpr.Arguments.Nodes) == 0 {
		return false
	}
	firstArg := callExpr.Arguments.Nodes[0]
	if firstArg.Kind != ast.KindStringLiteral && firstArg.Kind != ast.KindNoSubstitutionTemplateLiteral {
		return false
	}
	return strings.Contains(firstArg.Text(), "::")
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

// isNamedPureFnCall reports whether call is a NAMED-lane registration
// (`registerPureFn` / `registerPureFnFactory`, or a wrapper carrying the same
// brands) that should be extracted, and whether it uses the direct form (wrap).
// Two-layer check:
//
//  1. Cheap: the callee is an identifier whose text equals a well-known named
//     registrar, OR the first argument is a "<ns>::<name>"-shaped string literal
//     (renamed imports and branded wrappers). Avoids signature resolution on
//     unrelated calls.
//  2. Brand verify: the resolved signature has ≥2 parameters, slot 0 carries
//     `CompTimeArgs<string>`, and slot 1 carries a pure-fn form marker
//     (`PureFunction<F>` → direct, or `PureFunctionFactory<F>` → factory).
//     Module-of-origin is implicit in the brand check, so a user's own
//     same-named function is rejected even if it passes the name filter.
func isNamedPureFnCall(typeChecker *checker.Checker, markerOpts marker.Options, call *ast.Node) (matched, wrap bool) {
	callExpr := call.AsCallExpression()
	if callExpr == nil || callExpr.Expression == nil {
		return false, false
	}
	callee := callExpr.Expression
	if callee.Kind != ast.KindIdentifier {
		return false, false
	}
	if callee.Text() != pureFnFactoryCalleeName && callee.Text() != pureFnCalleeName && !firstArgIsPureFnIdLiteral(callExpr) {
		return false, false
	}
	signature := checker.Checker_getResolvedSignature(typeChecker, call, nil, 0)
	if signature == nil {
		return false, false
	}
	parameters := checker.Signature_parameters(signature)
	if len(parameters) < 2 {
		return false, false
	}
	if !paramHasMarker(typeChecker, markerOpts, parameters[0], marker.KindCompTimeArgs) {
		return false, false
	}
	return pureFnFormMarker(typeChecker, markerOpts, parameters[1])
}

// extractOne processes a single CallExpression, dispatching to the named lane
// (`registerPureFn` / `registerPureFnFactory`) or the anonymous lane
// (`registerAnonymousPureFn` / `registerAnonymousPureFnFactory`), both recognised
// by the marker brands on their resolved signature and both carrying the
// factory-vs-direct intent in the pure-fn parameter's marker. Returns (nil, nil)
// when the call is neither, or when an argument can't be resolved to its literal
// form.
//
// Marker-shape validation (non-literal id / factory) is emitted as
// CTA001 / PFN001 by `resolver.scanCall` — this function does NOT
// double-report. Only purefn-specific diagnostics are emitted here
// (PFE9005, PFE9006-9011, PFE9013).
//
// The returned Entry carries internal-only fields (sourceFile, callPos)
// that the caller uses for cross-file collision reporting; these never
// reach the wire.
func extractOne(typeChecker *checker.Checker, markerOpts marker.Options, sourceFile *ast.SourceFile, call *ast.Node) (*Entry, []diagnostics.Diagnostic) {
	callExpr := call.AsCallExpression()
	if callExpr == nil {
		return nil, nil
	}
	if matched, wrap := isNamedPureFnCall(typeChecker, markerOpts, call); matched {
		entry, diags := extractNamed(typeChecker, markerOpts, sourceFile, call, callExpr, wrap)
		attachCallee(entry, "named", typeChecker, markerOpts, call, callExpr)
		return entry, diags
	}
	if matched, wrap, fnParamIndex, hashParamIndex := isAnonymousPureFnCall(typeChecker, markerOpts, call); matched {
		entry, diags := extractAnonymous(typeChecker, markerOpts, sourceFile, call, callExpr, wrap, fnParamIndex, hashParamIndex)
		attachCallee(entry, "anonymous", typeChecker, markerOpts, call, callExpr)
		return entry, diags
	}
	return nil, nil
}

// attachCallee records the report-only callee attribution on a freshly
// extracted entry (lane, plus the callee identifier the site invoked and the
// module that declares it). A nil entry (the call resolved to no entry) is a
// no-op. The callee NAME is read syntactically off the call — `f(...)` or
// `ns.f(...)` — so it names exactly what the source wrote (a primitive
// registrar, a framework wrapper, or a renamed import). The callee MODULE comes
// from the resolved signature's declaration, so a wrapper resolves to the
// package that declares the wrapper (e.g. `@acme/toolkit`), not to
// `@ts-runtypes/core`. Both are cheap add-ons over data extraction already
// touched, so they only run when the report is being built.
func attachCallee(entry *Entry, lane string, typeChecker *checker.Checker, markerOpts marker.Options, call *ast.Node, callExpr *ast.CallExpression) {
	if entry == nil {
		return
	}
	entry.Lane = lane
	entry.CalleeName = calleeIdentifierName(callExpr)
	signature := checker.Checker_getResolvedSignature(typeChecker, call, nil, 0)
	if signature == nil {
		return
	}
	entry.CalleeModule = marker.DeclaringModuleOfNode(checker.Signature_declaration(signature), marker.WithDefaults(markerOpts).FS)
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

// extractNamed handles the developer-named lane:
// `registerPureFn('<ns>::<name>', fn)` (direct) / `registerPureFnFactory('<ns>::<name>',
// factory)` (factory). The id is a comptime-literal string; the pure-fn arg
// (slot 1) is rewritten to the pure fn's entry-module tuple.
func extractNamed(typeChecker *checker.Checker, markerOpts marker.Options, sourceFile *ast.SourceFile, call *ast.Node, callExpr *ast.CallExpression, wrap bool) (*Entry, []diagnostics.Diagnostic) {
	if callExpr.Arguments == nil || len(callExpr.Arguments.Nodes) < 2 {
		return nil, nil
	}
	args := callExpr.Arguments.Nodes
	// Post-rewrite calls carry `null` as the pure-fn argument — the
	// Vite plugin nulls out the inline function once the original
	// extraction has produced a cache entry. Re-scanning the
	// rewritten source must be a quiet no-op: no entry, no
	// replacement, no diagnostic.
	if args[1].Kind == ast.KindNullKeyword {
		return nil, nil
	}

	idLit, idResult := comptimeargs.ResolveLiteralString(typeChecker, args[0])
	fnNode, fnResult := comptimeargs.CheckLiteralFunction(typeChecker, args[1])

	// Marker layer (resolver.scanCall) emits CTA001 / PFN001 for these
	// failures. Silently bail without an entry — duplicate diagnostics
	// would be noise.
	if !idResult.Ok || !fnResult.Ok {
		return nil, nil
	}

	// The combined id is "<namespace>::<functionName>"; split on the FIRST
	// "::" so a namespace can't swallow a function name that itself contains
	// "::" (the internal cache key stays the verbatim id either way).
	pureFnId := idLit.Text()
	sep := strings.Index(pureFnId, "::")
	namespace := pureFnId
	functionName := ""
	if sep >= 0 {
		namespace = pureFnId[:sep]
		functionName = pureFnId[sep+2:]
	}

	code, ok := pureFnCode(sourceFile, fnNode, wrap)
	if !ok {
		return nil, nil
	}
	return buildPureFnEntry(typeChecker, markerOpts, sourceFile, call, fnNode, args[1], namespace, functionName, code, wrap)
}

// extractAnonymous handles the content-addressed lane:
// `registerAnonymousPureFn(fn, hash?)` (direct) / `registerAnonymousPureFnFactory(factory,
// hash?)` (factory). The pure-fn arg (slot 0) is rewritten to the entry-module
// tuple, and the empty trailing `hash?` slot is spliced with `"rt::<bodyHash>"` —
// the same content hash the entry is keyed under, so a library wrapper injects an
// identity that matches a direct call byte-for-byte.
func extractAnonymous(typeChecker *checker.Checker, markerOpts marker.Options, sourceFile *ast.SourceFile, call *ast.Node, callExpr *ast.CallExpression, wrap bool, fnParamIndex, hashParamIndex int) (*Entry, []diagnostics.Diagnostic) {
	if callExpr.Arguments == nil || len(callExpr.Arguments.Nodes) <= fnParamIndex {
		return nil, nil
	}
	args := callExpr.Arguments.Nodes

	fnNode, fnResult := comptimeargs.CheckLiteralFunction(typeChecker, args[fnParamIndex])
	// Non-inline arg (a forwarded wrapper param, or a re-scanned rewritten
	// `__rt_pf…` binding): PFN001 is the resolver's job — bail quietly, so the
	// rewrite is idempotent and wrapper bodies forwarding `fn` don't extract.
	if !fnResult.Ok {
		return nil, nil
	}

	code, ok := pureFnCode(sourceFile, fnNode, wrap)
	if !ok {
		return nil, nil
	}
	// Identity is the code-only content hash, so equal bodies collapse to one
	// `rt::<hash>` entry (content-addressed dedup) and different bodies never
	// collide — regardless of signature. The direct and factory forms hash
	// different code (`return <fn>;` vs the factory body), so they never alias.
	hash := CodeHash(code)
	entry, diags := buildPureFnEntry(typeChecker, markerOpts, sourceFile, call, fnNode, args[fnParamIndex], AnonymousNamespace, hash, code, wrap)
	if entry == nil {
		return nil, diags
	}
	// Inject the hash only when its slot is genuinely empty. A caller that
	// already wrote it (an explicitly forwarded handle, or re-scanned rewritten
	// source) is a pass-through — a second splice would duplicate it. Optional
	// non-marker gaps between the last written argument and the hash slot are
	// padded with `undefined` so the id lands at its declared parameter index.
	if len(args) <= hashParamIndex {
		entry.HashInjectPos = call.End() - 1
		entry.HashInjectText = anonymousHashArgText(entry.Key(), callExpr.Arguments.HasTrailingComma(), hashParamIndex-len(args))
	}
	return entry, diags
}

// anonymousHashArgText renders the spliced trailing argument(s) for the
// anonymous lane — the quoted `"rt::<hash>"` id, preceded by one `undefined`
// per skipped optional slot (`undefinedPadding`) and by `, ` unless the call
// already ends with a trailing comma (in which case the position sits right
// after a separator and a leading comma would produce an empty `f(a,, …)`
// argument).
func anonymousHashArgText(key string, trailingComma bool, undefinedPadding int) string {
	text := strings.Repeat("undefined, ", undefinedPadding) + jsquote.Single(key)
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
// ok is false when a factory-form arg has no body.
func pureFnCode(sourceFile *ast.SourceFile, fnNode *ast.Node, wrap bool) (string, bool) {
	if wrap {
		return stripTypesFromExpr(sourceFile, fnNode), true
	}
	body := fnNode.Body()
	if body == nil {
		return "", false
	}
	if body.Kind == ast.KindBlock {
		return stripTypesFromBlock(sourceFile, body), true
	}
	return stripTypesFromExpr(sourceFile, body), true
}

// buildPureFnEntry is the shared post-recognition extraction every lane runs
// against a resolved pure-fn node: purity validation (PFE9006-9011) and assembly
// of the base Entry keyed `<namespace>::<functionName>`. `code` is the
// already-stripped code (the caller strips it — the anonymous lane needs it before
// this call to derive the key). `fnArg` is the argument node whose byte span the
// plugin rewrites to the entry-module tuple.
//
// The FACTORY form (wrap=false) additionally extracts the factory's parameter
// names (+ the PFE9005 destructuring guard, since the emitter reconstructs
// `function(<params>){…}` by name) and its static pure-fn dependencies (the
// `utl.getPureFn('ns::id')` calls its body reaches). The DIRECT form (wrap=true)
// has neither: the synthesised factory takes no `utl` and the pure fn is emitted
// verbatim inside `return <fn>;`, so its own params ride along untouched.
func buildPureFnEntry(typeChecker *checker.Checker, markerOpts marker.Options, sourceFile *ast.SourceFile, call *ast.Node, fnNode *ast.Node, fnArg *ast.Node, namespace, functionName, code string, wrap bool) (*Entry, []diagnostics.Diagnostic) {
	var diags []diagnostics.Diagnostic
	var paramNames []string
	var pureFnDependencies []string
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
					namespace+"::"+functionName,
				))
				return nil, diags
			}
			paramNames = append(paramNames, nameNode.Text())
		}
		// Static dep extraction — walk the factory body for calls like
		// `<utlName>.getPureFn('ns::fn')` and collect the literal keys as the
		// entry's pureFnDependencies (the first param identifies `utl`).
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
		pureFnDependencies, depDiags = extractDeps(typeChecker, markerOpts, sourceFile, fnNode, utlName)
		diags = append(diags, depDiags...)
	}

	// Purity validation — port of the reference eslint rules'
	// `pure-functions.ts` rule. Emits PFE9006-PFE9011 diagnostics for
	// this/await/yield, dynamic import, forbidden identifiers, and
	// closure-variable references. Build never fails; the entry still
	// emits even when violations exist (same posture as PFE9005). Runs on the
	// pure fn itself for BOTH forms — a captured variable is unsafe either way.
	diags = append(diags, checkPurity(sourceFile, fnNode)...)

	form := "factory"
	if wrap {
		form = "direct"
	}
	entry := &Entry{
		Namespace:          namespace,
		FunctionName:       functionName,
		ParamNames:         paramNames,
		Code:               code,
		BodyHash:           BodyHash(namespace, functionName, code),
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
