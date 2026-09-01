package typefunctions

import (
	"sort"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// valKey returns the validate cache key `<validate-fnHash>_<id>` the emitter now
// produces for a same-family / cross-family validate lookup. Slice 4 replaced the
// readable `val_` tag prefix with the opaque, version-isolated fnHash from the
// operation registry; tests derive the expected key through the same helper the
// emitter uses so they stay correct across binary versions.
func valKey(id string) string { return operations.PlainHash("validate") + "_" + id }

// itVariantKey returns the validate cache key for the ValidateOptions variant
// identified by `optionNames` — `<variant-fnHash>_<id>` (e.g. the noIsArrayCheck
// variant). Mirrors variantKey for the validate family without depending on the
// CacheModuleSettings plumbing.
func itVariantKey(optionNames []string, id string) string {
	itOp, _ := operations.ByName("validate")
	return operations.FnHashFor(itOp, optionNames, "", false) + "_" + id
}

// buildRefTable indexes every RunType by id so renderEntryWithDeps and the
// walker can deref the KindRef child slots (the wire form every composite
// uses — see internal/reflection). Mirrors the per-request table RenderFnModule
// builds.
func buildRefTable(runTypes []*reflection.RunType) map[string]*reflection.RunType {
	table := make(map[string]*reflection.RunType, len(runTypes))
	for _, rt := range runTypes {
		if rt == nil || rt.ID == "" {
			continue
		}
		table[rt.ID] = rt
	}
	return table
}

func containsStr(haystack []string, needle string) bool {
	for _, s := range haystack {
		if s == needle {
			return true
		}
	}
	return false
}

// buildConflictPropUnionFixture builds a union of two objectLiteral members
// that share a property name with different (conflicting) value types. The
// conflicting values are themselves OBJECTS so the discriminator survives as a
// genuine cross-family validate lookup (leaf-atomic members are now inlined
// directly into the union dispatch, emitting no `val_<member>` edge). At least
// one candidate carries a non-JSON-natural field (`n: bigint`) so the
// merged-prop sub-dispatch is NOT collapsed by the all-noop rule and actually
// emits the per-candidate validate discrimination:
//
//	{ a: { n: bigint } }  |  { a: { s: string } }
//
// The encoder discriminates the conflicting `a` slot at runtime via the
// validate validators of the two candidate OBJECT types — emitting
// `val_<inner1ID>` / `val_<inner2ID>` cross-family lookups (a synthesized
// sub-union over the property). This is the union shape that exercises the
// cross-family `registerRTLookup("val_<member>")` path in BOTH the
// prepareForJson and toBinary encoders (a clean discriminated union of plain
// objects instead merges into a single `[-1, v]` branch and emits no
// per-member dispatch on the JSON side). Returns the run-types and the union
// root id. Ids `big`/`dat` are retained as the two inner-object ids so the
// dependent structural-lookup seeds stay stable across the fixture change.
func buildConflictPropUnionFixture() ([]*reflection.RunType, string) {
	bigint := &reflection.RunType{ID: "bin", Kind: reflection.KindBigInt}
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	// Inner-object property signatures (`n: bigint`, `s: string`). The bigint
	// field makes the first candidate's prepareForJson non-noop, forcing the
	// merged-prop dispatch to keep its per-candidate validate discrimination.
	innerPropN := &reflection.RunType{ID: "ipn", Kind: reflection.KindPropertySignature, Name: "n", IsSafeName: true, Child: makeRef("bin")}
	innerPropS := &reflection.RunType{ID: "ips", Kind: reflection.KindPropertySignature, Name: "s", IsSafeName: true, Child: makeRef("str")}
	// The two conflicting OBJECT candidates for prop `a` (kept under the ids
	// `big`/`dat` so the cross-family edges are val_big / val_dat as before).
	innerN := &reflection.RunType{ID: "big", Kind: reflection.KindObjectLiteral, TypeName: "InnerN", Children: []*reflection.RunType{makeRef("ipn")}}
	innerS := &reflection.RunType{ID: "dat", Kind: reflection.KindObjectLiteral, TypeName: "InnerS", Children: []*reflection.RunType{makeRef("ips")}}
	propABig := &reflection.RunType{ID: "pab", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("big")}
	propADat := &reflection.RunType{ID: "pad", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("dat")}
	obj1 := &reflection.RunType{ID: "ob1", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pab")}}
	obj2 := &reflection.RunType{ID: "ob2", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pad")}}
	union := &reflection.RunType{
		ID:                "uni",
		Kind:              reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("ob1"), makeRef("ob2")},
		SafeUnionChildren: []*reflection.RunType{makeRef("ob1"), makeRef("ob2")},
	}
	return []*reflection.RunType{bigint, str, innerPropN, innerPropS, innerN, innerS, propABig, propADat, obj1, obj2, union}, "uni"
}

// assertUnionCrossFamily renders the union root for the given encoder family
// and asserts the cross-family discrimination edges land in CrossFamilyDeps
// (not RTDependencies). The discriminated `a` slot resolves to the two
// candidate validate validators `val_big` / `val_dat`.
func assertUnionCrossFamily(t *testing.T, emitter Emitter, settings constants.CacheModuleSettings) {
	t.Helper()
	runTypes, rootID := buildConflictPropUnionFixture()
	refTable := buildRefTable(runTypes)
	prefix := innerPrefix(settings)

	rendered := renderEntryWithDeps(refTable[rootID], settings, emitter, prefix, refTable, RenderOpts{}, "", nil, false)
	if rendered.argsText == "" {
		t.Fatalf("%T: expected a non-empty entry line for the conflict-prop union", emitter)
	}

	for _, want := range []string{valKey("big"), valKey("dat")} {
		if !containsStr(rendered.crossFamilyDeps, want) {
			t.Errorf("%T: CrossFamilyDeps %v missing cross-family edge %q", emitter, rendered.crossFamilyDeps, want)
		}
		// Cross-family edges MUST stay out of the same-family dependency
		// list — the dangling-dep cascade keys on RTDependencies and would
		// wrongly drop this entry if an `val_*` (foreign-family) hash leaked
		// in.
		if containsStr(rendered.deps, want) {
			t.Errorf("%T: cross-family edge %q must NOT appear in RTDependencies %v", emitter, want, rendered.deps)
		}
	}
}

// TestCrossFamilyDeps_UnionPrepareForJson — the prepareForJson encoder for a
// union whose members discriminate a conflicting property at runtime records
// the `val_<candidate>` lookups as cross-family edges, separate from the
// (empty here) same-family RTDependencies.
func TestCrossFamilyDeps_UnionPrepareForJson(t *testing.T) {
	assertUnionCrossFamily(t, PrepareForJsonEmitter{}, constants.CacheModules["prepareForJson"])
}

// TestCrossFamilyDeps_UnionToBinary — same as the prepareForJson sibling but
// for the toBinary encoder, which also discriminates the conflicting slot via
// the candidate validate validators.
func TestCrossFamilyDeps_UnionToBinary(t *testing.T) {
	assertUnionCrossFamily(t, ToBinaryEmitter{}, constants.CacheModules["toBinary"])
}

// TestCrossFamilyDeps_ValidateSameFamilyOnly — a plain object with a nested
// object property compiles the nested child as a same-family dependency call
// (`val_<child>` funnelled through registerRTLookup by emitDepCall). Because
// the lookup's prefix matches the walker's own InnerPrefix it is recorded in
// RTDependencies, NOT CrossFamilyDeps. This pins the no-regression guarantee
// for the same-family path: registerRTLookup's prefix gate keeps same-family
// edges out of the cross-family list.
func TestCrossFamilyDeps_ValidateSameFamilyOnly(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	innerProp := &reflection.RunType{ID: "ip", Kind: reflection.KindPropertySignature, Name: "n", IsSafeName: true, Child: makeRef("num")}
	// Named, so the default name rule keeps it an external same-family dep
	// (unnamed objects inline since the inlining flip).
	inner := &reflection.RunType{ID: "inner", Kind: reflection.KindObjectLiteral, TypeName: "Inner", Children: []*reflection.RunType{makeRef("ip")}}
	outerPropA := &reflection.RunType{ID: "opa", Kind: reflection.KindPropertySignature, Name: "a", IsSafeName: true, Child: makeRef("str")}
	outerPropB := &reflection.RunType{ID: "opb", Kind: reflection.KindPropertySignature, Name: "b", IsSafeName: true, Child: makeRef("inner")}
	outer := &reflection.RunType{ID: "outer", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("opa"), makeRef("opb")}}

	runTypes := []*reflection.RunType{str, num, innerProp, inner, outerPropA, outerPropB, outer}
	refTable := buildRefTable(runTypes)
	settings := constants.CacheModules["validate"]
	prefix := innerPrefix(settings)

	rendered := renderEntryWithDeps(refTable["outer"], settings, ValidateEmitter{}, prefix, refTable, RenderOpts{}, "", nil, false)
	if rendered.argsText == "" {
		t.Fatal("expected a non-empty validate entry line for the nested-object fixture")
	}
	if !containsStr(rendered.deps, valKey("inner")) {
		t.Errorf("expected same-family child dep %q in RTDependencies, got %v", valKey("inner"), rendered.deps)
	}
	if len(rendered.crossFamilyDeps) != 0 {
		t.Errorf("same-family-only validate entry must have empty CrossFamilyDeps, got %v", rendered.crossFamilyDeps)
	}
}

// TestCrossFamilyDeps_CaptureIsByteIdentical — capturing cross-family edges
// must not perturb the emitted module bytes. Renders the conflict-prop union's
// prepareForJson module and asserts the validator body (with the `val_big` /
// `val_dat` dispatch) is present byte-for-byte; capture is a pure side-channel
// on the walker, so the spliced `init(…)` output is unchanged.
func TestCrossFamilyDeps_CaptureIsByteIdentical(t *testing.T) {
	runTypes, _ := buildConflictPropUnionFixture()
	dump := protocol.Dump{RunTypes: runTypes}

	out := joinEntries(t, FamilyByKey("prepareForJson").Collect(dump, RenderOpts{EmitMode: "both"}, nil))

	// The exact validator body the union root emits — unchanged by the
	// cross-family capture. Sub-union dispatch over the conflicting `a` slot
	// uses the candidate validate lookups; the first candidate's own
	// prepareForJson (a same-family `pj_big.fn` dep, non-noop because its inner
	// `n` field is a bigint) transforms the surviving value. Keys are the opaque
	// per-family fnHashes (prepareForJson for the root + same-family child,
	// validate for the discriminator lookups).
	pjUni := operations.PlainHash("prepareForJson") + "_uni"
	pjBig := operations.PlainHash("prepareForJson") + "_big"
	itBig := valKey("big")
	itDat := valKey("dat")
	wantBody := "function " + pjUni + "(v){if (typeof v === 'object' && v !== null) " +
		"{if ((typeof v.a === 'object' && v.a !== null && (" + itBig + "?.fn(v.a) ?? true))) " +
		"{v.a = " + pjBig + ".fn(v.a);v.a = [0, v.a]} " +
		"else if ((typeof v.a === 'object' && v.a !== null && (" + itDat + "?.fn(v.a) ?? true))) " +
		"{v.a = [1, v.a]};v = [-1, v]} else { throw new Error(fuEncErr) } return v}"
	if !strings.Contains(out, wantBody) {
		t.Errorf("expected the union validator body unchanged after capture:\nwant substring:\n%s\ngot module:\n%s", wantBody, out)
	}

	// The cross-family lookups appear in the closure prologue as getRT
	// context-item declarations exactly as before (the registration the
	// capture piggy-backs on).
	for _, want := range []string{"const " + itBig + " = utl.getRT('" + itBig + "')", "const " + itDat + " = utl.getRT('" + itDat + "')"} {
		if !strings.Contains(out, want) {
			t.Errorf("expected getRT prologue %q in rendered module:\n%s", want, out)
		}
	}

	// Determinism: a second render produces byte-identical output.
	again := joinEntries(t, FamilyByKey("prepareForJson").Collect(dump, RenderOpts{EmitMode: "both"}, nil))
	if again != out {
		t.Error("module render is non-deterministic after cross-family capture")
	}
}

// TestRecordCrossFamilyDep_DedupAndPrefixGate exercises the recorder directly:
// it dedups, drops same-family (prefix-matching) ids, and no-ops when the
// walker has no InnerPrefix set (hand-constructed walkers in unit tests).
func TestRecordCrossFamilyDep_DedupAndPrefixGate(t *testing.T) {
	rt := &reflection.RunType{Kind: reflection.KindString, ID: "root"}
	w := NewWalker(rt, "pj_root", PrepareForJsonEmitter{})
	w.InnerPrefix = "pj_"

	// Same-family (matches InnerPrefix) — ignored.
	w.recordCrossFamilyDep("pj_child")
	// Cross-family — recorded, and deduped on repeat.
	w.recordCrossFamilyDep("val_a")
	w.recordCrossFamilyDep("val_a")
	w.recordCrossFamilyDep("tb_b")

	got := append([]string(nil), w.CrossFamilyDeps...)
	sort.Strings(got)
	want := []string{"tb_b", "val_a"} // sorted: tb_ < val_
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("expected cross-family deps %v, got %v", want, w.CrossFamilyDeps)
	}

	// No InnerPrefix set ⇒ records nothing (everything looks same-family-ish
	// / unknowable, so the recorder stays conservative).
	noPrefix := NewWalker(rt, "pj_root", PrepareForJsonEmitter{})
	noPrefix.recordCrossFamilyDep("val_a")
	if len(noPrefix.CrossFamilyDeps) != 0 {
		t.Fatalf("expected no captures when InnerPrefix is empty, got %v", noPrefix.CrossFamilyDeps)
	}
}
