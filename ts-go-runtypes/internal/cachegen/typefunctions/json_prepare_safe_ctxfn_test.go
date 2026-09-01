package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// A mixed-optionality object safe-clone at ROOT must splice its accumulator
// block directly as the factory body — not hoist it into a context fn and
// return `return ctxFn0(v)`. The context-fn indirection only earns its keep
// in an expression slot (a union clause); at a return slot it's dead weight.
func TestPrepareForJsonSafe_RootObjectSplicesBlockNoCtxFn(t *testing.T) {
	strRT := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	numRT := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	boolRT := &reflection.RunType{ID: "bool", Kind: reflection.KindBoolean}
	arrRT := &reflection.RunType{ID: "arr", Kind: reflection.KindArray, Child: &reflection.RunType{ID: "str", Kind: reflection.KindRef}}

	propID := &reflection.RunType{ID: "pId", Kind: reflection.KindPropertySignature, Name: "id", IsSafeName: true, Child: &reflection.RunType{ID: "num", Kind: reflection.KindRef}}
	propName := &reflection.RunType{ID: "pName", Kind: reflection.KindPropertySignature, Name: "name", IsSafeName: true, Child: &reflection.RunType{ID: "str", Kind: reflection.KindRef}}
	propTags := &reflection.RunType{ID: "pTags", Kind: reflection.KindPropertySignature, Name: "tags", IsSafeName: true, Child: &reflection.RunType{ID: "arr", Kind: reflection.KindRef}}
	propActive := &reflection.RunType{ID: "pActive", Kind: reflection.KindPropertySignature, Name: "active", IsSafeName: true, Optional: true, Child: &reflection.RunType{ID: "bool", Kind: reflection.KindRef}}

	obj := &reflection.RunType{
		ID:   "MyType",
		Kind: reflection.KindObjectLiteral,
		Children: []*reflection.RunType{
			{ID: "pId", Kind: reflection.KindRef},
			{ID: "pName", Kind: reflection.KindRef},
			{ID: "pTags", Kind: reflection.KindRef},
			{ID: "pActive", Kind: reflection.KindRef},
		},
	}

	w := NewWalker(obj, "pjs_MyType", PrepareForJsonSafeEmitter{})
	w.InnerPrefix = "pjs_"
	w.RefTable = map[string]*reflection.RunType{
		"str": strRT, "num": numRT, "bool": boolRT, "arr": arrRT,
		"pId": propID, "pName": propName, "pTags": propTags, "pActive": propActive,
		"MyType": obj,
	}
	decl, noop, unsupported := w.Compile()
	if noop || unsupported {
		t.Fatalf("expected a real body, got noop=%v unsupported=%v", noop, unsupported)
	}

	want := "function pjs_MyType(v){const _r={id:v.id,name:v.name,tags:v.tags};" +
		"if (v.active !== undefined) _r['active']=v.active;return _r;}"
	if decl != want {
		t.Errorf("root object safe-clone body mismatch:\nwant %q\ngot  %q", want, decl)
	}
	if strings.Contains(decl, "ctxFn") {
		t.Errorf("root object body must not hoist into a ctxFn:\n%s", decl)
	}
	if ctx := w.ContextLines(); ctx != "" {
		t.Errorf("root object must register no context fn, got:\n%s", ctx)
	}
}

// A mixed-optionality object nested at a property expression slot hoists into
// EXACTLY ONE context fn — the block itself — never a ctxFn that just calls
// another ctxFn (the old double-hoist: buildSafeObjectLiteral pre-hoisted, then
// the walker wrapped the resulting `return ctxFn0(v)` again).
func TestPrepareForJsonSafe_NestedObjectSingleCtxFn(t *testing.T) {
	strRT := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	numRT := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}

	innerX := &reflection.RunType{ID: "iX", Kind: reflection.KindPropertySignature, Name: "x", IsSafeName: true, Child: &reflection.RunType{ID: "num", Kind: reflection.KindRef}}
	innerY := &reflection.RunType{ID: "iY", Kind: reflection.KindPropertySignature, Name: "y", IsSafeName: true, Optional: true, Child: &reflection.RunType{ID: "num", Kind: reflection.KindRef}}
	inner := &reflection.RunType{ // unnamed inline object → inlines into parent
		ID:   "inner",
		Kind: reflection.KindObjectLiteral,
		Children: []*reflection.RunType{
			{ID: "iX", Kind: reflection.KindRef},
			{ID: "iY", Kind: reflection.KindRef},
		},
	}
	propA := &reflection.RunType{ID: "pA", Kind: reflection.KindPropertySignature, Name: "a", IsSafeName: true, Child: &reflection.RunType{ID: "str", Kind: reflection.KindRef}}
	propB := &reflection.RunType{ID: "pB", Kind: reflection.KindPropertySignature, Name: "b", IsSafeName: true, Child: &reflection.RunType{ID: "inner", Kind: reflection.KindRef}}
	outer := &reflection.RunType{
		ID:   "Outer",
		Kind: reflection.KindObjectLiteral,
		Children: []*reflection.RunType{
			{ID: "pA", Kind: reflection.KindRef},
			{ID: "pB", Kind: reflection.KindRef},
		},
	}

	w := NewWalker(outer, "pjs_Outer", PrepareForJsonSafeEmitter{})
	w.InnerPrefix = "pjs_"
	w.RefTable = map[string]*reflection.RunType{
		"str": strRT, "num": numRT,
		"iX": innerX, "iY": innerY, "inner": inner,
		"pA": propA, "pB": propB, "Outer": outer,
	}
	decl, _, _ := w.Compile()
	ctx := w.ContextLines()

	if !strings.Contains(decl, "b:ctxFn0(v)") {
		t.Errorf("nested object should hoist into a single ctxFn0 call:\n%s", decl)
	}
	if strings.Contains(decl, "ctxFn1") || strings.Contains(ctx, "ctxFn1") {
		t.Errorf("nested object must not double-hoist (no ctxFn1):\ndecl=%s\nctx=%s", decl, ctx)
	}
	// The single ctxFn must BE the block, not a wrapper calling another ctxFn.
	if strings.Contains(ctx, "return ctxFn") {
		t.Errorf("ctxFn0 must contain the clone block, not `return ctxFnN(...)`:\n%s", ctx)
	}
	if !strings.Contains(ctx, "const _r={x:v.b.x};") {
		t.Errorf("ctxFn0 body should be the accumulator block:\n%s", ctx)
	}
}
