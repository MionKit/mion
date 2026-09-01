package resolver_test

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// Each scenario below has paired *_Static / *_Reflect tests per the
// marker test coverage rule (CLAUDE.md). The shared assertion helpers
// receive the resolved root + dump and exercise the same expectations
// regardless of which marker form drove the resolution.

// ---- F19 — array of object literal -------------------------------------------

func TestF19_ArrayOfObject_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<{x: number}[]>();
`
	r, root := resolveInline(t, code)
	assertF19ArrayOfObject(t, r, root)
}

func TestF19_ArrayOfObject_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
declare const xs: {x: number}[];
getRunTypeId(xs);
`
	r, root := resolveInline(t, code)
	assertF19ArrayOfObject(t, r, root)
}

func assertF19ArrayOfObject(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindArray {
		t.Fatalf("expected KindArray, got %+v", root)
	}
	elem := deref(types, root.Child)
	if elem == nil || elem.Kind != reflection.KindObjectLiteral {
		t.Fatalf("expected element KindObjectLiteral, got %+v", elem)
	}
	x := findMember(types, elem, "x")
	if x == nil {
		t.Fatalf("missing 'x' property on element; types=%+v", elem.Children)
	}
	xType := deref(types, x.Child)
	if xType == nil || xType.Kind != reflection.KindNumber {
		t.Fatalf("x.type expected KindNumber, got %+v", xType)
	}
}

// ---- F20 — array of array ----------------------------------------------------

func TestF20_ArrayOfArray_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<string[][]>();
`
	r, root := resolveInline(t, code)
	assertF20ArrayOfArray(t, r, root)
}

func TestF20_ArrayOfArray_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
declare const xs: string[][];
getRunTypeId(xs);
`
	r, root := resolveInline(t, code)
	assertF20ArrayOfArray(t, r, root)
}

func assertF20ArrayOfArray(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindArray {
		t.Fatalf("expected outer KindArray, got %+v", root)
	}
	inner := deref(types, root.Child)
	if inner == nil || inner.Kind != reflection.KindArray {
		t.Fatalf("expected inner KindArray, got %+v", inner)
	}
	leaf := deref(types, inner.Child)
	if leaf == nil || leaf.Kind != reflection.KindString {
		t.Fatalf("expected leaf KindString, got %+v", leaf)
	}
}

// ---- F21 — recursive self ----------------------------------------------------
//
// The cycle path is Tree → Property("children") → Array → Tree. Walking it
// must terminate via the cache by id equality, not by infinite recursion.

func TestF21_RecursiveSelf_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface Tree {
  children: Tree[];
}
getRunTypeId<Tree>();
`
	r, root := resolveInline(t, code)
	assertF21RecursiveSelf(t, r, root)
}

func TestF21_RecursiveSelf_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface Tree {
  children: Tree[];
}
declare const t: Tree;
getRunTypeId(t);
`
	r, root := resolveInline(t, code)
	assertF21RecursiveSelf(t, r, root)
}

func assertF21RecursiveSelf(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindObjectLiteral {
		t.Fatalf("expected root KindObjectLiteral, got %+v", root)
	}
	rootID := root.ID
	if countByID(types, rootID) != 1 {
		t.Fatalf("expected Tree to appear exactly once in cache, got %d", countByID(types, rootID))
	}
	children := findMember(types, root, "children")
	if children == nil {
		t.Fatalf("missing 'children' property; types=%+v", root.Children)
	}
	arr := deref(types, children.Child)
	if arr == nil || arr.Kind != reflection.KindArray {
		t.Fatalf("children.type expected KindArray, got %+v", arr)
	}
	back := deref(types, arr.Child)
	if back == nil {
		t.Fatalf("array element ref did not resolve")
	}
	if back.ID != rootID {
		t.Fatalf("expected cycle to close on rootID=%s, got %s", rootID, back.ID)
	}
}

// ---- F22 — recursive mutual --------------------------------------------------

func TestF22_RecursiveMutual_Static(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface A {
  b: B;
}
interface B {
  a: A;
}
getRunTypeId<A>();
`
	r, root := resolveInline(t, code)
	assertF22RecursiveMutual(t, r, root)
}

func TestF22_RecursiveMutual_Reflect(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/run-types';
interface A {
  b: B;
}
interface B {
  a: A;
}
declare const a: A;
getRunTypeId(a);
`
	r, root := resolveInline(t, code)
	assertF22RecursiveMutual(t, r, root)
}

func assertF22RecursiveMutual(t *testing.T, r *resolver.Session, root *reflection.RunType) {
	t.Helper()
	types := dump(r)
	if root.Kind != reflection.KindObjectLiteral {
		t.Fatalf("expected A KindObjectLiteral, got %+v", root)
	}
	aID := root.ID

	bProp := findMember(types, root, "b")
	if bProp == nil {
		t.Fatalf("A missing 'b' property; types=%+v", root.Children)
	}
	b := deref(types, bProp.Child)
	if b == nil || b.Kind != reflection.KindObjectLiteral {
		t.Fatalf("b expected KindObjectLiteral, got %+v", b)
	}
	bID := b.ID

	aProp := findMember(types, b, "a")
	if aProp == nil {
		t.Fatalf("B missing 'a' property; types=%+v", b.Children)
	}
	back := deref(types, aProp.Child)
	if back == nil {
		t.Fatalf("B.a ref did not resolve")
	}
	if back.ID != aID {
		t.Fatalf("expected B.a to close cycle on A id=%s, got %s", aID, back.ID)
	}
	if countByID(types, aID) != 1 {
		t.Fatalf("expected A to appear exactly once in cache, got %d", countByID(types, aID))
	}
	if countByID(types, bID) != 1 {
		t.Fatalf("expected B to appear exactly once in cache, got %d", countByID(types, bID))
	}
}

func countByID(types []*reflection.RunType, id string) int {
	n := 0
	for _, t := range types {
		if t.ID == id {
			n++
		}
	}
	return n
}
