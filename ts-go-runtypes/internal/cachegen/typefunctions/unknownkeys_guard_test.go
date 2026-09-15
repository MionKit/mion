package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// The unknown-keys descent assumes the value has the shape the schema
// declares: it reads `v.address` and walks `for (const k in v)`. Neither is
// meaningful otherwise — against null it throws, and over a string or an array
// it invents one entry per character / index. So every composite node renders
// its body under a shape guard, and the family answers neutrally when the
// guard rejects. These tests pin the guard in the emitted source; the
// behaviour it buys is pinned end-to-end in
// packages/run-types/test/features/unknownKeys.test.ts.

// ukeKey returns the plain unknownKeyErrors cache key for a type id.
func ukeKey(id string) string { return operations.PlainHash("unknownKeyErrors") + "_" + id }

// renderUkeToString collects the unknownKeyErrors family for a dump.
func renderUkeToString(t *testing.T, dump protocol.Dump) string {
	t.Helper()
	return joinEntries(t, FamilyByKey("unknownKeyErrors").Collect(dump, RenderOpts{EmitMode: "both"}, nil))
}

// ukeSite builds one createUnknownKeyErrorsFn call site.
func ukeSite(pos int, id string) protocol.Site {
	return protocol.Site{File: "call.ts", Pos: pos, ID: id, Demand: []protocol.SiteDemand{{FamilyTag: "uke"}}}
}

// ukuwKey returns the plain unknownKeysToUndefinedWire cache key for a type id.
func ukuwKey(id string) string { return operations.PlainHash("unknownKeysToUndefinedWire") + "_" + id }

// ukuwSite builds one call site demanding the decoder-internal ukuw family.
func ukuwSite(pos int, id string) protocol.Site {
	return protocol.Site{File: "call.ts", Pos: pos, ID: id, Demand: []protocol.SiteDemand{{FamilyTag: "ukuw"}}}
}

// renderUkuwToString collects the unknownKeysToUndefinedWire family for a dump.
func renderUkuwToString(t *testing.T, dump protocol.Dump) string {
	t.Helper()
	return joinEntries(t, FamilyByKey("unknownKeysToUndefinedWire").Collect(dump, RenderOpts{EmitMode: "both"}, nil))
}

// buildAtomicMemberFixture is the NAMED object `Inner = {a: string}` reached through an array,
// through a tuple slot and through `Inner[] | number`. Named so each position dep-calls the
// object's own entry, which is what the assertions look for.
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
	}
}

// buildGuardFixture is `type Inline = {inner: {a: string; b: string}}` plus an
// array and a tuple over the same object, so one dump covers every composite
// node kind the guard touches.
func buildGuardFixture() []*reflection.RunType {
	tuplePos := 0
	return []*reflection.RunType{
		{ID: "str", Kind: reflection.KindString},
		{ID: "pa", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("str")},
		{ID: "pb", Kind: reflection.KindProperty, Name: "b", IsSafeName: true, Child: makeRef("str")},
		{ID: "anon", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pa"), makeRef("pb")}},
		{ID: "panon", Kind: reflection.KindProperty, Name: "inner", IsSafeName: true, Child: makeRef("anon")},
		{ID: "inline", Kind: reflection.KindObjectLiteral, TypeName: "Inline", Children: []*reflection.RunType{makeRef("panon")}},
		{ID: "arr", Kind: reflection.KindArray, TypeName: "Arr", Child: makeRef("anon")},
		{ID: "tm0", Kind: reflection.KindTupleMember, Position: &tuplePos, Child: makeRef("anon")},
		{ID: "tup", Kind: reflection.KindTuple, TypeName: "Tup", Children: []*reflection.RunType{makeRef("tm0")}},
	}
}

// TestUnknownKeyErrors_ObjectNodeCarriesShapeGuard — the object body runs only
// for a non-null, non-array object, at the root AND at the inlined child.
func TestUnknownKeyErrors_ObjectNodeCarriesShapeGuard(t *testing.T) {
	dump := protocol.Dump{RunTypes: buildGuardFixture(), Sites: []protocol.Site{ukeSite(0, "inline")}}
	out := renderUkeToString(t, dump)

	line := extractInitLine(out, ukeKey("inline"))
	if line == "" {
		t.Fatalf("no unknownKeyErrors entry in:\n%s", out)
	}
	// Two object nodes (root + inlined child) → two guards.
	if got := strings.Count(line, "!== null && !Array.isArray("); got < 2 {
		t.Errorf("expected a shape guard at both object depths, got %d in:\n%s", got, line)
	}
	// The guard must be the FIRST thing the body does — a key scan ahead of
	// it would already have walked a string's character indices.
	if !strings.HasPrefix(bodyAfter(line, "(v,pth=[],er=[]){"), "if (typeof v === ") {
		t.Errorf("the shape guard must open the body, got:\n%s", line)
	}
}

// TestUnknownKeyErrors_ContainerRootsCarryShapeGuard — an array or tuple root
// reads `v.length` / `v[0]`, so its descent is guarded by Array.isArray.
func TestUnknownKeyErrors_ContainerRootsCarryShapeGuard(t *testing.T) {
	dump := protocol.Dump{
		RunTypes: buildGuardFixture(),
		Sites:    []protocol.Site{ukeSite(0, "arr"), ukeSite(40, "tup")},
	}
	out := renderUkeToString(t, dump)

	for _, id := range []string{"arr", "tup"} {
		line := extractInitLine(out, ukeKey(id))
		if line == "" {
			t.Fatalf("no unknownKeyErrors entry for %q in:\n%s", id, out)
		}
		if !strings.Contains(line, "Array.isArray(v)") {
			t.Errorf("%q root must guard its element descent with Array.isArray, got:\n%s", id, line)
		}
	}
}

// TestHasUnknownKeys_ObjectNodeCarriesShapeGuard — the `||` chain does not
// short-circuit the child descent away, so the plain predicate guards the whole
// chain. The runsAfterValidation variant stays guardless by contract (pinned in
// unknownkeys_has_variant_test.go).
func TestHasUnknownKeys_ObjectNodeCarriesShapeGuard(t *testing.T) {
	dump := protocol.Dump{RunTypes: buildGuardFixture(), Sites: []protocol.Site{hukSite(0, "inline", nil)}}
	out := renderHukToString(t, dump)

	line := extractInitLine(out, hukKey("inline"))
	if line == "" {
		t.Fatalf("no hasUnknownKeys entry in:\n%s", out)
	}
	if got := strings.Count(line, "!== null && !Array.isArray("); got < 2 {
		t.Errorf("expected a shape guard at both object depths, got %d in:\n%s", got, line)
	}
	// The guard opens the chain, so `v.inner` is never read against null.
	if !strings.HasPrefix(bodyAfter(line, "(v,opts={}){"), "return (typeof v === ") {
		t.Errorf("the shape guard must open the OR chain, got:\n%s", line)
	}
}

// bodyAfter returns what a rendered entry line holds right after `marker`, the
// closure's own argument list — everything before it is the shared prologue.
// The body arrives as a JS string literal, so its quotes are backslash-escaped;
// callers match on the quote-free part of a snippet.
func bodyAfter(line, marker string) string {
	idx := strings.Index(line, marker)
	if idx < 0 {
		return ""
	}
	return line[idx+len(marker):]
}

// TestUnknownKeysWire_WalksTupleSlots: the strip decoder runs on a caller's payload, so a tuple
// slot is swept like any other position, behind the Array.isArray guard. Pinned end-to-end in
// packages/run-types/test/features/unknownKeyFamiliesAgree.test.ts.
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

// TestUnknownKeysWire_CircularTupleSlotIsGuarded: an object node reached through an optional
// tuple slot (`interface Self { list: [string, Self?] }`) runs under the shape guard, since a JSON
// wire writes an absent optional as `null` and the key scan would read `v.list` off it.
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
