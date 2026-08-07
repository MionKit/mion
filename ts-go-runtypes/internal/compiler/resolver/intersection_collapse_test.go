package resolver_test

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// =========================================================================
// Intersection collapse — per-rule coverage.
//
// Rules and goals are documented in
// /root/.claude/plans/intersection-zesty-spindle.md §E.1 and the collapse
// table in §Reference algorithms. Each test asserts a single rule.
// Paired *_Static / *_Reflect tests follow the marker coverage rule
// (CLAUDE.md): static form via getRunTypeId<T>() vs reflection via
// getRunTypeId(v).
// =========================================================================

// ---- two-object-literal merge ------------------------------------------------

func TestIntersection_TwoObjectLiterals_Merges_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
type AB = {a: string} & {b: number};
getRunTypeId<AB>();
`
	r, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindObjectLiteral {
		t.Fatalf("expected KindObjectLiteral (object×object merged), got kind=%d", tn.Kind)
	}
	if got := propertyNames(dump(r), tn); !containsAll(got, "a", "b") {
		t.Fatalf("expected merged props [a, b], got %v", got)
	}
}

func TestIntersection_TwoObjectLiterals_Merges_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
type AB = {a: string} & {b: number};
const v = null as unknown as AB;
getRunTypeId(v);
`
	r, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindObjectLiteral {
		t.Fatalf("expected KindObjectLiteral, got kind=%d", tn.Kind)
	}
	if got := propertyNames(dump(r), tn); !containsAll(got, "a", "b") {
		t.Fatalf("expected merged props [a, b], got %v", got)
	}
}

// ---- interface × object literal merge ---------------------------------------

func TestIntersection_ObjectAndInterface_Merges(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
interface I {a: string}
type AB = I & {b: number};
getRunTypeId<AB>();
`
	r, tn := resolveInline(t, code)
	// Interfaces with no class flag are object literals per the reference semantics.
	if tn.Kind != protocol.KindObjectLiteral {
		t.Fatalf("expected object-like, got kind=%d", tn.Kind)
	}
	if got := propertyNames(dump(r), tn); !containsAll(got, "a", "b") {
		t.Fatalf("expected merged props [a, b], got %v", got)
	}
}

// ---- class × object literal merge -------------------------------------------

func TestIntersection_ClassAndObjectLiteral_Merges(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
class C { x: string = ''; }
type T = C & {y: number};
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindObjectLiteral && tn.Kind != protocol.KindClass {
		t.Fatalf("expected object-like (literal or class), got kind=%d", tn.Kind)
	}
	if got := propertyNames(dump(r), tn); !containsAll(got, "x", "y") {
		t.Fatalf("expected merged props [x, y], got %v", got)
	}
}

// ---- primitive × brand (single brand) ---------------------------------------

func TestIntersection_PrimitiveAndBrand_PreservesPrimitive_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
type Email = string & {readonly __brand: 'Email'};
getRunTypeId<Email>();
`
	r, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindString {
		t.Fatalf("expected KindString for branded string, got kind=%d", tn.Kind)
	}
	if len(tn.TypeMeta) != 1 {
		t.Fatalf("expected exactly 1 decorator, got %d", len(tn.TypeMeta))
	}
	dec := deref(dump(r), tn.TypeMeta[0])
	if dec == nil || dec.Kind != protocol.KindObjectLiteral {
		t.Fatalf("expected decorator to be an objectLiteral, got %+v", dec)
	}
}

func TestIntersection_PrimitiveAndBrand_PreservesPrimitive_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
type Email = string & {readonly __brand: 'Email'};
const v = null as unknown as Email;
getRunTypeId(v);
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindString {
		t.Fatalf("expected KindString, got kind=%d", tn.Kind)
	}
	if len(tn.TypeMeta) != 1 {
		t.Fatalf("expected exactly 1 decorator, got %d", len(tn.TypeMeta))
	}
}

// ---- primitive × multiple brands --------------------------------------------

func TestIntersection_PrimitiveAndMultipleBrands_AllStored(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
type Tagged = string & {readonly __a: 1} & {readonly __b: 2};
getRunTypeId<Tagged>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindString {
		t.Fatalf("expected KindString, got kind=%d", tn.Kind)
	}
	if len(tn.TypeMeta) != 2 {
		t.Fatalf("expected exactly 2 decorators, got %d", len(tn.TypeMeta))
	}
}

// ---- number × brand ---------------------------------------------------------

func TestIntersection_NumberAndBrand_PreservesNumber(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
type UserId = number & {readonly __nominal: 'Id'};
getRunTypeId<UserId>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindNumber {
		t.Fatalf("expected KindNumber, got kind=%d", tn.Kind)
	}
	if len(tn.TypeMeta) != 1 {
		t.Fatalf("expected 1 decorator, got %d", len(tn.TypeMeta))
	}
}

// ---- primitive × literal (compatible) ---------------------------------------
// TS already collapses `string & "hello"` to the literal at the checker
// level; our test asserts the post-checker behaviour (literal wins).

func TestIntersection_PrimitiveAndLiteralExtends_KeepsLiteral(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
type T = string & 'hello';
getRunTypeId<T>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindLiteral {
		t.Fatalf("expected KindLiteral (literal narrowed primitive), got kind=%d", tn.Kind)
	}
	if value, _ := tn.Literal.(string); value != "hello" {
		t.Fatalf("expected literal value %q, got %v", "hello", tn.Literal)
	}
}

// ---- primitive × literal of wrong base -------------------------------------
// `string & 1` → TS collapses this to never at the checker layer.

func TestIntersection_PrimitiveAndLiteralWrongBase_Never(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
type T = string & 1;
getRunTypeId<T>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindNever {
		t.Fatalf("expected KindNever for incompatible primitive & literal, got kind=%d", tn.Kind)
	}
}

// ---- two different primitives -----------------------------------------------

func TestIntersection_TwoDifferentPrimitives_Never(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
type T = string & number;
getRunTypeId<T>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindNever {
		t.Fatalf("expected KindNever, got kind=%d", tn.Kind)
	}
}

// ---- two incompatible literals ----------------------------------------------

func TestIntersection_TwoIncompatibleLiterals_Never(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
type T = 1 & 2;
getRunTypeId<T>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindNever {
		t.Fatalf("expected KindNever, got kind=%d", tn.Kind)
	}
}

// ---- intersection containing never -----------------------------------------

func TestIntersection_WithNeverMember_Never(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
type T = never & {x: 1};
getRunTypeId<T>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindNever {
		t.Fatalf("expected KindNever, got kind=%d", tn.Kind)
	}
}

// ---- distribution over union ------------------------------------------------
// `("a"|"b") & string` → distributes through and reduces to `"a" | "b"`.

func TestIntersection_DistributesOverUnion(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
type T = ('a' | 'b') & string;
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindUnion {
		t.Fatalf("expected KindUnion after distribution, got kind=%d", tn.Kind)
	}
	literals := literalValues(dump(r), tn)
	if !containsAll(literals, "a", "b") {
		t.Fatalf("expected union of literals \"a\",\"b\", got %v", literals)
	}
}

// ---- distribution with all-never branches ----------------------------------
// `("a"|"b") & number` → both branches are never, so reduces to never.

func TestIntersection_DistributeAllNever_ReducesToNever(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
type T = ('a' | 'b') & number;
getRunTypeId<T>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindNever {
		t.Fatalf("expected KindNever, got kind=%d", tn.Kind)
	}
}

// ---- distribution that filters never ---------------------------------------
// `("a"|1) & string` → only the "a" branch survives.

func TestIntersection_DistributeMixed_FiltersNever(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
type T = ('a' | 1) & string;
getRunTypeId<T>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindLiteral {
		t.Fatalf("expected single surviving literal, got kind=%d", tn.Kind)
	}
	if value, _ := tn.Literal.(string); value != "a" {
		t.Fatalf("expected literal \"a\", got %v", tn.Literal)
	}
}

// ---- any/unknown identity --------------------------------------------------
// `any & T` and `unknown & T` are identity: T survives unchanged.

func TestIntersection_AnyAndT_KeepsT(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
type T = any & {x: 1};
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	// `any & X` actually resolves to `any` in TS, but our collapse
	// preserves the object side. Accept either: if any, no decorators
	// (Kind=any); if object literal, x must be present.
	switch tn.Kind {
	case protocol.KindAny:
		// TS-side collapsed: nothing for us to do.
	case protocol.KindObjectLiteral:
		if names := propertyNames(dump(r), tn); !containsAll(names, "x") {
			t.Fatalf("expected prop x, got %v", names)
		}
	default:
		t.Fatalf("expected KindAny or KindObjectLiteral, got kind=%d", tn.Kind)
	}
}

func TestIntersection_UnknownAndT_KeepsT(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
type T = unknown & string;
getRunTypeId<T>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindString {
		t.Fatalf("expected KindString (unknown collapses), got kind=%d", tn.Kind)
	}
}

// ---- commutativity ---------------------------------------------------------

func TestIntersection_Commutativity_ObjectObject(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
type A = {a: string};
type B = {b: number};
type AB = A & B;
type BA = B & A;
getRunTypeId<AB>();
getRunTypeId<BA>();
`
	r := setupInline(t, map[string]string{"test.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"test.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if len(resp.Sites) != 2 {
		t.Fatalf("expected 2 call sites, got %d", len(resp.Sites))
	}
	if resp.Sites[0].ID != resp.Sites[1].ID {
		t.Fatalf("A&B and B&A must share an id; got %q vs %q", resp.Sites[0].ID, resp.Sites[1].ID)
	}
}

func TestIntersection_Commutativity_PrimitiveBrand(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
type B = {readonly __brand: 'Email'};
type SB = string & B;
type BS = B & string;
getRunTypeId<SB>();
getRunTypeId<BS>();
`
	r := setupInline(t, map[string]string{"test.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"test.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if len(resp.Sites) != 2 {
		t.Fatalf("expected 2 call sites, got %d", len(resp.Sites))
	}
	if resp.Sites[0].ID != resp.Sites[1].ID {
		t.Fatalf("string&B and B&string must share an id; got %q vs %q", resp.Sites[0].ID, resp.Sites[1].ID)
	}
}

func TestIntersection_Associativity_Triple(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
type A = {a: string};
type B = {b: number};
type C = {c: boolean};
type Left  = (A & B) & C;
type Right = A & (B & C);
getRunTypeId<Left>();
getRunTypeId<Right>();
`
	r := setupInline(t, map[string]string{"test.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"test.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if len(resp.Sites) != 2 {
		t.Fatalf("expected 2 call sites, got %d", len(resp.Sites))
	}
	if resp.Sites[0].ID != resp.Sites[1].ID {
		t.Fatalf("(A&B)&C and A&(B&C) must share an id; got %q vs %q", resp.Sites[0].ID, resp.Sites[1].ID)
	}
}

// ---- wire-format invariant: KindIntersection must never reach the dump ----

func TestIntersection_NeverEmitsKindIntersection(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
type A = {a: string} & {b: number};
type B = string & {readonly __brand: 'Email'};
type C = string & number;
type D = ('a' | 'b') & string;
getRunTypeId<A>();
getRunTypeId<B>();
getRunTypeId<C>();
getRunTypeId<D>();
`
	r := setupInline(t, map[string]string{"test.ts": code})
	r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"test.ts"}})
	for _, node := range dump(r) {
		if node.Kind == protocol.KindIntersection {
			t.Fatalf("node %q has KindIntersection — collapse should have removed it", node.ID)
		}
	}
}

// =========================================================================
// helpers
// =========================================================================

// propertyNames returns the names of the property-like children of an
// object-like RunType, dereferencing each child ref.
func propertyNames(types []*protocol.RunType, parent *protocol.RunType) []string {
	out := make([]string, 0, len(parent.Children))
	for _, ref := range parent.Children {
		member := deref(types, ref)
		if member == nil {
			continue
		}
		if member.Kind == protocol.KindProperty || member.Kind == protocol.KindPropertySignature {
			out = append(out, member.Name)
		}
	}
	return out
}

// literalValues returns the literal values of a union of literals.
func literalValues(types []*protocol.RunType, parent *protocol.RunType) []any {
	out := make([]any, 0, len(parent.Children))
	for _, ref := range parent.Children {
		member := deref(types, ref)
		if member == nil {
			continue
		}
		if member.Kind == protocol.KindLiteral {
			out = append(out, member.Literal)
		}
	}
	return out
}

func containsAll[T comparable](haystack []T, needles ...T) bool {
	for _, needle := range needles {
		found := false
		for _, hit := range haystack {
			if hit == needle {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}

// ---- stacked propertyNames sentinels — append semantics ----------------------
// Two `__rtPropNames` constituents must BOTH survive the collapse (the id fold
// always appended them into the sorted `pn{…}` key; the serialize side used to
// overwrite, enforcing only the last-lifted arm — id ≠ behavior).

func TestIntersection_StackedPropNames_AppendsBoth_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
type T = Record<string, unknown> & {readonly __rtPropNames?: 'a' | 'b'} & {readonly __rtPropNames?: 'a' | 'c'};
getRunTypeId<T>();
`
	_, tn := resolveInline(t, code)
	if len(tn.PropNames) != 2 {
		t.Fatalf("expected 2 propNames children appended, got %d", len(tn.PropNames))
	}
}

func TestIntersection_StackedPropNames_AppendsBoth_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
type T = Record<string, unknown> & {readonly __rtPropNames?: 'a' | 'b'} & {readonly __rtPropNames?: 'a' | 'c'};
const v = null as unknown as T;
getRunTypeId(v);
`
	_, tn := resolveInline(t, code)
	if len(tn.PropNames) != 2 {
		t.Fatalf("expected 2 propNames children appended, got %d", len(tn.PropNames))
	}
}

func TestIntersection_StackedPropNames_Commutes(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
type PN1 = {readonly __rtPropNames?: 'a' | 'b'};
type PN2 = {readonly __rtPropNames?: 'a' | 'c'};
type AB = Record<string, unknown> & PN1 & PN2;
type BA = Record<string, unknown> & PN2 & PN1;
getRunTypeId<AB>();
getRunTypeId<BA>();
`
	r := setupInline(t, map[string]string{"test.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"test.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if len(resp.Sites) != 2 {
		t.Fatalf("expected 2 call sites, got %d", len(resp.Sites))
	}
	if resp.Sites[0].ID != resp.Sites[1].ID {
		t.Fatalf("stacked propNames must fold order-free; got %q vs %q", resp.Sites[0].ID, resp.Sites[1].ID)
	}
}
