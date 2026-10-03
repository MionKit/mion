// Package apitypes trims the declarations `mion compile` writes down to what a client of the API needs: the API
// exports (the ones carrying a server build version) and everything they reach, statement by statement. Private
// and raw middleware definitions are cut out even when a kept type reaches them, so their handler types and
// imports drop with them.
package apitypes

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/compiler"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/apimeta"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
)

// Input is the in-memory declaration emit of an API project.
type Input struct {
	Cwd          string
	TsconfigPath string // the project's tsconfig, extended so paths, lib and types resolve as in the build
	// DeclarationDir is the root the .d.ts are laid out under; Declarations is keyed by absolute path under it.
	DeclarationDir string
	Declarations   map[string]string
	// Entry is the .d.ts (absolute) holding the API exports; found by its exports when empty.
	Entry string
}

// Output is the trimmed package content.
type Output struct {
	// Files is each kept .d.ts by slash path relative to DeclarationDir.
	Files map[string]string
	Entry string // relative path of the entry .d.ts
	// ApiExports are the entry's exports that carry a build version, sorted.
	ApiExports   []string
	BuildVersion string
	// Externals are the packages the kept declarations import, sorted (`@types/node` for a node builtin).
	Externals []string
	// Uses counts, per kept declaration (`file#name`), the kept declarations using it: the guard that a type a
	// cut middleware shared with a public route stays.
	Uses map[string]int
	// Removed lists each dropped declaration (`file#name`), sorted.
	Removed []string
	// CutMembers lists each private or raw middleware member cut from a kept type (`file#path`), sorted.
	CutMembers []string
}

// probeFile asks the checker for the router's private-definition and public-method types.
const probeFile = "__mion_api_types_probe.d.ts"

const probeText = `import type {PrivateDef, PublicRoute, PublicMiddleware, PublicHeadersMiddleware} from '@mionjs/router';
export declare const privateDef: PrivateDef;
export declare const publicMethod: PublicRoute<any, any, any> | PublicMiddleware<any, any, any> | PublicHeadersMiddleware<any, any, any>;
`

// Trim keeps the API exports' closure and drops every other declaration, import and file.
func Trim(input Input) (*Output, error) {
	declarationDir := filepath.Clean(input.DeclarationDir)
	prog, err := newDeclarationProgram(input, declarationDir, false)
	if err != nil {
		return nil, err
	}
	typeChecker, release := prog.TS.GetTypeChecker(context.Background())
	defer release()

	files := map[string]*fileInfo{}
	for abs := range input.Declarations {
		sourceFile := prog.SourceFile(abs)
		if sourceFile == nil {
			return nil, fmt.Errorf("api types: %s is not in the declaration program", abs)
		}
		files[filepath.Clean(abs)] = newFileInfo(filepath.Clean(abs), sourceFile)
	}
	trimmer := &trimmer{files: files, checker: typeChecker, declarationDir: declarationDir, externals: map[string]bool{}}

	entry, apiExports, version, err := trimmer.findEntry(input.Entry)
	if err != nil {
		return nil, err
	}
	trimmer.cutPrivateMembers(prog)
	trimmer.mark(entry, apiExports)
	if err := trimmer.checkUses(); err != nil {
		return nil, err
	}

	output := &Output{Files: map[string]string{}, ApiExports: apiExports, BuildVersion: version, Uses: map[string]int{}}
	output.Entry = trimmer.relative(entry.path)
	for _, file := range trimmer.sortedFiles() {
		text, kept := file.render()
		if kept {
			output.Files[trimmer.relative(file.path)] = text
		}
		for _, declaration := range file.items {
			if declaration.kind != itemDeclaration {
				continue
			}
			key := trimmer.relative(file.path) + "#" + declaration.label()
			if declaration.kept {
				output.Uses[key] = declaration.uses
			} else {
				output.Removed = append(output.Removed, key)
			}
		}
		for _, cut := range file.cutLabels {
			output.CutMembers = append(output.CutMembers, trimmer.relative(file.path)+"#"+cut)
		}
	}
	for name := range trimmer.externals {
		output.Externals = append(output.Externals, name)
	}
	sort.Strings(output.Externals)
	sort.Strings(output.Removed)
	sort.Strings(output.CutMembers)
	return output, nil
}

// Check type-checks the trimmed files on their own, libs included, and returns tsc-style error lines.
func Check(input Input, files map[string]string) ([]string, error) {
	declarationDir := filepath.Clean(input.DeclarationDir)
	declarations := make(map[string]string, len(files))
	for rel, text := range files {
		declarations[filepath.Join(declarationDir, filepath.FromSlash(rel))] = text
	}
	prog, err := newDeclarationProgram(Input{Cwd: input.Cwd, TsconfigPath: input.TsconfigPath, Declarations: declarations}, declarationDir, true)
	if err != nil {
		return nil, err
	}
	var lines []string
	for abs := range declarations {
		sourceFile := prog.SourceFile(abs)
		if sourceFile == nil {
			continue
		}
		found := prog.TS.GetSemanticDiagnostics(context.Background(), sourceFile)
		found = append(found, prog.TS.GetSyntacticDiagnostics(context.Background(), sourceFile)...)
		for _, diagnostic := range compiler.SortAndDeduplicateDiagnostics(found) {
			if diagnostic.Category().Name() != "error" {
				continue
			}
			rel, _ := filepath.Rel(declarationDir, abs)
			lines = append(lines, fmt.Sprintf("%s: error TS%d: %s", filepath.ToSlash(rel), diagnostic.Code(), diagnostic.String()))
		}
	}
	sort.Strings(lines)
	return lines, nil
}

// newDeclarationProgram builds a program over the declarations alone, with a tsconfig that extends the project's.
func newDeclarationProgram(input Input, declarationDir string, libCheck bool) (*program.Program, error) {
	overlay := make(map[string]string, len(input.Declarations)+2)
	for abs, text := range input.Declarations {
		overlay[filepath.Clean(abs)] = text
	}
	projectConfig := tspath.ResolvePath(input.Cwd, input.TsconfigPath)
	extends, err := filepath.Rel(declarationDir, projectConfig)
	if err != nil {
		return nil, fmt.Errorf("api types: tsconfig path: %w", err)
	}
	config := map[string]any{
		"extends": filepath.ToSlash(extends),
		"compilerOptions": map[string]any{
			"noEmit": true, "declaration": false, "composite": false, "incremental": false,
			"rootDir": ".", "skipLibCheck": !libCheck, "allowImportingTsExtensions": true,
		},
		"include": []string{"**/*.d.ts"},
		"files":   []string{},
	}
	if !libCheck {
		overlay[filepath.Join(declarationDir, probeFile)] = probeText
	}
	configText, _ := json.Marshal(config)
	configPath := filepath.Join(declarationDir, "tsconfig.json")
	overlay[configPath] = string(configText)
	// `files: []` beside `include` would read as an empty list; drop it so only `include` counts.
	overlay[configPath] = strings.Replace(overlay[configPath], `,"files":[]`, "", 1)
	prog, err := program.New(program.Options{Cwd: input.Cwd, TsconfigPath: configPath, Overlay: overlay})
	if err != nil {
		return nil, fmt.Errorf("api types: declaration program: %w", err)
	}
	return prog, nil
}

type trimmer struct {
	files          map[string]*fileInfo
	checker        *checker.Checker
	declarationDir string
	externals      map[string]bool
	queue          []*item
	roots          map[*item]bool
}

func (trimmer *trimmer) relative(abs string) string {
	rel, err := filepath.Rel(trimmer.declarationDir, abs)
	if err != nil {
		return filepath.ToSlash(abs)
	}
	return filepath.ToSlash(rel)
}

func (trimmer *trimmer) sortedFiles() []*fileInfo {
	out := make([]*fileInfo, 0, len(trimmer.files))
	for _, file := range trimmer.files {
		out = append(out, file)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].path < out[j].path })
	return out
}

// findEntry picks the file whose exports carry a server build version: the same check a client runs.
func (trimmer *trimmer) findEntry(requested string) (*fileInfo, []string, string, error) {
	type candidate struct {
		file    *fileInfo
		names   []string
		version string
	}
	var candidates []candidate
	for _, file := range trimmer.sortedFiles() {
		if requested != "" && file.path != filepath.Clean(requested) {
			continue
		}
		moduleSymbol := trimmer.checker.GetSymbolAtLocation(file.source.AsNode())
		if moduleSymbol == nil {
			continue
		}
		found := candidate{file: file}
		for _, exported := range trimmer.checker.GetExportsOfModule(moduleSymbol) {
			version := apimeta.ServerBuildVersion(trimmer.checker, trimmer.exportType(exported))
			if version == "" {
				continue
			}
			if found.version != "" && found.version != version {
				return nil, nil, "", fmt.Errorf("api types: %s exports APIs of two build versions (%s, %s)", trimmer.relative(file.path), found.version, version)
			}
			found.version = version
			found.names = append(found.names, exported.Name)
		}
		if len(found.names) > 0 {
			sort.Strings(found.names)
			candidates = append(candidates, found)
		}
	}
	switch {
	case requested != "" && len(candidates) == 0:
		return nil, nil, "", fmt.Errorf("api types: the entry %s exports no API with a build version: export the value `initRoutes` returns, built with `mion compile`", trimmer.relative(requested))
	case len(candidates) == 0:
		return nil, nil, "", fmt.Errorf("api types: no declaration exports an API with a build version: export the value `initRoutes` returns")
	case len(candidates) > 1:
		names := make([]string, len(candidates))
		for i, found := range candidates {
			names[i] = trimmer.relative(found.file.path)
		}
		return nil, nil, "", fmt.Errorf("api types: several files export an API (%s): pick one with --entry", strings.Join(names, ", "))
	}
	return candidates[0].file, candidates[0].names, candidates[0].version, nil
}

// exportType is a value export's type, or a type alias export's declared type.
func (trimmer *trimmer) exportType(exported *ast.Symbol) *checker.Type {
	target := exported
	if exported.Flags&ast.SymbolFlagsAlias != 0 {
		target = trimmer.checker.GetAliasedSymbol(exported)
	}
	if target.Flags&ast.SymbolFlagsValue != 0 {
		return trimmer.checker.GetTypeOfSymbol(target)
	}
	if target.Flags&ast.SymbolFlagsTypeAlias != 0 {
		return trimmer.checker.GetDeclaredTypeOfSymbol(target)
	}
	return nil
}

// mark keeps the API exports and, through their references, everything they use. A declaration stays while at
// least one kept declaration uses it, so a type a cut member shared with a public route is never lost.
func (trimmer *trimmer) mark(entry *fileInfo, apiExports []string) {
	trimmer.roots = map[*item]bool{}
	for _, name := range apiExports {
		for _, root := range trimmer.provide(entry, name, map[string]bool{}) {
			trimmer.roots[root] = true
			trimmer.keep(root, nil)
		}
	}
	for _, file := range trimmer.files {
		for _, always := range file.items {
			if always.kind == itemAlways {
				always.pending = true
			}
		}
	}
	for len(trimmer.queue) > 0 {
		next := trimmer.queue[0]
		trimmer.queue = trimmer.queue[1:]
		trimmer.follow(next)
		// An augmentation changes the types its file's kept code reads, so it rides with the first kept item.
		if next.file.keptAny() {
			for _, always := range next.file.items {
				if always.kind == itemAlways && always.pending {
					always.pending = false
					trimmer.keep(always, nil)
				}
			}
		}
	}
}

// keep marks an item kept and counts the use when a kept item uses it.
func (trimmer *trimmer) keep(target, user *item) {
	if user != nil && user != target {
		target.uses++
	}
	if target.kept {
		return
	}
	target.kept = true
	trimmer.queue = append(trimmer.queue, target)
}

// follow keeps what one kept item references.
func (trimmer *trimmer) follow(current *item) {
	file := current.file
	switch current.kind {
	case itemDeclaration, itemAlways:
		for _, name := range current.refNames(file) {
			for _, target := range file.locals[name] {
				trimmer.keep(target, current)
			}
		}
		for _, imported := range current.importTypes(file) {
			trimmer.followModule(current, file, imported.specifier, imported.name)
		}
	case itemImport:
		trimmer.followModule(current, file, current.specifier, current.importedName)
	case itemExportLocal:
		for _, target := range file.locals[current.localName] {
			trimmer.keep(target, current)
		}
	case itemReExport:
		trimmer.followModule(current, file, current.specifier, current.importedName)
	}
}

// followModule keeps what module specifier provides as name, or records an external package.
func (trimmer *trimmer) followModule(user *item, file *fileInfo, specifier, name string) {
	target := trimmer.resolveModule(file, specifier)
	if target == nil {
		if external := externalPackage(specifier); external != "" {
			trimmer.externals[external] = true
		}
		return
	}
	if name == "*" {
		for _, provider := range target.items {
			if provider.isExportProvider() {
				trimmer.keep(provider, user)
			}
		}
		return
	}
	for _, provider := range trimmer.provide(target, name, map[string]bool{}) {
		trimmer.keep(provider, user)
	}
}

// resolveModule returns the emitted file a relative specifier names, nil for a package.
func (trimmer *trimmer) resolveModule(file *fileInfo, specifier string) *fileInfo {
	if !strings.HasPrefix(specifier, ".") {
		return nil
	}
	base := filepath.Join(filepath.Dir(file.path), filepath.FromSlash(specifier))
	stem := base
	for _, extension := range []string{".js", ".ts", ".mjs", ".mts", ".cjs", ".cts", ".jsx", ".tsx"} {
		if strings.HasSuffix(base, extension) {
			stem = strings.TrimSuffix(base, extension)
			break
		}
	}
	for _, candidate := range []string{stem + ".d.ts", stem + ".d.mts", stem + ".d.cts", base, filepath.Join(base, "index.d.ts")} {
		if found := trimmer.files[filepath.Clean(candidate)]; found != nil {
			return found
		}
	}
	return nil
}

// provide returns the items file needs to keep so that it still exports name.
func (trimmer *trimmer) provide(file *fileInfo, name string, seen map[string]bool) []*item {
	key := file.path + "#" + name
	if seen[key] {
		return nil
	}
	seen[key] = true
	var out []*item
	for _, provider := range file.items {
		if provider.exportedName == name && provider.isExportProvider() {
			out = append(out, provider)
		}
	}
	if len(out) > 0 || name == "default" {
		return out
	}
	for _, star := range file.items {
		if star.kind != itemExportStar {
			continue
		}
		target := trimmer.resolveModule(file, star.specifier)
		if target == nil {
			continue
		}
		if found := trimmer.provide(target, name, seen); len(found) > 0 {
			out = append(out, star)
			out = append(out, found...)
		}
	}
	return out
}

// checkUses is the guard on the cascade: every kept item but a root or an augmentation has a kept user, and no
// dropped item has one.
func (trimmer *trimmer) checkUses() error {
	for _, file := range trimmer.sortedFiles() {
		for _, current := range file.items {
			switch {
			case current.kept && current.uses == 0 && !trimmer.roots[current] && current.kind != itemAlways:
				return fmt.Errorf("api types: internal error: %s#%s is kept with no kept user", trimmer.relative(file.path), current.label())
			case !current.kept && current.uses > 0:
				return fmt.Errorf("api types: internal error: %s#%s is dropped while %d kept declaration(s) use it", trimmer.relative(file.path), current.label(), current.uses)
			}
		}
	}
	return nil
}

// externalPackage maps a bare specifier to the package to depend on.
func externalPackage(specifier string) string {
	if specifier == "" || strings.HasPrefix(specifier, ".") || strings.HasPrefix(specifier, "/") {
		return ""
	}
	if strings.HasPrefix(specifier, "node:") || nodeBuiltins[strings.SplitN(specifier, "/", 2)[0]] {
		return "@types/node"
	}
	parts := strings.Split(specifier, "/")
	if strings.HasPrefix(specifier, "@") && len(parts) > 1 {
		return parts[0] + "/" + parts[1]
	}
	return parts[0]
}

var nodeBuiltins = map[string]bool{
	"assert": true, "async_hooks": true, "buffer": true, "child_process": true, "cluster": true, "console": true,
	"crypto": true, "dgram": true, "dns": true, "events": true, "fs": true, "http": true, "http2": true, "https": true,
	"inspector": true, "module": true, "net": true, "os": true, "path": true, "perf_hooks": true, "process": true,
	"querystring": true, "readline": true, "repl": true, "stream": true, "string_decoder": true, "timers": true,
	"tls": true, "tty": true, "url": true, "util": true, "v8": true, "vm": true, "worker_threads": true, "zlib": true,
}
