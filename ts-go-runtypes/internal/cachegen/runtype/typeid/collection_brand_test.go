package typeid_test

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// The FormattedSet encoding, spelled with locally declared sentinel symbols
// (the resolver matches a symbol-keyed property on its declaration name).
const setSentinels = `import {getRunTypeId} from '@mionjs/run-types';
declare const __rtFormatName: unique symbol;
declare const __rtFormatParams: unique symbol;
declare const __rtContains: unique symbol;
type Brand = {readonly [__rtFormatName]?: 'formattedSet'; readonly [__rtFormatParams]?: {maxItems: 3}};
type Contains = {readonly [__rtContains]?: {readonly rt$child: number; readonly rt$min: 1}};
`

// TestCollectionBrand_ContainsLiftsOntoTheSetNode — the builtin-class branch
// of the collapse keeps the Set identity and promotes a `__rtContains`
// member onto the class node, with or without a brand beside it.
func TestCollectionBrand_ContainsLiftsOntoTheSetNode(t *testing.T) {
	_, branded := rootFor(t, setSentinels+`getRunTypeId<Set<number> & Brand & Contains>();
`)
	if branded.Kind != reflection.KindClass || branded.SubKind != reflection.SubKindSet {
		t.Fatalf("brand + contains: expected a KindClass/SubKindSet node, got kind %d subKind %d", branded.Kind, branded.SubKind)
	}
	if branded.FormatAnnotation == nil || branded.FormatAnnotation.Name != "formattedSet" {
		t.Fatalf("brand + contains: expected the formattedSet annotation, got %+v", branded.FormatAnnotation)
	}
	if len(branded.Contains) != 1 || branded.Contains[0].Min != 1 || branded.Contains[0].Max != -1 {
		t.Fatalf("brand + contains: expected one contains check (min 1, unbounded max), got %+v", branded.Contains)
	}

	_, containsOnly := rootFor(t, setSentinels+`getRunTypeId<Set<number> & Contains>();
`)
	if containsOnly.SubKind != reflection.SubKindSet {
		t.Fatalf("contains only: expected SubKindSet, got %d", containsOnly.SubKind)
	}
	if containsOnly.FormatAnnotation != nil {
		t.Fatalf("contains only: expected no annotation, got %+v", containsOnly.FormatAnnotation)
	}
	if len(containsOnly.Contains) != 1 {
		t.Fatalf("contains only: expected one contains check, got %+v", containsOnly.Contains)
	}
}

// TestCollectionBrand_ContainsEntersTheId — the id side mirrors the
// serialize side: a plain Set, a bounded Set and a bounded Set with a
// contains slot are three ids, and the id is stable across the member order.
func TestCollectionBrand_ContainsEntersTheId(t *testing.T) {
	_, plain := rootFor(t, setSentinels+`getRunTypeId<Set<number>>();
`)
	_, bounded := rootFor(t, setSentinels+`getRunTypeId<Set<number> & Brand>();
`)
	_, withContains := rootFor(t, setSentinels+`getRunTypeId<Set<number> & Brand & Contains>();
`)
	_, reordered := rootFor(t, setSentinels+`getRunTypeId<Contains & Set<number> & Brand>();
`)
	if plain.ID == bounded.ID {
		t.Errorf("a bounded Set must not share the plain Set's id %q", plain.ID)
	}
	if bounded.ID == withContains.ID {
		t.Errorf("a contains slot must enter the id; both got %q", bounded.ID)
	}
	if withContains.ID != reordered.ID {
		t.Errorf("member order must not change the id: %q vs %q", withContains.ID, reordered.ID)
	}
}
