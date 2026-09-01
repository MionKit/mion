package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// buildStrippedMergedPropUnionFixture builds a discriminated union whose
// members share a property NAME but one member's version is DataOnly-
// stripped:
//
//	{ kind: "t1"; f2: Date }  |  { kind: "t2"; f2: symbol }
//
// The merge collapses `f2` to its single surviving candidate (Date), but a
// value belonging to the t2 member still carries `f2` (a symbol at runtime).
// Without a guard the surviving Date codec is mis-applied to that foreign
// value (`f2.toISOString()` crashes — G4); the binary side sets the bitmap
// bit while writing nothing, desyncing the decoder (G3). The emit must guard
// the surviving codec and DROP the key for a non-matching value.
func buildStrippedMergedPropUnionFixture(strippedKind reflection.ReflectionKind) []*reflection.RunType {
	date := &reflection.RunType{ID: "dat", Kind: reflection.KindClass, SubKind: reflection.SubKindDate}
	stripped := &reflection.RunType{ID: "str", Kind: strippedKind}
	litT1 := &reflection.RunType{ID: "lt1", Kind: reflection.KindLiteral, Literal: "t1"}
	litT2 := &reflection.RunType{ID: "lt2", Kind: reflection.KindLiteral, Literal: "t2"}

	kindT1 := &reflection.RunType{ID: "k1", Kind: reflection.KindProperty, Name: "kind", IsSafeName: true, Child: makeRef("lt1")}
	kindT2 := &reflection.RunType{ID: "k2", Kind: reflection.KindProperty, Name: "kind", IsSafeName: true, Child: makeRef("lt2")}
	f2Date := &reflection.RunType{ID: "f2d", Kind: reflection.KindProperty, Name: "f2", IsSafeName: true, Child: makeRef("dat")}
	f2Stripped := &reflection.RunType{ID: "f2s", Kind: reflection.KindProperty, Name: "f2", IsSafeName: true, Child: makeRef("str")}

	obj1 := &reflection.RunType{ID: "ob1", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("k1"), makeRef("f2d")}}
	obj2 := &reflection.RunType{ID: "ob2", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("k2"), makeRef("f2s")}}

	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("ob1"), makeRef("ob2")},
		SafeUnionChildren: []*reflection.RunType{makeRef("ob1"), makeRef("ob2")},
	}
	return []*reflection.RunType{date, stripped, litT1, litT2, kindT1, kindT2, f2Date, f2Stripped, obj1, obj2, union}
}

// TestPrepareForJsonModule_StrippedMergedPropDropsForeignValue — the mutate
// encoder MUST guard the surviving Date codec on `v.f2` and `delete v.f2`
// when the value does not match (it belongs to the stripped member). (G4)
func TestPrepareForJsonModule_StrippedMergedPropDropsForeignValue(t *testing.T) {
	dump := protocol.Dump{RunTypes: buildStrippedMergedPropUnionFixture(reflection.KindSymbol)}
	out := renderModule(t, dump, "prepareForJson")

	if !strings.Contains(out, "else { delete v.f2 }") {
		t.Errorf("expected guarded `else { delete v.f2 }` drop for a value from the stripped member; got:\n%s", out)
	}
	// The drop is GUARDED by a value-type check (the surviving Date validate),
	// not unconditional — a real Date value is kept (Date prep is a noop in the
	// mutate path since JSON.stringify serializes it natively). The Date member
	// is a leaf-atomic validate, so the guard is INLINED (`v.f2 instanceof Date
	// && !isNaN(v.f2.getTime())`) rather than a cross-family `val_<date>?.fn(v.f2)`
	// cache reference.
	if !strings.Contains(out, "v.f2 instanceof Date && !isNaN(v.f2.getTime())") {
		t.Errorf("expected the drop to be guarded by the inlined surviving Date validate `v.f2 instanceof Date && !isNaN(v.f2.getTime())`; got:\n%s", out)
	}
}

// TestPrepareForJsonSafeModule_StrippedMergedPropGuardsPresence — the clone
// (default) encoder MUST fold a value check into the `f2 !== undefined`
// presence test so the surviving codec runs only for a matching value. (G4)
func TestPrepareForJsonSafeModule_StrippedMergedPropGuardsPresence(t *testing.T) {
	dump := protocol.Dump{RunTypes: buildStrippedMergedPropUnionFixture(reflection.KindSymbol)}
	out := renderModule(t, dump, "prepareForJsonSafe")

	if !strings.Contains(out, "v.f2 !== undefined && (") {
		t.Errorf("expected `v.f2 !== undefined && (` presence guard for the stripped sibling; got:\n%s", out)
	}
}

// TestStringifyJsonModule_StrippedMergedPropDropsForeignValue — the direct
// (single-pass) encoder MUST extend the drop condition so a foreign-typed
// value emits no fragment for the merged prop. (G4)
func TestStringifyJsonModule_StrippedMergedPropDropsForeignValue(t *testing.T) {
	dump := protocol.Dump{RunTypes: buildStrippedMergedPropUnionFixture(reflection.KindSymbol)}
	out := renderModule(t, dump, "stringifyJson")

	if !strings.Contains(out, "|| !(") {
		t.Errorf("expected `|| !(` drop guard on the stripped-sibling merged prop; got:\n%s", out)
	}
}

// TestToBinaryModule_StrippedMergedPropDropsForeignValue — the binary
// encoder MUST guard the optional-prop bit so a value from the stripped
// member leaves the bit UNSET (decode skips it), instead of setting the bit
// while the codec writes nothing and desyncs the decoder. (G3) Binary lane
// gates on the binary build; the emit is rendered unconditionally here.
func TestToBinaryModule_StrippedMergedPropDropsForeignValue(t *testing.T) {
	dump := protocol.Dump{RunTypes: buildStrippedMergedPropUnionFixture(reflection.KindPromise)}
	out := renderModule(t, dump, "toBinary")

	if !strings.Contains(out, "v.f2 !== undefined && (") {
		t.Errorf("expected `v.f2 !== undefined && (` guard on the binary optional-prop bit; got:\n%s", out)
	}
}

// TestMergedProp_CleanSiblingHasNoDrop — the guard fires ONLY when a sibling
// is stripped. A clean union sharing a prop name with two SERIALIZABLE types
// keeps the existing multi-candidate sub-dispatch and never emits a `delete`
// drop (the optimisation's common path is unchanged — perf guard).
func TestMergedProp_CleanSiblingHasNoDrop(t *testing.T) {
	date := &reflection.RunType{ID: "dat", Kind: reflection.KindClass, SubKind: reflection.SubKindDate}
	number := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	litT1 := &reflection.RunType{ID: "lt1", Kind: reflection.KindLiteral, Literal: "t1"}
	litT2 := &reflection.RunType{ID: "lt2", Kind: reflection.KindLiteral, Literal: "t2"}
	kindT1 := &reflection.RunType{ID: "k1", Kind: reflection.KindProperty, Name: "kind", IsSafeName: true, Child: makeRef("lt1")}
	kindT2 := &reflection.RunType{ID: "k2", Kind: reflection.KindProperty, Name: "kind", IsSafeName: true, Child: makeRef("lt2")}
	f2Date := &reflection.RunType{ID: "f2d", Kind: reflection.KindProperty, Name: "f2", IsSafeName: true, Child: makeRef("dat")}
	f2Num := &reflection.RunType{ID: "f2n", Kind: reflection.KindProperty, Name: "f2", IsSafeName: true, Child: makeRef("num")}
	obj1 := &reflection.RunType{ID: "ob1", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("k1"), makeRef("f2d")}}
	obj2 := &reflection.RunType{ID: "ob2", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("k2"), makeRef("f2n")}}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("ob1"), makeRef("ob2")},
		SafeUnionChildren: []*reflection.RunType{makeRef("ob1"), makeRef("ob2")},
	}
	dump := protocol.Dump{RunTypes: []*reflection.RunType{date, number, litT1, litT2, kindT1, kindT2, f2Date, f2Num, obj1, obj2, union}}
	out := renderModule(t, dump, "prepareForJson")

	if strings.Contains(out, "delete v.f2") {
		t.Errorf("a clean (no stripped sibling) union must NOT emit a `delete v.f2` drop; got:\n%s", out)
	}
}
