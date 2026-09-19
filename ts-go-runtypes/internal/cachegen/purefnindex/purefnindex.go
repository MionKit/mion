// Package purefnindex reads the pure functions an INSTALLED package ships, so a consumer whose program sees only
// that package's `.d.ts` still gets the bodies at build time, emitted into its own modules and checked as an
// edge. One lane for every package, the marker package included. The artifact comes first: every mion build
// copies its own pure-fn cache modules into `mion-pure-fns/` in its output dir (constants.PureFnArtifactDir;
// shape in artifact.go), read wherever it sits under the package root and never a bundle. The index is decoded
// on first touch (a `.d.ts` import carries a NAME, never an id) and a module opened only for a demanded id, so
// memory follows what the consumer uses. Source second: with no artifact, rows are extracted from the shipped
// TypeScript by the same extractor a build runs. The marker package lives there today (hollowed dist, `src` in
// the tarball), through the GENERATED list purefnids.SourceFiles rather than a scan, since that layout is fixed
// when the binary is built; any other package is scanned for a registrar call. An id says nothing about where
// its body lives, so a demanded id is MATCHED against what came back, never decoded. The resolver is the
// session's whenever its program already holds the files (in-repo, the `source` condition puts the marker
// sources there): one resolver and one memo mean the ids here cannot disagree with the program's own
// extraction, and only a package the program does not hold pays for a side Program. Everything goes through
// the program FS, so an overlay-only package behaves like an installed one.
package purefnindex

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/tspath"
	vfspkg "github.com/microsoft/typescript-go/shim/vfs"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

// RegistrarNeedle marks a source file that registers a pure fn; `registerPureFnFactory` shares the prefix. Only a
// DIRECT call is found: a package registering through a wrapper of its own must ship the artifact instead.
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

// ArtifactProblem is an artifact file the index could not use (a bad or newer index, a listed module missing or
// without its tuple); reported, since a skipped artifact makes a package look unbuilt or lacking an id.
type ArtifactProblem struct {
	Package string
	File    string
	Reason  string
}

// ArtifactConflict is one id two artifact directories of a package disagree on, by body or by index row (builds
// that drifted apart, or a stale copy). The first copy read is kept, but the build must fail: one id is one body.
type ArtifactConflict struct {
	Package string
	ID      string
	Files   [2]string
}

// PackageIndex is what one installed package ships, from its artifact indexes (bodies read on demand) or from its sources.
type PackageIndex struct {
	Root string
	// Name is the package.json name, the owner half of every id the package
	// owns; empty for a nameless package.
	Name string
	// FromSource: no artifact was found, so the rows came from the package's sources.
	FromSource bool
	// Err is why the sources could not be extracted: a listed file the install lacks, or the extractor rejecting
	// them. Only set when no artifact was found; a package with no sources has none.
	Err error
	// Problems and Conflicts are what reading the artifacts turned up: the index on first touch, each module when demanded.
	Problems  []ArtifactProblem
	Conflicts []ArtifactConflict
	// listed maps an id to the artifact directories listing it, in walk order; the first serves the module.
	listed map[string][]string
	// indexOf is the index file an id was first read from, named by the conflict a second index raises.
	indexOf map[string]string
	// rows are read from a module on demand, or all at once from source; unreadable marks an id whose module
	// failed, so a second demand neither re-reads nor re-reports it.
	rows       map[string]purefunctions.Entry
	unreadable map[string]bool
	// byName maps a binding name to the ids under it anywhere in the package; two answer only through the file tiebreak.
	byName map[string][]string
	// rowFile is each row's source file relative to Root, when known.
	rowFile map[string]string
	store   *Store
}

// Built reports whether the package ships a pure fn the build can serve; with none, its registrations exist only at runtime.
func (idx *PackageIndex) Built() bool { return len(idx.listed) > 0 || len(idx.rows) > 0 }

// IDs lists every id the package ships, sorted.
func (idx *PackageIndex) IDs() []string {
	seen := map[string]bool{}
	var ids []string
	for id := range idx.listed {
		seen[id] = true
		ids = append(ids, id)
	}
	for id := range idx.rows {
		if !seen[id] {
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)
	return ids
}

// Package returns the index of the package rooted at root, reading it on first
// use. root is the directory holding its package.json.
func (store *Store) Package(root string) *PackageIndex {
	root = tspath.NormalizePath(root)
	if idx, ok := store.packages[root]; ok {
		return idx
	}
	idx := &PackageIndex{Root: root, listed: map[string][]string{}, indexOf: map[string]string{}, rows: map[string]purefunctions.Entry{}, unreadable: map[string]bool{}, byName: map[string][]string{}, rowFile: map[string]string{}, store: store}
	// Registered before the read, so a package whose sources import its own binding finds the index under construction.
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
	for _, dir := range store.artifactDirsUnder(root) {
		file := tspath.CombinePaths(dir, constants.PureFnArtifactIndexFile)
		content, ok := store.fs.ReadFile(file)
		if !ok {
			idx.Problems = append(idx.Problems, ArtifactProblem{Package: idx.Name, File: file, Reason: "missing"})
			continue
		}
		index, err := ParseArtifactIndex([]byte(content))
		if err != nil {
			idx.Problems = append(idx.Problems, ArtifactProblem{Package: idx.Name, File: file, Reason: err.Error()})
			continue
		}
		// A vendored copy of another package's artifact, or one under a nameless root, is not this package's.
		if index.Package != idx.Name {
			continue
		}
		idx.addIndex(dir, file, index)
	}
	if len(idx.listed) == 0 {
		store.extractSource(idx)
	}
	return idx
}

// addIndex records one directory's index. A repeated id is a second build of the package (ESM and CJS both write
// the directory): a conflict if its name or file differs, listed either way so the bodies are compared on demand.
func (idx *PackageIndex) addIndex(dir, file string, index ArtifactIndex) {
	for _, row := range index.PureFns {
		if first, dup := idx.indexOf[row.ID]; dup {
			if idx.rowFile[row.ID] != row.File || idx.nameOf(row.ID) != row.BindingName {
				idx.Conflicts = append(idx.Conflicts, ArtifactConflict{Package: idx.Name, ID: row.ID, Files: [2]string{first, file}})
			}
		} else {
			idx.indexOf[row.ID] = file
			idx.addName(row.BindingName, row.ID)
			if row.File != "" {
				idx.rowFile[row.ID] = row.File
			}
		}
		idx.listed[row.ID] = append(idx.listed[row.ID], dir)
	}
}

func (idx *PackageIndex) addName(name, id string) {
	if name == "" {
		return
	}
	idx.byName[name] = append(idx.byName[name], id)
}

// nameOf is the binding name an id was first listed under.
func (idx *PackageIndex) nameOf(id string) string {
	for name, ids := range idx.byName {
		for _, candidate := range ids {
			if candidate == id {
				return name
			}
		}
	}
	return ""
}

// Row returns the served row, reading the id's module on first demand from every directory listing it; the
// first readable copy is kept, a differing one is a conflict.
func (idx *PackageIndex) Row(id string) (purefunctions.Entry, bool) {
	if row, ok := idx.rows[id]; ok {
		return row, true
	}
	dirs := idx.listed[id]
	if len(dirs) == 0 || idx.unreadable[id] {
		return purefunctions.Entry{}, false
	}
	var kept purefunctions.Entry
	keptFile := ""
	for _, dir := range dirs {
		file := tspath.CombinePaths(dir, ModulePath(id))
		content, ok := idx.store.fs.ReadFile(file)
		if !ok {
			idx.Problems = append(idx.Problems, ArtifactProblem{Package: idx.Name, File: file, Reason: "listed in " + constants.PureFnArtifactIndexFile + " but missing"})
			continue
		}
		entry, err := ReadModule(id, content)
		if err != nil {
			idx.Problems = append(idx.Problems, ArtifactProblem{Package: idx.Name, File: file, Reason: err.Error()})
			continue
		}
		entry.BindingName = idx.nameOf(id)
		if keptFile == "" {
			kept, keptFile = entry, file
			continue
		}
		if !reflect.DeepEqual(kept, entry) {
			idx.Conflicts = append(idx.Conflicts, ArtifactConflict{Package: idx.Name, ID: id, Files: [2]string{keptFile, file}})
		}
	}
	if keptFile == "" {
		idx.unreadable[id] = true
		return purefunctions.Entry{}, false
	}
	idx.rows[id] = kept
	return kept, true
}

// walk visits root and every directory under it, skipping a nested node_modules (another package) and hidden
// dirs (`.mion`, `.git`: a build's scratch, holding served COPIES of other packages' rows). visit says whether to
// descend. Every child is visited before any is descended, so a shallower match is listed before a deeper one.
func (store *Store) walk(root string, visit func(dir string, entries vfspkg.Entries) bool) {
	if !store.fs.DirectoryExists(root) {
		return
	}
	var walkDir func(dir string, entries vfspkg.Entries)
	walkDir = func(dir string, entries vfspkg.Entries) {
		names := append([]string(nil), entries.Directories...)
		sort.Strings(names)
		var descend []string
		var descendEntries []vfspkg.Entries
		for _, name := range names {
			if name == "node_modules" || strings.HasPrefix(name, ".") {
				continue
			}
			child := tspath.CombinePaths(dir, name)
			childEntries := store.fs.GetAccessibleEntries(child)
			if visit(child, childEntries) {
				descend = append(descend, child)
				descendEntries = append(descendEntries, childEntries)
			}
		}
		for i, child := range descend {
			walkDir(child, descendEntries[i])
		}
	}
	rootEntries := store.fs.GetAccessibleEntries(root)
	if visit(root, rootEntries) {
		walkDir(root, rootEntries)
	}
}

// artifactDirsUnder lists the artifact directories under root in walk order; one holds only modules, so it is not descended.
func (store *Store) artifactDirsUnder(root string) []string {
	var dirs []string
	store.walk(root, func(dir string, entries vfspkg.Entries) bool {
		if IsArtifactDir(tspath.GetBaseFileName(dir)) && dir != root {
			dirs = append(dirs, dir)
			return false
		}
		return true
	})
	return dirs
}

func (store *Store) filesUnder(root string, keep func(name string) bool) []string {
	var files []string
	store.walk(root, func(dir string, entries vfspkg.Entries) bool {
		names := append([]string(nil), entries.Files...)
		sort.Strings(names)
		for _, name := range names {
			if keep(name) {
				files = append(files, tspath.CombinePaths(dir, name))
			}
		}
		return true
	})
	return files
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
		idx.rows[entry.Key()] = served(entry)
		idx.addName(entry.BindingName, entry.Key())
		if rel := relativeToRoot(idx.Root, entry.FilePath); rel != "" {
			idx.rowFile[entry.Key()] = rel
		}
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

// PackageOfID is the owner half of an id (`@acme/text#pf_9Zt1…` → `@acme/text`); empty when not an id or nameless.
func PackageOfID(id string) string {
	packageName, _, ok := purefunctions.SplitID(id)
	if !ok {
		return ""
	}
	return packageName
}

// BindingID maps a `.d.ts` name to the id the package registers it under: a declaration is emitted from the same
// binding as the registration. Two rows sharing a name are told apart by basename (`dist/slug.d.ts` comes from
// `src/slug.ts`); still ambiguous answers nothing.
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
	ids := idx.byName[name]
	if len(ids) == 1 {
		return ids[0], true
	}
	if len(ids) == 0 {
		return "", false
	}
	base := moduleBasename(dtsPath)
	var matches []string
	for _, id := range ids {
		if file, known := idx.rowFile[id]; known && moduleBasename(file) == base {
			matches = append(matches, id)
		}
	}
	if len(matches) == 1 {
		return matches[0], true
	}
	return "", false
}

// UnbuiltPackage answers marker.PureFnBindingResolver: the package of dtsPath when it ships neither an artifact
// nor sources. A nameless root owns no id, so it is never unbuilt.
func (store *Store) UnbuiltPackage(dtsPath string) (string, bool) {
	if store.fs == nil {
		return "", false
	}
	name, root := marker.PackageOfFile(dtsPath, store.fs)
	if root == "" || name == "" || store.Package(root).Built() {
		return "", false
	}
	return name, true
}

// moduleBasename strips directory and every extension: `dist/slug.d.ts` → `slug`.
func moduleBasename(path string) string {
	name := tspath.GetBaseFileName(tspath.NormalizePath(path))
	if dot := strings.IndexByte(name, '.'); dot > 0 {
		name = name[:dot]
	}
	return name
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

// Result is what Closure found: Entries sorted by id with every transitive dep, and Unresolved left to the
// program's own registrations and its PFE9012 check.
type Result struct {
	Entries    []purefunctions.Entry
	Missing    []Miss
	Unresolved []string
	Problems   []ArtifactProblem
	Conflicts  []ArtifactConflict
}

// Closure serves every demanded id plus its transitive deps, each resolved from the root of the package whose
// row names it; a dep on the row's own package stays at that root, so a nested copy never resolves to a hoisted
// sibling. Problems and conflicts are collected after the walk, since reading a module can add them.
func (store *Store) Closure(demands []Demand) Result {
	var result Result
	seen := map[string]bool{}
	visited := map[string]*PackageIndex{}
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
		visited[idx.Root] = idx
		row, found := idx.Row(demand.ID)
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
	for _, idx := range visited {
		result.Problems = append(result.Problems, idx.Problems...)
		result.Conflicts = append(result.Conflicts, idx.Conflicts...)
	}
	sort.Slice(result.Entries, func(i, j int) bool { return result.Entries[i].Key() < result.Entries[j].Key() })
	sort.Strings(result.Unresolved)
	sort.Slice(result.Missing, func(i, j int) bool { return result.Missing[i].ID < result.Missing[j].ID })
	sort.Slice(result.Problems, func(i, j int) bool { return result.Problems[i].File < result.Problems[j].File })
	sort.Slice(result.Conflicts, func(i, j int) bool { return result.Conflicts[i].ID < result.Conflicts[j].ID })
	return result
}
