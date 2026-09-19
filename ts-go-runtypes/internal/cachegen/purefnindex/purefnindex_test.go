package purefnindex

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	vfspkg "github.com/microsoft/typescript-go/shim/vfs"
	"github.com/microsoft/typescript-go/shim/vfs/osvfs"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/testfixtures"
)

// Every artifact fixture lives ONLY in the overlay, under /virtual: nothing on
// disk, so a package the index finds was found through the program FS. An id is
// matched, never decoded, so the hash halves here are just distinct strings.

const (
	textPkg   = "/virtual/app/node_modules/@acme/text"
	slugifyID = "@acme/text#pf_slug00000000000"
	titleID   = "@acme/text#pf_title0000000000"
	isoDayID  = "@acme/dates#pf_day00000000000"
	trimID    = "@acme/util#pf_trim00000000000"
	slugCode  = "return (s) => s.toLowerCase();"
)

var (
	slugifyRow = ArtifactRow{ID: slugifyID, BindingName: "slugify", File: "src/slug.ts", ParamNames: []string{"utl"}, Code: slugCode, PureFnDependencies: []string{}}
	titleRow   = ArtifactRow{ID: titleID, BindingName: "title", File: "src/title.ts", ParamNames: []string{"utl"}, Code: "return 1;", PureFnDependencies: []string{slugifyID}}
)

// artifact renders an artifact file for tests, bypassing the sort so a fixture
// can stage rows in any order.
func artifact(packageName string, rows ...ArtifactRow) string {
	payload, err := json.MarshalIndent(Artifact{Format: ArtifactFormat, Package: packageName, PureFns: rows}, "", "  ")
	if err != nil {
		panic(err)
	}
	return string(payload) + "\n"
}

func storeOver(files map[string]string) *Store {
	return NewStore(program.NewOverlayFS(osvfs.FS(), files))
}

func textPackage(files map[string]string) map[string]string {
	all := map[string]string{
		textPkg + "/package.json":    `{"name":"@acme/text"}`,
		textPkg + "/dist/index.d.ts": "import type {PureFnId} from '@mionjs/run-types';\nexport declare const slugify: PureFnId<string>;\n",
	}
	for path, content := range files {
		all[textPkg+path] = content
	}
	return all
}

func codes(entries []purefunctions.Entry) []string {
	out := make([]string, 0, len(entries))
	for _, entry := range entries {
		out = append(out, entry.Key()+"="+entry.Code)
	}
	return out
}

// The artifact in the output dir: its rows are the package's rows, projected
// to the served shape, and a binding name answers an untyped .d.ts import.
func TestArtifact_RowsAndBindingID(t *testing.T) {
	store := storeOver(textPackage(map[string]string{
		"/dist/index.js": "export const slugify = registerPureFn(null);\n",
		"/dist/" + constants.PureFnArtifactFileName: artifact("@acme/text", slugifyRow),
	}))
	idx := store.Package(textPkg)
	if !idx.Built() || idx.Name != "@acme/text" || idx.FromSource {
		t.Fatalf("package not indexed: built=%v name=%q fromSource=%v", idx.Built(), idx.Name, idx.FromSource)
	}
	want := purefunctions.Entry{ID: slugifyID, BindingName: "slugify", ParamNames: []string{"utl"}, Code: slugCode}
	if got := idx.Rows[slugifyID]; !reflect.DeepEqual(got, want) {
		t.Errorf("row = %+v, want %+v", got, want)
	}
	if id, ok := store.BindingID(textPkg+"/dist/index.d.ts", "slugify"); !ok || id != slugifyID {
		t.Errorf("BindingID = %q, %v", id, ok)
	}
	if len(idx.Problems) != 0 || len(idx.Conflicts) != 0 {
		t.Errorf("problems=%+v conflicts=%+v", idx.Problems, idx.Conflicts)
	}
}

// recordingFS counts the files read through it, so a test can prove a bundle
// was never opened.
type recordingFS struct {
	vfspkg.FS
	reads []string
}

func (fs *recordingFS) ReadFile(path string) (string, bool) {
	fs.reads = append(fs.reads, path)
	return fs.FS.ReadFile(path)
}

// A package whose bundle carries the tuples and the registrations but ships
// no artifact is unbuilt: the bundle is never opened, however large, however
// many `<package>#pf_` literals it holds.
func TestArtifact_BundleIsNeverOpened(t *testing.T) {
	bundle := strings.Repeat("const t = [2,,,'"+slugifyID+"',['utl'],'"+slugCode+"',[]];\nexport const slugify = registerPureFn(t, '"+slugifyID+"');\n", 2000)
	fs := &recordingFS{FS: program.NewOverlayFS(osvfs.FS(), textPackage(map[string]string{
		"/dist/index.js":  bundle,
		"/dist/index.mjs": bundle,
		"/dist/index.cjs": bundle,
	}))}
	idx := NewStore(fs).Package(textPkg)
	if idx.Built() {
		t.Fatalf("a bundle must not be read as rows: %v", idx.Rows)
	}
	for _, read := range fs.reads {
		if strings.HasSuffix(read, ".js") || strings.HasSuffix(read, ".mjs") || strings.HasSuffix(read, ".cjs") {
			t.Errorf("a bundle file was opened: %s", read)
		}
	}
	if _, ok := NewStore(fs).BindingID(textPkg+"/dist/index.d.ts", "slugify"); ok {
		t.Error("a name in an unbuilt package must not resolve")
	}
}

// An ESM and a CJS build both write the artifact: identical rows merge into
// one, in any order and wherever the files sit.
func TestArtifact_SecondBuildMergesIdenticalRows(t *testing.T) {
	store := storeOver(textPackage(map[string]string{
		"/dist/esm/" + constants.PureFnArtifactFileName: artifact("@acme/text", slugifyRow, titleRow),
		"/dist/cjs/" + constants.PureFnArtifactFileName: artifact("@acme/text", titleRow, slugifyRow),
	}))
	idx := store.Package(textPkg)
	if len(idx.Rows) != 2 || len(idx.Conflicts) != 0 || len(idx.Problems) != 0 {
		t.Errorf("rows=%d conflicts=%+v problems=%+v", len(idx.Rows), idx.Conflicts, idx.Problems)
	}
	if id, ok := store.BindingID(textPkg+"/dist/index.d.ts", "title"); !ok || id != titleID {
		t.Errorf("a name seen in two artifacts still answers once: %q, %v", id, ok)
	}
}

// Two artifacts giving one id different bodies is a conflict naming both
// files; the first read is kept so the rest of the build can still report.
func TestArtifact_ConflictingBodies(t *testing.T) {
	stale := slugifyRow
	stale.Code = "return (s) => s.toUpperCase();"
	store := storeOver(textPackage(map[string]string{
		"/dist/a/" + constants.PureFnArtifactFileName: artifact("@acme/text", slugifyRow),
		"/dist/b/" + constants.PureFnArtifactFileName: artifact("@acme/text", stale),
	}))
	idx := store.Package(textPkg)
	want := []ArtifactConflict{{Package: "@acme/text", ID: slugifyID, Files: [2]string{textPkg + "/dist/a/" + constants.PureFnArtifactFileName, textPkg + "/dist/b/" + constants.PureFnArtifactFileName}}}
	if !reflect.DeepEqual(idx.Conflicts, want) {
		t.Errorf("conflicts = %+v, want %+v", idx.Conflicts, want)
	}
	if idx.Rows[slugifyID].Code != slugCode {
		t.Errorf("the first row read must be kept, got %q", idx.Rows[slugifyID].Code)
	}
	result := store.Closure([]Demand{{ID: slugifyID, FromDir: "/virtual/app"}})
	if !reflect.DeepEqual(result.Conflicts, want) {
		t.Errorf("closure must surface the conflict of a demanded package: %+v", result.Conflicts)
	}
}

// An artifact from a newer compiler, or a file that is not an artifact, is a
// problem that names the file and the reason; a copy of another package's
// artifact is silently not this package's.
func TestArtifact_UnreadableAndForeign(t *testing.T) {
	newer := strings.Replace(artifact("@acme/text", slugifyRow), `"format": 1`, `"format": 2`, 1)
	store := storeOver(textPackage(map[string]string{
		"/dist/" + constants.PureFnArtifactFileName:   newer,
		"/dist/x/" + constants.PureFnArtifactFileName: "{not json",
		"/dist/y/" + constants.PureFnArtifactFileName: `{"format":1,"package":"@acme/text","pureFns":[{"id":"` + trimID + `"}]}`,
		"/vendor/" + constants.PureFnArtifactFileName: artifact("@acme/util", ArtifactRow{ID: trimID, ParamNames: []string{}, PureFnDependencies: []string{}}),
		"/dist/z/" + constants.PureFnArtifactFileName: `{"package":"@acme/text","pureFns":[]}`,
		"/dist/w/" + constants.PureFnArtifactFileName: `{"format":1,"pureFns":[]}`,
	}))
	idx := store.Package(textPkg)
	if idx.Built() {
		t.Errorf("nothing readable must mean nothing served, got %v", idx.Rows)
	}
	reasons := map[string]string{}
	for _, problem := range idx.Problems {
		reasons[strings.TrimPrefix(problem.File, textPkg+"/")] = problem.Reason
		if problem.Package != "@acme/text" {
			t.Errorf("problem must name the package: %+v", problem)
		}
	}
	for file, want := range map[string]string{
		"dist/" + constants.PureFnArtifactFileName:   "newer artifact format 2 (this compiler reads up to 1)",
		"dist/x/" + constants.PureFnArtifactFileName: "not valid JSON",
		"dist/y/" + constants.PureFnArtifactFileName: `row "` + trimID + `" is not owned by "@acme/text"`,
		"dist/z/" + constants.PureFnArtifactFileName: "missing `format`",
		"dist/w/" + constants.PureFnArtifactFileName: "missing `package`",
	} {
		if got, ok := reasons[file]; !ok || !strings.HasPrefix(got, want) {
			t.Errorf("%s: reason = %q (reported %v), want prefix %q", file, got, ok, want)
		}
	}
	if len(idx.Problems) != 5 {
		t.Errorf("the foreign copy is not a problem: %+v", idx.Problems)
	}
	result := store.Closure([]Demand{{ID: slugifyID, FromDir: "/virtual/app"}})
	if len(result.Problems) != 5 || len(result.Missing) != 1 || result.Missing[0].Built {
		t.Errorf("closure = %+v", result)
	}
}

// One row bound to a name answers it. Two rows bound to one name are told
// apart by the declaration's basename against each row's source file; the
// same basename twice answers nothing, as does a name no row is bound to.
func TestBindingID_NameAndFileTiebreak(t *testing.T) {
	inSlug := ArtifactRow{ID: slugifyID, BindingName: "make", File: "src/slug.ts", ParamNames: []string{}, Code: "return 1;", PureFnDependencies: []string{}}
	inTitle := ArtifactRow{ID: titleID, BindingName: "make", File: "src/title.ts", ParamNames: []string{}, Code: "return 2;", PureFnDependencies: []string{}}
	store := storeOver(textPackage(map[string]string{
		"/dist/" + constants.PureFnArtifactFileName: artifact("@acme/text", inSlug, inTitle),
		"/dist/slug.d.ts":        "export declare const make: string;\n",
		"/dist/title.d.ts":       "export declare const make: string;\n",
		"/dist/types/other.d.ts": "export declare const make: string;\n",
	}))
	if id, ok := store.BindingID(textPkg+"/dist/slug.d.ts", "make"); !ok || id != slugifyID {
		t.Errorf("slug.d.ts make = %q, %v", id, ok)
	}
	if id, ok := store.BindingID(textPkg+"/dist/title.d.ts", "make"); !ok || id != titleID {
		t.Errorf("title.d.ts make = %q, %v", id, ok)
	}
	if id, ok := store.BindingID(textPkg+"/dist/types/other.d.ts", "make"); ok {
		t.Errorf("no basename matches, must not pick one, got %q", id)
	}
	if _, ok := store.BindingID(textPkg+"/dist/slug.d.ts", "nothing"); ok {
		t.Error("a name no registration binds must not resolve")
	}
	sameFile := storeOver(textPackage(map[string]string{
		"/dist/" + constants.PureFnArtifactFileName: artifact("@acme/text", inSlug, ArtifactRow{ID: titleID, BindingName: "make", File: "src/slug.ts", ParamNames: []string{}, Code: "return 2;", PureFnDependencies: []string{}}),
		"/dist/slug.d.ts": "export declare const make: string;\n",
	}))
	if id, ok := sameFile.BindingID(textPkg+"/dist/slug.d.ts", "make"); ok {
		t.Errorf("two rows from one file bound to one name must not pick one, got %q", id)
	}
}

// app → dates → text, with dates carrying its OWN nested copy of text whose
// body differs from the hoisted one: closure resolves each dep from the package
// that names it, so dates' row pulls the nested slugify, never the hoisted one.
func TestClosure_AcrossPackagesFromDependentRoot(t *testing.T) {
	datesPkg := "/virtual/app/node_modules/@acme/dates"
	nestedText := datesPkg + "/node_modules/@acme/text"
	nestedSlug := slugifyRow
	nestedSlug.Code = "return (s) => s;"
	isoDay := ArtifactRow{ID: isoDayID, BindingName: "isoDay", ParamNames: []string{"utl"}, Code: `return utl.getPureFn("` + slugifyID + `");`, PureFnDependencies: []string{slugifyID}}
	files := map[string]string{
		textPkg + "/package.json":                                `{"name":"@acme/text"}`,
		textPkg + "/dist/" + constants.PureFnArtifactFileName:    artifact("@acme/text", slugifyRow),
		datesPkg + "/package.json":                               `{"name":"@acme/dates"}`,
		datesPkg + "/dist/" + constants.PureFnArtifactFileName:   artifact("@acme/dates", isoDay),
		nestedText + "/package.json":                             `{"name":"@acme/text"}`,
		nestedText + "/dist/" + constants.PureFnArtifactFileName: artifact("@acme/text", titleRow, nestedSlug),
	}
	store := storeOver(files)
	result := store.Closure([]Demand{{ID: isoDayID, FromDir: "/virtual/app"}})
	if len(result.Missing) != 0 || len(result.Unresolved) != 0 {
		t.Fatalf("unexpected misses: %+v %+v", result.Missing, result.Unresolved)
	}
	want := []string{isoDayID + `=return utl.getPureFn("` + slugifyID + `");`, slugifyID + "=return (s) => s;"}
	if got := codes(result.Entries); !reflect.DeepEqual(got, want) {
		t.Errorf("closure = %v, want %v", got, want)
	}
	// A same-package dep (title → slugify inside the nested text) answers from
	// that same root, where a Node walk would find no node_modules/@acme/text.
	same := store.Closure([]Demand{{ID: titleID, FromDir: datesPkg}})
	if len(same.Entries) != 2 || same.Entries[0].Code != "return (s) => s;" {
		t.Errorf("same-package closure = %+v", same.Entries)
	}
}

// A located package lacking the row is a miss on a built package; a located
// package with no artifact at all is the runtime-only lane; a package that is
// not installed is unresolved.
func TestClosure_MissingUnbuiltUnresolved(t *testing.T) {
	legacyPkg := "/virtual/app/node_modules/@acme/legacy"
	const padID = "@acme/legacy#pf_pad0000000000"
	store := storeOver(map[string]string{
		textPkg + "/package.json":                             `{"name":"@acme/text"}`,
		textPkg + "/dist/" + constants.PureFnArtifactFileName: artifact("@acme/text", slugifyRow),
		legacyPkg + "/package.json":                           `{"name":"@acme/legacy"}`,
		legacyPkg + "/index.js":                               "export const padId = registerPureFn((s) => s.padStart(4, '0'), '" + padID + "');\n",
	})
	result := store.Closure([]Demand{
		{ID: "@acme/text#pf_gone0000000000", FromDir: "/virtual/app"},
		{ID: padID, FromDir: "/virtual/app"},
		{ID: trimID, FromDir: "/virtual/app"},
		{ID: "#own00000000000", FromDir: "/virtual/app"},
	})
	if len(result.Entries) != 0 {
		t.Errorf("nothing should be served, got %+v", result.Entries)
	}
	wantMissing := []Miss{
		{ID: padID, Package: "@acme/legacy", Root: legacyPkg, Built: false},
		{ID: "@acme/text#pf_gone0000000000", Package: "@acme/text", Root: textPkg, Built: true},
	}
	if !reflect.DeepEqual(result.Missing, wantMissing) {
		t.Errorf("missing = %+v, want %+v", result.Missing, wantMissing)
	}
	if !reflect.DeepEqual(result.Unresolved, []string{"#own00000000000", trimID}) {
		t.Errorf("unresolved = %v", result.Unresolved)
	}
}

func TestPackageOfID(t *testing.T) {
	for id, want := range map[string]string{
		slugifyID:                  "@acme/text",
		"lib#pf_f":                 "lib",
		"#hash":                    "",
		"noseparator":              "",
		purefnids.NewRunTypeErr:    "@mionjs/run-types",
		"@scope/name/deep#pf_hash": "@scope/name/deep",
	} {
		if got := PackageOfID(id); got != want {
			t.Errorf("PackageOfID(%q) = %q, want %q", id, got, want)
		}
	}
}

// A nested node_modules is another package's, and a hidden dir is a build's
// scratch (a consumer's `.mion` holds its own canonical copy and served copies
// of other packages' rows): neither is part of this package's artifacts.
func TestArtifact_SkipsNestedNodeModulesAndHiddenDirs(t *testing.T) {
	util := ArtifactRow{ID: trimID, ParamNames: []string{}, Code: "return 0;", PureFnDependencies: []string{}}
	store := storeOver(map[string]string{
		textPkg + "/package.json":                                                     `{"name":"@acme/text"}`,
		textPkg + "/dist/" + constants.PureFnArtifactFileName:                         artifact("@acme/text", slugifyRow),
		textPkg + "/node_modules/@acme/util/package.json":                             `{"name":"@acme/util"}`,
		textPkg + "/node_modules/@acme/util/dist/" + constants.PureFnArtifactFileName: artifact("@acme/util", util),
		textPkg + "/.mion/types/" + constants.PureFnArtifactFileName:                  artifact("@acme/text", titleRow),
		textPkg + "/test/.mion/types/" + constants.PureFnArtifactFileName:             artifact("@acme/text", titleRow),
	})
	idx := store.Package(textPkg)
	if _, leaked := idx.Rows[trimID]; leaked || len(idx.Rows) != 1 {
		t.Errorf("rows = %v", idx.Rows)
	}
}

// sourceTree stages, under a real temp cwd, the hoisted real marker package plus
// the caller's packages, and returns the store and the cwd.
func sourceTree(t *testing.T, files map[string]string) (*Store, string) {
	t.Helper()
	markerFiles, err := testfixtures.RealMarkerPackage()
	if err != nil {
		t.Fatalf("real marker package unavailable: %v", err)
	}
	cwd := tspath.NormalizePath(t.TempDir())
	overlay := map[string]string{}
	for rel, content := range markerFiles {
		overlay[tspath.ResolvePath(cwd, rel)] = content
	}
	for rel, content := range files {
		overlay[tspath.ResolvePath(cwd, rel)] = content
	}
	store := storeOver(overlay)
	store.Bind(store.fs, Host{SingleThreaded: true})
	return store, cwd
}

const datesSrc = `import {registerPureFnFactory} from '@mionjs/run-types';
import {slugify} from '@acme/text';
export const isoDay = registerPureFnFactory(function (utl) {
  return function _isoDay(d: string): string { return utl.getPureFn(slugify)(d).slice(0, 10); };
});
`

func rowNamed(idx *PackageIndex, name string) (purefunctions.Entry, bool) {
	for _, row := range idx.Rows {
		if row.BindingName == name {
			return row, true
		}
	}
	return purefunctions.Entry{}, false
}

// A package with no artifact (a plain tsc emit) but shipping its TypeScript
// under src/: the rows come from the source, extracted the way its own build
// would, including the dep it imports from an artifact-shipping package's
// untyped .d.ts, and stripped of the positions a rewrite would use.
func TestSource_FallbackWhenNoArtifact(t *testing.T) {
	store, cwd := sourceTree(t, map[string]string{
		"node_modules/@acme/text/package.json":                             `{"name":"@acme/text","types":"./dist/index.d.ts"}`,
		"node_modules/@acme/text/dist/index.js":                            "export const slugify = registerPureFn(null);\n",
		"node_modules/@acme/text/dist/" + constants.PureFnArtifactFileName: artifact("@acme/text", slugifyRow),
		"node_modules/@acme/text/dist/index.d.ts":                          "import type {PureFnId} from '@mionjs/run-types';\nexport declare const slugify: PureFnId<string>;\n",
		"node_modules/@acme/dates/package.json":                            `{"name":"@acme/dates","types":"./dist/index.d.ts"}`,
		"node_modules/@acme/dates/dist/index.js":                           "import {registerPureFnFactory} from '@mionjs/run-types';\nexport const isoDay = registerPureFnFactory(function (utl) { return function (d) { return d; }; });\n",
		"node_modules/@acme/dates/dist/index.d.ts":                         "export declare const isoDay: string;\n",
		"node_modules/@acme/dates/src/index.ts":                            datesSrc,
		"node_modules/@acme/dates/src/index.spec.ts":                       "import {registerPureFn} from '@mionjs/run-types';\nexport const notScanned = registerPureFn((s: string): string => s);\n",
	})
	datesRoot := tspath.ResolvePath(cwd, "node_modules/@acme/dates")
	idx := store.Package(datesRoot)
	if !idx.FromSource || len(idx.Rows) != 1 {
		t.Fatalf("expected one row from src, got fromSource=%v rows=%v err=%v", idx.FromSource, idx.Rows, idx.Err)
	}
	row, ok := rowNamed(idx, "isoDay")
	if !ok || !strings.HasPrefix(row.ID, "@acme/dates#") || !reflect.DeepEqual(row.PureFnDependencies, []string{slugifyID}) || !strings.Contains(row.Code, "getPureFn('"+slugifyID+"')") {
		t.Errorf("row = %+v", row)
	}
	if row.FilePath != "" || row.FactoryArgStart != 0 || row.IDInjectText != "" {
		t.Errorf("a served row must carry no rewrite positions: %+v", row)
	}
	if idx.rowFile[row.ID] != "src/index.ts" {
		t.Errorf("a source row keeps its file for the tiebreak, got %q", idx.rowFile[row.ID])
	}
	if id, ok := store.BindingID(tspath.ResolvePath(cwd, "node_modules/@acme/dates/dist/index.d.ts"), "isoDay"); !ok || id != row.ID {
		t.Errorf("BindingID through the source rows = %q, %v", id, ok)
	}
	result := store.Closure([]Demand{{ID: row.ID, FromDir: cwd}})
	if len(result.Entries) != 2 || len(result.Missing) != 0 || len(result.Unresolved) != 0 {
		t.Fatalf("closure = %+v", result)
	}
	if result.Entries[1].Code != slugCode {
		t.Errorf("text must be served from its artifact, got %+v", result.Entries[1])
	}
}

// The artifact wins: a package shipping both an artifact and its src is read
// from the artifact, and src is never parsed.
func TestSource_ArtifactWinsOverSource(t *testing.T) {
	store, cwd := sourceTree(t, map[string]string{
		"node_modules/@acme/text/package.json":                             `{"name":"@acme/text"}`,
		"node_modules/@acme/text/dist/" + constants.PureFnArtifactFileName: artifact("@acme/text", slugifyRow),
		"node_modules/@acme/text/src/slug.ts":                              "import {registerPureFn} from '@mionjs/run-types';\nexport const slugify = registerPureFn((s: string): string => s.toUpperCase());\n",
	})
	idx := store.Package(tspath.ResolvePath(cwd, "node_modules/@acme/text"))
	if idx.FromSource || idx.Rows[slugifyID].Code != slugCode {
		t.Errorf("artifact must win: fromSource=%v row=%+v", idx.FromSource, idx.Rows[slugifyID])
	}
}

// The equivalence oracle: a package read from its sources and the same package
// read from the artifact its build would write produce the same rows, so a
// consumer cannot tell which lane served it.
func TestArtifact_EqualsSourceExtraction(t *testing.T) {
	store, cwd := sourceTree(t, map[string]string{
		"node_modules/@acme/text/package.json":                             `{"name":"@acme/text","types":"./dist/index.d.ts"}`,
		"node_modules/@acme/text/dist/" + constants.PureFnArtifactFileName: artifact("@acme/text", slugifyRow),
		"node_modules/@acme/text/dist/index.d.ts":                          "import type {PureFnId} from '@mionjs/run-types';\nexport declare const slugify: PureFnId<string>;\n",
		"node_modules/@acme/dates/package.json":                            `{"name":"@acme/dates"}`,
		"node_modules/@acme/dates/src/index.ts":                            datesSrc,
		"node_modules/@acme/dates/src/pad.ts":                              "import {registerPureFn} from '@mionjs/run-types';\nexport const pad = registerPureFn((s: string): string => s.padStart(4, '0'));\nregisterPureFn((s: string): string => s.trim());\n",
	})
	datesRoot := tspath.ResolvePath(cwd, "node_modules/@acme/dates")
	raw, diags, err := ExtractSources(datesRoot, ScanRegistrations(datesRoot, store.fs), SideProgram{FS: store.fs, SingleThreaded: true, Bindings: store})
	if err != nil || len(diags) != 0 || len(raw) != 3 {
		t.Fatalf("extract: err=%v diags=%+v entries=%d", err, diags, len(raw))
	}
	rendered := RenderArtifact("@acme/dates", datesRoot, raw)
	if !reflect.DeepEqual(rendered, RenderArtifact("@acme/dates", datesRoot, append([]purefunctions.Entry{raw[2], raw[0]}, raw[1]))) {
		t.Error("the render must not depend on entry order")
	}
	viaArtifact := storeOver(map[string]string{
		datesRoot + "/package.json":                             `{"name":"@acme/dates"}`,
		datesRoot + "/dist/" + constants.PureFnArtifactFileName: string(rendered),
	}).Package(datesRoot)
	fromSource := store.Package(datesRoot)
	if !fromSource.FromSource || viaArtifact.FromSource {
		t.Fatalf("lanes: source=%v artifact=%v err=%v", fromSource.FromSource, viaArtifact.FromSource, fromSource.Err)
	}
	if !reflect.DeepEqual(viaArtifact.Rows, fromSource.Rows) {
		t.Errorf("rows differ:\nartifact: %+v\nsource:   %+v", viaArtifact.Rows, fromSource.Rows)
	}
	if !reflect.DeepEqual(viaArtifact.rowFile, fromSource.rowFile) || viaArtifact.rowFile[raw[0].ID] == "" {
		t.Errorf("files differ:\nartifact: %v\nsource:   %v", viaArtifact.rowFile, fromSource.rowFile)
	}
	var parsed Artifact
	if err := json.Unmarshal(rendered, &parsed); err != nil {
		t.Fatal(err)
	}
	if parsed.Format != ArtifactFormat || parsed.Package != "@acme/dates" || !sort.SliceIsSorted(parsed.PureFns, func(i, j int) bool { return parsed.PureFns[i].ID < parsed.PureFns[j].ID }) {
		t.Errorf("artifact = %+v", parsed)
	}
	for _, row := range parsed.PureFns {
		if !strings.HasPrefix(row.File, "src/") || row.ParamNames == nil || row.PureFnDependencies == nil {
			t.Errorf("row = %+v", row)
		}
	}
}

// The marker package, as a published consumer sees it: package.json, the dist
// .d.ts and src, no artifact. Its rows come from the generated source list.
func TestMarker_ServedFromSourcesThroughTheGeneratedList(t *testing.T) {
	store, cwd := sourceTree(t, nil)
	root, ok := store.ResolvePackage(MarkerPackageName, cwd)
	if !ok {
		t.Fatal("marker package not resolved from the consumer cwd")
	}
	idx := store.Package(root)
	if idx.Err != nil || !idx.FromSource {
		t.Fatalf("marker rows: err=%v fromSource=%v", idx.Err, idx.FromSource)
	}
	all := purefnids.All()
	if len(all) == 0 {
		t.Fatal("purefnids.All() is empty")
	}
	var missing []string
	for _, id := range all {
		if _, found := idx.Rows[id]; !found {
			missing = append(missing, purefnids.NameOf(id)+" ("+id+")")
		}
	}
	if len(missing) != 0 {
		t.Errorf("%d generated id(s) no longer resolve from the marker sources:\n  %s\nregenerate: pnpm miondevx core codegen builtinpurefns", len(missing), strings.Join(missing, "\n  "))
	}
	// circular-pure-fns.ts is side-effect imported by NOTHING, so it is served
	// only because the generated list names it.
	if _, found := idx.Rows[purefnids.FindCycle]; !found {
		t.Error("findCycle was not served")
	}
	// The closure pulls a dependency's module too (isDateString_YMD → isDateString).
	result := store.Closure([]Demand{{ID: purefnids.IsDateStringYMD, FromDir: cwd}, {ID: purefnids.IsDateStringDMY, FromDir: cwd}, {ID: "@mionjs/run-types#pf_totallyMadeUp", FromDir: cwd}})
	served := map[string]int{}
	for _, entry := range result.Entries {
		served[entry.ID]++
		if strings.TrimSpace(entry.Code) == "" || entry.BindingName == "" || entry.FilePath != "" {
			t.Errorf("served %s: code=%q name=%q file=%q", entry.ID, entry.Code, entry.BindingName, entry.FilePath)
		}
	}
	if served[purefnids.IsDateString] != 1 || served[purefnids.IsDateStringYMD] != 1 {
		t.Errorf("closure = %v", served)
	}
	if len(result.Missing) != 1 || result.Missing[0].ID != "@mionjs/run-types#pf_totallyMadeUp" || !result.Missing[0].Built {
		t.Errorf("a made-up built-in must be a miss on a built package, got %+v", result.Missing)
	}
}

// A marker package installed without a listed source file is an error naming
// the file, never an empty index that would degrade to a runtime miss.
func TestMarker_MissingSourceIsAnError(t *testing.T) {
	store, cwd := sourceTree(t, nil)
	root, _ := store.ResolvePackage(MarkerPackageName, cwd)
	pruned := storeOver(map[string]string{
		root + "/package.json": `{"name":"@mionjs/run-types"}`,
	})
	idx := pruned.Package(root)
	if idx.Err == nil || !strings.Contains(idx.Err.Error(), "missing from the installed package") {
		t.Fatalf("expected an error naming the missing file, got %v", idx.Err)
	}
	if idx.Built() {
		t.Error("nothing must be served from a pruned install")
	}
}

// The generated source list is not stale: every path exists in the real package
// and every listed file registers something.
func TestMarker_SourceListMatchesThePackage(t *testing.T) {
	root, err := filepath.Abs(filepath.Join("..", "..", "..", "..", "packages", "run-types"))
	if err != nil {
		t.Fatal(err)
	}
	if len(purefnids.SourceFiles) == 0 {
		t.Fatal("purefnids.SourceFiles is empty (regenerate: pnpm miondevx core codegen builtinpurefns)")
	}
	files := MarkerSourceFiles(tspath.NormalizePath(root))
	for _, file := range files {
		if _, err := os.Stat(file); err != nil {
			t.Errorf("generated source list names a missing file: %v", err)
		}
	}
	raw, _, err := ExtractSources(tspath.NormalizePath(root), files, SideProgram{SingleThreaded: true})
	if err != nil {
		t.Fatal(err)
	}
	registering := map[string]bool{}
	for _, entry := range raw {
		registering[entry.FilePath] = true
	}
	for _, file := range files {
		if !registering[file] {
			t.Errorf("%s is in the generated list but registers nothing (regenerate: pnpm miondevx core codegen builtinpurefns)", file)
		}
	}
	// The scan the generator narrows from finds every listed file.
	scanned := ScanRegistrations(root, osvfs.FS())
	for _, file := range files {
		if !slices(scanned, file) {
			t.Errorf("ScanRegistrations misses %s", file)
		}
	}
}

func slices(haystack []string, needle string) bool {
	for _, item := range haystack {
		if item == needle {
			return true
		}
	}
	return false
}

// An id is a hash of the body that ships, so a session whose program already
// holds the marker sources and a side program over the same files must land on
// the same ids: otherwise one function would split into two entries and a
// consumer would import a module nothing registers.
func TestMarker_BothLanesAgreeOnIds(t *testing.T) {
	root, err := filepath.Abs(filepath.Join("..", "..", "..", "..", "packages", "run-types"))
	if err != nil {
		t.Fatal(err)
	}
	root = tspath.NormalizePath(root)
	files := MarkerSourceFiles(root)
	prog, err := program.NewInferred(program.Options{Cwd: root, SingleThreaded: true}, files)
	if err != nil {
		t.Fatal(err)
	}
	typeChecker, release := prog.TS.GetTypeChecker(context.Background())
	defer release()
	markerOpts := marker.WithDefaults(marker.Options{FS: prog.FS, Cwd: prog.Cwd})
	viaSession := NewStore(prog.FS)
	viaSession.Bind(prog.FS, Host{Program: prog, Checker: typeChecker, MarkerOpts: markerOpts, Cache: purefunctions.NewFileCache(), SingleThreaded: true})
	own := NewStore(prog.FS)
	own.Bind(prog.FS, Host{SingleThreaded: true})
	ids := func(store *Store) []string {
		idx := store.Package(root)
		if idx.Err != nil {
			t.Fatal(idx.Err)
		}
		out := make([]string, 0, len(idx.Rows))
		for id := range idx.Rows {
			out = append(out, id)
		}
		sort.Strings(out)
		return out
	}
	sessionIDs, ownIDs := ids(viaSession), ids(own)
	if !reflect.DeepEqual(sessionIDs, ownIDs) {
		t.Errorf("the two lanes disagree on ids:\nsession: %v\nown:     %v", sessionIDs, ownIDs)
	}
	if !reflect.DeepEqual(sessionIDs, purefnids.All()) {
		t.Errorf("extracted ids differ from the generated constants (regenerate: pnpm miondevx core codegen builtinpurefns)")
	}
}
