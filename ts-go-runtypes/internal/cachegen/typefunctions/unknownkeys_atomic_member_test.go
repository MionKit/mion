package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// An ARRAY and a TUPLE are ATOMIC members of the flat union layout, which is not the same as
// key-free: both hold whatever their element type declares. Two arms were written as if it were:
// the union arm returned as soon as the union contributed no merged props, and the to-undefined
// family no-opped at a tuple node outright. Together those were the only positions where
// `strategy: 'strip'` handed a caller's undeclared keys to a handler.
//
// These pin the emitted code. The behaviour they buy is pinned end-to-end in
// packages/run-types/test/features/unknownKeyFamiliesAgree.test.ts.

func ukuwKey(id string) string { return operations.PlainHash("unknownKeysToUndefinedWire") + "_" + id }

func ukuwSite(pos int, id string) protocol.Site {
	return protocol.Site{File: "call.ts", Pos: pos, ID: id, Demand: []protocol.SiteDemand{{FamilyTag: "ukuw"}}}
}

func renderUkuwToString(t *testing.T, dump protocol.Dump) string {
	t.Helper()
	return joinEntries(t, FamilyByKey("unknownKeysToUndefinedWire").Collect(dump, RenderOpts{EmitMode: "both"}, nil))
}

// buildAtomicMemberFixture — `{a: string}` reached four ways: through an array, through a tuple
// slot, through `{a: string}[] | number`, and through a union of pure primitives.
func buildAtomicMemberFixture() []*reflection.RunType {
	pos0, pos1 := 0, 1
	return []*reflection.RunType{
		{ID: "str", Kind: reflection.KindString},
		{ID: "num", Kind: reflection.KindNumber},
		{ID: "pa", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("str")},
		{ID: "obj", Kind: reflection.KindObjectLiteral, TypeName: "Inner", Children: []*reflection.RunType{makeRef("pa")}},
		{ID: "arr", Kind: reflection.KindArray, TypeName: "Arr", Child: makeRef("obj")},
		{ID: "tm0", Kind: reflection.KindTupleMember, Position: &pos0, Child: makeRef("obj")},
		{ID: "tm1", Kind: reflection.KindTupleMember, Position: &pos1, Child: makeRef("num")},
		{ID: "tup", Kind: reflection.KindTuple, TypeName: "Tup", Children: []*reflection.RunType{makeRef("tm0"), makeRef("tm1")}},
		{ID: "uArr", Kind: reflection.KindUnion, TypeName: "UArr", Children: []*reflection.RunType{makeRef("arr"), makeRef("num")}},
		{ID: "uAtom", Kind: reflection.KindUnion, TypeName: "UAtom", Children: []*reflection.RunType{makeRef("str"), makeRef("num")}},
	}
}

// TestUnknownKeys_UnionWalksItsArrayMember — `{a: string}[] | number` has NO object member, so the
// merged allowlist is empty and the whole arm used to return there. The object inside the array is
// still the union's business.
func TestUnknownKeys_UnionWalksItsArrayMember(t *testing.T) {
	dump := protocol.Dump{RunTypes: buildAtomicMemberFixture(), Sites: []protocol.Site{ukeSite(0, "uArr")}}
	out := renderUkeToString(t, dump)
	line := extractInitLine(out, ukeKey("uArr"))
	if line == "" {
		t.Fatalf("no unknownKeyErrors entry for the union in:\n%s", out)
	}
	// The union's own entry calls the array member's entry, which is the descent. Without it the
	// body is `return er` and the array is never compiled at all.
	if !strings.Contains(line, ukeKey("arr")+".fn(v") {
		t.Errorf("the union must walk its array member, got:\n%s", line)
	}
	if extractInitLine(out, ukeKey("arr")) == "" {
		t.Errorf("the array member must be compiled, got:\n%s", out)
	}
}

// TestUnknownKeys_PureAtomicUnionEmitsNothing — the descent must not turn every union into a
// dispatch chain: a union whose members declare nothing has nothing to walk.
func TestUnknownKeys_PureAtomicUnionEmitsNothing(t *testing.T) {
	dump := protocol.Dump{RunTypes: buildAtomicMemberFixture(), Sites: []protocol.Site{ukeSite(0, "uAtom")}}
	line := extractInitLine(renderUkeToString(t, dump), ukeKey("uAtom"))
	if strings.Contains(line, "Array.isArray(v)") || strings.Contains(line, "for (const") {
		t.Errorf("`string | number` must compile to nothing, got:\n%s", line)
	}
}

// TestUnknownKeysWire_WalksTupleSlots — the to-undefined family no-opped at a tuple node on the
// reasoning that the safe ENCODER strips extras first. A decoder does not run on our own encoder's
// output; it runs on a caller's payload.
func TestUnknownKeysWire_WalksTupleSlots(t *testing.T) {
	dump := protocol.Dump{RunTypes: buildAtomicMemberFixture(), Sites: []protocol.Site{ukuwSite(0, "tup")}}
	out := renderUkuwToString(t, dump)
	line := extractInitLine(out, ukuwKey("tup"))
	if line == "" {
		t.Fatalf("no unknownKeysToUndefinedWire entry for the tuple in:\n%s", out)
	}
	if !strings.Contains(line, "Array.isArray(v)") {
		t.Errorf("the tuple walk must be guarded by Array.isArray, got:\n%s", line)
	}
	if !strings.Contains(line, ukuwKey("obj")+".fn(v[0])") {
		t.Errorf("slot 0 must be swept, got:\n%s", line)
	}
	if !strings.Contains(extractInitLine(out, ukuwKey("obj")), "= undefined") {
		t.Errorf("the slot's object entry must undefine undeclared keys, got:\n%s", out)
	}
}

// TestUnknownKeysWire_CircularTupleSlotIsGuarded — the reason the tuple no-op was written down:
// an optional self-referential slot produces unguarded reads. It was a real failure, and the fix is
// the shape guard every OTHER object-node unknown-keys emit already ran under. This family went
// without one because nothing could hand it a null while it stopped at tuples.
//
// `interface Self { list: [string, Self?] }` is the shape that found it. The slot arm already
// skips an `undefined` slot, but a JSON wire writes an absent optional as `null`, which sails past
// that check and reaches the object node, whose key scan then reads `v.list` off it.
func TestUnknownKeysWire_CircularTupleSlotIsGuarded(t *testing.T) {
	pos0, pos1 := 0, 1
	runTypes := []*reflection.RunType{
		{ID: "str", Kind: reflection.KindString},
		{ID: "ctm0", Kind: reflection.KindTupleMember, Position: &pos0, Child: makeRef("str")},
		{ID: "ctm1", Kind: reflection.KindTupleMember, Position: &pos1, Optional: true, Child: makeRef("selfObj")},
		{ID: "selfTup", Kind: reflection.KindTuple, Children: []*reflection.RunType{makeRef("ctm0"), makeRef("ctm1")}},
		{ID: "plist", Kind: reflection.KindProperty, Name: "list", IsSafeName: true, Child: makeRef("selfTup")},
		{
			ID: "selfObj", Kind: reflection.KindObjectLiteral, TypeName: "Self", IsCircular: true,
			Children: []*reflection.RunType{makeRef("plist")},
		},
	}
	dump := protocol.Dump{RunTypes: runTypes, Sites: []protocol.Site{ukuwSite(0, "selfObj")}}
	out := renderUkuwToString(t, dump)
	line := extractInitLine(out, ukuwKey("selfObj"))
	if line == "" {
		t.Fatalf("no unknownKeysToUndefinedWire entry for the circular object in:\n%s", out)
	}
	if !strings.Contains(line, "!== null && !Array.isArray(") {
		t.Errorf("the object node must not read its keys off a missing slot, got:\n%s", line)
	}
}
