// Package cli is the body of the mion command: it answers compile-time type-reflection queries for
// runtypes. Its mode is the first word (a tsgo-style args[0] subcommand):
//
//	serve      hold a Program + checker in memory and speak newline-delimited
//	           JSON on stdio (the resolver protocol the bundler plugin drives)
//	compile    tsc-like batch compile: transform + emit .js with composed
//	           source maps + generated cache modules to disk (--no-emit: diagnostics only)
//	enrich     scaffold / reconcile / check the enrichment mirror files
//	           (--no-emit: enrichment-health diagnostics only, write nothing)
//
// Shared knobs (--tsconfig, --cwd, --emit-mode, …) mean the same thing under
// every subcommand. cmd/mion is a thin main over Main.
package cli

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"runtime/pprof"
	"slices"
	"strings"
	"sync"

	"github.com/microsoft/typescript-go/shim/tspath"

	// Blank-import the format-emitter aggregator so every concrete
	// format (stringFormat, uuid, …) registers with the formats
	// registry before the resolver starts handing out RunTypes.
	_ "github.com/mionkit/mion/ts-go-runtypes/pkg/cachegen/typefunctions/formats/all"
	"github.com/mionkit/mion/ts-go-runtypes/pkg/compiler/batchcompile"
	"github.com/mionkit/mion/ts-go-runtypes/pkg/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/pkg/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/pkg/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/pkg/constants"
	"github.com/mionkit/mion/ts-go-runtypes/pkg/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/pkg/jsengine"
	"github.com/mionkit/mion/ts-go-runtypes/pkg/protocol"
)

// usageHeader and usageFooter frame the command rows in the top-level help (renderUsage).
const usageHeader = `mion — compile-time type resolver for runtypes

Usage:
    mion <command> [OPTIONS]

Commands:
`

const usageFooter = `
Run  mion <command> -h  for a command's own options.

Shared options (same meaning under every command):
    --tsconfig PATH     tsconfig.json to load (default: discover upward from --cwd)
    --client-routes MODE  route metadata in a client build: bundle (default) | fetch
    --cwd PATH          working directory (default: $PWD)
    --hash-length N     short-id length for type hashes (default 7)
    --emit-mode MODE    fn-entry code/factory slots: code (default) | functions | both | ts
    --inline-mode MODE  child-inlining: default | allInternal
    --module-mode MODE  virtual-module grouping: default | allSingle | allModules
    --number-mode MODE  validate numberMode default: isFinite (default) | typeof | notNaN
    --single-threaded / --no-single-threaded
    --no-parallel-scan / --no-parallel-render
    --js-runtime PATH   JS runtime the pattern checks run on (default: MION_JS_RUNTIME, then node, then bun from PATH)
    --pattern-sample-count N    generated mockSamples per sample-less pattern (default 100; 0 disables)
    --pattern-sample-retries N  per-sample draw multiplier for pattern generation (default 10)
    --pure-fn-report-wire / --pure-fn-report-file
    --json-max-bytes=false      emit no compact-JSON maximum on reflection roots (per-route size limits off; default on)
    --pprof-cpu PATH / --pprof-heap PATH
    -h, --help          show help
    --version           print version (binary + pinned tsgo revision) and exit

The on-disk RT artifact cache (per-(typeID, fnTag) files under
<cwd>/node_modules/.cache/mion/<optsFingerprint>/...) follows TypeScript's
own incremental switch: it is enabled when the loaded tsconfig sets
"incremental" or "composite", and disabled otherwise. The internal MION_CACHE_DIR
environment variable overrides this for tests and direct-binary use: set it to a
path to force the cache on at that location, or to an empty string to force it
off. Binary version is folded into every typeID hash so cross-version files
never collide.
`

// mion's own verbs, rows of the same table extension verbs join: one convention for every mode, like the
// vendored tsgo (cmd/tsgo/main.go switches on args[0]). Each handler owns its own flag.FlagSet.
func init() {
	for _, command := range []Command{
		{Name: "serve", Help: "serve       serve the resolver protocol on stdio (the bundler-plugin path)", Run: runServe},
		{Name: "compile", Help: "compile     tsc-like batch compile: emit .js + generated cache modules to disk (--no-emit: diagnostics only)", Run: runCompile},
		{Name: "enrich", Help: "enrich      scaffold / reconcile / check the enrichment mirror files (--no-emit: diagnostics only)", Run: runEnrich},
		{Name: "convert", Help: "convert     rewrite type declarations between the three authoring forms", Run: runConvert},
		{Name: "drizzle-migrate", Help: "drizzle-migrate  move a drizzle schema onto the slim @mionjs/drizzle-orm-* packages", Run: runDrizzleMigrate},
		{Name: "api-check", Help: "api-check   compare a client build's bundled API manifest against the server build's (a prerelease gate)", Run: runApiCheck},
		{Name: "api-types", Help: "api-types   build a types-only package for an API's clients: trimmed .d.ts, manifest, marker, package.json", Run: runApiTypes},
	} {
		registerCommand(command)
	}
}

// Main runs the mion command line, plus each extension's rows; args excludes the program name.
func Main(args []string, extensions ...Extension) {
	for _, extension := range extensions {
		install(extension)
	}
	usage := renderUsage()
	if len(args) == 0 {
		fmt.Fprint(os.Stderr, usage)
		os.Exit(2)
	}
	switch args[0] {
	case "-h", "--help", "help":
		fmt.Fprint(os.Stdout, usage)
		return
	case "-v", "--version", "version":
		fmt.Println(versionLine(extensions))
		return
	}
	command, ok := commandTable.rows[args[0]]
	if !ok {
		fmt.Fprintf(os.Stderr, "mion: unknown command %q\n\n", args[0])
		fmt.Fprint(os.Stderr, usage)
		os.Exit(2)
	}
	command.Run(args[1:])
}

// SharedFlags are the resolver-configuring knobs common to every Program-building verb,
// registered on each subcommand's own FlagSet by RegisterSharedFlags so a knob
// spells and means the same thing wherever it appears. Each SessionFlags row
// registered for the command rides along.
type SharedFlags struct {
	tsconfig             string
	clientRoutes         string
	cwd                  string
	hashLength           int
	singleThreaded       bool
	noSingleThreaded     bool
	noParallelScan       bool
	noParallelRender     bool
	emitMode             string
	inlineMode           string
	moduleMode           string
	jsRuntime            string
	pureFnReportWire     bool
	pureFnReportFile     bool
	jsonMaxBytes         bool
	numberMode           string
	patternSampleCount   int
	patternSampleRetries int
	maxUnknownKeys       int
	markerPackages       string
	noMarkerPackageCheck bool
	pprofCPU             string
	pprofHeap            string
	// sessionFlags apply the command's SessionFlags rows once the config is resolved.
	sessionFlags []func(cfg *SessionConfig)
}

// RegisterSharedFlags registers the shared knobs and every SessionFlags row for command (built-in or extension).
func RegisterSharedFlags(command string, fs *flag.FlagSet) *SharedFlags {
	s := &SharedFlags{}
	fs.StringVar(&s.tsconfig, "tsconfig", "", "tsconfig.json path (default: discover upward from --cwd, tsc-style)")
	fs.StringVar(&s.clientRoutes, "client-routes", "",
		"how this client gets the metadata + compiled functions of the routes it calls: bundle (a route the build cannot see is fetched only when the client sets up useFetchMetadata) | fetch (every route fetched) (default: the tsconfig clientRoutes plugin key, else bundle)")
	fs.StringVar(&s.cwd, "cwd", "", "working directory (default: $PWD)")
	fs.IntVar(&s.hashLength, "hash-length", 0, "short-id length for type hashes (0 = default 7)")
	fs.BoolVar(&s.singleThreaded, "single-threaded", false, "single-threaded mode (also disables the parallel scan + renders)")
	fs.BoolVar(&s.noSingleThreaded, "no-single-threaded", false,
		"force multi-threaded (the default), overriding a tsconfig singleThreaded:true")
	fs.BoolVar(&s.noParallelScan, "no-parallel-scan", false, "disable the parallel marker scan (parallel is the default)")
	fs.BoolVar(&s.noParallelRender, "no-parallel-render", false, "disable the parallel cache renders (parallel is the default)")
	fs.StringVar(&s.emitMode, "emit-mode", string(constants.EmitCode),
		"what each cache entry ships in its code/factory slots: code (default) | functions | both | ts (both, as typed .ts modules)")
	fs.StringVar(&s.inlineMode, "inline-mode", string(constants.InlineModeDefault),
		"child-inlining policy: default (unnamed compounds inline, named external) | allInternal")
	fs.StringVar(&s.moduleMode, "module-mode", constants.ModuleModeDefault,
		"virtual-module grouping: default | allSingle | allModules")
	fs.StringVar(&s.jsRuntime, "js-runtime", "",
		"JS runtime path the format-pattern checks run on (default: MION_JS_RUNTIME, then node, then bun from PATH; any node-compatible runtime works)")
	fs.BoolVar(&s.pureFnReportWire, "pure-fn-report-wire", false,
		"emit the structured build report (pure fns + request batches) ON THE WIRE (Response.pureFnSites / Response.batchSites) on generate/scan")
	fs.BoolVar(&s.pureFnReportFile, "pure-fn-report-file", false,
		"also write the whole-program reports as JSON to <genDir>/types/pure-fns-report.json and <genDir>/types/batches-report.json")
	fs.BoolVar(&s.jsonMaxBytes, "json-max-bytes", true,
		"emit on every fully bounded reflection root the largest compact-JSON size a valid value can have (per-route size limits); --json-max-bytes=false emits none")
	fs.StringVar(&s.numberMode, "number-mode", "",
		"project-wide default for the validate numberMode option: isFinite (default) | typeof | notNaN")
	fs.IntVar(&s.patternSampleCount, "pattern-sample-count", constants.DefaultPatternSampleCount,
		"generated mockSamples per sample-less format pattern (default 100; 0 disables generation)")
	fs.IntVar(&s.patternSampleRetries, "pattern-sample-retries", constants.DefaultPatternSampleRetries,
		"per-sample draw multiplier for pattern sample generation (whole budget = count × retries; default 10)")
	fs.IntVar(&s.maxUnknownKeys, "max-unknown-keys", constants.DefaultMaxUnknownKeys,
		"unknown-key errors a strict errors fn lists per object before one tooManyUnknownKeys entry (internal; default 10)")
	fs.StringVar(&s.markerPackages, "marker-packages", "",
		"comma-separated `packages` additionally allowed to declare the marker types (InjectRunTypeId, CompTimeArgs, …); @mionjs/run-types is always accepted")
	fs.BoolVar(&s.noMarkerPackageCheck, "no-marker-package-check", false,
		"match markers by type NAME alone, whatever package declared them (escape hatch; a local same-named type then drives rewrites too)")
	fs.StringVar(&s.pprofCPU, "pprof-cpu", "", "write a CPU profile to PATH (whole run)")
	fs.StringVar(&s.pprofHeap, "pprof-heap", "", "write a heap profile to PATH at exit")
	for _, row := range sessionFlagsTable.list() {
		if slices.Contains(row.Commands, command) {
			s.sessionFlags = append(s.sessionFlags, row.Register(fs))
		}
	}
	return s
}

// stopProfiling flushes the profiles startProfiling began. os.Exit skips deferred calls, so exitAfterProfiling
// runs it first: a compile that reports errors still writes its profile.
var stopProfiling = func() {}

// exitAfterProfiling flushes any running profile, then exits with code.
func exitAfterProfiling(code int) {
	stopProfiling()
	os.Exit(code)
}

// startProfiling honors --pprof-cpu / --pprof-heap and returns a stop function
// the caller defers; a no-op when neither flag is set.
func startProfiling(s *SharedFlags) func() {
	var stops []func()
	if s.pprofCPU != "" {
		cpuFile, err := os.Create(s.pprofCPU)
		if err != nil {
			Fatal("pprof-cpu: %v", err)
		}
		if err := pprof.StartCPUProfile(cpuFile); err != nil {
			Fatal("pprof-cpu: %v", err)
		}
		stops = append(stops, func() { pprof.StopCPUProfile(); cpuFile.Close() })
	}
	if s.pprofHeap != "" {
		heapPath := s.pprofHeap
		stops = append(stops, func() {
			heapFile, err := os.Create(heapPath)
			if err != nil {
				fmt.Fprintf(os.Stderr, "pprof-heap: %v\n", err)
				return
			}
			defer heapFile.Close()
			runtime.GC()
			if err := pprof.WriteHeapProfile(heapFile); err != nil {
				fmt.Fprintf(os.Stderr, "pprof-heap: %v\n", err)
			}
		})
	}
	var once sync.Once
	stopProfiling = func() {
		once.Do(func() {
			for i := len(stops) - 1; i >= 0; i-- {
				stops[i]()
			}
		})
	}
	return stopProfiling
}

// SessionConfig is the resolved config + options a Program-building subcommand
// (serve / compile / an extension verb) consumes — the output of the ONE shared config pipeline.
type SessionConfig struct {
	AbsCwd       string
	TsconfigPath string
	GenDir       string // compile's cache-module output root (merged flag > plugin > default)
	Opts         resolver.Options
	// Plugin is the raw `mion` entry of the tsconfig plugins (nil when none), so an extension reads its own keys.
	Plugin map[string]json.RawMessage
}

// resolveCwd resolves the --cwd flag (empty → $PWD) to an absolute path.
func resolveCwd(cwdFlag string) string {
	cwd := cwdFlag
	if cwd == "" {
		d, err := os.Getwd()
		if err != nil {
			Fatal("getwd: %v", err)
		}
		cwd = d
	}
	absCwd, err := filepath.Abs(cwd)
	if err != nil {
		Fatal("abs(cwd): %v", err)
	}
	return absCwd
}

// ResolveSharedConfig is the ONE config pipeline of every Program-building subcommand (flag > plugin > default).
// readBuildPlugin is false for the overlay serve modes (--sources stdin|ops), which skip the tsconfig plugin block.
func ResolveSharedConfig(fs *flag.FlagSet, s *SharedFlags, genDirFlag string, readBuildPlugin bool) SessionConfig {
	absCwd := resolveCwd(s.cwd)
	tsconfigPath := ResolveConfigPath(absCwd, s.tsconfig)

	// Which flags were passed, so the plugin fills only the gaps.
	setFlags := map[string]bool{}
	fs.Visit(func(f *flag.Flag) { setFlags[f.Name] = true })

	var plugin tsRuntypesPlugin
	if readBuildPlugin {
		plugin, _ = resolveBuildPlugin(absCwd, tsconfigPath)
		// A misspelt key is otherwise silently ignored.
		if unknown := unknownPluginKeys(absCwd, tsconfigPath); len(unknown) > 0 {
			fmt.Fprintf(os.Stderr, "mion: ignoring unknown mion plugin key(s) in tsconfig: %v\n", unknown)
		}
	}
	merged := mergeBuildOptions(buildFlags{
		set:                  setFlags,
		hashLength:           s.hashLength,
		singleThreaded:       s.singleThreaded,
		noSingleThreaded:     s.noSingleThreaded,
		noParallelScan:       s.noParallelScan,
		noParallelRender:     s.noParallelRender,
		genDir:               genDirFlag,
		emitMode:             s.emitMode,
		inlineMode:           s.inlineMode,
		moduleMode:           s.moduleMode,
		pureFnReportWire:     s.pureFnReportWire,
		pureFnReportFile:     s.pureFnReportFile,
		jsonMaxBytes:         s.jsonMaxBytes,
		numberMode:           s.numberMode,
		patternSampleCount:   s.patternSampleCount,
		patternSampleRetries: s.patternSampleRetries,
		maxUnknownKeys:       s.maxUnknownKeys,
		markerPackages:       s.markerPackages,
		noMarkerPackageCheck: s.noMarkerPackageCheck,
	}, plugin, absCwd)

	// Checked after the merge: a bad mode can come from tsconfig as readily as from a flag.
	switch merged.moduleMode {
	case constants.ModuleModeDefault, constants.ModuleModeAllSingle, constants.ModuleModeAllModules:
	default:
		Fatal("module-mode: unknown value %q (expected %s | %s | %s)",
			merged.moduleMode, constants.ModuleModeDefault, constants.ModuleModeAllSingle, constants.ModuleModeAllModules)
	}
	if !constants.EmitMode(merged.emitMode).Valid() {
		fmt.Fprintf(os.Stderr, "mion: invalid emit-mode %q (want code | functions | both | ts)\n", merged.emitMode)
		os.Exit(2)
	}
	if !constants.InlineMode(merged.inlineMode).Valid() {
		fmt.Fprintf(os.Stderr, "mion: invalid inline-mode %q (want default | allInternal)\n", merged.inlineMode)
		os.Exit(2)
	}
	switch merged.numberMode {
	case "", constants.NumberModeIsFinite, constants.NumberModeTypeof, constants.NumberModeNotNaN:
	default:
		fmt.Fprintf(os.Stderr, "mion: invalid number-mode %q (want isFinite | typeof | notNaN)\n", merged.numberMode)
		os.Exit(2)
	}
	if merged.patternSampleCount < 0 {
		fmt.Fprintf(os.Stderr, "mion: invalid pattern-sample-count %d (want >= 0; 0 disables generation)\n", merged.patternSampleCount)
		os.Exit(2)
	}
	if merged.patternSampleRetries < 1 {
		fmt.Fprintf(os.Stderr, "mion: invalid pattern-sample-retries %d (want >= 1)\n", merged.patternSampleRetries)
		os.Exit(2)
	}
	if merged.maxUnknownKeys < 1 {
		fmt.Fprintf(os.Stderr, "mion: invalid max-unknown-keys %d (want >= 1)\n", merged.maxUnknownKeys)
		os.Exit(2)
	}

	// MION_CACHE_DIR is the only cache control: unset follows incremental/composite, a path forces on, "" forces off.
	cacheDirOverride, cacheDirSet := os.LookupEnv("MION_CACHE_DIR")

	// The raw tsconfig genDir keeps the build lane's resolveOutDir in step with the CLI lanes; unset keeps <srcDir>/.mion.
	tsconfigGenDir := strings.TrimSpace(plugin.GenDir)
	if tsconfigGenDir != "" && !filepath.IsAbs(tsconfigGenDir) {
		tsconfigGenDir = filepath.Join(absCwd, tsconfigGenDir)
	}

	// Validated after the merge, like the other modes.
	clientRoutes, ok := resolveClientRoutes(s.clientRoutes, plugin.ClientRoutes)
	if !ok {
		fmt.Fprintf(os.Stderr, "mion: invalid client-routes %q (want bundle | fetch)\n", string(clientRoutes))
		os.Exit(2)
	}

	opts := resolver.Options{
		HashLength: merged.hashLength,
		Marker: marker.Options{
			Packages:         merged.markerPackages,
			SkipPackageCheck: merged.skipMarkerPackageCheck,
		},
		Cwd:                     absCwd,
		TsconfigPath:            tsconfigPath,
		TsconfigGenDir:          tsconfigGenDir,
		ClientRoutes:            clientRoutes,
		TsconfigDowngradeErrors: plugin.DowngradeErrors,
		TsconfigLevels:          plugin.Levels,
		TsconfigLogStyle:        plugin.LogStyle,
		EnrichSourceLocale:      pluginI18nSourceLocale(plugin),
		EnrichLocales:           pluginI18nLocales(plugin),
		SingleThreaded:          merged.singleThreaded,
		DisableParallelScan:     merged.disableParallelScan,
		DisableParallelRender:   merged.disableParallelRender,
		CacheDir:                normalizeCacheDir(cacheDirOverride, absCwd),
		CacheFollowsIncremental: !cacheDirSet,
		EmitMode:                constants.EmitMode(merged.emitMode),
		InlineMode:              constants.InlineMode(merged.inlineMode),
		ModuleMode:              merged.moduleMode,
		// --js-runtime, else MION_JS_RUNTIME, else node/bun from PATH; lazy, so pattern-free projects need none.
		JSEngine:             jsengine.NewSidecar(s.jsRuntime),
		PureFnReportWire:     merged.pureFnReportWire,
		PureFnReportFile:     merged.pureFnReportFile,
		JSONMaxBytes:         merged.jsonMaxBytes,
		ValidateDefaults:     resolver.ValidateDefaults{NumberMode: merged.numberMode},
		PatternSampleCount:   merged.patternSampleCount,
		PatternSampleRetries: merged.patternSampleRetries,
		MaxUnknownKeys:       merged.maxUnknownKeys,
	}
	cfg := SessionConfig{AbsCwd: absCwd, TsconfigPath: tsconfigPath, GenDir: merged.genDir, Opts: opts}
	// The overlay serve modes read no build options, but an extension may still need its own keys.
	cfg.Plugin, _, _ = ReadPlugin(tsconfigPath)
	for _, apply := range s.sessionFlags {
		apply(&cfg)
	}
	return cfg
}

// printUsage renders a subcommand's help: its synopsis, then EVERY flag it
// accepts (its own + the shared knobs registered on the same FlagSet) with a
// one-line description — so each `mion <cmd> -h` is self-documenting and
// can never drift from the registered flags. Like flag.PrintDefaults but with
// the `--name` convention the synopsis and docs use (Go accepts both -x / --x).
func PrintUsage(fs *flag.FlagSet, synopsis string) {
	fmt.Fprint(os.Stderr, synopsis)
	fmt.Fprintln(os.Stderr, "\nFlags:")
	fs.VisitAll(func(f *flag.Flag) {
		typeName, usage := flag.UnquoteUsage(f)
		label := "  --" + f.Name
		if typeName != "" {
			label += " " + typeName
		}
		fmt.Fprintf(os.Stderr, "%s\n    \t%s\n", label, usage)
	})
}

const serveUsage = `mion serve — serve the resolver protocol on stdio

Usage:
    mion serve [--sources project|stdin|ops] [OPTIONS]

Holds a Program + checker in memory and speaks newline-delimited JSON on stdio
(the resolver protocol the bundler plugin drives). --sources selects where the
startup Program comes from: project (build from the tsconfig file list, the
default), stdin (a {"sources":{…}} handshake line, one inferred Program), or ops
(no startup Program; the client drives setSources / scanFiles / dump).
`

// runServe serves the resolver protocol on stdio. The startup Program source is
// selected by --sources (project | stdin | ops), collapsing the former default /
// --inline-sources-stdin / --inline-server modes into one command.
func runServe(args []string) {
	fs := flag.NewFlagSet("serve", flag.ExitOnError)
	s := RegisterSharedFlags("serve", fs)
	sources := fs.String("sources", "project", "startup Program source: project | stdin | ops")
	outJSON := fs.String("out-json", "", "after stdin EOF, write the cache as JSON to PATH")
	outModules := fs.String("out-modules", "", "after stdin EOF, write per-entry virtual modules to DIR")
	// Session config the wire deliberately does NOT carry (the wire carries
	// events — which files, which op; the session carries config). --gen-dir is
	// the explicit output-root override (the host plugin's genDir option); the
	// --enrich-* flags are the `enrich` SessionFlags row (enrich_cli.go).
	genDirFlag := fs.String("gen-dir", "", "RunTypes output root override (precedence: this flag > tsconfig genDir > inferred <srcDir>/.mion)")
	transformRelative := fs.Bool("transform-relative", false,
		"transform rewrites injected rtmod: specifiers to paths relative to the output root (files mode); off keeps the virtual specifiers")
	omitSourcesContent := fs.Bool("omit-sources-content", false,
		"drop the original source from each 'go'-mode transform source map (the host fills it from its own copy)")
	fs.Usage = func() { PrintUsage(fs, serveUsage) }
	_ = fs.Parse(args)

	switch *sources {
	case "project", "stdin", "ops":
	default:
		Fatal("serve: unknown --sources %q (want project | stdin | ops)", *sources)
	}

	defer startProfiling(s)()

	// Only the on-disk project mode merges the tsconfig plugin block; the
	// overlay modes (stdin/ops) have no on-disk build options to honor.
	cfg := ResolveSharedConfig(fs, s, "", *sources == "project")
	// The linter's ops mode takes `downgradeErrors`, so the editor lowers the same codes the build does.
	if *sources == "ops" {
		if plugin, found := resolveBuildPlugin(cfg.AbsCwd, cfg.TsconfigPath); found {
			cfg.Opts.TsconfigDowngradeErrors = plugin.DowngradeErrors
		}
	}

	// Apply the serve-local session config onto the resolved Options.
	if *genDirFlag != "" {
		genDir := *genDirFlag
		if !filepath.IsAbs(genDir) {
			genDir = filepath.Join(cfg.AbsCwd, genDir)
		}
		cfg.Opts.GenDir = genDir
	}
	cfg.Opts.TransformRelative = *transformRelative
	cfg.Opts.OmitSourcesContent = *omitSourcesContent

	// Stdin decoder built up front because --sources stdin consumes one
	// handshake line BEFORE constructing the Program, then keeps the same
	// decoder for the request loop so any bytes buffered past the handshake
	// aren't lost. Stdout is buffered (flushed once per response).
	stdinDec := json.NewDecoder(bufio.NewReader(os.Stdin))
	stdoutBuf := bufio.NewWriter(os.Stdout)
	stdoutEnc := json.NewEncoder(stdoutBuf)

	r, err := newStdioSession(*sources, cfg, stdinDec)
	if err != nil {
		Fatal("%v", err)
	}
	defer r.Close()

	serveRequests(r.Dispatch, stdinDec, stdoutEnc, stdoutBuf.Flush)

	// Optional file outputs after stdin is drained. Both share one resolver
	// state so file emissions are consistent with the JSON already sent.
	if *outJSON != "" {
		dump := protocol.Dump{RunTypes: r.Cache().Dump(), Sites: r.Sites()}
		if err := writeFile(*outJSON, dump.WriteJSON); err != nil {
			Fatal("out-json: %v", err)
		}
	}
	if *outModules != "" {
		// Re-dispatch a dump so the modules flow through the same pipeline
		// (cross-family fixpoint, cascade, stubs) the wire response uses.
		response := r.Dispatch(protocol.Request{Op: protocol.OpDump})
		if response.Error != "" {
			Fatal("out-modules: %s", response.Error)
		}
		for basename, source := range response.EntryModules {
			target := filepath.Join(*outModules, basename+".js")
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				Fatal("out-modules: %v", err)
			}
			if err := os.WriteFile(target, []byte(source), 0o644); err != nil {
				Fatal("out-modules: %v", err)
			}
		}
	}
}

// newStdioSession builds the resolver Session for a serve run, keyed on the
// --sources mode. project builds a Program from the tsconfig's own file list;
// stdin builds an inferred Program from a one-shot handshake overlay; ops starts
// with no Program (the client installs one via setSources).
func newStdioSession(sources string, cfg SessionConfig, stdinDec *json.Decoder) (*resolver.Session, error) {
	switch sources {
	case "ops":
		// Persistent server mode: no startup Program. resolver.NewServer cannot
		// fail (no checker lease yet).
		return resolver.NewServer(cfg.Opts), nil

	case "stdin":
		var handshake struct {
			Sources map[string]string `json:"sources"`
		}
		if err := stdinDec.Decode(&handshake); err != nil {
			return nil, fmt.Errorf("inline-sources handshake decode: %w", err)
		}
		overlay := make(map[string]string, len(handshake.Sources))
		fileNames := make([]string, 0, len(handshake.Sources))
		for rel, content := range handshake.Sources {
			abs := tspath.ResolvePath(tspath.NormalizePath(cfg.AbsCwd), rel)
			overlay[abs] = content
			fileNames = append(fileNames, abs)
		}
		// Same tsconfig contract as every lane: parse the ONE resolved path once
		// and adopt the full options wholesale, so the one-shot type-checks
		// exactly like a build. Strict like tsc — a broken resolved config is
		// fatal; only no-config-anywhere falls back to the inferred defaults.
		inferredConfig, err := program.ParseInferredConfig(cfg.AbsCwd, cfg.TsconfigPath)
		if err != nil {
			return nil, fmt.Errorf("tsconfig: %w", err)
		}
		// Root the config's declaration files too (same rule as the daemon's
		// setSources): ambient `.d.ts` members of the include set are what tsc
		// sees without an import and a handshake-rooted program would lose.
		fileNames = program.UnionRoots(fileNames, inferredConfig.DeclarationFileNames())
		p, err := program.NewInferred(program.Options{
			Cwd:            cfg.AbsCwd,
			SingleThreaded: cfg.Opts.SingleThreaded,
			Overlay:        overlay,
			Config:         inferredConfig,
		}, fileNames)
		if err != nil {
			return nil, fmt.Errorf("program (inferred): %w", err)
		}
		return resolver.New(p, cfg.Opts)

	default: // "project"
		// This lane builds the Program from the config's own file list, so a
		// config must exist — the same refusal tsc gives when discovery finds
		// nothing.
		if cfg.TsconfigPath == "" {
			return nil, fmt.Errorf("no tsconfig.json found searching upward from %s (tsc-style discovery) — pass --tsconfig", cfg.AbsCwd)
		}
		p, err := program.New(program.Options{
			Cwd:            cfg.AbsCwd,
			TsconfigPath:   cfg.TsconfigPath,
			SingleThreaded: cfg.Opts.SingleThreaded,
		})
		if err != nil {
			return nil, fmt.Errorf("program: %w", err)
		}
		return resolver.New(p, cfg.Opts)
	}
}

const compileUsage = `mion compile — tsc-like batch compile

Usage:
    mion compile [--gen-dir DIR] [--no-emit] [OPTIONS]

Transforms every marker file, emits .js via tsgo with source maps composed back
to the ORIGINAL source, and writes the generated cache modules to disk. Emits to
the tsconfig outDir; requires a tsconfig; no stdio protocol.

Reports TypeScript's own errors like tsc and exits 1 on any; noEmitOnError in
the tsconfig then writes nothing.

--no-emit runs the type check, the scan and the RunType-family diagnostics
only and writes nothing (tsc --noEmit-style).

--list-files-only prints the tsconfig's root files, one absolute path per line,
and builds nothing (tsc --listFilesOnly-style, roots only).

--emit-mode ts writes TypeScript instead: every source under the project root,
call sites rewritten, to the outDir, importing typed .ts cache modules, for a
TypeScript-to-native compiler to build.
`

// runCompile is the tsc-like batch build: it runs the two-pass transform, tsgo emit and map composition itself.
func runCompile(args []string) {
	fs := flag.NewFlagSet("compile", flag.ExitOnError)
	s := RegisterSharedFlags("compile", fs)
	genDir := fs.String("gen-dir", "",
		"where compile writes the generated cache modules (default <cwd>/.mion; also the tsconfig \"genDir\" plugin key, flag overrides it)")
	noEmit := fs.Bool("no-emit", false,
		"report the RunType-family diagnostics without writing (tsc --noEmit-style): scan only, emit no .js and no cache modules")
	listFilesOnly := fs.Bool("list-files-only", false,
		"print the tsconfig's root files, one absolute path per line, and build nothing")
	logStyle := registerLogStyleFlag(fs)
	fs.Usage = func() { PrintUsage(fs, compileUsage) }
	_ = fs.Parse(args)

	defer startProfiling(s)()

	cfg := ResolveSharedConfig(fs, s, *genDir, true)
	if cfg.TsconfigPath == "" {
		Fatal("compile: no tsconfig.json found searching upward from %s (tsc-style discovery) — pass --tsconfig", cfg.AbsCwd)
	}
	if *listFilesOnly {
		if err := listRootFiles(cfg.AbsCwd, cfg.TsconfigPath, os.Stdout); err != nil {
			Fatal("compile: %v", err)
		}
		return
	}
	grouped := resolveLogStyle("compile", *logStyle, cfg)

	compileResult, compileErr := batchcompile.Run(batchcompile.Options{
		Cwd:          cfg.AbsCwd,
		TsconfigPath: cfg.TsconfigPath,
		// The flag wins over the tsconfig `genDir`, which wins over <cwd>/.mion.
		GenDir:       cfg.GenDir,
		ResolverOpts: cfg.Opts,
		NoEmit:       *noEmit,
	})
	if compileErr != nil {
		Fatal("compile: %v", compileErr)
	}
	errorCount := printBuildDiagnostics("compile", cfg, compileResult, grouped)
	if *noEmit {
		fmt.Fprintf(os.Stderr, "mion: checked %d file(s), wrote nothing (--no-emit)\n", compileResult.CheckedFiles)
	} else {
		fmt.Fprintf(os.Stderr, "mion: compiled %d file(s), %d cache module(s)\n",
			len(compileResult.EmittedFiles), len(compileResult.Caches))
	}
	if errorCount > 0 {
		exitAfterProfiling(1)
	}
}

// listRootFiles writes the tsconfig's root file names, the list a build tool turns into its entries.
func listRootFiles(cwd, tsconfigPath string, out io.Writer) error {
	config, err := program.ParseInferredConfig(cwd, tsconfigPath)
	if err != nil {
		return err
	}
	for _, fileName := range config.FileNames() {
		if _, err := fmt.Fprintln(out, fileName); err != nil {
			return err
		}
	}
	return nil
}

func registerLogStyleFlag(fs *flag.FlagSet) *string {
	return fs.String("log-style", "",
		"how diagnostics print: \"grouped\" (default) groups them by name, \"lines\" prints one line each (also the tsconfig \"logStyle\" plugin key, flag overrides it)")
}

// resolveLogStyle picks the flag over the tsconfig `logStyle` and stops the run on an unknown value.
func resolveLogStyle(command, flagValue string, cfg SessionConfig) bool {
	value := cfg.Opts.TsconfigLogStyle
	if flagValue != "" {
		value = flagValue
	}
	grouped, err := diagnostics.ResolveLogStyle(value)
	if err != nil {
		Fatal(command+": %v", err)
	}
	return grouped
}

// printBuildDiagnostics prints a compile run's diagnostics the way a bundler build does and returns the error count.
func printBuildDiagnostics(command string, cfg SessionConfig, compileResult *batchcompile.Result, grouped bool) int {
	// Same tsconfig `downgradeErrors` as a bundler build, so the CLI grows no flag of its own.
	downgrade, downgradeErr := diagnostics.ResolveDowngrade(cfg.Opts.TsconfigDowngradeErrors)
	if downgradeErr != nil {
		Fatal(command+": %v", downgradeErr)
	}
	showInfo, levelsErr := diagnostics.ResolveLevels(cfg.Opts.TsconfigLevels)
	if levelsErr != nil {
		Fatal(command+": %v", levelsErr)
	}
	var entries []diagnostics.GroupedEntry
	// TypeScript errors fail the build as in tsc; downgradeErrors and levels never apply to them.
	if grouped {
		entries = append(entries, compileResult.TypeEntries...)
	} else {
		for _, line := range compileResult.TypeDiagnostics {
			fmt.Fprintln(os.Stderr, line)
		}
	}
	errorCount := compileResult.TypeErrorCount
	// Each whole-program op runs the `@mion-expect-error` unused check, so without Dedupe it reports once per pass.
	for _, d := range diagnostics.Dedupe(compileResult.Diagnostics) {
		if !diagnostics.Shown(d, showInfo) {
			continue
		}
		// The note keeps a downgraded error from reading as a plain warning; d.Downgraded is the `@mion-downgrade-error` comment.
		downgraded := d.Downgraded || downgrade.Downgraded(d)
		if grouped {
			entries = append(entries, diagnostics.EntryOf(d, downgraded))
		} else {
			fmt.Fprintln(os.Stderr, diagnostics.Format(d, downgraded))
		}
		if !downgraded && d.Severity == diagnostics.SeverityError {
			errorCount++
		}
	}
	if len(entries) > 0 {
		fmt.Fprintln(os.Stderr, diagnostics.FormatGrouped(entries, cfg.AbsCwd))
	}
	return errorCount
}

// serveRequests drains the request stream, dispatching each and encoding the
// response. flush runs after every response so the buffered writer's bytes reach
// the client before the next read blocks.
func serveRequests(dispatch func(protocol.Request) protocol.Response, dec *json.Decoder, enc *json.Encoder, flush func() error) {
	for {
		var req protocol.Request
		if err := dec.Decode(&req); err != nil {
			if err == io.EOF {
				break
			}
			_ = enc.Encode(protocol.Response{Error: fmt.Sprintf("decode: %v", err)})
			_ = flush()
			continue
		}
		resp := dispatch(req)
		if err := enc.Encode(resp); err != nil {
			Fatal("encode: %v", err)
		}
		if err := flush(); err != nil {
			Fatal("flush: %v", err)
		}
	}
}

func writeFile(path string, fn func(io.Writer) error) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	bw := bufio.NewWriter(f)
	if err := fn(bw); err != nil {
		return err
	}
	return bw.Flush()
}

func Fatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	exitAfterProfiling(1)
}
