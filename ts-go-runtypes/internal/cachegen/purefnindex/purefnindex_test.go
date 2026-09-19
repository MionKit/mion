package purefnindex

import (
	"context"
	"encoding/json"
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
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/testfixtures"
)

// Every artifact fixture lives ONLY in the overlay under /virtual, so a package found was found through the
// program FS. Ids are matched, never decoded, so the hash halves are just distinct strings.

const (
	textPkg   = "/virtual/app/node_modules/@acme/text"
	slugifyID = "@acme/text#pf_slug00000000000"
	titleID   = "@acme/text#pf_title0000000000"
	isoDayID  = "@acme/dates#pf_day00000000000"
	trimID    = "@acme/util#pf_trim00000000000"
	slugCode  = "return (s) => s.toLowerCase();"
)

var (
	slugifyEntry = purefunctions.Entry{ID: slugifyID, BindingName: "slugify", FilePath: "src/slug.ts", ParamNames: []string{"utl"}, Code: slugCode}
	titleEntry   = purefunctions.Entry{ID: titleID, BindingName: "title", FilePath: "src/title.ts", ParamNames: []string{"utl"}, Code: "return 1;", PureFnDependencies: []string{slugifyID}}
)

// artifactDir stages an artifact directory at dir: the index in the given row order (bypassing the sort) plus
// each entry's module from the real renderer in the given emit mode. An entry's FilePath is the index's `file`.
func artifactDir(dir, packageName string, mode constants.EmitMode, entries ...purefunctions.Entry) map[string]string {
	rows := make([]ArtifactIndexRow, 0, len(entries))
	for _, entry := range entries {
		rows = append(rows, ArtifactIndexRow{ID: entry.ID, BindingName: entry.BindingName, File: entry.FilePath})
	}
	files := map[string]string{dir + "/" + constants.PureFnArtifactIndexFile: indexJSON(packageName, rows...)}
	for _, entry := range entries {
		files[dir+"/"+ModulePath(entry.ID)] = moduleFor(entry, mode)
	}
	return files
}

func indexJSON(packageName string, rows ...ArtifactIndexRow) string {
	payload, err := json.MarshalIndent(ArtifactIndex{Format: ArtifactFormat, Package: packageName, PureFns: rows}, "", "  ")
	if err != nil {
		panic(err)
	}
	return string(payload) + "\n"
}

// moduleFor renders the module as generate does, deps stubbed as a build stubs a dep it does not hold.
func moduleFor(entry purefunctions.Entry, mode constants.EmitMode) string {
	graph := purefunctions.CollectEntries([]purefunctions.Entry{entry}, mode)
	graph.AddMissingStubs(nil)
	modules, err := entrymodules.RenderGrouped(graph, nil)
	if err != nil {
		panic(err)
	}
	return modules[entrymodules.ModuleName(entry.ID, entrymodules.KindPureFn)]
}

func merge(sets ...map[string]string) map[string]string {
	all := map[string]string{}
	for _, set := range sets {
		for path, content := range set {
			all[path] = content
		}
	}
	return all
}

func storeOver(files map[string]string) *Store {
	return NewStore(program.NewOverlayFS(osvfs.FS(), files))
}

// textPackage stages @acme/text: manifest, untyped .d.ts, and the test's files (paths relative to the root).
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

// textArtifact is @acme/text's artifact directory under dist, in code mode.
func textArtifact(entries ...purefunctions.Entry) map[string]string {
	return artifactDir(textPkg+"/dist/"+constants.PureFnArtifactDir, "@acme/text", constants.EmitCode, entries...)
}

func rowOf(t *testing.T, idx *PackageIndex, id string) purefunctions.Entry {
	t.Helper()
	row, ok := idx.Row(id)
	if !ok {
		t.Fatalf("%s is not served: problems=%+v err=%v", id, idx.Problems, idx.Err)
	}
	return row
}

func codes(entries []purefunctions.Entry) []string {
	out := make([]string, 0, len(entries))
	for _, entry := range entries {
		out = append(out, entry.Key()+"="+entry.Code)
	}
	return out
}

// A module read on demand gives the served row; a binding name answers an untyped .d.ts import from the index alone.
func TestArtifact_RowsAndBindingID(t *testing.T) {
	store := storeOver(merge(textPackage(map[string]string{
		"/dist/index.js": "export const slugify = registerPureFn(null);\n",
	}), textArtifact(slugifyEntry)))
	idx := store.Package(textPkg)
	if !idx.Built() || idx.Name != "@acme/text" || idx.FromSource {
		t.Fatalf("package not indexed: built=%v name=%q fromSource=%v", idx.Built(), idx.Name, idx.FromSource)
	}
	if id, ok := store.BindingID(textPkg+"/dist/index.d.ts", "slugify"); !ok || id != slugifyID {
		t.Errorf("BindingID = %q, %v", id, ok)
	}
	want := purefunctions.Entry{ID: slugifyID, BindingName: "slugify", ParamNames: []string{"utl"}, Code: slugCode}
	if got := rowOf(t, idx, slugifyID); !reflect.DeepEqual(got, want) {
		t.Errorf("row = %+v, want %+v", got, want)
	}
	if !reflect.DeepEqual(idx.IDs(), []string{slugifyID}) || len(idx.Problems) != 0 || len(idx.Conflicts) != 0 {
		t.Errorf("ids=%v problems=%+v conflicts=%+v", idx.IDs(), idx.Problems, idx.Conflicts)
	}
}

// recordingFS records every read, to prove a bundle was never opened and a module only on demand.
type recordingFS struct {
	vfspkg.FS
	reads []string
}

func (fs *recordingFS) ReadFile(path string) (string, bool) {
	fs.reads = append(fs.reads, path)
	return fs.FS.ReadFile(path)
}

// A bundle carrying tuples and registrations but no artifact is unbuilt, and the bundle is never opened.
func TestArtifact_BundleIsNeverOpened(t *testing.T) {
	bundle := strings.Repeat("const t = [2,,,'"+slugifyID+"',['utl'],'"+slugCode+"',[]];\nexport const slugify = registerPureFn(t, '"+slugifyID+"');\n", 2000)
	fs := &recordingFS{FS: program.NewOverlayFS(osvfs.FS(), textPackage(map[string]string{
		"/dist/index.js":  bundle,
		"/dist/index.mjs": bundle,
		"/dist/index.cjs": bundle,
	}))}
	idx := NewStore(fs).Package(textPkg)
	if idx.Built() {
		t.Fatalf("a bundle must not be read as rows: %v", idx.IDs())
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

// Indexing opens the manifest and the index only; serving an id opens that id's module and no other.
func TestArtifact_OnlyDemandedModulesAreOpened(t *testing.T) {
	third := purefunctions.Entry{ID: "@acme/text#pf_third000000000", BindingName: "third", FilePath: "src/third.ts", Code: "return 3;"}
	fs := &recordingFS{FS: program.NewOverlayFS(osvfs.FS(), merge(textPackage(nil), textArtifact(slugifyEntry, titleEntry, third)))}
	// Manifest lookups (package.json up the tree) are not artifact reads.
	artifactReads := func() []string {
		var reads []string
		for _, read := range fs.reads {
			if !strings.HasSuffix(read, "package.json") {
				reads = append(reads, read)
			}
		}
		return reads
	}
	dir := textPkg + "/dist/" + constants.PureFnArtifactDir
	store := NewStore(fs)
	idx := store.Package(textPkg)
	if len(idx.IDs()) != 3 {
		t.Fatalf("ids = %v", idx.IDs())
	}
	wantReads := []string{dir + "/" + constants.PureFnArtifactIndexFile}
	if got := artifactReads(); !reflect.DeepEqual(got, wantReads) {
		t.Errorf("indexing read %v, want %v", got, wantReads)
	}
	if id, ok := store.BindingID(textPkg+"/dist/index.d.ts", "third"); !ok || id != third.ID || !reflect.DeepEqual(artifactReads(), wantReads) {
		t.Errorf("a name lookup must open no module: %q %v reads=%v", id, ok, fs.reads)
	}
	result := store.Closure([]Demand{{ID: titleID, FromDir: "/virtual/app"}})
	if len(result.Entries) != 2 || len(result.Missing) != 0 {
		t.Fatalf("closure = %+v", result)
	}
	wantReads = append(wantReads, dir+"/"+ModulePath(titleID), dir+"/"+ModulePath(slugifyID))
	if got := artifactReads(); !reflect.DeepEqual(got, wantReads) {
		t.Errorf("serving title read %v, want %v", got, wantReads)
	}
	store.Closure([]Demand{{ID: titleID, FromDir: "/virtual/app"}})
	if got := artifactReads(); !reflect.DeepEqual(got, wantReads) {
		t.Errorf("a second demand must be served from the cache, reads=%v", got)
	}
}

// The module of each emit mode reads back to the same served row, so a library's build mode never matters to a consumer.
func TestReadModule_EmitModesAgree(t *testing.T) {
	entry := purefunctions.Entry{ID: titleID, ParamNames: []string{"utl", "x"}, Code: "return utl.getPureFn('" + slugifyID + "')(x) + '</script>';", PureFnDependencies: []string{slugifyID}}
	want := served(entry)
	for _, mode := range []constants.EmitMode{constants.EmitCode, constants.EmitFunctions, constants.EmitBoth} {
		got, err := ReadModule(titleID, moduleFor(entry, mode))
		if err != nil || !reflect.DeepEqual(got, want) {
			t.Errorf("%s: row = %+v (err %v), want %+v", mode, got, err, want)
		}
	}
	if _, err := ReadModule(slugifyID, moduleFor(entry, constants.EmitCode)); err == nil || !strings.Contains(err.Error(), "holds the tuple of") {
		t.Errorf("another id's module must be refused, got %v", err)
	}
	if _, err := ReadModule(slugifyID, "export const x = 1;\n"); err == nil || !strings.Contains(err.Error(), "no pure-fn tuple") {
		t.Errorf("a module with no tuple must be refused, got %v", err)
	}
	if got := ModulePath(slugifyID); got != "@acme/text/slug00000000000.js" {
		t.Errorf("ModulePath = %q", got)
	}
}

// An ESM and a CJS build both write the directory; identical rows merge, in any order, wherever the directories sit.
func TestArtifact_SecondBuildMergesIdenticalRows(t *testing.T) {
	store := storeOver(merge(textPackage(nil),
		artifactDir(textPkg+"/dist/esm/"+constants.PureFnArtifactDir, "@acme/text", constants.EmitCode, slugifyEntry, titleEntry),
		artifactDir(textPkg+"/dist/cjs/"+constants.PureFnArtifactDir, "@acme/text", constants.EmitFunctions, titleEntry, slugifyEntry),
	))
	idx := store.Package(textPkg)
	result := store.Closure([]Demand{{ID: titleID, FromDir: "/virtual/app"}})
	if len(idx.IDs()) != 2 || len(result.Entries) != 2 || len(result.Conflicts) != 0 || len(result.Problems) != 0 {
		t.Errorf("ids=%v closure=%+v", idx.IDs(), result)
	}
	if id, ok := store.BindingID(textPkg+"/dist/index.d.ts", "title"); !ok || id != titleID {
		t.Errorf("a name seen in two indexes still answers once: %q, %v", id, ok)
	}
}

// Differing bodies are a conflict naming both modules, found on demand (a body nothing demands is never
// compared), the first copy kept; differing names are a conflict naming both indexes, found on first touch.
func TestArtifact_ConflictingBodies(t *testing.T) {
	stale := slugifyEntry
	stale.Code = "return (s) => s.toUpperCase();"
	staleTitle := titleEntry
	staleTitle.Code = "return 2;"
	dirA, dirB := textPkg+"/dist/a/"+constants.PureFnArtifactDir, textPkg+"/dist/b/"+constants.PureFnArtifactDir
	store := storeOver(merge(textPackage(nil),
		artifactDir(dirA, "@acme/text", constants.EmitCode, slugifyEntry, titleEntry),
		artifactDir(dirB, "@acme/text", constants.EmitCode, stale, staleTitle),
	))
	idx := store.Package(textPkg)
	if len(idx.Conflicts) != 0 {
		t.Fatalf("a body is compared only when demanded, got %+v", idx.Conflicts)
	}
	result := store.Closure([]Demand{{ID: slugifyID, FromDir: "/virtual/app"}})
	want := []ArtifactConflict{{Package: "@acme/text", ID: slugifyID, Files: [2]string{dirA + "/" + ModulePath(slugifyID), dirB + "/" + ModulePath(slugifyID)}}}
	if !reflect.DeepEqual(result.Conflicts, want) {
		t.Errorf("conflicts = %+v, want %+v", result.Conflicts, want)
	}
	if len(result.Entries) != 1 || result.Entries[0].Code != slugCode {
		t.Errorf("the first copy read must be kept, got %+v", result.Entries)
	}
	renamed := titleEntry
	renamed.BindingName = "heading"
	store = storeOver(merge(textPackage(nil),
		artifactDir(dirA, "@acme/text", constants.EmitCode, titleEntry),
		artifactDir(dirB, "@acme/text", constants.EmitCode, renamed),
	))
	idx = store.Package(textPkg)
	want = []ArtifactConflict{{Package: "@acme/text", ID: titleID, Files: [2]string{dirA + "/" + constants.PureFnArtifactIndexFile, dirB + "/" + constants.PureFnArtifactIndexFile}}}
	if !reflect.DeepEqual(idx.Conflicts, want) {
		t.Errorf("index conflicts = %+v, want %+v", idx.Conflicts, want)
	}
	if id, ok := store.BindingID(textPkg+"/dist/index.d.ts", "title"); !ok || id != titleID {
		t.Errorf("the first index read names the row: %q, %v", id, ok)
	}
}

// A newer or malformed index is a problem naming the file and the reason; another package's artifact is silently not ours.
func TestArtifact_UnreadableIndexAndForeign(t *testing.T) {
	index := func(sub, content string) map[string]string {
		return map[string]string{textPkg + sub + "/" + constants.PureFnArtifactDir + "/" + constants.PureFnArtifactIndexFile: content}
	}
	store := storeOver(merge(textPackage(nil),
		index("/dist", strings.Replace(indexJSON("@acme/text", ArtifactIndexRow{ID: slugifyID}), `"format": 1`, `"format": 2`, 1)),
		index("/dist/x", "{not json"),
		index("/dist/y", `{"format":1,"package":"@acme/text","pureFns":[{"id":"`+trimID+`"}]}`),
		index("/vendor", indexJSON("@acme/util", ArtifactIndexRow{ID: trimID})),
		index("/dist/z", `{"package":"@acme/text","pureFns":[]}`),
		index("/dist/w", `{"format":1,"pureFns":[]}`),
	))
	idx := store.Package(textPkg)
	if idx.Built() {
		t.Errorf("nothing readable must mean nothing served, got %v", idx.IDs())
	}
	reasons := map[string]string{}
	for _, problem := range idx.Problems {
		reasons[strings.TrimPrefix(problem.File, textPkg+"/")] = problem.Reason
		if problem.Package != "@acme/text" {
			t.Errorf("problem must name the package: %+v", problem)
		}
	}
	indexPath := constants.PureFnArtifactDir + "/" + constants.PureFnArtifactIndexFile
	for file, want := range map[string]string{
		"dist/" + indexPath:   "newer artifact format 2 (this compiler reads up to 1)",
		"dist/x/" + indexPath: "not valid JSON",
		"dist/y/" + indexPath: `row "` + trimID + `" is not owned by "@acme/text"`,
		"dist/z/" + indexPath: "missing `format`",
		"dist/w/" + indexPath: "missing `package`",
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

// A listed module missing, swapped or empty is a problem found on demand; the id is a miss on a built package, reported once.
func TestArtifact_UnreadableModules(t *testing.T) {
	dir := textPkg + "/dist/" + constants.PureFnArtifactDir
	gone := purefunctions.Entry{ID: "@acme/text#pf_gone0000000000", BindingName: "gone", Code: "return 0;"}
	swapped := purefunctions.Entry{ID: "@acme/text#pf_swap0000000000", BindingName: "swapped", Code: "return 0;"}
	empty := purefunctions.Entry{ID: "@acme/text#pf_empty000000000", BindingName: "empty", Code: "return 0;"}
	files := merge(textPackage(nil), textArtifact(slugifyEntry, gone, swapped, empty))
	delete(files, dir+"/"+ModulePath(gone.ID))
	files[dir+"/"+ModulePath(swapped.ID)] = moduleFor(slugifyEntry, constants.EmitCode)
	files[dir+"/"+ModulePath(empty.ID)] = "export const nothing = [];\n"
	store := storeOver(files)
	demands := []Demand{{ID: slugifyID, FromDir: "/virtual/app"}, {ID: gone.ID, FromDir: "/virtual/app"}, {ID: swapped.ID, FromDir: "/virtual/app"}, {ID: empty.ID, FromDir: "/virtual/app"}}
	result := store.Closure(demands)
	if len(result.Entries) != 1 || len(result.Missing) != 3 {
		t.Fatalf("closure = %+v", result)
	}
	for _, miss := range result.Missing {
		if !miss.Built {
			t.Errorf("a built package lacking a readable module is still built: %+v", miss)
		}
	}
	reasons := map[string]string{}
	for _, problem := range result.Problems {
		reasons[strings.TrimPrefix(problem.File, dir+"/")] = problem.Reason
	}
	for file, want := range map[string]string{
		ModulePath(gone.ID):    "listed in index.json but missing",
		ModulePath(swapped.ID): `holds the tuple of "` + slugifyID + `", not "` + swapped.ID + `"`,
		ModulePath(empty.ID):   "holds no pure-fn tuple",
	} {
		if got := reasons[file]; got != want {
			t.Errorf("%s: reason = %q, want %q", file, got, want)
		}
	}
	if again := store.Closure(demands); len(again.Problems) != 3 {
		t.Errorf("a second demand must not report the problems twice: %+v", again.Problems)
	}
}

// Two rows bound to one name are told apart by basename against the declaration's; the same basename twice answers nothing.
func TestBindingID_NameAndFileTiebreak(t *testing.T) {
	inSlug := purefunctions.Entry{ID: slugifyID, BindingName: "make", FilePath: "src/slug.ts", Code: "return 1;"}
	inTitle := purefunctions.Entry{ID: titleID, BindingName: "make", FilePath: "src/title.ts", Code: "return 2;"}
	store := storeOver(merge(textPackage(map[string]string{
		"/dist/slug.d.ts":        "export declare const make: string;\n",
		"/dist/title.d.ts":       "export declare const make: string;\n",
		"/dist/types/other.d.ts": "export declare const make: string;\n",
	}), textArtifact(inSlug, inTitle)))
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
	inSlugToo := inTitle
	inSlugToo.FilePath = "src/slug.ts"
	sameFile := storeOver(merge(textPackage(map[string]string{
		"/dist/slug.d.ts": "export declare const make: string;\n",
	}), textArtifact(inSlug, inSlugToo)))
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
	nestedSlug := slugifyEntry
	nestedSlug.Code = "return (s) => s;"
	isoDay := purefunctions.Entry{ID: isoDayID, BindingName: "isoDay", ParamNames: []string{"utl"}, Code: `return utl.getPureFn("` + slugifyID + `");`, PureFnDependencies: []string{slugifyID}}
	store := storeOver(merge(map[string]string{
		textPkg + "/package.json":    `{"name":"@acme/text"}`,
		datesPkg + "/package.json":   `{"name":"@acme/dates"}`,
		nestedText + "/package.json": `{"name":"@acme/text"}`,
	},
		textArtifact(slugifyEntry),
		artifactDir(datesPkg+"/dist/"+constants.PureFnArtifactDir, "@acme/dates", constants.EmitFunctions, isoDay),
		artifactDir(nestedText+"/dist/"+constants.PureFnArtifactDir, "@acme/text", constants.EmitCode, titleEntry, nestedSlug),
	))
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

// A located package lacking the row is a miss; one with no artifact is unbuilt; one not installed is unresolved.
func TestClosure_MissingUnbuiltUnresolved(t *testing.T) {
	legacyPkg := "/virtual/app/node_modules/@acme/legacy"
	const padID = "@acme/legacy#pf_pad0000000000"
	store := storeOver(merge(map[string]string{
		textPkg + "/package.json":   `{"name":"@acme/text"}`,
		legacyPkg + "/package.json": `{"name":"@acme/legacy"}`,
		legacyPkg + "/index.js":     "export const padId = registerPureFn((s) => s.padStart(4, '0'), '" + padID + "');\n",
	}, textArtifact(slugifyEntry)))
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

// A nested node_modules is another package's and a hidden dir a build's scratch (served copies of others' rows): neither counts.
func TestArtifact_SkipsNestedNodeModulesAndHiddenDirs(t *testing.T) {
	util := purefunctions.Entry{ID: trimID, Code: "return 0;"}
	store := storeOver(merge(map[string]string{
		textPkg + "/package.json":                         `{"name":"@acme/text"}`,
		textPkg + "/node_modules/@acme/util/package.json": `{"name":"@acme/util"}`,
	},
		textArtifact(slugifyEntry),
		artifactDir(textPkg+"/node_modules/@acme/util/dist/"+constants.PureFnArtifactDir, "@acme/util", constants.EmitCode, util),
		artifactDir(textPkg+"/.mion/types/"+constants.PureFnArtifactDir, "@acme/text", constants.EmitCode, titleEntry),
		artifactDir(textPkg+"/test/.mion/types/"+constants.PureFnArtifactDir, "@acme/text", constants.EmitCode, titleEntry),
	))
	if ids := store.Package(textPkg).IDs(); !reflect.DeepEqual(ids, []string{slugifyID}) {
		t.Errorf("ids = %v", ids)
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
	if ids := idx.byName[name]; len(ids) == 1 {
		return idx.Row(ids[0])
	}
	return purefunctions.Entry{}, false
}

// No artifact (a plain tsc emit) but src/: rows are extracted as the package's own build would, the dep it
// imports from an artifact-shipping package's untyped .d.ts included, rewrite positions stripped.
func TestSource_FallbackWhenNoArtifact(t *testing.T) {
	store, cwd := sourceTree(t, merge(map[string]string{
		"node_modules/@acme/text/package.json":       `{"name":"@acme/text","types":"./dist/index.d.ts"}`,
		"node_modules/@acme/text/dist/index.js":      "export const slugify = registerPureFn(null);\n",
		"node_modules/@acme/text/dist/index.d.ts":    "import type {PureFnId} from '@mionjs/run-types';\nexport declare const slugify: PureFnId<string>;\n",
		"node_modules/@acme/dates/package.json":      `{"name":"@acme/dates","types":"./dist/index.d.ts"}`,
		"node_modules/@acme/dates/dist/index.js":     "import {registerPureFnFactory} from '@mionjs/run-types';\nexport const isoDay = registerPureFnFactory(function (utl) { return function (d) { return d; }; });\n",
		"node_modules/@acme/dates/dist/index.d.ts":   "export declare const isoDay: string;\n",
		"node_modules/@acme/dates/src/index.ts":      datesSrc,
		"node_modules/@acme/dates/src/index.spec.ts": "import {registerPureFn} from '@mionjs/run-types';\nexport const notScanned = registerPureFn((s: string): string => s);\n",
	}, artifactDir("node_modules/@acme/text/dist/"+constants.PureFnArtifactDir, "@acme/text", constants.EmitCode, slugifyEntry)))
	datesRoot := tspath.ResolvePath(cwd, "node_modules/@acme/dates")
	idx := store.Package(datesRoot)
	if !idx.FromSource || len(idx.IDs()) != 1 {
		t.Fatalf("expected one row from src, got fromSource=%v ids=%v err=%v", idx.FromSource, idx.IDs(), idx.Err)
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

// A package shipping both an artifact and src is read from the artifact; src is never parsed.
func TestSource_ArtifactWinsOverSource(t *testing.T) {
	store, cwd := sourceTree(t, merge(map[string]string{
		"node_modules/@acme/text/package.json": `{"name":"@acme/text"}`,
		"node_modules/@acme/text/src/slug.ts":  "import {registerPureFn} from '@mionjs/run-types';\nexport const slugify = registerPureFn((s: string): string => s.toUpperCase());\n",
	}, artifactDir("node_modules/@acme/text/dist/"+constants.PureFnArtifactDir, "@acme/text", constants.EmitCode, slugifyEntry)))
	idx := store.Package(tspath.ResolvePath(cwd, "node_modules/@acme/text"))
	if row := rowOf(t, idx, slugifyID); idx.FromSource || row.Code != slugCode {
		t.Errorf("artifact must win: fromSource=%v row=%+v", idx.FromSource, row)
	}
}

// Equivalence oracle: the source lane and the artifact lane give the same rows, so a consumer cannot tell them apart.
func TestArtifact_EqualsSourceExtraction(t *testing.T) {
	store, cwd := sourceTree(t, merge(map[string]string{
		"node_modules/@acme/text/package.json":    `{"name":"@acme/text","types":"./dist/index.d.ts"}`,
		"node_modules/@acme/text/dist/index.d.ts": "import type {PureFnId} from '@mionjs/run-types';\nexport declare const slugify: PureFnId<string>;\n",
		"node_modules/@acme/dates/package.json":   `{"name":"@acme/dates"}`,
		"node_modules/@acme/dates/src/index.ts":   datesSrc,
		"node_modules/@acme/dates/src/pad.ts":     "import {registerPureFn} from '@mionjs/run-types';\nexport const pad = registerPureFn((s: string): string => s.padStart(4, '0'));\nregisterPureFn((s: string): string => s.trim());\n",
	}, artifactDir("node_modules/@acme/text/dist/"+constants.PureFnArtifactDir, "@acme/text", constants.EmitCode, slugifyEntry)))
	datesRoot := tspath.ResolvePath(cwd, "node_modules/@acme/dates")
	raw, diags, err := ExtractSources(datesRoot, ScanRegistrations(datesRoot, store.fs), SideProgram{FS: store.fs, SingleThreaded: true, Bindings: store})
	if err != nil || len(diags) != 0 || len(raw) != 3 {
		t.Fatalf("extract: err=%v diags=%+v entries=%d", err, diags, len(raw))
	}
	rendered := RenderArtifactIndex("@acme/dates", datesRoot, raw)
	if !reflect.DeepEqual(rendered, RenderArtifactIndex("@acme/dates", datesRoot, append([]purefunctions.Entry{raw[2], raw[0]}, raw[1]))) {
		t.Error("the render must not depend on entry order")
	}
	// What a dates build's dist ships: its modules in each emit mode, plus the index.
	for _, mode := range []constants.EmitMode{constants.EmitCode, constants.EmitFunctions} {
		graph := purefunctions.CollectEntries(raw, mode)
		graph.AddMissingStubs(nil)
		modules, err := entrymodules.RenderGrouped(graph, nil)
		if err != nil {
			t.Fatal(err)
		}
		dir := datesRoot + "/dist/" + constants.PureFnArtifactDir
		files := map[string]string{datesRoot + "/package.json": `{"name":"@acme/dates"}`, dir + "/" + constants.PureFnArtifactIndexFile: string(rendered)}
		for _, entry := range raw {
			files[dir+"/"+ModulePath(entry.ID)] = modules[entrymodules.ModuleName(entry.ID, entrymodules.KindPureFn)]
		}
		viaArtifact := storeOver(files).Package(datesRoot)
		fromSource := store.Package(datesRoot)
		if !fromSource.FromSource || viaArtifact.FromSource {
			t.Fatalf("lanes: source=%v artifact=%v err=%v", fromSource.FromSource, viaArtifact.FromSource, fromSource.Err)
		}
		if !reflect.DeepEqual(viaArtifact.IDs(), fromSource.IDs()) {
			t.Errorf("%s: ids differ:\nartifact: %v\nsource:   %v", mode, viaArtifact.IDs(), fromSource.IDs())
		}
		for _, id := range fromSource.IDs() {
			if got, want := rowOf(t, viaArtifact, id), rowOf(t, fromSource, id); !reflect.DeepEqual(got, want) {
				t.Errorf("%s: %s differs:\nartifact: %+v\nsource:   %+v", mode, id, got, want)
			}
		}
		if !reflect.DeepEqual(viaArtifact.rowFile, fromSource.rowFile) || viaArtifact.rowFile[raw[0].ID] == "" {
			t.Errorf("files differ:\nartifact: %v\nsource:   %v", viaArtifact.rowFile, fromSource.rowFile)
		}
	}
	var parsed ArtifactIndex
	if err := json.Unmarshal(rendered, &parsed); err != nil {
		t.Fatal(err)
	}
	if parsed.Format != ArtifactFormat || parsed.Package != "@acme/dates" || !sort.SliceIsSorted(parsed.PureFns, func(i, j int) bool { return parsed.PureFns[i].ID < parsed.PureFns[j].ID }) {
		t.Errorf("index = %+v", parsed)
	}
	for _, row := range parsed.PureFns {
		if !strings.HasPrefix(row.File, "src/") {
			t.Errorf("row = %+v", row)
		}
	}
}

// The marker package as published: its own build writes mion-pure-fns/, so its built-ins serve like any other's.
func TestMarker_ServedFromItsArtifact(t *testing.T) {
	store, cwd := sourceTree(t, nil)
	root, ok := store.ResolvePackage(MarkerPackageName, cwd)
	if !ok {
		t.Fatal("marker package not resolved from the consumer cwd")
	}
	idx := store.Package(root)
	if idx.Err != nil {
		t.Fatalf("marker rows: %v", idx.Err)
	}
	if idx.FromSource {
		t.Error("the marker package must serve from its artifact, not its sources")
	}
	all := purefnids.All()
	if len(all) == 0 {
		t.Fatal("purefnids.All() is empty")
	}
	var missing []string
	for _, id := range all {
		if _, found := idx.Row(id); !found {
			missing = append(missing, purefnids.NameOf(id)+" ("+id+")")
		}
	}
	if len(missing) != 0 {
		t.Errorf("%d generated id(s) are not in the marker artifact:\n  %s\nrebuild: pnpm run check:builds", len(missing), strings.Join(missing, "\n  "))
	}
	// circular-pure-fns.ts is imported by nothing, so only an artifact rendered from every registration carries it.
	if _, found := idx.Row(purefnids.FindCycle); !found {
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

// With neither artifact nor sources it serves nothing, through the PFE9016 lane any unbuilt dependency uses.
func TestMarker_WithoutArtifactOrSourcesServesNothing(t *testing.T) {
	store, cwd := sourceTree(t, nil)
	root, _ := store.ResolvePackage(MarkerPackageName, cwd)
	pruned := storeOver(map[string]string{
		root + "/package.json": `{"name":"@mionjs/run-types"}`,
	})
	idx := pruned.Package(root)
	if idx.Err != nil {
		t.Fatalf("a pruned install is not an error here, it is an unbuilt package: %v", idx.Err)
	}
	if idx.Built() {
		t.Error("nothing must be served from a pruned install")
	}
}

// Catches a dist built before an edited pure-fn body, which a consumer meets as an import of a module
// nothing registers.
func TestMarker_ArtifactOnDiskHoldsEveryGeneratedID(t *testing.T) {
	root, err := filepath.Abs(filepath.Join("..", "..", "..", "..", "packages", "run-types"))
	if err != nil {
		t.Fatal(err)
	}
	store := NewStore(osvfs.FS())
	idx := store.Package(tspath.NormalizePath(root))
	if idx.Err != nil {
		t.Fatal(idx.Err)
	}
	if !reflect.DeepEqual(idx.IDs(), purefnids.All()) {
		t.Errorf("the built artifact and the generated constants disagree\nartifact:  %v\nconstants: %v\nrebuild: pnpm run check:builds", idx.IDs(), purefnids.All())
	}
}

// An id is a hash of the body that ships, so the session's own program, a side program and the generated
// constants must land on the same ids; that agreement is what pins the artifact to the shipped sources.
func TestMarker_BothLanesAgreeOnIds(t *testing.T) {
	root, err := filepath.Abs(filepath.Join("..", "..", "..", "..", "packages", "run-types"))
	if err != nil {
		t.Fatal(err)
	}
	root = tspath.NormalizePath(root)
	files := ScanRegistrations(root, osvfs.FS())
	if len(files) == 0 {
		t.Fatalf("no registration module found under %s", root)
	}
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
		return idx.IDs()
	}
	sessionIDs, ownIDs := ids(viaSession), ids(own)
	if !reflect.DeepEqual(sessionIDs, ownIDs) {
		t.Errorf("the two lanes disagree on ids:\nsession: %v\nown:     %v", sessionIDs, ownIDs)
	}
	if !reflect.DeepEqual(sessionIDs, purefnids.All()) {
		t.Errorf("ids extracted from the sources differ from the generated constants (regenerate: pnpm miondevx core codegen builtinpurefns)")
	}
}
