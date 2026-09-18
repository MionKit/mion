// Command gen-builtin-purefns regenerates everything the build needs to know
// about the package's own pure functions, by running the SAME extractor the
// resolver uses on user pure fns over the registration sources in
// packages/run-types/src. Two outputs from one run:
//
//   - internal/cachegen/purefnids/ids.generated.go — one Go const per built-in
//     id, so an emitter names a pure fn the way source does instead of
//     hardcoding a namespace and a path.
//   - packages/run-types/src/runtypes/pure-fn-ids.generated.ts — the same ids
//     for the TS side. run-types builds with plain tsc, which injects nothing,
//     so its own registrations pass their id explicitly and this file is where
//     it comes from.
//
// The bodies themselves are not generated: the resolver extracts them from the
// installed package's sources on demand (internal/cachegen/purefnindex), from
// the file list this run writes beside the ids.
//
// Run from the ts-go-runtypes module root:
//
//	go run ./cmd/gen-builtin-purefns
//
// or, wired into the codegen family with a --check drift gate:
//
//	pnpm miondevx core codegen builtinpurefns [--check]
//
// The TS files stay the authored source of truth. Edit the src, never the
// generated files.
package main

import (
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
	"github.com/microsoft/typescript-go/shim/vfs/osvfs"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnindex"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsquote"
	"github.com/mionkit/mion/ts-go-runtypes/internal/textpos"
)

const (
	// markerPackageName is the package that owns the built-ins, and the first
	// segment of every id this generator emits.
	markerPackageName = "@mionjs/run-types"
	markerPkgRel      = "../packages/run-types"
	idsOutputRel      = "internal/cachegen/purefnids/ids.generated.go"
	idsTsOutputRel    = "../packages/run-types/src/runtypes/pure-fn-ids.generated.ts"
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
	// The scan runs HERE, once, in this repo, and its answer is written into the
	// generated file the binary compiles in, so a consumer never re-derives it.
	pkgRoot = tspath.NormalizePath(pkgRoot)
	scanned := purefnindex.ScanRegistrations(pkgRoot, osvfs.FS())
	if len(scanned) == 0 {
		return fmt.Errorf("no file under %s/src registers a pure function", pkgRoot)
	}
	// The SAME call the resolver serves bodies with, so the id constants the
	// emitters compile against and the bodies a consumer receives can never come
	// from different files or a different resolution.
	entries, diags, err := purefnindex.ExtractSources(pkgRoot, scanned, purefnindex.SideProgram{})
	if err != nil {
		return err
	}
	if len(diags) > 0 {
		return fmt.Errorf("extractor rejected %s (%s %v)", diags[0].Site.FilePath, diags[0].Code, diags[0].Args)
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

	// Only the files that actually PRODUCED an entry are written out. The needle is
	// loose on purpose (it also hits a re-export or a comment), and a file that
	// registers nothing would cost the resolver a parse for no reason every session.
	sources, err := relativeTo(pkgRoot, registeringFiles(entries))
	if err != nil {
		return err
	}
	ids, err := renderGoIDs(entries, sources)
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
	fmt.Fprintf(os.Stderr, "gen-builtin-purefns: wrote %d ids to %s and %s\n", len(entries), idsOutputRel, idsTsOutputRel)
	return nil
}

// nameOf is the identifier the registration is bound to, which is what both
// generated constant sets are keyed by. It is NOT in the id — an id is the
// package plus a hash of the body — so it is read off the entry, and a built-in
// written into a call rather than bound to a const has none.
func nameOf(entry purefunctions.Entry) (string, error) {
	if entry.BindingName == "" {
		return "", fmt.Errorf("built-in %q is bound to no const; a built-in must be named to get a constant", entry.Key())
	}
	return entry.BindingName, nil
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

func renderGoIDs(entries []purefunctions.Entry, sources []string) ([]byte, error) {
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
	b.WriteString("package purefnids\n\n")
	b.WriteString("import \"sort\"\n\n")
	b.WriteString("// IDPrefix is what every id below starts with: the package that owns these\n")
	b.WriteString("// pure fns. A build tells a reference to one of them apart from a reference to\n")
	b.WriteString("// a consumer's own pure fn by this prefix, which is also how it knows a\n")
	b.WriteString("// reference the table does not carry means a STALE table rather than a user\n")
	b.WriteString("// pure fn it should leave alone.\n")
	fmt.Fprintf(&b, "const IDPrefix = %s\n\n", strconv.Quote(markerPackageName+"#"))
	b.WriteString("const (\n")
	byConst := map[string]string{}
	for _, entry := range entries {
		name, err := nameOf(entry)
		if err != nil {
			return nil, err
		}
		if owner, _, ok := purefunctions.SplitID(entry.Key()); !ok || owner != markerPackageName {
			return nil, fmt.Errorf("built-in %q is not under %s — the id rule or the source layout moved", entry.Key(), markerPackageName)
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
	b.WriteString("// names is the identifier each built-in is bound to in source. An id is a\n")
	b.WriteString("// hash, which names nothing a reader can search for, so a diagnostic or a\n")
	b.WriteString("// report that has to SAY which pure function it means looks it up here.\n")
	b.WriteString("var names = map[string]string{\n")
	for _, constName := range constNames {
		fmt.Fprintf(&b, "\t%s: %s,\n", constName, strconv.Quote(byConst[constName]))
	}
	b.WriteString("}\n\n")
	b.WriteString("// NameOf returns the identifier a built-in is bound to in source, or empty\n")
	b.WriteString("// when id names no built-in.\n")
	b.WriteString("func NameOf(id string) string {\n\treturn names[id]\n}\n\n")
	b.WriteString("// Has reports whether id names one of the package's own pure functions.\n")
	b.WriteString("// Their bodies never come from a consumer's program — the compiler extracts\n")
	b.WriteString("// them from the package's own sources — so a build checks a reference to one\n")
	b.WriteString("// against this set instead of against the registrations it extracted.\n")
	b.WriteString("func Has(id string) bool {\n\treturn ids[id]\n}\n\n")
	b.WriteString("// SourceFiles are this package's files that register a pure function, relative\n")
	b.WriteString("// to its root. Scanned for a registrar call when this file was generated and\n")
	b.WriteString("// narrowed to the files that produced an entry, so there is nothing to keep in\n")
	b.WriteString("// sync and nothing to scan at build time: the resolver resolves these against\n")
	b.WriteString("// whatever root it finds the installed package at, and a path the install does\n")
	b.WriteString("// not have is CFG004.\n")
	b.WriteString("var SourceFiles = []string{\n")
	for _, source := range sources {
		fmt.Fprintf(&b, "\t%s,\n", strconv.Quote(source))
	}
	b.WriteString("}\n\n")
	b.WriteString("// All returns every built-in id, sorted. An id is a hash of the body that\n")
	b.WriteString("// ships, so a test can assert that each one still resolves from the sources and\n")
	b.WriteString("// catch a body edited without regenerating this file.\n")
	b.WriteString("func All() []string {\n")
	b.WriteString("\tout := make([]string, 0, len(ids))\n")
	b.WriteString("\tfor id := range ids {\n\t\tout = append(out, id)\n\t}\n")
	b.WriteString("\tsort.Strings(out)\n\treturn out\n}\n")
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
	return fmt.Errorf("%d extracted pure-fn body/bodies are not valid JavaScript — the type stripper left TS syntax behind.\n%s\nFix internal/cachegen/purefunctions/striptypes.go (add the missing type position), not the source",
		len(failures), strings.Join(failures, "\n"))
}

// registeringFiles are the distinct files the extracted entries came from, sorted.
func registeringFiles(entries []purefunctions.Entry) []string {
	seen := map[string]bool{}
	var files []string
	for _, entry := range entries {
		if entry.FilePath == "" || seen[entry.FilePath] {
			continue
		}
		seen[entry.FilePath] = true
		files = append(files, entry.FilePath)
	}
	sort.Strings(files)
	return files
}

// relativeTo renders paths relative to the package root with forward slashes,
// which is how the generated list travels: the resolver resolves them against
// whatever root it found the installed package at.
func relativeTo(packageRoot string, files []string) ([]string, error) {
	out := make([]string, len(files))
	for i, file := range files {
		relative, err := filepath.Rel(packageRoot, file)
		if err != nil {
			return nil, err
		}
		out[i] = filepath.ToSlash(relative)
	}
	return out, nil
}
