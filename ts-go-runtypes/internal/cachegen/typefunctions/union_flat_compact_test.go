package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
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

// buildRecordDateUnionFixture is `{[key: string]: number} | {a: Date}`: the
// carve-out union whose object member carries a transform, so an encoder cannot
// hand the value back as is and the Date forces the envelope on every road.
func buildRecordDateUnionFixture() []*reflection.RunType {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	date := &reflection.RunType{ID: "dat", Kind: reflection.KindClass, SubKind: reflection.SubKindDate}
	idx := &reflection.RunType{ID: "idx", Kind: reflection.KindIndexSignature, Child: makeRef("num"), Index: makeRef("str")}
	rec := &reflection.RunType{ID: "rec", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("idx")}}
	propA := &reflection.RunType{ID: "pa", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("dat")}
	obj := &reflection.RunType{ID: "ob1", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pa")}}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("rec"), makeRef("ob1")},
		SafeUnionChildren: []*reflection.RunType{makeRef("rec"), makeRef("ob1")},
	}
	return []*reflection.RunType{str, num, date, idx, rec, propA, obj, union}
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

	clone := renderModule(t, dump, "prepareForJsonClone")
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

// TestCompactForJsonModule_RecordNumberUnionStaysBare: nothing positionalizes
// inside `{[key: string]: number} | {a: string}`, so compact keeps the
// record-union optimisation: no envelope on either half. Bare is about the WIRE,
// not about the decoder doing nothing: an identity decode on a bare wire is how
// compact used to hand a caller's undeclared keys to a handler.
func TestCompactForJsonModule_RecordNumberUnionStaysBare(t *testing.T) {
	dump := protocol.Dump{RunTypes: buildRecordNumberUnionFixture()}

	compact := renderModule(t, dump, "compactForJson")
	if strings.Contains(compact, "[-1, ") || strings.Contains(compact, "[0, ") {
		t.Errorf("compact encode of a record/atomic-value union must stay envelope-free; got:\n%s", compact)
	}
	// Scoped to the UNION entry: the standalone object entry carries its own positional rebuild
	// (`r0.a = v[0]`), which a module-wide substring would mistake for an envelope unwrap.
	restore := unionEntry(t, renderModuleDefault(t, dump, "compactFromJson"), "compactFromJson")
	if strings.Contains(restore, "const dec") {
		t.Errorf("compact decode must stay envelope-free too (no index unwrap); got:\n%s", restore)
	}
	// Envelope-free is not the same as identity: the record arm ships its prototype-name refusal.
	// The index-signature member is the carve-out, though: it declares every key from the union's
	// point of view, so the object member is NOT rebuilt from its declared shape and a key a caller
	// sent on it rides through, exactly as the unknown-keys families answer clean for this union.
	if !strings.Contains(restore, "for (const k0 in v)") {
		t.Errorf("the record arm must keep its keys and only refuse prototype names; got:\n%s", restore)
	}
	if strings.Contains(restore, "const r0") {
		t.Errorf("the object member of an index-signature union must not be rebuilt; got:\n%s", restore)
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
	clone := renderModule(t, dump, "prepareForJsonClone")
	if strings.Contains(clone, "[0,") {
		t.Errorf("clone encode of an atomic-only JSON-compatible union must stay envelope-free; got:\n%s", clone)
	}

	restore := renderModuleDefault(t, dump, "compactFromJson")
	if !strings.Contains(restore, "= v[0]") || !strings.Contains(restore, "=== 0") {
		t.Errorf("compact decode must unwrap and dispatch the array arm; got:\n%s", restore)
	}
}

// unionEntry returns just the union entry (every fixture here names it `uni`) of a rendered module.
// Assertions about the union arm have to read this and not the whole module: the per-entry array
// and object factories carry their own rebuild code whatever the union arm decided, so a
// module-wide substring match passes even when the union short-circuits to `return v`.
func unionEntry(t *testing.T, module, family string) string {
	t.Helper()
	line := extractInitLine(module, operations.PlainHash(family)+"_uni")
	if line == "" {
		t.Fatalf("no %s union entry in the rendered module:\n%s", family, module)
	}
	return line
}

// TestAtomicOnlyUnion_StripsInsideItsMembers — `{c: string}[] | string` carries no merged object
// branch, so the union looks like a pass-through. It is not: an ARRAY is an atomic member, and the
// objects inside it can carry keys the type never declared. Both ends of `clone` must walk into the
// member and rebuild those objects, and `direct` must too since it reads the same gate. Validation
// does not cover this — undeclared keys on an object literal are accepted by design.
func TestAtomicOnlyUnion_StripsInsideItsMembers(t *testing.T) {
	dump := protocol.Dump{RunTypes: buildArrayOfObjectsOrStringFixture()}

	// The clone encode rebuilds each element rather than handing back the array it was given.
	clone := unionEntry(t, renderModuleDefault(t, dump, "prepareForJsonClone"), "prepareForJsonClone")
	if !strings.Contains(clone, ".map(") {
		t.Errorf("clone encode must rebuild the array's elements so an undeclared key is dropped; got:\n%s", clone)
	}
	// The clone decode rebuilds each element from the declared shape on arrival.
	restoreSafe := unionEntry(t, renderModuleDefault(t, dump, "restoreFromJsonStrip"), "restoreFromJsonStrip")
	if !strings.Contains(restoreSafe, "r0.c = ") {
		t.Errorf("clone decode must rebuild the array's elements from the declared shape; got:\n%s", restoreSafe)
	}
	// The direct encoder shares the gate, so it walks too.
	direct := unionEntry(t, renderModuleDefault(t, dump, "stringifyJson"), "stringifyJson")
	if !strings.Contains(direct, `"c":`) {
		t.Errorf("direct encode must write the declared members, not stringify the raw value; got:\n%s", direct)
	}
	// The mutate pair is the control: it keeps undeclared keys on purpose, both ways, so its entry
	// stays the noop short form (a trailing `,,true` and no body at all).
	for _, family := range []string{"prepareForJsonMutate", "restoreFromJson"} {
		if entry := unionEntry(t, renderModuleDefault(t, dump, family), family); !strings.Contains(entry, ",,true)") {
			t.Errorf("[%s] mutate must keep passing the value through untouched; got:\n%s", family, entry)
		}
	}
}

// TestPureAtomicUnion_StaysCompiledAway: the optimisation the gate exists for. A union with no
// object anywhere in any member has nothing to strip, so it must still compile away to nothing,
// `any[]` included: nothing in `any` is declared, at whatever array depth it sits.
func TestPureAtomicUnion_StaysCompiledAway(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	anyT := &reflection.RunType{ID: "any", Kind: reflection.KindAny}
	anyArr := &reflection.RunType{ID: "anyArr", Kind: reflection.KindArray, Child: makeRef("any")}
	unions := map[string][]*reflection.RunType{
		"string | number": {makeRef("str"), makeRef("num")},
		"any[] | number":  {makeRef("anyArr"), makeRef("num")},
	}
	for label, members := range unions {
		union := &reflection.RunType{ID: "uni", Kind: reflection.KindUnion, Children: members, SafeUnionChildren: members}
		dump := protocol.Dump{RunTypes: []*reflection.RunType{str, num, anyT, anyArr, union}}
		for _, family := range []string{"prepareForJsonClone", "restoreFromJsonStrip"} {
			entry := unionEntry(t, renderModuleDefault(t, dump, family), family)
			if strings.Contains(entry, "typeof v ===") || strings.Contains(entry, ".map(") {
				t.Errorf("[%s] %s must compile to nothing, not a dispatch chain; got:\n%s", family, label, entry)
			}
		}
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

// TestCarveOutUnion_EveryFamilyKeepsUndeclaredKeys: a member with an index signature declares every
// key from the union's point of view, so the object member of `{[key: string]: number} | {a: string}`
// is never rebuilt from its declared shape on any road, and a key a caller sent on it rides through
// on encode and on decode alike, exactly as the unknown-keys families answer clean for this union.
// With no transform anywhere the object member is the value itself; with a Date on it every own key
// is copied and only the declared prop is rewritten. Each entry is unescaped so the assertions read
// as the emitted JS.
func TestCarveOutUnion_EveryFamilyKeepsUndeclaredKeys(t *testing.T) {
	entry := func(fixture []*reflection.RunType, family string) string {
		t.Helper()
		return strings.ReplaceAll(unionEntry(t, renderModuleDefault(t, protocol.Dump{RunTypes: fixture}, family), family), `\'`, "'")
	}
	bare := buildRecordNumberUnionFixture()
	for family, want := range map[string]string{"prepareForJsonClone": "return v;", "compactForJson": "return v;", "stringifyJson": "return JSON.stringify(v);"} {
		got := entry(bare, family)
		if !strings.Contains(got, want) || strings.Contains(got, "v.a") {
			t.Errorf("[%s] the object member must be encoded as is, got:\n%s", family, got)
		}
	}
	for _, family := range []string{"restoreFromJsonStrip", "compactFromJson"} {
		got := entry(bare, family)
		if strings.Contains(got, "const r0") || !strings.Contains(got, "for (const k0 in v)") {
			t.Errorf("[%s] the object member must not be rebuilt while the record arm keeps its key loop, got:\n%s", family, got)
		}
	}

	dated := buildRecordDateUnionFixture()
	for _, family := range []string{"prepareForJsonClone", "compactForJson"} {
		got := entry(dated, family)
		if !strings.Contains(got, "_r[k1] = v[k1];") || !strings.Contains(got, "_r['a'] = v.a.toISOString();") || !strings.Contains(got, "return [-1, ctxFn1(v)]") {
			t.Errorf("[%s] the object member must copy every own key and rewrite only the Date, got:\n%s", family, got)
		}
	}
	direct := entry(dated, "stringifyJson")
	if !strings.Contains(direct, "ls1.push(JSON.stringify(k1) + ':' + s0)") || !strings.Contains(direct, `ls1.push('"a":'+'"'+v.a.toJSON()+'"')`) {
		t.Errorf("[stringifyJson] the object member must write every own key and only the Date through its own arm, got:\n%s", direct)
	}
	for _, family := range []string{"restoreFromJsonStrip", "compactFromJson"} {
		got := entry(dated, family)
		if !strings.Contains(got, "if (dec0 === -1) {v.a = typeof v.a === 'string' ? new Date(v.a) : v.a}") || strings.Contains(got, "const r0") {
			t.Errorf("[%s] the object member must be restored in place, got:\n%s", family, got)
		}
	}
}
