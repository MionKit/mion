package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// makeRef returns a KindRef sentinel pointing at the supplied id —
// children inside a union/object live on the wire as refs (see
// internal/reflection). Tests build the same shape.
func makeRef(id string) *reflection.RunType {
	return &reflection.RunType{Kind: reflection.KindRef, ID: id}
}

// buildBigIntDateUnionFixture builds an objectLiteral union with two
// members:
//
//	{ a: bigint; b: Date }  |  { c: number; d: string }
//
// Every property is required. Two disjoint object members with
// non-overlapping property names exercise the merged-encode path
// without any conflict resolution.
func buildBigIntDateUnionFixture() []*reflection.RunType {
	bigint := &reflection.RunType{ID: "big", Kind: reflection.KindBigInt}
	date := &reflection.RunType{ID: "dat", Kind: reflection.KindClass, SubKind: reflection.SubKindDate}
	number := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}

	propA := &reflection.RunType{ID: "pa", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("big")}
	propB := &reflection.RunType{ID: "pb", Kind: reflection.KindProperty, Name: "b", IsSafeName: true, Child: makeRef("dat")}
	propC := &reflection.RunType{ID: "pc", Kind: reflection.KindProperty, Name: "c", IsSafeName: true, Child: makeRef("num")}
	propD := &reflection.RunType{ID: "pd", Kind: reflection.KindProperty, Name: "d", IsSafeName: true, Child: makeRef("str")}

	obj1 := &reflection.RunType{
		ID: "ob1", Kind: reflection.KindObjectLiteral,
		Children: []*reflection.RunType{makeRef("pa"), makeRef("pb")},
	}
	obj2 := &reflection.RunType{
		ID: "ob2", Kind: reflection.KindObjectLiteral,
		Children: []*reflection.RunType{makeRef("pc"), makeRef("pd")},
	}

	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("ob1"), makeRef("ob2")},
		SafeUnionChildren: []*reflection.RunType{makeRef("ob1"), makeRef("ob2")},
	}

	return []*reflection.RunType{
		bigint, date, number, str,
		propA, propB, propC, propD,
		obj1, obj2,
		union,
	}
}

func renderModule(t *testing.T, dump protocol.Dump, familyKey string) string {
	t.Helper()
	// EmitMode 'both' so body assertions match the un-escaped form inside
	// the inline closure — see module_test.go's renderToString rationale.
	return joinEntries(t, FamilyByKey(familyKey).Collect(dump, RenderOpts{EmitMode: "both"}, nil))
}

// renderModuleDefault is the production-default (EmitMode 'code')
// sibling — bodies live only in the quoted `code` string.
func renderModuleDefault(t *testing.T, dump protocol.Dump, familyKey string) string {
	t.Helper()
	return joinEntries(t, FamilyByKey(familyKey).Collect(dump, RenderOpts{}, nil))
}

// TestPrepareForJsonModule_ObjectUnionMergesProps — the rendered
// flat-prepare factory for `{a:bigint;b:Date} | {c:number;d:string}` MUST
// emit a single object branch that walks every merged property and
// wraps with `[-1, v]`. The factory MUST NOT emit per-member validate
// dispatch for the object members (the whole point of the optimisation).
func TestPrepareForJsonModule_ObjectUnionMergesProps(t *testing.T) {
	dump := protocol.Dump{RunTypes: buildBigIntDateUnionFixture()}
	// EmitMode 'both' so the body assertions below match the
	// un-escaped form inside the `function g_pj_uni(utl){…}` closure.
	// See module_test.go's renderToString comment for the rationale.
	out := renderModule(t, dump, "prepareForJsonMutate")

	pjUniFactory := "g_" + operations.PlainHash("prepareForJsonMutate") + "_uni"
	if !strings.Contains(out, pjUniFactory) {
		t.Fatalf("expected the prepareForJson union factory %s in rendered module:\n%s", pjUniFactory, out)
	}
	if !strings.Contains(out, "[-1, v]") {
		t.Errorf("expected `[-1, v]` envelope in object branch; got:\n%s", out)
	}
	if !strings.Contains(out, "v.a !== undefined") {
		t.Errorf("expected `v.a !== undefined` guard for merged prop a; got:\n%s", out)
	}
	if !strings.Contains(out, "v.a.toString()") {
		t.Errorf("expected bigint prep `v.a.toString()`; got:\n%s", out)
	}
	if !strings.Contains(out, "typeof v === 'object'") {
		t.Errorf("expected object-branch guard `typeof v === 'object'`; got:\n%s", out)
	}
	// No per-object validate dispatch on the union itself.
	if strings.Contains(out, "g_"+valKey("ob1")) || strings.Contains(out, "g_"+valKey("ob2")) {
		t.Errorf("flat encode should bypass per-object validate dispatch; got:\n%s", out)
	}
}

// TestRestoreFromJsonModule_ObjectUnionDecodesFlat — the rendered
// flat-restore factory unconditionally unwraps the `[idx, value]`
// envelope (no runtime shape gate) and dispatches via `idx === -1` for
// the merged-object branch. Under the all-or-nothing wrap rule the
// decoder knows the wire shape at compile time so the fragile
// length-2 + typeof-number heuristic is gone.
func TestRestoreFromJsonModule_ObjectUnionDecodesFlat(t *testing.T) {
	dump := protocol.Dump{RunTypes: buildBigIntDateUnionFixture()}
	out := renderModuleDefault(t, dump, "restoreFromJsonMutate")

	if strings.Contains(out, "Array.isArray(v) && v.length === 2 && typeof v[0] === 'number'") {
		t.Errorf("optimised emit must NOT use the length-2 + typeof[0]==='number' shape gate — it false-positives on legitimate raw values; got:\n%s", out)
	}
	if !strings.Contains(out, "const dec0 = v[0]") {
		t.Errorf("expected unconditional unwrap `const dec0 = v[0]`; got:\n%s", out)
	}
	if !strings.Contains(out, "=== -1") {
		t.Errorf("expected `=== -1` dispatch for the merged-object branch; got:\n%s", out)
	}
	// The cold-branch throw names the index that matched no member.
	if !strings.Contains(out, "throw new Error(fuDecErr + dec0)") {
		t.Errorf("expected the decode throw to append the received index; got:\n%s", out)
	}
	if !strings.Contains(out, "invalid union index ") {
		t.Errorf("expected the [mion] decode message with a trailing space for the index; got:\n%s", out)
	}
	// The restore arms transform only the wire form (a string); anything
	// else is left for validate to refuse, so `null` never becomes an epoch
	// Date and `true` never becomes 1n.
	if !strings.Contains(out, "v.a = typeof v.a === \\'string\\' ? (reBigWire.test(v.a) ? BigInt(v.a) : v.a) : Number.isInteger(v.a) ? BigInt(v.a) : v.a") {
		t.Errorf("expected bigint restore `v.a = typeof v.a === 'string' ? (reBigWire.test(v.a) ? BigInt(v.a) : v.a) : Number.isInteger(v.a) ? BigInt(v.a) : v.a`; got:\n%s", out)
	}
	if !strings.Contains(out, "v.b = typeof v.b === \\'string\\' ? new Date(v.b) : v.b") {
		t.Errorf("expected date restore `v.b = typeof v.b === 'string' ? new Date(v.b) : v.b`; got:\n%s", out)
	}
}

// TestPrepareForJsonModule_MixedUnionWrapsEveryMember — for
// `string | {a:bigint}` the all-or-nothing wrap rule kicks in: an
// object branch is present, so the decoder must unconditionally
// unwrap, which forces the atomic string member to wrap too even
// though it's noop on both halves. Previously the per-member rule
// skipped the string wrap, but that left the decoder relying on a
// fragile shape gate to distinguish wrapped from raw values.
func TestPrepareForJsonModule_MixedUnionWrapsEveryMember(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	bigint := &reflection.RunType{ID: "big", Kind: reflection.KindBigInt}
	propA := &reflection.RunType{ID: "pa", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("big")}
	obj := &reflection.RunType{
		ID: "ob1", Kind: reflection.KindObjectLiteral,
		Children: []*reflection.RunType{makeRef("pa")},
	}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("str"), makeRef("ob1")},
		SafeUnionChildren: []*reflection.RunType{makeRef("str"), makeRef("ob1")},
	}
	dump := protocol.Dump{RunTypes: []*reflection.RunType{str, bigint, propA, obj, union}}
	out := renderModuleDefault(t, dump, "prepareForJsonMutate")

	// Object branch exists so string member MUST wrap too — every
	// encoded value must be unambiguously [idx, value] on the wire.
	if !strings.Contains(out, "v = [0, v]") {
		t.Errorf("string member must wrap as [0, v] when object branch coexists; got:\n%s", out)
	}
	// Object branch still uses the flat envelope.
	if !strings.Contains(out, "[-1, v]") {
		t.Errorf("expected `[-1, v]` envelope for object branch; got:\n%s", out)
	}
	// And the per-merged-prop transform must run on the object branch.
	if !strings.Contains(out, "v.a.toString()") {
		t.Errorf("expected bigint prep on merged prop a; got:\n%s", out)
	}
}

// TestPrepareForJsonModule_ConflictingPropSynthesizesSubUnion — when
// two object members share a property name with different JSON
// transforms ({a: bigint} | {a: Date}), the merged-prop encoder MUST
// emit an inline validate dispatch + `[subIdx, value]` wrap on `v.a` so
// the decoder can distinguish them.
func TestPrepareForJsonModule_ConflictingPropSynthesizesSubUnion(t *testing.T) {
	bigint := &reflection.RunType{ID: "big", Kind: reflection.KindBigInt}
	date := &reflection.RunType{ID: "dat", Kind: reflection.KindClass, SubKind: reflection.SubKindDate}
	propABig := &reflection.RunType{ID: "pab", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("big")}
	propADat := &reflection.RunType{ID: "pad", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("dat")}
	obj1 := &reflection.RunType{ID: "ob1", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pab")}}
	obj2 := &reflection.RunType{ID: "ob2", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pad")}}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("ob1"), makeRef("ob2")},
		SafeUnionChildren: []*reflection.RunType{makeRef("ob1"), makeRef("ob2")},
	}
	dump := protocol.Dump{RunTypes: []*reflection.RunType{bigint, date, propABig, propADat, obj1, obj2, union}}
	out := renderModuleDefault(t, dump, "prepareForJsonMutate")

	if !strings.Contains(out, "v.a = [0, v.a]") {
		t.Errorf("expected inline sub-union wrap `[0, v.a]` for conflicting prop; got:\n%s", out)
	}
	if !strings.Contains(out, "v.a = [1, v.a]") {
		t.Errorf("expected inline sub-union wrap `[1, v.a]` for conflicting prop; got:\n%s", out)
	}
	if !strings.Contains(out, "v.a.toString()") {
		t.Errorf("expected bigint candidate prep on v.a; got:\n%s", out)
	}
}
