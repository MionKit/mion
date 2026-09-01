package typefunctions

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// jsonCompatCtx builds the minimal EmitContext + RefTable that
// `isJsonCompatible` needs for ResolveRef. The walker is a hollow
// shell — the predicate only ever calls ResolveRef on it.
func jsonCompatCtx(t *testing.T, runTypes []*reflection.RunType) *EmitContext {
	t.Helper()
	refTable := make(map[string]*reflection.RunType, len(runTypes))
	for _, rt := range runTypes {
		if rt == nil || rt.ID == "" {
			continue
		}
		refTable[rt.ID] = rt
	}
	walker := &Walker{RefTable: refTable}
	return &EmitContext{walker: walker}
}

// TestIsJsonCompatible exercises every kind the predicate covers,
// including composites, conflict-free unions, mixed unions, and a
// cycle.
func TestIsJsonCompatible(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	boolean := &reflection.RunType{ID: "bln", Kind: reflection.KindBoolean}
	null := &reflection.RunType{ID: "nul", Kind: reflection.KindNull}
	undef := &reflection.RunType{ID: "und", Kind: reflection.KindUndefined}
	voidT := &reflection.RunType{ID: "vd", Kind: reflection.KindVoid}
	bigint := &reflection.RunType{ID: "big", Kind: reflection.KindBigInt}
	symbol := &reflection.RunType{ID: "sym", Kind: reflection.KindSymbol}
	regexp := &reflection.RunType{ID: "re", Kind: reflection.KindRegexp}
	anyT := &reflection.RunType{ID: "any", Kind: reflection.KindAny}
	unknownT := &reflection.RunType{ID: "ukn", Kind: reflection.KindUnknown}
	objectT := &reflection.RunType{ID: "obj", Kind: reflection.KindObject}
	enumT := &reflection.RunType{ID: "enm", Kind: reflection.KindEnum}
	templateLit := &reflection.RunType{ID: "tmpl", Kind: reflection.KindTemplateLiteral}
	literalStr := &reflection.RunType{ID: "lstr", Kind: reflection.KindLiteral, Literal: "hello"}
	literalNum := &reflection.RunType{ID: "lnum", Kind: reflection.KindLiteral, Literal: 42.0}
	literalBigint := &reflection.RunType{ID: "lbig", Kind: reflection.KindLiteral, Literal: "1", Flags: []string{"bigint"}}
	literalSym := &reflection.RunType{ID: "lsym", Kind: reflection.KindLiteral, Literal: "x", Flags: []string{"symbol"}}
	date := &reflection.RunType{ID: "dat", Kind: reflection.KindClass, SubKind: reflection.SubKindDate}
	mapT := &reflection.RunType{ID: "mp", Kind: reflection.KindClass, SubKind: reflection.SubKindMap}
	setT := &reflection.RunType{ID: "st", Kind: reflection.KindClass, SubKind: reflection.SubKindSet}
	never := &reflection.RunType{ID: "nev", Kind: reflection.KindNever}
	promise := &reflection.RunType{ID: "prm", Kind: reflection.KindPromise}
	function := &reflection.RunType{ID: "fn", Kind: reflection.KindFunction}

	// Composites.
	arrStr := &reflection.RunType{ID: "arrStr", Kind: reflection.KindArray, Child: makeRef("str")}
	arrDate := &reflection.RunType{ID: "arrDat", Kind: reflection.KindArray, Child: makeRef("dat")}

	propA := &reflection.RunType{ID: "pa", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("str")}
	propB := &reflection.RunType{ID: "pb", Kind: reflection.KindProperty, Name: "b", IsSafeName: true, Child: makeRef("num")}
	propBDate := &reflection.RunType{ID: "pbd", Kind: reflection.KindProperty, Name: "b", IsSafeName: true, Child: makeRef("dat")}
	objCompat := &reflection.RunType{ID: "objCompat", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pa"), makeRef("pb")}}
	objMixed := &reflection.RunType{ID: "objMixed", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pa"), makeRef("pbd")}}

	// Tuple<string, number>; Tuple<string, Date>.
	tmA := &reflection.RunType{ID: "tmA", Kind: reflection.KindTupleMember, Child: makeRef("str")}
	tmB := &reflection.RunType{ID: "tmB", Kind: reflection.KindTupleMember, Child: makeRef("num")}
	tmDate := &reflection.RunType{ID: "tmD", Kind: reflection.KindTupleMember, Child: makeRef("dat")}
	tupleCompat := &reflection.RunType{ID: "tCompat", Kind: reflection.KindTuple, Children: []*reflection.RunType{makeRef("tmA"), makeRef("tmB")}}
	tupleMixed := &reflection.RunType{ID: "tMixed", Kind: reflection.KindTuple, Children: []*reflection.RunType{makeRef("tmA"), makeRef("tmD")}}

	// Union of compatibles; union with one non-compatible.
	unionCompat := &reflection.RunType{ID: "uOK", Kind: reflection.KindUnion, Children: []*reflection.RunType{makeRef("str"), makeRef("num")}, SafeUnionChildren: []*reflection.RunType{makeRef("str"), makeRef("num")}}
	unionMixed := &reflection.RunType{ID: "uMix", Kind: reflection.KindUnion, Children: []*reflection.RunType{makeRef("str"), makeRef("dat")}, SafeUnionChildren: []*reflection.RunType{makeRef("str"), makeRef("dat")}}
	// Union of two OBJECT members: each is individually JSON-compatible, but the
	// flat-union envelopes object members ([-1, …]) so the union does NOT round-
	// trip raw — a Map/Set value-type containing it must NOT fast-path past the
	// envelope (G5).
	unionObjs := &reflection.RunType{ID: "uObj", Kind: reflection.KindUnion, Children: []*reflection.RunType{makeRef("objCompat"), makeRef("cls")}, SafeUnionChildren: []*reflection.RunType{makeRef("objCompat"), makeRef("cls")}}

	// Class with all-compatible properties.
	classCompat := &reflection.RunType{ID: "cls", Kind: reflection.KindClass, SubKind: reflection.SubKindNone, Children: []*reflection.RunType{makeRef("pa"), makeRef("pb")}}

	// Cycle: object self-references via a property of its own type.
	propSelf := &reflection.RunType{ID: "psf", Kind: reflection.KindProperty, Name: "child", IsSafeName: true, Optional: true, Child: makeRef("objSelf")}
	objSelf := &reflection.RunType{ID: "objSelf", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pa"), makeRef("psf")}}

	// Class with a function-typed property — skipped per
	// objectChildrenCompat, so the rest of the props decide compatibility.
	propFn := &reflection.RunType{ID: "pfn", Kind: reflection.KindProperty, Name: "fn", IsSafeName: true, Child: makeRef("fn")}
	classWithFn := &reflection.RunType{ID: "clsFn", Kind: reflection.KindClass, SubKind: reflection.SubKindNone, Children: []*reflection.RunType{makeRef("pa"), makeRef("pfn")}}

	all := []*reflection.RunType{
		str, num, boolean, null, undef, voidT, bigint, symbol, regexp,
		anyT, unknownT, objectT, enumT, templateLit,
		literalStr, literalNum, literalBigint, literalSym,
		date, mapT, setT, never, promise, function,
		arrStr, arrDate,
		propA, propB, propBDate, objCompat, objMixed,
		tmA, tmB, tmDate, tupleCompat, tupleMixed,
		unionCompat, unionMixed, unionObjs,
		classCompat,
		propSelf, objSelf,
		propFn, classWithFn,
	}
	ctx := jsonCompatCtx(t, all)

	cases := []struct {
		name string
		rt   *reflection.RunType
		want bool
	}{
		{"string", str, true},
		{"number", num, true},
		{"boolean", boolean, true},
		{"null", null, true},
		{"any", anyT, true},
		{"unknown", unknownT, true},
		{"object (broad)", objectT, true},
		{"enum", enumT, true},
		{"template literal", templateLit, true},
		{"primitive literal (string)", literalStr, true},
		{"primitive literal (number)", literalNum, true},
		{"bigint literal", literalBigint, false},
		{"symbol literal", literalSym, false},
		{"undefined", undef, false},
		{"void", voidT, false},
		{"bigint", bigint, false},
		{"symbol", symbol, false},
		{"regexp", regexp, false},
		{"Date", date, false},
		{"Map", mapT, false},
		{"Set", setT, false},
		{"never", never, false},
		{"Promise", promise, false},
		{"function", function, false},
		{"string[]", arrStr, true},
		{"Date[]", arrDate, false},
		{"object literal {a:string;b:number}", objCompat, true},
		{"object literal {a:string;b:Date}", objMixed, false},
		{"tuple [string, number]", tupleCompat, true},
		{"tuple [string, Date]", tupleMixed, false},
		{"union string | number", unionCompat, true},
		{"union string | Date", unionMixed, false},
		{"union of object members (envelopes)", unionObjs, false},
		{"class with all-JSON props", classCompat, true},
		{"class with function prop (function skipped)", classWithFn, true},
		{"self-referential object literal", objSelf, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := isJsonCompatible(c.rt, ctx)
			if got != c.want {
				t.Errorf("isJsonCompatible(%s) = %v, want %v", c.name, got, c.want)
			}
		})
	}
}
