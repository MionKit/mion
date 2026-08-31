package resolver_test

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/protocol"
	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// =========================================================================
// Union safe-order + discriminator pass — per-rule coverage.
//
// Algorithms ported from the reference implementation
// (ref: packages/run-types/src/nodes/collection/unionDiscriminator.ts).
// =========================================================================

// ---- safe-order: subset-related members get sorted by prop count -----------

func TestUnion_SubsetMember_SortedFirst_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type T = {a: string} | {a: string; b: number};
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	if tn.Kind != reflection.KindUnion {
		t.Fatalf("expected KindUnion, got kind=%d", tn.Kind)
	}
	if len(tn.SafeUnionChildren) != 2 {
		t.Fatalf("expected 2 safe-order entries, got %d", len(tn.SafeUnionChildren))
	}
	first := deref(dump(r), tn.SafeUnionChildren[0])
	if first == nil || len(propertyNames(dump(r), first)) != 2 {
		t.Fatalf("expected the 2-prop member first; got %v", first)
	}
}

func TestUnion_SubsetMember_SortedFirst_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type T = {a: string} | {a: string; b: number};
const v = null as unknown as T;
getRunTypeId(v);
`
	r, tn := resolveInline(t, code)
	if tn.Kind != reflection.KindUnion {
		t.Fatalf("expected KindUnion, got kind=%d", tn.Kind)
	}
	if len(tn.SafeUnionChildren) != 2 {
		t.Fatalf("expected 2 safe-order entries, got %d", len(tn.SafeUnionChildren))
	}
	first := deref(dump(r), tn.SafeUnionChildren[0])
	if first == nil || len(propertyNames(dump(r), first)) != 2 {
		t.Fatalf("expected the 2-prop member first; got %v", first)
	}
}

func TestUnion_DeepSubsetChain_OrderedByPropCount(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type T = {a: string} | {a: string; b: number} | {a: string; b: number; c: boolean};
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	if len(tn.SafeUnionChildren) != 3 {
		t.Fatalf("expected 3 safe-order entries, got %d", len(tn.SafeUnionChildren))
	}
	sizes := make([]int, 3)
	for i, ref := range tn.SafeUnionChildren {
		sizes[i] = len(propertyNames(dump(r), deref(dump(r), ref)))
	}
	if !(sizes[0] >= sizes[1] && sizes[1] >= sizes[2]) {
		t.Fatalf("expected descending property counts, got %v", sizes)
	}
	if sizes[0] != 3 || sizes[2] != 1 {
		t.Fatalf("expected sizes 3,2,1 in that order, got %v", sizes)
	}
}

// ---- safe-order: unrelated members keep declaration order ------------------

func TestUnion_UnrelatedObjects_KeepDeclarationOrder(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type T = {a: string} | {b: number};
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	if len(tn.SafeUnionChildren) != 2 {
		t.Fatalf("expected 2 safe-order entries, got %d", len(tn.SafeUnionChildren))
	}
	first := deref(dump(r), tn.SafeUnionChildren[0])
	second := deref(dump(r), tn.SafeUnionChildren[1])
	if !containsAll(propertyNames(dump(r), first), "a") {
		t.Fatalf("expected {a} first, got names %v", propertyNames(dump(r), first))
	}
	if !containsAll(propertyNames(dump(r), second), "b") {
		t.Fatalf("expected {b} second, got names %v", propertyNames(dump(r), second))
	}
}

// ---- safe-order: every child appears in safeUnionChildren -----------------

func TestUnion_EveryChildHasSafeUnionSlot(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type T = {a: string} | {a: string; b: number} | {x: boolean};
getRunTypeId<T>();
`
	_, tn := resolveInline(t, code)
	if len(tn.Children) != len(tn.SafeUnionChildren) {
		t.Fatalf("Children %d ≠ SafeUnionChildren %d", len(tn.Children), len(tn.SafeUnionChildren))
	}
	// Each child ref must appear exactly once in SafeUnionChildren.
	for _, ref := range tn.Children {
		count := 0
		for _, safeRef := range tn.SafeUnionChildren {
			if safeRef == ref {
				count++
			}
		}
		if count != 1 {
			t.Fatalf("ref %s appears %d times in SafeUnionChildren, want 1", ref.ID, count)
		}
	}
}

// ---- safe-order: any goes last ---------------------------------------------

func TestUnion_AnyMember_GoesLast(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type T = string | number | any;
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	// `string | number | any` collapses to `any` at the checker level, so we
	// may receive just KindAny. Otherwise the safe order must end in any.
	if tn.Kind == reflection.KindAny {
		return
	}
	if len(tn.SafeUnionChildren) == 0 {
		t.Fatalf("expected safe order entries")
	}
	last := deref(dump(r), tn.SafeUnionChildren[len(tn.SafeUnionChildren)-1])
	if last == nil || last.Kind != reflection.KindAny {
		t.Fatalf("expected last safe order entry to be any, got %+v", last)
	}
}

func TestUnion_UnknownMember_GoesLast(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type T = {a: string} | unknown;
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	// `T | unknown` may collapse to `unknown`. Accept either form.
	if tn.Kind == reflection.KindUnknown {
		return
	}
	if len(tn.SafeUnionChildren) == 0 {
		t.Fatalf("expected safe order entries")
	}
	last := deref(dump(r), tn.SafeUnionChildren[len(tn.SafeUnionChildren)-1])
	if last == nil || last.Kind != reflection.KindUnknown {
		t.Fatalf("expected last safe order entry to be unknown, got %+v", last)
	}
}

// ---- safe-order: multiple any get deduped (first kept) ---------------------

func TestUnion_MultipleAnyMembers_KeepsFirstOnly(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type T = string | any | any;
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	// TS collapses `X | any | any` to `any` — that's fine. Otherwise count
	// how many any/unknown entries appear in safe order.
	if tn.Kind == reflection.KindAny {
		return
	}
	anyCount := 0
	for _, ref := range tn.SafeUnionChildren {
		canonical := deref(dump(r), ref)
		if canonical != nil && (canonical.Kind == reflection.KindAny || canonical.Kind == reflection.KindUnknown) {
			anyCount++
		}
	}
	if anyCount > 1 {
		t.Fatalf("expected at most 1 any/unknown in safe order, got %d", anyCount)
	}
}

// ---- safe-order: bucket ordering simple → objects ------------------------

func TestUnion_SimpleAndObjects_BucketOrder(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type T = number | {a: string} | {a: string; b: number};
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	if tn.Kind != reflection.KindUnion {
		t.Fatalf("expected KindUnion, got %d", tn.Kind)
	}
	if len(tn.SafeUnionChildren) != 3 {
		t.Fatalf("expected 3 safe order entries, got %d", len(tn.SafeUnionChildren))
	}
	first := deref(dump(r), tn.SafeUnionChildren[0])
	if first == nil || first.Kind != reflection.KindNumber {
		t.Fatalf("expected simple-bucket (number) first, got %+v", first)
	}
	// Position 1: 2-prop object (more specific). Position 2: 1-prop object.
	mid := deref(dump(r), tn.SafeUnionChildren[1])
	last := deref(dump(r), tn.SafeUnionChildren[2])
	if mid == nil || last == nil {
		t.Fatalf("missing object members in safe order")
	}
	if len(propertyNames(dump(r), mid)) != 2 || len(propertyNames(dump(r), last)) != 1 {
		t.Fatalf("expected 2-prop then 1-prop after simple, got %d / %d",
			len(propertyNames(dump(r), mid)), len(propertyNames(dump(r), last)))
	}
}

// ---- safe-order: degenerate single-member union ---------------------------

func TestUnion_SingleMember_Degenerate(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type T = string | string;
getRunTypeId<T>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind == reflection.KindString {
		// TS deduplicates trivially-identical members to the bare primitive.
		return
	}
	if tn.Kind != reflection.KindUnion {
		t.Fatalf("expected KindUnion or KindString, got %d", tn.Kind)
	}
	if len(tn.Children) > 1 && len(tn.SafeUnionChildren) != len(tn.Children) {
		t.Fatalf("degenerate union safe-order must mirror children")
	}
}

// ---- safe-order: nested unions flatten via Distributed() ------------------

func TestUnion_NestedUnion_FlattenedByDistributed(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type AB = 'a' | 'b';
type T = AB | 'c';
getRunTypeId<T>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != reflection.KindUnion {
		t.Fatalf("expected KindUnion, got kind=%d", tn.Kind)
	}
	if len(tn.Children) != 3 {
		t.Fatalf("expected 3 flattened union members, got %d", len(tn.Children))
	}
	if len(tn.SafeUnionChildren) != 3 {
		t.Fatalf("expected 3 safe-order entries, got %d", len(tn.SafeUnionChildren))
	}
}

// ---- discriminator: shared-name kind literal --------------------------------

func TestUnionDiscriminator_NamedSharedField_LiteralKind(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type T = {kind: 'a'; x: number} | {kind: 'b'; y: string};
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	if len(tn.UnionDiscriminators) != len(tn.SafeUnionChildren) {
		t.Fatalf("UnionDiscriminators length %d, want %d", len(tn.UnionDiscriminators), len(tn.SafeUnionChildren))
	}
	// Both members are objects, so both slots must be populated and both
	// must point at a property named "kind".
	for i, disc := range tn.UnionDiscriminators {
		if disc == nil {
			t.Fatalf("slot %d: expected discriminator ref, got nil", i)
		}
		prop := deref(dump(r), disc)
		if prop == nil {
			t.Fatalf("slot %d: discriminator ref %s did not resolve", i, disc.ID)
		}
		if prop.Name != "kind" {
			t.Fatalf("slot %d: discriminator name = %q, want 'kind'", i, prop.Name)
		}
	}
}

// ---- discriminator: pick least-complex shared name --------------------------

func TestUnionDiscriminator_NamedShared_PicksLeastComplex(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type T = {k1: 'a'; k2: {nested: {deep: 1}}; x: number}
       | {k1: 'b'; k2: {nested: {deep: 2}}; y: string};
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	if len(tn.UnionDiscriminators) != len(tn.SafeUnionChildren) {
		t.Fatalf("UnionDiscriminators length mismatch")
	}
	for i, disc := range tn.UnionDiscriminators {
		if disc == nil {
			t.Fatalf("slot %d: expected discriminator ref, got nil", i)
		}
		prop := deref(dump(r), disc)
		if prop == nil || prop.Name != "k1" {
			t.Fatalf("slot %d: expected discriminator name 'k1' (least complex), got %q", i, prop.Name)
		}
	}
}

// ---- discriminator: no shared name → falls back to unique-prop -------------

func TestUnionDiscriminator_NoSharedName_UsesUniqueProp(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type T = {a: string} | {b: number};
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	if len(tn.UnionDiscriminators) != len(tn.SafeUnionChildren) {
		t.Fatalf("UnionDiscriminators length mismatch")
	}
	seen := map[string]bool{}
	for i, disc := range tn.UnionDiscriminators {
		if disc == nil {
			t.Fatalf("slot %d: expected discriminator ref, got nil", i)
		}
		prop := deref(dump(r), disc)
		if prop == nil {
			t.Fatalf("slot %d: discriminator did not resolve", i)
		}
		seen[prop.Name] = true
	}
	if !seen["a"] || !seen["b"] {
		t.Fatalf("expected unique-prop discriminators for both 'a' and 'b': seen=%v", seen)
	}
}

// ---- discriminator: shared name with same type doesn't qualify ------------

func TestUnionDiscriminator_SharedNonUniqueType_NotMarked(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type T = {kind: string; x: 1} | {kind: string; y: 2};
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	// shared-name pass must reject `kind` (same type-id across members).
	// The unique-prop pass should kick in and pick `x` / `y` instead.
	if len(tn.UnionDiscriminators) != len(tn.SafeUnionChildren) {
		t.Fatalf("UnionDiscriminators length mismatch")
	}
	for i, disc := range tn.UnionDiscriminators {
		if disc == nil {
			continue
		}
		prop := deref(dump(r), disc)
		if prop != nil && prop.Name == "kind" {
			t.Fatalf("slot %d: 'kind' incorrectly chosen as discriminator (same type-id across members)", i)
		}
	}
}

// ---- discriminator: no objects, no discriminator marks ---------------------

func TestUnionDiscriminator_NoObjects_NoDiscriminator(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type T = string | number;
getRunTypeId<T>();
`
	_, tn := resolveInline(t, code)
	// No object members → markDiscriminators short-circuits, slot empty.
	if len(tn.UnionDiscriminators) != 0 {
		t.Fatalf("primitive-only union should have empty UnionDiscriminators, got %d entries", len(tn.UnionDiscriminators))
	}
}

// ---- discriminator: single-prop members → unique prop wins -----------------

func TestUnionDiscriminator_SinglePropMembers_MarksUniqueProp(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type T = {a: 1} | {b: 2};
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	if len(tn.UnionDiscriminators) != len(tn.SafeUnionChildren) {
		t.Fatalf("UnionDiscriminators length mismatch")
	}
	seen := map[string]bool{}
	for _, disc := range tn.UnionDiscriminators {
		if disc == nil {
			continue
		}
		prop := deref(dump(r), disc)
		if prop != nil {
			seen[prop.Name] = true
		}
	}
	if !seen["a"] || !seen["b"] {
		t.Fatalf("expected unique-prop discriminators for both 'a' and 'b': seen=%v", seen)
	}
}

// ---- discriminator: per-union scoping (shared property must not bleed) ----

// Two unions reference a structurally-identical `kind: 'a'` property
// node. In union A, `kind` is a valid shared-name discriminator
// (literal types differ across members). In union B, both members
// carry `kind: 'a'` (identical type-id) so shared-name detection
// rejects it, AND each member has a uniquely-typed other property so
// the unique-prop pass picks those instead — `kind` should NOT appear
// as a discriminator in B. Before the refactor, UA's shared-name pass
// wrote IsUnionDiscriminator=true on the canonical kind:'a' property
// node, and that flag bled across to B's output. With the field
// scoped to the union, B's UnionDiscriminators is independent.
func TestUnion_DiscriminatorIsolation_SamePropInTwoUnions(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type UA = {kind: 'a'; n: number} | {kind: 'b'; n: number};
type UB = {kind: 'a'; aa: string} | {kind: 'a'; bb: number};
getRunTypeId<UA>();
getRunTypeId<UB>();
`
	r := setupInline(t, map[string]string{"iso.ts": code})
	scan := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"iso.ts"}})
	if scan.Error != "" {
		t.Fatalf("scanFiles: %s", scan.Error)
	}
	if len(scan.Sites) != 2 {
		t.Fatalf("expected 2 sites, got %d", len(scan.Sites))
	}
	types := dump(r)
	var ua, ub *reflection.RunType
	for _, site := range scan.Sites {
		root := typeByID(types, site.ID)
		if root == nil || root.Kind != reflection.KindUnion {
			continue
		}
		if ua == nil {
			ua = root
		} else {
			ub = root
		}
	}
	if ua == nil || ub == nil {
		t.Fatalf("missing one of the two unions")
	}
	// Union A: shared-name 'kind' qualifies → every object slot carries a
	// discriminator ref pointing at the `kind` property.
	uaKindDiscriminators := 0
	for _, disc := range ua.UnionDiscriminators {
		if disc == nil {
			continue
		}
		prop := deref(types, disc)
		if prop != nil && prop.Name == "kind" {
			uaKindDiscriminators++
		}
	}
	if uaKindDiscriminators != 2 {
		t.Fatalf("UA: expected both object members to carry 'kind' discriminator, got %d", uaKindDiscriminators)
	}
	// Union B: 'kind' is NOT present on every member (one member is `{x:string}`),
	// so shared-name detection must reject it. Whatever discriminator the
	// unique-prop fallback picks, it cannot be the 'kind' property.
	for i, disc := range ub.UnionDiscriminators {
		if disc == nil {
			continue
		}
		prop := deref(types, disc)
		if prop != nil && prop.Name == "kind" {
			t.Fatalf("UB slot %d: 'kind' incorrectly chosen as discriminator (would bleed from UA)", i)
		}
	}
}

// ---- discriminator: parallel-to-safeUnionChildren invariant ---------------

func TestUnion_UnionDiscriminatorsParallelToSafeUnionChildren(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type T = number | {kind: 'a'; x: 1} | {kind: 'b'; y: 2};
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	if len(tn.UnionDiscriminators) == 0 {
		t.Fatalf("expected populated UnionDiscriminators with two object members")
	}
	if len(tn.UnionDiscriminators) != len(tn.SafeUnionChildren) {
		t.Fatalf("length mismatch: discriminators=%d safeOrder=%d",
			len(tn.UnionDiscriminators), len(tn.SafeUnionChildren))
	}
	for i, safeRef := range tn.SafeUnionChildren {
		canonical := deref(dump(r), safeRef)
		if canonical == nil {
			continue
		}
		isObject := canonical.Kind == reflection.KindObjectLiteral || canonical.Kind == reflection.KindClass
		disc := tn.UnionDiscriminators[i]
		if isObject && disc == nil {
			t.Fatalf("slot %d: object member has no discriminator ref", i)
		}
		if !isObject && disc != nil {
			t.Fatalf("slot %d: non-object member %d unexpectedly carries discriminator ref", i, canonical.Kind)
		}
	}
}
