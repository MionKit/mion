package resolver_test

import (
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnindex"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// The package's pure-fn artifact: every generate hands back the package's OWN
// cache modules, byte for byte what it wrote under <genDir>/types/pf/, plus the
// index mapping each binding name and source file to its id, for the adapter
// to sync next to the bundle.

const artifactSources = `import {registerPureFn, registerPureFnFactory} from '@mionjs/run-types';
export const slugify = registerPureFn((s: string): string => s.toLowerCase());
export const title = registerPureFnFactory(function (utl) {
  return function _title(s: string): string { return utl.getPureFn(slugify)(s) + '!'; };
});
`

func generateArtifact(t *testing.T, sources map[string]string, outDir string, moduleMode string) protocol.Response {
	t.Helper()
	r := setupInlineWith(t, sources, func(programOpts *program.Options, resolverOpts *resolver.Options) {
		programOpts.SingleThreaded = true
		resolverOpts.SingleThreaded = true
		resolverOpts.GenDir = outDir
		resolverOpts.TransformRelative = true
		resolverOpts.ModuleMode = moduleMode
	})
	gen := r.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	return gen
}

// parseIndex reads the artifact's index off a generate response.
func parseIndex(t *testing.T, gen protocol.Response) purefnindex.ArtifactIndex {
	t.Helper()
	index, err := purefnindex.ParseArtifactIndex([]byte(gen.PureFnArtifact[constants.PureFnArtifactIndexFile]))
	if err != nil {
		t.Fatalf("index: %v\n%q", err, gen.PureFnArtifact)
	}
	return index
}

func TestPureFnArtifact_GenerateReturnsOwnModulesAndIndex(t *testing.T) {
	outDir := t.TempDir()
	sources := map[string]string{"package.json": `{"name":"@acme/app"}`, "src/text.ts": artifactSources}
	gen := generateArtifact(t, sources, outDir, constants.ModuleModeDefault)
	index := parseIndex(t, gen)
	if index.Package != "@acme/app" || len(index.PureFns) != 2 || len(gen.PureFnArtifact) != 3 {
		t.Fatalf("index = %+v, files = %v", index, keys(gen.PureFnArtifact))
	}
	if index.PureFns[0].ID > index.PureFns[1].ID {
		t.Error("rows must be sorted by id")
	}
	ids := map[string]string{}
	for _, row := range index.PureFns {
		ids[row.BindingName] = row.ID
		if !strings.HasPrefix(row.ID, "@acme/app"+constants.PureFnHashPrefix) || row.File != "src/text.ts" {
			t.Errorf("row = %+v", row)
		}
		// The module is the same file generate wrote under types/pf/.
		path := purefnindex.ModulePath(row.ID)
		module, ok := gen.PureFnArtifact[path]
		if !ok {
			t.Fatalf("no module for %s in %v", row.ID, keys(gen.PureFnArtifact))
		}
		onDisk, err := os.ReadFile(filepath.Join(outDir, "types", constants.PureFnModuleDir, filepath.FromSlash(path)))
		if err != nil || string(onDisk) != module {
			t.Errorf("%s: the artifact module must be the types/pf/ file byte for byte (err %v):\nartifact: %q\ndisk:     %q", row.ID, err, module, onDisk)
		}
		if strings.Contains(module, constants.EntryModulePrefix) {
			t.Errorf("%s: imports must be relativized as on disk: %s", row.ID, module)
		}
	}
	title, err := purefnindex.ReadModule(ids["title"], gen.PureFnArtifact[purefnindex.ModulePath(ids["title"])])
	if err != nil || !strings.Contains(title.Code, "getPureFn('"+ids["slugify"]+"')") || !reflect.DeepEqual(title.PureFnDependencies, []string{ids["slugify"]}) {
		t.Errorf("title must carry its lowered dep (err %v): %+v", err, title)
	}
	// The artifact is not a second module set: nothing of it is in the manifest.
	for _, basename := range gen.Generated {
		if strings.Contains(basename, constants.PureFnArtifactDir) {
			t.Errorf("the artifact leaked into the module manifest: %s", basename)
		}
	}
	if again := generateArtifact(t, sources, outDir, constants.ModuleModeDefault); !reflect.DeepEqual(again.PureFnArtifact, gen.PureFnArtifact) {
		t.Error("the artifact must be byte-stable across runs")
	}
}

// allSingle folds the cache into one `pf` bundle; the artifact is still one
// module per pure fn, each readable on its own, since a consumer reads one
// module per demanded id.
func TestPureFnArtifact_AllSingleIsStillPerEntry(t *testing.T) {
	outDir := t.TempDir()
	gen := generateArtifact(t, map[string]string{"package.json": `{"name":"@acme/app"}`, "src/text.ts": artifactSources}, outDir, constants.ModuleModeAllSingle)
	if _, err := os.Stat(filepath.Join(outDir, "types", constants.PureFnModuleDir+".js")); err != nil {
		t.Fatalf("allSingle must write the pf bundle: %v", err)
	}
	index := parseIndex(t, gen)
	if len(index.PureFns) != 2 || len(gen.PureFnArtifact) != 3 {
		t.Fatalf("index = %+v, files = %v", index, keys(gen.PureFnArtifact))
	}
	for _, row := range index.PureFns {
		entry, err := purefnindex.ReadModule(row.ID, gen.PureFnArtifact[purefnindex.ModulePath(row.ID)])
		if err != nil || entry.Code == "" {
			t.Errorf("%s: per-entry module unreadable (err %v): %+v", row.ID, err, entry)
		}
	}
}

// A package that registers nothing gets no artifact; a nameless cwd owns no
// id and gets none either.
func TestPureFnArtifact_NoRowsMeansNothing(t *testing.T) {
	const typesOnly = `import {getRunTypeId} from '@mionjs/run-types';
export const id = getRunTypeId<{a: number}>();
`
	if gen := generateArtifact(t, map[string]string{"package.json": `{"name":"@acme/app"}`, "src/types.ts": typesOnly}, t.TempDir(), constants.ModuleModeDefault); len(gen.PureFnArtifact) != 0 {
		t.Errorf("no pure fn, no artifact: %v", keys(gen.PureFnArtifact))
	}
	if gen := generateArtifact(t, map[string]string{"src/text.ts": artifactSources}, t.TempDir(), constants.ModuleModeDefault); len(gen.PureFnArtifact) != 0 {
		t.Errorf("a nameless package owns no id: %v", keys(gen.PureFnArtifact))
	}
}

// Only the building package's rows go in: a sibling package the program
// reaches through its sources belongs to its own artifact.
func TestPureFnArtifact_OwnPackageOnly(t *testing.T) {
	sources := map[string]string{
		"package.json": `{"name":"@acme/app"}`,
		"src/text.ts":  artifactSources,
		"src/uses.ts": `import {registerPureFnFactory} from '@mionjs/run-types';
import {pad} from '../packages/util/src/pad.ts';
export const padded = registerPureFnFactory(function (utl) {
  return function _padded(s: string): string { return utl.getPureFn(pad)(s); };
});
`,
		"packages/util/package.json": `{"name":"@acme/util"}`,
		"packages/util/src/pad.ts": `import {registerPureFn} from '@mionjs/run-types';
export const pad = registerPureFn((s: string): string => s.padStart(4, '0'));
`,
	}
	gen := generateArtifact(t, sources, t.TempDir(), constants.ModuleModeDefault)
	index := parseIndex(t, gen)
	if len(index.PureFns) != 3 || len(gen.PureFnArtifact) != 4 {
		t.Errorf("expected the three @acme/app rows and their modules, got %+v %v", index.PureFns, keys(gen.PureFnArtifact))
	}
	crossing := false
	for _, row := range index.PureFns {
		if purefnindex.PackageOfID(row.ID) != "@acme/app" {
			t.Errorf("a foreign row leaked in: %+v", row)
		}
		entry, err := purefnindex.ReadModule(row.ID, gen.PureFnArtifact[purefnindex.ModulePath(row.ID)])
		if err != nil {
			t.Fatalf("%s: %v", row.ID, err)
		}
		for _, dep := range entry.PureFnDependencies {
			if purefnindex.PackageOfID(dep) == "@acme/util" {
				crossing = true // the dep edge crosses packages; the row does not
			}
		}
	}
	if !crossing {
		t.Error("padded must depend on @acme/util's pad")
	}
}

// SyncArtifactDir makes the directory hold exactly the given files: unchanged
// bytes are left alone, stale files and emptied subdirectories go, and an empty
// set removes the directory.
func TestSyncArtifactDir(t *testing.T) {
	dir := filepath.Join(t.TempDir(), constants.PureFnArtifactDir)
	files := map[string]string{constants.PureFnArtifactIndexFile: "{}\n", "@acme/x/h.js": "export const a = 1;\n"}
	if err := resolver.SyncArtifactDir(dir, files); err != nil {
		t.Fatal(err)
	}
	stale := filepath.Join(dir, "@acme", "x", "old.js")
	emptied := filepath.Join(dir, "@acme", "gone", "old.js")
	for _, path := range []string{stale, emptied, filepath.Join(dir, "stray.txt")} {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte("stale"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	kept := filepath.Join(dir, "@acme", "x", "h.js")
	old := time.Now().Add(-time.Hour)
	if err := os.Chtimes(kept, old, old); err != nil {
		t.Fatal(err)
	}
	if err := resolver.SyncArtifactDir(dir, files); err != nil {
		t.Fatal(err)
	}
	var found []string
	if err := filepath.WalkDir(dir, func(path string, entry os.DirEntry, err error) error {
		if err == nil && !entry.IsDir() {
			rel, _ := filepath.Rel(dir, path)
			found = append(found, filepath.ToSlash(rel))
		}
		return err
	}); err != nil {
		t.Fatal(err)
	}
	sort.Strings(found)
	if !reflect.DeepEqual(found, []string{"@acme/x/h.js", constants.PureFnArtifactIndexFile}) {
		t.Errorf("files after sync = %v", found)
	}
	if _, err := os.Stat(filepath.Join(dir, "@acme", "gone")); !os.IsNotExist(err) {
		t.Errorf("an emptied subdirectory must go: %v", err)
	}
	if info, err := os.Stat(kept); err != nil || !info.ModTime().Equal(old) {
		t.Errorf("an unchanged file must not be rewritten: %v %v", info.ModTime(), err)
	}
	if err := resolver.SyncArtifactDir(dir, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Errorf("an empty set must remove the directory: %v", err)
	}
}

// Marker coverage rule: alongside the artifact, both getRunTypeId call shapes
// resolve to one cache entry.
func TestPureFnArtifact_GetRunTypeIdShapesAgree(t *testing.T) {
	sources := map[string]string{
		"package.json": `{"name":"@acme/app"}`,
		"src/text.ts":  artifactSources,
		"static.ts": `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<{slug: string}>();
`,
		"reflect.ts": `import {getRunTypeId} from '@mionjs/run-types';
const value: {slug: string} = {slug: 'x'};
getRunTypeId(value);
`,
	}
	r := setupGen(t, sources, t.TempDir())
	a := resolveFile(t, r, "static.ts")
	b := resolveFile(t, r, "reflect.ts")
	if a.ID == "" || a.ID != b.ID {
		t.Errorf("getRunTypeId<T>() and getRunTypeId(value) must agree: %q vs %q", a.ID, b.ID)
	}
}
