// Command gen-builtin-purefns regenerates everything the build needs to know
// about the package's own pure functions, by running the SAME extractor the
// resolver uses on user pure fns over the registration sources in
// packages/run-types/src. Three outputs from one run:
//
//   - internal/cachegen/purefnids/ids.generated.go — one Go const per built-in
//     id, so an emitter names a pure fn the way source does instead of
//     hardcoding a namespace and a path.
//   - packages/run-types/src/runtypes/pure-fn-ids.generated.ts — the same ids
//     for the TS side. run-types builds with plain tsc, which injects nothing,
//     so its own registrations pass their id explicitly and this file is where
//     it comes from.
//   - internal/cachegen/builtinpurefns/table.generated.go — one row per
//     built-in: id, bodyHash, paramNames, code, and the deps the body reaches.
//     The resolver serves these rows as pure-fn virtual modules so a published
//     consumer (dist + .d.ts, no src to extract) still receives the bodies on
//     demand.
//
// Run from the ts-go-runtypes module root:
//
//	go run ./cmd/gen-builtin-purefns
//
// or, wired into the codegen family with a --check drift gate:
//
//	pnpm miondevx core codegen builtinpurefns [--check]
//
// The TS files stay the authored source of truth; this table is only how their
// bodies reach consumers. Edit the src, never table.generated.go.
package main

import (
	"context"
	"fmt"
	"go/format"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/parser"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsquote"
	"github.com/mionkit/mion/ts-go-runtypes/internal/textpos"
)

// builtinSourceFiles are the package's own pure-fn registration modules,
// relative to the marker package root. Every registration the built-in emitters
// reach lives in one of these. Keep in sync with the side-effect imports in
// src/index.ts + src/formats/index.ts.
var builtinSourceFiles = []string{
	"src/runtypes/pure-fns-utils.ts",
	"src/runtypes/circular-pure-fns.ts",
	"src/formats/string/string-formats-pure-fns.ts",
	"src/formats/string/credit-card-pure-fns.ts",
	"src/formats/datetime/dateTime-pure-fns.ts",
}

const (
	markerPkgRel   = "../packages/run-types"
	outputRel      = "internal/cachegen/builtinpurefns/table.generated.go"
	idsOutputRel   = "internal/cachegen/purefnids/ids.generated.go"
	idsTsOutputRel = "../packages/run-types/src/runtypes/pure-fn-ids.generated.ts"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "gen-builtin-purefns:", err)
		os.Exit(1)
	}
}

func run() error {
	pkgRoot, err := filepath.Abs(markerPkgRel)
	if err != nil {
		return err
	}
	files := make([]string, len(builtinSourceFiles))
	for i, rel := range builtinSourceFiles {
		files[i] = filepath.Join(pkgRoot, rel)
	}

	prog, err := program.NewInferred(program.Options{Cwd: pkgRoot}, files)
	if err != nil {
		return fmt.Errorf("build program: %w", err)
	}
	typeChecker, release := prog.TS.GetTypeChecker(context.Background())
	defer release()
	markerOpts := marker.WithDefaults(marker.Options{})
	markerOpts.FS = prog.FS

	entries, diags := purefunctions.ExtractFromProgramCached(typeChecker, markerOpts, prog, files, purefunctions.NewFileCache())
	if len(diags) > 0 {
		for _, diag := range diags {
			fmt.Fprintf(os.Stderr, "  extractor %s: %v\n", diag.Code, diag.Args)
		}
		return fmt.Errorf("extractor produced %d diagnostic(s) over the built-in sources — fix the source before regenerating", len(diags))
	}
	if len(entries) == 0 {
		return fmt.Errorf("no built-in pure fns extracted from %v — program/resolution likely broke", builtinSourceFiles)
	}

	sort.Slice(entries, func(i, j int) bool { return entries[i].Key() < entries[j].Key() })
	// A defensive clash guard mirrored by the package's init(): the extractor
	// already dedups, so a clash here would mean two src files register the same
	// key with different bodies.
	seen := make(map[string]bool, len(entries))
	for _, entry := range entries {
		if seen[entry.Key()] {
			return fmt.Errorf("duplicate built-in key %q across sources", entry.Key())
		}
		seen[entry.Key()] = true
	}

	if err := parseCheckEntries(entries); err != nil {
		return err
	}

	source, err := render(entries)
	if err != nil {
		return err
	}
	if err := os.WriteFile(outputRel, source, 0o644); err != nil {
		return fmt.Errorf("write %s: %w", outputRel, err)
	}
	ids, err := renderGoIDs(entries)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(idsOutputRel), 0o755); err != nil {
		return fmt.Errorf("create %s: %w", filepath.Dir(idsOutputRel), err)
	}
	if err := os.WriteFile(idsOutputRel, ids, 0o644); err != nil {
		return fmt.Errorf("write %s: %w", idsOutputRel, err)
	}
	if err := os.WriteFile(idsTsOutputRel, renderTsIDs(entries), 0o644); err != nil {
		return fmt.Errorf("write %s: %w", idsTsOutputRel, err)
	}
	fmt.Fprintf(os.Stderr, "gen-builtin-purefns: wrote %d entries to %s, %s and %s\n", len(entries), outputRel, idsOutputRel, idsTsOutputRel)
	return nil
}

// nameOf is the name half of an id — the identifier the registration is bound
// to, which is what both generated constant sets are keyed by.
func nameOf(entry purefunctions.Entry) (string, error) {
	_, name, ok := purefunctions.SplitID(entry.Key())
	if !ok || name == "" {
		return "", fmt.Errorf("built-in %q has no name half; a built-in must be bound to a const", entry.Key())
	}
	return name, nil
}

// goConstName renders a built-in name as an exported Go identifier:
// `isDateString_YMD` becomes `IsDateStringYMD`. Two names that collapse to one
// constant fail the run rather than silently aliasing.
func goConstName(name string) string {
	var b strings.Builder
	upperNext := true
	for _, ch := range name {
		if ch == '_' {
			upperNext = true
			continue
		}
		if upperNext {
			b.WriteString(strings.ToUpper(string(ch)))
			upperNext = false
			continue
		}
		b.WriteRune(ch)
	}
	return b.String()
}

func renderGoIDs(entries []purefunctions.Entry) ([]byte, error) {
	var b strings.Builder
	b.WriteString("// Code generated by cmd/gen-builtin-purefns; DO NOT EDIT.\n")
	b.WriteString("// Regenerate with `pnpm miondevx core codegen builtinpurefns` after editing the\n")
	b.WriteString("// built-in pure-fn sources in packages/run-types/src.\n\n")
	b.WriteString("// Package purefnids holds the ids of the pure functions @mionjs/run-types\n")
	b.WriteString("// registers itself. An emitter that writes `utl.usePureFn(<id>)` into a\n")
	b.WriteString("// generated body names it through a constant here, so moving or renaming a\n")
	b.WriteString("// built-in fails this codegen instead of splitting one function across two ids.\n")
	b.WriteString("// The package imports nothing, which is what lets both the extractor and the\n")
	b.WriteString("// emitters depend on it.\n")
	b.WriteString("package purefnids\n\nconst (\n")
	byConst := map[string]string{}
	for _, entry := range entries {
		name, err := nameOf(entry)
		if err != nil {
			return nil, err
		}
		constName := goConstName(name)
		if previous, dup := byConst[constName]; dup {
			return nil, fmt.Errorf("built-ins %q and %q both render the Go constant %s", previous, name, constName)
		}
		byConst[constName] = name
		fmt.Fprintf(&b, "\t%s = %s\n", constName, strconv.Quote(entry.Key()))
	}
	b.WriteString(")\n\n")
	b.WriteString("// ids is every constant above, as a set, for Has.\n")
	b.WriteString("var ids = map[string]bool{\n")
	constNames := make([]string, 0, len(byConst))
	for constName := range byConst {
		constNames = append(constNames, constName)
	}
	sort.Strings(constNames)
	for _, constName := range constNames {
		fmt.Fprintf(&b, "\t%s: true,\n", constName)
	}
	b.WriteString("}\n\n")
	b.WriteString("// Has reports whether id names one of the package's own pure functions.\n")
	b.WriteString("// Their bodies never come from a consumer's program — the compiler serves them\n")
	b.WriteString("// from its own table — so a build checks a reference to one against this set\n")
	b.WriteString("// instead of against the registrations it extracted.\n")
	b.WriteString("func Has(id string) bool {\n\treturn ids[id]\n}\n")
	formatted, err := format.Source([]byte(b.String()))
	if err != nil {
		return nil, fmt.Errorf("gofmt generated ids: %w", err)
	}
	return formatted, nil
}

func renderTsIDs(entries []purefunctions.Entry) []byte {
	var b strings.Builder
	b.WriteString("// Code generated by cmd/gen-builtin-purefns; DO NOT EDIT.\n")
	b.WriteString("// Regenerate with `pnpm miondevx core codegen builtinpurefns` after editing the\n")
	b.WriteString("// pure-fn sources in this package.\n")
	b.WriteString("//\n")
	b.WriteString("// A pure function's id is where it lives, and the build normally injects it.\n")
	b.WriteString("// This package builds with plain tsc, which injects nothing, so its own\n")
	b.WriteString("// registrations pass their id from here. The literal types are also how a\n")
	b.WriteString("// consumer reading only this package's .d.ts still resolves an id.\n\n")
	for _, entry := range entries {
		name, err := nameOf(entry)
		if err != nil {
			continue
		}
		fmt.Fprintf(&b, "export const %sId = %s;\n", name, jsquote.Single(entry.Key()))
	}
	return []byte(b.String())
}

// parseCheckEntries re-parses every extracted body the way the runtime builds
// it and refuses to write the table if any of them is not valid JavaScript.
//
// The stripper works by walking the type positions it knows about, so an
// unhandled one ships silently: `new Set<any>()` survived into the table as a
// load-time SyntaxError until the call/new TypeArguments case was added. This
// gate turns that whole class from silent to build-breaking. Parsing as JS
// rather than TS is what does the work — in a JS file, leftover annotations and
// type arguments are grammar errors rather than valid syntax.
//
// It cannot catch stripped-but-still-wrong output that happens to stay valid
// JS: `foo<T>(1)` reads as `(foo < T) > 1` and parses clean either way.
func parseCheckEntries(entries []purefunctions.Entry) error {
	var failures []string
	// The parser asserts a normalized absolute name; nothing reads this file.
	checkPath := tspath.NormalizePath("/purefn-check.js")
	for _, entry := range entries {
		// Mirrors rtUtils.ts's buildFactoryFromCode:
		// `new Function(...paramNames, "'use strict'; " + code)`.
		body := "(function (" + strings.Join(entry.ParamNames, ", ") + ") {\n'use strict';\n" + entry.Code + "\n})"
		sourceFile := parser.ParseSourceFile(
			ast.SourceFileParseOptions{FileName: checkPath, Path: tspath.Path(checkPath)},
			body,
			core.ScriptKindJS,
		)
		if sourceFile == nil {
			failures = append(failures, fmt.Sprintf("  %s: parser returned no source file", entry.Key()))
			continue
		}
		for _, diag := range sourceFile.Diagnostics() {
			line, col := textpos.LineCol(sourceFile, diag.Pos())
			failures = append(failures, fmt.Sprintf("  %s (rendered body %d:%d): TS%d %s", entry.Key(), line, col, diag.Code(), diag.MessageKey()))
		}
	}
	if len(failures) == 0 {
		return nil
	}
	return fmt.Errorf("%d extracted pure-fn body/bodies are not valid JavaScript — the type stripper left TS syntax behind.\n%s\nFix internal/cachegen/purefunctions/striptypes.go (add the missing type position), not the source or the table",
		len(failures), strings.Join(failures, "\n"))
}

func render(entries []purefunctions.Entry) ([]byte, error) {
	var b strings.Builder
	b.WriteString("// Code generated by cmd/gen-builtin-purefns; DO NOT EDIT.\n")
	b.WriteString("// Regenerate with `pnpm miondevx core codegen builtinpurefns` after editing the\n")
	b.WriteString("// built-in pure-fn sources in packages/run-types/src.\n\n")
	b.WriteString("package builtinpurefns\n\n")
	b.WriteString("// builtinEntries is the extracted table of package-owned pure-fn bodies, one\n")
	b.WriteString("// row per registration, sorted by id.\n")
	b.WriteString("var builtinEntries = []builtinEntry{\n")
	for _, entry := range entries {
		b.WriteString("\t{\n")
		fmt.Fprintf(&b, "\t\tid:         %s,\n", strconv.Quote(entry.Key()))
		fmt.Fprintf(&b, "\t\tbodyHash:   %s,\n", strconv.Quote(entry.BodyHash))
		b.WriteString("\t\tparamNames: " + stringSliceLit(entry.ParamNames) + ",\n")
		fmt.Fprintf(&b, "\t\tcode:       %s,\n", strconv.Quote(entry.Code))
		b.WriteString("\t\tdeps:       " + stringSliceLit(entry.PureFnDependencies) + ",\n")
		b.WriteString("\t},\n")
	}
	b.WriteString("}\n")
	formatted, err := format.Source([]byte(b.String()))
	if err != nil {
		return nil, fmt.Errorf("gofmt generated table: %w", err)
	}
	return formatted, nil
}

// stringSliceLit renders a []string as a Go literal, `nil` when empty so the
// generated table stays terse (a table-served entry treats nil and empty
// identically).
func stringSliceLit(xs []string) string {
	if len(xs) == 0 {
		return "nil"
	}
	parts := make([]string, len(xs))
	for i, x := range xs {
		parts[i] = strconv.Quote(x)
	}
	return "[]string{" + strings.Join(parts, ", ") + "}"
}
