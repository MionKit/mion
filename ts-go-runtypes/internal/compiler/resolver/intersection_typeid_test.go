package resolver_test

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// =========================================================================
// Intersection typeid stability — verifies that the structural id
// produced by typeid.collapsedIntersectionID matches what serialize
// would emit, so two intersections that collapse to the same shape
// share a cache entry.
// =========================================================================

// twoSiteIDs runs scanFiles on a single-source file with N getRunTypeId
// call sites and returns their hash ids in declaration order.
func twoSiteIDs(t *testing.T, code string) []string {
	t.Helper()
	r := setupInline(t, map[string]string{"test.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"test.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	ids := make([]string, 0, len(resp.Sites))
	for _, site := range resp.Sites {
		ids = append(ids, site.ID)
	}
	return ids
}

// `A & B` shares an id with the equivalent flat object literal.
// The TS checker exposes the merged property set on the intersection
// type, so typeid's collapsedIntersectionID falls through to objectID.
func TestTypeID_Intersection_ObjectMerge_StableID(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
type A = {a: string};
type B = {b: number};
type AB     = A & B;
type AB_eq  = {a: string; b: number};
getRunTypeId<AB>();
getRunTypeId<AB_eq>();
`
	ids := twoSiteIDs(t, code)
	if len(ids) != 2 {
		t.Fatalf("expected 2 sites, got %d", len(ids))
	}
	if ids[0] != ids[1] {
		t.Fatalf("A&B (%q) must share id with the flat equivalent (%q)", ids[0], ids[1])
	}
}

// Brand intersections must produce a distinct id from the bare primitive.
// Otherwise `string` and `string & {__brand}` would share a cache slot
// and brand info would be lost on lookup.
func TestTypeID_Intersection_PrimitiveBrand_DistinctFromBarePrimitive(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
type Email = string & {readonly __brand: 'Email'};
getRunTypeId<string>();
getRunTypeId<Email>();
`
	ids := twoSiteIDs(t, code)
	if len(ids) != 2 {
		t.Fatalf("expected 2 sites, got %d", len(ids))
	}
	if ids[0] == ids[1] {
		t.Fatalf("string and string&{__brand} must NOT share an id (got %q)", ids[0])
	}
}

// Brand order is irrelevant — `string & B1 & B2` and `string & B2 & B1`
// must dedup. Achieved by sorting decorator ids in
// collapsedIntersectionID.
func TestTypeID_Intersection_BrandOrderInvariant(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
type B1 = {readonly __b1: 1};
type B2 = {readonly __b2: 2};
type Left  = string & B1 & B2;
type Right = string & B2 & B1;
getRunTypeId<Left>();
getRunTypeId<Right>();
`
	ids := twoSiteIDs(t, code)
	if len(ids) != 2 {
		t.Fatalf("expected 2 sites, got %d", len(ids))
	}
	if ids[0] != ids[1] {
		t.Fatalf("brand-order should be invariant; got %q vs %q", ids[0], ids[1])
	}
}

// `string & number` collapses to never — its structural id must match
// the bare `never` type so they share a cache entry.
func TestTypeID_Intersection_Never_StableWithBareNever(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
type Conflict = string & number;
getRunTypeId<never>();
getRunTypeId<Conflict>();
`
	ids := twoSiteIDs(t, code)
	if len(ids) != 2 {
		t.Fatalf("expected 2 sites, got %d", len(ids))
	}
	if ids[0] != ids[1] {
		t.Fatalf("never and string&number must share id; got %q vs %q", ids[0], ids[1])
	}
}
