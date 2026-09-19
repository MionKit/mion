// Package purefnindex reads the pure functions an INSTALLED package ships, so a
// consumer whose program sees only that package's `.d.ts` still receives the
// bodies at build time: emitted into the consumer's own modules (a fn entry's
// deps thunk registers them before the body runs) and checked as an edge at all.
// One lane for every package, the marker package included.
//
// Built files first. Every mion build writes each pure fn as an entry tuple
// (`[2, deps, , id, paramNames, code, deps]`) and rewrites its registration to
// `registerPureFn(<tuple>, '<id>')`; both survive bundling and minification
// because the scan keys on literal SHAPE, never on an identifier name. Per file
// the scan also records the exported names bound to a registration call, which
// is how an untyped `.d.ts` binding (`declare const slugify: PureFnId<string>`,
// what a declaration emitter writes when the id was injected by the build) maps
// back to its id.
//
// Source second. When no built file carries a tuple but the package ships its
// TypeScript, the rows are extracted from that source with the same extractor a
// build runs, so the ids and bodies are the ones its own build would produce.
// The marker package is the one that lives here today: its dist is hollowed and
// its tarball ships `src`, and its registration files are a GENERATED list
// (purefnids.SourceFiles) rather than a scan, because that layout is fixed when
// the binary is built. Any other package is scanned for a registrar call. An id
// says nothing about where its body lives (it is the package plus a hash of the
// body), so a demanded id is MATCHED against what came back, never decoded.
//
// Whose resolver: the session's, whenever the session's program already holds
// those files (in-repo, the `source` condition puts the marker sources there).
// One resolver and one memo mean the ids here cannot disagree with the ids the
// program's own extraction produced; only a package the program does not hold
// pays for a side Program of its own. Everything goes through the program FS, so
// an overlay-only package behaves like an installed one.
package purefnindex

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/parser"
	"github.com/microsoft/typescript-go/shim/tspath"
	vfspkg "github.com/microsoft/typescript-go/shim/vfs"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

// tupleKindPureFn is slot 0 of a pure-fn entry tuple (entrymodules.KindPureFn,
// entryTuple.ts KIND_PURE_FN); the literal is compared as text.
const tupleKindPureFn = "2"

// Tuple slots after the shared head (kind, deps thunk, footer). Mirrors
// purefunctions.CollectEntries: key, paramNames, code, deps, factory.
const (
	slotKey     = 3
	slotParams  = 4
	slotCode    = 5
	slotDeps    = 6
	slotFactory = 7
)

// RegistrarNeedle is what a source file that registers a pure fn contains.
// `registerPureFnFactory` has it as a prefix, so one needle covers both
// registrars. It finds a DIRECT registrar call: a package registering through a
// wrapper of its own names the registrar only in the wrapper's module, and such
// a package must ship built files for its rows to be found.
const RegistrarNeedle = "registerPureFn"

// MarkerPackageName is the package that owns the built-in pure fns: the package
// half of the generated id prefix, so the name has one source.
var MarkerPackageName, _, _ = purefunctions.SplitID(purefnids.IDPrefix)

// Host is the session side of the store: the Program whose files and resolver
// are reused when they already cover a package's sources, and the knobs a side
// Program must inherit so it behaves the same. A zero Host reads every package
// through a side Program.
type Host struct {
	Program        *program.Program
	Checker        *checker.Checker
	MarkerOpts     marker.Options
	Cache          *purefunctions.FileCache
	SingleThreaded bool
}

// Store caches one PackageIndex per package root for the life of a SESSION,
// across Program swaps: an installed package does not change under a running
// session, extraction costs a side Program, and a harness that swaps the
// program per request (the fuzz lanes, the lint worker) would otherwise pay it
// every time. An index holds plain data (rows, names), nothing tied to the
// checker that produced it, so only the FS and the host are rebound per Program.
type Store struct {
	fs       vfspkg.FS
	host     Host
	packages map[string]*PackageIndex
	resolved map[string]string
}

// NewStore binds a Store to the program FS. A nil fs reads nothing and answers
// "not found" everywhere, which keeps a test with no program on today's path.
func NewStore(fs vfspkg.FS) *Store {
	return &Store{fs: fs, packages: map[string]*PackageIndex{}, resolved: map[string]string{}}
}

// Bind hands the store the session's program and resolver, for the packages
// whose sources that program already holds. Rebound on every Program swap, the
// cached indexes kept.
func (store *Store) Bind(fs vfspkg.FS, host Host) {
	store.fs = fs
	store.host = host
}

// PackageIndex is what one installed package ships: its pure-fn rows by id and,
// per file, the exported names bound to a registration call.
type PackageIndex struct {
	Root string
	// Name is the package.json name, the owner half of every id the package
	// owns; empty for a nameless package.
	Name string
	Rows map[string]purefunctions.Entry
	// FromSource is set when no built file carried a tuple and the rows were
	// extracted from the package's sources instead.
	FromSource bool
	// Err is why the package's sources could not be extracted at all: a listed
	// file the install lacks, or the extractor rejecting them. Only set when
	// the built files carried nothing; a package with no sources has none.
	Err error
	// exportsByFile maps a built JS file to its exported name → id bindings.
	// Only ids that ARE rows count, so an unrelated call ending in a string
	// literal never becomes a binding.
	exportsByFile map[string]map[string]string
	// byName maps a binding name to the one id registered under it anywhere in
	// the package: a local or exported binding of a built file, or the
	// BindingName of an extracted row. An empty value marks a name two rows
	// share, which answers nothing.
	byName map[string]string
}

// Built reports whether the package ships any pure fn the build can serve. A
// package with none was not built by mion and ships no source (or registers
// nothing): its registrations only exist at runtime.
func (idx *PackageIndex) Built() bool { return len(idx.Rows) > 0 }

// Package returns the index of the package rooted at root, reading it on first
// use. root is the directory holding its package.json.
func (store *Store) Package(root string) *PackageIndex {
	root = tspath.NormalizePath(root)
	if idx, ok := store.packages[root]; ok {
		return idx
	}
	idx := &PackageIndex{Root: root, Rows: map[string]purefunctions.Entry{}, exportsByFile: map[string]map[string]string{}, byName: map[string]string{}}
	// Registered before the read so a package whose sources import a binding of
	// its own (through this store) finds the index under construction rather
	// than reading itself again.
	store.packages[root] = idx
	if store.fs == nil {
		return idx
	}
	if content, ok := store.fs.ReadFile(tspath.CombinePaths(root, "package.json")); ok {
		var manifest struct {
			Name string `json:"name"`
		}
		if json.Unmarshal([]byte(content), &manifest) == nil {
			idx.Name = manifest.Name
		}
	}
	var bindings []nameBinding
	// A tuple carries its own id literal and a registration names it too, so
	// a file without `<name>#` holds nothing to read. The substring check is
	// ~20x cheaper than the parse and is what keeps a large package cheap.
	needle := idx.Name + purefunctions.IDSeparator
	for _, file := range store.filesUnder(root, isJSFile) {
		if content, ok := store.fs.ReadFile(file); ok && strings.Contains(content, needle) {
			bindings = scanFile(idx, bindings, file, content)
		}
	}
	if len(idx.Rows) == 0 {
		store.extractSource(idx)
	}
	// Bindings are kept only for ids the package really ships; resolved after
	// the walk because a row may live in a later file than its registration (a
	// bundle chunk order is the bundler's choice).
	for file, bindings := range idx.exportsByFile {
		for name, id := range bindings {
			if _, isRow := idx.Rows[id]; !isRow {
				delete(bindings, name)
			}
		}
		if len(bindings) == 0 {
			delete(idx.exportsByFile, file)
		}
	}
	for _, binding := range bindings {
		if _, isRow := idx.Rows[binding.id]; isRow {
			idx.addName(binding.name, binding.id)
		}
	}
	for _, row := range idx.Rows {
		idx.addName(row.BindingName, row.ID)
	}
	return idx
}

// nameBinding is one name a built file binds to a registration's id.
type nameBinding struct{ name, id string }

func (idx *PackageIndex) addName(name, id string) {
	if name == "" {
		return
	}
	if previous, seen := idx.byName[name]; seen && previous != id {
		idx.byName[name] = ""
		return
	}
	idx.byName[name] = id
}

func (store *Store) filesUnder(root string, keep func(name string) bool) []string {
	if !store.fs.DirectoryExists(root) {
		return nil
	}
	var files []string
	var walk func(dir string)
	walk = func(dir string) {
		entries := store.fs.GetAccessibleEntries(dir)
		names := append([]string(nil), entries.Files...)
		sort.Strings(names)
		for _, name := range names {
			if keep(name) {
				files = append(files, tspath.CombinePaths(dir, name))
			}
		}
		dirs := append([]string(nil), entries.Directories...)
		sort.Strings(dirs)
		for _, name := range dirs {
			// A nested node_modules is another package; a hidden dir (`.mion`,
			// `.git`) is a build's scratch, where a consumer build writes served
			// COPIES of other packages' rows, never the package's own.
			if name == "node_modules" || strings.HasPrefix(name, ".") {
				continue
			}
			walk(tspath.CombinePaths(dir, name))
		}
	}
	walk(root)
	return files
}

func isJSFile(name string) bool {
	return strings.HasSuffix(name, ".js") || strings.HasSuffix(name, ".mjs") || strings.HasSuffix(name, ".cjs")
}

// IsRegistrationCandidate keeps authored TypeScript only: a declaration file
// carries no body, and a spec or test file is not in a tarball.
func IsRegistrationCandidate(name string) bool {
	if strings.HasSuffix(name, ".d.ts") || strings.HasSuffix(name, ".spec.ts") || strings.HasSuffix(name, ".test.ts") {
		return false
	}
	return strings.HasSuffix(name, ".ts") || strings.HasSuffix(name, ".tsx") || strings.HasSuffix(name, ".mts")
}

// ScanRegistrations returns the files under root's `src` that call a registrar,
// sorted. A file that registers contains the call by definition, so nothing is
// missed the way a walk of the import graph misses a module nobody imports.
func ScanRegistrations(root string, fileSystem vfspkg.FS) []string {
	store := &Store{fs: fileSystem}
	var files []string
	for _, file := range store.filesUnder(tspath.CombinePaths(tspath.NormalizePath(root), "src"), IsRegistrationCandidate) {
		if content, ok := fileSystem.ReadFile(file); ok && strings.Contains(content, RegistrarNeedle) {
			files = append(files, file)
		}
	}
	return files
}

// MarkerSourceFiles are the marker package's registration modules, resolved
// under its root: the generated list, because that package's layout is fixed
// when the binary is built and a scan per session would re-derive a constant.
func MarkerSourceFiles(root string) []string {
	files := make([]string, len(purefnids.SourceFiles))
	for i, relative := range purefnids.SourceFiles {
		files[i] = tspath.ResolvePath(root, relative)
	}
	sort.Strings(files)
	return files
}

// extractSource fills the rows from the package's TypeScript. The marker
// package's files are the generated list and every one of them must be there
// (a pruned or skewed install is an error, never a silent runtime miss); any
// other package's are scanned, and none found means the package ships nothing
// to serve. Only the rows are kept, projected to what a served body needs.
func (store *Store) extractSource(idx *PackageIndex) {
	var files []string
	if idx.Name == MarkerPackageName {
		files = MarkerSourceFiles(idx.Root)
		for _, file := range files {
			if !store.fs.FileExists(file) {
				idx.Err = fmt.Errorf("%s is missing from the installed package", file)
				return
			}
		}
	} else {
		files = ScanRegistrations(idx.Root, store.fs)
	}
	if len(files) == 0 {
		return
	}
	entries, diags, err := store.extract(idx.Root, files)
	if err == nil && idx.Name == MarkerPackageName {
		// A diagnostic over the marker package's OWN sources is not a user error
		// to report against their code; it means the installed sources are
		// broken, truncated, or hold a dependency cycle.
		if len(diags) > 0 {
			err = fmt.Errorf("extractor rejected %s (%s %v)", diags[0].Site.FilePath, diags[0].Code, diags[0].Args)
		} else if len(entries) == 0 {
			err = fmt.Errorf("no pure-fn registrations found in %v", files)
		}
	}
	if err != nil {
		idx.Err = err
		return
	}
	for _, entry := range entries {
		idx.Rows[entry.Key()] = served(entry)
	}
	idx.FromSource = len(entries) > 0
}

// extract prefers the session's own Program: when it already holds every file,
// each id resolves against the session's single resolver and no second Program
// is built (two resolvers hashing the same bodies would split one function into
// two entries).
func (store *Store) extract(root string, files []string) ([]purefunctions.Entry, []diagnostics.Diagnostic, error) {
	if store.host.Program != nil && allInProgram(store.host.Program, files) {
		entries, diags := purefunctions.ExtractFromProgramCached(store.host.Checker, store.host.MarkerOpts, store.host.Program, files, store.host.Cache)
		return entries, diags, nil
	}
	return ExtractSources(root, files, SideProgram{FS: store.fs, SingleThreaded: store.host.SingleThreaded, Bindings: store})
}

// SideProgram is what opening a package's own sources needs when no session
// Program covers them: the FS to read through (nil reads disk, which is what
// the generator wants) and the session's single-threaded setting.
type SideProgram struct {
	FS             vfspkg.FS
	SingleThreaded bool
	// Bindings resolves the package's own deps on OTHER installed packages, so
	// a source-shipped library importing a built one lowers its ids the way its
	// own build would.
	Bindings marker.PureFnBindingResolver
}

// ExtractSources opens a package's sources in a Program of their own, rooted at
// the package (so its imports resolve from its own node_modules upward), and
// resolves every pure fn in them. Entries come back RAW, positions included:
// the generator narrows its file list by them, and the store projects them.
func ExtractSources(root string, files []string, opts SideProgram) ([]purefunctions.Entry, []diagnostics.Diagnostic, error) {
	if len(files) == 0 {
		return nil, nil, fmt.Errorf("no pure-fn sources named for %s", root)
	}
	prog, err := program.NewInferred(program.Options{Cwd: root, FS: opts.FS, SingleThreaded: opts.SingleThreaded}, files)
	if err != nil {
		return nil, nil, fmt.Errorf("build a program over %s: %w", root, err)
	}
	for _, file := range files {
		if prog.SourceFile(file) == nil {
			return nil, nil, fmt.Errorf("%s is missing from the installed package", file)
		}
	}
	typeChecker, release := prog.TS.GetTypeChecker(context.Background())
	defer release()
	markerOpts := marker.WithDefaults(marker.Options{FS: prog.FS, Cwd: prog.Cwd, PureFnBindings: opts.Bindings})
	entries, diags := purefunctions.ExtractFromProgramCached(typeChecker, markerOpts, prog, files, purefunctions.NewFileCache())
	return entries, diags, nil
}

// allInProgram reports whether every path is a file of prog. A published
// consumer has a package as declarations only, so none of its sources are there.
func allInProgram(prog *program.Program, files []string) bool {
	for _, file := range files {
		if prog.SourceFile(file) == nil {
			return false
		}
	}
	return len(files) > 0
}

// served strips the source-position bookkeeping off an extracted entry, keeping
// only what a DELIVERED body needs. Those fields (FactoryArgStart/End,
// IDInjectPos/Text, FilePath) drive the rewrite of the call site an entry came
// from, and a served entry's call site is inside an installed package: rewriting
// it would dangle an import into a consumer's dependency and strip the
// registration the runtime falls back on. BindingName stays: a diagnostic and
// the build report name a pure fn by it, the hash being unreadable.
func served(entry purefunctions.Entry) purefunctions.Entry {
	return purefunctions.Entry{
		ID:                 entry.ID,
		BindingName:        entry.BindingName,
		ParamNames:         emptyToNil(entry.ParamNames),
		Code:               entry.Code,
		PureFnDependencies: emptyToNil(entry.PureFnDependencies),
	}
}

func emptyToNil(xs []string) []string {
	if len(xs) == 0 {
		return nil
	}
	return xs
}

// ResolvePackage locates a package by name the way Node does from fromDir: the
// nearest `<dir>/node_modules/<name>/package.json` walking up, realpath'd so a
// workspace symlink lands on the directory the program's own files live under.
// Resolving a dep from the DEPENDENT package's root, not the consumer's, is what
// makes a nested install (`node_modules/a/node_modules/b`) land on the copy `a`
// was built against. A package no node_modules holds but the program already
// reaches (a `source`-condition workspace sibling) is found by its files.
func (store *Store) ResolvePackage(name, fromDir string) (string, bool) {
	if store.fs == nil || name == "" {
		return "", false
	}
	fromDir = tspath.NormalizePath(fromDir)
	cacheKey := fromDir + "\x00" + name
	if root, ok := store.resolved[cacheKey]; ok {
		return root, root != ""
	}
	root := ""
	for current := fromDir; current != ""; {
		candidate := tspath.CombinePaths(current, "node_modules", name)
		if store.fs.FileExists(tspath.CombinePaths(candidate, "package.json")) {
			root = tspath.NormalizePath(store.fs.Realpath(candidate))
			break
		}
		parent := tspath.GetDirectoryPath(current)
		if parent == current {
			break
		}
		current = parent
	}
	if root == "" && store.host.Program != nil {
		for _, sourceFile := range store.host.Program.TS.SourceFiles() {
			if owner, ownerRoot := marker.PackageOfFile(sourceFile.FileName(), store.fs); owner == name && ownerRoot != "" {
				root = tspath.NormalizePath(ownerRoot)
				break
			}
		}
	}
	store.resolved[cacheKey] = root
	return root, root != ""
}

// PackageOfID returns the package that owns a pure-fn id (`@acme/text#9Zt1…` →
// `@acme/text`). Empty when the id has no `#` (not an id) or no owner half (a
// nameless-package id has no package to look up).
func PackageOfID(id string) string {
	packageName, _, ok := purefunctions.SplitID(id)
	if !ok {
		return ""
	}
	return packageName
}

// BindingID maps a name declared in a `.d.ts` file to the pure-fn id the
// package registers it under. The sibling built file (`x.d.ts` → `x.js` /
// `.mjs` / `.cjs`) is consulted first, then the one binding of that name
// anywhere in the package: a declaration is emitted from the same binding the
// registration is assigned to, so a unique match is the answer a source build
// would give.
func (store *Store) BindingID(dtsPath, name string) (string, bool) {
	if store.fs == nil || name == "" {
		return "", false
	}
	_, root := marker.PackageOfFile(dtsPath, store.fs)
	if root == "" {
		return "", false
	}
	idx := store.Package(root)
	if !idx.Built() {
		return "", false
	}
	dtsPath = tspath.NormalizePath(dtsPath)
	if base, ok := strings.CutSuffix(dtsPath, ".d.ts"); ok {
		for _, ext := range []string{".js", ".mjs", ".cjs"} {
			if id, found := idx.exportsByFile[base+ext][name]; found {
				return id, true
			}
		}
	} else if base, ok := strings.CutSuffix(dtsPath, ".d.mts"); ok {
		if id, found := idx.exportsByFile[base+".mjs"][name]; found {
			return id, true
		}
	} else if base, ok := strings.CutSuffix(dtsPath, ".d.cts"); ok {
		if id, found := idx.exportsByFile[base+".cjs"][name]; found {
			return id, true
		}
	}
	id := idx.byName[name]
	return id, id != ""
}

// Demand is one pure-fn id a consumer graph needs, and the directory to resolve
// its package from (the consumer's cwd for a consumer edge). Root, when set,
// names the package root directly and skips resolution: a row's dep on its own
// package is answered by the root the row came from.
type Demand struct {
	ID      string
	FromDir string
	Root    string
}

// Miss is a demanded id whose package was located but does not ship it: a
// built package without that row (Built), a package whose sources could not be
// read (Err), or a package with nothing to serve at all (neither), which is the
// runtime-only lane.
type Miss struct {
	ID      string
	Package string
	Root    string
	Built   bool
	Err     error
}

// Result is what Closure found: the rows to serve (sorted by id, every
// transitive dep included), the demanded ids a located package lacks, and the
// ids whose package could not be located at all (left to the program's own
// registrations and its PFE9012 check).
type Result struct {
	Entries    []purefunctions.Entry
	Missing    []Miss
	Unresolved []string
}

// Closure serves every demanded id plus the transitive closure of its deps,
// resolving each dep from the root of the package whose row names it. A dep on
// the row's own package short-circuits to that same root, so a nested copy never
// resolves to a hoisted sibling with a different body.
func (store *Store) Closure(demands []Demand) Result {
	var result Result
	seen := map[string]bool{}
	queue := append([]Demand(nil), demands...)
	for len(queue) > 0 {
		demand := queue[0]
		queue = queue[1:]
		if seen[demand.ID] {
			continue
		}
		seen[demand.ID] = true
		packageName := PackageOfID(demand.ID)
		root, ok := demand.Root, demand.Root != ""
		if !ok && packageName != "" {
			root, ok = store.ResolvePackage(packageName, demand.FromDir)
		}
		if !ok {
			result.Unresolved = append(result.Unresolved, demand.ID)
			continue
		}
		idx := store.Package(root)
		row, found := idx.Rows[demand.ID]
		if !found {
			result.Missing = append(result.Missing, Miss{ID: demand.ID, Package: packageName, Root: root, Built: idx.Built(), Err: idx.Err})
			continue
		}
		result.Entries = append(result.Entries, row)
		for _, dep := range row.PureFnDependencies {
			next := Demand{ID: dep, FromDir: root}
			if idx.Name != "" && PackageOfID(dep) == idx.Name {
				next.Root = root
			}
			queue = append(queue, next)
		}
	}
	sort.Slice(result.Entries, func(i, j int) bool { return result.Entries[i].Key() < result.Entries[j].Key() })
	sort.Strings(result.Unresolved)
	sort.Slice(result.Missing, func(i, j int) bool { return result.Missing[i].ID < result.Missing[j].ID })
	return result
}

// scanFile parses one built JS file and records its pure-fn tuples and the
// exported names bound to a registration call; every name so bound, exported or
// local, is appended to bindings for the package-wide name map. Parse errors
// are not reported: a file the parser cannot read simply contributes nothing,
// and the consumer's own diagnostics (PFE9012 / PFE9016) say what was not found.
func scanFile(idx *PackageIndex, bindings []nameBinding, file, content string) []nameBinding {
	path := tspath.NormalizePath(file)
	sourceFile := parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: path, Path: tspath.Path(path)}, content, core.ScriptKindJS)
	if sourceFile == nil {
		return bindings
	}
	// The `const x = registerPureFn(…, 'id'); export {x as y}` shape a bundler
	// emits binds through a file-local name.
	fileLocals := map[string]string{}
	exports := map[string]string{}
	for _, statement := range sourceFile.Statements.Nodes {
		switch statement.Kind {
		case ast.KindVariableStatement:
			exported := ast.GetCombinedModifierFlags(statement)&ast.ModifierFlagsExport != 0
			for _, declarator := range statement.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes {
				nameNode := declarator.Name()
				if nameNode == nil || nameNode.Kind != ast.KindIdentifier {
					continue
				}
				if id := registrationID(declarator.Initializer()); id != "" {
					fileLocals[nameNode.Text()] = id
					bindings = append(bindings, nameBinding{nameNode.Text(), id})
					if exported {
						exports[nameNode.Text()] = id
					}
				}
			}
		case ast.KindExportDeclaration:
			exportDecl := statement.AsExportDeclaration()
			if exportDecl.ModuleSpecifier != nil || exportDecl.ExportClause == nil || exportDecl.ExportClause.Kind != ast.KindNamedExports {
				continue
			}
			for _, specifier := range exportDecl.ExportClause.AsNamedExports().Elements.Nodes {
				exportSpecifier := specifier.AsExportSpecifier()
				local := exportSpecifier.Name()
				if exportSpecifier.PropertyName != nil {
					local = exportSpecifier.PropertyName
				}
				if local == nil || exportSpecifier.Name() == nil {
					continue
				}
				if id, ok := fileLocals[local.Text()]; ok {
					exports[exportSpecifier.Name().Text()] = id
					bindings = append(bindings, nameBinding{exportSpecifier.Name().Text(), id})
				}
			}
		case ast.KindExpressionStatement:
			// CommonJS: `exports.x = …` / `module.exports.x = …`.
			expression := statement.AsExpressionStatement().Expression
			if expression == nil || expression.Kind != ast.KindBinaryExpression {
				continue
			}
			binary := expression.AsBinaryExpression()
			if binary.OperatorToken.Kind != ast.KindEqualsToken || !isExportsMember(binary.Left) {
				continue
			}
			if id := registrationID(binary.Right); id != "" {
				name := binary.Left.AsPropertyAccessExpression().Name().Text()
				exports[name] = id
				bindings = append(bindings, nameBinding{name, id})
			}
		}
	}
	if len(exports) > 0 {
		idx.exportsByFile[path] = exports
	}
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		if node.Kind == ast.KindArrayLiteralExpression {
			if entry, ok := tupleEntry(node, content); ok {
				if _, dup := idx.Rows[entry.ID]; !dup {
					idx.Rows[entry.ID] = entry
				}
			}
		}
		node.ForEachChild(visit)
		return false
	}
	sourceFile.AsNode().ForEachChild(visit)
	return bindings
}

// registrationID returns the id literal a registration call carries as its last
// argument (`registerPureFn(<tuple>, '<id>')`, or the CommonJS
// `(0, m.registerPureFn)(<tuple>, '<id>')`), or "" when the expression is not
// such a call. Any callee is accepted: a minifier may rename the import, and
// the id's later match against the rows is what makes the binding real.
func registrationID(expression *ast.Node) string {
	expression = unwrapParens(expression)
	if expression == nil || expression.Kind != ast.KindCallExpression {
		return ""
	}
	arguments := expression.AsCallExpression().Arguments
	if arguments == nil || len(arguments.Nodes) < 2 {
		return ""
	}
	last := arguments.Nodes[len(arguments.Nodes)-1]
	if !isStringLiteral(last) || !strings.Contains(last.Text(), "#") {
		return ""
	}
	return last.Text()
}

func isExportsMember(node *ast.Node) bool {
	if node == nil || node.Kind != ast.KindPropertyAccessExpression {
		return false
	}
	receiver := node.AsPropertyAccessExpression().Expression
	if receiver == nil {
		return false
	}
	if receiver.Kind == ast.KindIdentifier {
		return receiver.Text() == "exports"
	}
	if receiver.Kind == ast.KindPropertyAccessExpression {
		inner := receiver.AsPropertyAccessExpression()
		return inner.Expression != nil && inner.Expression.Kind == ast.KindIdentifier && inner.Expression.Text() == "module" && inner.Name().Text() == "exports"
	}
	return false
}

func unwrapParens(node *ast.Node) *ast.Node {
	for node != nil && node.Kind == ast.KindParenthesizedExpression {
		node = node.AsParenthesizedExpression().Expression
	}
	return node
}

func isStringLiteral(node *ast.Node) bool {
	return node != nil && (node.Kind == ast.KindStringLiteral || node.Kind == ast.KindNoSubstitutionTemplateLiteral)
}

// tupleEntry reads a pure-fn entry tuple off an array literal: slot 0 the kind
// `2`, slot 3 the id, then paramNames, code and deps. In `functions` emit mode
// the code slot is a hole and the body is the function literal in the factory
// slot, whose block text is exactly the code the build wrote.
func tupleEntry(node *ast.Node, content string) (purefunctions.Entry, bool) {
	elements := node.AsArrayLiteralExpression().Elements.Nodes
	if len(elements) <= slotDeps {
		return purefunctions.Entry{}, false
	}
	if elements[0].Kind != ast.KindNumericLiteral || elements[0].Text() != tupleKindPureFn || !isStringLiteral(elements[slotKey]) {
		return purefunctions.Entry{}, false
	}
	if _, _, isID := purefunctions.SplitID(elements[slotKey].Text()); !isID {
		return purefunctions.Entry{}, false
	}
	paramNames, ok := stringArray(elements[slotParams])
	if !ok {
		return purefunctions.Entry{}, false
	}
	deps, ok := stringArray(elements[slotDeps])
	if !ok {
		return purefunctions.Entry{}, false
	}
	code := ""
	switch {
	case isStringLiteral(elements[slotCode]):
		code = elements[slotCode].Text()
	case len(elements) > slotFactory && ast.IsFunctionLike(elements[slotFactory]) && elements[slotFactory].Body() != nil:
		body := elements[slotFactory].Body()
		text := strings.TrimSpace(content[body.Pos():body.End()])
		if !strings.HasPrefix(text, "{") || !strings.HasSuffix(text, "}") {
			return purefunctions.Entry{}, false
		}
		code = text[1 : len(text)-1]
	default:
		return purefunctions.Entry{}, false
	}
	return purefunctions.Entry{
		ID:                 elements[slotKey].Text(),
		ParamNames:         paramNames,
		Code:               code,
		PureFnDependencies: deps,
	}, true
}

func stringArray(node *ast.Node) ([]string, bool) {
	if node == nil || node.Kind != ast.KindArrayLiteralExpression {
		return nil, false
	}
	elements := node.AsArrayLiteralExpression().Elements.Nodes
	out := make([]string, 0, len(elements))
	for _, element := range elements {
		if !isStringLiteral(element) {
			return nil, false
		}
		out = append(out, element.Text())
	}
	return out, true
}
