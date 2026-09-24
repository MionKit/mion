// Package resolver is the session orchestrator: it owns a tsgo Program + checker pool and
// dispatches incoming protocol ops across the cache generators under internal/cachegen/
// (runtype, typefunctions, purefunctions + purefnindex, operations, diskcache, hashid).
package resolver

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"sync"

	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/diskcache"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnindex"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/runtype"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/apimeta"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/requestbatch"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/routerinit"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsengine"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// Options is the resolver session's spawn-time configuration.
type Options struct {
	HashLength int
	// Marker selects the id-injection sentinel alias; zero values default to `InjectRunTypeId` from `mion`.
	Marker marker.Options
	// Cwd is where SetSources builds an inferred Program; ignored when New() gets a Program, unset falls back to its cwd.
	Cwd string
	// TsconfigPath: every inferred Program adopts its FULL parsed options, so daemon rebuilds type-check like the build.
	// Already resolved by main (relative to Cwd, or absolute); empty means no config exists anywhere.
	TsconfigPath string
	// TsconfigGenDir is the tsconfig `genDir` (absolute, empty when unset), preferred over the inferred <srcDir>/.mion.
	// An explicit per-request outDir still wins.
	TsconfigGenDir string
	// ClientTsconfig is the SEPARATE client project this server session generates the batch transport from (`<outDir>/rpc/`).
	// Empty means the batch source is this program; the client program is built lazily and rebuilt when a stamped file changes.
	ClientTsconfig string
	// ApiTsconfig is the SEPARATE project declaring the API this client's dispatch sites call; empty means this program.
	// Under BundleApi ids come from that peer program's checker, so a different `lib` or `strictNullChecks` cannot change one.
	ApiTsconfig string
	// BundleApi turns the client apimeta lane on: each called route's metadata and compiled fns go under <outDir>/api/,
	// injected at the dispatch sites, with the mode literal injected at initClient. The zero value skips the lane.
	BundleApi constants.BundleApiMode
	// GenDir is the EXPLICIT output-root override (serve --gen-dir), preferred over TsconfigGenDir.
	// Session config, never a wire field: every op reads the output root through resolveOutDir.
	GenDir string
	// TransformRelative rewrites the injected `rtmod:` specifiers to paths relative to the resolved output root
	// (the files-mode lane); false leaves them virtual for a host that resolves them itself.
	// A SESSION knob: it cannot be inferred from GenDir (resolveOutDir always resolves) nor from "ran OpGenerate",
	// since batchcompile generates AND virtual-transforms in the same session.
	TransformRelative bool
	// OmitSourcesContent drops the original source from each 'go'-mode TransformResult.Map.sourcesContent,
	// the heaviest wire item.
	// Spawn config (it mirrors the immutable plugin option) and a pure wire trim: no artifact changes, not a fingerprint input.
	OmitSourcesContent bool
	// TsconfigDowngradeErrors is echoed on Response.DowngradeErrors so a dependency-free host can honor a
	// tsconfig-only setting. The resolver never acts on it: downgrading is halt policy.
	// `@mion-expect-error` IS applied here, being a fact about the source rather than a policy.
	TsconfigDowngradeErrors []string
	// SingleThreaded mirrors program.Options.SingleThreaded, and also forces the serial scan path.
	SingleThreaded bool
	// DisableParallelScan forces the serial marker scan; the zero value is parallel-on (same idiom as SingleThreaded).
	// Parallel runs the checker-bound analysis across pool checker groups and commits serially in request order;
	// single-group requests, single files and file-resolve errors fall back to serial.
	DisableParallelScan bool
	// DisableParallelRender forces the sequential family-render loop; the zero value renders non-validate families
	// concurrently against sharded per-dispatch memos merged at the join. validate always renders last and serially,
	// and SingleThreaded implies serial here too.
	DisableParallelRender bool
	// CacheDir is the EXPLICIT cache-location override (MION_CACHE_DIR), used whatever the project's incremental setting.
	// Build options fingerprint into a subdirectory so distinct configurations never share entries (the binary version
	// folds into the typeID hash instead); empty follows CacheFollowsIncremental.
	CacheDir string
	// CacheFollowsIncremental ties the RT disk cache to tsc's own incremental/composite switch, at
	// <Cwd>/node_modules/.cache/mion. The normal plugin flow; false means no cache. Ignored when CacheDir is set.
	CacheFollowsIncremental bool
	// EmitMode selects what a typefns module ships in its code/factory slots; EmitBoth is for runtimes that ban
	// dynamic-code construction yet read `.code` (WorkerD, sandboxed iframes, CSP without `unsafe-eval`).
	// The vitest configs set EmitBoth so the suite covers the inline-factory and the new-Function path on every case.
	EmitMode constants.EmitMode
	// InlineMode (--inline-mode): default inlines unnamed non-circular compounds; allInternal inlines all but circular types.
	InlineMode constants.InlineMode
	// ModuleMode selects how cache entries group into virtual modules; validated at the CLI boundary, unknown values
	// behave as default.
	ModuleMode string
	// JSEngine runs the format-pattern checks (the sidecar under node/bun, the host itself under WASM) and is the
	// validation authority for pattern mockSamples; nil or failing fails closed with FMT004.
	// Not a disk-fingerprint input: it changes which diagnostics surface, never the emitted artifacts.
	JSEngine jsengine.Engine
	// PatternSampleCount / PatternSampleRetries drive mockSample generation for patterns that declare none: count
	// samples per pattern, retried up to retries times each (0 count disables generation, such patterns then fail FMT005).
	// Post-intern, so typeIDs never depend on them; the emitted annotation does, so BOTH are disk-fingerprint inputs.
	PatternSampleCount   int
	PatternSampleRetries int
	// JSONMaxBytes emits, on every fully bounded reflection ROOT row, the largest compact-JSON byte size a valid value
	// can have (row slot 21), which is what a framework derives per-route limits from. On by default; off means the slot
	// is never computed. A disk-fingerprint input: it changes the emitted root rows.
	JSONMaxBytes bool
	// PureFnReportWire populates Response.PureFnSites / BatchSites (whole program on generate, the rescanned files'
	// delta on scan); off by default, so the normal rewrite pipeline pays nothing.
	// Report-only, not a disk-fingerprint input; batch-id injection is NOT gated by it.
	PureFnReportWire bool
	// PureFnReportFile also WRITES the reports during OpGenerate, to `<outDir>/types/pure-fns-report.json` and
	// `<outDir>/types/batches-report.json`: hardcoded like every path under the output root, and DATA only, never part
	// of the module manifest nor resolvable as an rtmod:/ specifier.
	PureFnReportFile bool
	// ValidateDefaults seeds the per-call-site ValidateOptions bag, merged per field with the site value winning.
	// NOT a disk-fingerprint input: it forks each entry's fnHash like a per-site option, so distinct defaults key
	// distinct cache entries on their own.
	ValidateDefaults ValidateDefaults
	// Enrichment session config for OpEnrich: spawn-time only, the wire carries just the target Files.
	// EnrichFriendly / EnrichMock select the families to maintain; both false means both (the CLI default).
	// EnrichI18n syncs per-locale translation mirrors (scaffold and sync only, never translated content); serve seeds
	// EnrichLocales / EnrichSourceLocale from the tsconfig plugin i18n block, with the matching flags as overrides.
	EnrichFriendly     bool
	EnrichMock         bool
	EnrichI18n         bool
	EnrichLocales      []string
	EnrichSourceLocale string
}

// ValidateDefaults is the project-wide subset of ValidateOptions a build may set through the `validate`
// plugin / tsconfig object; an empty field means unset, so the call site's value or the built-in default applies.
type ValidateDefaults struct {
	// NumberMode defaults ValidateOptions.numberMode ("" = unset → isFinite).
	NumberMode string
}

// Session owns a Program and answers type queries against it; one shared serializer cache, which survives a
// Program swap, is what keeps dedup ids stable. A Program-less session (NewServer) is valid: setSources
// installs one, and later calls swap it in place.
type Session struct {
	Program      *program.Program
	cache        *runtype.Cache
	checker      *checker.Checker
	releaseLease func()
	sites        []protocol.Site
	marker       marker.Options
	opts         Options
	// inferredConfig is the project tsconfig parsed ONCE per session; nil with the done flag set means none was named.
	// A FAILED parse leaves the done flag unset: the op errors (strict like tsc, CFG001) and the next setSources
	// re-parses, so a fixed config heals without a respawn. Session-lifetime, not reset on a Program swap.
	inferredConfig     *program.InferredConfig
	inferredConfigDone bool
	// configDeclarationRoots is the config's `.d.ts` subset, unioned into every setSources-built Program's roots so
	// ambient declarations nothing imports resolve as in the build lane instead of silently checking as `any`.
	configDeclarationRoots []string
	// pureFnKeys is every pure-fn id seen so far; an id hashes the body that ships, so an edited body arrives as a
	// NEW id and a set is all the change signal needs to be. dispatchScanFiles emits the delta as `AddedPureFns`,
	// which the Vite plugin reads in handleHotUpdate to decide whether the pureFns cache module needs invalidating.
	pureFnKeys map[string]bool
	// scannedFiles lets scanAllProgramFiles skip a file already scanned, which would duplicate entries on sess.sites.
	// Cleared alongside the cache + sites on Rebind / Clear.
	scannedFiles map[string]struct{}
	// pureFnFileCache memoizes per-file pure-fn extraction for the current Program, whose files are immutable, so
	// only never-seen files pay the AST walk on a dump. Dropped on SetProgram / Reset with the Program.
	pureFnFileCache *purefunctions.FileCache
	// pureFnIndex reads the pure fns installed packages ship (built files, or sources for the marker package), for the
	// dep walker and the serve step. Session-lived, rebound per Program: a swap must not re-extract it.
	pureFnIndex *purefnindex.Store
	// Only a package's OWN build may produce its built-in pure-fn bodies, so this is what decides
	// whether collectProgramPureFns applies its built-in filter. Memoised with the Program.
	ownPackageName string
	ownPackageRoot string
	ownPackageDone bool
	// batchFileCache is the `batch([...])` twin of pureFnFileCache, memoised for the current Program and dropped with it.
	batchFileCache *requestbatch.FileCache
	// routerInitFileCache memoises per-file `createMionRouter` detection: the modules the batch import is appended to.
	routerInitFileCache *routerinit.FileCache
	// batchPeer is the SEPARATE program the batch transport is generated from when Options.ClientTsconfig names one;
	// its session stays nil while unbuilt and when the batch source is this program. See rpcgen.go and peerProgram.
	batchPeer peerProgram
	// apiPeer is the SEPARATE program a CLIENT build resolves its API's routes in (the bundleApi lane); same
	// lifecycle as batchPeer. See apigen.go.
	apiPeer peerProgram
	// apiFileCache memoises per-file dispatch-site extraction (the bundleApi lane), dropped with the Program.
	apiFileCache *apimeta.FileCache
	// apiInitFileCache memoises which files call `initClient`, the modules the lane import is appended to.
	apiInitFileCache *apimeta.InitFileCache
	// hasBatchesMemo is the transform's switch for appending the batch import; reset with the Program (own-program
	// case) and whenever the batch source is rebuilt.
	// importsRouterMemo caches whether any own source file names `@mionjs/router` (see rpcgen.go); reset with the Program.
	hasBatchesMemo    *bool
	importsRouterMemo *bool
	// verdictsByChecker memoizes marker.DetectAny, a pure function of (checker, type, opts), by parameter type pointer;
	// the scanner runs it for every parameter of every resolved signature and the same param types repeat constantly.
	// Keyed per pool checker: upstream contract, types from different checkers must never mix. Dies with the Program.
	verdictsByChecker map[*checker.Checker]map[*checker.Type]markerVerdict
	// rtStore is the on-disk RT artifact cache shared by every renderXxxModule call; nil means no cache wired, which
	// is what a resolver built without a CacheDir gets.
	rtStore *diskcache.Store
	// patternSeedBasis records, per (nodeID, pattern source), the mock.seed basis its generated mockSamples pool was
	// built under, so a basis change mid-session regenerates OUR pool and never touches declared samples.
	patternSeedBasis map[string]string

	// idOrigins maps a cache id to the FIRST call site that resolved it (the site whose declared mockSamples pool the
	// shared entry kept, and the site that took the short id), read when a later site disagrees to name both ends of
	// the conflict in FMT006 and MKR014.
	idOrigins map[string]diagnostics.Site
	// patternGenFailures records, per (pattern source \x00 flags), why the enrichment pass could not generate a pool;
	// read at emit time by the pattern emitter's FMT005 lane, which has the demanding call sites for anchoring.
	patternGenFailures map[string]formats.PatternGenFailure
	// overridesBuilt guards the one-time whole-program `overrideX<T>(pureFn)` pass (ensureOverrides), which must run
	// before any AssignID so every id folds the override suffix; reset on SetProgram / Reset.
	overridesBuilt bool
	// overrideEntries holds the cfn pure-fn entries the override pass extracted, one per distinct override body,
	// merged into the pure-fn module emission so the type-fn redirects resolve their dep.
	overrideEntries []purefunctions.Entry
	// overrideDiagnostics holds the override pass's OVR0xx diagnostics (OVR001 duplicate-override, OVR010 validate
	// cross-family), surfaced on every scan response for the current Program.
	overrideDiagnostics []diagnostics.Diagnostic
	// overrideArgSpansByFile records the byte spans of each override call's inline pure-fn argument, which the
	// transform rewrites to `null` because the body lives only in the cfn module; emitted as per-file Replacements.
	overrideArgSpansByFile map[string][]overrideArgSpan
	// unresolvedSpecifiersByFile memoizes, per source file, the module specifiers whose import bindings fail alias
	// resolution. Computed LAZILY, only when a marker site's type argument resolved to `any` (MKR007).
	// Mutex-guarded: the parallel scan path can hit it from several checker groups. Dies with the Program.
	unresolvedSpecifiersByFile map[string][]string
	unresolvedSpecifiersMutex  sync.Mutex
	// programScanDiagnostics keeps the marker diagnostics (MKR/CTA/TMP/PFN…) scanAllProgramFiles produced, which the
	// OpGenerate/OpDump responses surface; without it that eager pass, the only scan most files ever get, would drop
	// them silently. Files are never re-scanned, so each is recorded once. Dies with the Program.
	programScanDiagnostics []diagnostics.Diagnostic
}

// markerVerdict is one memoized marker.DetectAny result; typeArg is the brand's first type argument, nil when unmatched.
type markerVerdict struct {
	kind    marker.Kind
	typeArg *checker.Type
	matched bool
}

// verdictsFor returns the marker-verdict memo for scanChecker, creating it on first use; callers resolve it once
// per scan pass, not per call. NOT safe for concurrent use: a parallel scan pre-creates every group's memo on the
// dispatch goroutine before fanning out.
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

// cacheLocation resolves the RT disk-cache base directory for opts; an empty result means caching is disabled.
func cacheLocation(opts Options, incremental bool) string {
	if opts.CacheDir != "" {
		return opts.CacheDir
	}
	if opts.CacheFollowsIncremental && incremental {
		return filepath.Join(opts.Cwd, "node_modules", ".cache", "mion")
	}
	return ""
}

// newRTStore builds the on-disk store for opts, nil when caching is disabled; centralised so New and NewServer
// fingerprint identically. incremental is the loaded Program's IsIncremental(), false in server mode.
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
		PatternSampleCount:   opts.PatternSampleCount,
		PatternSampleRetries: opts.PatternSampleRetries,
		JSONMaxBytes:         opts.JSONMaxBytes,
	})
	return diskcache.New(baseDir, fp)
}

// binaryStamp identifies THIS build of the resolver executable (mtime + size), so a rebuilt dev binary of the same
// constants.Version moves the disk-cache fingerprint instead of serving the previous build's function bodies.
// `go build` leaves an unchanged binary untouched, so no-op rebuilds keep the cache; empty when unresolvable (WASM).
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

// New builds a Session against prog, defaulting to hashid's own length when HashLength is zero.
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
	// The marker module-of-origin gate must read package.json through the program's (possibly virtual)
	// filesystem, never os.ReadFile — see marker.Options.FS.
	markerOpts.FS = prog.FS
	markerOpts.Cwd = prog.Cwd
	pureFnIndex := purefnindex.NewStore(prog.FS)
	markerOpts.PureFnBindings = pureFnIndex
	cache := runtype.NewCache(typeChecker, runtype.Options{
		HashLength: opts.HashLength,
	})
	cache.SetMarkerOptions(markerOpts)
	sess := &Session{
		Program:             prog,
		cache:               cache,
		checker:             typeChecker,
		releaseLease:        releaseLease,
		marker:              markerOpts,
		opts:                opts,
		pureFnKeys:          map[string]bool{},
		scannedFiles:        map[string]struct{}{},
		pureFnFileCache:     purefunctions.NewFileCache(),
		pureFnIndex:         pureFnIndex,
		batchFileCache:      requestbatch.NewFileCache(),
		apiFileCache:        apimeta.NewFileCache(),
		apiInitFileCache:    apimeta.NewInitFileCache(),
		routerInitFileCache: routerinit.NewFileCache(),
		verdictsByChecker:   map[*checker.Checker]map[*checker.Type]markerVerdict{},
		rtStore:             newRTStore(opts, prog.IsIncremental()),
	}
	sess.bindPureFnIndex()
	return sess, nil
}

// NewServer builds a Session with no Program: the `serve --sources ops` path installs one later via setSources,
// and the cache, created here with a nil checker, is rebound on the first SetProgram.
func NewServer(opts Options) *Session {
	return &Session{
		cache: runtype.NewCache(nil, runtype.Options{
			HashLength: opts.HashLength,
		}),
		marker:              marker.WithDefaults(opts.Marker),
		opts:                opts,
		pureFnKeys:          map[string]bool{},
		scannedFiles:        map[string]struct{}{},
		pureFnFileCache:     purefunctions.NewFileCache(),
		batchFileCache:      requestbatch.NewFileCache(),
		apiFileCache:        apimeta.NewFileCache(),
		apiInitFileCache:    apimeta.NewInitFileCache(),
		routerInitFileCache: routerinit.NewFileCache(),
		verdictsByChecker:   map[*checker.Checker]map[*checker.Type]markerVerdict{},
		// No Program yet, and setSources always builds an inferred non-incremental one, so caching is override-only.
		rtStore: newRTStore(opts, false),
	}
}

// SetProgram swaps the underlying Program and drops the sites, whose positions are tied to the old source text.
// The cache's structural dedup table survives the swap, so equivalent types reuse their ids.
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
	// setSources installs a fresh program + FS each call, so the marker's package.json reads must follow it.
	sess.marker.FS = prog.FS
	sess.marker.Cwd = prog.Cwd
	if sess.pureFnIndex == nil {
		sess.pureFnIndex = purefnindex.NewStore(prog.FS)
	}
	sess.marker.PureFnBindings = sess.pureFnIndex
	sess.checker = typeChecker
	sess.releaseLease = releaseLease
	sess.bindPureFnIndex()
	sess.cache.Rebind(typeChecker)
	sess.cache.SetMarkerOptions(sess.marker)
	sess.sites = sess.sites[:0]
	sess.scannedFiles = map[string]struct{}{}
	sess.pureFnFileCache = purefunctions.NewFileCache()
	sess.batchFileCache = requestbatch.NewFileCache()
	sess.routerInitFileCache = routerinit.NewFileCache()
	sess.apiFileCache = apimeta.NewFileCache()
	sess.hasBatchesMemo = nil
	sess.importsRouterMemo = nil
	sess.ownPackageName, sess.ownPackageRoot, sess.ownPackageDone = "", "", false
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

// bindPureFnIndex hands the index the session's own program and memo, so a package whose sources the program
// already holds (the marker package under the `source` condition) is extracted once: ids that cannot disagree.
func (sess *Session) bindPureFnIndex() {
	sess.pureFnIndex.Bind(sess.Program.FS, purefnindex.Host{
		Program:        sess.Program,
		Checker:        sess.checker,
		MarkerOpts:     sess.marker,
		Cache:          sess.pureFnFileCache,
		SingleThreaded: sess.opts.SingleThreaded,
	})
}

// ownPackage is the package the program's cwd belongs to and its root, both empty for a nameless root.
// Memoised: a build asks per extraction and the cwd cannot move under one Program.
func (sess *Session) ownPackage() (string, string) {
	if sess.ownPackageDone || sess.Program == nil {
		return sess.ownPackageName, sess.ownPackageRoot
	}
	sess.ownPackageName, sess.ownPackageRoot = marker.PackageOfFile(tspath.CombinePaths(sess.Program.Cwd, "package.json"), sess.Program.FS)
	sess.ownPackageDone = true
	return sess.ownPackageName, sess.ownPackageRoot
}

// Reset wipes ALL user-supplied state (interned types, sites, Program, checker lease, and the in-memory source map
// that lives inside the Program): a fresh NewServer without closing the goroutine / connection, and scanFiles needs
// a new setSources afterwards. Lib files stay byte-cached behind cachedvfs and are NOT re-read on the next setSources.
func (sess *Session) Reset() {
	if sess.releaseLease != nil {
		sess.releaseLease()
		sess.releaseLease = nil
	}
	sess.Program = nil
	sess.checker = nil
	sess.pureFnIndex = nil
	sess.marker.PureFnBindings = nil
	sess.cache.Clear()
	sess.cache.Rebind(nil)
	sess.sites = sess.sites[:0]
	sess.pureFnKeys = map[string]bool{}
	sess.scannedFiles = map[string]struct{}{}
	sess.pureFnFileCache = purefunctions.NewFileCache()
	sess.batchFileCache = requestbatch.NewFileCache()
	sess.routerInitFileCache = routerinit.NewFileCache()
	sess.apiFileCache = apimeta.NewFileCache()
	sess.hasBatchesMemo = nil
	sess.importsRouterMemo = nil
	sess.ownPackageName, sess.ownPackageRoot, sess.ownPackageDone = "", "", false
	sess.verdictsByChecker = map[*checker.Checker]map[*checker.Type]markerVerdict{}
	sess.overridesBuilt = false
	sess.overrideEntries = nil
	sess.overrideDiagnostics = nil
	sess.overrideArgSpansByFile = nil
}

func (sess *Session) Close() {
	sess.closeBatchSource()
	sess.apiPeer.close()
	if sess.releaseLease != nil {
		sess.releaseLease()
		sess.releaseLease = nil
	}
}

func (sess *Session) Cache() *runtype.Cache { return sess.cache }

// Checker returns the bound type checker, for the out-of-band enrichment bridge (internal/enrichment) to resolve a
// named type declaration before projecting it through the cache; the hot scan/render path uses the field directly.
func (sess *Session) Checker() *checker.Checker { return sess.checker }

// MarkerOptions returns the session's marker detection options (the accepted marker package set plus the program's
// filesystem), so the out-of-band CLI verbs gate on the SAME configured packages the in-session scan does.
func (sess *Session) MarkerOptions() marker.Options { return sess.marker }

// Sites returns the resolved call-site ids; the CLI and plugin read them at end-of-build to write the manifest.
func (sess *Session) Sites() []protocol.Site {
	return append([]protocol.Site(nil), sess.sites...)
}
