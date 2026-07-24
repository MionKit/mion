package resolver

import (
	"fmt"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/cachegen/operations"
	"github.com/mionkit/ts-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/ts-runtypes/internal/cachegen/runtype/typeid"
	"github.com/mionkit/ts-runtypes/internal/compiler/builders"
	"github.com/mionkit/ts-runtypes/internal/compiler/comptimeargs"
	"github.com/mionkit/ts-runtypes/internal/compiler/marker"
	"github.com/mionkit/ts-runtypes/internal/constants"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/protocol"
	"github.com/mionkit/ts-runtypes/internal/textpos"
)

func (sess *Session) sourceFile(file string) (*ast.SourceFile, error) {
	absolutePath := tspath.ResolvePath(sess.Program.TS.GetCurrentDirectory(), file)
	sourceFile := sess.Program.SourceFile(absolutePath)
	if sourceFile == nil {
		return nil, fmt.Errorf("source file not in program: %s", absolutePath)
	}
	return sourceFile, nil
}

// scanAllProgramFiles invokes dispatchScanFiles on every source file in
// the Program that has not been scanned yet. Idempotent — scans are
// cheap on already-seen files because callExpression traversal is
// fast and the cache dedupes by structural id, so a re-scanned site
// resolves to an existing entry without growing the cache.
//
// Called from the OpDump path so a `dump()` triggered by the Vite
// plugin's cache module transform always sees the complete set of
// runtypes, even when the cache module is requested before any user
// source file has been transformed (and therefore scanned).
//
// Errors from individual file scans are skipped — a file the Program
// doesn't carry can't be scanned but shouldn't block other files'
// scans. This matches the loose-coupling between per-file marker
// emission and the dump's transitive walk.
func (sess *Session) scanAllProgramFiles() {
	if sess.Program == nil || sess.Program.TS == nil {
		return
	}
	if sess.scannedFiles == nil {
		sess.scannedFiles = map[string]struct{}{}
	}
	sourceFiles := sess.Program.TS.SourceFiles()
	files := make([]string, 0, len(sourceFiles))
	for _, sf := range sourceFiles {
		if sf == nil {
			continue
		}
		// Declaration files cannot contain call expressions, so scanning
		// them can never produce a site — but the lib .d.ts ASTs are by
		// far the largest in the Program, and the first dump used to walk
		// every one of them through forEachCallExpression for nothing.
		if sf.IsDeclarationFile {
			continue
		}
		fileName := sf.FileName()
		if _, seen := sess.scannedFiles[fileName]; seen {
			continue
		}
		files = append(files, fileName)
	}
	if len(files) == 0 {
		return
	}
	// Errors are non-fatal — keep scanning other files. The dump still
	// returns whatever was reachable from successful scans. The scan's
	// marker diagnostics (MKR/CTA/TMP/PFN…) are PERSISTED on the session:
	// this eager whole-program pass is the only scan most files ever get
	// (per-file scans dedupe against scannedFiles), so dropping them here
	// would hide every marker diagnostic from the OpGenerate/OpDump
	// responses buildStart consumes.
	_, scanDiagnostics, _ := sess.dispatchScanFiles(files)
	sess.programScanDiagnostics = append(sess.programScanDiagnostics, scanDiagnostics...)
}

// dispatchScanFiles walks every CallExpression in each requested file and
// returns one Site per call whose resolved signature has a trailing
// `InjectRunTypeId<T>` parameter (where T is concretely bound). Sites for every
// file are returned flat, each tagged with .File so callers can filter.
//
// After each per-file scan, recordFileIDs walks the sites' RunType graphs
// and notes the reached wire ids against that file in the cache's per-file
// scope map. The map drives the per-request projection that
// scopedDump uses for IncludeRunTypes / IncludeCacheSources.
//
// # BOUNDED-SCOPE INVARIANT
//
// The scanner walks CallExpression AST nodes ONLY and assigns typeids
// ONLY for marker call arguments (cache.AssignID is invoked exclusively
// from commitPending, for calls whose analyzeCall pass matched the
// trailing slot as InjectRunTypeId). Type projection
// (cache.AssignID → cache.Serialize) is rooted at marker-referenced
// types and follows children transitively from there — it never
// reaches into the file's top-level declarations, exported type
// aliases, or any type unrelated to a marker call site.
//
// Concretely: a source file that declares `type Junk = {x: bigint}`
// but never passes Junk to a marker function leaves NO trace in the
// cache. Pinned by:
//   - internal/compiler/resolver/perfile_test.go:TestScope_UnreferencedTypesAreNotProjected
//   - internal/compiler/resolver/perfile_test.go:TestDump_OnlyMarkerReachableTypes
//   - packages/ts-runtypes-devtools/test/scope-bounded.test.ts
//
// The bench's compile-time measurements
// (scripts/export-{serialization,validation}-suite.mjs) depend on this
// invariant — they assume scanFiles' work scales with marker-reachable
// type complexity, NOT with the file's total declaration count.
func (sess *Session) dispatchScanFiles(files []string) ([]protocol.Site, []diagnostics.Diagnostic, error) {
	// Build the override map BEFORE any id is assigned: every structural id must
	// fold the `overrideX<T>(pureFn)` suffix, and the map is whole-program (an
	// override anywhere shifts ids everywhere). One-time per Program.
	sess.ensureOverrides()
	var sites []protocol.Site
	var diags []diagnostics.Diagnostic
	var err error
	if sess.parallelScanEnabled() && len(files) > 1 {
		sites, diags, err = sess.dispatchScanFilesParallel(files)
	} else {
		sites, diags, err = sess.dispatchScanFilesSerial(files)
	}
	if err != nil {
		return nil, nil, err
	}
	// Syntactic lint pass (NE001): `@nonEnumerable` on a required property. Runs
	// once per file here, so it covers both the serial and parallel scan paths
	// and never re-fires per call site. Purely syntactic — no checker needed.
	diags = append(diags, sess.nonEnumerableRequiredDiagnostics(files)...)
	// FIRST-PARTY DIAGNOSTIC SCOPING. Scan diagnostics are consumer feedback —
	// "you wrote this call wrong" — so they must surface only for FIRST-PARTY
	// files, never for a dependency's own source. A dependency normally resolves
	// to its `.d.ts` (no call expressions, already scan-inert), but when it
	// resolves to its `.ts` SOURCE — its package.json `source` export condition,
	// or a consumer's `customConditions:["source"]` (e.g. @ts-runtypes/core ships
	// src/) — the whole-program scan walks it like consumer code and would
	// false-positive on the library's own internal generic definitions
	// (registerPureFnFactory's `CompTimeArgs<PureFnId>` used non-literally, …).
	// The general form of the old marker-only exemption: drop every diagnostic
	// anchored in an external-library file. Sites/collection are untouched; only
	// diagnostics are scoped. See docs/done/scan-diagnostics-marker-own-source.md.
	diags = sess.dropExternalLibraryDiagnostics(diags)
	return sites, diags, err
}

// dropExternalLibraryDiagnostics removes every diagnostic anchored in a source
// file TypeScript resolved by SEARCHING node_modules — a dependency whose
// internal source is never a consumer call site. It reads TypeScript's own
// resolution provenance (Program.IsSourceFileFromExternalLibrary), NOT a
// path-contains-node_modules heuristic, so it stays correct through workspace
// symlinks (first-party code physically under node_modules) AND leaves the
// marker package's OWN self-import first-party: that resolves through the
// package's `source` export (not a node_modules search), so the RT suite still
// lints the marker package's own source and real bugs in it are never hidden.
// Sites/collection are unaffected — only the diagnostic list is filtered.
// Per-file verdicts are memoised because many diagnostics share a file.
func (sess *Session) dropExternalLibraryDiagnostics(diags []diagnostics.Diagnostic) []diagnostics.Diagnostic {
	if len(diags) == 0 || sess.Program == nil || sess.Program.TS == nil {
		return diags
	}
	externalByFile := make(map[string]bool)
	isExternal := func(filePath string) bool {
		if filePath == "" {
			return false
		}
		if verdict, seen := externalByFile[filePath]; seen {
			return verdict
		}
		verdict := false
		if sourceFile, err := sess.sourceFile(filePath); err == nil && sourceFile != nil {
			verdict = sess.Program.TS.IsSourceFileFromExternalLibrary(sourceFile)
		}
		externalByFile[filePath] = verdict
		return verdict
	}
	filtered := diags[:0]
	for _, diagnostic := range diags {
		if isExternal(diagnostic.Site.FilePath) {
			continue
		}
		filtered = append(filtered, diagnostic)
	}
	return filtered
}

// nonEnumerableRequiredDiagnostics runs the NE001 syntactic walk over each
// requested file. A file that can't be resolved to a source is skipped (the
// scan above already surfaced any hard error).
func (sess *Session) nonEnumerableRequiredDiagnostics(files []string) []diagnostics.Diagnostic {
	var out []diagnostics.Diagnostic
	for _, file := range files {
		sourceFile, err := sess.sourceFile(file)
		if err != nil {
			continue
		}
		out = append(out, detectNonEnumerableRequired(file, sourceFile)...)
	}
	return out
}

// parallelScanEnabled reports whether this resolver may take the parallel
// scan path at all. Parallel is the default; SingleThreaded implies serial
// (the pool holds a single checker, so there is nothing to fan out over).
func (sess *Session) parallelScanEnabled() bool {
	return !sess.opts.DisableParallelScan && !sess.opts.SingleThreaded &&
		sess.Program != nil && sess.Program.TS != nil
}

// dispatchScanFilesSerial is the single-checker scan loop: every file is
// analyzed and committed inline under the session checker. Also the
// fallback the parallel path returns to on planning failures and
// single-group requests, so its semantics (including the partial-scan +
// error behavior on an unresolvable file) stay the contract for both.
func (sess *Session) dispatchScanFilesSerial(files []string) ([]protocol.Site, []diagnostics.Diagnostic, error) {
	var sites []protocol.Site
	var diagnostics []diagnostics.Diagnostic
	state := sess.scanStateFor(sess.checker)
	for _, file := range files {
		sourceFile, err := sess.sourceFile(file)
		if err != nil {
			return nil, nil, err
		}
		fileStart := len(sites)
		forEachCallExpression(sourceFile, func(call *ast.Node) bool {
			pendings, diags := state.analyzeCall(file, call)
			if len(diags) > 0 {
				diagnostics = append(diagnostics, diags...)
			}
			for _, pending := range pendings {
				site, depthDiags := sess.commitPending(pending)
				if len(depthDiags) > 0 {
					diagnostics = append(diagnostics, depthDiags...)
				}
				sites = append(sites, site)
				sess.sites = append(sess.sites, site)
			}
			return true
		})
		sess.markFileScanned(file, sites[fileStart:])
	}
	return sites, diagnostics, nil
}

// markFileScanned runs the per-file post-scan bookkeeping: records the
// reached wire ids in the cache's per-file scope map and marks the file
// (in both relative and absolute form) as scanned. Shared by the serial
// loop above and the parallel commit phase.
func (sess *Session) markFileScanned(file string, fileSites []protocol.Site) {
	sess.recordFileIDs(file, fileSites)
	if sess.scannedFiles == nil {
		return
	}
	sess.scannedFiles[file] = struct{}{}
	// File names from the Program's source list use absolute paths.
	// scanFiles callers (the Vite plugin) pass relative paths. Mark
	// both forms so scanAllProgramFiles's dedup check matches a
	// previously scanned per-request file regardless of which form
	// arrived first.
	if sess.Program != nil && sess.Program.TS != nil {
		absolutePath := tspath.ResolvePath(sess.Program.TS.GetCurrentDirectory(), file)
		sess.scannedFiles[absolutePath] = struct{}{}
	}
}

// scanState carries the checker-bound context for one scan pass: the
// checker that resolves this pass's files and that checker's
// marker-verdict memo. The serial path builds one for the session
// checker; the parallel path builds one per checker group.
type scanState struct {
	sess        *Session
	scanChecker *checker.Checker
	verdicts    map[*checker.Type]markerVerdict
}

// scanStateFor builds the scanState for scanChecker, resolving the
// per-checker verdict memo once for the whole pass.
func (sess *Session) scanStateFor(scanChecker *checker.Checker) scanState {
	return scanState{
		sess:        sess,
		scanChecker: scanChecker,
		verdicts:    sess.verdictsFor(scanChecker),
	}
}

// detectMarker is marker.DetectAny memoized by parameter type pointer in
// the state's per-checker memo — see Session.verdictsByChecker.
func (state scanState) detectMarker(paramType *checker.Type) (marker.Kind, *checker.Type, bool) {
	if verdict, seen := state.verdicts[paramType]; seen {
		return verdict.kind, verdict.typeArg, verdict.matched
	}
	kind, typeArg, matched := marker.DetectAny(state.scanChecker, paramType, state.sess.marker)
	if state.verdicts != nil {
		state.verdicts[paramType] = markerVerdict{kind: kind, typeArg: typeArg, matched: matched}
	}
	return kind, typeArg, matched
}

// pendingCall is the checker-bound analysis result for one injection
// call site — a complete Site minus the wire ID, plus the resolved type
// argument and the checker that materialized it. analyzeCall produces
// these; commitPending projects the type (the only cache mutation on
// the scan path) and mints the Site. The split exists so the analysis
// can run on pool checkers concurrently while projection stays serial.
type pendingCall struct {
	file string
	pos  int
	// site is the pre-built call-span diagnostics.Site, used only to anchor the
	// depth-cap diagnostic (MKR008) when commitPending's projection reports the
	// structural-id walk hit typeid.maxWalkDepth.
	site       diagnostics.Site
	paramIndex int
	argsCount  int
	fnId       string
	// fnIds is the full ordered fnId list for a MULTI-function marker site
	// (InjectTypeFnArgs<T, F1, F2, …>); nil for single-fn / reflection sites,
	// where fnId carries the lone value. The rewrite injects an array of entry
	// tuples at paramIndex when this is set.
	fnIds  []string
	demand []protocol.SiteDemand
	// trailingComma is true when the call's own argument list already ends
	// with a comma (e.g. a formatter-wrapped `createValidateFn(\n  schema,\n)`).
	// The TS-side injector reads it to splice the binding WITHOUT a leading
	// comma — otherwise the pre-existing comma plus the injected `, …` yield
	// an empty argument `f(a, , …)`, which is invalid JS.
	trailingComma bool
	typeArgument  *checker.Type
	// owner is the checker that materialized typeArgument. Projection
	// must run under it — types from different checkers never mix
	// (upstream contract on Program.GetTypeCheckerForFile).
	owner *checker.Checker
}

// commitPending projects the pending call's type argument into the cache
// and returns the finished Site. Serial-only: the cache is not safe for
// concurrent use. Projection runs under the checker that materialized the
// type (a fast no-swap path when that is the session checker, i.e. always
// on the serial scan path).
func (sess *Session) commitPending(pending pendingCall) (protocol.Site, []diagnostics.Diagnostic) {
	sess.cache.ResetDepthExceeded()
	id := sess.cache.AssignIDUnder(pending.owner, pending.typeArgument)
	var diags []diagnostics.Diagnostic
	if sess.cache.DepthExceeded() {
		// The structural-id walk for this site's type hit typeid.maxWalkDepth — a
		// self-instantiating or genuinely unbounded type. Raise MKR008 anchored at
		// the call span; the id is the benign placeholder assignID returned.
		diags = append(diags, diagnostics.New(diagnostics.CodeStructuralIdDepthExceeded, pending.site))
	}
	return protocol.Site{
		File:          pending.file,
		Pos:           pending.pos,
		ID:            id,
		ParamIndex:    pending.paramIndex,
		ArgsCount:     pending.argsCount,
		FnId:          pending.fnId,
		FnIds:         pending.fnIds,
		Demand:        pending.demand,
		TrailingComma: pending.trailingComma,
	}, diags
}

// analyzeCall inspects one call expression — the checker-bound analysis
// half of the scan. The flow is:
//
//  1. Walk every parameter of the resolved signature and detect any
//     marker brand via `marker.DetectAny`. CompTimeArgs / PureFunction
//     validation happens here regardless of whether the call also
//     carries an injection marker — the marker IS the contract, not
//     the function name or position.
//  2. If the trailing parameter carries `InjectRunTypeId<T>`, run the
//     injection-specific logic (free-type-parameter gate, reflect-form
//     checks, options extraction) and emit a pendingCall for the commit
//     phase (which assigns the id and mints the Site).
//  3. Otherwise return any accumulated diagnostics with no pendingCall.
//
// Diagnostics always flow — they're independent of Site emission. Every
// checker read in here goes through state.scanChecker, so the analysis
// can run on any pool checker; only commitPending touches the cache.
// injectMarker is one InjectRunTypeId / InjectTypeFnArgs parameter found on a
// call's resolved signature: its parameter index, the marker kind, the resolved
// type argument T, and (InjectTypeFnArgs only) the named function-family keys.
type injectMarker struct {
	paramIndex int
	kind       marker.Kind
	typeArg    *checker.Type
	fnKeys     []string
}

func (state scanState) analyzeCall(file string, call *ast.Node) ([]pendingCall, []diagnostics.Diagnostic) {
	signature := checker.Checker_getResolvedSignature(state.scanChecker, call, nil, 0)
	if signature == nil {
		return nil, nil
	}
	parameters := checker.Signature_parameters(signature)
	if len(parameters) == 0 {
		return nil, nil
	}
	lastIndex := len(parameters) - 1
	callExpression := call.AsCallExpression()
	argsCount := 0
	trailingComma := false
	if callExpression != nil && callExpression.Arguments != nil {
		argsCount = len(callExpression.Arguments.Nodes)
		// Robust signal for the TS-side injector: the AST records whether the
		// argument list was written with a trailing comma (survives comments /
		// whitespace), so the injector never has to scan source bytes backward.
		trailingComma = callExpression.Arguments.HasTrailingComma()
	}
	// Walk every parameter, collecting the injection markers and validating any
	// CompTimeArgs / PureFunction argument. That validation is independent of
	// injection — registerPureFnFactory and any other non-injection branded
	// function must be checked too.
	var diags []diagnostics.Diagnostic
	var markers []injectMarker
	// NOTE: consumer-oriented scan diagnostics (CTA0xx / PFN0xx / … emitted below)
	// that land in a dependency's own source are filtered out downstream in
	// dispatchScanFiles (dropExternalLibraryDiagnostics) — the general form of the
	// old marker-package-only exemption. analyzeCall stays diagnosis-complete;
	// scoping to first-party files is a single chokepoint on the aggregated list.
	for paramIndex := 0; paramIndex <= lastIndex; paramIndex++ {
		paramSymbol := parameters[paramIndex]
		if paramSymbol == nil {
			continue
		}
		paramType := checker.Checker_getTypeOfSymbol(state.scanChecker, paramSymbol)
		kind, typeArg, matched := state.detectMarker(paramType)
		if !matched && comptimeargs.IsCompTimeArgsParamNode(state.scanChecker, paramSymbol, state.sess.marker) {
			// CompTimeArgs is the zero-cost identity marker (markers.ts): its
			// resolved type carries no alias/brand for DetectAny, so it's
			// recognised off the parameter's `CompTimeArgs<…>` annotation node.
			kind, matched = marker.KindCompTimeArgs, true
		}
		if !matched {
			continue
		}
		switch kind {
		case marker.KindInjectRunTypeId:
			// EVERY injection-marker parameter is its own slot (multi-slot
			// injection): a wrapper may declare several, and each injects at its
			// own index. The single-trailing case stays byte-identical (see
			// below); the free-type-parameter / pass-through gates run per slot.
			markers = append(markers, injectMarker{paramIndex: paramIndex, kind: kind, typeArg: typeArg})
		case marker.KindInjectTypeFnArgs:
			// Same, plus the Fn type-args naming the function families so the
			// backend emits only the demanded caches. The fnId(s) are computed
			// per slot below (folding in the call-site options/strategy for the
			// single-trailing path).
			var fnKeys []string
			if keys, fnOK := marker.FnKeysForInjectTypeFnArgs(state.scanChecker, paramType, state.sess.marker); fnOK {
				fnKeys = keys
			}
			markers = append(markers, injectMarker{paramIndex: paramIndex, kind: kind, typeArg: typeArg, fnKeys: fnKeys})
		case marker.KindCompTimeArgs, marker.KindCompTimeFnArgs:
			// Both validate the argument is fully literal (CTA0xx). CompTimeFnArgs
			// additionally marks the fn-selecting slot; the scanner reads its value
			// positionally in computeFnId for now (structured demand follows).
			if paramIndex >= argsCount {
				continue
			}
			argumentNode := callExpression.Arguments.Nodes[paramIndex]
			if argumentNode == nil {
				continue
			}
			if diagnostic, ok := state.checkCompTimeArgs(file, argumentNode); ok {
				diags = append(diags, diagnostic)
			}
		case marker.KindPureFunction, marker.KindPureFunctionFactory:
			// Both pure-fn form markers enforce the same inline + purity rules
			// (PFN001 / PFE9006-9011) — the direct/factory distinction is a
			// build-time wrap concern, not a validation one.
			if paramIndex >= argsCount {
				continue
			}
			argumentNode := callExpression.Arguments.Nodes[paramIndex]
			if argumentNode == nil {
				continue
			}
			diags = append(diags, state.checkPureFunction(file, argumentNode)...)
		}
	}
	if len(markers) == 0 {
		return nil, diags
	}
	// NESTED-BUILDER SKIP (per call): a value-first builder call nested inside
	// another marker call (e.g. `string({...})` inside `object({...})`) is
	// reflected by the enclosing marker — the enclosing RunType already
	// references this type as a child, so the nested call's own id would be
	// redundant. Skip it; at runtime the nested builder returns a type-only
	// carrier the enclosing marker discards. Only injection markers count as
	// "enclosing" — wrappers without one (`optional(...)`, plain helpers,
	// vitest's `expect`) are transparent, so the walk continues past them.
	if state.enclosedByInjectionMarker(call) {
		return nil, diags
	}
	// EXPLICIT PASS-THROUGH (per slot): a marker parameter the caller already
	// filled is a forwarded handle / explicit id, not an injection request —
	// leave that slot untouched. A wrapper FORWARDING its own injected handle
	// inward (`getRunType<T>(undefined, id)`) reaches here with the slot filled.
	// argsCount is contiguous, so the injecting slots are exactly the trailing
	// block paramIndex >= argsCount. This filter MUST precede the
	// free-type-parameter (MKR003) check inside the per-slot paths: inside a
	// generic wrapper body `T` IS the wrapper's free type parameter, but a
	// forwarded handle is a legitimate resolved value, so MKR003 would be a false
	// positive that halts the build on the documented wrapper pattern.
	var injecting []injectMarker
	for _, m := range markers {
		if argsCount > m.paramIndex {
			continue
		}
		injecting = append(injecting, m)
	}
	if len(injecting) == 0 {
		return nil, diags
	}
	// SINGLE TRAILING MARKER — the full path (reflect-form, comptime options,
	// annotation honoring, the Temporal-not-loaded guard). Byte-identical to the
	// pre-multislot behaviour for every existing call.
	if len(injecting) == 1 && injecting[0].paramIndex == lastIndex {
		pending, extra, ok := state.analyzeTrailingInjection(file, call, callExpression, injecting[0], lastIndex, argsCount, trailingComma)
		diags = append(diags, extra...)
		if !ok {
			return nil, diags
		}
		return []pendingCall{pending}, diags
	}
	// MULTI-SLOT INJECTION — several marker parameters (or a single non-trailing
	// one) each inject at their own index; a wrapper forwards each. No
	// reflect-form / comptime options: wrapper calls pass T through explicit type
	// arguments and forward no options bag.
	pendings, extra := state.analyzeMultiSlotInjection(file, call, injecting, argsCount, trailingComma)
	diags = append(diags, extra...)
	return pendings, diags
}

// analyzeTrailingInjection is the single-marker injection path: one marker in
// the trailing parameter slot, with the full reflect-form / comptime-options /
// annotation-honoring handling that value-first `createX(value)` and
// options-carrying calls depend on. Byte-identical to the pre-multislot scanner.
func (state scanState) analyzeTrailingInjection(file string, call *ast.Node, callExpression *ast.CallExpression, slot injectMarker, lastIndex, argsCount int, trailingComma bool) (pendingCall, []diagnostics.Diagnostic, bool) {
	var diags []diagnostics.Diagnostic
	sourceFile := ast.GetSourceFileOfNode(call)
	injectionTypeArgument := slot.typeArg
	injectionFnKeys := slot.fnKeys
	// Guard against a `Temporal.*` type that silently resolved to `any`
	// because the consumer's tsconfig lib doesn't load the Temporal
	// namespace — otherwise the emitted validator accepts anything. Emitted
	// for the injection call regardless of what the type argument resolved
	// to (it inspects the written syntax, not the resolved type).
	diags = append(diags, detectTemporalNotLoaded(state.scanChecker, file, call)...)
	// Sibling guard: T resolved to `any` because an import in this file
	// failed to resolve in the scan program (MKR007, Error) — the injection
	// still proceeds (noop tuples), so behavior without failOnError is
	// unchanged; the diagnostic is what fails strict builds.
	diags = append(diags, state.detectAnyFromUnresolvedImport(file, call, injectionTypeArgument)...)
	typeArgument := injectionTypeArgument
	if marker.IsFreeTypeParameter(typeArgument) {
		// Call inside a generic wrapper body with the id slot EMPTY — `T` is the
		// wrapper's own free type parameter, so there is no concrete id to inject
		// until the wrapper is itself instantiated. (A wrapper that forwards its
		// handle returned above; this is the genuinely-unsupported case, e.g.
		// `createValidateFn<T>()` in a generic body.) Emit MKR003 so the user gets a
		// build-time breadcrumb instead of only the runtime "no id injected" throw.
		if sourceFile == nil {
			return pendingCall{}, diags, false
		}
		diags = append(diags, diagnostics.New(
			diagnostics.CodeMarkerFreeTypeParameter,
			textpos.NodeSite(file, sourceFile, call),
		))
		return pendingCall{}, diags, false
	}
	// REFLECT-FORM CHECKS: only fire when T was inferred from a value
	// argument (no explicit type-argument list) AND at least one value
	// arg is present.
	inReflectForm := callExpression != nil &&
		(callExpression.TypeArguments == nil || len(callExpression.TypeArguments.Nodes) == 0) &&
		argsCount > 0 && callExpression.Arguments != nil &&
		len(callExpression.Arguments.Nodes) > 0
	if inReflectForm {
		argZero := callExpression.Arguments.Nodes[0]
		// FUNCTION-CALL-ARGUMENT ANTI-PATTERN: passing a call expression
		// as the reflect-form value (`createValidateFn(getX())`) invokes the
		// function at runtime purely for type inference — side effects,
		// exceptions, async work, all fire for nothing. The validator
		// still works (T comes from the inferred return type), but the
		// recommended replacement is the static form using `ReturnType<
		// typeof fn>`. Emit a build warning to nudge the user toward it.
		//
		// EXCEPT a value-first schema-builder call (`object({…})`, `circular(…)`,
		// `array(…)`, …) IS the intended reflect-form value — it's pure
		// construction, not a side-effectful user function — so it must not warn.
		if argZero != nil && argZero.Kind == ast.KindCallExpression &&
			!builders.IsSchemaLeafCall(state.scanChecker, state.sess.markerModule(), argZero, state.sess.marker.FS) {
			if diagnostic, ok := state.sess.markerDiagFunctionCallArg(file, argZero); ok {
				diags = append(diags, diagnostic)
			}
		}
		// REFLECT-FORM ANNOTATION HONORING: when the argument is a
		// const-bound identifier with a written type annotation, prefer
		// the annotation's type over the binding's CFA-narrowed apparent
		// type. Fixes the enum-annotation / union-narrowing reflect-form
		// traps — TypeScript's control-flow analysis tracks `const v: T
		// = literal` bindings by their initializer's narrowest type, so
		// the apparent type at the call site is `typeof literal`, not the
		// declared union/enum. Reading the annotation directly makes the
		// reflect-form hash equal to the static-form hash for the natural
		// `const v: T = literal; createValidateFn(v);` idiom. Non-identifier
		// reflect-form args (property access, function calls, element
		// access) don't go through const-binding CFA and don't exhibit
		// the trap, so they fall through to the apparent-type path.
		// Skip annotation honoring for the SCHEMA overload: when argZero is a
		// RunType-typed const (`createValidateFn(schemaConst)` where
		// `const schemaConst: RunType<T> = …`), the declared type is `RunType<T>`,
		// but the injection's typeArgument is already the UNWRAPPED `T` (inferred
		// from the schema overload's `RunType<T>` param). Overriding it with
		// `RunType<T>` would validate against RunType's own shape, not `T` — and
		// break recursive schemas bound to an annotated const.
		if annotated, ok := state.declaredTypeFromIdentifier(argZero); ok && !builders.IsRunType(annotated, state.sess.markerModule(), state.sess.marker.FS) {
			typeArgument = annotated
		}
	}
	options := extractValidateOptions(state.scanChecker, call, lastIndex, argsCount)
	// No-op ValidateOptions diagnostics — warn the user when an option is
	// requested but provably has no effect on the resolved type. The
	// emitter still produces the variant factory (always-emit
	// invariant) so the call site keeps working; this warning is the
	// only signal the option is redundant. Anchored at the options
	// literal when present, falling back to the whole call.
	if options.Any() {
		resolvedKind := typeid.KindOf(state.scanChecker, typeArgument)
		if options.Has("noLiterals") && resolvedKind != protocol.KindLiteral {
			if diagnostic, ok := state.sess.noopValidateOptionDiag(file, call, lastIndex, argsCount, diagnostics.CodeValidateOptionsNoLiteralsNoop); ok {
				diags = append(diags, diagnostic)
			}
		}
		if options.Has("noIsArrayCheck") && resolvedKind != protocol.KindArray {
			if diagnostic, ok := state.sess.noopValidateOptionDiag(file, call, lastIndex, argsCount, diagnostics.CodeValidateOptionsNoArrayNoop); ok {
				diags = append(diags, diagnostic)
			}
		}
	}
	// Resolve numberMode per field: the site's own value wins; otherwise the
	// project-wide default (validate.numberMode) fills in. Only this field is
	// taken from the global defaults — a site that set noLiterals / noIsArrayCheck
	// keeps them untouched (per-field merge, site-wins-per-field). isFinite —
	// the default and any unrecognized value — adds no variant name, so plain
	// keys stay stable. Done after the noop-diagnostic block above so a global
	// default never makes options.Any() fire those warnings.
	effectiveNumberMode := options.numberMode
	if effectiveNumberMode == "" {
		effectiveNumberMode = state.sess.opts.ValidateDefaults.NumberMode
	}
	if canonicalName := constants.NumberModeOptionName(effectiveNumberMode); canonicalName != "" {
		options.enable(canonicalName)
	}
	// Structural id resolution happens in commitPending and is purely a
	// function of the resolved TS type. `ValidateOptions` (`noLiterals` /
	// `noIsArrayCheck`) does NOT fold into the id; instead, the option set
	// folds into the injected `fnId` variant suffix below (e.g. `itNL`,
	// `valNA`) and the emitter renders one factory per (typeid, fnId) pair
	// under the canonical variant cache key (e.g. `itNL_<id>`, `valNA_<id>`).
	// Same invariant the encoder strategy / decoder strategy already honour.
	// See createRTFunctions.ts's `createJsonEncoderFn` dispatch + the
	// `ValidateVariantSuffix` helper in internal/constants. RegExp has no
	// literal type in TS (`/abc/i` widens to `RegExp` even under `as const`),
	// so `typeof /abc/i`, `typeof /xyz/`, and `RegExp` all resolve to the
	// same KindRegexp id — id stays ≡ f(T).
	//
	// Compute the precise fnId for InjectTypeFnArgs sites — the function's base
	// tag refined by the call-site compile-time options (ValidateOptions variant
	// suffix for it/te, the strategy token for the JSON families) — plus the
	// structured emit-demand (the forward replacement for reverse-parsing fnId,
	// which an opaque hash can't support). Reflection sites (InjectRunTypeId)
	// leave injectionFnKeys empty → no FnId, no function demand.
	// One fnId + demand per named family (one for a plain createX; two for a
	// multi-function marker like createStandardSchema's <T,'val','verr'>). The
	// comptime options/strategy are SHARED across every family. Reflection sites
	// (InjectRunTypeId, empty injectionFnKeys) yield no fnId and no demand.
	// DUPLICATE-FAMILY GUARD: a marker names each function family at most once,
	// in declaration order (InjectTypeFnArgs<T, 'verr', 'jsonDecoder', 'verr'>
	// repeats 'verr'). A repeat would inject a second identical entry tuple that
	// nothing reads — almost always a copy-paste slip — so reject it (MKR006,
	// Error) and dedupe before computing fnIds so the emitted output stays sane
	// even if a host surfaces the diagnostic as non-fatal.
	if deduped, firstDup, hadDup := dedupeFnKeys(injectionFnKeys); hadDup {
		if sourceFile := ast.GetSourceFileOfNode(call); sourceFile != nil {
			diags = append(diags, diagnostics.New(
				diagnostics.CodeMarkerDuplicateFnKey,
				textpos.NodeSite(file, sourceFile, call),
				firstDup,
			))
		}
		injectionFnKeys = deduped
	}
	var fnIds []string
	var demand []protocol.SiteDemand
	for _, fnKey := range injectionFnKeys {
		fnId, fnDemand := computeSiteFn(state.scanChecker, fnKey, options, call, lastIndex, argsCount)
		fnIds = append(fnIds, fnId)
		demand = append(demand, fnDemand...)
	}
	// FnId stays the scalar single-fn wire (mirrors fnIds[0]); FnIds is set only
	// for multi-function sites so single-fn / reflection sites stay byte-stable.
	fnId := ""
	if len(fnIds) > 0 {
		fnId = fnIds[0]
	}
	var multiFnIds []string
	if len(fnIds) > 1 {
		multiFnIds = fnIds
	}
	return pendingCall{
		file: file,
		site: textpos.NodeSite(file, sourceFile, call),
		// call.End() is exclusive (one past the closing `)`). Pos at End()-1 is
		// the closing-paren offset where the TS-side patcher inserts.
		pos:           call.End() - 1,
		paramIndex:    lastIndex,
		argsCount:     argsCount,
		fnId:          fnId,
		fnIds:         multiFnIds,
		demand:        demand,
		trailingComma: trailingComma,
		typeArgument:  typeArgument,
		owner:         state.scanChecker,
	}, diags, true
}

// analyzeMultiSlotInjection is the multi-slot injection path: a call whose
// signature carries SEVERAL injection-marker parameters (mion's per-side
// `route(handler, opts?, paramsFns?, responseFns?)`), or a single non-trailing
// one. Each injecting slot resolves independently — its own type argument, fn
// keys, and MKR003 free-type-parameter check — and emits its own pendingCall at
// the call's closing paren. The transform groups all slots of one call (same
// Pos) into a single positional insertion, filling non-marker optional gaps with
// `undefined`. Wrapper calls forward no comptime options, so fn ids resolve with
// default options (no reflect-form / options handling here).
func (state scanState) analyzeMultiSlotInjection(file string, call *ast.Node, injecting []injectMarker, argsCount int, trailingComma bool) ([]pendingCall, []diagnostics.Diagnostic) {
	var diags []diagnostics.Diagnostic
	sourceFile := ast.GetSourceFileOfNode(call)
	// The Temporal-not-loaded guard is a per-call check (inspects written
	// syntax, not the resolved type), so it fires once for the whole call.
	diags = append(diags, detectTemporalNotLoaded(state.scanChecker, file, call)...)
	pos := call.End() - 1
	var pendings []pendingCall
	for _, m := range injecting {
		// Silent-any guard per slot (MKR007) — a wrapper slot whose T checked
		// as `any` because this file has an unresolved import.
		diags = append(diags, state.detectAnyFromUnresolvedImport(file, call, m.typeArg)...)
		if marker.IsFreeTypeParameter(m.typeArg) {
			// A marker slot whose `T` is the enclosing wrapper's own free type
			// parameter — no concrete id until the wrapper is instantiated.
			// MKR003 per slot; the other slots on this call may still inject.
			if sourceFile != nil {
				diags = append(diags, diagnostics.New(
					diagnostics.CodeMarkerFreeTypeParameter,
					textpos.NodeSite(file, sourceFile, call),
				))
			}
			continue
		}
		fnKeys := m.fnKeys
		if deduped, firstDup, hadDup := dedupeFnKeys(fnKeys); hadDup {
			if sourceFile != nil {
				diags = append(diags, diagnostics.New(
					diagnostics.CodeMarkerDuplicateFnKey,
					textpos.NodeSite(file, sourceFile, call),
					firstDup,
				))
			}
			fnKeys = deduped
		}
		var fnIds []string
		var demand []protocol.SiteDemand
		for _, fnKey := range fnKeys {
			fnId, fnDemand := computeSiteFn(state.scanChecker, fnKey, validateOptions{}, call, m.paramIndex, argsCount)
			fnIds = append(fnIds, fnId)
			demand = append(demand, fnDemand...)
		}
		fnId := ""
		if len(fnIds) > 0 {
			fnId = fnIds[0]
		}
		var multiFnIds []string
		if len(fnIds) > 1 {
			multiFnIds = fnIds
		}
		pendings = append(pendings, pendingCall{
			file:          file,
			site:          textpos.NodeSite(file, sourceFile, call),
			pos:           pos,
			paramIndex:    m.paramIndex,
			argsCount:     argsCount,
			fnId:          fnId,
			fnIds:         multiFnIds,
			demand:        demand,
			trailingComma: trailingComma,
			typeArgument:  m.typeArg,
			owner:         state.scanChecker,
		})
	}
	return pendings, diags
}

// dedupeFnKeys removes repeated fn keys from a multi-function marker, keeping
// first-occurrence order, and reports the first key that appeared more than
// once. An InjectTypeFnArgs marker names each family at most once; a repeat is
// rejected with MKR006, and the deduped list keeps injection sane if the
// diagnostic is surfaced as non-fatal. hadDup is false (and deduped is the
// input unchanged) for the common single-family / already-unique case.
func dedupeFnKeys(keys []string) (deduped []string, firstDup string, hadDup bool) {
	if len(keys) < 2 {
		return keys, "", false
	}
	seen := make(map[string]bool, len(keys))
	deduped = make([]string, 0, len(keys))
	for _, key := range keys {
		if seen[key] {
			if !hadDup {
				firstDup, hadDup = key, true
			}
			continue
		}
		seen[key] = true
		deduped = append(deduped, key)
	}
	if !hadDup {
		return keys, "", false
	}
	return deduped, firstDup, true
}

// computeSiteFn resolves both injection payloads for a createX call site in
// one registry pass: the opaque fnId the transformer injects as the 2nd tuple
// element, and the structured cache-entry demand the emitter must render.
// Routed through operations.FnHashFor so the scanner and the emitter compute
// the SAME hash: for a JSON family the COMPOSITE fnHash (the per-strategy
// jsonEncoder/jsonDecoder entry the runtime looks up); for it/te the
// ValidateOptions variant fnHash; for a leaf/binary family the plain fnHash.
// operations.Canonical reads only the axis-relevant input (strategy for JSON,
// option names for it/te, neither otherwise), so one call covers every axis.
// Empty fnKey (a reflection-only InjectRunTypeId site) yields ("", nil).
func computeSiteFn(typeChecker *checker.Checker, fnKey string, options validateOptions, call *ast.Node, lastIndex, argsCount int) (string, []protocol.SiteDemand) {
	if fnKey == "" {
		return "", nil
	}
	op, known := operations.ByFnKey(fnKey)
	if !known {
		return "", nil
	}
	var optionNames []string
	var strategy string
	switch op.Axis {
	case operations.AxisJsonStrategy:
		strategy = extractStrategyOption(typeChecker, call, lastIndex, argsCount)
	case operations.AxisValidateOptions:
		optionNames = options.Names()
	case operations.AxisHasUnknownKeysOptions:
		// hasUnknownKeys options are extracted here (not threaded through the
		// shared validateOptions bag) — same in-place pattern as the JSON
		// strategy extraction above.
		optionNames = extractHasUnknownKeysOptions(typeChecker, call, lastIndex, argsCount).Names()
	}
	// The circular-reference guard is a compile-time option for the four
	// CircularGuarded families (validate / validationErrors / toBinary /
	// jsonEncoder). It folds ORTHOGONALLY into the fnHash across every axis, so it
	// is read here per family rather than through one axis's option bag. It is NOT
	// normalised away for acyclic types (circularity is unknown at fnHash time —
	// it is only projected in commitPending): an armed acyclic type gets a
	// harmless duplicate entry, exactly like a no-op `noLiterals` variant.
	rejectCircular := op.CircularGuarded && extractRejectCircularOption(typeChecker, call, lastIndex, argsCount)
	fnId := operations.FnHashFor(op, optionNames, strategy, rejectCircular)
	demands := operations.DemandFor(fnKey, optionNames, strategy, rejectCircular)
	if len(demands) == 0 {
		return fnId, nil
	}
	out := make([]protocol.SiteDemand, len(demands))
	for index, demand := range demands {
		out[index] = protocol.SiteDemand{
			FamilyTag:      demand.FamilyTag,
			VariantSuffix:  demand.VariantSuffix,
			Options:        demand.Options,
			FnHash:         demand.FnHash,
			RejectCircular: demand.RejectCircular,
		}
	}
	return fnId, out
}

// optionsArgumentAt returns the AST node at the compile-time options slot —
// the slot immediately before the trailing id slot — or nil when the call
// doesn't fill it. Layout convention: options always lives at (lastIndex-1);
// for `createValidateFn<T>(val?, options?, id?)` that's slot 1. Marker
// functions without an options param (`getRunTypeId<T>(_value?, id?)`) are
// inherently safe — slot 0 holds a value, which may be an object literal
// but won't carry known option keys.
// Shared by the ValidateOptions / strategy extractors and the noop-option
// diagnostic anchor.
func optionsArgumentAt(call *ast.Node, lastIndex, argsCount int) *ast.Node {
	if lastIndex == 0 {
		return nil
	}
	optionsIndex := lastIndex - 1
	if argsCount <= optionsIndex {
		return nil
	}
	callExpression := call.AsCallExpression()
	if callExpression == nil || callExpression.Arguments == nil {
		return nil
	}
	if len(callExpression.Arguments.Nodes) <= optionsIndex {
		return nil
	}
	return callExpression.Arguments.Nodes[optionsIndex]
}

// eachOptionProperty visits every named PropertyAssignment of the options
// object literal at the options slot as a (name, initializer) pair, descending
// into object-spread fragments (see eachOptionPropertyOf). No-op when the slot
// is unfilled or isn't an object literal — the resolver runs at build time and
// can't evaluate non-literal expressions, so a variable reference / call (or a
// spread whose operand isn't a resolvable object-literal fragment) silently
// yields zero options. This matches the compile-time-baked options model
// (baseRunTypes.ts:82-86 hashes options into the RT cache key).
func eachOptionProperty(typeChecker *checker.Checker, call *ast.Node, lastIndex, argsCount int, visit func(name string, initializer *ast.Node)) {
	// Unwrap `as const` / parens / `satisfies` so extraction accepts
	// exactly what the slot's CompTimeFnArgs validation accepted.
	candidate := comptimeargs.UnwrapWrappers(optionsArgumentAt(call, lastIndex, argsCount))
	if candidate == nil {
		return
	}
	// A whole-const options bag (`createX(undefined, importedPreset)`) resolves
	// cross-module to its `const` object literal — mirroring the spread trace, so
	// a whole-const preset selects the same fn variant as the inlined form. The
	// CompTimeFnArgs validation already accepted it (and enforced `as const`), so
	// the values read here match the type the call resolved against.
	if candidate.Kind == ast.KindIdentifier {
		if container, ok := comptimeargs.ResolveSpreadContainer(typeChecker, candidate); ok && container.Kind == ast.KindObjectLiteralExpression {
			candidate = container
		}
	}
	if candidate.Kind != ast.KindObjectLiteralExpression {
		return
	}
	eachOptionPropertyOf(typeChecker, candidate, 0, visit)
}

// eachOptionPropertyOf visits the named PropertyAssignments of an options
// object literal in SOURCE ORDER, descending into object-spread fragments
// (`{...preset, strategy: 'mutate'}`) at the position the spread appears. The
// source order is load-bearing: the callers are last-write-wins, so a later
// inline key — or a later spread — overrides an earlier spread's value, the
// same merge semantics TypeScript applies to the type-level spread the
// CompTimeFnArgs validation already accepted. This keeps the read in lockstep
// with the relaxed comptimeargs validator: anything Part A accepts as a spread
// is merged here, so an accepted preset can never silently drop its options
// and select the wrong fn-hash variant. A spread whose operand doesn't resolve
// to an object literal is skipped (it never passed validation). Depth-bounded
// against pathological const chains.
func eachOptionPropertyOf(typeChecker *checker.Checker, objectLiteralNode *ast.Node, depth int, visit func(name string, initializer *ast.Node)) {
	if depth > comptimeargs.DepthCap {
		return
	}
	objectLiteral := objectLiteralNode.AsObjectLiteralExpression()
	if objectLiteral == nil || objectLiteral.Properties == nil {
		return
	}
	for _, property := range objectLiteral.Properties.Nodes {
		if property == nil {
			continue
		}
		switch property.Kind {
		case ast.KindPropertyAssignment:
			propertyAssignment := property.AsPropertyAssignment()
			if propertyAssignment == nil {
				continue
			}
			name := propertyAssignment.Name()
			if name == nil || propertyAssignment.Initializer == nil {
				continue
			}
			visit(name.Text(), propertyAssignment.Initializer)
		case ast.KindSpreadAssignment:
			spread := property.AsSpreadAssignment()
			if spread == nil || spread.Expression == nil {
				continue
			}
			container, ok := comptimeargs.ResolveSpreadContainer(typeChecker, spread.Expression)
			if !ok || container.Kind != ast.KindObjectLiteralExpression {
				continue
			}
			eachOptionPropertyOf(typeChecker, container, depth+1, visit)
		}
	}
}

// extractStrategyOption reads the `strategy` string property from the options
// slot — the JSON encoder/decoder compile-time selector. Returns "" when
// absent or not a string literal, so the caller falls back to the function's
// default strategy.
func extractStrategyOption(typeChecker *checker.Checker, call *ast.Node, lastIndex, argsCount int) string {
	strategy := ""
	eachOptionProperty(typeChecker, call, lastIndex, argsCount, func(name string, initializer *ast.Node) {
		if name != "strategy" {
			return
		}
		// Last-write-wins: a later `strategy` (an inline override of a spread
		// preset, or a later spread) replaces an earlier one — matching the
		// merge semantics of `{...preset, strategy: '…'}`.
		if initializer.Kind == ast.KindStringLiteral || initializer.Kind == ast.KindNoSubstitutionTemplateLiteral {
			strategy = initializer.Text()
		}
	})
	return strategy
}

// extractRejectCircularOption reads a literal `rejectCircularRefs: true` from the
// call-site options object. Like extractStrategyOption it reads the options slot
// in place rather than through the shared validateOptions bag, because the
// circular guard is a cross-family option (validate / validationErrors /
// toBinary / jsonEncoder) that no single option axis owns. A non-literal value or
// an absent slot yields false (guard off), matching the compile-time-baked model.
func extractRejectCircularOption(typeChecker *checker.Checker, call *ast.Node, lastIndex, argsCount int) bool {
	armed := false
	eachOptionProperty(typeChecker, call, lastIndex, argsCount, func(name string, initializer *ast.Node) {
		if name != "rejectCircularRefs" || initializer == nil {
			return
		}
		// Last-write-wins over spreads: a later `rejectCircularRefs` (inline or a
		// later spread) replaces an earlier one, matching `{...preset, rejectCircularRefs: …}`.
		switch initializer.Kind {
		case ast.KindTrueKeyword:
			armed = true
		case ast.KindFalseKeyword:
			armed = false
		}
	})
	return armed
}

// enclosedByInjectionMarker reports whether call sits (transitively) inside the
// arguments of ANOTHER call whose resolved signature carries a trailing
// InjectRunTypeId<T> slot. Used to skip injecting an id for a value-first
// builder nested inside an enclosing marker (the enclosing marker reflects the
// whole shape; the nested id would be redundant). Walks the AST parent chain,
// resolving each ancestor CallExpression's signature and checking its trailing
// parameter — non-injection ancestor calls (plain helpers, `optional`, vitest's
// `expect`) are transparent, so the walk continues past them.
func (state scanState) enclosedByInjectionMarker(call *ast.Node) bool {
	for parent := call.Parent; parent != nil; parent = parent.Parent {
		if parent.Kind != ast.KindCallExpression {
			continue
		}
		signature := checker.Checker_getResolvedSignature(state.scanChecker, parent, nil, 0)
		if signature == nil {
			continue
		}
		parameters := checker.Signature_parameters(signature)
		if len(parameters) == 0 {
			continue
		}
		lastParam := parameters[len(parameters)-1]
		if lastParam == nil {
			continue
		}
		// Gate on the WRITTEN annotation, not the resolved type. An enclosing
		// marker is one of OUR functions — it DECLARES its trailing slot as
		// `InjectRunTypeId<…>` / `InjectTypeFnArgs<…>`. Matching the resolved
		// type instead (the old `detectMarker` path) also fired for an unrelated
		// generic passer-through whose trailing parameter merely INFERRED the
		// branded marker type from a marker-typed argument — e.g.
		// `expect(getRunTypeId<T>()).toBe(x)`, where `Assertion<U>.toBe(expected: U)`
		// instantiates `expected` to `InjectRunTypeId<T>`. That false positive made
		// the scanner treat `.toBe` as an enclosing marker and drop the injection
		// on BOTH inner `getRunTypeId` calls. See
		// docs/done/same-typeid-two-marker-calls-one-statement-not-injected.md.
		if comptimeargs.IsInjectionMarkerParamNode(state.scanChecker, lastParam, state.sess.marker) {
			return true
		}
	}
	return false
}

// validateOptions carries the call-site `ValidateOptions` flags set to a
// literal `true`, keyed by their constants.ValidateOptions name. Mirrors
// the JS-side ValidateOptions interface
// (packages/ts-runtypes/src/createRTFunctions.ts). Table-driven off
// constants.ValidateOptions: a new option is extracted automatically once
// declared there — only its per-option semantics (e.g. a noop-diagnostic
// rule in analyzeCall) need teaching.
type validateOptions struct {
	enabled map[string]bool
	// numberMode holds the raw `numberMode` string literal read at the site
	// ("" = unset). It's an enum, not a boolean, so it lives outside `enabled`
	// until the project-default merge resolves it to a canonical variant name.
	numberMode string
}

// enable marks a canonical option name present, allocating the set lazily.
func (opts *validateOptions) enable(name string) {
	if opts.enabled == nil {
		opts.enabled = make(map[string]bool, len(constants.ValidateOptions))
	}
	opts.enabled[name] = true
}

// Any reports whether at least one option was set at the call site.
func (opts validateOptions) Any() bool { return len(opts.enabled) > 0 }

// Has reports whether the named option was set to a literal `true`.
func (opts validateOptions) Has(name string) bool { return opts.enabled[name] }

// Names returns the enabled option NAMES in the canonical declaration
// order from `constants.ValidateOptions` (the variant cache-key suffix
// order, e.g. `itNL`, `valNA`). Empty when no option is set.
func (opts validateOptions) Names() []string {
	if len(opts.enabled) == 0 {
		return nil
	}
	names := make([]string, 0, len(opts.enabled))
	for _, opt := range constants.ValidateOptions {
		if opts.enabled[opt.Name] {
			names = append(names, opt.Name)
		}
	}
	return names
}

// extractValidateOptions reads the literal `<option>: true` properties at
// the options slot for every option declared in constants.ValidateOptions.
func extractValidateOptions(typeChecker *checker.Checker, call *ast.Node, lastIndex, argsCount int) validateOptions {
	var opts validateOptions
	eachOptionProperty(typeChecker, call, lastIndex, argsCount, func(name string, initializer *ast.Node) {
		if initializer == nil {
			return
		}
		// numberMode is a string-enum option, not a boolean. Read its literal
		// value here (last-write-wins over spreads, like extractStrategyOption);
		// the canonical variant name is materialized after the project-default
		// merge in analyzeCall.
		if name == constants.NumberModeOption {
			if initializer.Kind == ast.KindStringLiteral || initializer.Kind == ast.KindNoSubstitutionTemplateLiteral {
				opts.numberMode = initializer.Text()
			}
			return
		}
		known := false
		for _, option := range constants.ValidateOptions {
			if option.Name == name {
				known = true
				break
			}
		}
		if !known {
			return
		}
		switch initializer.Kind {
		case ast.KindTrueKeyword:
			opts.enable(name)
		case ast.KindFalseKeyword:
			// Last-write-wins: an explicit `false` (an inline override of a
			// spread-in `true`, or a later spread) disables the option. A
			// no-op on an absent key, so the non-spread `{opt: false}` case
			// behaves exactly as before.
			delete(opts.enabled, name)
		}
	})
	return opts
}

// hasUnknownKeysOptions mirrors validateOptions for the HasUnknownKeysOptions
// bag (createHasUnknownKeysFn's compile-time options). Table-driven off
// constants.HasUnknownKeysOptions.
type hasUnknownKeysOptions struct {
	enabled map[string]bool
}

// Names returns the enabled option NAMES in the canonical declaration order
// from `constants.HasUnknownKeysOptions`. Empty when no option is set.
func (opts hasUnknownKeysOptions) Names() []string {
	if len(opts.enabled) == 0 {
		return nil
	}
	names := make([]string, 0, len(opts.enabled))
	for _, opt := range constants.HasUnknownKeysOptions {
		if opts.enabled[opt.Name] {
			names = append(names, opt.Name)
		}
	}
	return names
}

// extractHasUnknownKeysOptions reads the literal `<option>: true` properties at
// the options slot for every option declared in constants.HasUnknownKeysOptions.
// Same literal/spread/last-write-wins semantics as extractValidateOptions.
func extractHasUnknownKeysOptions(typeChecker *checker.Checker, call *ast.Node, lastIndex, argsCount int) hasUnknownKeysOptions {
	var opts hasUnknownKeysOptions
	eachOptionProperty(typeChecker, call, lastIndex, argsCount, func(name string, initializer *ast.Node) {
		known := false
		for _, option := range constants.HasUnknownKeysOptions {
			if option.Name == name {
				known = true
				break
			}
		}
		if !known {
			return
		}
		switch initializer.Kind {
		case ast.KindTrueKeyword:
			if opts.enabled == nil {
				opts.enabled = make(map[string]bool, len(constants.HasUnknownKeysOptions))
			}
			opts.enabled[name] = true
		case ast.KindFalseKeyword:
			delete(opts.enabled, name)
		}
	})
	return opts
}

// checkPureFunction validates that argumentNode is an inline arrow / function
// expression with no external handle, then runs the purity rules against the
// resolved function node. Shape failures map to PFN001 (not a literal) or PFN002
// (imported / exported — the literal is reachable as a value); purity violations
// emit PFE9006–PFE9011. Inline-shape failure short-circuits — there is nothing
// to walk for purity when the arg isn't a usable function literal.
func (state scanState) checkPureFunction(file string, argumentNode *ast.Node) []diagnostics.Diagnostic {
	fnNode, shapeResult := comptimeargs.CheckLiteralFunction(state.scanChecker, argumentNode)
	if !shapeResult.Ok {
		failingNode := shapeResult.FailingNode
		if failingNode == nil {
			failingNode = argumentNode
		}
		sourceFile := ast.GetSourceFileOfNode(failingNode)
		if sourceFile == nil {
			return nil
		}
		code := diagnostics.CodePureFunctionNotLiteral
		if shapeResult.Kind == comptimeargs.FailExternalHandle {
			code = diagnostics.CodePureFunctionExternalHandle
		}
		return []diagnostics.Diagnostic{diagnostics.New(
			code,
			textpos.NodeSite(file, sourceFile, failingNode),
		)}
	}
	sourceFile := ast.GetSourceFileOfNode(fnNode)
	if sourceFile == nil {
		return nil
	}
	return purefunctions.CheckPurity(sourceFile, fnNode)
}

// checkCompTimeArgs validates the argument node passes the CompTimeArgs
// literal-only rules and returns a CTA0xx diagnostic when it doesn't.
// Returns (_, false) when validation succeeded.
func (state scanState) checkCompTimeArgs(file string, argumentNode *ast.Node) (diagnostics.Diagnostic, bool) {
	result := comptimeargs.CheckLiteral(state.scanChecker, argumentNode, 0, state.isBuilderCallPredicate())
	if result.Ok {
		return diagnostics.Diagnostic{}, false
	}
	failingNode := result.FailingNode
	if failingNode == nil {
		failingNode = argumentNode
	}
	sourceFile := ast.GetSourceFileOfNode(failingNode)
	if sourceFile == nil {
		return diagnostics.Diagnostic{}, false
	}
	site := textpos.NodeSite(file, sourceFile, failingNode)
	switch result.Kind {
	case comptimeargs.FailDepthExceeded:
		return diagnostics.New(diagnostics.CodeCompTimeArgsDepthExceeded, site), true
	case comptimeargs.FailForbiddenConstruct:
		return diagnostics.New(diagnostics.CodeCompTimeArgsForbiddenConstruct, site, result.Reason), true
	case comptimeargs.FailWidenedConst:
		return diagnostics.New(diagnostics.CodeCompTimeArgsWidenedConst, site, result.Reason), true
	default:
		return diagnostics.New(diagnostics.CodeCompTimeArgsNonLiteral, site), true
	}
}

// noopValidateOptionDiag builds a Warning diagnostic anchored at the
// options-literal node (slot lastIndex-1) when present, falling back
// to the whole call expression. Used by the no-op ValidateOption check
// to report MKR004 / MKR005 — the option survives downstream
// (always-emit invariant), so this is purely advisory.
func (sess *Session) noopValidateOptionDiag(file string, call *ast.Node, lastIndex, argsCount int, code string) (diagnostics.Diagnostic, bool) {
	sourceFile := ast.GetSourceFileOfNode(call)
	if sourceFile == nil {
		return diagnostics.Diagnostic{}, false
	}
	anchor := call
	if optionsNode := optionsArgumentAt(call, lastIndex, argsCount); optionsNode != nil {
		anchor = optionsNode
	}
	return diagnostics.New(code, textpos.NodeSite(file, sourceFile, anchor)), true
}

// isBuilderCallPredicate returns the closure comptimeargs.CheckLiteral uses to
// recognize a static schema-construction call (a value-first builder OR an
// optional()/propMod() carrier) as a valid CompTimeArgs leaf — so a nested
// `string({…})` or `optional(number())` inside `object({…})` passes without
// recursing into it (each self-validates on its own scan visit).
func (state scanState) isBuilderCallPredicate() func(*ast.Node) bool {
	module := state.sess.markerModule()
	return func(node *ast.Node) bool {
		return builders.IsSchemaLeafCall(state.scanChecker, module, node, state.sess.marker.FS)
	}
}

// markerDiagFunctionCallArg builds an MKR001 diagnostic flagging a reflect-form
// marker call that received a function-call argument (`createValidateFn(getX())`).
// The function gets invoked at runtime purely so TypeScript can infer T from
// its return type, which can produce side effects, exceptions, or async work
// for no reason. The recommended replacement is the static form using
// `ReturnType<typeof fn>`. Returns (_, false) when the call's source file
// can't be located (defensive — shouldn't happen during scanFiles).
func (sess *Session) markerDiagFunctionCallArg(file string, callArg *ast.Node) (diagnostics.Diagnostic, bool) {
	sourceFile := ast.GetSourceFileOfNode(callArg)
	if sourceFile == nil {
		return diagnostics.Diagnostic{}, false
	}
	fnName := callExpressionName(callArg)
	return diagnostics.New(
		diagnostics.CodeMarkerFunctionCallArg,
		textpos.NodeSite(file, sourceFile, callArg),
		fnName,
	), true
}

// callExpressionName returns a short label for a CallExpression's callee —
// used in diagnostic messages. Handles Identifier callees (`fn()`), property
// accesses (`obj.fn()`), and falls back to `<anonymous>` for IIFEs and other
// expression-callee shapes.
func callExpressionName(callNode *ast.Node) string {
	if callNode == nil {
		return "<anonymous>"
	}
	callExpression := callNode.AsCallExpression()
	if callExpression == nil || callExpression.Expression == nil {
		return "<anonymous>"
	}
	callee := callExpression.Expression
	switch callee.Kind {
	case ast.KindIdentifier:
		return callee.Text()
	case ast.KindPropertyAccessExpression:
		propertyAccess := callee.AsPropertyAccessExpression()
		if propertyAccess == nil || propertyAccess.Name() == nil {
			return "<anonymous>"
		}
		return propertyAccess.Name().Text()
	}
	return "<anonymous>"
}

// declaredTypeFromIdentifier returns the resolved type of the type annotation
// written on the identifier's const variable declaration. Used by scanCall in
// the reflect form to honor the user's written T over CFA's narrowed apparent
// type. Returns (nil, false) when:
//   - the node is not an Identifier (e.g. PropertyAccess, CallExpression),
//   - the binding's symbol has no const VariableDeclaration with an
//     annotation,
//   - the binding is `let`/`var` (re-assignable, so the annotation no
//     longer pins the type at the call site).
//
// Annotation ≥ apparent type by construction: TS enforces initializer
// assignability against the annotation, so honoring the annotation never
// produces a narrower validator than the apparent-type path.
func (state scanState) declaredTypeFromIdentifier(node *ast.Node) (*checker.Type, bool) {
	if node == nil || node.Kind != ast.KindIdentifier {
		return nil, false
	}
	typeNode, ok := comptimeargs.ConstTypeAnnotation(state.scanChecker, node)
	if !ok {
		return nil, false
	}
	return checker.Checker_getTypeFromTypeNode(state.scanChecker, typeNode), true
}

// forEachCallExpression invokes cb for every CallExpression in sourceFile,
// in depth-first source order. cb is also called for nested calls (an outer
// call's arguments may contain inner calls — both visit). Stops descending
// into a node if cb returns false.
func forEachCallExpression(sourceFile *ast.SourceFile, cb func(*ast.Node) bool) {
	if sourceFile == nil {
		return
	}
	root := sourceFile.AsNode()
	if root == nil {
		return
	}
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		if node.Kind == ast.KindCallExpression {
			if !cb(node) {
				return false
			}
		}
		node.ForEachChild(visit)
		return false
	}
	root.ForEachChild(visit)
}
