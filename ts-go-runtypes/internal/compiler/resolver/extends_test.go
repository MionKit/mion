package resolver_test

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// =========================================================================
// Class & interface `extends` — populates ExtendsArguments (classes) and
// the new Extends slot (interfaces). Properties inherited from parents
// are flattened into Children by the TS checker; tests cover both the
// flattening and the explicit parent-ref slot.
// =========================================================================

// ---- class extends ---------------------------------------------------------

func TestClassExtends_PopulatesExtendsArguments(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
class A { a = ''; }
class B extends A { b = 0; }
getRunTypeId<B>();
`
	r, tn := resolveInline(t, code)
	if tn.Kind != reflection.KindClass {
		t.Fatalf("expected KindClass, got %d", tn.Kind)
	}
	if len(tn.ExtendsArguments) != 1 {
		t.Fatalf("expected 1 ExtendsArguments entry, got %d", len(tn.ExtendsArguments))
	}
	parent := deref(dump(r), tn.ExtendsArguments[0])
	if parent == nil || parent.TypeName != "A" {
		t.Fatalf("expected parent class A, got %+v", parent)
	}
}

func TestClassExtends_InheritsParentProperties(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
class A { a: string = ''; }
class B extends A { b: number = 0; }
getRunTypeId<B>();
`
	r, tn := resolveInline(t, code)
	names := propertyNames(dump(r), tn)
	if !containsAll(names, "a", "b") {
		t.Fatalf("expected child to carry inherited [a] + own [b], got %v", names)
	}
}

func TestClassExtends_PropertyOverride_LastWins(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
class A { name: string = ''; }
class B extends A { name: 'fixed' = 'fixed'; }
getRunTypeId<B>();
`
	r, tn := resolveInline(t, code)
	nameProp := findMember(dump(r), tn, "name")
	if nameProp == nil {
		t.Fatalf("expected name prop on B")
	}
	childType := deref(dump(r), nameProp.Child)
	if childType == nil || childType.Kind != reflection.KindLiteral {
		t.Fatalf("expected B's name to be the literal 'fixed', got %+v", childType)
	}
}

func TestClassExtends_ChainedInheritance(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
class A { a: string = ''; }
class B extends A { b: number = 0; }
class C extends B { c: boolean = false; }
getRunTypeId<C>();
`
	r, tn := resolveInline(t, code)
	if len(tn.ExtendsArguments) != 1 {
		t.Fatalf("expected 1 ExtendsArguments entry (direct parent B), got %d", len(tn.ExtendsArguments))
	}
	parent := deref(dump(r), tn.ExtendsArguments[0])
	if parent == nil || parent.TypeName != "B" {
		t.Fatalf("expected direct parent B, got %+v", parent)
	}
	names := propertyNames(dump(r), tn)
	if !containsAll(names, "a", "b", "c") {
		t.Fatalf("expected all ancestor + own props, got %v", names)
	}
}

func TestClassExtends_GenericParent(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
class A<T> { value!: T; }
class B extends A<string> { extra: number = 0; }
getRunTypeId<B>();
`
	r, tn := resolveInline(t, code)
	if len(tn.ExtendsArguments) != 1 {
		t.Fatalf("expected 1 ExtendsArguments entry, got %d", len(tn.ExtendsArguments))
	}
	parent := deref(dump(r), tn.ExtendsArguments[0])
	if parent == nil || parent.TypeName != "A" {
		t.Fatalf("expected parent A<string>, got %+v", parent)
	}
	// The parent ref should resolve to the A<string> instantiation,
	// which has T=string in its Arguments.
	if len(parent.Arguments) != 1 {
		t.Fatalf("expected 1 type argument on parent (A<string>), got %d", len(parent.Arguments))
	}
	arg := deref(dump(r), parent.Arguments[0])
	if arg == nil || arg.Kind != reflection.KindString {
		t.Fatalf("expected A's T=string, got %+v", arg)
	}
}

func TestClassExtends_AddsOwnPropertiesAfter(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
class Base { foo: string = ''; }
class Child extends Base { bar: number = 0; }
getRunTypeId<Child>();
`
	r, tn := resolveInline(t, code)
	names := propertyNames(dump(r), tn)
	if !containsAll(names, "foo", "bar") {
		t.Fatalf("expected merged [foo, bar], got %v", names)
	}
}

// ---- interface extends -----------------------------------------------------

func TestInterfaceExtends_PopulatesExtends(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface A { a: string; }
interface B extends A { b: number; }
getRunTypeId<B>();
`
	r, tn := resolveInline(t, code)
	if tn.Kind != reflection.KindObjectLiteral {
		t.Fatalf("expected KindObjectLiteral (interface), got %d", tn.Kind)
	}
	if len(tn.Extends) != 1 {
		t.Fatalf("expected 1 Extends entry, got %d", len(tn.Extends))
	}
	parent := deref(dump(r), tn.Extends[0])
	if parent == nil || parent.Kind != reflection.KindObjectLiteral {
		t.Fatalf("expected parent to be an objectLiteral (interface form), got %+v", parent)
	}
	parentProps := propertyNames(dump(r), parent)
	if !containsAll(parentProps, "a") {
		t.Fatalf("expected parent (interface A) to expose prop 'a', got %v", parentProps)
	}
}

func TestInterfaceExtends_FlattensInheritedProps(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface A { a: string; }
interface B extends A { b: number; }
getRunTypeId<B>();
`
	r, tn := resolveInline(t, code)
	names := propertyNames(dump(r), tn)
	if !containsAll(names, "a", "b") {
		t.Fatalf("expected flattened [a, b], got %v", names)
	}
}

func TestInterfaceExtends_PropertyOverride_LastWins(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface A { x: string; }
interface B extends A { x: 'a' | 'b'; }
getRunTypeId<B>();
`
	r, tn := resolveInline(t, code)
	xProp := findMember(dump(r), tn, "x")
	if xProp == nil {
		t.Fatalf("expected x prop on B")
	}
	childType := deref(dump(r), xProp.Child)
	if childType == nil || childType.Kind != reflection.KindUnion {
		t.Fatalf("expected B's x to be a union (overridden), got %+v", childType)
	}
}

func TestInterfaceExtends_MultipleParents(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface A { a: string; }
interface B { b: number; }
interface C extends A, B { c: boolean; }
getRunTypeId<C>();
`
	r, tn := resolveInline(t, code)
	if len(tn.Extends) != 2 {
		t.Fatalf("expected 2 Extends entries, got %d", len(tn.Extends))
	}
	names := propertyNames(dump(r), tn)
	if !containsAll(names, "a", "b", "c") {
		t.Fatalf("expected merged [a, b, c], got %v", names)
	}
}

func TestInterfaceExtends_DiamondInheritance(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface A { a: string; }
interface B extends A { b: number; }
interface C extends A { c: boolean; }
interface D extends B, C { d: bigint; }
getRunTypeId<D>();
`
	r, tn := resolveInline(t, code)
	if len(tn.Extends) != 2 {
		t.Fatalf("expected 2 direct parents (B, C), got %d", len(tn.Extends))
	}
	// a should appear exactly once even though it's inherited via both branches.
	names := propertyNames(dump(r), tn)
	aCount := 0
	for _, name := range names {
		if name == "a" {
			aCount++
		}
	}
	if aCount != 1 {
		t.Fatalf("expected diamond-inherited prop 'a' to appear exactly once, got %d times in %v", aCount, names)
	}
	if !containsAll(names, "a", "b", "c", "d") {
		t.Fatalf("expected all ancestors + own props, got %v", names)
	}
}

func TestInterfaceExtends_TypeAliasHasNoExtends(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type T = {a: string};
getRunTypeId<T>();
`
	_, tn := resolveInline(t, code)
	if len(tn.Extends) != 0 {
		t.Fatalf("type alias should not populate Extends, got %d entries", len(tn.Extends))
	}
}

func TestInterfaceExtends_AnonymousHasNoExtends(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<{a: string}>();
`
	_, tn := resolveInline(t, code)
	if len(tn.Extends) != 0 {
		t.Fatalf("anonymous object literal should not populate Extends, got %d entries", len(tn.Extends))
	}
}
