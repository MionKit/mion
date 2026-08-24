package entrymodules

import (
	"strings"
	"testing"
)

func renderOne(t *testing.T, graph Graph, key string) string {
	t.Helper()
	out, err := RenderGrouped(graph, nil)
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	entry := graph[key]
	source, ok := out[ModuleName(entry.Key, entry.Kind)]
	if !ok {
		t.Fatalf("no module rendered for %q", key)
	}
	return source
}

func TestRender_LeafRunType(t *testing.T) {
	graph := Graph{}
	graph.Add(&Entry{Key: "AAaa", Kind: KindRunType, ArgsText: "'AAaa',5"})
	source := renderOne(t, graph, "AAaa")

	want := "export const __rt_AAaa=[0,,,'AAaa',5];\n"
	if source != want {
		t.Fatalf("leaf module mismatch:\n got: %q\nwant: %q", source, want)
	}
}

func TestRender_OrderingLeavesFirstAlphaWithinLevel(t *testing.T) {
	// parent → {bb, aa}; bb → {aa}. Levels: aa=0, bb=1, parent=2.
	graph := Graph{}
	graph.Add(&Entry{Key: "parent", Kind: KindRunType, ArgsText: "'parent',30", Deps: []string{"bb", "aa"}})
	graph.Add(&Entry{Key: "bb", Kind: KindRunType, ArgsText: "'bb',5", Deps: []string{"aa"}})
	graph.Add(&Entry{Key: "aa", Kind: KindRunType, ArgsText: "'aa',5"})
	source := renderOne(t, graph, "parent")

	wantImports := "import {__rt_aa} from 'rtmod:/aa.js';\nimport {__rt_bb} from 'rtmod:/bb.js';\n"
	if !strings.HasPrefix(source, wantImports) {
		t.Fatalf("import order mismatch:\n got: %q\nwant prefix: %q", source, wantImports)
	}
	if !strings.Contains(source, "export const __rt_parent=[0,()=>[__rt_aa,__rt_bb],,'parent',30];") {
		t.Fatalf("deps order mismatch: %q", source)
	}
}

func TestRender_ImportsDirectDepsOnly(t *testing.T) {
	// grandparent → parent → leaf: the grandparent module imports ONLY its
	// direct dep — transitive deps arrive through the dep module's own
	// imports (and the runtime's recursive deps() walk), never flattened.
	graph := Graph{}
	graph.Add(&Entry{Key: "grand", Kind: KindRunType, ArgsText: "'grand',30", Deps: []string{"parent"}})
	graph.Add(&Entry{Key: "parent", Kind: KindRunType, ArgsText: "'parent',30", Deps: []string{"leaf"}})
	graph.Add(&Entry{Key: "leaf", Kind: KindRunType, ArgsText: "'leaf',5"})
	source := renderOne(t, graph, "grand")

	if strings.Contains(source, "rtmod:/leaf.js") {
		t.Fatalf("grandparent must not import its transitive dep: %q", source)
	}
	wantImports := "import {__rt_parent} from 'rtmod:/parent.js';\n"
	if !strings.HasPrefix(source, wantImports) {
		t.Fatalf("direct-dep import mismatch:\n got: %q\nwant prefix: %q", source, wantImports)
	}
	if !strings.Contains(source, "export const __rt_grand=[0,()=>[__rt_parent],,'grand',30];") {
		t.Fatalf("deps thunk should hold the direct deps only: %q", source)
	}
}

func TestRender_SameLevelAlphabetical(t *testing.T) {
	// Two leaves at level 0 must order alphabetically regardless of Deps order.
	graph := Graph{}
	graph.Add(&Entry{Key: "root", Kind: KindRunType, ArgsText: "'root',30", Deps: []string{"zz", "mm"}})
	graph.Add(&Entry{Key: "zz", Kind: KindRunType, ArgsText: "'zz',5"})
	graph.Add(&Entry{Key: "mm", Kind: KindRunType, ArgsText: "'mm',5"})
	source := renderOne(t, graph, "root")

	mm := strings.Index(source, "rtmod:/mm.js")
	zz := strings.Index(source, "rtmod:/zz.js")
	if mm < 0 || zz < 0 || mm > zz {
		t.Fatalf("expected mm before zz at the same level: %q", source)
	}
}

func TestRender_CycleCollapsesToOneLevel(t *testing.T) {
	// node ↔ peer cycle hanging off a shared leaf; both cycle members share a
	// level, ordered alphabetically, and each imports the other without error.
	graph := Graph{}
	graph.Add(&Entry{Key: "leaf", Kind: KindRunType, ArgsText: "'leaf',5"})
	graph.Add(&Entry{Key: "node", Kind: KindRunType, ArgsText: "'node',30", Deps: []string{"peer", "leaf"}})
	graph.Add(&Entry{Key: "peer", Kind: KindRunType, ArgsText: "'peer',30", Deps: []string{"node", "leaf"}})
	source := renderOne(t, graph, "node")

	if !strings.Contains(source, "export const __rt_node=[0,()=>[__rt_leaf,__rt_peer],,'node',30];") {
		// direct deps: leaf(level0) < peer(cycle level)
		t.Fatalf("cycle deps order mismatch: %q", source)
	}
	wantImports := "import {__rt_leaf} from 'rtmod:/leaf.js';\nimport {__rt_peer} from 'rtmod:/peer.js';\n"
	if !strings.HasPrefix(source, wantImports) {
		t.Fatalf("cycle import order mismatch: %q", source)
	}
}

func TestRender_SelfReferenceIgnoredInDeps(t *testing.T) {
	graph := Graph{}
	graph.Add(&Entry{Key: "rec", Kind: KindTypeFn, FamilyTag: "val", ArgsText: "'rec','x'", Deps: []string{"rec"}})
	source := renderOne(t, graph, "rec")

	if strings.Contains(source, "import") {
		t.Fatalf("self-dep must not import itself: %q", source)
	}
	if strings.Contains(source, "()=>[") {
		t.Fatalf("self-only dep should leave the entry dep-less (no thunk): %q", source)
	}
	if !strings.Contains(source, "export const __rt_rec=['val',,,'rec','x'];") {
		t.Fatalf("type-fn tuple slot0 should be the quoted family tag: %q", source)
	}
}

func TestRender_RunTypeInitBody(t *testing.T) {
	graph := Graph{}
	graph.Add(&Entry{Key: "obj1", Kind: KindRunType, ArgsText: "'obj1',30",
		InitBody: "c('obj1').child = c('chl1');\n", Deps: []string{"chl1"}})
	graph.Add(&Entry{Key: "chl1", Kind: KindRunType, ArgsText: "'chl1',5"})
	source := renderOne(t, graph, "obj1")

	if !strings.Contains(source, "function ini(rtu){const c=(id)=>rtu.useRunType(id);\nc('obj1').child = c('chl1');\n}\n") {
		t.Fatalf("ini body mismatch: %q", source)
	}
	if !strings.Contains(source, "export const __rt_obj1=[0,()=>[__rt_chl1],ini,'obj1',30];") {
		t.Fatalf("ini slot should reference the local fn: %q", source)
	}
}

func TestRender_MissingStub(t *testing.T) {
	graph := Graph{}
	graph.Add(&Entry{Key: "Qm3p_dead", Kind: KindMissing})
	source := renderOne(t, graph, "Qm3p_dead")

	want := "export const __rt_Qm3p_dead=[3,,,'Qm3p_dead'];\n"
	if source != want {
		t.Fatalf("stub mismatch:\n got: %q\nwant: %q", source, want)
	}
}

func TestRender_PureFnModuleNameEncoding(t *testing.T) {
	graph := Graph{}
	graph.Add(&Entry{Key: "rt::newRunTypeErr", Kind: KindPureFn, ArgsText: "'rt::newRunTypeErr','h1'"})
	graph.Add(&Entry{Key: "we ird::fn$x", Kind: KindPureFn, ArgsText: "'we ird::fn$x','h2'", Deps: []string{"rt::newRunTypeErr"}})
	out, err := RenderGrouped(graph, nil)
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	if _, ok := out["pf/rt/newRunTypeErr"]; !ok {
		t.Fatalf("plain pure-fn basename missing: %v", keysOf(out))
	}
	weird, ok := out["pf/we$20ird/fn$24x"]
	if !ok {
		t.Fatalf("escaped pure-fn basename missing: %v", keysOf(out))
	}
	if !strings.Contains(weird, "import {__rt_pf$2Frt$2FnewRunTypeErr} from 'rtmod:/pf/rt/newRunTypeErr.js';") {
		t.Fatalf("pure-fn dep import should use the encoded basename: %q", weird)
	}
	if !strings.Contains(weird, "export const __rt_pf$2Fwe$20ird$2Ffn$24x=[2,()=>[__rt_pf$2Frt$2FnewRunTypeErr],,'we ird::fn$x','h2'];") {
		t.Fatalf("pure-fn tuple should keep the RAW cache key: %q", weird)
	}
}

func TestCascade_DropsTypeFnWithMissingDepTransitively(t *testing.T) {
	graph := Graph{}
	graph.Add(&Entry{Key: "Qm3p_root", Kind: KindTypeFn, FamilyTag: "val", ArgsText: "'Qm3p_root'", Deps: []string{"Qm3p_mid"}})
	graph.Add(&Entry{Key: "Qm3p_mid", Kind: KindTypeFn, FamilyTag: "val", ArgsText: "'Qm3p_mid'", Deps: []string{"Qm3p_gone"}})

	dropped := graph.Cascade()
	if len(dropped) != 2 || dropped[0] != "Qm3p_mid" || dropped[1] != "Qm3p_root" {
		t.Fatalf("cascade dropped %v, want [Qm3p_mid Qm3p_root]", dropped)
	}

	graph.AddMissingStubs([]string{"Qm3p_root"})
	if entry := graph["Qm3p_root"]; entry == nil || entry.Kind != KindMissing {
		t.Fatalf("demanded root should be stubbed after cascade")
	}
}

func TestAddMissingStubs_CoversUnresolvedDeps(t *testing.T) {
	graph := Graph{}
	graph.Add(&Entry{Key: "pf-user", Kind: KindPureFn, ArgsText: "'pf-user','h'", SoftDeps: []string{"rt::elsewhere"}})
	graph.AddMissingStubs(nil)
	if entry := graph["rt::elsewhere"]; entry == nil || entry.Kind != KindMissing {
		t.Fatalf("unresolved pure-fn dep should be stubbed")
	}
	if _, err := RenderGrouped(graph, nil); err != nil {
		t.Fatalf("Render after stub pass: %v", err)
	}
}

func TestRender_Deterministic(t *testing.T) {
	build := func() Graph {
		graph := Graph{}
		graph.Add(&Entry{Key: "r1", Kind: KindRunType, ArgsText: "'r1',30", Deps: []string{"r3", "r2"}})
		graph.Add(&Entry{Key: "r2", Kind: KindRunType, ArgsText: "'r2',30", Deps: []string{"r3"}})
		graph.Add(&Entry{Key: "r3", Kind: KindRunType, ArgsText: "'r3',5"})
		return graph
	}
	first, err := RenderGrouped(build(), nil)
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	for i := 0; i < 5; i++ {
		again, err := RenderGrouped(build(), nil)
		if err != nil {
			t.Fatalf("Render: %v", err)
		}
		for key, source := range first {
			if again[key] != source {
				t.Fatalf("non-deterministic output for %q", key)
			}
		}
	}
}

func keysOf(m map[string]string) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
