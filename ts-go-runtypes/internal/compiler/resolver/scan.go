package resolver

import (
	"fmt"
	"math"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/builders"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/comptimeargs"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/textpos"
)

func (sess *Session) sourceFile(file string) (*ast.SourceFile, error) {
	absolutePath := tspath.ResolvePath(sess.Program.TS.GetCurrentDirectory(), file)
	sourceFile := sess.Program.SourceFile(absolutePath)
	if sourceFile == nil {
		return nil, fmt.Errorf("source file not in program: %s", absolutePath)
	}
	return sourceFile, nil
}

// scanAllProgramFiles scans every not-yet-scanned source file in the Program. Idempotent: the cache dedupes by
// structural id, so a re-scanned site resolves to an existing entry without growing it.
// Called from the OpDump path, so a dump triggered by the Vite plugin's cache-module transform sees the complete
// set of runtypes even when that module is requested before any user file has been transformed, and so scanned.
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
		// A declaration file holds no call expression, so it can never produce a site, and the lib .d.ts
		// ASTs are by far the largest in the Program.
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
	// A file the Program does not carry cannot be scanned and must not block the other files, so the dump
	// returns whatever the successful scans reached. The marker diagnostics (MKR/CTA/TMP/PFN…) are PERSISTED on
	// the session because this eager pass is the only scan most files ever get, per-file scans deduping against
	// scannedFiles, so dropping them would hide every one from the responses buildStart consumes.
	_, scanDiagnostics, _ := sess.dispatchScanFiles(files)
	sess.programScanDiagnostics = append(sess.programScanDiagnostics, scanDiagnostics...)
}

// dispatchScanFiles walks every CallExpression in each requested file and returns one Site per call whose resolved
// signature has a trailing `InjectRunTypeId<T>` parameter with T concretely bound. Sites come back flat across
// files, each tagged with .File. Per file, recordFileIDs then notes the reached wire ids in the cache's per-file
// scope map, which drives the projection scopedDump makes for IncludeRunTypes.
//
// # BOUNDED-SCOPE INVARIANT
//
// The scanner walks CallExpression nodes ONLY and assigns typeids ONLY for marker call arguments (AssignID is
// called from commitPending alone). Projection is rooted at marker-referenced types and follows children from
// there: it never reaches a file's top-level declarations, exported aliases, or any type no marker call names.
// A file declaring `type Junk = {x: bigint}` that never passes it to a marker leaves NO trace in the cache.
// Pinned by perfile_test.go's TestScope_UnreferencedTypesAreNotProjected and TestDump_OnlyMarkerReachableTypes,
// plus packages/devtools/test/scope-bounded.test.ts.
func (sess *Session) dispatchScanFiles(files []string) ([]protocol.Site, []diagnostics.Diagnostic, error) {
	// BEFORE any id is assigned: every structural id folds the `overrideX<T>(pureFn)` suffix, and the map is
	// whole-program, since an override anywhere shifts ids everywhere.
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
	// NE001 (`@nonEnumerable` on a required property) runs once per file here, so it covers the serial and the
	// parallel scan path alike and never re-fires per call site. Purely syntactic, no checker needed.
	diags = append(diags, sess.nonEnumerableRequiredDiagnostics(files)...)
	// FIRST-PARTY DIAGNOSTIC SCOPING. A scan diagnostic is consumer feedback, "you wrote this call wrong", so it
	// must surface only for FIRST-PARTY files. A dependency normally resolves to its scan-inert `.d.ts`, but one
	// resolving to its `.ts` SOURCE (its `source` export condition, or a consumer's `customConditions`) is walked
	// like consumer code and would false-positive on the library's own internal generics, such as
	// registerPureFnFactory's `CompTimeArgs<PureFnId>` used non-literally.
	diags = sess.dropExternalLibraryDiagnostics(diags)
	return sites, diags, err
}

// dropExternalLibraryDiagnostics removes every diagnostic anchored in a source file TypeScript resolved by
// SEARCHING node_modules, a dependency whose internal source is never a consumer call site. It reads TypeScript's
// own resolution provenance (Program.IsSourceFileFromExternalLibrary), NOT a path-contains-node_modules heuristic,
// so it stays correct through workspace symlinks AND leaves the marker package's own self-import first-party,
// which resolves through the `source` export: real bugs in the marker package's source are never hidden.
// Sites and collection are unaffected. Per-file verdicts are memoised because many diagnostics share a file.
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

// nonEnumerableRequiredDiagnostics runs the NE001 syntactic walk over each requested file; an unresolvable file is
// skipped, the scan above having already surfaced any hard error.
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

// parallelScanEnabled reports whether this resolver may take the parallel scan path at all; SingleThreaded implies
// serial, its pool holding a single checker to fan out over.
func (sess *Session) parallelScanEnabled() bool {
	return !sess.opts.DisableParallelScan && !sess.opts.SingleThreaded &&
		sess.Program != nil && sess.Program.TS != nil
}

// dispatchScanFilesSerial is the single-checker scan loop: every file is analyzed and committed inline under the
// session checker. Also the fallback the parallel path returns to on a planning failure or a single-group request,
// so its semantics, the partial-scan-then-error behaviour on an unresolvable file included, are the contract for both.
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
				site, depthDiags, emitSite := sess.commitPending(pending)
				if len(depthDiags) > 0 {
					diagnostics = append(diagnostics, depthDiags...)
				}
				if emitSite {
					sites = append(sites, site)
					sess.sites = append(sess.sites, site)
				}
			}
			return true
		})
		sess.markFileScanned(file, sites[fileStart:])
	}
	return sites, diagnostics, nil
}

// markFileScanned records the reached wire ids in the cache's per-file scope map and marks the file scanned in
// both relative and absolute form. Shared by the serial loop above and the parallel commit phase.
func (sess *Session) markFileScanned(file string, fileSites []protocol.Site) {
	sess.recordFileIDs(file, fileSites)
	if sess.scannedFiles == nil {
		return
	}
	sess.scannedFiles[file] = struct{}{}
	// The Program's source list is absolute and a scanFiles caller passes relative paths, so both forms are
	// marked: scanAllProgramFiles's dedup must match whichever arrived first.
	if sess.Program != nil && sess.Program.TS != nil {
		absolutePath := tspath.ResolvePath(sess.Program.TS.GetCurrentDirectory(), file)
		sess.scannedFiles[absolutePath] = struct{}{}
	}
}

// scanState is the checker-bound context for one scan pass: the checker resolving this pass's files and its
// marker-verdict memo. The serial path builds one for the session checker, the parallel path one per checker group.
type scanState struct {
	sess        *Session
	scanChecker *checker.Checker
	verdicts    map[*checker.Type]markerVerdict
}

// scanStateFor builds the scanState for scanChecker, resolving the per-checker verdict memo once for the whole pass.
func (sess *Session) scanStateFor(scanChecker *checker.Checker) scanState {
	return scanState{
		sess:        sess,
		scanChecker: scanChecker,
		verdicts:    sess.verdictsFor(scanChecker),
	}
}

// detectMarker is marker.DetectAny memoized by parameter type pointer in the state's per-checker memo.
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

// nearMissDiagnostic builds MKR012 for a parameter typed like a marker but declared by a package the project does
// not trust. The using file's package is passed so a project's OWN same-named brand, the case the gate exists to
// keep inert, never reports.
func (state scanState) nearMissDiagnostic(file string, call *ast.Node, paramType *checker.Type) (diagnostics.Diagnostic, bool) {
	usingModule := marker.DeclaringModuleOfNode(call, state.sess.marker.FS)
	nearMiss, found := marker.DetectNearMiss(paramType, state.sess.marker, usingModule)
	if !found {
		return diagnostics.Diagnostic{}, false
	}
	sourceFile := ast.GetSourceFileOfNode(call)
	if sourceFile == nil {
		return diagnostics.Diagnostic{}, false
	}
	return diagnostics.New(
		diagnostics.CodeMarkerUntrustedPackage,
		textpos.NodeSite(file, sourceFile, call),
		nearMiss.MarkerName,
		nearMiss.DeclaringModule,
	), true
}

// pendingCall is the checker-bound analysis result for one injection call site: a complete Site minus the wire ID,
// plus the resolved type argument and the checker that materialized it. analyzeCall produces these; commitPending
// projects the type (the only cache mutation on the scan path) and mints the Site.
// The split is what lets the analysis run on pool checkers concurrently while projection stays serial.
type pendingCall struct {
	file string
	pos  int
	// site is the pre-built call-span diagnostics.Site, used only to anchor the diagnostics commitPending's
	// projection raises (the MKR008 depth cap and its siblings).
	site       diagnostics.Site
	paramIndex int
	argsCount  int
	fnId       string
	// fnIds is the ordered fnId list of a MULTI-function marker site (InjectTypeFnArgs<T, F1, F2, …>), nil for a
	// single-fn / reflection site where fnId carries the lone value; when set the rewrite injects an array of
	// entry tuples at paramIndex.
	fnIds  []string
	demand []protocol.SiteDemand
	// trailingComma says the call's argument list already ends with a comma (a formatter-wrapped
	// `createValidateFn(\n  schema,\n)`). The TS-side injector then splices the binding WITHOUT a leading comma:
	// the existing comma plus an injected `, …` would make an empty argument `f(a, , …)`, which is invalid JS.
	trailingComma bool
	// mockSeed is the literal mock.seed hint from a CompTimeHints options slot, "" for none.
	mockSeed     string
	typeArgument *checker.Type
	// owner is the checker that materialized typeArgument, and projection must run under it: types from
	// different checkers never mix (upstream contract on Program.GetTypeCheckerForFile).
	owner *checker.Checker
}

// commitPending projects the pending call's type argument into the cache and returns the finished Site.
// Serial-only: the cache is not safe for concurrent use. Projection runs under the checker that materialized the
// type, which on the serial path is always the session checker.
func (sess *Session) commitPending(pending pendingCall) (protocol.Site, []diagnostics.Diagnostic, bool) {
	sess.cache.ResetDepthExceeded()
	id := sess.cache.AssignIDUnder(pending.owner, pending.typeArgument)
	if sess.cache.DepthExceeded() {
		// An unresolvable type, like a bare free param, but one only the deep walk can classify, so it lands
		// here rather than at analyzeCall. A dominant named type on the overflowing stack means a
		// SELF-INSTANTIATING GENERIC (MKR009, naming it), otherwise plain too-deep nesting (MKR008).
		// Emitting NO site keeps every unresolvable-type case consistent: no placeholder id ever ships
		// (parity with MKR003/MKR010/MKR011). A lib-declared type needs no code of its own, since
		// typeid.NotDataBuiltinOf takes it whole and it cannot spiral; whatever reaches here is the
		// consumer's own code, which is what MKR009's "reflect a monomorphic shape" advice assumes.
		var diag diagnostics.Diagnostic
		if culprit := sess.cache.DepthCulprit(); culprit != "" {
			diag = diagnostics.New(diagnostics.CodeMarkerSelfInstantiatingGeneric, pending.site, culprit)
		} else {
			diag = diagnostics.New(diagnostics.CodeStructuralIdDepthExceeded, pending.site)
		}
		return protocol.Site{}, []diagnostics.Diagnostic{diag}, false
	}
	if collision := sess.cache.TakeHashCollision(); collision != nil {
		// Two types landed on the same short id at the configured hashLength, and nothing downstream can tell
		// them apart, so emit NO site and fail the build, naming both shapes plus the site that took the id
		// first. Raised HERE rather than in the cache because only the resolver knows the call sites.
		args := []string{
			collision.Hash,
			clipStructural(collision.Owner),
			clipStructural(collision.Structural),
			strconv.Itoa(collision.Length + 1),
			sess.formatIDOrigin(collision.Hash),
		}
		// The winner is a call site only when a marker asked for that type directly; an inner node (a union
		// member, a tuple slot) has none, so the message says "another site" instead of carrying a Related
		// that points nowhere.
		if origin, known := sess.idOrigins[collision.Hash]; known {
			return protocol.Site{}, []diagnostics.Diagnostic{diagnostics.NewWithRelated(
				diagnostics.CodeTypeIdCollision, pending.site, args,
				diagnostics.Related{Site: origin, Message: "first type to take the id `" + collision.Hash + "`"},
			)}, false
		}
		return protocol.Site{}, []diagnostics.Diagnostic{
			diagnostics.New(diagnostics.CodeTypeIdCollision, pending.site, args...),
		}, false
	}
	// A mock-sample disagreement on an entry this site shares with an earlier one. Raised HERE rather than in
	// the cache because only the resolver knows the call sites: it anchors on THIS site and names the one that
	// interned first, so both ends of the conflict are in the message.
	var diags []diagnostics.Diagnostic
	for _, conflict := range sess.cache.SampleConflicts() {
		diags = append(diags, diagnostics.New(
			diagnostics.CodeFMTSampleConflict, pending.site,
			conflict.Format,
			formatSamplePool(conflict.Kept),
			formatSamplePool(conflict.Incoming),
			sess.formatIDOrigin(conflict.ID),
		))
	}
	sess.rememberIDOrigin(id, pending)

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
		MockSeed:      pending.mockSeed,
	}, diags, true
}

// rememberIDOrigin records the FIRST site to resolve an id, so a later site that disagrees can name it. Only the
// first wins: for FMT006 that is the site whose declared pool the shared entry kept, for MKR014 the one that took
// the short id.
func (sess *Session) rememberIDOrigin(id string, pending pendingCall) {
	if sess.idOrigins == nil {
		sess.idOrigins = map[string]diagnostics.Site{}
	}
	if _, seen := sess.idOrigins[id]; seen {
		return
	}
	sess.idOrigins[id] = pending.site
}

// formatIDOrigin renders the remembered site for a message body, falling back to plain words when the entry was
// interned by something other than a call site.
func (sess *Session) formatIDOrigin(id string) string {
	origin, ok := sess.idOrigins[id]
	if !ok {
		return "another site"
	}
	return origin.FilePath + ":" + strconv.Itoa(origin.StartLine) + ":" + strconv.Itoa(origin.StartCol)
}

// clipStructural shortens a structural id for a diagnostic message: a big nested type spells out every member, and
// a build error running to thousands of characters is one nobody reads.
func clipStructural(structural string) string {
	const limit = 100
	if len(structural) <= limit {
		return structural
	}
	runes := []rune(structural)
	if len(runes) <= limit {
		return structural
	}
	return string(runes[:limit]) + "…"
}

// formatSamplePool renders a pool for the message in declaration order, the order the mock generator indexes into.
func formatSamplePool(samples []string) string {
	quoted := make([]string, 0, len(samples))
	for _, sample := range samples {
		quoted = append(quoted, strconv.Quote(sample))
	}
	return "[" + strings.Join(quoted, ", ") + "]"
}

// injectMarker is one InjectRunTypeId / InjectTypeFnArgs parameter found on a call's resolved signature: its
// parameter index, the marker kind, the resolved type argument T, and (InjectTypeFnArgs only) the function-family keys.
type injectMarker struct {
	paramIndex int
	kind       marker.Kind
	typeArg    *checker.Type
	fnKeys     []string
}

// analyzeCall inspects one call expression, the checker-bound analysis half of the scan: it validates every
// CompTimeArgs / PureFunction argument of the resolved signature whether or not the call also carries an injection
// marker (the marker IS the contract, not the function name or position), then emits a pendingCall per injecting
// slot for the commit phase to assign ids and mint Sites.
// Diagnostics flow independently of Site emission. Every checker read goes through state.scanChecker, so this can
// run on any pool checker; only commitPending touches the cache.
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
		// The AST's own record of the trailing comma survives comments and whitespace, so the TS-side
		// injector never has to scan source bytes backward.
		trailingComma = callExpression.Arguments.HasTrailingComma()
	}
	// The CompTimeArgs / PureFunction validation below is independent of injection: registerPureFnFactory and any
	// other non-injection branded function must be checked too.
	var diags []diagnostics.Diagnostic
	var markers []injectMarker
	// analyzeCall stays diagnosis-complete: a CTA0xx / PFN0xx that lands in a dependency's own source is
	// filtered downstream by dispatchScanFiles (dropExternalLibraryDiagnostics), one chokepoint on the whole list.
	for paramIndex := 0; paramIndex <= lastIndex; paramIndex++ {
		paramSymbol := parameters[paramIndex]
		if paramSymbol == nil {
			continue
		}
		paramType := checker.Checker_getTypeOfSymbol(state.scanChecker, paramSymbol)
		kind, typeArg, matched := state.detectMarker(paramType)
		if !matched && comptimeargs.IsCompTimeArgsParamNode(state.scanChecker, paramSymbol, state.sess.marker) {
			// CompTimeArgs is the zero-cost identity marker (markers.ts): its resolved type carries no
			// alias or brand for DetectAny, so it is recognised off the parameter's annotation node.
			kind, matched = marker.KindCompTimeArgs, true
		}
		if !matched {
			continue
		}
		// A nil typeArg on an INJECTION marker means only the brand PROPERTY matched, never the alias
		// (matchedByBrand is deliberately not module-gated), usually a near miss: right marker name, declared
		// by a package this project has not trusted. The call still emits a site, but for `unknown` instead
		// of the user's type, so say so. Guarded on the nil typeArg, so it costs nothing on the hot path.
		if typeArg == nil && (kind == marker.KindInjectRunTypeId || kind == marker.KindInjectTypeFnArgs) {
			if nearMissDiag, found := state.nearMissDiagnostic(file, call, paramType); found {
				diags = append(diags, nearMissDiag)
			}
		}
		switch kind {
		case marker.KindInjectRunTypeId:
			// EVERY injection-marker parameter is its own slot: a wrapper may declare several, each
			// injecting at its own index, and the free-type-parameter / pass-through gates run per slot.
			markers = append(markers, injectMarker{paramIndex: paramIndex, kind: kind, typeArg: typeArg})
		case marker.KindInjectTypeFnArgs:
			// Same, plus the Fn type-args naming the function families, so the backend emits only the
			// demanded caches; the fnIds are computed per slot below.
			var fnKeys []string
			if keys, fnOK := marker.FnKeysForInjectTypeFnArgs(state.scanChecker, paramType, state.sess.marker); fnOK {
				fnKeys = keys
			}
			markers = append(markers, injectMarker{paramIndex: paramIndex, kind: kind, typeArg: typeArg, fnKeys: fnKeys})
		case marker.KindCompTimeArgs, marker.KindCompTimeFnArgs:
			// Both validate the argument is fully literal (CTA0xx). CompTimeFnArgs additionally marks the
			// fn-selecting slot, whose value the scanner reads positionally.
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
			// Both pure-fn form markers enforce the same inline + purity rules (PFN001 / PFE9006-9011):
			// the direct/factory distinction is a build-time wrap concern, not a validation one.
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
	// NESTED-BUILDER SKIP: a value-first builder call nested inside another marker call (`string({...})` inside
	// `object({...})`) is already reflected by the enclosing marker as a child, so its own id would be redundant
	// and at runtime it returns a type-only carrier the enclosing marker discards. Only injection markers count
	// as enclosing; `optional(...)`, plain helpers and vitest's `expect` are transparent.
	// …EXCEPT the id-LOOKUP escape: `getRunType<T>()` returns a RunType without building one, it looks the id up
	// in the runtime registry, so dropping its id leaves nothing to look up and it throws "no id injected" at
	// the first call. Nested is exactly where convert emits it (`createValidateFn(getRunType<Named>())`).
	if state.enclosedByInjectionMarker(call) &&
		!builders.IsIdLookupCall(state.scanChecker, call, state.sess.marker) {
		return nil, diags
	}
	// EXPLICIT PASS-THROUGH: a marker parameter the caller already filled is a forwarded handle or explicit id,
	// not an injection request, as when a wrapper forwards its own injected handle inward
	// (`getRunType<T>(undefined, id)`). argsCount is contiguous, so the injecting slots are exactly the trailing
	// block paramIndex >= argsCount. This filter MUST precede the free-type-parameter (MKR003) check in the
	// per-slot paths: inside a generic wrapper body `T` IS the wrapper's free type parameter, so MKR003 would
	// halt the build on the documented wrapper pattern, where the forwarded handle is a legitimate value.
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
	// A CompTimeHints options parameter identifies a createMockDataFn-shaped signature, a wrapper redeclaring the
	// bag included. Detection walks the SIGNATURE, so an argument-less `createMockDataFn<T>()` still counts, and
	// the mock.seed hint is read only when the slot was filled. Behind the injecting gate above, so a plain call
	// never pays the per-parameter annotation walk. Lenient by the marker's contract: a dynamic bag yields no
	// hint, never a diagnostic.
	mockSeed := ""
	mockShaped := false
	for paramIndex := 0; paramIndex <= lastIndex && paramIndex < len(parameters); paramIndex++ {
		if parameters[paramIndex] == nil {
			continue
		}
		if !comptimeargs.IsCompTimeHintsParamNode(state.scanChecker, parameters[paramIndex], state.sess.marker) {
			continue
		}
		mockShaped = true
		if paramIndex < argsCount && callExpression != nil && callExpression.Arguments != nil {
			mockSeed = extractMockSeedHint(state.scanChecker, callExpression.Arguments.Nodes[paramIndex])
		}
		break
	}
	// SINGLE TRAILING MARKER: the full path, with reflect-form, comptime options, annotation honoring and the
	// Temporal-not-loaded guard.
	if len(injecting) == 1 && injecting[0].paramIndex == lastIndex {
		pending, extra, ok := state.analyzeTrailingInjection(file, call, callExpression, injecting[0], lastIndex, argsCount, trailingComma)
		diags = append(diags, extra...)
		if !ok {
			return nil, diags
		}
		pending.mockSeed = mockSeed
		// A mock site is reflection-only (bare-id injection, no fnId), but its generated values must still pass
		// through the type's declared format transforms to be canonical, and the walker resolves the compiled
		// fn at generation time (mockType.ts lookupFormatTransform). Demanding the fmt family here is what
		// makes that entry exist without a separate createFormatTransformFn call site.
		if pending.fnId == "" && len(pending.fnIds) == 0 && mockShaped {
			pending.demand = mockFormatTransformDemand()
		}
		// Unused-builder-const elision: a value-first builder call whose result is provably unused in its own
		// file (discarded, or bound to a non-exported const referenced only via `typeof` in type position)
		// emits no reflection graph. Dropping the pending is the whole mechanism: no injection, no reflection
		// root, the type never interned; the diagnostics collected above are KEPT. The builderResult runtime
		// tolerates the missing id, and getRunType is excluded inside IsValueBuilderCall because it throws
		// without one. AFTER the mock-demand block, so a mock-shaped site, never RunType-returning, is untouched.
		if pending.fnId == "" && len(pending.fnIds) == 0 &&
			builders.IsValueBuilderCall(state.scanChecker, call, state.sess.marker) &&
			builders.UnusedBuilderConst(state.scanChecker, call) {
			return nil, diags
		}
		return []pendingCall{pending}, diags
	}
	// MULTI-SLOT INJECTION: several marker parameters, or a single non-trailing one, each injecting at their own
	// index. No reflect-form or comptime options, since a wrapper call passes T through explicit type arguments
	// and forwards no options bag.
	pendings, extra := state.analyzeMultiSlotInjection(file, call, injecting, argsCount, trailingComma)
	diags = append(diags, extra...)
	return pendings, diags
}

// analyzeTrailingInjection is the single-marker injection path: one marker in the trailing parameter slot, with
// the reflect-form / comptime-options / annotation-honoring handling a value-first `createX(value)` and an
// options-carrying call depend on.
func (state scanState) analyzeTrailingInjection(file string, call *ast.Node, callExpression *ast.CallExpression, slot injectMarker, lastIndex, argsCount int, trailingComma bool) (pendingCall, []diagnostics.Diagnostic, bool) {
	var diags []diagnostics.Diagnostic
	sourceFile := ast.GetSourceFileOfNode(call)
	injectionTypeArgument := slot.typeArg
	injectionFnKeys := slot.fnKeys
	// One walk over the call's written type-argument syntax classifies every type reference into the silent-any
	// guard that owns it: a `Temporal.<Name>` degraded to `any` is TMP001 (the lib is not loaded, so the emitted
	// validator would accept anything), any other name that resolved to the checker's ERROR type is MKR013.
	temporalDiags, nameDiags := detectWrittenTypeRefGuards(state.scanChecker, file, call)
	diags = append(diags, temporalDiags...)
	// Sibling guard: T resolved to `any` because an import in this file failed to resolve in the scan program
	// (MKR007). The injection still proceeds with noop tuples, so the diagnostic is what fails a strict build.
	importDiags := state.detectAnyFromUnresolvedImport(file, call, injectionTypeArgument)
	diags = append(diags, importDiags...)
	// MKR013 is suppressed when MKR007 fired, the import message naming the actionable cause; TMP001 always
	// surfaces. The slot probe covers the reflect form and yields to a walk hit AND to TMP001, the same
	// degraded slot with a lib-specific fix message.
	if len(importDiags) == 0 {
		if len(nameDiags) == 0 && len(temporalDiags) == 0 {
			nameDiags = detectUnresolvedNameSlot(file, call, injectionTypeArgument)
		}
		diags = append(diags, nameDiags...)
	}
	// The probes above see only the root type and the call's own syntax; a member that degraded one object
	// deeper needs the graph walk (silent_any_walk.go), which reports each such member once.
	diags = append(diags, state.detectSilentAnyInGraph(file, call, injectionTypeArgument)...)
	typeArgument := injectionTypeArgument
	if marker.IsFreeTypeParameter(typeArgument) {
		// A call inside a generic wrapper body with the id slot EMPTY: `T` is the wrapper's own free type
		// parameter, so there is no concrete id until the wrapper is instantiated. A wrapper that forwards
		// its handle returned above, so this is the genuinely unsupported case, `createValidateFn<T>()` in a
		// generic body. MKR003 gives the user a build-time breadcrumb instead of a runtime "no id injected".
		if sourceFile == nil {
			return pendingCall{}, diags, false
		}
		diags = append(diags, diagnostics.New(
			diagnostics.CodeMarkerFreeTypeParameter,
			textpos.NodeSite(file, sourceFile, call),
		))
		return pendingCall{}, diags, false
	}
	// CONTAINED free type parameter (`A<T>`, `T[]`, `{a: T}` in a generic body): the bare-T MKR003 unsoundness
	// one level down, where the free param collapses silently to `unknown` and every instantiation context
	// shares one aliased id. Rejected as MKR010 with no site, naming the parameter, Related pointing at its
	// declaration and the generics chain the walk descended through.
	if finding, found := marker.FindFreeTypeParameter(state.scanChecker, typeArgument); found {
		if sourceFile == nil {
			return pendingCall{}, diags, false
		}
		diags = append(diags, diagnostics.NewWithRelated(
			diagnostics.CodeMarkerUnresolvedTypeParameter,
			textpos.NodeSite(file, sourceFile, call),
			[]string{finding.ParamName},
			finding.Related...,
		))
		return pendingCall{}, diags, false
	}
	// A written generic reference MISSING required type arguments (`getRunTypeId<A2>()` over `interface A2<S>`
	// with no default): tsc rejects it (TS2314) but the no-typecheck dev lane does not, and the checker hands
	// us the error type, which on the type side is indistinguishable from a legal `getRunTypeId<any>()`.
	// Only a SYNTACTIC walk over the written type-argument nodes catches it; Related points at the first
	// default-less parameter in the chain.
	if callExpression != nil && sourceFile != nil {
		if missing, found := findMissingTypeArgs(state.scanChecker, callExpression.TypeArguments); found {
			diags = append(diags, diagnostics.NewWithRelated(
				diagnostics.CodeMarkerUnresolvedGenericType,
				textpos.NodeSite(file, sourceFile, call),
				[]string{missing.TypeName, missing.ParamName},
				missing.Related...,
			))
			return pendingCall{}, diags, false
		}
	}
	// REFLECT-FORM CHECKS fire only when T was inferred from a value argument: no written type-argument list,
	// and at least one value argument present.
	inReflectForm := callExpression != nil &&
		(callExpression.TypeArguments == nil || len(callExpression.TypeArguments.Nodes) == 0) &&
		argsCount > 0 && callExpression.Arguments != nil &&
		len(callExpression.Arguments.Nodes) > 0
	if inReflectForm {
		argZero := callExpression.Arguments.Nodes[0]
		// FUNCTION-CALL-ARGUMENT ANTI-PATTERN: a call expression as the reflect-form value
		// (`createValidateFn(getX())`) invokes the function at runtime purely for type inference, firing side
		// effects, exceptions and async work for nothing. The validator still works, T coming from the
		// inferred return type, so this is a warning pointing at the static `ReturnType<typeof fn>` form.
		// EXCEPT a builder call, which IS the intended reflect-form value: pure construction, so no warning.
		if argZero != nil && argZero.Kind == ast.KindCallExpression &&
			!builders.IsBuilderLeafCall(state.scanChecker, argZero, state.sess.marker) {
			if diagnostic, ok := state.sess.markerDiagFunctionCallArg(file, argZero); ok {
				diags = append(diags, diagnostic)
			}
		}
		// REFLECT-FORM ANNOTATION HONORING: for a const-bound identifier with a written type annotation,
		// prefer the annotation over the binding's CFA-narrowed apparent type. TypeScript tracks
		// `const v: T = literal` by its initializer's narrowest type, so the apparent type at the call site
		// is `typeof literal`, not the declared union/enum; reading the annotation is what makes the
		// reflect-form hash equal the static-form hash for `const v: T = literal; createValidateFn(v);`.
		// A non-identifier argument (property access, call, element access) never goes through const-binding
		// CFA, so it falls through to the apparent-type path.
		// Skipped for the RUN-TYPE overload: with `const runTypeConst: RunType<T>`, the declared type is
		// `RunType<T>` while the injection's typeArgument is already the UNWRAPPED `T`, so overriding it
		// would validate against RunType's own shape and break a recursive run-type bound to an annotated const.
		if annotated, ok := state.declaredTypeFromIdentifier(argZero); ok && !builders.IsRunType(annotated, state.sess.marker) {
			typeArgument = annotated
		}
	}
	options := extractValidateOptions(state.scanChecker, call, lastIndex, argsCount)
	// numberMode is the one field merged from the project-wide defaults, the site's own value winning.
	// isFinite, the default and any unrecognized value, adds no variant name, so plain keys stay stable.
	effectiveNumberMode := options.numberMode
	if effectiveNumberMode == "" {
		effectiveNumberMode = state.sess.opts.ValidateDefaults.NumberMode
	}
	if canonicalName := constants.NumberModeOptionName(effectiveNumberMode); canonicalName != "" {
		options.enable(canonicalName)
	}
	// ValidateOptions never fold into the structural id, only into the fnId's variant suffix (`NT`, `NM`): one factory per
	// (typeid, fnId). The JSON strategies keep the same invariant; see `createJsonEncoderFn` and constants.ValidateVariantSuffix.
	// RegExp has no literal type in TS (`/abc/i` widens to `RegExp` even under `as const`), so `typeof /abc/i`,
	// `typeof /xyz/` and `RegExp` all resolve to the same KindRegexp id.
	//
	// One fnId plus structured demand per named family: the base tag refined by the call-site compile-time
	// options, which are SHARED across the families of one marker. The demand is the forward replacement for
	// reverse-parsing an fnId, which an opaque hash cannot support. A reflection site (InjectRunTypeId) leaves
	// injectionFnKeys empty and so yields neither.
	// DUPLICATE-FAMILY GUARD: a marker names each family at most once, so a repeat
	// (InjectTypeFnArgs<T, 'verr', 'jsonDecoder', 'verr'>) is almost always a copy-paste slip and would inject a
	// second identical entry tuple nothing reads. Rejected as MKR006, and deduped before computing fnIds so the
	// output stays sane even if a host surfaces the diagnostic as non-fatal.
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
		fnId, fnDemand, fnDiags := computeSiteFn(state.scanChecker, fnKey, options, call, lastIndex, argsCount, file)
		fnIds = append(fnIds, fnId)
		demand = append(demand, fnDemand...)
		diags = append(diags, fnDiags...)
	}
	// FnId is the scalar single-fn wire, mirroring fnIds[0]; FnIds is set only for a multi-function site, so a
	// single-fn or reflection site stays byte-stable.
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
		// call.End() is exclusive, one past the closing `)`, so End()-1 is the paren offset the TS-side
		// patcher inserts at.
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

// analyzeMultiSlotInjection is the multi-slot injection path: a call whose signature carries SEVERAL
// injection-marker parameters (mion's per-side `route(handler, opts?, paramsFns?, responseFns?)`), or a single
// non-trailing one. Each injecting slot resolves independently, with its own type argument, fn keys and MKR003
// check, and emits its own pendingCall at the call's closing paren; the transform then groups all slots of one
// call, same Pos, into a single positional insertion, filling non-marker optional gaps with `undefined`.
// A wrapper call forwards no comptime options, so fn ids resolve with default options.
func (state scanState) analyzeMultiSlotInjection(file string, call *ast.Node, injecting []injectMarker, argsCount int, trailingComma bool) ([]pendingCall, []diagnostics.Diagnostic) {
	var diags []diagnostics.Diagnostic
	sourceFile := ast.GetSourceFileOfNode(call)
	// One per-call walk classifies every written type reference into the guard that owns it (TMP001 / MKR013),
	// as on the trailing path. The per-slot reflect probe below yields to both families' hits; MKR013 also
	// yields to a slot's MKR007 after the loop, the import naming the cause, while TMP001 always surfaces.
	temporalDiags, nameRefDiags := detectWrittenTypeRefGuards(state.scanChecker, file, call)
	diags = append(diags, temporalDiags...)
	importFired := false
	pos := call.End() - 1
	var pendings []pendingCall
	for _, m := range injecting {
		// Silent-any guard per slot (MKR007): a wrapper slot whose T checked as `any` because this file has
		// an unresolved import.
		importDiags := state.detectAnyFromUnresolvedImport(file, call, m.typeArg)
		diags = append(diags, importDiags...)
		if len(importDiags) > 0 {
			importFired = true
		} else if len(nameRefDiags) == 0 && len(temporalDiags) == 0 {
			diags = append(diags, detectUnresolvedNameSlot(file, call, m.typeArg)...)
		}
		diags = append(diags, state.detectSilentAnyInGraph(file, call, m.typeArg)...)
		if marker.IsFreeTypeParameter(m.typeArg) {
			// A marker slot whose `T` is the enclosing wrapper's own free type parameter, so there is no
			// concrete id until the wrapper is instantiated. The other slots on this call may still inject.
			if sourceFile != nil {
				diags = append(diags, diagnostics.New(
					diagnostics.CodeMarkerFreeTypeParameter,
					textpos.NodeSite(file, sourceFile, call),
				))
			}
			continue
		}
		// Contained free type parameter, the MKR010 sibling of the bare check above. No syntactic
		// missing-args check here: a multi-slot wrapper call infers its type arguments from values, so
		// there are no written type-argument nodes to walk.
		if finding, found := marker.FindFreeTypeParameter(state.scanChecker, m.typeArg); found {
			if sourceFile != nil {
				diags = append(diags, diagnostics.NewWithRelated(
					diagnostics.CodeMarkerUnresolvedTypeParameter,
					textpos.NodeSite(file, sourceFile, call),
					[]string{finding.ParamName},
					finding.Related...,
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
			fnId, fnDemand, fnDiags := computeSiteFn(state.scanChecker, fnKey, validateOptions{}, call, m.paramIndex, argsCount, file)
			fnIds = append(fnIds, fnId)
			demand = append(demand, fnDemand...)
			diags = append(diags, fnDiags...)
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
	if !importFired {
		diags = append(diags, nameRefDiags...)
	}
	return pendings, diags
}

// dedupeFnKeys removes repeated fn keys from a multi-function marker, keeping first-occurrence order, and reports
// the first key that appeared twice. A repeat is rejected with MKR006, and the deduped list keeps injection sane
// if a host surfaces that diagnostic as non-fatal; the already-unique case returns the input unchanged.
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

// mockFormatTransformDemand is the fmt-family demand a createMockDataFn-shaped reflection site carries: the plain
// formatTransform entry for the site's type, so generated mocks resolve the same compiled transform a
// createFormatTransformFn<T>() site would compile. The site's FnId stays empty, the injection still being the bare
// runtype tuple, and entries.go loads the entry through the facade's SoftDeps.
func mockFormatTransformDemand() []protocol.SiteDemand {
	return []protocol.SiteDemand{{
		FamilyTag: "fmt",
		FnHash:    operations.PlainHash("formatTransform"),
	}}
}

// unresolvedFnNameDiagnostic reports a marker naming a family that does not exist (MKR015), with the closest real
// name when there is one. The retired short tags land here, which makes the rename a build failure rather than a
// silently missing function.
func unresolvedFnNameDiagnostic(file string, call *ast.Node, fnKey string) diagnostics.Diagnostic {
	suggestion := ""
	if closest := operations.SuggestFnKey(fnKey); closest != "" {
		suggestion = "; did you mean `" + closest + "`?"
	} else {
		suggestion = "."
	}
	sourceFile := ast.GetSourceFileOfNode(call)
	return diagnostics.New(diagnostics.CodeMarkerUnresolvedFnName, textpos.NodeSite(file, sourceFile, call), fnKey, suggestion)
}

// computeSiteFn resolves a createX site's fnId (2nd tuple element) and its cache-entry demand in one registry pass.
// FnHashFor keeps scanner and emitter on the SAME hash for every axis; an empty (reflection-only) fnKey yields ("", nil).
func computeSiteFn(typeChecker *checker.Checker, fnKey string, options validateOptions, call *ast.Node, lastIndex, argsCount int, file string) (string, []protocol.SiteDemand, []diagnostics.Diagnostic) {
	if fnKey == "" {
		return "", nil, nil
	}
	op, known := operations.ByFnKey(fnKey)
	if !known {
		// Without this an unknown family is silent: no fnId, and the wrapper's empty slot fails only at runtime.
		return "", nil, []diagnostics.Diagnostic{unresolvedFnNameDiagnostic(file, call, fnKey)}
	}
	// Both options swap the OPERATION, not a variant: a variant is root-scoped and would miss named nested types.
	// Downstream is unchanged, so both still take numberMode / rejectCircularRefs.
	checkUnknowns := extractBoolValidateOption(typeChecker, call, lastIndex, argsCount, "checkUnknowns")
	checkUnionUnknowns := extractBoolValidateOption(typeChecker, call, lastIndex, argsCount, "checkUnionUnknowns")
	if selected, swapped := validatorFamilyOperation(op, checkUnknowns, checkUnionUnknowns); swapped {
		op = selected
	}
	// Value-level JSON families: the strategy names the operation, and only the site's value counts (no project default).
	if selected, swapped := jsonValueStrategyOperation(op, extractStrategyOption(typeChecker, call, lastIndex, argsCount)); swapped {
		op = selected
	}
	var optionNames []string
	var strategy string
	switch op.Axis {
	case operations.AxisJsonStrategy:
		strategy = extractStrategyOption(typeChecker, call, lastIndex, argsCount)
	case operations.AxisValidateOptions:
		optionNames = options.Names()
	case operations.AxisHasUnknownKeysOptions:
		// Read in place rather than through the shared validateOptions bag, like the JSON strategy.
		optionNames = extractHasUnknownKeysOptions(typeChecker, call, lastIndex, argsCount).Names()
	}
	// The circular guard folds into the fnHash on every axis, so it is read per family, not from one option bag.
	// Circularity is unknown until commitPending, so an armed acyclic type gets a harmless duplicate entry.
	rejectCircular := op.CircularGuarded && extractRejectCircularOption(typeChecker, call, lastIndex, argsCount)
	fnId := operations.FnHashFor(op, optionNames, strategy, rejectCircular)
	demands := operations.DemandForOp(op, optionNames, strategy, rejectCircular)
	if len(demands) == 0 {
		return fnId, nil, nil
	}
	out := make([]protocol.SiteDemand, len(demands))
	for index, demand := range demands {
		out[index] = protocol.SiteDemand{
			FamilyTag:      demand.FamilyTag,
			VariantSuffix:  demand.VariantSuffix,
			Options:        demand.Options,
			FnHash:         demand.FnHash,
			RejectCircular: demand.RejectCircular,
			ComposedBy:     demand.ComposedBy,
		}
	}
	return fnId, out, nil
}

// optionsArgumentAt returns the AST node at the compile-time options slot, nil when the call does not fill it.
// Layout convention: options always live at lastIndex-1, so for `createValidateFn<T>(val?, options?, id?)` that is
// slot 1. A marker function without an options param (`getRunTypeId<T>(_value?, id?)`) is inherently safe: slot 0
// holds a value, which may be an object literal but carries no known option key.
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

// eachOptionProperty visits every named PropertyAssignment of the options object literal at the options slot as a
// (name, initializer) pair, descending into object-spread fragments (see eachOptionPropertyOf). A no-op when the
// slot is unfilled or is not an object literal: the resolver runs at build time and cannot evaluate a non-literal
// expression, so a variable reference, a call, or a spread whose operand is not a resolvable object literal
// silently yields zero options. That matches the options model, where options are baked into the cache key.
func eachOptionProperty(typeChecker *checker.Checker, call *ast.Node, lastIndex, argsCount int, visit func(name string, initializer *ast.Node)) {
	// Unwrap `as const` / parens / `satisfies`, so extraction accepts exactly what the slot's CompTimeFnArgs
	// validation accepted.
	candidate := comptimeargs.UnwrapWrappers(optionsArgumentAt(call, lastIndex, argsCount))
	if candidate == nil {
		return
	}
	// A whole-const options bag (`createX(undefined, importedPreset)`) resolves cross-module to its `const`
	// object literal, mirroring the spread trace, so a whole-const preset selects the same fn variant as the
	// inlined form. CompTimeFnArgs validation already accepted it and enforced `as const`, so the values read
	// here match the type the call resolved against.
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

// eachOptionPropertyOf visits the named PropertyAssignments of an options object literal in SOURCE ORDER,
// descending into object-spread fragments (`{...preset, strategy: 'mutate'}`) where the spread appears.
// The source order is load-bearing: the callers are last-write-wins, so a later inline key, or a later spread,
// overrides an earlier spread's value, the merge semantics TypeScript applies to the type-level spread the
// CompTimeFnArgs validation accepted. Anything that validator accepts as a spread is merged here, so an accepted
// preset can never silently drop its options and select the wrong fn-hash variant. A spread whose operand does not
// resolve to an object literal is skipped, having never passed validation. Depth-bounded against const chains.
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

// extractMockSeedHint reads the literal `mock.seed` from a CompTimeHints options argument, the knob that makes
// generated pattern mockSample pools reproducible across builds. Best-effort by the marker's contract: only a
// statically readable numeric literal counts, and a dynamic bag, computed seed or absent key yields "", the site
// then carrying no hint and its pools drawing a fresh random key per build.
// Canonical decimal text rather than a float, so seeds written differently ("7", "7.0") mix in identically.
func extractMockSeedHint(typeChecker *checker.Checker, argument *ast.Node) string {
	candidate := comptimeargs.UnwrapWrappers(argument)
	if candidate == nil {
		return ""
	}
	// A whole-const preset (`createMockDataFn(v, mockPreset)`) resolves to its object literal, mirroring
	// eachOptionProperty's whole-const path.
	if candidate.Kind == ast.KindIdentifier {
		if container, ok := comptimeargs.ResolveSpreadContainer(typeChecker, candidate); ok && container.Kind == ast.KindObjectLiteralExpression {
			candidate = container
		}
	}
	if candidate.Kind != ast.KindObjectLiteralExpression {
		return ""
	}
	seed := ""
	eachOptionPropertyOf(typeChecker, candidate, 0, func(name string, initializer *ast.Node) {
		if name != "mock" || initializer == nil {
			return
		}
		mockObject := comptimeargs.UnwrapWrappers(initializer)
		if mockObject != nil && mockObject.Kind == ast.KindIdentifier {
			if container, ok := comptimeargs.ResolveSpreadContainer(typeChecker, mockObject); ok && container.Kind == ast.KindObjectLiteralExpression {
				mockObject = container
			}
		}
		if mockObject == nil || mockObject.Kind != ast.KindObjectLiteralExpression {
			return
		}
		// Last write wins across spreads/overrides, same as every option reader.
		eachOptionPropertyOf(typeChecker, mockObject, 0, func(innerName string, innerInitializer *ast.Node) {
			if innerName != "seed" {
				return
			}
			if text, ok := numericLiteralText(innerInitializer); ok {
				seed = text
			}
		})
	})
	return seed
}

// numericLiteralText returns the canonical decimal text of a possibly sign-prefixed numeric literal, ok=false for
// anything the build cannot read statically.
func numericLiteralText(node *ast.Node) (string, bool) {
	candidate := comptimeargs.UnwrapWrappers(node)
	if candidate == nil {
		return "", false
	}
	negative := false
	if candidate.Kind == ast.KindPrefixUnaryExpression {
		prefixUnary := candidate.AsPrefixUnaryExpression()
		if prefixUnary == nil || (prefixUnary.Operator != ast.KindMinusToken && prefixUnary.Operator != ast.KindPlusToken) {
			return "", false
		}
		negative = prefixUnary.Operator == ast.KindMinusToken
		candidate = comptimeargs.UnwrapWrappers(prefixUnary.Operand)
	}
	if candidate == nil || candidate.Kind != ast.KindNumericLiteral {
		return "", false
	}
	value, err := strconv.ParseFloat(candidate.Text(), 64)
	if err != nil || math.IsNaN(value) || math.IsInf(value, 0) {
		return "", false
	}
	if negative {
		value = -value
	}
	return strconv.FormatFloat(value, 'g', -1, 64), true
}

// extractStrategyOption reads the `strategy` string property from the options slot, the JSON encoder/decoder
// compile-time selector. "" when absent or not a string literal, so the caller falls back to the default strategy.
func extractStrategyOption(typeChecker *checker.Checker, call *ast.Node, lastIndex, argsCount int) string {
	strategy := ""
	eachOptionProperty(typeChecker, call, lastIndex, argsCount, func(name string, initializer *ast.Node) {
		if name != "strategy" {
			return
		}
		// Last-write-wins: a later `strategy`, inline or from a later spread, replaces an earlier one,
		// matching the merge semantics of `{...preset, strategy: '…'}`.
		if initializer.Kind == ast.KindStringLiteral || initializer.Kind == ast.KindNoSubstitutionTemplateLiteral {
			strategy = initializer.Text()
		}
	})
	return strategy
}

// extractRejectCircularOption reads a literal `rejectCircularRefs: true` from the call-site options object, in
// place rather than through the shared validateOptions bag because the circular guard is a cross-family option no
// single axis owns. A non-literal value or an absent slot yields false, matching the compile-time-baked model.
func extractRejectCircularOption(typeChecker *checker.Checker, call *ast.Node, lastIndex, argsCount int) bool {
	armed := false
	eachOptionProperty(typeChecker, call, lastIndex, argsCount, func(name string, initializer *ast.Node) {
		if name != "rejectCircularRefs" || initializer == nil {
			return
		}
		// Last-write-wins over spreads, matching `{...preset, rejectCircularRefs: …}`.
		switch initializer.Kind {
		case ast.KindTrueKeyword:
			armed = true
		case ast.KindFalseKeyword:
			armed = false
		}
	})
	return armed
}

// extractBoolValidateOption reads a literal `<option>: true` from the call-site options object of createValidateFn /
// createGetValidationErrorsFn. Read in place, NOT through the shared validateOptions bag: entries there become variant
// LETTERS on the same family, while these options select a different operation entirely (validatorFamilyOperation), so
// putting one in the table would silently give it a variant suffix and no behaviour. A non-literal value, or an absent
// slot, yields false.
func extractBoolValidateOption(typeChecker *checker.Checker, call *ast.Node, lastIndex, argsCount int, option string) bool {
	enabled := false
	eachOptionProperty(typeChecker, call, lastIndex, argsCount, func(name string, initializer *ast.Node) {
		if name != option || initializer == nil {
			return
		}
		// Last-write-wins over spreads, same as rejectCircularRefs.
		switch initializer.Kind {
		case ast.KindTrueKeyword:
			enabled = true
		case ast.KindFalseKeyword:
			enabled = false
		}
	})
	return enabled
}

// jsonValueStrategyOperations maps a value-level JSON family's DEFAULT operation to the one each non-default
// `strategy` selects; `clone` IS the default, so it is absent here.
var jsonValueStrategyOperations = map[string]map[string]string{
	"prepareForJsonClone":  {"mutate": "prepareForJsonMutate", "compact": "compactForJson"},
	"restoreFromJsonClone": {"mutate": "restoreFromJsonMutate", "compact": "compactFromJson"},
}

// jsonValueStrategyOperation maps a value-level JSON `strategy` to its AxisNone operation; unknown or absent keeps 'clone'.
func jsonValueStrategyOperation(op operations.Operation, strategy string) (operations.Operation, bool) {
	byStrategy, isValueFamily := jsonValueStrategyOperations[op.Name]
	if !isValueFamily {
		return op, false
	}
	name, mapped := byStrategy[strategy]
	if !mapped {
		return op, false
	}
	resolved, ok := operations.ByName(name)
	if !ok {
		return op, false
	}
	return resolved, true
}

// validatorFamilyOperation maps a plain validator operation to the family the call site's options selected. The call
// site's marker still says 'val' / 'verr', the injected tuple carrying the fnHash, so this swap is the only thing that
// routes it. `checkUnknowns` wins when both are set: every object-ish node is strictly stronger than union arms alone.
func validatorFamilyOperation(op operations.Operation, checkUnknowns, checkUnionUnknowns bool) (operations.Operation, bool) {
	strict, union := "", ""
	switch op.Name {
	case "validate":
		strict, union = "validateStrict", "validateUnionKeys"
	case "validationErrors":
		strict, union = "validationErrorsStrict", "validationErrorsUnionKeys"
	default:
		return op, false
	}
	selected := ""
	switch {
	case checkUnknowns:
		selected = strict
	case checkUnionUnknowns:
		selected = union
	default:
		return op, false
	}
	resolved, ok := operations.ByName(selected)
	if !ok {
		return op, false
	}
	return resolved, true
}

// enclosedByInjectionMarker reports whether call sits, transitively, inside the arguments of ANOTHER call whose
// resolved signature carries a trailing injection slot: the enclosing marker reflects the whole shape, so the
// nested id would be redundant. A non-injection ancestor call (a plain helper, `optional`, vitest's `expect`) is
// transparent, so the walk continues past it.
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
		// Gate on the WRITTEN annotation, not the resolved type: an enclosing marker is one of OUR functions
		// and DECLARES its trailing slot as `InjectRunTypeId<…>` / `InjectTypeFnArgs<…>`. Matching the
		// resolved type also fires for an unrelated generic passer-through whose trailing parameter merely
		// INFERRED the branded type from a marker-typed argument, as in `expect(getRunTypeId<T>()).toBe(x)`,
		// where `Assertion<U>.toBe(expected: U)` instantiates `expected` to `InjectRunTypeId<T>` and the
		// scanner would treat `.toBe` as enclosing and drop the injection on both inner calls.
		if comptimeargs.IsInjectionMarkerParamNode(state.scanChecker, lastParam, state.sess.marker) {
			return true
		}
	}
	return false
}

// validateOptions carries the call-site `ValidateOptions` flags set to a literal `true`, keyed by their
// constants.ValidateOptions name, and mirrors the JS-side ValidateOptions interface in createRTFunctions.ts.
// Table-driven off constants.ValidateOptions: a new option declared there is extracted automatically, and only
// its per-option semantics, such as a noop-diagnostic rule in analyzeCall, need teaching.
type validateOptions struct {
	enabled map[string]bool
	// numberMode is the raw `numberMode` string literal read at the site, "" when unset. An enum, not a
	// boolean, so it lives outside `enabled` until the project-default merge resolves it to a variant name.
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

// Names returns the enabled option NAMES in constants.ValidateOptions declaration order, the variant suffix order.
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
		// numberMode is a string-enum option, not a boolean, so its literal value is read here
		// (last-write-wins over spreads) and the variant name materialized after the project-default merge.
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
			// Last-write-wins: an explicit `false` disables an option a spread turned on, and is a no-op
			// on an absent key.
			delete(opts.enabled, name)
		}
	})
	return opts
}

// hasUnknownKeysOptions mirrors validateOptions for createHasUnknownKeysFn's compile-time options bag,
// table-driven off constants.HasUnknownKeysOptions.
type hasUnknownKeysOptions struct {
	enabled map[string]bool
}

// Names returns the enabled option NAMES in constants.HasUnknownKeysOptions declaration order.
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

// extractHasUnknownKeysOptions reads the literal `<option>: true` properties at the options slot for every option
// declared in constants.HasUnknownKeysOptions, with extractValidateOptions's literal/spread/last-write-wins rules.
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

// checkPureFunction validates that argumentNode is an inline arrow / function expression with no external handle,
// then runs the purity rules against the resolved function node. A shape failure is PFN001 (not a literal) or
// PFN002 (imported / exported, so the literal is reachable as a value) and short-circuits, there being nothing to
// walk for purity; a purity violation is PFE9006-PFE9011.
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
	return purefunctions.CheckPurity(state.scanChecker, state.sess.marker, sourceFile, fnNode)
}

// checkCompTimeArgs returns the CTA0xx diagnostic for an argument node that breaks the CompTimeArgs literal-only
// rules, and (_, false) when validation succeeded.
func (state scanState) checkCompTimeArgs(file string, argumentNode *ast.Node) (diagnostics.Diagnostic, bool) {
	result := comptimeargs.CheckLiteral(state.scanChecker, argumentNode, 0, state.comptimeArgsPolicy())
	if result.Ok {
		return diagnostics.Diagnostic{}, false
	}
	// A pure fn's id is a branded value, not a literal the walk can read: it comes from a registrar call, or
	// from a `.d.ts` carrying only its type. The brand promises the build can resolve it, and the pure-fn lane
	// is what resolves it, reporting PFE9013 when it cannot, so the literal rule has nothing to add.
	if state.isPureFnID(argumentNode) {
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

// isPureFnID reports whether the argument's type carries the PureFnId brand, the value a pure-fn registrar returns.
func (state scanState) isPureFnID(argumentNode *ast.Node) bool {
	argType := state.scanChecker.GetTypeAtLocation(argumentNode)
	if argType == nil {
		return false
	}
	kind, _, matched := marker.DetectAny(state.scanChecker, argType, state.sess.marker)
	return matched && kind == marker.KindPureFnId
}

// comptimeArgsPolicy returns the two predicates comptimeargs.CheckLiteral asks the resolver for, both judged on
// what the scanner can SEE (a call's return type, a parameter's written annotation) and never on a callee name,
// so a helper added later is covered without a list.
// IsBuilderCall accepts a static builder-construction call as a CompTimeArgs leaf, so a nested `string({…})` or
// `optional(number())` inside `object({…})` passes without recursion, each self-validating on its own scan visit.
// A marker helper returning a fully literal-typed VALUE bundle (`registerFormatPattern({source: '…'})`) is a leaf
// for the opposite reason: every field is read off the returned TYPE, so the call is never evaluated. A widened
// bundle (`source: string`) stays rejected, because there the value really would be lost.
// IsForwardedParam accepts a `CompTimeArgs` parameter handed straight into another CompTimeArgs position, answered
// by the same syntactic check the scan loop finds those parameters with, so a user's own local type named
// CompTimeArgs earns nothing.
func (state scanState) comptimeArgsPolicy() comptimeargs.Policy {
	markerOpts := state.sess.marker
	return comptimeargs.Policy{
		IsBuilderCall: func(node *ast.Node) bool {
			if builders.IsBuilderLeafCall(state.scanChecker, node, markerOpts) {
				return true
			}
			returnType := builders.CallReturnType(state.scanChecker, node)
			return builders.IsMarkerPackageType(returnType, markerOpts) &&
				comptimeargs.IsTypeReadableValue(state.scanChecker, returnType)
		},
		IsForwardedParam: func(node *ast.Node) bool {
			symbol := comptimeargs.ResolveImportAlias(state.scanChecker, state.scanChecker.GetSymbolAtLocation(node))
			return comptimeargs.IsCompTimeArgsParamNode(state.scanChecker, symbol, markerOpts)
		},
	}
}

// markerDiagFunctionCallArg builds the MKR001 diagnostic for a reflect-form marker call that received a
// function-call argument (`createValidateFn(getX())`), which is invoked at runtime purely so TypeScript can infer
// T from its return type. Returns (_, false) when the call's source file cannot be located, which should not happen.
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

// callExpressionName returns a short label for a CallExpression's callee, for a diagnostic message; an IIFE or
// any other expression-callee shape falls back to `<anonymous>`.
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

// declaredTypeFromIdentifier returns the resolved type of the annotation written on the identifier's const
// variable declaration, so the reflect form can honor the user's written T over CFA's narrowed apparent type.
// (nil, false) for a non-Identifier node, a symbol with no annotated const VariableDeclaration, and a `let`/`var`
// binding, which is re-assignable, so its annotation no longer pins the type at the call site.
// Annotation ≥ apparent type by construction: TS enforces initializer assignability against the annotation, so
// honoring it never produces a narrower validator than the apparent-type path.
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

// forEachCallExpression invokes cb for every CallExpression in sourceFile, in depth-first source order, nested
// calls included, and stops descending into a node when cb returns false.
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
