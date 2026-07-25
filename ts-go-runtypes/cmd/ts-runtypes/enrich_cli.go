package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/enrichment"
	"github.com/mionkit/ts-runtypes/internal/enrichment/enrichgen"
	"github.com/mionkit/ts-runtypes/internal/enrichment/mirror"
)

// The describe / gen / check handlers below are registered in main.go's
// top-level `commands` table (one args[0] dispatch convention for every mode).

// buildProgram constructs an inferred Program + resolver over absPath. The
// caller owns the resolver and MUST call res.Close() when done (it keeps the
// checker live for as long as the walk needs it). Used by the enrich lanes, which
// walk the file's AST against the still-open checker.
//
// parsed is the run's ONE resolved config (nil = none). Its full options — module
// resolution conditions INCLUDED — are adopted wholesale, so enrich resolves
// exactly like a build (a project opts into its in-tree src by putting
// customConditions:["source"] in its tsconfig; enrich never forces it). hashLength
// rides into the resolver so enrich's hash-sensitive @rtType ids match a build's.
func buildProgram(absPath string, parsed *program.InferredConfig, hashLength int) (*program.Program, *resolver.Session, error) {
	cwd := filepath.Dir(absPath)
	prog, err := program.NewInferred(program.Options{Cwd: cwd, Config: parsed}, []string{absPath})
	if err != nil {
		return nil, nil, fmt.Errorf("build program: %w", err)
	}
	res, err := resolver.New(prog, resolver.Options{Cwd: cwd, HashLength: hashLength})
	if err != nil {
		return nil, nil, fmt.Errorf("build resolver: %w", err)
	}
	return prog, res, nil
}

// buildProgramMulti constructs ONE inferred Program + resolver over several
// files — the batch `enrich --files` path and the multi-mirror check path. Cwd is
// the first file's directory. Caller owns res and MUST Close() it. One Program
// means the heavy parse/bind is paid once for the whole batch; each file's target
// resolves against it. parsed / hashLength: same contract as buildProgram.
func buildProgramMulti(absPaths []string, parsed *program.InferredConfig, hashLength int) (*program.Program, *resolver.Session, error) {
	if len(absPaths) == 0 {
		return nil, nil, fmt.Errorf("no files given")
	}
	cwd := filepath.Dir(absPaths[0])
	prog, err := program.NewInferred(program.Options{Cwd: cwd, Config: parsed}, absPaths)
	if err != nil {
		return nil, nil, fmt.Errorf("build program: %w", err)
	}
	res, err := resolver.New(prog, resolver.Options{Cwd: cwd, HashLength: hashLength})
	if err != nil {
		return nil, nil, fmt.Errorf("build resolver: %w", err)
	}
	return prog, res, nil
}

// runEnrich is the enrichment verb — the ONE mirror-maintenance command, folding
// the former gen + check verbs together. It owns the grammar: a scaffold target
// (<file> <Type>, or a --prune / --translate write flag) WRITES; --no-emit turns
// any write lane into a diagnostics-only pass (tsc --noEmit-style); and a
// check-only target (a bare file, a dir, or no positional) REQUIRES --no-emit,
// which also disambiguates a <file> given without a <Type> to scaffold.
func runEnrich(args []string) {
	fs := flag.NewFlagSet("enrich", flag.ExitOnError)
	mock := fs.Bool("mock", false, "emit a MockData<T> skeleton")
	friendly := fs.Bool("friendly", false, "emit a FriendlyText<T> skeleton")
	out := fs.String("out", "", "explicit single mirror file path (overrides the computed mirror path; forces a single file)")
	genDirFlag := fs.String("gen-dir", "", "RunTypes output root override (precedence: this flag > tsconfig genDir > default __runtypes); mirrors live under <genDir>/enriched")
	files := fs.String("files", "", "batch mode: comma-separated files; resolve --type in each, print JSON skeletons to stdout (no writes)")
	typeFlag := fs.String("type", "", "batch mode: the type name to resolve in every --files entry")
	update := fs.Bool("update", false, "reconcile an existing committed mirror file against the freshly regenerated desired set (property merge, never clobbers values)")
	prune := fs.Bool("prune", false, "destructive: remove every comment block/line tagged @rtOrphan / @rtOrphanChild (with --no-emit: list them, delete nothing)")
	i18n := fs.String("i18n", "", "manage the per-locale translation mirror files for a locale tag (or 'all' for every tsconfig i18n.locales entry): bare = create, --update = sync, --prune = strip carcasses, --no-emit = completeness gate")
	tsconfigFlag := fs.String("tsconfig", "", "project tsconfig path (default: found like tsc, searching upward from the working directory)")
	asJSON := fs.Bool("json", false, "emit check diagnostics as a JSON array (the check-only / --no-emit lanes)")
	noEmit := fs.Bool("no-emit", false, "report diagnostics without writing (tsc --noEmit-style); REQUIRED to enter a check-only target (a bare file, a dir, or no positional)")
	requireComplete := fs.Bool("require-complete", false, "completeness gate: also FAIL on INCOMPLETE enrichment (unfilled @todo scaffolds, missing/out-of-date translations), not just wrong/stale content; implies --no-emit (never writes)")
	fs.Usage = func() {
		printUsage(fs, `ts-runtypes enrich — scaffold / reconcile / check the enrichment mirror files

Usage:
    ts-runtypes enrich <file.ts> <TypeName> [--mock] [--friendly] [--gen-dir <dir>] [--out <path>]
       or: ts-runtypes enrich <file.ts> <TypeName> --update                    (reconcile an existing mirror)
       or: ts-runtypes enrich --prune [<mirror-file-or-dir>]                    (strip @rtOrphan carcasses)
       or: ts-runtypes enrich --files a.ts,b.ts --type Target                   (batch, JSON to stdout)
       or: ts-runtypes enrich --i18n <locale> [--update|--prune] [<src>]        (per-locale translation mirrors)
       or: ts-runtypes enrich <file.ts> --no-emit                               (single-file health, no writes)
       or: ts-runtypes enrich [<dir>] --no-emit                                 (mirror-tree drift, no writes)
       or: ts-runtypes enrich <file.ts> --require-complete                      (health + completeness gate, no writes)

--no-emit turns any write lane into a diagnostics-only pass — nothing is written.
--no-emit reports wrong/stale content (fails) AND unfilled @todo scaffolds (does NOT fail).
--require-complete adds the @todo / missing-translation blanks to the failing set (implies --no-emit).
`)
	}
	positional, flags := splitArgs(args)
	if err := fs.Parse(flags); err != nil {
		fatal("enrich: %v", err)
	}

	// --require-complete is a check modifier: it never writes (implies --no-emit)
	// and additionally fails on the completeness tier. checkOnly is the effective
	// "diagnostics-only, no writes" signal every lane reads.
	checkOnly := *noEmit || *requireComplete

	// --i18n is its own lane: the desired side is the friendly source mirror, never
	// the type graph — so it excludes the type-driven modes. A check flag runs the
	// i18n completeness gate instead of writing.
	if *i18n != "" {
		if *files != "" || *mock || *friendly || *out != "" {
			fatal("enrich: --i18n can only combine with --update / --prune / --gen-dir / --no-emit / --require-complete")
		}
		if checkOnly {
			runCheckTranslate(*i18n, *genDirFlag, *tsconfigFlag, *requireComplete)
		} else {
			runGenTranslate(*i18n, positional, *update, *prune, *genDirFlag, *tsconfigFlag)
		}
		return
	}

	// --prune is the standalone carcass sweep (destructive), or a list-only report
	// under --no-emit. It excludes the type-driven modes.
	if *prune {
		if *files != "" {
			fatal("enrich: --prune cannot be combined with --files")
		}
		if *update {
			fatal("enrich: --prune cannot be combined with --update")
		}
		runEnrichPrune(positional, *genDirFlag, *tsconfigFlag, checkOnly)
		return
	}

	// --files batch: JSON skeletons to stdout, never writes.
	if *files != "" {
		if *typeFlag == "" {
			fatal("enrich --files: --type is required")
		}
		runGenBatch(strings.Split(*files, ","), *typeFlag, *tsconfigFlag)
		return
	}

	// A <file> <Type> pair is a scaffold target: it writes (or, under a check flag,
	// reports the target's mirror diagnostics without writing).
	if len(positional) >= 2 {
		runEnrichScaffold(positional[0], positional[1], *mock, *friendly, *out, *update, *genDirFlag, *tsconfigFlag, *asJSON, checkOnly, *requireComplete)
		return
	}

	// A bare file / dir / no positional is a check-only target — it REQUIRES a check
	// flag (--no-emit or --require-complete), which also disambiguates a <file> given
	// without a <Type> to scaffold.
	if !checkOnly {
		if len(positional) == 1 {
			fatal("enrich: %s: provide a Type to scaffold (enrich <file> <Type>), or --no-emit to check the file", positional[0])
		}
		fs.Usage()
		os.Exit(2)
	}
	if len(positional) == 1 && !isDirArg(positional[0]) {
		runSingleFileCheck(positional[0], *tsconfigFlag, *asJSON, *requireComplete)
		return
	}
	runGenCheck(positional, *genDirFlag, *asJSON, *requireComplete, *tsconfigFlag)
}

// runEnrichScaffold is the `enrich <file> <Type>` write lane: resolve the type,
// plan the mirror specs via the shared enrichgen.Plan, write (or reconcile) each
// mirror, then run the shared health pass over the resulting mirrors and emit its
// diagnostics — the freshly-scaffolded @todo worklist, in the same pass. Under a
// check flag (checkOnly) it writes nothing and reports the target mirrors'
// diagnostics only; requireComplete additionally fails on the completeness tier.
func runEnrichScaffold(srcArg, typeName string, mock, friendly bool, out string, update bool, genDirFlag, tsconfigFlag string, asJSON, checkOnly, requireComplete bool) {
	absPath := tspath.NormalizePath(mustAbs(srcArg))

	// Default (no flag): emit BOTH friendly + mock.
	wantFriendly, wantMock := friendly, mock
	if !wantFriendly && !wantMock {
		wantFriendly, wantMock = true, true
	}

	tsconfigPath, parsed := resolveEnrichProject(tsconfigFlag)
	config := resolveEnrichConfig(absPath, genDirFlag, tsconfigPath, parsed)

	// Self-document the genDir tree when actually writing: the root + enriched
	// READMEs (shared with the generate lane) and a README in each family dir.
	if !checkOnly {
		genRoot := config.GenDir()
		_ = resolver.EnsureOutputHygiene(genRoot, filepath.Join(genRoot, "types"))
		for _, family := range enrichgen.WantedFamilies(mock, friendly) {
			ensureFamilyReadme(config, family)
		}
	}

	// Named-type-driven emission runs through the SHARED planner (enrichgen.Plan)
	// so the CLI and the OpEnrich daemon op compute byte-identical mirror specs.
	prog, res, err := buildProgram(absPath, config.Parsed, config.HashLength)
	if err != nil {
		fatal("enrich: %v", err)
	}
	outPath := ""
	if out != "" {
		outPath = tspath.NormalizePath(mustAbs(out))
	}
	specs, declFiles, planErr := enrichgen.Plan(prog, res.Checker(), res.Cache(), absPath, typeName, outPath, wantFriendly, wantMock, config)
	// Release the source Program before the post-write health pass builds its own.
	res.Close()
	if planErr != nil {
		fatal("enrich: %v", planErr)
	}

	mirrorPaths := make([]string, 0, len(specs))
	for _, spec := range specs {
		mirrorPaths = append(mirrorPaths, spec.MirrorPath)
	}

	// Check flag: report the target mirrors' health, write nothing.
	if checkOnly {
		os.Exit(reportEnrichDiagnostics(checkMirrorFilesDiagnostics(mirrorPaths, config.Parsed, config.HashLength), asJSON, requireComplete))
	}

	// Write lane: migrate any pre-split combined mirror (CLI-only disk pre-step),
	// then write / reconcile each family mirror.
	if outPath == "" {
		for _, declFile := range declFiles {
			migrateLegacyMirror(config, declFile)
		}
	}
	written := 0
	for _, spec := range specs {
		var wrote bool
		if update {
			wrote = updateMirrorFile(spec)
		} else {
			wrote = writeMirrorFile(spec)
		}
		if wrote {
			written++
		}
	}
	if written == 0 {
		fmt.Printf("enrich: nothing to write — mirror file(s) already have the requested export(s)\n")
	}

	// "In one pass": surface the freshly-scaffolded @todo worklist (FT020/MD020) on
	// stderr via the text-only hygiene scan (no second Program, so no dependency on
	// resolving the mirror imports). The scaffold SUCCEEDED — its @todo placeholders
	// are the expected state, so the write lane exits 0; the gate that FAILS on
	// unfilled @todos is `enrich <file> --no-emit`.
	printEnrichWorklist(scaffoldWorklist(specs))
	os.Exit(0)
}

// The spec planner (groupSpecs), the family list (wantedFamilies), and the
// closure grouping (declFileGroup / groupByDeclFile) moved into
// internal/enrichment/enrichgen (BuildSpecs / WantedFamilies / DeclFileGroup /
// GroupByDeclFile) so the OpEnrich daemon op shares them. writeMirrorFile /
// updateMirrorFile stay here as the CLI's disk shims around mirror.Scaffold /
// mirror.Reconcile; migrateLegacyMirror stays as the CLI-only migration pre-step.

// writeMirrorFile emits (or appends to) one mirror file for a single source
// file's consts. It returns true when it wrote anything, false when every
// requested export was already present (create-only skip). It is the thin CLI
// shim around mirror.Scaffold: it reads the existing file, delegates the pure
// content build, then creates parent dirs + writes. Parent dirs are created as
// needed.
func writeMirrorFile(spec mirror.Spec) bool {
	existing := ""
	if bytes, err := os.ReadFile(spec.MirrorPath); err == nil {
		existing = string(bytes)
	} else if !os.IsNotExist(err) {
		fatal("enrich: read %s: %v", spec.MirrorPath, err)
	}

	content, added, err := mirror.Scaffold(spec, existing)
	if err != nil {
		fatal("enrich: %v", err)
	}
	if content == "" {
		return false // create-only no-op: every requested export already present
	}

	if err := os.MkdirAll(filepath.Dir(spec.MirrorPath), 0o755); err != nil {
		fatal("enrich: mkdir %s: %v", filepath.Dir(spec.MirrorPath), err)
	}
	if err := os.WriteFile(spec.MirrorPath, []byte(content), 0o644); err != nil {
		fatal("enrich: write %s: %v", spec.MirrorPath, err)
	}
	verb := "wrote"
	if existing != "" {
		verb = "appended to"
	}
	fmt.Printf("enrich: %s %s (%s)\n", verb, spec.MirrorPath, strings.Join(added, ", "))
	return true
}

// runGenBatch is the `gen --files a.ts,b.ts --type Target` path: ONE Program over
// all files, resolve typeName per file, and print a JSON map
// { <basename-without-ext> → {friendly, mock} } of object-literal skeletons. No
// files are written. Used by the enrichment generation test harness.
func runGenBatch(files []string, typeName, tsconfigFlag string) {
	absPaths := make([]string, 0, len(files))
	for _, file := range files {
		trimmed := strings.TrimSpace(file)
		if trimmed == "" {
			continue
		}
		absPaths = append(absPaths, tspath.NormalizePath(mustAbs(trimmed)))
	}
	if len(absPaths) == 0 {
		fatal("enrich --files: no files given")
	}
	tsconfigPath, parsed := resolveEnrichProject(tsconfigFlag)
	// The batch skeletons are structural previews (no committed @rtType ids), but
	// thread the project hashLength anyway so a future hash-bearing skeleton stays
	// build-consistent; resolveEnrichConfig anchors on the first file.
	config := resolveEnrichConfig(absPaths[0], "", tsconfigPath, parsed)
	prog, res, err := buildProgramMulti(absPaths, parsed, config.HashLength)
	if err != nil {
		fatal("enrich --files: %v", err)
	}
	defer res.Close()

	type skeletons struct {
		Friendly string `json:"friendly"`
		Mock     string `json:"mock"`
	}
	out := make(map[string]skeletons, len(absPaths))
	for _, absPath := range absPaths {
		resolved, err := enrichment.ResolveType(prog, res.Checker(), res.Cache(), absPath, typeName)
		if err != nil {
			fatal("enrich --files: %s: %v", absPath, err)
		}
		key := strings.TrimSuffix(filepath.Base(absPath), filepath.Ext(absPath))
		out[key] = skeletons{
			Friendly: enrichment.FriendlySkeleton(resolved.Node, resolved.Resolve),
			Mock:     enrichment.MockSkeleton(resolved.Node, resolved.Resolve),
		}
	}
	encoded, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		fatal("enrich --files: encode json: %v", err)
	}
	fmt.Println(string(encoded))
	os.Exit(0)
}

// valueFlags are the enrichment flags that consume the following token as
// their value when written space-separated (e.g. `--gen-dir dir`). Boolean
// flags (--mock, --friendly, --json) are absent here.
var valueFlags = map[string]bool{
	"--out": true, "-out": true,
	"--files": true, "-files": true,
	"--type": true, "-type": true,
	"--gen-dir": true, "-gen-dir": true,
	"--i18n": true, "-i18n": true,
	"--tsconfig": true, "-tsconfig": true,
}

// splitArgs separates positional arguments from flag tokens so flags may appear
// before, after, or interspersed with the positional <file> <TypeName> pair —
// Go's flag package otherwise stops at the first positional. A `-`-prefixed
// token is a flag; if it's a known value-flag without an inline `=value`, the
// next token is pulled along as its value.
func splitArgs(args []string) (positional, flags []string) {
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if arg == "--" {
			positional = append(positional, args[i+1:]...)
			break
		}
		if strings.HasPrefix(arg, "-") && arg != "-" {
			flags = append(flags, arg)
			if !strings.Contains(arg, "=") && valueFlags[arg] && i+1 < len(args) {
				i++
				flags = append(flags, args[i])
			}
			continue
		}
		positional = append(positional, arg)
	}
	return positional, flags
}

// mustAbs resolves path to an absolute path, exiting on failure.
func mustAbs(path string) string {
	abs, err := filepath.Abs(path)
	if err != nil {
		fatal("resolve path %q: %v", path, err)
	}
	return abs
}
