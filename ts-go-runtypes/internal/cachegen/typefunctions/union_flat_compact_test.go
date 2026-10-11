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
	for _, row := range cases {
		t.Run(row.name, func(t *testing.T) {
			refTable := make(map[string]*reflection.RunType, len(row.types))
			for _, rt := range row.types {
				refTable[rt.ID] = rt
			}
			ctx := &EmitContext{walker: &Walker{RefTable: refTable}}
			if got := compactUnionEnvelope(refTable["uni"], ctx); got != row.want {
				t.Errorf("compactUnionEnvelope = %v, want %v", got, row.want)
			}
			layout := buildCompactFlatLayout(refTable["uni"], ctx)
			if layout.PositionalMerged != row.wantPositional || layout.AtomicNeedsTuple != row.wantWrapper {
				t.Errorf("layout PositionalMerged = %v, AtomicNeedsTuple = %v; want %v, %v",
					layout.PositionalMerged, layout.AtomicNeedsTuple, row.wantPositional, row.wantWrapper)
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

// unionFixture collects the nodes of a hand-built union whose root id is `uni`.
type unionFixture struct{ nodes []*reflection.RunType }

func (fixture *unionFixture) add(node *reflection.RunType) string {
	fixture.nodes = append(fixture.nodes, node)
	return node.ID
}

func (fixture *unionFixture) leaf(id string, kind reflection.ReflectionKind) string {
	return fixture.add(&reflection.RunType{ID: id, Kind: kind})
}

func (fixture *unionFixture) literal(id string, value any) string {
	return fixture.add(&reflection.RunType{ID: id, Kind: reflection.KindLiteral, Literal: value})
}

// object adds an object literal; each prop is `name`, or `name?` for an optional one, mapped to its child id.
func (fixture *unionFixture) object(id string, props ...[2]string) string {
	var children []*reflection.RunType
	for _, prop := range props {
		name, optional := strings.CutSuffix(prop[0], "?")
		propID := fixture.add(&reflection.RunType{
			ID: id + "_" + name, Kind: reflection.KindPropertySignature, Name: name, IsSafeName: true,
			Optional: optional, Child: makeRef(prop[1]),
		})
		children = append(children, makeRef(propID))
	}
	return fixture.add(&reflection.RunType{ID: id, Kind: reflection.KindObjectLiteral, Children: children})
}

func (fixture *unionFixture) union(memberIDs ...string) protocol.Dump {
	var members []*reflection.RunType
	for _, id := range memberIDs {
		members = append(members, makeRef(id))
	}
	fixture.add(&reflection.RunType{ID: "uni", Kind: reflection.KindUnion, Children: members, SafeUnionChildren: members})
	return protocol.Dump{RunTypes: fixture.nodes}
}

// compactLayout is buildCompactFlatLayout over a fixture's `uni` node.
func compactLayout(t *testing.T, dump protocol.Dump) FlatLayout {
	ctx := layoutCtx(t, dump.RunTypes)
	return buildCompactFlatLayout(ctx.walker.RefTable["uni"], ctx)
}

// compactUnionEntry renders the union entry of family with the JS quotes unescaped.
func compactUnionEntry(t *testing.T, dump protocol.Dump, family string) string {
	t.Helper()
	return familyEntry(t, dump.RunTypes, family, "uni")
}

// paymentMethodFixture is the mion benchmark's PaymentMethod union.
func paymentMethodFixture() protocol.Dump {
	fixture := &unionFixture{}
	str, num := fixture.leaf("str", reflection.KindString), fixture.leaf("num", reflection.KindNumber)
	card := fixture.object("card", [2]string{"type", fixture.literal("lcc", "credit_card")}, [2]string{"lastFourDigits", str},
		[2]string{"expiryMonth", num}, [2]string{"expiryYear", num}, [2]string{"brand", str})
	bank := fixture.object("bank", [2]string{"type", fixture.literal("lba", "bank_account")}, [2]string{"bankName", str},
		[2]string{"accountLastFour", str}, [2]string{"routingNumber", str})
	paypal := fixture.object("paypal", [2]string{"type", fixture.literal("lpp", "paypal")}, [2]string{"email", str})
	return fixture.union(card, bank, paypal)
}

func TestCompactPositional_PaymentMethodEncode(t *testing.T) {
	got := compactUnionEntry(t, paymentMethodFixture(), "compactForJson")
	want := "if ((typeof v === 'object' && v !== null)) return [v.type,(v.lastFourDigits !== undefined ? v.lastFourDigits : 0)," +
		"(v.expiryMonth !== undefined ? v.expiryMonth : null),(v.expiryYear !== undefined ? v.expiryYear : null)," +
		"(v.brand !== undefined ? v.brand : 0),(v.bankName !== undefined ? v.bankName : 0)," +
		"(v.accountLastFour !== undefined ? v.accountLastFour : 0),(v.routingNumber !== undefined ? v.routingNumber : 0)," +
		"(v.email !== undefined ? v.email : 0)];"
	if !strings.Contains(got, want) {
		t.Errorf("PaymentMethod must encode as one positional array:\nwant %s\ngot:\n%s", want, got)
	}
}

func TestCompactPositional_PaymentMethodDecode(t *testing.T) {
	got := compactUnionEntry(t, paymentMethodFixture(), "compactFromJson")
	for _, want := range []string{
		"if (Array.isArray(v)) {const r0 = {};r0.type = v[0];",
		"if (v[1] !== undefined && v[1] !== 0) {r0.lastFourDigits = v[1];}",
		"if (v[2] !== undefined && v[2] !== null) {r0.expiryMonth = v[2];}",
		"if (v[8] !== undefined && v[8] !== 0) {r0.email = v[8];}v = r0;",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("decode must contain %q; got:\n%s", want, got)
		}
	}
}

// A function-typed `f` on one member is DataOnly-stripped: that member's value still carries the key, so the slot
// writes the placeholder unless the value matches the surviving Date candidate.
func TestCompactPositional_StrippedCandidateWritesPlaceholder(t *testing.T) {
	fixture := &unionFixture{}
	date := fixture.add(&reflection.RunType{ID: "dat", Kind: reflection.KindClass, SubKind: reflection.SubKindDate})
	fn := fixture.leaf("fn", reflection.KindFunction)
	memberA := fixture.object("oa", [2]string{"k", fixture.literal("la", "a")}, [2]string{"f", date})
	memberB := fixture.object("ob", [2]string{"k", fixture.literal("lb", "b")}, [2]string{"f", fn})
	got := compactUnionEntry(t, fixture.union(memberA, memberB), "compactForJson")
	if !strings.Contains(got, "(v.f !== undefined && (((typeof v.f === 'object'") || !strings.Contains(got, "v.f.toISOString() : 0)") {
		t.Errorf("a stripped candidate must guard the surviving codec and fall back to the placeholder; got:\n%s", got)
	}
}

// `f` is a Date on one member and a number on the other: the slot rides `[subIdx, value]`, an array, so its
// placeholder is `0`, and a value matching no candidate writes it too.
func TestCompactPositional_SubWrappedSlot(t *testing.T) {
	fixture := &unionFixture{}
	date := fixture.add(&reflection.RunType{ID: "dat", Kind: reflection.KindClass, SubKind: reflection.SubKindDate})
	num := fixture.leaf("num", reflection.KindNumber)
	memberA := fixture.object("oa", [2]string{"k", fixture.literal("la", "a")}, [2]string{"f?", date})
	memberB := fixture.object("ob", [2]string{"k", fixture.literal("lb", "b")}, [2]string{"f?", num})
	dump := fixture.union(memberA, memberB)
	encode := compactUnionEntry(t, dump, "compactForJson")
	if !strings.Contains(encode, "return [0, v.f.toISOString()]; if (v.k === 'b') return [1, v.f]; return 0;") {
		t.Errorf("a sub-wrapped slot must dispatch by discriminant and fall back to `0`; got:\n%s", encode)
	}
	decode := compactUnionEntry(t, dump, "compactFromJson")
	if !strings.Contains(decode, "if (v[1] !== undefined && v[1] !== 0) {if (Array.isArray(v[1]) && v[1].length === 2") {
		t.Errorf("the decode must skip the placeholder before the sub-index unwrap; got:\n%s", decode)
	}
}

// `({}).constructor` answers the Object function, so the slot's presence is own-enumerability.
func TestCompactPositional_ConstructorProp(t *testing.T) {
	fixture := &unionFixture{}
	str, num := fixture.leaf("str", reflection.KindString), fixture.leaf("num", reflection.KindNumber)
	memberA := fixture.object("oa", [2]string{"constructor?", str})
	memberB := fixture.object("ob", [2]string{"n", num})
	got := compactUnionEntry(t, fixture.union(memberA, memberB), "compactForJson")
	if !strings.Contains(got, "(Object.prototype.propertyIsEnumerable.call(v, 'constructor') && v.constructor !== undefined ? v.constructor : 0)") {
		t.Errorf("the constructor slot must test own-enumerability; got:\n%s", got)
	}
}

func TestBuildCompactFlatLayout_PositionalAndWrapper(t *testing.T) {
	cases := map[string]struct {
		build          func(fixture *unionFixture) protocol.Dump
		wantPositional bool
		wantWrapper    bool
	}{
		"objects only: no wrapper": {func(fixture *unionFixture) protocol.Dump {
			str := fixture.leaf("str", reflection.KindString)
			return fixture.union(fixture.object("oa", [2]string{"a", str}), fixture.object("ob", [2]string{"b", str}))
		}, true, false},
		"objects carrying a Date: no wrapper": {func(fixture *unionFixture) protocol.Dump {
			date := fixture.add(&reflection.RunType{ID: "dat", Kind: reflection.KindClass, SubKind: reflection.SubKindDate})
			return fixture.union(fixture.object("oa", [2]string{"a", date}), fixture.object("ob", [2]string{"b", date}))
		}, true, false},
		"{tag} | null: no wrapper": {func(fixture *unionFixture) protocol.Dump {
			str := fixture.leaf("str", reflection.KindString)
			return fixture.union(fixture.object("oa", [2]string{"tag", str}), fixture.leaf("nul", reflection.KindNull))
		}, true, false},
		"{a} | string | 1 | enum: no wrapper": {func(fixture *unionFixture) protocol.Dump {
			str := fixture.leaf("str", reflection.KindString)
			enum := fixture.add(&reflection.RunType{ID: "enm", Kind: reflection.KindEnum, Values: []any{1.0}})
			return fixture.union(fixture.object("oa", [2]string{"a", str}), str, fixture.literal("one", 1.0), enum)
		}, true, false},
		"{a} | string[]: wrapper": {func(fixture *unionFixture) protocol.Dump {
			str := fixture.leaf("str", reflection.KindString)
			arr := fixture.add(&reflection.RunType{ID: "arr", Kind: reflection.KindArray, Child: makeRef(str)})
			return fixture.union(fixture.object("oa", [2]string{"a", str}), arr)
		}, true, true},
		"{a} | undefined: wrapper": {func(fixture *unionFixture) protocol.Dump {
			str := fixture.leaf("str", reflection.KindString)
			return fixture.union(fixture.object("oa", [2]string{"a", str}), fixture.leaf("und", reflection.KindUndefined))
		}, true, true},
		"record carve-out stays keyed": {func(fixture *unionFixture) protocol.Dump {
			fixture.nodes = buildRecordNumberUnionFixture()
			return protocol.Dump{RunTypes: fixture.nodes}
		}, false, false},
		"required unknown slot falls back to keyed": {func(fixture *unionFixture) protocol.Dump {
			str, unknown := fixture.leaf("str", reflection.KindString), fixture.leaf("unk", reflection.KindUnknown)
			return fixture.union(fixture.object("oa", [2]string{"a", unknown}), fixture.object("ob", [2]string{"b", str}))
		}, false, false},
		"optional unknown slot stays positional": {func(fixture *unionFixture) protocol.Dump {
			str, unknown := fixture.leaf("str", reflection.KindString), fixture.leaf("unk", reflection.KindUnknown)
			return fixture.union(fixture.object("oa", [2]string{"a?", unknown}), fixture.object("ob", [2]string{"b", str}))
		}, true, false},
	}
	for name, row := range cases {
		t.Run(name, func(t *testing.T) {
			layout := compactLayout(t, row.build(&unionFixture{}))
			if layout.PositionalMerged != row.wantPositional || layout.AtomicNeedsTuple != row.wantWrapper {
				t.Errorf("PositionalMerged = %v, AtomicNeedsTuple = %v; want %v, %v",
					layout.PositionalMerged, layout.AtomicNeedsTuple, row.wantPositional, row.wantWrapper)
			}
		})
	}
}

// `{a} | string[]` keeps the all-or-nothing wrapper: the merged object rides `[-1, positional]` and the decode only
// rebuilds an array under `-1`.
func TestCompactPositional_WrappedArrayMember(t *testing.T) {
	fixture := &unionFixture{}
	str := fixture.leaf("str", reflection.KindString)
	arr := fixture.add(&reflection.RunType{ID: "arr", Kind: reflection.KindArray, Child: makeRef(str)})
	dump := fixture.union(fixture.object("oa", [2]string{"a", str}), arr)
	if encode := compactUnionEntry(t, dump, "compactForJson"); !strings.Contains(encode, "return [-1, [v.a]];") {
		t.Errorf("the merged object must ride `[-1, positional]`; got:\n%s", encode)
	}
	if decode := compactUnionEntry(t, dump, "compactFromJson"); !strings.Contains(decode, "if (dec0 === -1) {if (Array.isArray(v)) {const r0 = {};r0.a = v[0];v = r0;}}") {
		t.Errorf("the `-1` arm must rebuild only an array; got:\n%s", decode)
	}
}
