package resolver_test

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// =========================================================================
// Class `implements` — populates Implements on the class RunType.
// Implements is a compile-time contract in TS; it doesn't transform the
// runtime shape (Children stays = the class's own members), so these
// tests cover the reference-population and the do-not-flatten guarantee.
// =========================================================================

func TestClassImplements_SingleInterface(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface I { a: string; }
class C implements I { a: string = ''; }
getRunTypeId<C>();
`
	r, tn := resolveInline(t, code)
	if tn.Kind != reflection.KindClass {
		t.Fatalf("expected KindClass, got %d", tn.Kind)
	}
	if len(tn.Implements) != 1 {
		t.Fatalf("expected 1 Implements entry, got %d", len(tn.Implements))
	}
	impl := deref(dump(r), tn.Implements[0])
	if impl == nil || impl.Kind != reflection.KindObjectLiteral {
		t.Fatalf("expected implemented type to be an interface (objectLiteral), got %+v", impl)
	}
}

func TestClassImplements_MultipleInterfaces(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface I1 { a: string; }
interface I2 { b: number; }
class C implements I1, I2 { a: string = ''; b: number = 0; }
getRunTypeId<C>();
`
	r, tn := resolveInline(t, code)
	if len(tn.Implements) != 2 {
		t.Fatalf("expected 2 Implements entries, got %d", len(tn.Implements))
	}
	// Order-preserving: I1 first, I2 second. Identify via prop name.
	first := deref(dump(r), tn.Implements[0])
	if !containsAll(propertyNames(dump(r), first), "a") {
		t.Fatalf("expected first implements to be I1 (a:string)")
	}
	second := deref(dump(r), tn.Implements[1])
	if !containsAll(propertyNames(dump(r), second), "b") {
		t.Fatalf("expected second implements to be I2 (b:number)")
	}
}

func TestClassImplements_DoesNotAffectChildren(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface I { a: string; b: number; }
class C implements I {
  a: string = '';
  b: number = 0;
  c: boolean = false;
}
getRunTypeId<C>();
`
	r, tn := resolveInline(t, code)
	// C declares a, b, c — implements I means it must structurally
	// match I, but Children should reflect C's declared members only.
	names := propertyNames(dump(r), tn)
	if !containsAll(names, "a", "b", "c") {
		t.Fatalf("expected class's declared props [a, b, c], got %v", names)
	}
}

func TestClassImplements_ExtendsAndImplements(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface I { tag: 'i'; }
class B { x: string = ''; }
class C extends B implements I { tag: 'i' = 'i'; }
getRunTypeId<C>();
`
	r, tn := resolveInline(t, code)
	if len(tn.ExtendsArguments) != 1 {
		t.Fatalf("expected 1 ExtendsArguments entry, got %d", len(tn.ExtendsArguments))
	}
	if len(tn.Implements) != 1 {
		t.Fatalf("expected 1 Implements entry, got %d", len(tn.Implements))
	}
	parent := deref(dump(r), tn.ExtendsArguments[0])
	if parent == nil || parent.TypeName != "B" {
		t.Fatalf("expected extends parent B, got %+v", parent)
	}
	impl := deref(dump(r), tn.Implements[0])
	if impl == nil || !containsAll(propertyNames(dump(r), impl), "tag") {
		t.Fatalf("expected implements to be I (tag), got %+v", impl)
	}
}

func TestClassImplements_EmptyForPlainClass(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
class C { x: string = ''; }
getRunTypeId<C>();
`
	_, tn := resolveInline(t, code)
	if len(tn.Implements) != 0 {
		t.Fatalf("expected no Implements entries on plain class, got %d", len(tn.Implements))
	}
}
