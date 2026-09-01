package resolver_test

import (
	"strconv"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// Optional-property structural-id tests. An optional property carries
// `T | undefined` at the symbol-type layer (TS without exactOptionalPropertyTypes),
// but the `?` optional bit already IS the "undefined-permitted" signal, so the
// union wrapper is redundant. typeid.memberID strips it before computing the
// child id, matching the serializer (which projects optional members through the
// same stripUndefined). Drop that strip and a recursive optional self/cross
// reference closes on a `T | undefined` UNION node instead of the inner object —
// the structural id (cache key) then disagrees with the serializer's projected
// node, the exact mismatch that broke the JS id-integrity "Multiple circular
// types cross-referenced" case.
//
// These assert on the raw structural string (typeid.Computer output) recovered
// via Cache().StructuralForHash — the ONLY layer where the strip is observable.
// The projected dump node strips independently (serialize.go), so a node-shape
// test can't catch a regression here; and two type-first HASHED ids can't either,
// since both authoring paths get identical treatment. The member token format is
// `<kind>:<name><optBit>:<child>` (optBit is `?`), so an optional child reads
// `:<name>?:<child>`; a union-wrapped child reads `:<name>?:<KindUnion>{…`.

// structuralByID returns the raw structural id (pre-hash) the typeid Computer
// produced for the wire id, via the resolver's cache.
func structuralByID(t *testing.T, r *resolver.Session, id string) string {
	t.Helper()
	structural := r.Cache().StructuralForHash(id)
	if structural == "" {
		t.Fatalf("StructuralForHash(%q) returned empty — id not interned", id)
	}
	return structural
}

// scanSiteIDs scans test.ts and returns the wire ids of every call site, in
// source order.
func scanSiteIDs(t *testing.T, r *resolver.Session) []string {
	t.Helper()
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"test.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	ids := make([]string, len(resp.Sites))
	for i, site := range resp.Sites {
		ids[i] = site.ID
	}
	return ids
}

func unionWrap() string { return strconv.Itoa(int(reflection.KindUnion)) + "{" }

// TestOptionalPropertyID_ChildClosesOnBareType — a non-recursive optional
// property's child id must be the BARE inner type's id, not a `Inner | undefined`
// union wrapper. The holder's structural id must contain `:a?:` immediately
// followed by Inner's full structural id; remove the strip and the child becomes
// `:a?:<KindUnion>{…` and this substring vanishes.
func TestOptionalPropertyID_ChildClosesOnBareType(t *testing.T) {
	r := setupInline(t, map[string]string{"test.ts": `import {getRunTypeId} from '@mionjs/run-types';
type Inner = {v: number};
type Holder = {a?: Inner};
getRunTypeId<Inner>();
getRunTypeId<Holder>();
`})
	ids := scanSiteIDs(t, r)
	if len(ids) != 2 {
		t.Fatalf("expected 2 call sites (Inner, Holder), got %d", len(ids))
	}
	innerStructural := structuralByID(t, r, ids[0])
	holderStructural := structuralByID(t, r, ids[1])

	want := ":a?:" + innerStructural
	if !strings.Contains(holderStructural, want) {
		t.Fatalf("optional child must close on the bare inner type, not a `Inner | undefined` union.\n  holder structural: %q\n  inner structural:  %q\n  expected substring: %q", holderStructural, innerStructural, want)
	}
	// It must NOT be union-wrapped.
	if strings.Contains(holderStructural, ":a?:"+unionWrap()) {
		t.Fatalf("optional child is union-wrapped (stripUndefined regressed): %q", holderStructural)
	}
}

// TestOptionalPropertyID_RequiredUnionKeepsWrapper — negative control: the strip
// is gated on the optional bit, NOT a blanket `| undefined` removal. A REQUIRED
// property typed `Inner | undefined` is a genuine union and must keep its union
// child. (Unaffected by the strip either way — this pins that the strip doesn't
// over-reach into required unions.)
func TestOptionalPropertyID_RequiredUnionKeepsWrapper(t *testing.T) {
	r := setupInline(t, map[string]string{"test.ts": `import {getRunTypeId} from '@mionjs/run-types';
type Inner = {v: number};
type Req = {a: Inner | undefined};
getRunTypeId<Req>();
`})
	ids := scanSiteIDs(t, r)
	reqStructural := structuralByID(t, r, ids[0])

	if strings.Contains(reqStructural, ":a?:") {
		t.Fatalf("required property must not carry the optional bit: %q", reqStructural)
	}
	if !strings.Contains(reqStructural, ":a:"+unionWrap()) {
		t.Fatalf("required `a: Inner | undefined` must keep its union child: %q", reqStructural)
	}
}

// TestOptionalPropertyID_RecursiveSelfRefNotUnionWrapped — the motivating case.
// A recursive optional self-reference (`next?: Node`) must close on a bare cycle
// back-edge token (`$<kind>_<depth>:…`, which starts with `$`), NOT a
// `Node | undefined` union. The optional member therefore reads `:next?:$…`; a
// union-wrapped child would read `:next?:<KindUnion>{…`.
func TestOptionalPropertyID_RecursiveSelfRefNotUnionWrapped(t *testing.T) {
	r := setupInline(t, map[string]string{"test.ts": `import {getRunTypeId} from '@mionjs/run-types';
type Node = {next?: Node};
getRunTypeId<Node>();
`})
	ids := scanSiteIDs(t, r)
	nodeStructural := structuralByID(t, r, ids[0])

	if !strings.Contains(nodeStructural, ":next?:$") {
		t.Fatalf("recursive optional self-ref must be a bare cycle token (`:next?:$…`), got: %q", nodeStructural)
	}
	if strings.Contains(nodeStructural, ":next?:"+unionWrap()) {
		t.Fatalf("recursive optional self-ref is union-wrapped (stripUndefined regressed): %q", nodeStructural)
	}
}

// TestOptionalPropertyID_CrossReferencedCirculars — two mutually-recursive types
// reached through optional properties (A.b?: B, B.a?: A), the multi-type shape
// the JS "Multiple circular types cross-referenced" case exercises. Whichever
// type is computed first expands the other inline, so the back-edge can land on
// either side; the invariant that holds regardless of walk order is: NO optional
// property's child is union-wrapped, and a bare optional back-edge (`?:$`) is
// present. Remove the strip and every optional child becomes a `… | undefined`
// union, so `?:<KindUnion>{` appears and `?:$` does not.
func TestOptionalPropertyID_CrossReferencedCirculars(t *testing.T) {
	r := setupInline(t, map[string]string{"test.ts": `import {getRunTypeId} from '@mionjs/run-types';
type A = {id: number; b?: B};
type B = {id: number; a?: A};
getRunTypeId<A>();
getRunTypeId<B>();
`})
	ids := scanSiteIDs(t, r)
	if len(ids) != 2 {
		t.Fatalf("expected 2 call sites (A, B), got %d", len(ids))
	}
	for i, alias := range []string{"A", "B"} {
		structural := structuralByID(t, r, ids[i])
		if strings.Contains(structural, "?:"+unionWrap()) {
			t.Fatalf("cross-ref %q has a union-wrapped optional child (stripUndefined regressed): %q", alias, structural)
		}
		if !strings.Contains(structural, "?:$") {
			t.Fatalf("cross-ref %q must carry a bare optional back-edge (`?:$`): %q", alias, structural)
		}
	}
}
