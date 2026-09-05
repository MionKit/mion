// Package resolver is the session orchestrator. It owns a tsgo Program +
// checker pool and dispatches incoming protocol ops across the cache
// generators under internal/cachegen/:
//
//   - runtype: resolves call-site type queries, deduplicates serialized
//     RunType records, and emits the runTypes cache module.
//   - typefunctions: precompiles the per-family functions (validate,
//     JSON/binary codecs, mock data, …) for cached RunTypes the emitter
//     supports.
//   - purefunctions + builtinpurefns: extract `registerPureFnFactory(...)`
//     bodies (and serve the built-in ones) into the pureFns cache module.
//   - operations, diskcache, hashid: shared op plumbing, the incremental
//     on-disk artifact cache, and the short structural-hash ids.
//
// The package's own files, by role:
//
//   - dispatch.go — per-op handlers, the entry point for every protocol op.
//   - scan.go / scan_parallel.go — marker scanning, serial and pooled.
//   - scope.go — per-file scope projection (which entries a file demands).
//   - generate.go / render.go — cache-module generation, rendering, and
//     wire-shape conversions.
//   - overrides.go — tsconfig/flag option resolution.
//   - relimports.go — relative-import paths from a site file to its modules.
//   - enrichcheck.go / enrich_op.go — the enrichment plan/check leaf and its op.
//   - missingtypeargs.go, temporal_guard.go, nonenumerable_lint.go,
//     unresolved_import_guard.go — the build-diagnostic guards.
package resolver

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"sync"

	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/diskcache"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/runtype"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/requestbatch"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/routerinit"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsengine"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// Options controls the resolver's hash budget and the marker-detection
// parameters threaded through to scanFiles.
type Options struct {
	HashLength int
	// Marker selects which type alias the scanner treats as the
	// transformer's id-injection sentinel. Zero values default to
	// `InjectRunTypeId` from `mion`.
	Marker marker.Options
	// Cwd is the working directory used when SetSources builds an inferred
	// Program. Required for server-mode resolvers; ignored when a Program
	// is supplied to New(). When unset, SetSources falls back to the
	// existing Program's GetCurrentDirectory.
	Cwd string
	// TsconfigPath is the project tsconfig (relative to Cwd, or absolute) whose
	// FULL parsed options SetSources adopts in every inferred Program, so
	// daemon rebuilds type-check exactly like the build. Main resolves it once
	// at process entry (explicit --tsconfig, else DiscoverTsconfig's tsc-style
	// upward walk) — the daemon receives the already-resolved path; empty means
	// no config exists anywhere (the inferred-defaults posture). Ignored when a
	// Program is supplied to New().
	TsconfigPath string
	// TsconfigGenDir is the tsconfig `genDir` value (absolute; empty when the
	// tsconfig sets none). resolveOutDir prefers it over the inferred
	// <srcDir>/.mion default, so every lane (bundler plugin, --compile,
	// enrich CLI) agrees on the output root; an explicit per-request outDir
	// (the plugin's own genDir option) still wins.
	TsconfigGenDir string
	// ClientTsconfig names the tsconfig of a SEPARATE client project whose
	// `batch([...])` calls and inline `inputFrom()` mappers this (server)
	// session generates the batch transport from (`<outDir>/rpc/`). Absolute.
	// Empty means the batch source is the session's own program: a fullstack
	// app, or one package holding both halves, needs nothing. The client
	// program is built lazily on the first generate and rebuilt when one of
	// its stamped source files changes.
	ClientTsconfig string
	// GenDir is the EXPLICIT output-root override (the serve --gen-dir flag —
	// the host plugin's own genDir option, forwarded at spawn). resolveOutDir
	// prefers it over TsconfigGenDir. Session config, not wire config: EVERY op
	// that needs the output root reads it through resolveOutDir, never a
	// request field.
	GenDir string
	// TransformRelative makes OpTransform rewrite the injected import block's
	// `rtmod:` specifiers to paths relative to the resolved output root (the
	// files-mode lane: the generated modules exist on disk under
	// <outDir>/types). False leaves the virtual `rtmod:` specifiers intact for
	// a host that resolves them itself.
	//
	// A SESSION knob, not a per-request one: every consumer is
	// session-homogeneous. The bundler plugin always relativizes; batchcompile's
	// pass-1 transform, the transform-wire bench and the inline test lane always
	// want the virtual form. It cannot be inferred from GenDir resolving
	// non-empty (resolveOutDir always resolves to something), nor from "this
	// session ran OpGenerate" — batchcompile generates AND virtual-transforms in
	// the same session.
	TransformRelative bool
	// OmitSourcesContent drops the ORIGINAL source out of each 'go'-mode
	// TransformResult.Map.sourcesContent (the heaviest single wire item — the
	// whole source a second time). The bundler composes chained maps and fills
	// original content downstream, so it rarely needs our copy. Off by default;
	// mirrors the immutable plugin option `sourcesContent: false`, which is why
	// it is spawn config rather than a request field. A pure WIRE trim — it
	// changes no artifact, and transforms are never disk-cached, so it is not a
	// fingerprint input.
	OmitSourcesContent bool
	// TsconfigFailOnError is the tsconfig plugin's failOnError (nil when unset);
	// OpGenerate echoes it on Response.FailOnError so the dependency-free host
	// can honor a tsconfig-only setting. The resolver never acts on it.
	TsconfigFailOnError *bool
	// SingleThreaded forces single-checker mode on Programs built by
	// SetSources. Mirrors program.Options.SingleThreaded. Also forces the
	// serial scan path (a one-checker pool has nothing to fan out over).
	SingleThreaded bool
	// DisableParallelScan forces the serial marker-scan path. The zero
	// value means parallel-on (same default-true idiom as SingleThreaded):
	// scanFiles requests whose files span more than one pool checker group
	// run the checker-bound analysis concurrently across the pool, then
	// commit serially in request order. The serial path remains the
	// automatic fallback for single-group requests, single files, and
	// file-resolve errors.
	DisableParallelScan bool
	// DisableParallelRender forces the sequential family-render loop. The
	// zero value means parallel-on: the requested non-validate cache
	// families render concurrently (each against sharded per-dispatch
	// memos, merged at the join), validate always renders last and
	// serially. SingleThreaded implies serial here too.
	DisableParallelRender bool
	// CacheDir is the EXPLICIT cache-location override (the internal
	// MION_CACHE_DIR control — tests + direct-binary power users). When
	// non-empty, the resolver persists per-(typeID, fnTag) RT artifacts
	// under it regardless of the project's incremental setting. When empty,
	// the location follows CacheFollowsIncremental (below). The disk layer
	// fingerprints non-version build options (hash lengths, marker settings)
	// into a subdirectory so distinct configurations don't share cache
	// entries; binary version is folded into the typeID hash so cross-version
	// files never collide.
	CacheDir string
	// CacheFollowsIncremental, when true and CacheDir is empty, turns the RT
	// disk cache on IFF the loaded Program enables TypeScript's incremental /
	// composite compilation — at the canonical
	// <Cwd>/node_modules/.cache/mion location. This is the normal
	// (plugin) flow: the cache follows tsc's own on/off switch. When false
	// and CacheDir is empty, caching is off (the in-memory walker runs every
	// time — the inline / server test default). Ignored when CacheDir is set.
	CacheFollowsIncremental bool
	// EmitMode selects what every typefns module renderer ships in its
	// code/factory slots: EmitCode (default) ships only the body `code`
	// string (the runtime rebuilds the factory via `new Function('utl',
	// code)` on first lookup); EmitFunctions ships only the live
	// `function g_<hash>(utl){…}` factory (code derived lazily if read);
	// EmitBoth ships both, for secure runtimes (Cloudflare WorkerD,
	// sandboxed iframes, browser CSP without `unsafe-eval`) that disallow
	// dynamic-code construction yet read `.code`. The vitest configs set
	// EmitBoth so the suite covers both the inline-factory path (via
	// createValidateFn<T>) and the new-Function path (via
	// deserializeValidate<T>) on every case.
	EmitMode constants.EmitMode
	// InlineMode selects the child-inlining policy (constants.InlineMode,
	// --inline-mode): default inlines unnamed non-circular compounds and
	// keeps named types external; allInternal inlines everything except
	// circular types.
	InlineMode constants.InlineMode
	// ModuleMode selects how cache entries group into virtual modules:
	// constants.ModuleModeDefault (or empty — runtype bundle + per-entry fn
	// modules), ModuleModeAllSingle (per-family bundles, fewest modules), or
	// ModuleModeAllModules (per-node runtype modules too — the pre-bundle
	// layout). Validated at the CLI boundary; unknown values behave as
	// default.
	ModuleMode string
	// SizeBias / SizeItems / SizeStringBytes / SizeMaxBytes parameterise the
	// compile-time binary buffer-size estimate baked into every `tb` entry —
	// the seed the runtime `dynamic` strategy uses as its cold-start buffer
	// size. Zero-value fields fall back to the constants.DefaultSize* defaults
	// (SizeEstimateConfig.normalized), except SizeBias whose 0 is a valid
	// "tightest" setting; the CLI/plugin path passes the DefaultSize* values.
	// All four fold into the disk fingerprint.
	SizeBias        float64
	SizeItems       int
	SizeStringBytes int
	SizeMaxBytes    int
	// JSEngine is the JS engine format-pattern checks run on (the sidecar
	// under node/bun natively, the host itself under WASM) — the validation
	// authority for pattern mockSamples. Nil or failing means patterns are
	// unverifiable and fail closed with the FMT004 missing-runtime error.
	// Not a disk-fingerprint input (it changes only which diagnostics
	// surface, never the emitted artifacts).
	JSEngine jsengine.Engine
	// PatternSampleCount / PatternSampleRetries drive mockSample
	// auto-generation for format patterns that declare none: the enrichment
	// pass asks JSEngine for PatternSampleCount deterministic samples per
	// sample-less pattern (0 disables generation — such patterns then fail
	// with FMT005), retrying each draw up to PatternSampleRetries times
	// (whole budget = count × retries). Generation is post-intern, so
	// typeIDs never depend on either knob; the emitted annotation content
	// does, so BOTH are disk-fingerprint inputs.
	PatternSampleCount   int
	PatternSampleRetries int
	// PureFnReportWire enables the structured build report (pure fns + batches):
	// OpGenerate and OpScanFiles populate Response.PureFnSites and
	// Response.BatchSites (whole program on generate, the rescanned files' delta
	// on scan). Off by default, so the normal rewrite pipeline pays nothing. Not
	// a disk-fingerprint input (report-only; it never changes the emitted
	// artifacts). Batch-id injection is NOT gated by it: the id is spliced
	// whether or not the report is on.
	PureFnReportWire bool
	// PureFnReportFile, when true, additionally WRITES the whole-program reports
	// as JSON files during OpGenerate. The locations are HARDCODED at
	// `<outDir>/types/pure-fns-report.json` and `<outDir>/types/batches-report.json`
	// (inside the generated cache dir, so they follow types/'s .gitignore +
	// regenerate lifecycle; still DATA, never part of the module manifest nor
	// resolvable as an rtmod:/ specifier) — not configurable, matching every
	// other path under the output root.
	PureFnReportFile bool
	// ValidateDefaults carries project-wide defaults for the per-call-site
	// ValidateOptions bag (validate / validationErrors). The scanner merges it
	// per field into every call site (site value wins per field). NOT a
	// disk-fingerprint input: it forks each entry's fnHash variant exactly like
	// a per-site option, so distinct defaults key distinct cache entries on
	// their own.
	ValidateDefaults ValidateDefaults
	// ParseDefaults carries the project-wide default for createParseFn's
	// strategy. Merged per site the same way, site-wins.
	ParseDefaults ParseDefaults
	// Enrichment session config for OpEnrich — spawn-time, never wire fields
	// (the wire carries only the target Files; the session carries the config).
	// EnrichFriendly / EnrichMock select the families to maintain; both false
	// means both (the CLI default). EnrichI18n turns per-locale translation-mirror
	// sync on (scaffold + sync only, never translated content); EnrichLocales /
	// EnrichSourceLocale configure it — serve seeds them from the tsconfig plugin
	// i18n block (project mode) with the --enrich-locales / --enrich-source-locale
	// flags as explicit overrides.
	EnrichFriendly     bool
	EnrichMock         bool
	EnrichI18n         bool
	EnrichLocales      []string
	EnrichSourceLocale string
}

// ValidateDefaults is the project-wide default subset of ValidateOptions a
// build may set through the `validate` plugin / tsconfig object. An empty
// field means "unset" — the call site's own value, else the built-in default,
// applies.
type ValidateDefaults struct {
	// NumberMode defaults ValidateOptions.numberMode ("" = unset → isFinite).
	NumberMode string
}

// ParseDefaults is the project-wide default a build may set through the `parse`
// plugin / tsconfig object. An empty field means "unset" — the call site's own
// value, else the built-in default, applies.
type ParseDefaults struct {
	// Strategy defaults ParseOptions.strategy ("" = unset → preserve).
	Strategy string
}

// Session owns a Program and answers type queries against it. The serializer
// cache is shared across queries so type ids stay stable in a single dump.
//
// Program-less resolvers (built via NewServer) are valid: they accept the
// setSources op to install a Program, then serve scanFiles / dump as normal.
// Subsequent setSources calls swap the Program in place — the structural
// type cache survives across swaps so dedup IDs stay stable.
type Session struct {
	Program      *program.Program
	cache        *runtype.Cache
	checker      *checker.Checker
	releaseLease func()
	sites        []protocol.Site
	marker       marker.Options
	opts         Options
	// inferredConfig caches the project tsconfig parsed from opts.TsconfigPath —
	// the FULL frozen CompilerOptions, adopted wholesale by every setSources-built
	// Program so daemon rebuilds type-check exactly like the build. Parsed ONCE
	// (cwd + tsconfig path are fixed per session); nil with the done flag set
	// means "no tsconfig named" (the inferred-defaults fallback). A FAILED parse
	// leaves the done flag unset: the op errors (strict like tsc, CFG001) and the
	// next setSources re-parses, so a fixed config heals without a respawn.
	// Session-lifetime, not reset on a Program swap.
	inferredConfig     *program.InferredConfig
	inferredConfigDone bool
	// configDeclarationRoots is the config's declaration-file (`.d.ts`) subset,
	// computed once beside inferredConfig. Every setSources-built Program unions
	// it into its roots so ambient declarations the project includes — which
	// nothing imports, so module resolution never reaches them — resolve exactly
	// as they do in the build lane instead of silently checking as `any`.
	configDeclarationRoots []string
	// pureFnHashes is the session-wide index of every pure-fn entry
	// the resolver has observed so far, keyed by "<ns>::<fnName>" with
	// the entry's bodyHash as the value. Used by dispatchScanFiles to
	// emit `AddedPureFns` on the wire — the Vite plugin reads that
	// signal in handleHotUpdate to decide whether the pureFns cache
	// module needs invalidating after a user-file change.
	pureFnHashes map[string]string
	// scannedFiles tracks every file the resolver has scanned via
	// dispatchScanFiles, regardless of whether the scan found any
	// markers. Used by scanAllProgramFiles to avoid double-scanning
	// (which would duplicate site entries on resolver.sites). Cleared
	// alongside the cache + sites on Rebind / Clear.
	scannedFiles map[string]struct{}
	// pureFnFileCache memoizes per-file pure-fn extraction for the
	// lifetime of the current Program (files are immutable within one
	// Program). The OpDump path used to re-extract EVERY program file on
	// EVERY dump; with the cache only never-seen files pay the AST walk.
	// Dropped on SetProgram / Reset together with the Program.
	pureFnFileCache *purefunctions.FileCache
	// batchFileCache is the request-batch twin of pureFnFileCache: per-file
	// `batch([...])` extraction memoised for the current Program, dropped
	// alongside it.
	batchFileCache *requestbatch.FileCache
	// routerInitFileCache memoises per-file `createMionRouter` detection for
	// the current Program (the modules the batch import is appended to),
	// dropped alongside it.
	routerInitFileCache *routerinit.FileCache
	// batchSource is the SEPARATE program the batch transport is generated
	// from when Options.ClientTsconfig names one; nil while unbuilt, and when
	// the batch source is this session's own program. Survives SetProgram /
	// Reset (it is another project); batchSourceStamps (mtime + size of every
	// source file it was built from) decide when it is rebuilt. See rpcgen.go.
	batchSource       *Session
	batchSourceStamps map[string]string
	// hasBatchesMemo caches whether the batch source holds at least one
	// batch call, the transform's switch for appending the batch import. nil
	// until computed; reset with the Program (own-program case) and whenever
	// the batch source is rebuilt.
	hasBatchesMemo *bool
	// verdictsByChecker memoizes marker.DetectAny by parameter type
	// pointer, one memo per pool checker. The scanner runs DetectAny for
	// every parameter of every resolved call signature — five spec checks
	// each with a brand-property checker lookup — and the same param
	// types repeat across call sites constantly. Pure function of
	// (checker, type, opts). Keyed per checker because each pool checker
	// materializes its own *checker.Type universe (upstream contract:
	// types from different checkers must never mix); the whole map dies
	// with the Program (SetProgram / Reset).
	verdictsByChecker map[*checker.Checker]map[*checker.Type]markerVerdict
	// rtStore is the on-disk RT artifact cache shared by every
	// renderXxxModule call. nil when CacheDir was empty — the renderer
	// treats nil as "no cache wired", so test paths that build a
	// resolver without a CacheDir keep the original semantics.
	rtStore *diskcache.Store
	// patternSeedBasis tracks, per (nodeID, pattern source), the mock.seed
	// basis under which the enrichment pass generated that pattern's
	// mockSamples pool — so a basis change mid-session (a seeded mock site
	// scanned later) regenerates OUR pool without ever touching declared
	// samples. Lazily built by enrichPatternSamples.
	patternSeedBasis map[string]string

	// idOrigins maps a cache id to the FIRST call site that resolved it — the
	// site whose declared mockSamples pool the shared entry kept, and the site
	// that took the short id. Read only when a later site disagrees with it, to
	// name both ends of the conflict in FMT006 and MKR014.
	idOrigins map[string]diagnostics.Site
	// patternGenFailures records, per (pattern source \x00 flags), why the
	// enrichment pass could not generate a pool — read at emit time by the
	// pattern emitter's FMT005 lane (threaded via RenderOpts), which has
	// the demanding call sites for anchoring. Lazily built alongside.
	patternGenFailures map[string]formats.PatternGenFailure
	// overridesBuilt guards the one-time, whole-program `overrideX<T>(pureFn)`
	// collection pass (ensureOverrides) for the current Program. The pass must
	// run before any AssignID so every id folds the override suffix; reset on
	// SetProgram / Reset so a Program swap rebuilds the map.
	overridesBuilt bool
	// overrideEntries holds the cfn pure-fn entries the override pass extracted
	// (one `cfn::<hash>` per distinct override body), merged into the pure-fn
	// module emission so the type-fn redirects resolve their `cfn::` dep.
	overrideEntries []purefunctions.Entry
	// overrideDiagnostics holds OVR0xx diagnostics from the override pass
	// (OVR001 duplicate-override, OVR010 validate cross-family), surfaced on
	// every scan response for the current Program.
	overrideDiagnostics []diagnostics.Diagnostic
	// overrideArgSpansByFile records, per source file, the byte spans of each
	// override call's inline pure-fn argument. The transform rewrites these to
	// `null` (the body lives only in the cfn module) — emitted as per-file
	// Replacements scoped to the requested files, like pure-fn factory nullings.
	overrideArgSpansByFile map[string][]overrideArgSpan
	// unresolvedSpecifiersByFile memoizes, per source file, the module
	// specifiers whose import bindings fail alias resolution. Computed
	// LAZILY — only when a marker site's type argument resolved to `any`
	// (the silent-degradation signature, see MKR007). Mutex-guarded: the
	// parallel scan path can hit it from several checker groups. Dies with
	// the Program.
	unresolvedSpecifiersByFile map[string][]string
	unresolvedSpecifiersMutex  sync.Mutex
	// programScanDiagnostics accumulates the marker diagnostics
	// (MKR/CTA/TMP/PFN…) produced by scanAllProgramFiles — the eager
	// whole-program scan OpGenerate/OpDump run. Those responses surface it;
	// without this the eager pass (the only scan most files ever get) would
	// silently drop every marker diagnostic. Files are never re-scanned, so
	// each diagnostic is recorded once. Dies with the Program.
	programScanDiagnostics []diagnostics.Diagnostic
}

// markerVerdict is one memoized marker.DetectAny result. typeArg is the
// brand's first type argument when matched (nil otherwise).
type markerVerdict struct {
	kind    marker.Kind
	typeArg *checker.Type
	matched bool
}

// verdictsFor returns (creating on first use) the marker-verdict memo for
// scanChecker — see the verdictsByChecker field doc. Callers resolve the
// memo once per scan pass, not per call, so the outer map lookup never
// sits on the hot path. NOT safe for concurrent use: parallel scans must
// pre-create every group's memo on the dispatch goroutine before fanning
// out.
func (sess *Session) verdictsFor(scanChecker *checker.Checker) map[*checker.Type]markerVerdict {
	if sess.verdictsByChecker == nil {
		sess.verdictsByChecker = map[*checker.Checker]map[*checker.Type]markerVerdict{}
	}
	verdicts, ok := sess.verdictsByChecker[scanChecker]
	if !ok {
		verdicts = map[*checker.Type]markerVerdict{}
		sess.verdictsByChecker[scanChecker] = verdicts
	}
	return verdicts
}

// cacheLocation resolves the RT disk-cache base directory for opts given the
// loaded Program's incremental setting. An explicit CacheDir override always
// wins; otherwise the cache follows tsc's incremental switch (on at the
// canonical node_modules/.cache/mion when the project is incremental /
// composite, off otherwise). Empty result means caching is disabled.
func cacheLocation(opts Options, incremental bool) string {
	if opts.CacheDir != "" {
		return opts.CacheDir
	}
	if opts.CacheFollowsIncremental && incremental {
		return filepath.Join(opts.Cwd, "node_modules", ".cache", "mion")
	}
	return ""
}

// newRTStore builds the on-disk store for opts, returning nil when caching is
// disabled. incremental is the loaded Program's IsIncremental() (false in
// server mode, where no Program exists yet). Centralised so New / NewServer
// share the same fingerprinting rules.
func newRTStore(opts Options, incremental bool) *diskcache.Store {
	baseDir := cacheLocation(opts, incremental)
	if baseDir == "" {
		return nil
	}
	fp := diskcache.Fingerprint(diskcache.FingerprintInputs{
		BinaryVersion:        constants.Version,
		BinaryStamp:          binaryStamp(),
		HashLength:           opts.HashLength,
		EmitMode:             string(opts.EmitMode),
		InlineMode:           string(opts.InlineMode),
		SizeBias:             opts.SizeBias,
		SizeItems:            opts.SizeItems,
		SizeStringBytes:      opts.SizeStringBytes,
		SizeMaxBytes:         opts.SizeMaxBytes,
		PatternSampleCount:   opts.PatternSampleCount,
		PatternSampleRetries: opts.PatternSampleRetries,
	})
	return diskcache.New(baseDir, fp)
}

// binaryStamp identifies THIS build of the resolver executable (mtime +
// size), so a rebuilt dev binary — same constants.Version, different
// emitters — moves the disk-cache fingerprint instead of serving the
// previous build's cached function bodies. `go build` leaves an unchanged
// binary untouched, so no-op rebuilds keep the cache. Empty when the
// executable cannot be resolved (the WASM twin — no disk cache there).
func binaryStamp() string {
	executablePath, err := os.Executable()
	if err != nil {
		return ""
	}
	info, err := os.Stat(executablePath)
	if err != nil {
		return ""
	}
	return strconv.FormatInt(info.ModTime().UnixNano(), 10) + "-" + strconv.FormatInt(info.Size(), 10)
}

// New builds a Session against prog. Defaults to hashid's default length when
// HashLength is zero.
func New(prog *program.Program, opts Options) (*Session, error) {
	if prog == nil || prog.TS == nil {
		return nil, errors.New("resolver.New: program is nil")
	}
	typeChecker, releaseLease := prog.TS.GetTypeChecker(context.Background())
	if typeChecker == nil {
		releaseLease()
		return nil, errors.New("resolver.New: no checker available")
	}
	markerOpts := marker.WithDefaults(opts.Marker)
	// Read package.json for the marker module-of-origin gate through the program's
	// (possibly overlay/virtual) filesystem, not os.ReadFile — see marker.Options.FS.
	markerOpts.FS = prog.FS
	cache := runtype.NewCache(typeChecker, runtype.Options{
		HashLength: opts.HashLength,
	})
	cache.SetMarkerOptions(markerOpts)
	return &Session{
		Program:             prog,
		cache:               cache,
		checker:             typeChecker,
		releaseLease:        releaseLease,
		marker:              markerOpts,
		opts:                opts,
		pureFnHashes:        map[string]string{},
		scannedFiles:        map[string]struct{}{},
		pureFnFileCache:     purefunctions.NewFileCache(),
		batchFileCache:      requestbatch.NewFileCache(),
		routerInitFileCache: routerinit.NewFileCache(),
		verdictsByChecker:   map[*checker.Checker]map[*checker.Type]markerVerdict{},
		rtStore:             newRTStore(opts, prog.IsIncremental()),
	}, nil
}

// NewServer builds a Session with no Program. Callers (the `serve --sources ops`
// CLI path) install one later via the setSources op. The cache is created
// up front with a nil checker; Rebind is called on first SetProgram.
func NewServer(opts Options) *Session {
	return &Session{
		cache: runtype.NewCache(nil, runtype.Options{
			HashLength: opts.HashLength,
		}),
		marker:              marker.WithDefaults(opts.Marker),
		opts:                opts,
		pureFnHashes:        map[string]string{},
		scannedFiles:        map[string]struct{}{},
		pureFnFileCache:     purefunctions.NewFileCache(),
		batchFileCache:      requestbatch.NewFileCache(),
		routerInitFileCache: routerinit.NewFileCache(),
		verdictsByChecker:   map[*checker.Checker]map[*checker.Type]markerVerdict{},
		// Server mode has no Program yet (installed later via setSources, always
		// an inferred/non-incremental project), so caching is override-only.
		rtStore: newRTStore(opts, false),
	}
}

// SetProgram swaps the underlying Program. Releases the previous checker,
// leases a new one from prog, rebinds the cache, and resets the sites slice
// (positions are tied to the old source text). The cache's structural dedup
// table survives the swap so equivalent types reuse their ids.
func (sess *Session) SetProgram(prog *program.Program) error {
	if prog == nil || prog.TS == nil {
		return errors.New("resolver.SetProgram: program is nil")
	}
	typeChecker, releaseLease := prog.TS.GetTypeChecker(context.Background())
	if typeChecker == nil {
		releaseLease()
		return errors.New("resolver.SetProgram: no checker available")
	}
	if sess.releaseLease != nil {
		sess.releaseLease()
	}
	sess.Program = prog
	// Keep the marker's package.json FS in sync with the current program's overlay
	// (setSources installs a fresh program + FS each call).
	sess.marker.FS = prog.FS
	sess.checker = typeChecker
	sess.releaseLease = releaseLease
	sess.cache.Rebind(typeChecker)
	sess.cache.SetMarkerOptions(sess.marker)
	sess.sites = sess.sites[:0]
	sess.scannedFiles = map[string]struct{}{}
	sess.pureFnFileCache = purefunctions.NewFileCache()
	sess.batchFileCache = requestbatch.NewFileCache()
	sess.routerInitFileCache = routerinit.NewFileCache()
	sess.hasBatchesMemo = nil
	sess.verdictsByChecker = map[*checker.Checker]map[*checker.Type]markerVerdict{}
	sess.overridesBuilt = false
	sess.overrideEntries = nil
	sess.overrideDiagnostics = nil
	sess.overrideArgSpansByFile = nil
	sess.unresolvedSpecifiersMutex.Lock()
	sess.unresolvedSpecifiersByFile = nil
	sess.unresolvedSpecifiersMutex.Unlock()
	sess.programScanDiagnostics = nil
	return nil
}

// Reset wipes ALL user-supplied resolver state: every interned Type, the
// sites list, the Program, the checker lease, and (because the overlay
// lives inside the Program) the in-memory source map. Equivalent to
// throwing the Session away and replacing it with a fresh NewServer —
// except the goroutine / connection stays open. After reset, the resolver
// requires a new setSources before scanFiles will work.
//
// Lib files (lib.d.ts, bundled tsgo declarations) live behind the
// cachedvfs layer in program.New / program.NewInferred — they are byte-
// cached at the FS level and are NOT re-read from disk on the next
// setSources. Only the user's overlay + parsed-AST state is discarded here.
func (sess *Session) Reset() {
	if sess.releaseLease != nil {
		sess.releaseLease()
		sess.releaseLease = nil
	}
	sess.Program = nil
	sess.checker = nil
	sess.cache.Clear()
	sess.cache.Rebind(nil)
	sess.sites = sess.sites[:0]
	sess.pureFnHashes = map[string]string{}
	sess.scannedFiles = map[string]struct{}{}
	sess.pureFnFileCache = purefunctions.NewFileCache()
	sess.batchFileCache = requestbatch.NewFileCache()
	sess.routerInitFileCache = routerinit.NewFileCache()
	sess.hasBatchesMemo = nil
	sess.verdictsByChecker = map[*checker.Checker]map[*checker.Type]markerVerdict{}
	sess.overridesBuilt = false
	sess.overrideEntries = nil
	sess.overrideDiagnostics = nil
	sess.overrideArgSpansByFile = nil
}

func (sess *Session) Close() {
	sess.closeBatchSource()
	if sess.releaseLease != nil {
		sess.releaseLease()
		sess.releaseLease = nil
	}
}

func (sess *Session) Cache() *runtype.Cache { return sess.cache }

// Checker returns the bound type checker. Used by the out-of-band enrichment
// bridge (internal/enrichment) to resolve a named type declaration to its
// *checker.Type before projecting it through the cache. The hot scan/render
// path keeps using the unexported field directly.
func (sess *Session) Checker() *checker.Checker { return sess.checker }

// MarkerOptions returns the session's marker detection options — the accepted
// marker package set (tsconfig `markers` / --marker-packages /
// --no-marker-package-check) plus the program's filesystem. Exposed so the
// out-of-band CLI verbs (convert, enrich --check) gate on the SAME configured
// packages the in-session scan does, instead of re-deriving the default.
func (sess *Session) MarkerOptions() marker.Options { return sess.marker }

// Sites returns the running list of resolved call-site ids. Callers (CLI,
// plugin) read this at end-of-build to write out the manifest.
func (sess *Session) Sites() []protocol.Site {
	return append([]protocol.Site(nil), sess.sites...)
}
