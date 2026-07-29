// Command ts-runtypes answers compile-time type-reflection queries for
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
// every subcommand.
package main

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
	"strings"

	"github.com/microsoft/typescript-go/shim/tspath"

	// Blank-import the format-emitter aggregator so every concrete
	// format (stringFormat, uuid, …) registers with the formats
	// registry before the resolver starts handing out RunTypes.
	_ "github.com/mionkit/ts-runtypes/internal/cachegen/typefunctions/formats/all"
	"github.com/mionkit/ts-runtypes/internal/compiler/batchcompile"
	"github.com/mionkit/ts-runtypes/internal/compiler/marker"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/constants"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/jsengine"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

const usage = `ts-runtypes — compile-time type resolver for runtypes

Usage:
    ts-runtypes <command> [OPTIONS]

Commands:
    serve       serve the resolver protocol on stdio (the bundler-plugin path)
    compile     tsc-like batch compile: emit .js + generated cache modules to disk (--no-emit: diagnostics only)
    enrich      scaffold / reconcile / check the enrichment mirror files (--no-emit: diagnostics only)

Run  ts-runtypes <command> -h  for a command's own options.

Shared options (same meaning under every command):
    --tsconfig PATH     tsconfig.json to load (default: discover upward from --cwd)
    --cwd PATH          working directory (default: $PWD)
    --hash-length N     short-id length for type hashes (default 7)
    --emit-mode MODE    fn-entry code/factory slots: code (default) | functions | both
    --inline-mode MODE  child-inlining: default | allInternal
    --module-mode MODE  virtual-module grouping: default | allSingle | allModules
    --number-mode MODE  validate numberMode default: isFinite (default) | typeof | notNaN
    --single-threaded / --no-single-threaded
    --no-parallel-scan / --no-parallel-render
    --size-bias / --size-items / --size-string-bytes / --size-max-bytes
    --js-runtime PATH   node/bun the pattern checks run on (default: RT_JS_RUNTIME, then node, then bun from PATH)
    --pure-fn-report-wire / --pure-fn-report-file
    --pprof-cpu PATH / --pprof-heap PATH
    -h, --help          show help
    --version           print version (binary + pinned tsgo revision) and exit

The on-disk RT artifact cache (per-(typeID, fnTag) files under
<cwd>/node_modules/.cache/ts-runtypes/<optsFingerprint>/...) follows TypeScript's
own incremental switch: it is enabled when the loaded tsconfig sets
"incremental" or "composite", and disabled otherwise. The internal RT_CACHE_DIR
environment variable overrides this for tests and direct-binary use: set it to a
path to force the cache on at that location, or to an empty string to force it
off. Binary version is folded into every typeID hash so cross-version files
never collide.
`

// commands is the top-level args[0] dispatch table — one convention for every
// mode, like the vendored tsgo (cmd/tsgo/main.go switches on args[0]). Each
// handler owns its own flag.FlagSet.
var commands = map[string]func(args []string){
	"serve":   runServe,
	"compile": runCompile,
	"enrich":  runEnrich,
}

func main() {
	args := os.Args[1:]
	if len(args) == 0 {
		fmt.Fprint(os.Stderr, usage)
		os.Exit(2)
	}
	switch args[0] {
	case "-h", "--help", "help":
		fmt.Fprint(os.Stdout, usage)
		return
	case "-v", "--version", "version":
		fmt.Printf("ts-runtypes %s (tsgo %s)\n", constants.Version, constants.TsgoVersion)
		return
	}
	run, ok := commands[args[0]]
	if !ok {
		fmt.Fprintf(os.Stderr, "ts-runtypes: unknown command %q\n\n", args[0])
		fmt.Fprint(os.Stderr, usage)
		os.Exit(2)
	}
	run(args[1:])
}

// sharedFlags are the resolver-configuring knobs common to serve + compile,
// registered on each subcommand's own FlagSet by registerSharedFlags so a knob
// spells and means the same thing wherever it appears.
type sharedFlags struct {
	tsconfig         string
	cwd              string
	hashLength       int
	singleThreaded   bool
	noSingleThreaded bool
	noParallelScan   bool
	noParallelRender bool
	emitMode         string
	inlineMode       string
	moduleMode       string
	jsRuntime        string
	pureFnReportWire bool
	pureFnReportFile bool
	sizeBias         float64
	sizeItems        int
	sizeStringBytes  int
	sizeMaxBytes     int
	numberMode       string
	pprofCPU         string
	pprofHeap        string
}

func registerSharedFlags(fs *flag.FlagSet) *sharedFlags {
	s := &sharedFlags{}
	fs.StringVar(&s.tsconfig, "tsconfig", "", "tsconfig.json path (default: discover upward from --cwd, tsc-style)")
	fs.StringVar(&s.cwd, "cwd", "", "working directory (default: $PWD)")
	fs.IntVar(&s.hashLength, "hash-length", 0, "short-id length for type hashes (0 = default 7)")
	fs.BoolVar(&s.singleThreaded, "single-threaded", false, "single-threaded mode (also disables the parallel scan + renders)")
	fs.BoolVar(&s.noSingleThreaded, "no-single-threaded", false,
		"force multi-threaded (the default), overriding a tsconfig singleThreaded:true")
	fs.BoolVar(&s.noParallelScan, "no-parallel-scan", false, "disable the parallel marker scan (parallel is the default)")
	fs.BoolVar(&s.noParallelRender, "no-parallel-render", false, "disable the parallel cache renders (parallel is the default)")
	fs.StringVar(&s.emitMode, "emit-mode", string(constants.EmitCode),
		"what each cache entry ships in its code/factory slots: code (default) | functions | both")
	fs.StringVar(&s.inlineMode, "inline-mode", string(constants.InlineModeDefault),
		"child-inlining policy: default (unnamed compounds inline, named external) | allInternal")
	fs.StringVar(&s.moduleMode, "module-mode", constants.ModuleModeDefault,
		"virtual-module grouping: default | allSingle | allModules")
	fs.StringVar(&s.jsRuntime, "js-runtime", "",
		"JS runtime (node/bun path) the format-pattern checks run on (default: RT_JS_RUNTIME, then node, then bun from PATH)")
	fs.BoolVar(&s.pureFnReportWire, "pure-fn-report-wire", false,
		"emit the structured pure-fn build report ON THE WIRE (Response.pureFnSites) on generate/scan")
	fs.BoolVar(&s.pureFnReportFile, "pure-fn-report-file", false,
		"also write the whole-program pure-fn report as JSON to <genDir>/types/pure-fns-report.json")
	fs.Float64Var(&s.sizeBias, "size-bias", constants.DefaultSizeBias,
		"binary `dynamic` cold-start size bias in [0,1]: 0 = tightest, 1 = most generous (default 0.8)")
	fs.IntVar(&s.sizeItems, "size-items", constants.DefaultSizeItems,
		"assumed element count for an unbounded collection in the binary cold-start estimate (default 100)")
	fs.IntVar(&s.sizeStringBytes, "size-string-bytes", constants.DefaultSizeStringBytes,
		"assumed UTF-8 byte length of an unbounded string in the binary cold-start estimate (default 32)")
	fs.IntVar(&s.sizeMaxBytes, "size-max-bytes", constants.DefaultSizeMaxBytes,
		"per-type cap on the binary cold-start estimate (default 65536)")
	fs.StringVar(&s.numberMode, "number-mode", "",
		"project-wide default for the validate numberMode option: isFinite (default) | typeof | notNaN")
	fs.StringVar(&s.pprofCPU, "pprof-cpu", "", "write a CPU profile to PATH (whole run)")
	fs.StringVar(&s.pprofHeap, "pprof-heap", "", "write a heap profile to PATH at exit")
	return s
}

// startProfiling honors --pprof-cpu / --pprof-heap and returns a stop function
// the caller defers; a no-op when neither flag is set.
func startProfiling(s *sharedFlags) func() {
	var stops []func()
	if s.pprofCPU != "" {
		cpuFile, err := os.Create(s.pprofCPU)
		if err != nil {
			fatal("pprof-cpu: %v", err)
		}
		if err := pprof.StartCPUProfile(cpuFile); err != nil {
			fatal("pprof-cpu: %v", err)
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
	return func() {
		for i := len(stops) - 1; i >= 0; i-- {
			stops[i]()
		}
	}
}

// sessionConfig is the resolved config + options a Program-building subcommand
// (serve / compile) consumes — the output of the ONE shared config pipeline.
type sessionConfig struct {
	absCwd       string
	tsconfigPath string
	genDir       string // compile's cache-module output root (merged flag > plugin > default)
	opts         resolver.Options
}

// resolveCwd resolves the --cwd flag (empty → $PWD) to an absolute path.
func resolveCwd(cwdFlag string) string {
	cwd := cwdFlag
	if cwd == "" {
		d, err := os.Getwd()
		if err != nil {
			fatal("getwd: %v", err)
		}
		cwd = d
	}
	absCwd, err := filepath.Abs(cwd)
	if err != nil {
		fatal("abs(cwd): %v", err)
	}
	return absCwd
}

// resolveSharedConfig runs the ONE config+options pipeline for a Program-building
// subcommand: resolve cwd, resolve the ONE tsconfig (resolveConfigPath — the
// single policy), read the build plugin when readBuildPlugin, merge flags over
// the plugin over the binary defaults (tsc precedence), validate, and build
// resolver.Options. genDirFlag is compile's --gen-dir (serve passes ""), and
// readBuildPlugin is the old hasTsconfig gate: the overlay serve modes
// (--sources stdin|ops) do not merge the tsconfig plugin block.
func resolveSharedConfig(fs *flag.FlagSet, s *sharedFlags, genDirFlag string, readBuildPlugin bool) sessionConfig {
	absCwd := resolveCwd(s.cwd)
	tsconfigPath := resolveConfigPath(absCwd, s.tsconfig)

	// Which flags the user actually passed, so the merge can tell an explicit
	// value from an absent flag (tsc precedence — the plugin fills only gaps).
	setFlags := map[string]bool{}
	fs.Visit(func(f *flag.Flag) { setFlags[f.Name] = true })

	var plugin tsRuntypesPlugin
	if readBuildPlugin {
		plugin, _ = resolveBuildPlugin(absCwd, tsconfigPath)
		// A misspelt key is otherwise silently ignored; warn on stderr.
		if unknown := unknownPluginKeys(absCwd, tsconfigPath); len(unknown) > 0 {
			fmt.Fprintf(os.Stderr, "ts-runtypes: ignoring unknown ts-runtypes plugin key(s) in tsconfig: %v\n", unknown)
		}
	}
	merged := mergeBuildOptions(buildFlags{
		set:              setFlags,
		hashLength:       s.hashLength,
		singleThreaded:   s.singleThreaded,
		noSingleThreaded: s.noSingleThreaded,
		noParallelScan:   s.noParallelScan,
		noParallelRender: s.noParallelRender,
		genDir:           genDirFlag,
		emitMode:         s.emitMode,
		inlineMode:       s.inlineMode,
		moduleMode:       s.moduleMode,
		pureFnReportWire: s.pureFnReportWire,
		pureFnReportFile: s.pureFnReportFile,
		sizeBias:         s.sizeBias,
		sizeItems:        s.sizeItems,
		sizeStringBytes:  s.sizeStringBytes,
		sizeMaxBytes:     s.sizeMaxBytes,
		numberMode:       s.numberMode,
	}, plugin, absCwd)

	// Validate the MERGED values: a bad mode can arrive from tsconfig as
	// readily as from a flag, so the check sits after the merge.
	switch merged.moduleMode {
	case constants.ModuleModeDefault, constants.ModuleModeAllSingle, constants.ModuleModeAllModules:
	default:
		fatal("module-mode: unknown value %q (expected %s | %s | %s)",
			merged.moduleMode, constants.ModuleModeDefault, constants.ModuleModeAllSingle, constants.ModuleModeAllModules)
	}
	if !constants.EmitMode(merged.emitMode).Valid() {
		fmt.Fprintf(os.Stderr, "ts-runtypes: invalid emit-mode %q (want code | functions | both)\n", merged.emitMode)
		os.Exit(2)
	}
	if !constants.InlineMode(merged.inlineMode).Valid() {
		fmt.Fprintf(os.Stderr, "ts-runtypes: invalid inline-mode %q (want default | allInternal)\n", merged.inlineMode)
		os.Exit(2)
	}
	switch merged.numberMode {
	case "", constants.NumberModeIsFinite, constants.NumberModeTypeof, constants.NumberModeNotNaN:
	default:
		fmt.Fprintf(os.Stderr, "ts-runtypes: invalid number-mode %q (want isFinite | typeof | notNaN)\n", merged.numberMode)
		os.Exit(2)
	}

	// RT disk cache: the internal RT_CACHE_DIR env var is the only control.
	// Unset → the cache follows the project's incremental/composite setting; set
	// to a path → force on there; set to "" → force off.
	cacheDirOverride, cacheDirSet := os.LookupEnv("RT_CACHE_DIR")

	// tsconfig `genDir` (raw, pre-default) rides into the resolver so the build
	// lane's resolveOutDir agrees with the CLI lanes; when unset the resolver
	// keeps its <srcDir>/__runtypes inference.
	tsconfigGenDir := strings.TrimSpace(plugin.GenDir)
	if tsconfigGenDir != "" && !filepath.IsAbs(tsconfigGenDir) {
		tsconfigGenDir = filepath.Join(absCwd, tsconfigGenDir)
	}

	opts := resolver.Options{
		HashLength:              merged.hashLength,
		Marker:                  marker.Options{},
		Cwd:                     absCwd,
		TsconfigPath:            tsconfigPath,
		TsconfigGenDir:          tsconfigGenDir,
		TsconfigFailOnError:     plugin.FailOnError,
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
		// The JS engine pattern checks run on: --js-runtime, else
		// RT_JS_RUNTIME, else node/bun from PATH — resolved lazily on first
		// use, so pattern-free projects never need a runtime.
		JSEngine:         jsengine.NewSidecar(s.jsRuntime),
		PureFnReportWire: merged.pureFnReportWire,
		PureFnReportFile: merged.pureFnReportFile,
		SizeBias:         merged.sizeBias,
		SizeItems:        merged.sizeItems,
		SizeStringBytes:  merged.sizeStringBytes,
		SizeMaxBytes:     merged.sizeMaxBytes,
		ValidateDefaults: resolver.ValidateDefaults{NumberMode: merged.numberMode},
	}
	return sessionConfig{absCwd: absCwd, tsconfigPath: tsconfigPath, genDir: merged.genDir, opts: opts}
}

// pluginI18nSourceLocale / pluginI18nLocales project the tsconfig plugin's i18n
// block onto the resolver Options defaults (project serve mode); the serve
// --enrich-locales / --enrich-source-locale flags override them.
func pluginI18nSourceLocale(plugin tsRuntypesPlugin) string {
	if plugin.I18n == nil {
		return ""
	}
	return plugin.I18n.SourceLocale
}

func pluginI18nLocales(plugin tsRuntypesPlugin) []string {
	if plugin.I18n == nil {
		return nil
	}
	return plugin.I18n.Locales
}

// printUsage renders a subcommand's help: its synopsis, then EVERY flag it
// accepts (its own + the shared knobs registered on the same FlagSet) with a
// one-line description — so each `ts-runtypes <cmd> -h` is self-documenting and
// can never drift from the registered flags. Like flag.PrintDefaults but with
// the `--name` convention the synopsis and docs use (Go accepts both -x / --x).
func printUsage(fs *flag.FlagSet, synopsis string) {
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

const serveUsage = `ts-runtypes serve — serve the resolver protocol on stdio

Usage:
    ts-runtypes serve [--sources project|stdin|ops] [OPTIONS]

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
	s := registerSharedFlags(fs)
	sources := fs.String("sources", "project", "startup Program source: project | stdin | ops")
	outJSON := fs.String("out-json", "", "after stdin EOF, write the cache as JSON to PATH")
	outModules := fs.String("out-modules", "", "after stdin EOF, write per-entry virtual modules to DIR")
	// Session config the wire deliberately does NOT carry (the wire carries
	// events — which files, which op; the session carries config). --gen-dir is
	// the explicit output-root override (the host plugin's genDir option); the
	// --enrich-* flags configure OpEnrich: the families to maintain, and the
	// per-locale translation-mirror sync whose locales/sourceLocale default from
	// the tsconfig plugin i18n block (project mode) unless overridden here.
	genDirFlag := fs.String("gen-dir", "", "RunTypes output root override (precedence: this flag > tsconfig genDir > inferred <srcDir>/__runtypes)")
	enrichFriendly := fs.Bool("enrich-friendly", false, "OpEnrich maintains the FriendlyText mirrors (neither family flag = both)")
	enrichMock := fs.Bool("enrich-mock", false, "OpEnrich maintains the MockData mirrors (neither family flag = both)")
	enrichI18n := fs.Bool("enrich-i18n", false, "OpEnrich also syncs the per-locale translation mirrors (scaffold + sync only, never translated content)")
	enrichLocales := fs.String("enrich-locales", "", "comma-separated target locales for --enrich-i18n (default: the tsconfig i18n.locales)")
	enrichSourceLocale := fs.String("enrich-source-locale", "", "authoring locale of the source FriendlyText mirrors (default: the tsconfig i18n.sourceLocale)")
	fs.Usage = func() { printUsage(fs, serveUsage) }
	_ = fs.Parse(args)

	switch *sources {
	case "project", "stdin", "ops":
	default:
		fatal("serve: unknown --sources %q (want project | stdin | ops)", *sources)
	}

	defer startProfiling(s)()

	// Only the on-disk project mode merges the tsconfig plugin block; the
	// overlay modes (stdin/ops) have no on-disk build options to honor.
	cfg := resolveSharedConfig(fs, s, "", *sources == "project")

	// Apply the serve-local session config onto the resolved Options: the
	// explicit flags win over the tsconfig-seeded defaults resolveSharedConfig
	// already folded in (i18n locales/sourceLocale).
	if *genDirFlag != "" {
		genDir := *genDirFlag
		if !filepath.IsAbs(genDir) {
			genDir = filepath.Join(cfg.absCwd, genDir)
		}
		cfg.opts.GenDir = genDir
	}
	cfg.opts.EnrichFriendly = *enrichFriendly
	cfg.opts.EnrichMock = *enrichMock
	cfg.opts.EnrichI18n = *enrichI18n
	if *enrichLocales != "" {
		var locales []string
		for _, locale := range strings.Split(*enrichLocales, ",") {
			if trimmed := strings.TrimSpace(locale); trimmed != "" {
				locales = append(locales, trimmed)
			}
		}
		cfg.opts.EnrichLocales = locales
	}
	if *enrichSourceLocale != "" {
		cfg.opts.EnrichSourceLocale = *enrichSourceLocale
	}

	// Stdin decoder built up front because --sources stdin consumes one
	// handshake line BEFORE constructing the Program, then keeps the same
	// decoder for the request loop so any bytes buffered past the handshake
	// aren't lost. Stdout is buffered (flushed once per response).
	stdinDec := json.NewDecoder(bufio.NewReader(os.Stdin))
	stdoutBuf := bufio.NewWriter(os.Stdout)
	stdoutEnc := json.NewEncoder(stdoutBuf)

	r, err := newStdioSession(*sources, cfg, stdinDec)
	if err != nil {
		fatal("%v", err)
	}
	defer r.Close()

	serveRequests(r.Dispatch, stdinDec, stdoutEnc, stdoutBuf.Flush)

	// Optional file outputs after stdin is drained. Both share one resolver
	// state so file emissions are consistent with the JSON already sent.
	if *outJSON != "" {
		dump := protocol.Dump{RunTypes: r.Cache().Dump(), Sites: r.Sites()}
		if err := writeFile(*outJSON, dump.WriteJSON); err != nil {
			fatal("out-json: %v", err)
		}
	}
	if *outModules != "" {
		// Re-dispatch a dump so the modules flow through the same pipeline
		// (cross-family fixpoint, cascade, stubs) the wire response uses.
		response := r.Dispatch(protocol.Request{Op: protocol.OpDump})
		if response.Error != "" {
			fatal("out-modules: %s", response.Error)
		}
		for basename, source := range response.EntryModules {
			target := filepath.Join(*outModules, basename+".js")
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				fatal("out-modules: %v", err)
			}
			if err := os.WriteFile(target, []byte(source), 0o644); err != nil {
				fatal("out-modules: %v", err)
			}
		}
	}
}

// newStdioSession builds the resolver Session for a serve run, keyed on the
// --sources mode. project builds a Program from the tsconfig's own file list;
// stdin builds an inferred Program from a one-shot handshake overlay; ops starts
// with no Program (the client installs one via setSources).
func newStdioSession(sources string, cfg sessionConfig, stdinDec *json.Decoder) (*resolver.Session, error) {
	switch sources {
	case "ops":
		// Persistent server mode: no startup Program. resolver.NewServer cannot
		// fail (no checker lease yet).
		return resolver.NewServer(cfg.opts), nil

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
			abs := tspath.ResolvePath(tspath.NormalizePath(cfg.absCwd), rel)
			overlay[abs] = content
			fileNames = append(fileNames, abs)
		}
		// Same tsconfig contract as every lane: parse the ONE resolved path once
		// and adopt the full options wholesale, so the one-shot type-checks
		// exactly like a build. Strict like tsc — a broken resolved config is
		// fatal; only no-config-anywhere falls back to the inferred defaults.
		inferredConfig, err := program.ParseInferredConfig(cfg.absCwd, cfg.tsconfigPath)
		if err != nil {
			return nil, fmt.Errorf("tsconfig: %w", err)
		}
		p, err := program.NewInferred(program.Options{
			Cwd:            cfg.absCwd,
			SingleThreaded: cfg.opts.SingleThreaded,
			Overlay:        overlay,
			Config:         inferredConfig,
		}, fileNames)
		if err != nil {
			return nil, fmt.Errorf("program (inferred): %w", err)
		}
		return resolver.New(p, cfg.opts)

	default: // "project"
		// This lane builds the Program from the config's own file list, so a
		// config must exist — the same refusal tsc gives when discovery finds
		// nothing.
		if cfg.tsconfigPath == "" {
			return nil, fmt.Errorf("no tsconfig.json found searching upward from %s (tsc-style discovery) — pass --tsconfig", cfg.absCwd)
		}
		p, err := program.New(program.Options{
			Cwd:            cfg.absCwd,
			TsconfigPath:   cfg.tsconfigPath,
			SingleThreaded: cfg.opts.SingleThreaded,
		})
		if err != nil {
			return nil, fmt.Errorf("program: %w", err)
		}
		return resolver.New(p, cfg.opts)
	}
}

const compileUsage = `ts-runtypes compile — tsc-like batch compile

Usage:
    ts-runtypes compile [--gen-dir DIR] [--no-emit] [OPTIONS]

Transforms every marker file, emits .js via tsgo with source maps composed back
to the ORIGINAL source, and writes the generated cache modules to disk. Emits to
the tsconfig outDir; requires a tsconfig; no stdio protocol.

--no-emit runs the scan + RunType-family diagnostics only and writes nothing
(tsc --noEmit-style).
`

// runCompile is the tsc-like batch build: it drives the two-pass transform +
// tsgo emit + map composition itself and returns. Requires a tsconfig.
func runCompile(args []string) {
	fs := flag.NewFlagSet("compile", flag.ExitOnError)
	s := registerSharedFlags(fs)
	genDir := fs.String("gen-dir", "",
		"where compile writes the generated cache modules (default <cwd>/__runtypes; also the tsconfig \"genDir\" plugin key, flag overrides it)")
	noEmit := fs.Bool("no-emit", false,
		"report the RunType-family diagnostics without writing (tsc --noEmit-style): scan only, emit no .js and no cache modules")
	fs.Usage = func() { printUsage(fs, compileUsage) }
	_ = fs.Parse(args)

	defer startProfiling(s)()

	cfg := resolveSharedConfig(fs, s, *genDir, true)
	if cfg.tsconfigPath == "" {
		fatal("compile: no tsconfig.json found searching upward from %s (tsc-style discovery) — pass --tsconfig", cfg.absCwd)
	}

	compileResult, compileErr := batchcompile.Run(batchcompile.Options{
		Cwd:          cfg.absCwd,
		TsconfigPath: cfg.tsconfigPath,
		// cfg.genDir layers the flag over the tsconfig `genDir` entry over the
		// <cwd>/__runtypes default.
		GenDir:       cfg.genDir,
		ResolverOpts: cfg.opts,
		NoEmit:       *noEmit,
	})
	if compileErr != nil {
		fatal("compile: %v", compileErr)
	}
	errorCount := 0
	for _, d := range compileResult.Diagnostics {
		fmt.Fprintln(os.Stderr, diagnostics.FormatDebug(d))
		if d.Severity == diagnostics.SeverityError {
			errorCount++
		}
	}
	if *noEmit {
		fmt.Fprintf(os.Stderr, "ts-runtypes: checked %d file(s), wrote nothing (--no-emit)\n", len(compileResult.Diagnostics))
	} else {
		fmt.Fprintf(os.Stderr, "ts-runtypes: compiled %d file(s), %d cache module(s)\n",
			len(compileResult.EmittedFiles), len(compileResult.Caches))
	}
	if errorCount > 0 {
		os.Exit(1)
	}
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
			fatal("encode: %v", err)
		}
		if err := flush(); err != nil {
			fatal("flush: %v", err)
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

func fatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
