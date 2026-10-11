package tsannotate

import "testing"

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
