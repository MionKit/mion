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
// member, so compact must stay envelope-free exactly like the keyed strategies.
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

// TestCompactForJsonModule_RecordNumberUnionStaysBare — nothing positionalizes
// inside `{[key: string]: number} | {a: string}`, so compact keeps the
// record-union optimisation: no envelope on either half.
func TestCompactForJsonModule_RecordNumberUnionStaysBare(t *testing.T) {
	dump := protocol.Dump{RunTypes: buildRecordNumberUnionFixture()}

	compact := renderModule(t, dump, "compactForJson")
	if strings.Contains(compact, "[-1, ") || strings.Contains(compact, "[0, ") {
		t.Errorf("compact encode of a record/atomic-value union must stay envelope-free; got:\n%s", compact)
	}
	restore := renderModuleDefault(t, dump, "compactFromJson")
	if !strings.Contains(restore, "_uni','union',,true)") {
		t.Errorf("compact decode of a record/atomic-value union must stay identity (noop entry); got:\n%s", restore)
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
		{"record of numbers | object", buildRecordNumberUnionFixture(), false},
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
