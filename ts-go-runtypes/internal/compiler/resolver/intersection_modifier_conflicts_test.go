package resolver_test

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// =========================================================================
// Intersection × property modifier conflicts.
//
// TypeScript's intersection collapse follows clear rules when the two
// sides disagree about a property's modifiers:
//   - optional & required → required
//   - readonly & writable → readonly (most-restrictive wins)
//   - conflicting property types → narrowing (last-wins-when-narrower)
//     or `never` (incompatible)
//
// The TS checker applies these rules when we call GetPropertiesOfType
// on an intersection. PR #15 wires intersections through projectObjectLiteral
// so the merged property set we surface IS the resolved view. These tests
// pin the behaviour to the wire format so any regression in checker
// behaviour OR in our serialize path surfaces immediately.
// =========================================================================

// ---- optional vs required --------------------------------------------------

func TestIntersection_OptionalAndRequired_RequiredWins(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type T = {a?: string} & {a: string};
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	a := findProp(dump(r), tn, "a")
	if a == nil {
		t.Fatalf("missing prop a")
	}
	if a.Optional {
		t.Fatalf("expected a to be required (required-wins-over-optional), got optional=true")
	}
}

func TestIntersection_BothOptional_StaysOptional(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type T = {a?: string} & {a?: string};
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	a := findProp(dump(r), tn, "a")
	if a == nil || !a.Optional {
		t.Fatalf("expected a to stay optional, got %+v", a)
	}
}

func TestIntersection_BothRequired_StaysRequired(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type T = {a: string} & {a: string};
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	a := findProp(dump(r), tn, "a")
	if a == nil {
		t.Fatalf("missing prop a")
	}
	if a.Optional {
		t.Fatalf("expected a to stay required, got optional=true")
	}
}

// ---- readonly vs writable --------------------------------------------------
//
// TS's actual intersection rule for readonly is "writable wins" — opposite
// of optional/required. Per tsgo
// internal/checker/checker.go:21057-21060: for an intersection, if ANY
// constituent prop is NOT readonly, the merged prop is NOT readonly.

func TestIntersection_ReadonlyAndWritable_WritableWins(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type T = {readonly a: string} & {a: string};
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	a := findProp(dump(r), tn, "a")
	if a == nil {
		t.Fatalf("missing prop a")
	}
	if a.Readonly {
		t.Fatalf("expected a to be writable (TS intersection: writable wins over readonly), got readonly=true")
	}
}

func TestIntersection_BothReadonly_StaysReadonly(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type T = {readonly a: string} & {readonly a: string};
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	a := findProp(dump(r), tn, "a")
	if a == nil || !a.Readonly {
		t.Fatalf("expected a to stay readonly, got %+v", a)
	}
}

// ---- optional+readonly mix -------------------------------------------------
//
// Two-axis check: required vs optional uses "required wins"; readonly vs
// writable uses "writable wins". For `{readonly a?:string} & {a:string}`
// → required + writable.

func TestIntersection_OptionalReadonlyMix(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type T = {readonly a?: string} & {a: string};
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	a := findProp(dump(r), tn, "a")
	if a == nil {
		t.Fatalf("missing prop a")
	}
	if a.Optional {
		t.Fatalf("expected a to be required (required side wins), got optional=true")
	}
	if a.Readonly {
		t.Fatalf("expected a to be writable (writable side wins per TS intersection rule), got readonly=true")
	}
}

// ---- conflicting property types -------------------------------------------

func TestIntersection_ConflictingPropertyTypes_Narrows(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type T = {a: string} & {a: 'x'};
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	a := findProp(dump(r), tn, "a")
	if a == nil {
		t.Fatalf("missing prop a")
	}
	child := deref(dump(r), a.Child)
	if child == nil || child.Kind != reflection.KindLiteral {
		t.Fatalf("expected a's type to narrow to literal 'x', got %+v", child)
	}
	if literal, _ := child.Literal.(string); literal != "x" {
		t.Fatalf("expected literal 'x', got %v", child.Literal)
	}
}

func TestIntersection_IncompatiblePropertyTypes_NeverProp(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type T = {a: string} & {a: number};
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	a := findProp(dump(r), tn, "a")
	if a == nil {
		t.Fatalf("missing prop a")
	}
	child := deref(dump(r), a.Child)
	if child == nil {
		t.Fatalf("a.Child is nil")
	}
	// TS resolves `string & number` on a property to `never`, making
	// the property exist but uninhabitable. The wire form must reflect
	// this so consumers know the property can never validate.
	if child.Kind != reflection.KindNever {
		t.Fatalf("expected a's type to be never (incompatible primitives), got %+v", child)
	}
}

// ---- class visibility intersection (edge case) ----------------------------
// Intersecting two distinct classes is unusual; the TS checker still
// produces a merged shape. We don't assert specific visibility outcomes
// because TS's behaviour here is implementation-defined; we just assert
// the path doesn't crash and produces a usable shape.

func TestIntersection_PrivateAndPublic_OnClasses(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
class A { private x = 1; }
class B { x = 2; }
type T = A & B;
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	// Path must not crash. Some shape with prop x must surface.
	xProp := findProp(dump(r), tn, "x")
	if xProp == nil {
		// TS may collapse to `never` for the prop; check for that too.
		// Either outcome (never-prop or some surviving prop) is acceptable
		// — what we're checking is that we don't crash and we don't emit
		// KindIntersection on the wire.
	}
	for _, node := range dump(r) {
		if node.Kind == reflection.KindIntersection {
			t.Fatalf("KindIntersection leaked to wire — collapse should have removed it")
		}
	}
}
