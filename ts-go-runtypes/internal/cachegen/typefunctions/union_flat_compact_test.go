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

// TestCompactForJsonModule_NestedObjectUnionGoesPositional: compact writes `{a: string} | {b: {c: string}}` as ONE
// positional array over both members' props, no `[-1, …]` envelope, a missing string slot holding `0`, while the
// keyed clone encode of the SAME fixture keeps the keyed merged object.
func TestCompactForJsonModule_NestedObjectUnionGoesPositional(t *testing.T) {
	dump := protocol.Dump{RunTypes: buildNestedObjectUnionFixture()}

	compact := unionEntry(t, renderModuleDefault(t, dump, "compactForJson"), "compactForJson")
	if !strings.Contains(compact, "return [(v.a !== undefined ? v.a : 0),(v.b !== undefined ? [v.b.c] : 0)];") {
		t.Errorf("compact encode must write the merged object positionally; got:\n%s", compact)
	}
	if strings.Contains(compact, "[-1, ") {
		t.Errorf("an objects-only union needs no envelope; got:\n%s", compact)
	}

	clone := renderModule(t, dump, "prepareForJsonClone")
	if strings.Contains(clone, "[-1, ") || strings.Contains(clone, "v.a : 0") {
		t.Errorf("clone encode keeps the bare keyed merged object; got:\n%s", clone)
	}
}

// TestCompactFromJsonModule_NestedObjectUnionRebuildsPositions: the compact decode of the same fixture rebuilds the
// keyed object from positions, mapping the `0` placeholder to absent before the nested rebuild runs, while
// restoreFromJsonMutate stays identity.
func TestCompactFromJsonModule_NestedObjectUnionRebuildsPositions(t *testing.T) {
	dump := protocol.Dump{RunTypes: buildNestedObjectUnionFixture()}

	compact := unionEntry(t, renderModuleDefault(t, dump, "compactFromJson"), "compactFromJson")
	for _, want := range []string{
		"if (Array.isArray(v)) {const r0 = {};",
		"if (v[0] !== undefined && v[0] !== 0) {r0.a = v[0];}",
		"if (v[1] !== undefined && v[1] !== 0) {if (Array.isArray(v[1])) {const r1 = {};r1.c = v[1][0];v[1] = r1;}r0.b = v[1];}",
	} {
		if !strings.Contains(compact, want) {
			t.Errorf("compact decode must contain %q; got:\n%s", want, compact)
		}
	}
	if strings.Contains(compact, "const dec") {
		t.Errorf("an objects-only union has no envelope to unwrap; got:\n%s", compact)
	}

	restore := renderModuleDefault(t, dump, "restoreFromJsonMutate")
	if strings.Contains(restore, "= v[0]") {
		t.Errorf("restoreFromJsonMutate of a JSON-compatible object union must stay identity; got:\n%s", restore)
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

// TestAtomicOnlyUnion_StripsInsideItsMembers: `{c: string}[] | string` looks like a pass-through, but both ends of
// `clone` must rebuild the objects inside the atomic array member; validation accepts undeclared keys by design.
func TestAtomicOnlyUnion_StripsInsideItsMembers(t *testing.T) {
	dump := protocol.Dump{RunTypes: buildArrayOfObjectsOrStringFixture()}

	// The clone encode rebuilds each element rather than handing back the array it was given.
	clone := unionEntry(t, renderModuleDefault(t, dump, "prepareForJsonClone"), "prepareForJsonClone")
	if !strings.Contains(clone, ".map(") {
		t.Errorf("clone encode must rebuild the array's elements so an undeclared key is dropped; got:\n%s", clone)
	}
	// The clone decode rebuilds each element from the declared shape on arrival.
	restoreSafe := unionEntry(t, renderModuleDefault(t, dump, "restoreFromJsonClone"), "restoreFromJsonClone")
	if !strings.Contains(restoreSafe, "r0.c = ") {
		t.Errorf("clone decode must rebuild the array's elements from the declared shape; got:\n%s", restoreSafe)
	}
	// The mutate pair is the control: it keeps undeclared keys on purpose, both ways, so its entry
	// stays the noop short form (a trailing `,,true` and no body at all).
	for _, family := range []string{"prepareForJsonMutate", "restoreFromJsonMutate"} {
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
		for _, family := range []string{"prepareForJsonClone", "restoreFromJsonClone"} {
			entry := unionEntry(t, renderModuleDefault(t, dump, family), family)
			if strings.Contains(entry, "typeof v ===") || strings.Contains(entry, ".map(") {
				t.Errorf("[%s] %s must compile to nothing, not a dispatch chain; got:\n%s", family, label, entry)
			}
		}
	}
}

// TestCompactUnionNeedsEnvelope pins the keyed-form envelope helper the emitters and the cjr predicate share,
// beside the layout buildCompactFlatLayout hands both compact emitters: a union with object members goes
// positional and drops the helper's verdict.
func TestCompactUnionNeedsEnvelope(t *testing.T) {
	cases := []struct {
		name           string
		types          []*reflection.RunType
		want           bool
		wantPositional bool
		wantWrapper    bool
	}{
		{"nested object member", buildNestedObjectUnionFixture(), true, true, false},
		{"record of numbers | object", buildRecordNumberUnionFixture(), false, false, false},
		{"array of objects | string", buildArrayOfObjectsOrStringFixture(), true, false, true},
		{"bigint/Date members (transforms the keyed rule already envelopes)", buildBigIntDateUnionFixture(), true, true, false},
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
			layout := buildCompactFlatLayout(refTable["uni"], ctx)
			if layout.PositionalMerged != c.wantPositional || layout.AtomicNeedsTuple != c.wantWrapper {
				t.Errorf("layout PositionalMerged = %v, AtomicNeedsTuple = %v; want %v, %v",
					layout.PositionalMerged, layout.AtomicNeedsTuple, c.wantPositional, c.wantWrapper)
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
	for family, want := range map[string]string{"prepareForJsonClone": "return v;", "compactForJson": "return v;"} {
		got := entry(bare, family)
		if !strings.Contains(got, want) || strings.Contains(got, "v.a") {
			t.Errorf("[%s] the object member must be encoded as is, got:\n%s", family, got)
		}
	}
	for _, family := range []string{"restoreFromJsonClone", "compactFromJson"} {
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
	for _, family := range []string{"restoreFromJsonClone", "compactFromJson"} {
		got := entry(dated, family)
		if !strings.Contains(got, "if (dec0 === -1) {v.a = typeof v.a === 'string' ? new Date(v.a) : v.a}") || strings.Contains(got, "const r0") {
			t.Errorf("[%s] the object member must be restored in place, got:\n%s", family, got)
		}
	}
}
