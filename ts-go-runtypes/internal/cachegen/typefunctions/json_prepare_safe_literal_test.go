package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// literalSafeTypes builds the bigint / symbol / primitive literal corpus the
// clone-encoder literal tests share. Same hand-built ref-table style as
// noop_types_test.go.
func literalSafeTypes() (*EmitContext, map[string]*reflection.RunType) {
	bigOne := &reflection.RunType{ID: "big1", Kind: reflection.KindLiteral, Flags: []string{"bigint"}, Literal: "1"}
	bigTwo := &reflection.RunType{ID: "big2", Kind: reflection.KindLiteral, Flags: []string{"bigint"}, Literal: "2"}
	symLit := &reflection.RunType{ID: "sym1", Kind: reflection.KindLiteral, Flags: []string{"symbol"}, Literal: "tag"}
	strLit := &reflection.RunType{ID: "str1", Kind: reflection.KindLiteral, Literal: "a"}

	unionBig := &reflection.RunType{ID: "uBig", Kind: reflection.KindUnion, Children: []*reflection.RunType{makeRef("big1"), makeRef("big2")}}

	arrBig := &reflection.RunType{ID: "arrBig", Kind: reflection.KindArray, Child: makeRef("big1")}
	arrUnionBig := &reflection.RunType{ID: "arrUBig", Kind: reflection.KindArray, Child: makeRef("uBig")}
	arrSym := &reflection.RunType{ID: "arrSym", Kind: reflection.KindArray, Child: makeRef("sym1")}
	arrStrLit := &reflection.RunType{ID: "arrStrLit", Kind: reflection.KindArray, Child: makeRef("str1")}

	pos0, pos1 := 0, 1
	tmBig0 := &reflection.RunType{ID: "tmBig0", Kind: reflection.KindTupleMember, Position: &pos0, Child: makeRef("big1")}
	tmBig1 := &reflection.RunType{ID: "tmBig1", Kind: reflection.KindTupleMember, Position: &pos1, Child: makeRef("big2")}
	tupBig := &reflection.RunType{ID: "tupBig", Kind: reflection.KindTuple, Children: []*reflection.RunType{makeRef("tmBig0"), makeRef("tmBig1")}}

	propA := &reflection.RunType{ID: "pA", Kind: reflection.KindPropertySignature, Name: "a", IsSafeName: true, Child: makeRef("big1")}
	propB := &reflection.RunType{ID: "pB", Kind: reflection.KindPropertySignature, Name: "b", IsSafeName: true, Child: makeRef("big2")}
	objBig := &reflection.RunType{ID: "objBig", Kind: reflection.KindObjectLiteral, TypeName: "BigLits", Children: []*reflection.RunType{makeRef("pA"), makeRef("pB")}}

	all := []*reflection.RunType{
		bigOne, bigTwo, symLit, strLit, unionBig,
		arrBig, arrUnionBig, arrSym, arrStrLit,
		tmBig0, tmBig1, tupBig,
		propA, propB, objBig,
	}
	refTable := make(map[string]*reflection.RunType, len(all))
	for _, rt := range all {
		refTable[rt.ID] = rt
	}
	return &EmitContext{walker: &Walker{RefTable: refTable}}, refTable
}

// A bigint or symbol literal is NOT extra-proof: it carries the same value
// transform its bare kind does, so the clone emitter must never share it by
// reference. Primitive literals stay extra-proof — the fast paths they enable
// are the whole point of the predicate.
func TestExtraProof_LiteralFlavour(t *testing.T) {
	ctx, types := literalSafeTypes()
	cases := []struct {
		id   string
		want bool
	}{
		{"str1", true},
		{"arrStrLit", true},
		{"big1", false},
		{"sym1", false},
		{"uBig", false},
		{"arrBig", false},
		{"arrUBig", false},
		{"arrSym", false},
		{"tupBig", false},
	}
	for _, tc := range cases {
		if got := isExtraProof(types[tc.id], ctx); got != tc.want {
			t.Errorf("isExtraProof(%s) = %v, want %v", tc.id, got, tc.want)
		}
	}
}

// The clone emitter's noop predicate reads isExtraProof for its array and
// tuple arms, so it must answer the same way — a noop verdict is what makes
// the walker compose the child slot as EMPTY code.
func TestNoopForPrepareJsonSafe_LiteralFlavour(t *testing.T) {
	ctx, types := literalSafeTypes()
	cases := []struct {
		id   string
		want bool
	}{
		{"str1", true},
		{"arrStrLit", true},
		{"big1", false},
		{"sym1", false},
		{"arrBig", false},
		{"arrUBig", false},
		{"arrSym", false},
		{"tupBig", false},
	}
	for _, tc := range cases {
		if got := isNoopForPrepareJsonSafe(types[tc.id], ctx); got != tc.want {
			t.Errorf("isNoopForPrepareJsonSafe(%s) = %v, want %v", tc.id, got, tc.want)
		}
	}
}

// compileSafeLiteral compiles one corpus id through the clone (safe) emitter,
// returning the factory body plus any hoisted context fns (a union clause
// lands in one, so the transform under test lives there).
func compileSafeLiteral(t *testing.T, rootID string) string {
	t.Helper()
	_, refTable := literalSafeTypes()
	walker := NewWalker(refTable[rootID], "pjs_"+rootID, PrepareForJsonSafeEmitter{})
	walker.InnerPrefix = "pjs_"
	walker.RefTable = refTable
	decl, noop, unsupported := walker.Compile()
	if noop || unsupported {
		t.Fatalf("%s: expected a real body, got noop=%v unsupported=%v (%s)", rootID, noop, unsupported, decl)
	}
	return decl + walker.ContextLines()
}

// The reported bug: every shape that reaches the extra-proof pass-through must
// emit the bigint transform instead of handing a bigint to JSON.stringify.
func TestPrepareForJsonSafe_BigintLiteralShapes(t *testing.T) {
	cases := []struct {
		id   string
		want string
	}{
		{"arrBig", "function pjs_arrBig(v){return v.map(function(e0){return e0.toString()})}"},
		{"tupBig", "function pjs_tupBig(v){return [v[0].toString(),v[1].toString()]}"},
		{"objBig", "function pjs_objBig(v){return {a:v.a.toString(),b:v.b.toString()}}"},
	}
	for _, tc := range cases {
		if got := compileSafeLiteral(t, tc.id); got != tc.want {
			t.Errorf("%s body mismatch:\nwant %q\ngot  %q", tc.id, tc.want, got)
		}
	}
}

// `(1n | 2n)[]` — the exact repro. The union itself is fine; the array's
// extra-proof shortcut was what skipped the transform.
func TestPrepareForJsonSafe_ArrayOfBigintLiteralUnion(t *testing.T) {
	decl := compileSafeLiteral(t, "arrUBig")
	if !strings.Contains(decl, ".map(") || !strings.Contains(decl, ".toString()") {
		t.Errorf("array of a bigint-literal union must map each element through the bigint transform, got:\n%s", decl)
	}
}

// Symbol literals are supported by all four JSON strategies as
// 'Symbol:' + description; the clone strategy used to skip that transform in an
// array and emit [null] where its siblings emit ["Symbol:tag"].
func TestPrepareForJsonSafe_ArrayOfSymbolLiteral(t *testing.T) {
	decl := compileSafeLiteral(t, "arrSym")
	if !strings.Contains(decl, ".map(") || !strings.Contains(decl, "'Symbol:' + (") {
		t.Errorf("array of a symbol literal must map each element through the symbol transform, got:\n%s", decl)
	}
}

// An object whose props are ALL required and ALL bigint literals must not take
// the `Object.keys(v).length === N` fastpath — that returns the input by
// reference, bigints and all.
func TestPrepareForJsonSafe_BigintLiteralObjectSkipsKeyCountFastpath(t *testing.T) {
	decl := compileSafeLiteral(t, "objBig")
	if strings.Contains(decl, "Object.keys(") {
		t.Errorf("object of bigint-literal props must not take the key-count fastpath, got:\n%s", decl)
	}
}
