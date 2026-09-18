// Package builtinpurefns serves the marker package's own pure-fn bodies to a
// build that cannot extract them itself. For a published consumer the marker
// package enters the program as `.d.ts` only, so the resolver's program extractor
// never walks the registrations — yet the emitted validators reference them, and
// the dist ships hollowed (scripts/core/hollow-builtin-purefns.mjs) so the bodies
// are not in it either.
//
// The bodies come from the marker package's own TypeScript sources, which the
// tarball ships (`files` carries `src`). Nothing about an id says where its body
// lives: an id is the package plus a hash of the body that ships. So a demanded
// id is MATCHED against what the sources produce, never decoded.
//
// Producing the ids is not this package's job. purefunctions already resolves a
// registration recursively and memoises it (purefunctions/resolve.go): an id is
// the hash of a body carrying its dependencies' ids, so answering "what is this
// id" is the work that produces the code the cache stores, and a dependency in
// another file is followed through its import. This package only decides WHICH
// files to hand that resolver and indexes what comes back.
//
// Which files: the ones that call a registrar, found by reading the package's
// sources. A file that registers a pure fn contains the call by definition, so
// nothing can be missed. The two alternatives both can: following imports from
// the entry points drops circular-pure-fns.ts, which is side-effect imported by
// no one, and a hand-declared list drops whatever someone forgets to add.
// cmd/gen-builtin-purefns runs the same scan, so the id constants and the served
// bodies cannot come from different files.
//
// Whose resolver: the session's, whenever the session's Program already holds
// those files (in-repo the `source` condition puts them there). One resolver and
// one memo mean the ids here cannot disagree with the ids everywhere else. Only a
// program that does NOT hold them — a published consumer — pays for a Program of
// this package's own.
package builtinpurefns

import (
	"context"
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/tspath"
	vfspkg "github.com/microsoft/typescript-go/shim/vfs"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
)

// Host is the session side of the loader: the Program whose files and resolver
// are reused when they already cover the marker package, and the knobs a Program
// of our own must inherit so an overlay-served package and the single-threaded
// lane behave the same either way.
type Host struct {
	Program    *program.Program
	Checker    *checker.Checker
	MarkerOpts marker.Options
	Cache      *purefunctions.FileCache
	// SingleThreaded mirrors the session's own setting for a Program we build.
	SingleThreaded bool
}

// PackageProgram is what opening a package's own sources needs when there is no
// session Program covering them: the generator passes a zero value (read from
// disk), a session passes its overlay and FS so a virtually-served package
// resolves the same.
type PackageProgram struct {
	Overlay        map[string]string
	FS             vfspkg.FS
	SingleThreaded bool
}

// Loader serves the marker package's pure-fn bodies, extracted once.
// Zero value is unusable; build one with New.
type Loader struct {
	packageRoot string
	host        Host
	byID        map[string]purefunctions.Entry
	loaded      bool
}

// New binds a loader to the marker package root a session resolved (the
// directory holding its package.json).
func New(packageRoot string, host Host) *Loader {
	return &Loader{packageRoot: packageRoot, host: host}
}

// Closure returns the entries for the demanded ids plus the transitive closure of
// their built-in dependencies, and the sorted ids the marker sources did not
// produce. A non-empty `missing` is a build error at the call site: delivery is
// build-owned, so there is no runtime registration lane left to cover a built-in
// the emitters referenced but the sources never registered.
//
// The dependency walk is about DELIVERY, not about ids: a dependent body calls
// `utl.getPureFn('<dep id>')`, so the dep's module has to be emitted and
// registered too. The ids themselves already came out of the resolver.
//
// err is the harder failure: the marker sources could not be read or type checked
// at all, which no diagnostic about an individual id would describe.
func (loader *Loader) Closure(demanded []string) (entries []purefunctions.Entry, missing []string, err error) {
	if err := loader.load(); err != nil {
		return nil, nil, err
	}
	seen := make(map[string]bool, len(demanded))
	var missed []string
	queue := append([]string(nil), demanded...)
	for len(queue) > 0 {
		id := queue[len(queue)-1]
		queue = queue[:len(queue)-1]
		if seen[id] {
			continue
		}
		entry, ok := loader.byID[id]
		if !ok {
			missed = append(missed, id)
			continue
		}
		seen[id] = true
		entries = append(entries, entry)
		for _, dep := range entry.PureFnDependencies {
			if purefnids.Has(dep) && !seen[dep] {
				queue = append(queue, dep)
			}
		}
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Key() < entries[j].Key() })
	return entries, dedupeSorted(missed), nil
}

// load extracts the marker package's sources once. A failure leaves the loader
// unloaded so a later request retries, the way a fixed install heals without a
// respawn.
func (loader *Loader) load() error {
	if loader.loaded {
		return nil
	}
	entries, err := loader.extract()
	if err != nil {
		return err
	}
	loader.byID = make(map[string]purefunctions.Entry, len(entries))
	for _, entry := range entries {
		loader.byID[entry.ID] = served(entry)
	}
	loader.loaded = true
	return nil
}

// extract prefers the session's own Program: when it already holds the marker
// package's sources every id resolves against the session's single resolver, and
// no second Program is built.
func (loader *Loader) extract() ([]purefunctions.Entry, error) {
	// No session Program (a test, or a caller that only wants the bodies) reads the
	// package straight off disk.
	if loader.host.Program == nil {
		return ExtractPackage(loader.packageRoot, PackageProgram{SingleThreaded: loader.host.SingleThreaded})
	}
	files, err := SourceFiles(loader.packageRoot, loader.host.Program.FS)
	if err != nil {
		return nil, err
	}
	// Every source already in the session's program means the session's
	// resolver can answer for all of them, which is the case that must not build a
	// second Program: two resolvers would hash the same bodies twice.
	if allInProgram(loader.host.Program, files) {
		return runExtractor(loader.host.Checker, loader.host.MarkerOpts, loader.host.Program, files, loader.host.Cache)
	}
	return ExtractPackage(loader.packageRoot, PackageProgram{
		Overlay:        loader.host.Program.Overlay,
		FS:             loader.host.Program.FS,
		SingleThreaded: loader.host.SingleThreaded,
	})
}

// ExtractPackage opens a package's own sources and resolves every pure fn in
// them: the published-consumer lane, and the same call cmd/gen-builtin-purefns
// generates the id constants from, so the constants and the served bodies can
// never come from different files.
func ExtractPackage(packageRoot string, opts PackageProgram) ([]purefunctions.Entry, error) {
	files, err := SourceFiles(packageRoot, opts.FS)
	if err != nil {
		return nil, err
	}
	prog, err := program.NewInferred(program.Options{
		Cwd:            packageRoot,
		SingleThreaded: opts.SingleThreaded,
		Overlay:        opts.Overlay,
	}, files)
	if err != nil {
		return nil, fmt.Errorf("build a program over %s: %w", packageRoot, err)
	}
	for _, file := range files {
		if prog.SourceFile(file) == nil {
			return nil, fmt.Errorf("%s is missing from the installed package", file)
		}
	}
	typeChecker, release := prog.TS.GetTypeChecker(context.Background())
	defer release()
	markerOpts := marker.WithDefaults(marker.Options{})
	markerOpts.FS = prog.FS
	markerOpts.Cwd = prog.Cwd

	return runExtractor(typeChecker, markerOpts, prog, files, purefunctions.NewFileCache())
}

// runExtractor is the one call into purefunctions. A diagnostic over the marker
// package's OWN sources is not a user error to report against their code; it
// means the installed sources are broken, truncated, or hold a dependency cycle.
func runExtractor(typeChecker *checker.Checker, markerOpts marker.Options, lookup purefunctions.SourceFileLookup, files []string, cache *purefunctions.FileCache) ([]purefunctions.Entry, error) {
	entries, diags := purefunctions.ExtractFromProgramCached(typeChecker, markerOpts, lookup, files, cache)
	if len(diags) > 0 {
		return nil, fmt.Errorf("extractor rejected %s (%s %v)", diags[0].Site.FilePath, diags[0].Code, diags[0].Args)
	}
	if len(entries) == 0 {
		return nil, fmt.Errorf("no pure-fn registrations found in %v", files)
	}
	return entries, nil
}

// allInProgram reports whether every path is a file of prog. A published consumer
// has the marker package as declarations only, so none of its sources are there.
func allInProgram(prog *program.Program, files []string) bool {
	for _, file := range files {
		if prog.SourceFile(file) == nil {
			return false
		}
	}
	return len(files) > 0
}

// sourceDir is where a package keeps the TypeScript the scan looks through. The
// tarball ships it (`files` carries `src`), which is the whole reason the bodies
// are reachable at all.
const sourceDir = "src"

// registrarNeedle is what a file that registers a pure fn contains.
// `registerPureFnFactory` has it as a prefix, so one needle covers both
// registrars. It finds a DIRECT registrar call: a package registering through a
// wrapper function of its own would name the registrar only in the wrapper's
// module, and the scan would miss it. That case belongs to whoever generalises
// this lane to third-party packages; the marker package calls the registrars
// directly.
const registrarNeedle = "registerPureFn"

// SourceFiles are the package's files that register a pure fn, found by reading
// its sources and keeping the ones that call a registrar. A file that registers
// contains the call by definition, so nothing can be missed the way a declared
// list or a walk of the import graph can miss it (the marker package's
// circular-pure-fns.ts is side-effect imported by nothing at all).
//
// Spec and test files are skipped because the tarball excludes them: including
// them in-repo would make the file set differ between the repo and a consumer.
func SourceFiles(packageRoot string, fileSystem vfspkg.FS) ([]string, error) {
	root := tspath.CombinePaths(packageRoot, sourceDir)
	var files []string
	err := eachSourceFile(root, fileSystem, func(path, content string) {
		if strings.Contains(content, registrarNeedle) {
			files = append(files, path)
		}
	})
	if err != nil {
		return nil, err
	}
	if len(files) == 0 {
		return nil, fmt.Errorf("no file under %s registers a pure function (is the install missing its sources?)", root)
	}
	sort.Strings(files)
	return files, nil
}

// eachSourceFile reads every candidate `.ts` file under dir, depth first.
//
// It descends through GetAccessibleEntries rather than the FS's WalkDir: WalkDir
// on an overlay filesystem delegates to the real disk and never sees a virtually
// served package, while GetAccessibleEntries merges the overlay in. Every test
// that mounts the marker package in an overlay depends on that difference.
func eachSourceFile(dir string, fileSystem vfspkg.FS, visit func(path, content string)) error {
	entries, err := readDir(dir, fileSystem)
	if err != nil {
		return err
	}
	for _, name := range entries.Files {
		if !isCandidate(name) {
			continue
		}
		path := tspath.CombinePaths(dir, name)
		content, err := readFile(path, fileSystem)
		if err != nil {
			return err
		}
		visit(path, content)
	}
	for _, name := range entries.Directories {
		if err := eachSourceFile(tspath.CombinePaths(dir, name), fileSystem, visit); err != nil {
			return err
		}
	}
	return nil
}

// isCandidate keeps authored TypeScript only: a declaration file carries no body,
// and a spec or test file is not in the tarball.
func isCandidate(name string) bool {
	if !strings.HasSuffix(name, ".ts") || strings.HasSuffix(name, ".d.ts") {
		return false
	}
	return !strings.HasSuffix(name, ".spec.ts") && !strings.HasSuffix(name, ".test.ts")
}

// readDir lists a directory through the program FS when there is one (so an
// overlay-served package is visible) and falls back to disk, which is what the
// generator gets.
func readDir(dir string, fileSystem vfspkg.FS) (vfspkg.Entries, error) {
	if fileSystem != nil {
		if !fileSystem.DirectoryExists(dir) {
			return vfspkg.Entries{}, fmt.Errorf("cannot read %s", dir)
		}
		return fileSystem.GetAccessibleEntries(dir), nil
	}
	found, err := os.ReadDir(dir)
	if err != nil {
		return vfspkg.Entries{}, fmt.Errorf("cannot read %s: %w", dir, err)
	}
	var entries vfspkg.Entries
	for _, entry := range found {
		if entry.IsDir() {
			entries.Directories = append(entries.Directories, entry.Name())
			continue
		}
		entries.Files = append(entries.Files, entry.Name())
	}
	return entries, nil
}

func readFile(path string, fileSystem vfspkg.FS) (string, error) {
	if fileSystem != nil {
		if content, ok := fileSystem.ReadFile(path); ok {
			return content, nil
		}
		return "", fmt.Errorf("cannot read %s", path)
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("cannot read %s: %w", path, err)
	}
	return string(content), nil
}

// served strips the source-position bookkeeping off an extracted entry, keeping
// only what a DELIVERED body needs. Those fields (FactoryArgStart/End,
// IDInjectPos/Text, FilePath) drive the rewrite of the call site an entry came
// from, and a served built-in's call site is inside the installed marker package:
// rewriting it would dangle an import into a consumer's dependency and strip the
// registration the runtime falls back on. Carrying them is the one way this lane
// can silently break, so the projection is explicit rather than a matter of which
// fields happen to be read downstream. BindingName stays: a diagnostic and the
// build report name a built-in by it, the hash being unreadable.
func served(entry purefunctions.Entry) purefunctions.Entry {
	return purefunctions.Entry{
		ID:                 entry.ID,
		BindingName:        entry.BindingName,
		ParamNames:         emptyToNil(entry.ParamNames),
		Code:               entry.Code,
		PureFnDependencies: emptyToNil(entry.PureFnDependencies),
	}
}

// emptyToNil normalises an empty slice to nil so a served entry compares equal
// however the extractor spelled "none".
func emptyToNil(xs []string) []string {
	if len(xs) == 0 {
		return nil
	}
	return xs
}

func dedupeSorted(xs []string) []string {
	if len(xs) == 0 {
		return nil
	}
	seen := make(map[string]bool, len(xs))
	out := make([]string, 0, len(xs))
	for _, x := range xs {
		if !seen[x] {
			seen[x] = true
			out = append(out, x)
		}
	}
	sort.Strings(out)
	return out
}
