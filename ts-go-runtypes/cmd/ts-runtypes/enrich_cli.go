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
	"github.com/mionkit/ts-runtypes/internal/enrichment/mirror"
)

// The describe / gen / check handlers below are registered in main.go's
// top-level `commands` table (one args[0] dispatch convention for every mode).

// buildProgram constructs an inferred Program + resolver over absPath. The
// caller owns the resolver and MUST call res.Close() when done (it keeps the
// checker live for as long as the walk needs it). Shared by resolveOne and the
// check command, which walks the file's AST against the still-open checker.
//
// parsed is the run's ONE resolved config (nil = none), parsed once by
// resolveEnrichProject with the "source" condition folded in so `ts-runtypes`
// resolves to its in-tree src. Its full options are adopted wholesale. When nil
// (no config anywhere) the "source" condition still applies via the inferred
// fallback below.
func buildProgram(absPath string, parsed *program.InferredConfig) (*program.Program, *resolver.Session, error) {
	cwd := filepath.Dir(absPath)
	prog, err := program.NewInferred(program.Options{Cwd: cwd, Conditions: []string{"source"}, Config: parsed}, []string{absPath})
	if err != nil {
		return nil, nil, fmt.Errorf("build program: %w", err)
	}
	res, err := resolver.New(prog, resolver.Options{Cwd: cwd})
	if err != nil {
		return nil, nil, fmt.Errorf("build resolver: %w", err)
	}
	return prog, res, nil
}

// buildProgramMulti constructs ONE inferred Program + resolver over several
// files — the batch `gen --files` path. Cwd is the first file's directory.
// Caller owns res and MUST Close() it. One Program means the heavy parse/bind
// is paid once for the whole batch; each file's `Target` resolves against it.
// parsed: same contract as buildProgram.
func buildProgramMulti(absPaths []string, parsed *program.InferredConfig) (*program.Program, *resolver.Session, error) {
	if len(absPaths) == 0 {
		return nil, nil, fmt.Errorf("no files given")
	}
	cwd := filepath.Dir(absPaths[0])
	prog, err := program.NewInferred(program.Options{Cwd: cwd, Conditions: []string{"source"}, Config: parsed}, absPaths)
	if err != nil {
		return nil, nil, fmt.Errorf("build program: %w", err)
	}
	res, err := resolver.New(prog, resolver.Options{Cwd: cwd})
	if err != nil {
		return nil, nil, fmt.Errorf("build resolver: %w", err)
	}
	return prog, res, nil
}

// resolveOne builds a Program over absPath, a resolver, and resolves typeName
// to its canonical RunType. Shared by describe + gen.
func resolveOne(absPath, typeName string, parsed *program.InferredConfig) (*enrichment.Resolved, error) {
	prog, res, err := buildProgram(absPath, parsed)
	if err != nil {
		return nil, err
	}
	defer res.Close()
	return enrichment.ResolveType(prog, res.Checker(), res.Cache(), absPath, typeName)
}

func runDescribe(args []string) {
	fs := flag.NewFlagSet("describe", flag.ExitOnError)
	asJSON := fs.Bool("json", false, "emit the description as JSON instead of text")
	tsconfigFlag := fs.String("tsconfig", "", "project tsconfig path (default: found like tsc, searching upward from the working directory)")
	fs.Usage = func() {
		printUsage(fs, `ts-runtypes describe — print a type's shape as agent/LLM prompt context

Usage:
    ts-runtypes describe <file.ts> <TypeName> [OPTIONS]

Renders the type as an indented tree (fields, kinds, optionality, format
constraints). This is the INPUT type shape, not the FriendlyText enrichment.
`)
	}
	positional, flags := splitArgs(args)
	if err := fs.Parse(flags); err != nil {
		fatal("describe: %v", err)
	}
	if len(positional) < 2 {
		fs.Usage()
		os.Exit(2)
	}
	absPath := tspath.NormalizePath(mustAbs(positional[0]))
	typeName := positional[1]

	_, parsed := resolveEnrichProject(*tsconfigFlag)
	resolved, err := resolveOne(absPath, typeName, parsed)
	if err != nil {
		fatal("describe: %v", err)
	}

	description := enrichment.Describe(resolved.Node, enrichment.DescribeOptions{
		TypeName: typeName,
		Resolve:  resolved.Resolve,
	})

	if *asJSON {
		payload := map[string]string{"typeName": typeName, "description": description}
		encoded, err := json.MarshalIndent(payload, "", "  ")
		if err != nil {
			fatal("describe: encode json: %v", err)
		}
		fmt.Println(string(encoded))
	} else {
		fmt.Println(description)
	}
	os.Exit(0)
}

func runGen(args []string) {
	fs := flag.NewFlagSet("gen", flag.ExitOnError)
	mock := fs.Bool("mock", false, "emit a MockData<T> skeleton")
	friendly := fs.Bool("friendly", false, "emit a FriendlyText<T> skeleton")
	out := fs.String("out", "", "explicit single mirror file path (overrides the computed mirror path; forces a single file)")
	genDirFlag := fs.String("gen-dir", "", "RunTypes output root override (precedence: this flag > tsconfig genDir > default __runtypes); mirrors live under <genDir>/enriched")
	files := fs.String("files", "", "batch mode: comma-separated files; resolve --type in each, print JSON skeletons to stdout (no writes)")
	typeFlag := fs.String("type", "", "batch mode: the type name to resolve in every --files entry")
	update := fs.Bool("update", false, "reconcile an existing committed mirror file against the freshly regenerated desired set (property merge, never clobbers values)")
	prune := fs.Bool("prune", false, "destructive: remove every comment block/line tagged @rtOrphan / @rtOrphanChild")
	translate := fs.String("translate", "", "i18n: scaffold/reconcile per-locale FriendlyText translation files (a locale tag, or 'all' for every tsconfig i18n.locales entry)")
	tsconfigFlag := fs.String("tsconfig", "", "project tsconfig path (default: found like tsc, searching upward from the working directory)")
	fs.Usage = func() {
		printUsage(fs, `ts-runtypes gen — scaffold / reconcile the enrichment mirror files

Usage:
    ts-runtypes gen <file.ts> <TypeName> [--mock] [--friendly] [--gen-dir <dir>] [--out <path>]
       or: ts-runtypes gen <file.ts> <TypeName> --update                       (reconcile an existing mirror)
       or: ts-runtypes gen --prune [<mirror-file-or-dir>]                       (strip @rtOrphan carcasses)
       or: ts-runtypes gen --files a.ts,b.ts --type Target                      (batch, JSON to stdout)
       or: ts-runtypes gen --translate <locale> [--update|--prune] [<src.ts>]   (i18n translation mirrors)

Drift checking moved to: ts-runtypes check [<file-or-dir>]
`)
	}
	positional, flags := splitArgs(args)
	if err := fs.Parse(flags); err != nil {
		fatal("gen: %v", err)
	}

	// --translate is its own lane: the desired side is the friendly source
	// mirror, never the type graph — so it excludes the type-driven modes.
	if *translate != "" {
		if *files != "" || *mock || *friendly || *out != "" {
			fatal("gen: --translate can only combine with --update / --prune / --gen-dir")
		}
		runGenTranslate(*translate, positional, *update, *prune, *genDirFlag, *tsconfigFlag)
		return
	}

	// Mutual-exclusion guards. --update is the reconcile op; it cannot combine
	// with --files (batch stdout, no writes). --prune is the standalone
	// destructive sweep and likewise excludes the others.
	if *update {
		if *files != "" {
			fatal("gen: --update cannot be combined with --files")
		}
		if *prune {
			fatal("gen: --update cannot be combined with --prune")
		}
	}
	if *prune {
		if *files != "" {
			fatal("gen: --prune cannot be combined with --files")
		}
		runGenPrune(positional, *genDirFlag, *tsconfigFlag)
		return
	}

	if *files != "" {
		if *typeFlag == "" {
			fatal("gen --files: --type is required")
		}
		runGenBatch(strings.Split(*files, ","), *typeFlag, *tsconfigFlag)
		return
	}
	if len(positional) < 2 {
		fs.Usage()
		os.Exit(2)
	}
	absPath := tspath.NormalizePath(mustAbs(positional[0]))
	typeName := positional[1]

	// Default (no flag): emit BOTH friendly + mock.
	wantFriendly, wantMock := *friendly, *mock
	if !wantFriendly && !wantMock {
		wantFriendly, wantMock = true, true
	}

	tsconfigPath, parsed := resolveEnrichProject(*tsconfigFlag)
	config := resolveEnrichConfig(absPath, *genDirFlag, tsconfigPath, parsed)

	// Self-document the genDir tree even when gen runs before any build: the
	// root + enriched READMEs (shared with the generate lane) and a README in
	// each family dir this run writes into.
	genRoot := filepath.Dir(config.EnrichDir)
	_ = resolver.EnsureOutputHygiene(genRoot, filepath.Join(genRoot, "types"))
	for _, family := range wantedFamilies(*mock, *friendly) {
		config.ensureFamilyReadme(family)
	}

	// Named-type-driven emission: resolve the RAW (non-inlined) graph so the
	// closure walk can tell a named-type reference from an anonymous inline shape,
	// then emit ONE friendly+mock const per named type in the closure, in
	// dependency (topological) order, with cross-const references between them.
	prog, res, err := buildProgram(absPath, config.parsed)
	if err != nil {
		fatal("gen: %v", err)
	}
	defer res.Close()
	resolved, err := enrichment.ResolveTypeRaw(prog, res.Checker(), res.Cache(), absPath, typeName)
	if err != nil {
		fatal("gen: %v", err)
	}
	// The rt$ prefix is RESERVED for enrichment meta keys — a colliding
	// property makes the scaffold unrepresentable, so refuse up front.
	if collisions := enrichment.ReservedPropertyCollisions(resolved.Node, resolved.Resolve); len(collisions) > 0 {
		fatal("gen: %s: property %s collides with the reserved enrichment meta prefix 'rt$' — rename the property or exclude the type from enrichment", typeName, strings.Join(collisions, ", "))
	}

	closure := enrichment.EmitClosure(resolved.Node, enrichment.ClosureOptions{
		TypeName:     typeName,
		Resolve:      resolved.Resolve,
		DeclFiles:    resolved.DeclFiles,
		SourceLocale: config.SourceLocale,
	})

	// Group the closure by declaration source file → one mirror file per group.
	// A const with no resolved DeclFile falls back to the gen target (absPath).
	// When --out is given, force every const into that one file (legacy single-file
	// override): all consts share one synthetic group keyed by absPath.
	groups := groupByDeclFile(closure, absPath, *out != "")

	// varDeclFile maps each emitted const var → the source file its type is
	// declared in, so a referrer in mirror file A can emit a cross-file value
	// import for a var whose home is mirror file B.
	varDeclFile := map[string]string{}
	for _, named := range closure {
		declFile := named.DeclFile
		if declFile == "" {
			declFile = absPath
		}
		varDeclFile[named.FriendlyVar] = declFile
		varDeclFile[named.MockVar] = declFile
	}

	var written, skipped int
	for _, group := range groups {
		for _, spec := range groupSpecs(config, group, varDeclFile, *out, wantFriendly, wantMock) {
			var wrote bool
			if *update {
				wrote = updateMirrorFile(spec)
			} else {
				wrote = writeMirrorFile(spec)
			}
			if wrote {
				written++
			} else {
				skipped++
			}
		}
	}
	if written == 0 {
		fmt.Printf("gen: nothing to write — mirror file(s) already have the requested export(s)\n")
	}
	os.Exit(0)
}

// groupSpecs builds the mirror.Spec set for one source-file group: one spec PER
// WANTED FAMILY (friendly / mock), each targeting its own family-segment mirror
// file with a family-matched MirrorPathFor (so cross-file value imports resolve
// to sibling files of the SAME family). The --out override collapses everything
// into one combined single-file spec (the legacy shape, kept for the explicit
// escape hatch). Before the per-family specs are built, a pre-split combined
// mirror at the legacy (no-family) path is migrated in place.
func groupSpecs(config enrichConfig, group declFileGroup, varDeclFile map[string]string, out string, wantFriendly, wantMock bool) []mirror.Spec {
	if out != "" {
		return []mirror.Spec{{
			MirrorPath:    tspath.NormalizePath(mustAbs(out)),
			SourceFile:    group.declFile,
			Consts:        group.consts,
			VarDeclFile:   varDeclFile,
			Out:           out,
			WantFriendly:  wantFriendly,
			WantMock:      wantMock,
			MirrorPathFor: config.legacyMirrorPath,
		}}
	}

	migrateLegacyMirror(config, group.declFile)

	var specs []mirror.Spec
	for _, family := range wantedFamilies(wantFriendly, wantMock) {
		family := family
		specs = append(specs, mirror.Spec{
			MirrorPath:    config.mirrorPath(family, group.declFile),
			SourceFile:    group.declFile,
			Consts:        group.consts,
			VarDeclFile:   varDeclFile,
			WantFriendly:  family == familyFriendly,
			WantMock:      family == familyMock,
			MirrorPathFor: func(declFile string) string { return config.mirrorPath(family, declFile) },
		})
	}
	return specs
}

// wantedFamilies lists the family segments a gen invocation targets, friendly
// first (matching the historical const order in the combined file).
func wantedFamilies(wantFriendly, wantMock bool) []string {
	var families []string
	if wantFriendly {
		families = append(families, familyFriendly)
	}
	if wantMock {
		families = append(families, familyMock)
	}
	return families
}

// declFileGroup is one mirror file's worth of consts: every NamedConst whose
// type is declared in declFile, in topological (declared-before-use) order.
type declFileGroup struct {
	declFile string
	consts   []enrichment.NamedConst
}

// groupByDeclFile buckets a topologically-ordered closure by each const's
// declaration file (falling back to fallbackFile when DeclFile is empty),
// preserving the closure's order within each bucket. forceSingle collapses every
// const into one group keyed by fallbackFile (the --out single-file override).
// Group order follows first appearance, so dependency order is preserved when a
// referenced type's file is emitted before its referrer's.
func groupByDeclFile(closure []enrichment.NamedConst, fallbackFile string, forceSingle bool) []declFileGroup {
	indexByFile := map[string]int{}
	var groups []declFileGroup
	for _, named := range closure {
		declFile := fallbackFile
		if !forceSingle && named.DeclFile != "" {
			declFile = named.DeclFile
		}
		index, ok := indexByFile[declFile]
		if !ok {
			index = len(groups)
			indexByFile[declFile] = index
			groups = append(groups, declFileGroup{declFile: declFile})
		}
		groups[index].consts = append(groups[index].consts, named)
	}
	return groups
}

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
		fatal("gen: read %s: %v", spec.MirrorPath, err)
	}

	content, added, err := mirror.Scaffold(spec, existing)
	if err != nil {
		fatal("gen: %v", err)
	}
	if content == "" {
		return false // create-only no-op: every requested export already present
	}

	if err := os.MkdirAll(filepath.Dir(spec.MirrorPath), 0o755); err != nil {
		fatal("gen: mkdir %s: %v", filepath.Dir(spec.MirrorPath), err)
	}
	if err := os.WriteFile(spec.MirrorPath, []byte(content), 0o644); err != nil {
		fatal("gen: write %s: %v", spec.MirrorPath, err)
	}
	verb := "wrote"
	if existing != "" {
		verb = "appended to"
	}
	fmt.Printf("gen: %s %s (%s)\n", verb, spec.MirrorPath, strings.Join(added, ", "))
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
		fatal("gen --files: no files given")
	}
	_, parsed := resolveEnrichProject(tsconfigFlag)
	prog, res, err := buildProgramMulti(absPaths, parsed)
	if err != nil {
		fatal("gen --files: %v", err)
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
			fatal("gen --files: %s: %v", absPath, err)
		}
		key := strings.TrimSuffix(filepath.Base(absPath), filepath.Ext(absPath))
		out[key] = skeletons{
			Friendly: enrichment.FriendlySkeleton(resolved.Node, resolved.Resolve),
			Mock:     enrichment.MockSkeleton(resolved.Node, resolved.Resolve),
		}
	}
	encoded, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		fatal("gen --files: encode json: %v", err)
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
	"--translate": true, "-translate": true,
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
