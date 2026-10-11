package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// unionFixture collects the nodes of a hand-built union whose root id is `uni`.
type unionFixture struct{ nodes []*reflection.RunType }

func (f *unionFixture) add(node *reflection.RunType) string {
	f.nodes = append(f.nodes, node)
	return node.ID
}

func (f *unionFixture) leaf(id string, kind reflection.ReflectionKind) string {
	return f.add(&reflection.RunType{ID: id, Kind: kind})
}

func (f *unionFixture) literal(id string, value any) string {
	return f.add(&reflection.RunType{ID: id, Kind: reflection.KindLiteral, Literal: value})
}

// object adds an object literal; each prop is `name`, or `name?` for an optional one, mapped to its child id.
func (f *unionFixture) object(id string, props ...[2]string) string {
	var children []*reflection.RunType
	for _, prop := range props {
		name, optional := strings.CutSuffix(prop[0], "?")
		propID := f.add(&reflection.RunType{
			ID: id + "_" + name, Kind: reflection.KindPropertySignature, Name: name, IsSafeName: true,
			Optional: optional, Child: makeRef(prop[1]),
		})
		children = append(children, makeRef(propID))
	}
	return f.add(&reflection.RunType{ID: id, Kind: reflection.KindObjectLiteral, Children: children})
}

func (f *unionFixture) union(memberIDs ...string) protocol.Dump {
	var members []*reflection.RunType
	for _, id := range memberIDs {
		members = append(members, makeRef(id))
	}
	f.add(&reflection.RunType{ID: "uni", Kind: reflection.KindUnion, Children: members, SafeUnionChildren: members})
	return protocol.Dump{RunTypes: f.nodes}
}

func (f *unionFixture) layout(dump protocol.Dump) FlatLayout {
	refTable := make(map[string]*reflection.RunType, len(dump.RunTypes))
	for _, rt := range dump.RunTypes {
		refTable[rt.ID] = rt
	}
	ctx := &EmitContext{walker: &Walker{RefTable: refTable}}
	return buildCompactFlatLayout(refTable["uni"], ctx)
}

// compactUnionEntry renders the union entry of family with the JS quotes unescaped.
func compactUnionEntry(t *testing.T, dump protocol.Dump, family string) string {
	t.Helper()
	return strings.ReplaceAll(unionEntry(t, renderModuleDefault(t, dump, family), family), `\'`, "'")
}

// paymentMethodFixture is the mion benchmark's PaymentMethod union.
func paymentMethodFixture() protocol.Dump {
	f := &unionFixture{}
	str, num := f.leaf("str", reflection.KindString), f.leaf("num", reflection.KindNumber)
	card := f.object("card", [2]string{"type", f.literal("lcc", "credit_card")}, [2]string{"lastFourDigits", str},
		[2]string{"expiryMonth", num}, [2]string{"expiryYear", num}, [2]string{"brand", str})
	bank := f.object("bank", [2]string{"type", f.literal("lba", "bank_account")}, [2]string{"bankName", str},
		[2]string{"accountLastFour", str}, [2]string{"routingNumber", str})
	paypal := f.object("paypal", [2]string{"type", f.literal("lpp", "paypal")}, [2]string{"email", str})
	return f.union(card, bank, paypal)
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
	f := &unionFixture{}
	date := f.add(&reflection.RunType{ID: "dat", Kind: reflection.KindClass, SubKind: reflection.SubKindDate})
	fn := f.leaf("fn", reflection.KindFunction)
	a := f.object("oa", [2]string{"k", f.literal("la", "a")}, [2]string{"f", date})
	b := f.object("ob", [2]string{"k", f.literal("lb", "b")}, [2]string{"f", fn})
	got := compactUnionEntry(t, f.union(a, b), "compactForJson")
	if !strings.Contains(got, "((v.f !== undefined && (((typeof v.f === 'object'") || !strings.Contains(got, "v.f.toISOString() : 0)") {
		t.Errorf("a stripped candidate must guard the surviving codec and fall back to the placeholder; got:\n%s", got)
	}
}

// `f` is a Date on one member and a number on the other: the slot rides `[subIdx, value]`, an array, so its
// placeholder is `0`, and a value matching no candidate writes it too.
func TestCompactPositional_SubWrappedSlot(t *testing.T) {
	f := &unionFixture{}
	date := f.add(&reflection.RunType{ID: "dat", Kind: reflection.KindClass, SubKind: reflection.SubKindDate})
	num := f.leaf("num", reflection.KindNumber)
	a := f.object("oa", [2]string{"k", f.literal("la", "a")}, [2]string{"f?", date})
	b := f.object("ob", [2]string{"k", f.literal("lb", "b")}, [2]string{"f?", num})
	dump := f.union(a, b)
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
	f := &unionFixture{}
	str, num := f.leaf("str", reflection.KindString), f.leaf("num", reflection.KindNumber)
	a := f.object("oa", [2]string{"constructor?", str})
	b := f.object("ob", [2]string{"n", num})
	got := compactUnionEntry(t, f.union(a, b), "compactForJson")
	if !strings.Contains(got, "(Object.prototype.propertyIsEnumerable.call(v, 'constructor') ? v.constructor : 0)") {
		t.Errorf("the constructor slot must test own-enumerability; got:\n%s", got)
	}
}

func TestBuildCompactFlatLayout_PositionalAndWrapper(t *testing.T) {
	cases := map[string]struct {
		build          func(f *unionFixture) protocol.Dump
		wantPositional bool
		wantWrapper    bool
	}{
		"objects only: no wrapper": {func(f *unionFixture) protocol.Dump {
			str := f.leaf("str", reflection.KindString)
			return f.union(f.object("oa", [2]string{"a", str}), f.object("ob", [2]string{"b", str}))
		}, true, false},
		"objects carrying a Date: no wrapper": {func(f *unionFixture) protocol.Dump {
			date := f.add(&reflection.RunType{ID: "dat", Kind: reflection.KindClass, SubKind: reflection.SubKindDate})
			return f.union(f.object("oa", [2]string{"a", date}), f.object("ob", [2]string{"b", date}))
		}, true, false},
		"{tag} | null: no wrapper": {func(f *unionFixture) protocol.Dump {
			str := f.leaf("str", reflection.KindString)
			return f.union(f.object("oa", [2]string{"tag", str}), f.leaf("nul", reflection.KindNull))
		}, true, false},
		"{a} | string | 1 | enum: no wrapper": {func(f *unionFixture) protocol.Dump {
			str := f.leaf("str", reflection.KindString)
			enum := f.add(&reflection.RunType{ID: "enm", Kind: reflection.KindEnum, Values: []any{1.0}})
			return f.union(f.object("oa", [2]string{"a", str}), str, f.literal("one", 1.0), enum)
		}, true, false},
		"{a} | string[]: wrapper": {func(f *unionFixture) protocol.Dump {
			str := f.leaf("str", reflection.KindString)
			arr := f.add(&reflection.RunType{ID: "arr", Kind: reflection.KindArray, Child: makeRef(str)})
			return f.union(f.object("oa", [2]string{"a", str}), arr)
		}, true, true},
		"{a} | undefined: wrapper": {func(f *unionFixture) protocol.Dump {
			str := f.leaf("str", reflection.KindString)
			return f.union(f.object("oa", [2]string{"a", str}), f.leaf("und", reflection.KindUndefined))
		}, true, true},
		"record carve-out stays keyed": {func(f *unionFixture) protocol.Dump {
			f.nodes = buildRecordNumberUnionFixture()
			return protocol.Dump{RunTypes: f.nodes}
		}, false, false},
		"required unknown slot falls back to keyed": {func(f *unionFixture) protocol.Dump {
			str, unknown := f.leaf("str", reflection.KindString), f.leaf("unk", reflection.KindUnknown)
			return f.union(f.object("oa", [2]string{"a", unknown}), f.object("ob", [2]string{"b", str}))
		}, false, false},
		"optional unknown slot stays positional": {func(f *unionFixture) protocol.Dump {
			str, unknown := f.leaf("str", reflection.KindString), f.leaf("unk", reflection.KindUnknown)
			return f.union(f.object("oa", [2]string{"a?", unknown}), f.object("ob", [2]string{"b", str}))
		}, true, false},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			f := &unionFixture{}
			layout := f.layout(c.build(f))
			if layout.PositionalMerged != c.wantPositional || layout.AtomicNeedsTuple != c.wantWrapper {
				t.Errorf("PositionalMerged = %v, AtomicNeedsTuple = %v; want %v, %v",
					layout.PositionalMerged, layout.AtomicNeedsTuple, c.wantPositional, c.wantWrapper)
			}
		})
	}
}

// `{a} | string[]` keeps the all-or-nothing wrapper: the merged object rides `[-1, positional]` and the decode only
// rebuilds an array under `-1`.
func TestCompactPositional_WrappedArrayMember(t *testing.T) {
	f := &unionFixture{}
	str := f.leaf("str", reflection.KindString)
	arr := f.add(&reflection.RunType{ID: "arr", Kind: reflection.KindArray, Child: makeRef(str)})
	dump := f.union(f.object("oa", [2]string{"a", str}), arr)
	if encode := compactUnionEntry(t, dump, "compactForJson"); !strings.Contains(encode, "return [-1, [v.a]];") {
		t.Errorf("the merged object must ride `[-1, positional]`; got:\n%s", encode)
	}
	if decode := compactUnionEntry(t, dump, "compactFromJson"); !strings.Contains(decode, "if (dec0 === -1) {if (Array.isArray(v)) {const r0 = {};r0.a = v[0];v = r0;}}") {
		t.Errorf("the `-1` arm must rebuild only an array; got:\n%s", decode)
	}
}
