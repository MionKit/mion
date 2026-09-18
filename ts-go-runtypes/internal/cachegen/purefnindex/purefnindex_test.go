package purefnindex

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/microsoft/typescript-go/shim/vfs/osvfs"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/testfixtures"
)

// Every built-file fixture lives ONLY in the overlay, under /virtual: nothing on
// disk, so a package the scan finds was found through the program FS. An id is
// matched, never decoded, so the hash halves here are just distinct strings.

const (
	textPkg    = "/virtual/app/node_modules/@acme/text"
	slugifyID  = "@acme/text#slug00000000000"
	titleID    = "@acme/text#title0000000000"
	isoDayID   = "@acme/dates#day00000000000"
	trimID     = "@acme/util#trim00000000000"
	slugifyRow = `[2,,,'` + slugifyID + `',['utl'],'return (s) => s.toLowerCase();',[]]`
)

func storeOver(files map[string]string) *Store {
	return NewStore(program.NewOverlayFS(osvfs.FS(), files))
}

func textPackage(indexJS string) map[string]string {
	return map[string]string{
		textPkg + "/package.json":    `{"name":"@acme/text"}`,
		textPkg + "/dist/index.js":   indexJS,
		textPkg + "/dist/index.d.ts": "import type {PureFnId} from '@mionjs/run-types';\nexport declare const slugify: PureFnId<string>;\n",
	}
}

func codes(entries []purefunctions.Entry) []string {
	out := make([]string, 0, len(entries))
	for _, entry := range entries {
		out = append(out, entry.Key()+"="+entry.Code)
	}
	return out
}

// A code-mode build: the tuple carries the code string and the registration is
// an exported const naming the id.
func TestScan_CodeModeTupleAndExportConst(t *testing.T) {
	store := storeOver(textPackage(`import {registerPureFn} from '@mionjs/run-types';
const __rt_pf$slug = ` + slugifyRow + `;
export const slugify = registerPureFn(__rt_pf$slug, '` + slugifyID + `');
`))
	idx := store.Package(textPkg)
	if !idx.Built() || idx.Name != "@acme/text" {
		t.Fatalf("package not indexed: built=%v name=%q", idx.Built(), idx.Name)
	}
	row := idx.Rows[slugifyID]
	if row.Code != "return (s) => s.toLowerCase();" || !reflect.DeepEqual(row.ParamNames, []string{"utl"}) || len(row.PureFnDependencies) != 0 {
		t.Errorf("row = %+v", row)
	}
	if id, ok := store.BindingID(textPkg+"/dist/index.d.ts", "slugify"); !ok || id != slugifyID {
		t.Errorf("BindingID = %q, %v", id, ok)
	}
}

// A functions-mode build: the code slot is a hole and the body is the function
// literal's block, read back as the code string.
func TestScan_FunctionsModeTuple(t *testing.T) {
	store := storeOver(textPackage(`const t = [2,,,'` + slugifyID + `',['utl'],,[],function(utl){return (s) => s.toLowerCase();}];
export const slugify = registerPureFn(t, '` + slugifyID + `');
`))
	row, ok := store.Package(textPkg).Rows[slugifyID]
	if !ok || row.Code != "return (s) => s.toLowerCase();" {
		t.Errorf("row = %+v ok=%v", row, ok)
	}
}

// A minified bundle: renamed callee, double quotes, `export {a as b}`; the
// shape still identifies the tuple and the export.
func TestScan_MinifiedBundleWithNamedExports(t *testing.T) {
	store := storeOver(textPackage(`import{registerPureFn as r}from"@mionjs/run-types";const t=[2,,,"` + slugifyID + `",["utl"],"return (s) => s.toLowerCase();",[]],s=r(t,"` + slugifyID + `");export{s as slugify};`))
	if id, ok := store.BindingID(textPkg+"/dist/index.d.ts", "slugify"); !ok || id != slugifyID {
		t.Errorf("BindingID = %q, %v", id, ok)
	}
}

// A CommonJS emit binds through `exports.x = (0, m.registerPureFn)(…)`.
func TestScan_CommonJSExports(t *testing.T) {
	files := map[string]string{
		textPkg + "/package.json":     `{"name":"@acme/text"}`,
		textPkg + "/dist/index.cjs":   "\"use strict\";\nconst pureFn_1 = require('@mionjs/run-types');\nconst t = " + slugifyRow + ";\nexports.slugify = (0, pureFn_1.registerPureFn)(t, '" + slugifyID + "');\n",
		textPkg + "/dist/index.d.cts": "export declare const slugify: string;\n",
	}
	store := storeOver(files)
	if id, ok := store.BindingID(textPkg+"/dist/index.d.cts", "slugify"); !ok || id != slugifyID {
		t.Errorf("BindingID = %q, %v", id, ok)
	}
}

// No sibling JS next to the .d.ts (types emitted to their own dir): the one
// binding of that name anywhere in the package answers, and a name bound to two
// ids answers nothing.
func TestBindingID_NameFallback(t *testing.T) {
	files := map[string]string{
		textPkg + "/package.json":          `{"name":"@acme/text"}`,
		textPkg + "/dist/esm/index.js":     "const a = " + slugifyRow + ";\nconst b = [2,,,'" + titleID + "',['utl'],'return 1;',['" + slugifyID + "']];\nconst slugify = registerPureFn(a, '" + slugifyID + "');\nexport {slugify};\n",
		textPkg + "/dist/types/index.d.ts": "export declare const slugify: string;\nexport declare const title: string;\n",
	}
	store := storeOver(files)
	if id, ok := store.BindingID(textPkg+"/dist/types/index.d.ts", "slugify"); !ok || id != slugifyID {
		t.Errorf("fallback BindingID = %q, %v", id, ok)
	}
	if _, ok := store.BindingID(textPkg+"/dist/types/index.d.ts", "title"); ok {
		t.Error("a name no registration binds must not resolve")
	}
	dup := storeOver(map[string]string{
		textPkg + "/package.json":      `{"name":"@acme/text"}`,
		textPkg + "/dist/a.js":         "const a = " + slugifyRow + ";\nexport const slugify = registerPureFn(a, '" + slugifyID + "');\n",
		textPkg + "/dist/b.js":         "const b = [2,,,'" + titleID + "',['utl'],'return 2;',[]];\nexport const slugify = registerPureFn(b, '" + titleID + "');\n",
		textPkg + "/dist/types/i.d.ts": "export declare const slugify: string;\n",
	})
	if id, ok := dup.BindingID(textPkg+"/dist/types/i.d.ts", "slugify"); ok {
		t.Errorf("two registrations bound to slugify must not pick one, got %q", id)
	}
}

// app → dates → text, with dates carrying its OWN nested copy of text whose
// body differs from the hoisted one: closure resolves each dep from the package
// that names it, so dates' row pulls the nested slugify, never the hoisted one.
func TestClosure_AcrossPackagesFromDependentRoot(t *testing.T) {
	datesPkg := "/virtual/app/node_modules/@acme/dates"
	nestedText := datesPkg + "/node_modules/@acme/text"
	files := map[string]string{
		textPkg + "/package.json":     `{"name":"@acme/text"}`,
		textPkg + "/dist/index.js":    "const a = " + slugifyRow + ";\n",
		datesPkg + "/package.json":    `{"name":"@acme/dates"}`,
		datesPkg + "/dist/index.js":   "const d = [2,,,'" + isoDayID + "',['utl'],'return utl.getPureFn(\"" + slugifyID + "\");',['" + slugifyID + "']];\n",
		nestedText + "/package.json":  `{"name":"@acme/text"}`,
		nestedText + "/dist/index.js": "const t = [2,,,'" + titleID + "',['utl'],'return 1;',['" + slugifyID + "']];\nconst a = [2,,,'" + slugifyID + "',['utl'],'return (s) => s;',[]];\n",
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
// package with no tuples at all is the runtime-only lane; a package that is not
// installed is unresolved.
func TestClosure_MissingUnbuiltUnresolved(t *testing.T) {
	legacyPkg := "/virtual/app/node_modules/@acme/legacy"
	const padID = "@acme/legacy#pad0000000000"
	store := storeOver(map[string]string{
		textPkg + "/package.json":   `{"name":"@acme/text"}`,
		textPkg + "/dist/index.js":  "const a = " + slugifyRow + ";\n",
		legacyPkg + "/package.json": `{"name":"@acme/legacy"}`,
		legacyPkg + "/index.js":     "export const padId = registerPureFn((s) => s.padStart(4, '0'), '" + padID + "');\n",
	})
	result := store.Closure([]Demand{
		{ID: "@acme/text#gone0000000000", FromDir: "/virtual/app"},
		{ID: padID, FromDir: "/virtual/app"},
		{ID: trimID, FromDir: "/virtual/app"},
		{ID: "#own00000000000", FromDir: "/virtual/app"},
	})
	if len(result.Entries) != 0 {
		t.Errorf("nothing should be served, got %+v", result.Entries)
	}
	wantMissing := []Miss{
		{ID: padID, Package: "@acme/legacy", Root: legacyPkg, Built: false},
		{ID: "@acme/text#gone0000000000", Package: "@acme/text", Root: textPkg, Built: true},
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
		slugifyID:               "@acme/text",
		"lib#f":                 "lib",
		"#hash":                 "",
		"noseparator":           "",
		purefnids.NewRunTypeErr: "@mionjs/run-types",
		"@scope/name/deep#hash": "@scope/name/deep",
	} {
		if got := PackageOfID(id); got != want {
			t.Errorf("PackageOfID(%q) = %q, want %q", id, got, want)
		}
	}
}

// A nested node_modules is another package's, and a hidden dir is a build's
// scratch (a consumer's `.mion` holds served copies of other packages' rows):
// neither is part of this package's scan.
func TestScan_SkipsNestedNodeModulesAndHiddenDirs(t *testing.T) {
	store := storeOver(map[string]string{
		textPkg + "/package.json":                          `{"name":"@acme/text"}`,
		textPkg + "/dist/index.js":                         "const a = " + slugifyRow + ";\n",
		textPkg + "/node_modules/@acme/util/package.json":  `{"name":"@acme/util"}`,
		textPkg + "/node_modules/@acme/util/dist/index.js": "const u = [2,,,'" + trimID + "',['utl'],'return 0;',[]];\n",
		textPkg + "/.mion/types/pf/@acme/util/trim.js":     "const u = [2,,,'" + trimID + "',['utl'],'return 0;',[]];\n",
		textPkg + "/test/.mion/types/pf/x.js":              "const u = [2,,,'" + titleID + "',['utl'],'return 0;',[]];\n",
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

// A package whose built JS carries no tuple (a plain tsc emit) but ships its
// TypeScript under src/: the rows come from the source, extracted the way its
// own build would, including the dep it imports from a BUILT package's untyped
// .d.ts, and stripped of the positions a rewrite would use.
func TestSource_FallbackWhenDistCarriesNoTuple(t *testing.T) {
	store, cwd := sourceTree(t, map[string]string{
		"node_modules/@acme/text/package.json":       `{"name":"@acme/text","types":"./dist/index.d.ts"}`,
		"node_modules/@acme/text/dist/index.js":      "const t = " + slugifyRow + ";\nexport const slugify = registerPureFn(t, '" + slugifyID + "');\n",
		"node_modules/@acme/text/dist/index.d.ts":    "import type {PureFnId} from '@mionjs/run-types';\nexport declare const slugify: PureFnId<string>;\n",
		"node_modules/@acme/dates/package.json":      `{"name":"@acme/dates","types":"./dist/index.d.ts"}`,
		"node_modules/@acme/dates/dist/index.js":     "import {registerPureFnFactory} from '@mionjs/run-types';\nexport const isoDay = registerPureFnFactory(function (utl) { return function (d) { return d; }; });\n",
		"node_modules/@acme/dates/dist/index.d.ts":   "export declare const isoDay: string;\n",
		"node_modules/@acme/dates/src/index.ts":      datesSrc,
		"node_modules/@acme/dates/src/index.spec.ts": "import {registerPureFn} from '@mionjs/run-types';\nexport const notScanned = registerPureFn((s: string): string => s);\n",
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
	if id, ok := store.BindingID(tspath.ResolvePath(cwd, "node_modules/@acme/dates/dist/index.d.ts"), "isoDay"); !ok || id != row.ID {
		t.Errorf("BindingID through the source rows = %q, %v", id, ok)
	}
	result := store.Closure([]Demand{{ID: row.ID, FromDir: cwd}})
	if len(result.Entries) != 2 || len(result.Missing) != 0 || len(result.Unresolved) != 0 {
		t.Fatalf("closure = %+v", result)
	}
	if result.Entries[1].Code != "return (s) => s.toLowerCase();" {
		t.Errorf("text must be served from its BUILT dist, got %+v", result.Entries[1])
	}
}

// Built files win: a package shipping both a tuple-carrying dist and its src is
// read from dist, and src is never parsed.
func TestSource_DistWinsOverSource(t *testing.T) {
	store, cwd := sourceTree(t, map[string]string{
		"node_modules/@acme/text/package.json":  `{"name":"@acme/text"}`,
		"node_modules/@acme/text/dist/index.js": "const t = " + slugifyRow + ";\n",
		"node_modules/@acme/text/src/slug.ts":   "import {registerPureFn} from '@mionjs/run-types';\nexport const slugify = registerPureFn((s: string): string => s.toUpperCase());\n",
	})
	idx := store.Package(tspath.ResolvePath(cwd, "node_modules/@acme/text"))
	if idx.FromSource || idx.Rows[slugifyID].Code != "return (s) => s.toLowerCase();" {
		t.Errorf("dist must win: fromSource=%v row=%+v", idx.FromSource, idx.Rows[slugifyID])
	}
}

// The marker package, as a published consumer sees it: package.json, the dist
// .d.ts and src, no built JS. Its rows come from the generated source list.
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
	result := store.Closure([]Demand{{ID: purefnids.IsDateStringYMD, FromDir: cwd}, {ID: purefnids.IsDateStringDMY, FromDir: cwd}, {ID: "@mionjs/run-types#totallyMadeUp", FromDir: cwd}})
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
	if len(result.Missing) != 1 || result.Missing[0].ID != "@mionjs/run-types#totallyMadeUp" || !result.Missing[0].Built {
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
