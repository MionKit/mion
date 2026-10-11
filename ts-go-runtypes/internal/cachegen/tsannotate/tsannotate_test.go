package tsannotate

import (
	"testing"

	"github.com/microsoft/typescript-go/shim/ast"
)

func TestFunction(t *testing.T) {
	cases := []struct{ name, code, want string }{
		{"unused params gain _, untyped ones any",
			"function g(utl: RTUtils){function f(v, pth){return v}return f}",
			"function g(_utl: RTUtils){function f(v?: any, _pth?: any){return v}return f}"},
		// Found by the typed-emit fuzz lane: a `never` validator never reads v, and its `v is T` follows the rename.
		{"a type predicate follows its parameter's rename",
			"function g(utl: RTUtils){function f(v: any): v is never{return false}return f}",
			"function g(_utl: RTUtils){function f(_v: any): _v is never{return false}return f}"},
		{"accumulators and catch bindings",
			"function g(utl){const r = {a: 1}; let x; try {} catch (e) {} return [r, x, utl]}",
			"function g(utl?: any){const r: any = {a: 1}; let x: any; try {} catch (e: any) {} return [r, x, utl]}"},
		// Found by the typed-emit fuzz lane: a Set<never> check loops without reading the item.
		{"an unread loop variable gains _",
			"function f(v: any, _w){for (const item0 of v.values()) {return false}for (const _k in v) {return 1}return true}",
			"function f(v: any, _w?: any){for (const _item0 of v.values()) {return false}for (const _k in v) {return 1}return true}"},
		// Found by review: a parameter only another parameter's default reads is still used.
		{"a parameter read by a later default keeps its name",
			"function(utl){return (a, b = a) => b}",
			"function(_utl?: any){return (a?: any, b: any = a) => b}"},
		{"unparsable input comes back unchanged", "function (", "function ("},
	}
	for _, c := range cases {
		if got := Function(c.code); got != c.want {
			t.Errorf("%s:\n got %s\nwant %s", c.name, got, c.want)
		}
	}
}

func TestTypeofOnlyNames(t *testing.T) {
	got := TypeofOnlyNames("function(){if (typeof Bun !== 'undefined' && typeof Deno === 'object') return Deno.version}")
	if len(got) != 1 || got[0] != "Bun" {
		t.Errorf("TypeofOnlyNames = %v, want [Bun]", got)
	}
}

// bindingKinds says, for every declaration kind a generated function can hold, what annotate does with it: an arm, or
// nothing because the binding is already typed or shares an annotated parent's type.
var bindingKinds = map[ast.Kind]string{
	ast.KindParameter:                   "arm: typed any, `_` when unread",
	ast.KindVariableDeclaration:         "arm: typed any when TS would infer too narrowly, `_` when an unread loop variable",
	ast.KindBindingElement:              "none: shares its pattern's annotation",
	ast.KindFunctionDeclaration:         "none: its parameters carry the types",
	ast.KindFunctionExpression:          "none: its parameters carry the types",
	ast.KindArrowFunction:               "none: its parameters carry the types",
	ast.KindClassDeclaration:            "none: its members carry the types",
	ast.KindClassExpression:             "none: its members carry the types",
	ast.KindMethodDeclaration:           "none: its parameters carry the types",
	ast.KindConstructor:                 "none: its parameters carry the types",
	ast.KindGetAccessor:                 "none: its parameters carry the types",
	ast.KindSetAccessor:                 "none: its parameter is typed any",
	ast.KindPropertyDeclaration:         "none: initialised from typed code",
	ast.KindPropertyAssignment:          "none: part of an annotated literal",
	ast.KindShorthandPropertyAssignment: "none: part of an annotated literal",
	ast.KindLabeledStatement:            "none: a label is no binding",
	ast.KindObjectLiteralExpression:     "none: typed at the variable it initialises",
	ast.KindBinaryExpression:            "none: a `this.x = …` assignment binds nothing new",
}

// bindingKindsSample writes every kind bindingKinds names, untyped, the way generated and pure-fn code does.
const bindingKindsSample = `function(utl, {a, b: [c]}, ...rest){
  let x; const o = {p: 1, q() {}, a}; const arr = [];
  try {} catch (e) {}
  for (const item of rest) {}
  function inner(y) { return y }
  const f = function(z) { return z }, g = (w) => w;
  class K { m = 1; constructor(v) { this.v = v } get n() { return 1 } set n(s) {} method(t) { return t } }
  const C = class {};
  outer: for (const k in o) { break outer }
  return [x, o, arr, inner, f, g, K, C, a, c, utl]
}`

// TestAnnotate_EveryBindingKindHasARow: every declaration in the sample has a row, every row's kind appears, and only an
// arm row produces an insertion.
func TestAnnotate_EveryBindingKindHasARow(t *testing.T) {
	sourceFile, wrapped := parseWrapped(bindingKindsSample)
	if sourceFile == nil {
		t.Fatal("sample does not parse")
	}
	seen := map[ast.Kind]bool{}
	armed := map[ast.Kind]bool{}
	var walk ast.Visitor
	walk = func(node *ast.Node) bool {
		if ast.IsDeclarationNode(node) || node.Kind == ast.KindLabeledStatement {
			row, ok := bindingKinds[node.Kind]
			if !ok {
				t.Errorf("declaration kind %v has no row in bindingKinds", node.Kind)
			}
			seen[node.Kind] = true
			if len(annotate(wrapped, node)) > 0 {
				armed[node.Kind] = true
				if row[:4] != "arm:" {
					t.Errorf("kind %v: annotate inserts, its row says %q", node.Kind, row)
				}
			}
		}
		node.ForEachChild(walk)
		return false
	}
	sourceFile.AsNode().ForEachChild(walk)
	for kind, row := range bindingKinds {
		if !seen[kind] {
			t.Errorf("kind %v has a row but bindingKindsSample never writes one", kind)
		}
		if row[:4] == "arm:" && !armed[kind] {
			t.Errorf("kind %v: its row says arm, annotate never inserts", kind)
		}
	}
}
