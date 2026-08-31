package resolver_test

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// =========================================================================
// Property modifiers via mapped types — Required<T>, Readonly<T>,
// Partial<T>, Pick<T,K>, Omit<T,K>, and user-defined mapped types with
// `-?` / `+?` / `-readonly` / `+readonly` syntax.
//
// No code in serialize/ knows about these utility types. The TS checker
// resolves them at access time; GetPropertiesOfType returns property
// symbols whose flags reflect the post-mapped-type modifiers. These
// tests confirm that existing modifier extraction (applyMemberModifiers
// in internal/serialize/modifiers.go) lands the right flags on the wire.
// =========================================================================

// findProp returns a member of an object-like root by name, or nil.
func findProp(types []*reflection.RunType, root *reflection.RunType, name string) *reflection.RunType {
	for _, ref := range root.Children {
		member := deref(types, ref)
		if member == nil {
			continue
		}
		if (member.Kind == reflection.KindProperty || member.Kind == reflection.KindPropertySignature) && member.Name == name {
			return member
		}
	}
	return nil
}

// ---- Required<T> -----------------------------------------------------------

func TestRequired_StripsOptional(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type T = Required<{a?: string; b?: number}>;
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	for _, name := range []string{"a", "b"} {
		prop := findProp(dump(r), tn, name)
		if prop == nil {
			t.Fatalf("missing prop %q", name)
		}
		if prop.Optional {
			t.Fatalf("expected Required<T>.%s to NOT be optional", name)
		}
	}
}

func TestRequired_StripsOnSubset(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type S = {a?: string; b?: number};
type T = Required<Pick<S, 'a'>>;
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	names := propertyNames(dump(r), tn)
	if len(names) != 1 || names[0] != "a" {
		t.Fatalf("expected only [a], got %v", names)
	}
	a := findProp(dump(r), tn, "a")
	if a == nil || a.Optional {
		t.Fatalf("expected a to be required after Required<Pick<…>>, got %+v", a)
	}
}

// ---- Partial<T> -----------------------------------------------------------

func TestPartial_AddsOptional(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type T = Partial<{a: string; b: number}>;
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	for _, name := range []string{"a", "b"} {
		prop := findProp(dump(r), tn, name)
		if prop == nil {
			t.Fatalf("missing prop %q", name)
		}
		if !prop.Optional {
			t.Fatalf("expected Partial<T>.%s to be optional", name)
		}
	}
}

// ---- Readonly<T> ----------------------------------------------------------

func TestReadonly_AddsReadonly(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type T = Readonly<{a: string}>;
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	a := findProp(dump(r), tn, "a")
	if a == nil {
		t.Fatalf("missing prop a")
	}
	if !a.Readonly {
		t.Fatalf("expected Readonly<T>.a to be readonly, got %+v", a)
	}
}

func TestReadonly_PreservesOptional(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type T = Readonly<{a?: string}>;
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	a := findProp(dump(r), tn, "a")
	if a == nil {
		t.Fatalf("missing prop a")
	}
	if !a.Readonly || !a.Optional {
		t.Fatalf("expected a to be readonly AND optional, got readonly=%v optional=%v", a.Readonly, a.Optional)
	}
}

// ---- Pick / Omit ---------------------------------------------------------

func TestPick_KeepsSelectedAndModifiers(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type S = {readonly a: string; b?: number};
type T = Pick<S, 'a'>;
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	names := propertyNames(dump(r), tn)
	if len(names) != 1 || names[0] != "a" {
		t.Fatalf("expected only [a], got %v", names)
	}
	a := findProp(dump(r), tn, "a")
	if a == nil || !a.Readonly {
		t.Fatalf("expected a to preserve readonly, got %+v", a)
	}
}

func TestOmit_DropsSelectedAndModifiers(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type S = {a: string; readonly b: number};
type T = Omit<S, 'a'>;
getRunTypeId<T>();
`
	r, tn := resolveInline(t, code)
	names := propertyNames(dump(r), tn)
	if len(names) != 1 || names[0] != "b" {
		t.Fatalf("expected only [b], got %v", names)
	}
	b := findProp(dump(r), tn, "b")
	if b == nil || !b.Readonly {
		t.Fatalf("expected b to preserve readonly, got %+v", b)
	}
}

// ---- User-defined mapped types with -? / +? / -readonly / +readonly ------

func TestUserMappedType_StripsOptional(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type Req<T> = { [P in keyof T]-?: T[P] };
type X = Req<{a?: string}>;
getRunTypeId<X>();
`
	r, tn := resolveInline(t, code)
	a := findProp(dump(r), tn, "a")
	if a == nil || a.Optional {
		t.Fatalf("expected a to be required via Req<-?> mapped type, got %+v", a)
	}
}

func TestUserMappedType_StripsReadonly(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type Mut<T> = { -readonly [P in keyof T]: T[P] };
type X = Mut<{readonly a: string}>;
getRunTypeId<X>();
`
	r, tn := resolveInline(t, code)
	a := findProp(dump(r), tn, "a")
	if a == nil || a.Readonly {
		t.Fatalf("expected a to NOT be readonly via Mut<-readonly> mapped type, got %+v", a)
	}
}

func TestUserMappedType_AddsOptional(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type Opt<T> = { [P in keyof T]+?: T[P] };
type X = Opt<{a: string}>;
getRunTypeId<X>();
`
	r, tn := resolveInline(t, code)
	a := findProp(dump(r), tn, "a")
	if a == nil || !a.Optional {
		t.Fatalf("expected a to be optional via Opt<+?> mapped type, got %+v", a)
	}
}

func TestUserMappedType_AddsReadonly(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
type RO<T> = { +readonly [P in keyof T]: T[P] };
type X = RO<{a: string}>;
getRunTypeId<X>();
`
	r, tn := resolveInline(t, code)
	a := findProp(dump(r), tn, "a")
	if a == nil || !a.Readonly {
		t.Fatalf("expected a to be readonly via RO<+readonly> mapped type, got %+v", a)
	}
}
