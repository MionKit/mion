package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// buildNestedObjectUnionFixture builds the roundtrip-soak shape reduced to its
// essence: a union of two JSON-compatible object members, one of which holds a
// NESTED object literal —
//
//	{ a: string }  |  { b: { c: string } }
//
// Every member is isJsonCompatible, so the keyed strategies round-trip it raw
// (no envelope, identity decode). Compact positionalizes `b` into `[v.b.c]`,
// so it MUST keep the envelope or the identity decoder hands the array back.
func buildNestedObjectUnionFixture() []*reflection.RunType {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	propC := &reflection.RunType{ID: "pc", Kind: reflection.KindProperty, Name: "c", IsSafeName: true, Child: makeRef("str")}
	inner := &reflection.RunType{ID: "inner", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pc")}}
	propA := &reflection.RunType{ID: "pa", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("str")}
	propB := &reflection.RunType{ID: "pb", Kind: reflection.KindProperty, Name: "b", IsSafeName: true, Child: makeRef("inner")}
	obj1 := &reflection.RunType{ID: "ob1", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pa")}}
	obj2 := &reflection.RunType{ID: "ob2", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pb")}}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("ob1"), makeRef("ob2")},
		SafeUnionChildren: []*reflection.RunType{makeRef("ob1"), makeRef("ob2")},
	}
	return []*reflection.RunType{str, propC, inner, propA, propB, obj1, obj2, union}
}

// buildRecordNumberUnionFixture is the record-union optimisation's shape,
// `{[key: string]: number} | {a: string}`: nothing positionalizes inside either
// member, so the keyed strategies stay envelope-free. Compact does not, because
// `{a: string}` merges and its undeclared keys have to be droppable.
func buildRecordNumberUnionFixture() []*reflection.RunType {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	idx := &reflection.RunType{ID: "idx", Kind: reflection.KindIndexSignature, Child: makeRef("num"), Index: makeRef("str")}
	rec := &reflection.RunType{ID: "rec", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("idx")}}
	propA := &reflection.RunType{ID: "pa", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("str")}
	obj := &reflection.RunType{ID: "ob1", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pa")}}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("rec"), makeRef("ob1")},
		SafeUnionChildren: []*reflection.RunType{makeRef("rec"), makeRef("ob1")},
	}
	return []*reflection.RunType{str, num, idx, rec, propA, obj, union}
}

// buildArrayOfObjectsOrStringFixture is the atomic-only shape `{c: string}[] |
// string`: no merged branch at all, but the array member positionalizes its
// elements, so compact needs the `[idx, value]` arms where the keyed strategies
// collapse to identity (atomicOnlyJsonIdentity).
func buildArrayOfObjectsOrStringFixture() []*reflection.RunType {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	propC := &reflection.RunType{ID: "pc", Kind: reflection.KindProperty, Name: "c", IsSafeName: true, Child: makeRef("str")}
	inner := &reflection.RunType{ID: "inner", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pc")}}
	arr := &reflection.RunType{ID: "arr", Kind: reflection.KindArray, Child: makeRef("inner")}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("arr"), makeRef("str")},
		SafeUnionChildren: []*reflection.RunType{makeRef("arr"), makeRef("str")},
	}
	return []*reflection.RunType{str, propC, inner, arr, union}
}

// TestCompactForJsonModule_NestedObjectUnionKeepsEnvelope — the compact encode
// of `{a: string} | {b: {c: string}}` wraps the merged object in `[-1, …]` and
// positionalizes the nested member (`[v.b.c]`), while the keyed clone encode
// of the SAME fixture emits no envelope (the raw round-trip it is entitled to).
func TestCompactForJsonModule_NestedObjectUnionKeepsEnvelope(t *testing.T) {
	dump := protocol.Dump{RunTypes: buildNestedObjectUnionFixture()}

	compact := renderModule(t, dump, "compactForJson")
	if !strings.Contains(compact, "[-1, ") {
		t.Errorf("compact encode must keep the `[-1, …]` envelope when a member positionalizes; got:\n%s", compact)
	}
	if !strings.Contains(compact, "[v.b.c]") {
		t.Errorf("compact encode must positionalize the nested object `[v.b.c]`; got:\n%s", compact)
	}

	clone := renderModule(t, dump, "prepareForJsonSafe")
	if strings.Contains(clone, "[-1, ") {
		t.Errorf("clone encode of a JSON-compatible object union must stay envelope-free; got:\n%s", clone)
	}
}

// TestCompactFromJsonModule_NestedObjectUnionUnwraps — the compact decode of
// the same fixture unwraps the envelope and rebuilds the nested object, while
// restoreFromJson stays identity (`return v`).
func TestCompactFromJsonModule_NestedObjectUnionUnwraps(t *testing.T) {
	dump := protocol.Dump{RunTypes: buildNestedObjectUnionFixture()}

	compact := renderModuleDefault(t, dump, "compactFromJson")
	if !strings.Contains(compact, "= v[0]") {
		t.Errorf("compact decode must unwrap the envelope (`const dec = v[0]`); got:\n%s", compact)
	}
	if !strings.Contains(compact, "=== -1") {
		t.Errorf("compact decode must dispatch the merged-object arm (`=== -1`); got:\n%s", compact)
	}
	if !strings.Contains(compact, "v.b = ") {
		t.Errorf("compact decode must rebuild the nested object into `v.b`; got:\n%s", compact)
	}

	restore := renderModuleDefault(t, dump, "restoreFromJson")
	if strings.Contains(restore, "= v[0]") {
		t.Errorf("restoreFromJson of a JSON-compatible object union must stay identity; got:\n%s", restore)
	}
}

// TestCompactForJsonModule_RecordNumberUnionEnvelopes — nothing positionalizes
// inside `{[key: string]: number} | {a: string}`, but `{a: string}` merges, and
// the compact decode drops that branch's undeclared keys by name. On a bare wire
// it could not tell the merged object from the record, whose keys must all
// survive, so compact gives up the record-union optimisation here. The keyed
// strategies keep it: they promise nothing about wire keys.
func TestCompactForJsonModule_RecordNumberUnionEnvelopes(t *testing.T) {
	dump := protocol.Dump{RunTypes: buildRecordNumberUnionFixture()}

	compact := renderModule(t, dump, "compactForJson")
	if !strings.Contains(compact, "[-1, ") {
		t.Errorf("compact encode must wrap the merged-object arm as `[-1, …]`; got:\n%s", compact)
	}
	restore := renderModuleDefault(t, dump, "compactFromJson")
	if !strings.Contains(restore, "=== -1") {
		t.Errorf("compact decode must dispatch the merged-object arm (`=== -1`); got:\n%s", restore)
	}
	if !strings.Contains(restore, "r0.a = v.a") {
		t.Errorf("compact decode must rebuild the merged object from its declared props; got:\n%s", restore)
	}

	clone := renderModule(t, dump, "prepareForJsonSafe")
	if strings.Contains(clone, "[-1, ") || strings.Contains(clone, "[0, ") {
		t.Errorf("clone encode must keep the record-union optimisation (envelope-free); got:\n%s", clone)
	}
	keyed := renderModuleDefault(t, dump, "restoreFromJson")
	if !strings.Contains(keyed, "_uni','union',,true)") {
		t.Errorf("keyed decode of a record/atomic-value union must stay identity (noop entry); got:\n%s", keyed)
	}
}

// TestCompactForJsonModule_ArrayOfObjectsOrStringWrapsArms — with no merged
// branch the keyed strategies pass `{c: string}[] | string` through untouched;
// compact positionalizes the array elements, so it emits the `[idx, value]` arms
// and the decoder dispatches on the index.
func TestCompactForJsonModule_ArrayOfObjectsOrStringWrapsArms(t *testing.T) {
	dump := protocol.Dump{RunTypes: buildArrayOfObjectsOrStringFixture()}

	compact := renderModule(t, dump, "compactForJson")
	if !strings.Contains(compact, "[0,") {
		t.Errorf("compact encode must wrap the array arm as `[0, …]`; got:\n%s", compact)
	}
	clone := renderModule(t, dump, "prepareForJsonSafe")
	if strings.Contains(clone, "[0,") {
		t.Errorf("clone encode of an atomic-only JSON-compatible union must stay identity; got:\n%s", clone)
	}

	restore := renderModuleDefault(t, dump, "compactFromJson")
	if !strings.Contains(restore, "= v[0]") || !strings.Contains(restore, "=== 0") {
		t.Errorf("compact decode must unwrap and dispatch the array arm; got:\n%s", restore)
	}
}

// TestCompactUnionNeedsEnvelope pins the helper the emitters and the cjr
// predicate share, over the three fixtures above.
func TestCompactUnionNeedsEnvelope(t *testing.T) {
	cases := []struct {
		name  string
		types []*reflection.RunType
		want  bool
	}{
		{"nested object member", buildNestedObjectUnionFixture(), true},
		{"record of numbers | object (the object merges, so the decode needs the arm)", buildRecordNumberUnionFixture(), true},
		{"array of objects | string", buildArrayOfObjectsOrStringFixture(), true},
		{"bigint/Date members (transforms the keyed rule already envelopes)", buildBigIntDateUnionFixture(), true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			refTable := make(map[string]*reflection.RunType, len(c.types))
			for _, rt := range c.types {
				refTable[rt.ID] = rt
			}
			ctx := &EmitContext{walker: &Walker{RefTable: refTable}}
			if got := compactUnionEnvelope(refTable["uni"], ctx); got != c.want {
				t.Errorf("compactUnionEnvelope = %v, want %v", got, c.want)
			}
		})
	}
}

// buildMergedPropUnionFixture is a two-member merged union whose members share
// one prop and each add one, so the merged set is wider than either member:
//
//	{ a: string; b: string }  |  { b: string; c: string }
func buildMergedPropUnionFixture() []*reflection.RunType {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	propA := &reflection.RunType{ID: "pa", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("str")}
	propB1 := &reflection.RunType{ID: "pb1", Kind: reflection.KindProperty, Name: "b", IsSafeName: true, Child: makeRef("str")}
	propB2 := &reflection.RunType{ID: "pb2", Kind: reflection.KindProperty, Name: "b", IsSafeName: true, Child: makeRef("str")}
	propC := &reflection.RunType{ID: "pc", Kind: reflection.KindProperty, Name: "c", IsSafeName: true, Child: makeRef("str")}
	obj1 := &reflection.RunType{ID: "ob1", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pa"), makeRef("pb1")}}
	obj2 := &reflection.RunType{ID: "ob2", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pb2"), makeRef("pc")}}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("ob1"), makeRef("ob2")},
		SafeUnionChildren: []*reflection.RunType{makeRef("ob1"), makeRef("ob2")},
	}
	return []*reflection.RunType{str, propA, propB1, propB2, propC, obj1, obj2, union}
}

// TestCompactUnion_EncodeAndDecodeDropTheSameSet is the symmetry pin. Compact's
// promise is that no key name from the wire reaches the decoded value, and a
// merged union member is the one shape it keeps keyed, so BOTH directions have
// to rebuild from the same declared list. The encode has always done it
// (buildSafeObjectClone); the decode used to walk the object in place and keep
// whatever it had not named. If either side stops naming a merged prop, or the
// decode stops rebinding, this fails.
func TestCompactUnion_EncodeAndDecodeDropTheSameSet(t *testing.T) {
	types := buildMergedPropUnionFixture()
	refTable := make(map[string]*reflection.RunType, len(types))
	for _, rt := range types {
		refTable[rt.ID] = rt
	}
	layout := buildCompactFlatLayout(refTable["uni"], &EmitContext{walker: &Walker{RefTable: refTable}})
	if len(layout.MergedProps) != 3 {
		t.Fatalf("fixture should merge a, b and c; got %d merged props", len(layout.MergedProps))
	}
	if !layout.StripMergedExtras {
		t.Error("the compact layout must ask the decode to rebuild the merged object")
	}

	dump := protocol.Dump{RunTypes: types}
	encode := renderModule(t, dump, "compactForJson")
	decode := renderModuleDefault(t, dump, "compactFromJson")
	for _, mp := range layout.MergedProps {
		// A required prop rides the object literal (`b:v.b`), an optional one the
		// accumulator that follows it (`_r['a']=v.a`).
		literal := strings.Contains(encode, mp.Name+":v."+mp.Name)
		accumulated := strings.Contains(encode, "_r['"+mp.Name+"']=v."+mp.Name)
		if !literal && !accumulated {
			t.Errorf("compact encode never writes merged prop %q; got:\n%s", mp.Name, encode)
		}
		if !strings.Contains(decode, "."+mp.Name+" = v."+mp.Name) {
			t.Errorf("compact decode never rebuilds merged prop %q; got:\n%s", mp.Name, decode)
		}
	}
	if !strings.Contains(decode, "v = r0;") {
		t.Errorf("compact decode must rebind the merged object to the rebuilt one; got:\n%s", decode)
	}
}

// TestCompactFromJson_KeyedObjectWhereArrayBelongs — a declared object rides the
// compact wire as a positional array, but the mion client's optimistic first
// request sends the keyed form to a route it has not fetched yet. That shape is
// rebuilt from its declared NAMES, so it still works and still drops what the
// type did not declare. Taking it as it came was the hole: validation accepts a
// keyed object whose declared shape matches, so the caller's own key names would
// have reached the handler on a route that compiles no unknown-key check.
func TestCompactFromJson_KeyedObjectWhereArrayBelongs(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	propA := &reflection.RunType{ID: "pa", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("str")}
	obj := &reflection.RunType{ID: "ob1", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pa")}}

	decode := renderModuleDefault(t, protocol.Dump{RunTypes: []*reflection.RunType{str, propA, obj}}, "compactFromJson")
	if !strings.Contains(decode, "r0.a = v[0]") {
		t.Errorf("compact decode must rebuild from the positional array; got:\n%s", decode)
	}
	if !strings.Contains(decode, "r1.a = v.a") {
		t.Errorf("compact decode must rebuild a keyed arrival from its declared names; got:\n%s", decode)
	}
}
