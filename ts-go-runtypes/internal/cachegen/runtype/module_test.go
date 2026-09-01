package runtype

import (
	"sort"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// emit collects + renders the runtype modules (the bundle plus one facade per
// root) demanding every listed node as a reflection root, and returns the
// concatenated sources in sorted-basename order (deterministic, so the
// byte-equality tests below stay stable).
func emit(t *testing.T, runTypes []*reflection.RunType) string {
	t.Helper()
	modules := emitModules(t, allIDs(runTypes), runTypes)
	basenames := make([]string, 0, len(modules))
	for basename := range modules {
		basenames = append(basenames, basename)
	}
	sort.Strings(basenames)
	var all strings.Builder
	for _, basename := range basenames {
		all.WriteString(modules[basename])
		all.WriteString("\n")
	}
	return all.String()
}

// emitModules runs CollectEntries with the given reflection roots (one bare-id
// site per root) and renders the resulting graph.
func emitModules(t *testing.T, roots []string, runTypes []*reflection.RunType) map[string]string {
	t.Helper()
	sites := make([]protocol.Site, 0, len(roots))
	for _, root := range roots {
		sites = append(sites, protocol.Site{ID: root})
	}
	graph := CollectEntries(protocol.Dump{RunTypes: runTypes, Sites: sites})
	modules, err := entrymodules.RenderGrouped(graph, nil)
	if err != nil {
		t.Fatalf("entrymodules.Render: %v", err)
	}
	return modules
}

// bundleOf returns the single data-bundle module source.
func bundleOf(t *testing.T, modules map[string]string) string {
	t.Helper()
	source, ok := modules[constants.RunTypesBundleBasename]
	if !ok {
		t.Fatalf("no %q bundle module rendered, got %v", constants.RunTypesBundleBasename, keysOfModules(modules))
	}
	return source
}

func allIDs(runTypes []*reflection.RunType) []string {
	ids := make([]string, 0, len(runTypes))
	for _, runType := range runTypes {
		ids = append(ids, runType.ID)
	}
	return ids
}

func keysOfModules(modules map[string]string) []string {
	keys := make([]string, 0, len(modules))
	for key := range modules {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func intPtr(n int) *int { return &n }

// TestBundleShape — all nodes land as rows of ONE bundle module
// (`rtmod:/runtypes.js`) with tuple head [4,<hole>,<ini|hole>,'rts_<hash>',
// [rows…],[rels…]] (the bundle is dep-less — rows are inline; an atomic node
// has no relations, so `rels` is empty), and each root gets a facade module
// [5,()=>[__rt_runtypes],<hole>,'<rootId>'] whose single dep imports the bundle.
func TestBundleShape(t *testing.T) {
	modules := emitModules(t, []string{"x1"}, []*reflection.RunType{{ID: "x1", Kind: reflection.KindString}})
	bundle := bundleOf(t, modules)
	if !strings.Contains(bundle, "export const __rt_runtypes=[4,,,'rts_") {
		t.Errorf("expected bundle tuple head [4,,,'rts_…'], got:\n%s", bundle)
	}
	if !strings.Contains(bundle, ",[['x1',5]],[]];") {
		t.Errorf("expected single row [['x1',5]] + empty rels, got:\n%s", bundle)
	}
	if strings.Contains(bundle, "import ") {
		t.Errorf("bundle must have no imports, got:\n%s", bundle)
	}

	facade, ok := modules["x1"]
	if !ok {
		t.Fatalf("expected facade module x1, got %v", keysOfModules(modules))
	}
	wantImport := "import {__rt_runtypes} from 'rtmod:/" + constants.RunTypesBundleBasename + ".js';\n"
	if !strings.HasPrefix(facade, wantImport) {
		t.Errorf("facade must import the bundle:\n got: %q\nwant prefix: %q", facade, wantImport)
	}
	if !strings.Contains(facade, "export const __rt_x1=[5,()=>[__rt_runtypes],,'x1'];") {
		t.Errorf("facade tuple mismatch, got:\n%s", facade)
	}
}

// TestBundleRowsLineSeparated — a multi-row data array puts each row on its
// own line (readability); a single-row bundle stays on one line. The rows
// remain comma-joined inside the array, so this is whitespace-only.
func TestBundleRowsLineSeparated(t *testing.T) {
	multi := bundleOf(t, emitModules(t, []string{"aaa111", "bbb222"}, []*reflection.RunType{
		{ID: "aaa111", Kind: reflection.KindString},
		{ID: "bbb222", Kind: reflection.KindNumber},
	}))
	if !strings.Contains(multi, "],\n[") {
		t.Errorf("expected one row per line (`],\\n[`), got:\n%s", multi)
	}
	single := bundleOf(t, emitModules(t, []string{"aaa111"}, []*reflection.RunType{
		{ID: "aaa111", Kind: reflection.KindString},
	}))
	if strings.Contains(single, "],\n[") {
		t.Errorf("single-row bundle must not carry a row separator, got:\n%s", single)
	}
}

// TestNoReflectionRoots — a dump without reflection sites emits NO runtype
// modules at all (createX-only files pay zero reflection payload).
func TestNoReflectionRoots(t *testing.T) {
	graph := CollectEntries(protocol.Dump{
		RunTypes: []*reflection.RunType{{ID: "x1", Kind: reflection.KindString}},
		Sites:    []protocol.Site{{ID: "x1", FnId: "Qm3p"}}, // createX site, not reflection
	})
	if len(graph) != 0 {
		t.Fatalf("expected empty graph for fn-only sites, got %d entries", len(graph))
	}
}

// TestClosureScopedToRoots — only nodes reachable from the demanded roots
// become rows; unrelated dumped nodes stay out of the bundle.
func TestClosureScopedToRoots(t *testing.T) {
	modules := emitModules(t, []string{"root1"}, []*reflection.RunType{
		{ID: "root1", Kind: reflection.KindProperty, Name: "p", Child: reflection.NewRef("chld1")},
		{ID: "chld1", Kind: reflection.KindString},
		{ID: "lone1", Kind: reflection.KindNumber},
	})
	bundle := bundleOf(t, modules)
	if !strings.Contains(bundle, "['chld1',5]") {
		t.Errorf("closure row chld1 missing:\n%s", bundle)
	}
	if strings.Contains(bundle, "lone1") {
		t.Errorf("unreachable node lone1 must not be a row:\n%s", bundle)
	}
	if _, ok := modules["lone1"]; ok {
		t.Errorf("no facade for an undemanded node")
	}
}

// TestSimpleAtomic — a single KindString node emits row `['id',5]` with
// all trailing hole args trimmed.
func TestSimpleAtomic(t *testing.T) {
	out := emit(t, []*reflection.RunType{{ID: "LrjxT1", Kind: reflection.KindString}})
	if !strings.Contains(out, `[['LrjxT1',5]]`) {
		t.Errorf("expected row `['LrjxT1',5]` (trailing u trimmed), got:\n%s", out)
	}
}

// TestStaticForm — Property with IsSafeName=true and Child set: the child ref
// is wired through the parallel `rels` array by ROW INDEX (not a c('<id>')
// footer), and the child is a row of the same bundle.
func TestStaticForm(t *testing.T) {
	runTypes := []*reflection.RunType{
		{ID: "LrjxT1", Kind: reflection.KindString},
		{
			ID:         "BxzL39",
			Kind:       reflection.KindProperty,
			Name:       "kind",
			IsSafeName: true,
			Child:      reflection.NewRef("LrjxT1"),
		},
	}
	modules := emitModules(t, []string{"BxzL39"}, runTypes)
	bundle := bundleOf(t, modules)
	if !strings.Contains(bundle, `['BxzL39',15,,,'kind',,,,,,,!0]`) {
		t.Errorf("expected Property row `['BxzL39',15,…,!0]`, got:\n%s", bundle)
	}
	if !strings.Contains(bundle, `['LrjxT1',5]`) {
		t.Errorf("expected child row in the same bundle, got:\n%s", bundle)
	}
	// Sorted rows: BxzL39(0), LrjxT1(1). BxzL39.child → row index 1, so the
	// bundle's `rels` slot is [[1]] (LrjxT1 is a leaf, trailing-trimmed).
	if !strings.Contains(bundle, `],[[1]]];`) {
		t.Errorf("expected index-based child relation `rels=[[1]]`, got:\n%s", bundle)
	}
	if strings.Contains(bundle, "function ini(") || strings.Contains(bundle, "useRunType") {
		t.Errorf("a relation-only bundle must not emit an ini / c('<id>') footer, got:\n%s", bundle)
	}
}

// TestReflectionForm — the same Property reached via the reflection-style
// resolution path must produce byte-equal output to the static form.
func TestReflectionForm(t *testing.T) {
	staticRunTypes := []*reflection.RunType{
		{ID: "LrjxT1", Kind: reflection.KindString},
		{ID: "BxzL39", Kind: reflection.KindProperty, Name: "kind", IsSafeName: true, Child: reflection.NewRef("LrjxT1")},
	}
	reflectionRunTypes := []*reflection.RunType{
		{ID: "LrjxT1", Kind: reflection.KindString},
		{ID: "BxzL39", Kind: reflection.KindProperty, Name: "kind", IsSafeName: true, Child: reflection.NewRef("LrjxT1")},
	}
	if got := emit(t, reflectionRunTypes); got != emit(t, staticRunTypes) {
		t.Errorf("static and reflection forms emit different bytes:\nstatic:\n%s\nreflection:\n%s", emit(t, staticRunTypes), got)
	}
}

// TestPositionZeroIsPreserved — Position is *int; a value of 0 must
// round-trip as `0` (not a hole) because the slot is meaningful at
// position 0.
func TestPositionZeroIsPreserved(t *testing.T) {
	out := emit(t, []*reflection.RunType{{
		ID:       "sCSEqy",
		Kind:     reflection.KindParameter,
		Name:     "name",
		Position: intPtr(0),
	}})
	if !strings.Contains(out, `['sCSEqy',18,,,'name',,,,,,,,0]`) {
		t.Errorf("expected position 0 to render as `0`, got:\n%s", out)
	}
}

// TestFooterLiteralPassesHoleForLiteralArg — bigint literal: the `literal`
// row arg is a hole (the ini body handles the construction).
func TestFooterLiteralPassesUForLiteralArg(t *testing.T) {
	out := emit(t, []*reflection.RunType{{
		ID:      "bigID",
		Kind:    reflection.KindLiteral,
		Literal: "42",
		Flags:   []string{"bigint"},
	}})
	if !strings.Contains(out, `['bigID',13,,,,,`) {
		t.Errorf("expected bigint literal to pass a hole at the literal slot, got:\n%s", out)
	}
	if !strings.Contains(out, `c('bigID').literal = BigInt('42');`) {
		t.Errorf("expected ini BigInt assignment via cache ref, got:\n%s", out)
	}
}

// TestClassBuiltinUnchanged — a class with ClassRef.Builtin emits the
// `c('X').classType = globalThis.<Name>;` ini line.
func TestClassBuiltinUnchanged(t *testing.T) {
	out := emit(t, []*reflection.RunType{{
		ID:       "dateID",
		Kind:     reflection.KindClass,
		TypeName: "Date",
		ClassRef: &reflection.ClassRef{Builtin: "Date"},
	}})
	if !strings.Contains(out, `['dateID',20,,'Date']`) {
		t.Errorf("expected class row with typeName, got:\n%s", out)
	}
	if !strings.Contains(out, `c('dateID').classType = globalThis.Date;`) {
		t.Errorf("expected ini classType assignment via cache ref, got:\n%s", out)
	}
}

// TestCycle — two nodes referencing each other via Child are rows of the same
// bundle; the cycle is wired by ROW INDEX in `rels` (index refs have no TDZ, so
// no back-edge special-casing is needed).
func TestCycle(t *testing.T) {
	a := &reflection.RunType{ID: "A1", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: reflection.NewRef("B1")}
	b := &reflection.RunType{ID: "B1", Kind: reflection.KindProperty, Name: "b", IsSafeName: true, Child: reflection.NewRef("A1")}
	modules := emitModules(t, []string{"A1"}, []*reflection.RunType{a, b})
	bundle := bundleOf(t, modules)
	if !strings.Contains(bundle, "['A1',15,") || !strings.Contains(bundle, "['B1',15,") {
		t.Errorf("both cycle members must be rows of the bundle:\n%s", bundle)
	}
	// Sorted rows: A1(0), B1(1). A1.child → 1, B1.child → 0.
	if !strings.Contains(bundle, `,[[1],[0]]];`) {
		t.Errorf("expected index-based cycle relations `rels=[[1],[0]]`, got:\n%s", bundle)
	}
}

// TestRelationsAreIndexBased — ref relations ride the bundle's parallel `rels`
// array as ROW INDICES, not `c('<id>')` footer lookups. A child shared by
// several parents is referenced by its single row index from each, and a
// relation-only bundle emits no residual ini.
func TestRelationsAreIndexBased(t *testing.T) {
	runTypes := []*reflection.RunType{
		{ID: "shrd1", Kind: reflection.KindString},
		{ID: "p1", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: reflection.NewRef("shrd1")},
		{ID: "p2", Kind: reflection.KindProperty, Name: "b", IsSafeName: true, Child: reflection.NewRef("shrd1")},
	}
	bundle := bundleOf(t, emitModules(t, []string{"p1", "p2"}, runTypes))
	// Sorted rows: p1(0), p2(1), shrd1(2). Both p1 and p2 point child → index 2;
	// shrd1 is a leaf (trailing-trimmed). So `rels` is [[2],[2]].
	if !strings.Contains(bundle, `,[[2],[2]]];`) {
		t.Errorf("expected index-based rels `[[2],[2]]`, got:\n%s", bundle)
	}
	// No repeated id strings, no footer lookups, no ini for a relation-only bundle.
	if strings.Contains(bundle, "useRunType") || strings.Contains(bundle, "c('shrd1')") {
		t.Errorf("relations must not emit c('<id>') footer lookups:\n%s", bundle)
	}
	if strings.Contains(bundle, "function ini") {
		t.Errorf("no expression-specials → no ini fn expected:\n%s", bundle)
	}
}

// TestBundleKeyTracksContent — the bundle's tuple key is a content hash:
// different row sets must produce different keys (the runtime's
// processed-keys guard relies on this across HMR evolutions).
func TestBundleKeyTracksContent(t *testing.T) {
	keyOf := func(modules map[string]string) string {
		t.Helper()
		bundle := bundleOf(t, modules)
		start := strings.Index(bundle, "'rts_")
		if start < 0 {
			t.Fatalf("no bundle key in:\n%s", bundle)
		}
		end := strings.Index(bundle[start+1:], "'")
		return bundle[start+1 : start+1+end]
	}
	one := keyOf(emitModules(t, []string{"a"}, []*reflection.RunType{{ID: "a", Kind: reflection.KindString}}))
	two := keyOf(emitModules(t, []string{"b"}, []*reflection.RunType{{ID: "b", Kind: reflection.KindNumber}}))
	same := keyOf(emitModules(t, []string{"a"}, []*reflection.RunType{{ID: "a", Kind: reflection.KindString}}))
	if one == two {
		t.Errorf("different row sets share bundle key %q", one)
	}
	if one != same {
		t.Errorf("same row set produced different keys: %q vs %q", one, same)
	}
}

// TestDeterministic — same input must produce byte-identical output.
func TestDeterministic(t *testing.T) {
	runTypes := []*reflection.RunType{
		{ID: "a", Kind: reflection.KindString},
		{ID: "b", Kind: reflection.KindNumber},
		{ID: "c", Kind: reflection.KindProperty, Name: "x", Child: reflection.NewRef("a")},
	}
	if first, second := emit(t, runTypes), emit(t, runTypes); first != second {
		t.Errorf("non-deterministic output:\nfirst:\n%s\nsecond:\n%s", first, second)
	}
}

// TestKnownFieldsCovered is the defensive guardrail against forgetting a
// scalar slot when a new field is added to RunType.
func TestKnownFieldsCovered(t *testing.T) {
	out := emit(t, []*reflection.RunType{{
		ID:           "FULL",
		Kind:         reflection.KindClass,
		SubKind:      reflection.SubKindNonSerializable,
		TypeName:     "TN",
		Name:         "NM",
		Literal:      "L",
		Optional:     true,
		Readonly:     true,
		IsAbstract:   true,
		IsStatic:     true,
		Visibility:   intPtr(2),
		IsSafeName:   true,
		Position:     intPtr(7),
		IsCircular:   true,
		Flags:        []string{"f1"},
		Description:  "D",
		DefaultVal:   "DEF",
		EnumVal:      map[string]any{"k": 1.0},
		Values:       []any{"v"},
		NotSupported: true,
	}})
	expected := `['FULL',20,2004,'TN','NM','L',!0,!0,!0,!0,2,!0,7,!0,['f1'],'D','DEF',{'k':1},['v'],!0]`
	if !strings.Contains(out, expected) {
		t.Errorf("expected fully-populated row:\n  %s\ngot:\n%s", expected, out)
	}
}

// TestSubKindRendered — a class node with a non-zero SubKind must place
// the numeric value at the subKind slot.
func TestSubKindRendered(t *testing.T) {
	out := emit(t, []*reflection.RunType{{
		ID:       "mapID",
		Kind:     reflection.KindClass,
		SubKind:  reflection.SubKindMap,
		TypeName: "Map",
		ClassRef: &reflection.ClassRef{Builtin: "Map"},
	}})
	if !strings.Contains(out, `['mapID',20,2002,'Map']`) {
		t.Errorf("expected class row with subKind, got:\n%s", out)
	}
}

// TestNoLegacyTopLevelExports — the previous emitters used
// `export const t_<hash> = …` / `rt(…)` skeleton calls. Make sure neither
// pattern survives in the bundle / facade modules.
func TestNoLegacyTopLevelExports(t *testing.T) {
	out := emit(t, []*reflection.RunType{{ID: "x", Kind: reflection.KindString}})
	if strings.Contains(out, "export const t_") {
		t.Errorf("legacy `export const t_…` lines must not appear in:\n%s", out)
	}
	if strings.Contains(out, "rt(") {
		t.Errorf("legacy `rt(…)` skeleton calls must not appear in:\n%s", out)
	}
}
