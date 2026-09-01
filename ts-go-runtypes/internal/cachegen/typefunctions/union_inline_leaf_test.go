package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// buildLeafAtomicUnionFixture builds a top-level union of two SIMPLE leaf
// atomic members — the exact case the inline-leaf optimization targets:
//
//	string | undefined
//
// Each member's validate emit is a single self-contained expression
// (`typeof v === 'string'`, `typeof v === 'undefined'`) with no context
// vars and no CompileChild recursion, so the union dispatch splices the
// check inline instead of importing the cross-family `val_<member>` cache
// entry. Returns the run-types and the union root id.
func buildLeafAtomicUnionFixture() ([]*reflection.RunType, string) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	und := &reflection.RunType{ID: "und", Kind: reflection.KindUndefined}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("str"), makeRef("und")},
		SafeUnionChildren: []*reflection.RunType{makeRef("str"), makeRef("und")},
	}
	return []*reflection.RunType{str, und, union}, "uni"
}

// buildBigIntDateLeafUnionFixture builds a top-level union of a bigint and a
// Date — both leaf-atomic, so both members inline. The Date member exercises
// the KindClass/SubKindDate inline arm (`v instanceof Date && !isNaN(...)`),
// which is emitted inside the union's `typeof v === 'object'` object guard.
//
//	bigint | Date
func buildBigIntDateLeafUnionFixture() ([]*reflection.RunType, string) {
	big := &reflection.RunType{ID: "big", Kind: reflection.KindBigInt}
	dat := &reflection.RunType{ID: "dat", Kind: reflection.KindClass, SubKind: reflection.SubKindDate}
	union := &reflection.RunType{
		ID: "un2", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("big"), makeRef("dat")},
		SafeUnionChildren: []*reflection.RunType{makeRef("big"), makeRef("dat")},
	}
	return []*reflection.RunType{big, dat, union}, "un2"
}

// assertLeafUnionInlined renders the given union fixture for one encoder
// family and asserts, in one pass, the full inline contract:
//   - every wantInline check appears in the emitted body, and
//   - NO member listed in inlinedIDs leaks a `val_<member>` cross-family
//     reference — neither a `?.fn(` call, a `utl.getRT('val_<member>')`
//     prologue, nor a CrossFamilyDeps edge.
func assertLeafUnionInlined(
	t *testing.T,
	fixture func() ([]*reflection.RunType, string),
	familyKey string,
	emitter Emitter,
	settings constants.CacheModuleSettings,
	wantInline []string,
	inlinedIDs []string,
) {
	t.Helper()
	runTypes, rootID := fixture()
	dump := protocol.Dump{RunTypes: runTypes}

	out := joinEntries(t, FamilyByKey(familyKey).Collect(dump, RenderOpts{EmitMode: "both"}, nil))

	for _, want := range wantInline {
		if !strings.Contains(out, want) {
			t.Errorf("%s: expected inline leaf check %q in dispatch; got:\n%s", familyKey, want, out)
		}
	}

	// No inlined member may fall back to the cross-family cache reference:
	// the `?.fn(` call, the getRT context-item prologue, and the
	// CrossFamilyDeps edge all key on `val_<member>`.
	for _, id := range inlinedIDs {
		key := valKey(id)
		if strings.Contains(out, key+"?.fn(") {
			t.Errorf("%s: inlined member %q must NOT emit a cross-family %q?.fn( call; got:\n%s", familyKey, id, key, out)
		}
		if strings.Contains(out, "utl.getRT('"+key+"')") {
			t.Errorf("%s: inlined member %q must NOT emit a getRT('%s') prologue; got:\n%s", familyKey, id, key, out)
		}
	}

	// The union root records ZERO CrossFamilyDeps for the inlined members
	// (the inline splice bypasses registerRTLookup entirely).
	refTable := buildRefTable(runTypes)
	rendered := renderEntryWithDeps(refTable[rootID], settings, emitter, innerPrefix(settings), refTable, RenderOpts{}, "", nil, false)
	for _, id := range inlinedIDs {
		key := valKey(id)
		if containsStr(rendered.crossFamilyDeps, key) {
			t.Errorf("%s: inlined member %q must NOT appear in CrossFamilyDeps %v", familyKey, id, rendered.crossFamilyDeps)
		}
	}

	// Determinism: a second render is byte-identical.
	again := joinEntries(t, FamilyByKey(familyKey).Collect(dump, RenderOpts{EmitMode: "both"}, nil))
	if again != out {
		t.Errorf("%s: module render is non-deterministic for the leaf-atomic union", familyKey)
	}
}

// TestUnionInlineLeaf_StringUndefined_PrepareForJson — a `string | undefined`
// union encoder inlines both member checks (`typeof v === 'string'`,
// `typeof v === 'undefined'`) into the JSON dispatch and emits no
// cross-family `val_<member>` plumbing for either.
func TestUnionInlineLeaf_StringUndefined_PrepareForJson(t *testing.T) {
	assertLeafUnionInlined(t,
		buildLeafAtomicUnionFixture,
		"prepareForJson", PrepareForJsonEmitter{}, constants.CacheModules["prepareForJson"],
		[]string{"typeof v === 'string'", "typeof v === 'undefined'"},
		[]string{"str", "und"},
	)
}

// TestUnionInlineLeaf_StringUndefined_ToBinary — same union, binary encoder:
// the inline checks gate the per-member tag writes; no cross-family edge.
func TestUnionInlineLeaf_StringUndefined_ToBinary(t *testing.T) {
	assertLeafUnionInlined(t,
		buildLeafAtomicUnionFixture,
		"toBinary", ToBinaryEmitter{}, constants.CacheModules["toBinary"],
		[]string{"typeof v === 'string'", "typeof v === 'undefined'"},
		[]string{"str", "und"},
	)
}

// TestUnionInlineLeaf_BigIntDate_PrepareForJson — the `bigint | Date` union
// inlines the bigint typeof AND the Date `instanceof` leaf check (the
// KindClass/SubKindDate arm), both without a cross-family reference.
func TestUnionInlineLeaf_BigIntDate_PrepareForJson(t *testing.T) {
	assertLeafUnionInlined(t,
		buildBigIntDateLeafUnionFixture,
		"prepareForJson", PrepareForJsonEmitter{}, constants.CacheModules["prepareForJson"],
		[]string{"typeof v === 'bigint'", "(v instanceof Date && !isNaN(v.getTime()))"},
		[]string{"big", "dat"},
	)
}

// TestUnionInlineLeaf_BigIntDate_ToBinary — same union, binary encoder.
func TestUnionInlineLeaf_BigIntDate_ToBinary(t *testing.T) {
	assertLeafUnionInlined(t,
		buildBigIntDateLeafUnionFixture,
		"toBinary", ToBinaryEmitter{}, constants.CacheModules["toBinary"],
		[]string{"typeof v === 'bigint'", "(v instanceof Date && !isNaN(v.getTime()))"},
		[]string{"big", "dat"},
	)
}

// TestUnionInlineLeaf_ObjectMembersStayCrossFamily pins the OTHER direction:
// the inline gate must not be over-broad. A union that discriminates a
// conflicting property whose candidates are OBJECTS (non-inlinable) keeps the
// genuine cross-family `val_<objMember>?.fn(` reference AND the
// CrossFamilyDeps edge for each candidate. Reuses the shared conflict-prop
// fixture ({ a: { n: bigint } } | { a: { s: string } }) whose inner object
// ids are `big` / `dat`.
func TestUnionInlineLeaf_ObjectMembersStayCrossFamily(t *testing.T) {
	for _, tc := range []struct {
		familyKey string
		emitter   Emitter
	}{
		{"prepareForJson", PrepareForJsonEmitter{}},
		{"toBinary", ToBinaryEmitter{}},
	} {
		runTypes, rootID := buildConflictPropUnionFixture()
		dump := protocol.Dump{RunTypes: runTypes}
		settings := constants.CacheModules[tc.familyKey]

		out := joinEntries(t, FamilyByKey(tc.familyKey).Collect(dump, RenderOpts{EmitMode: "both"}, nil))
		for _, id := range []string{"big", "dat"} {
			key := valKey(id)
			if !strings.Contains(out, key+"?.fn(") {
				t.Errorf("%s: object member %q MUST keep the cross-family %q?.fn( reference; got:\n%s", tc.familyKey, id, key, out)
			}
			if !strings.Contains(out, "utl.getRT('"+key+"')") {
				t.Errorf("%s: object member %q MUST keep the getRT('%s') prologue; got:\n%s", tc.familyKey, id, key, out)
			}
		}

		refTable := buildRefTable(runTypes)
		rendered := renderEntryWithDeps(refTable[rootID], settings, tc.emitter, innerPrefix(settings), refTable, RenderOpts{}, "", nil, false)
		for _, id := range []string{"big", "dat"} {
			key := valKey(id)
			if !containsStr(rendered.crossFamilyDeps, key) {
				t.Errorf("%s: object member %q MUST record a CrossFamilyDeps edge %q; got %v", tc.familyKey, id, key, rendered.crossFamilyDeps)
			}
		}
	}
}

// TestUnionInlineLeaf_FormatMemberStaysCrossFamily pins the format carve-out:
// a format-branded string member (FormatAnnotation set) is NOT inlinable — its
// validate hoists a regex / pure-fn context item — so the union MUST keep the
// cross-family `val_<uuid>?.fn(` reference and getRT prologue. Guards against
// the format check being silently dropped.
//
// Uses the binary encoder: `UUID | number` where number inlines
// (`Number.isFinite(v)`) but the branded uuid keeps its cross-family edge. The
// JSON encoder collapses this union (both members are prepareForJson-noop, so
// the root is elided), so the binary family is the natural place to pin it.
func TestUnionInlineLeaf_FormatMemberStaysCrossFamily(t *testing.T) {
	uuid := &reflection.RunType{ID: "uid", Kind: reflection.KindString, TypeName: "UUID", FormatAnnotation: &reflection.FormatAnnotation{Name: "uuid"}}
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	union := &reflection.RunType{
		ID: "unf", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("uid"), makeRef("num")},
		SafeUnionChildren: []*reflection.RunType{makeRef("uid"), makeRef("num")},
	}
	runTypes := []*reflection.RunType{uuid, num, union}
	dump := protocol.Dump{RunTypes: runTypes}
	settings := constants.CacheModules["toBinary"]

	out := joinEntries(t, FamilyByKey("toBinary").Collect(dump, RenderOpts{EmitMode: "both"}, nil))

	// The non-branded number member inlines.
	if !strings.Contains(out, "Number.isFinite(v)") {
		t.Errorf("expected the leaf number member to inline `Number.isFinite(v)`; got:\n%s", out)
	}
	// The format-branded uuid member keeps its cross-family reference + prologue.
	uidKey := valKey("uid")
	if !strings.Contains(out, uidKey+"?.fn(v)") {
		t.Errorf("format-branded member MUST keep the cross-family %q?.fn(v) reference; got:\n%s", uidKey, out)
	}
	if !strings.Contains(out, "utl.getRT('"+uidKey+"')") {
		t.Errorf("format-branded member MUST keep the getRT('%s') prologue; got:\n%s", uidKey, out)
	}

	refTable := buildRefTable(runTypes)
	rendered := renderEntryWithDeps(refTable["unf"], settings, ToBinaryEmitter{}, innerPrefix(settings), refTable, RenderOpts{}, "", nil, false)
	if !containsStr(rendered.crossFamilyDeps, uidKey) {
		t.Errorf("format-branded member MUST record a CrossFamilyDeps edge %q; got %v", uidKey, rendered.crossFamilyDeps)
	}
	// The inlined number member records NO cross-family edge.
	if containsStr(rendered.crossFamilyDeps, valKey("num")) {
		t.Errorf("inlined number member must NOT record a CrossFamilyDeps edge; got %v", rendered.crossFamilyDeps)
	}
}
