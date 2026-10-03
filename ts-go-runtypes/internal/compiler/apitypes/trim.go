// Package apitypes trims the declarations `mion compile` writes down to what a client of the API needs: the API
// exports (the ones carrying a server build version) and everything they reach, statement by statement. Private
// and raw middleware definitions are cut out of the routes a `PublicApi<…>` names, so their handler types and
// imports drop with them.
package apitypes

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/compiler"
	"github.com/microsoft/typescript-go/shim/core"
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
	// uses counts each kept declaration's kept users (`file#name`); removed and cutMembers name what went. Tests read them.
	uses       map[string]int
	removed    []string
	cutMembers []string
}

// probeFile asks the checker for the router's private-definition and public-method types.
const probeFile = "__mion_api_types_probe.d.ts"

const probeText = `import type {PrivateDef, PublicRoute, PublicMiddleware, PublicHeadersMiddleware} from '@mionjs/router';
export declare const privateDef: PrivateDef;
export declare const publicMethod: PublicRoute<any, any, any> | PublicMiddleware<any, any, any> | PublicHeadersMiddleware<any, any, any>;
`

// Trim keeps the API exports' closure and drops every other declaration, import and file.
func Trim(input Input) (*Output, error) {
	trimmer, release, err := newTrimmer(input, input.Declarations)
	if err != nil {
		return nil, err
	}
	defer release()
	entry, apiExports, version, err := trimmer.findEntry(input.Entry)
	if err != nil {
		return nil, err
	}
	containers := trimmer.cutPrivateMembers()
	trimmer.mark(entry, apiExports)
	if len(trimmer.errs) > 0 {
		return nil, errors.Join(trimmer.errs...)
	}
	if err := trimmer.checkContainersUnshared(containers); err != nil {
		return nil, err
	}

	output := &Output{Files: map[string]string{}, ApiExports: apiExports, BuildVersion: version, uses: map[string]int{}}
	output.Entry = trimmer.relative(entry.path)
	for _, file := range trimmer.sortedFiles() {
		if text, kept := file.render(); kept {
			output.Files[trimmer.relative(file.path)] = text
		}
		for _, declaration := range file.items {
			if declaration.kind != itemDeclaration {
				continue
			}
			key := trimmer.relative(file.path) + "#" + declaration.label()
			if declaration.kept {
				output.uses[key] = len(declaration.users)
			} else {
				output.removed = append(output.removed, key)
			}
		}
		for _, cut := range file.cutLabels {
			output.cutMembers = append(output.cutMembers, trimmer.relative(file.path)+"#"+cut)
		}
	}
	for name := range trimmer.externals {
		output.Externals = append(output.Externals, name)
	}
	sort.Strings(output.Externals)
	sort.Strings(output.removed)
	sort.Strings(output.cutMembers)
	return output, nil
}

// Check type-checks the trimmed files on their own, libs included, and reads the build version back from the
// trimmed entry, so a trim that changed the API's ids cannot pass unseen.
func Check(input Input, files map[string]string, entry string) ([]string, string, error) {
	declarations := make(map[string]string, len(files))
	for rel, text := range files {
		declarations[filepath.Join(filepath.Clean(input.DeclarationDir), filepath.FromSlash(rel))] = text
	}
	trimmer, release, err := newTrimmer(input, declarations)
	if err != nil {
		return nil, "", err
	}
	defer release()
	var lines []string
	for _, file := range trimmer.sortedFiles() {
		found := trimmer.program.TS.GetSemanticDiagnostics(context.Background(), file.source)
		found = append(found, trimmer.program.TS.GetSyntacticDiagnostics(context.Background(), file.source)...)
		for _, diagnostic := range compiler.SortAndDeduplicateDiagnostics(found) {
			if diagnostic.Category().Name() == "error" {
				lines = append(lines, fmt.Sprintf("%s: error TS%d: %s", trimmer.relative(file.path), diagnostic.Code(), diagnostic.String()))
			}
		}
	}
	if len(lines) > 0 {
		return lines, "", nil
	}
	_, _, version, err := trimmer.findEntry(filepath.Join(trimmer.declarationDir, filepath.FromSlash(entry)))
	return nil, version, err
}

// newTrimmer builds a program over the declarations alone, with a tsconfig that extends the project's.
func newTrimmer(input Input, declarations map[string]string) (*trimmer, func(), error) {
	declarationDir := filepath.Clean(input.DeclarationDir)
	overlay := make(map[string]string, len(declarations)+2)
	for abs, text := range declarations {
		overlay[filepath.Clean(abs)] = text
	}
	extends, err := filepath.Rel(declarationDir, tspath.ResolvePath(input.Cwd, input.TsconfigPath))
	if err != nil {
		return nil, nil, fmt.Errorf("api types: tsconfig path: %w", err)
	}
	// An empty `files` keeps a project tsconfig's own `files` list from being inherited through `extends`.
	configText, _ := json.Marshal(map[string]any{
		"extends": filepath.ToSlash(extends),
		"compilerOptions": map[string]any{
			"noEmit": true, "declaration": false, "composite": false, "incremental": false,
			"rootDir": ".", "skipLibCheck": false, "allowImportingTsExtensions": true,
		},
		"include": []string{"**/*.d.ts"},
		"files":   []string{},
	})
	configPath := filepath.Join(declarationDir, "tsconfig.json")
	overlay[configPath] = string(configText)
	overlay[filepath.Join(declarationDir, probeFile)] = probeText
	prog, err := program.New(program.Options{Cwd: input.Cwd, TsconfigPath: configPath, Overlay: overlay})
	if err != nil {
		return nil, nil, fmt.Errorf("api types: declaration program: %w", err)
	}
	typeChecker, release := prog.TS.GetTypeChecker(context.Background())
	trimmer := &trimmer{
		program: prog, checker: typeChecker, cwd: filepath.Clean(input.Cwd), declarationDir: declarationDir,
		files: map[string]*fileInfo{}, externals: map[string]bool{}, specifiers: map[string]bool{}, unresolved: map[string]bool{},
	}
	for abs := range declarations {
		sourceFile := prog.SourceFile(abs)
		if sourceFile == nil {
			release()
			return nil, nil, fmt.Errorf("api types: %s is not in the declaration program", abs)
		}
		trimmer.files[filepath.Clean(abs)] = newFileInfo(filepath.Clean(abs), sourceFile)
	}
	return trimmer, release, nil
}

type trimmer struct {
	program        *program.Program
	checker        *checker.Checker
	cwd            string
	declarationDir string
	files          map[string]*fileInfo
	externals      map[string]bool
	// specifiers are the bare specifiers kept code imports; unresolved the names it reads that no file declares.
	specifiers map[string]bool
	unresolved map[string]bool
	queue      []*item
	errs       []error
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

// mark keeps the API exports and, through their references, everything they use: a declaration stays while one
// kept declaration still uses it, so a type a cut member shared with a public route stays.
func (trimmer *trimmer) mark(entry *fileInfo, apiExports []string) {
	for _, name := range apiExports {
		for _, root := range trimmer.provide(entry, name, map[string]bool{}) {
			trimmer.keep(root, nil)
		}
	}
	trimmer.drain()
	// An augmentation changes types the kept code reads without being named: kept with its file, or when it
	// augments a module the kept code imports or declares a global name it reads.
	for changed := true; changed; {
		changed = false
		for _, file := range trimmer.sortedFiles() {
			for _, always := range file.items {
				if always.kind == itemAlways && !always.kept && (file.keptAny() || trimmer.augmentsKept(always)) {
					trimmer.keep(always, nil)
					changed = true
				}
			}
		}
		trimmer.drain()
	}
}

func (trimmer *trimmer) drain() {
	for len(trimmer.queue) > 0 {
		next := trimmer.queue[0]
		trimmer.queue = trimmer.queue[1:]
		trimmer.follow(next)
	}
}

// augmentsKept: a `declare module 'x'` the kept code imports, or a `declare global` declaring a name it reads.
func (trimmer *trimmer) augmentsKept(always *item) bool {
	statement := always.statement
	if statement.Kind != ast.KindModuleDeclaration {
		return false
	}
	if name := statement.Name(); name.Kind == ast.KindStringLiteral {
		return trimmer.specifiers[name.Text()]
	}
	found := false
	statement.ForEachChild(func(child *ast.Node) bool {
		if child.Kind != ast.KindModuleBlock {
			return false
		}
		for _, declaration := range child.AsModuleBlock().Statements.Nodes {
			if name := declaration.Name(); name != nil && ast.IsIdentifier(name) && trimmer.unresolved[name.Text()] {
				found = true
			}
		}
		return false
	})
	return found
}

// keep marks an item kept and records the kept item using it.
func (trimmer *trimmer) keep(target, user *item) {
	if user != nil && user != target && !containsItem(target.users, user) {
		target.users = append(target.users, user)
	}
	if target.kept {
		return
	}
	target.kept = true
	trimmer.queue = append(trimmer.queue, target)
}

func containsItem(items []*item, wanted *item) bool {
	for _, current := range items {
		if current == wanted {
			return true
		}
	}
	return false
}

// follow keeps what one kept item references.
func (trimmer *trimmer) follow(current *item) {
	file := current.file
	if current.kind == itemAlways && current.statement.Kind == ast.KindImportDeclaration {
		// A side-effect import: its file ships, with the augmentations that are its only effect.
		if target := trimmer.resolveModule(file, current.specifier); target != nil {
			target.imported = true
			for _, always := range target.items {
				if always.kind == itemAlways {
					trimmer.keep(always, current)
				}
			}
		} else {
			trimmer.followModule(current, file, current.specifier, current.statement.AsImportDeclaration().ModuleSpecifier, "")
		}
		return
	}
	switch current.kind {
	case itemDeclaration, itemAlways:
		for _, name := range current.refNames(file) {
			if len(file.locals[name]) == 0 {
				trimmer.unresolved[name] = true
			}
			for _, target := range file.locals[name] {
				trimmer.keep(target, current)
			}
		}
		for _, imported := range current.importTypes(file) {
			trimmer.followModule(current, file, imported.specifier, imported.node, imported.name)
		}
	case itemImport:
		trimmer.followModule(current, file, current.specifier, current.statement.AsImportDeclaration().ModuleSpecifier, current.importedName)
	case itemExportLocal:
		for _, target := range file.locals[current.localName] {
			trimmer.keep(target, current)
		}
	case itemReExport:
		trimmer.followModule(current, file, current.specifier, current.statement.AsExportDeclaration().ModuleSpecifier, current.importedName)
	}
}

// followModule keeps what module specifier provides as name, or records an external package.
func (trimmer *trimmer) followModule(user *item, file *fileInfo, specifier string, specifierNode *ast.Node, name string) {
	target := trimmer.resolveModule(file, specifier)
	if target == nil {
		trimmer.specifiers[specifier] = true
		// A published package cannot resolve the project's own aliases, and the file they name would be dropped.
		if strings.HasPrefix(specifier, "#") || trimmer.resolvesIntoProject(specifierNode) {
			trimmer.errs = append(trimmer.errs, fmt.Errorf("api types: %s imports %q, which resolves into this project (a tsconfig `paths` alias or a `#` import): a published package cannot resolve it, so import it by a relative path", trimmer.relative(file.path), specifier))
			return
		}
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

// resolvesIntoProject reports a bare specifier the checker resolves to an emitted file or to a project source
// outside node_modules.
func (trimmer *trimmer) resolvesIntoProject(specifierNode *ast.Node) bool {
	if specifierNode == nil {
		return false
	}
	symbol := trimmer.checker.GetSymbolAtLocation(specifierNode)
	if symbol == nil {
		return false
	}
	for _, declaration := range symbol.Declarations {
		if declaration.Kind != ast.KindSourceFile {
			continue
		}
		path := filepath.Clean(declaration.AsSourceFile().FileName())
		if trimmer.files[path] != nil {
			return true
		}
		if rel, err := filepath.Rel(trimmer.cwd, path); err == nil && !strings.HasPrefix(rel, "..") && !strings.Contains(filepath.ToSlash(path), "/node_modules/") {
			return true
		}
	}
	return false
}

// resolveModule returns the emitted file a relative specifier names, nil for a package.
func (trimmer *trimmer) resolveModule(file *fileInfo, specifier string) *fileInfo {
	if !strings.HasPrefix(specifier, ".") {
		return nil
	}
	base := filepath.Join(filepath.Dir(file.path), filepath.FromSlash(specifier))
	stem := tspath.RemoveFileExtension(base)
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

// externalPackage maps a bare specifier to the package to depend on.
func externalPackage(specifier string) string {
	if specifier == "" || strings.HasPrefix(specifier, ".") || strings.HasPrefix(specifier, "/") {
		return ""
	}
	if strings.HasPrefix(specifier, "node:") || core.UnprefixedNodeCoreModules[strings.SplitN(specifier, "/", 2)[0]] {
		return "@types/node"
	}
	parts := strings.Split(specifier, "/")
	if strings.HasPrefix(specifier, "@") && len(parts) > 1 {
		return parts[0] + "/" + parts[1]
	}
	return parts[0]
}
