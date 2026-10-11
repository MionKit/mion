package entrymodules

import (
	"strings"
	"testing"
)

// TestRenderGrouped_TypeModules: a type module exports its printed type and imports the ids it names type-only, a
// type-only cycle renders, and type imports never join the runtime deps.
func TestRenderGrouped_TypeModules(t *testing.T) {
	graph := Graph{}
	graph.Add(&Entry{Key: TypeDeclKey("tree"), Kind: KindTypeDecl, TypeText: "{children: T_list; value: string}", TypeDoc: "Tree",
		TypeImports: []string{"list"}})
	graph.Add(&Entry{Key: TypeDeclKey("list"), Kind: KindTypeDecl, TypeText: "T_tree[]", TypeImports: []string{"tree"}})
	graph.Add(&Entry{Key: "abcd_tree", Kind: KindTypeFn, FamilyTag: "val", TypeImports: []string{"tree"},
		ArgsText: "'abcd_tree','Tree',,,,,function g_abcd_tree(utl: RTUtils): (v: unknown) => v is T_tree{return (v: any): v is T_tree => true}"})
	out, err := RenderGrouped(graph, nil, true)
	if err != nil {
		t.Fatal(err)
	}
	tree := out["t/tree"]
	for _, want := range []string{"import type {T_list} from 'rtmod:/t/list.js';", "/** Tree */", "export type T_tree = {children: T_list; value: string};"} {
		if !strings.Contains(tree, want) {
			t.Errorf("t/tree lacks %q:\n%s", want, tree)
		}
	}
	if !strings.Contains(out["t/list"], "import type {T_tree} from 'rtmod:/t/tree.js';") {
		t.Errorf("the cycle's other half:\n%s", out["t/list"])
	}
	fn := out["abcd_tree"]
	for _, want := range []string{
		"import type {FnTypeTuple, RTUtils} from '@mionjs/run-types/runtime';",
		"import type {T_tree} from 'rtmod:/t/tree.js';",
		"export const __rt_abcd_tree: any=['val',undefined,undefined,'abcd_tree'",
	} {
		if !strings.Contains(fn, want) {
			t.Errorf("the typed fn module lacks %q:\n%s", want, fn)
		}
	}
	if strings.Contains(fn, "()=>[") {
		t.Errorf("a type import joined the deps thunk:\n%s", fn)
	}
}

// TestRenderGrouped_UntypedIgnoresTypeFields: outside emitMode ts nothing typed renders, even with type fields set.
func TestRenderGrouped_UntypedIgnoresTypeFields(t *testing.T) {
	graph := Graph{}
	graph.Add(&Entry{Key: "abcd_x", Kind: KindTypeFn, FamilyTag: "val", TypeImports: []string{"x"}, Ambient: []string{"Bun"}, ArgsText: "'abcd_x','X'"})
	out, err := RenderGrouped(graph, nil, false)
	if err != nil {
		t.Fatal(err)
	}
	if got := out["abcd_x"]; got != "export const __rt_abcd_x=['val',,,'abcd_x','X'];\n" {
		t.Errorf("untyped module = %q", got)
	}
}

func TestRenderGrouped_AmbientDeclarations(t *testing.T) {
	graph := Graph{}
	graph.Add(&Entry{Key: "@acme/app#pf_x", Kind: KindPureFn, Ambient: []string{"Bun", "Bun"}, ArgsText: "'@acme/app#pf_x',[],'return 1;',[]"})
	out, err := RenderGrouped(graph, nil, true)
	if err != nil {
		t.Fatal(err)
	}
	for _, module := range out {
		if strings.Count(module, "declare const Bun: unknown;") != 1 {
			t.Errorf("want one ambient declaration:\n%s", module)
		}
	}
}
