package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// Canonical cycle-anchoring tests (typeid/canonicalize.go) — the entry-point
// half of the shared-recursive-container family: the id of a cyclic type must
// be a function of its bisimulation class alone, independent of which node a
// walk enters the cycle through, how the checker interned container nodes,
// and the checker's declaration-position-tiebroken union member order. See
// docs/done/typeid-scc-entry-point-anchoring.md for the class boundary and
// the seeded fuzz repros that motivated it.

// TestCanonicalID_EntryThroughContainer — the motivating class. Both roots
// denote Record<string, {v: <recursive>}> over bisimilar recursive types; TA
// enters the cycle through a DISTINCT anonymous wrapper literal (the wrapper
// sits outside the pointer-SCC), TB through the checker-interned alias (the
// wrapper IS on the walk path when the cycle closes). Before canonical
// anchoring the two spelled their back-edges at different targets. Static and
// reflect shapes per the marker coverage rule.
func TestCanonicalID_EntryThroughContainer(t *testing.T) {
	r := setupInline(t, map[string]string{"test.ts": `import {getRunTypeId} from '@mionjs/run-types';
type A0 = {p1: A0; k: {v: A0}};
type TA = Record<string, {v: A0}>;
type W = {v: B0};
type B0 = {p1: B0; k: W};
type TB = Record<string, W>;
getRunTypeId<TA>();
getRunTypeId<TB>();
const ta = {} as TA;
const tb = {} as TB;
getRunTypeId(ta);
getRunTypeId(tb);
`})
	ids := scanSiteIDs(t, r)
	if len(ids) != 4 {
		t.Fatalf("expected 4 call sites (TA/TB × static/reflect), got %d", len(ids))
	}
	for i, id := range ids[1:] {
		if id != ids[0] {
			t.Fatalf("entry through a cloned vs interned container must converge: site %d got %q, want %q\n  structural[0]: %q\n  structural[%d]: %q",
				i+1, id, ids[0], structuralByID(t, r, ids[0]), i+1, structuralByID(t, r, id))
		}
	}
}

// TestCanonicalID_EntryDepthIndependence — the same cycle entered at two
// different container depths (bare array vs array-in-object) must converge
// with its clone-authored twin at each root.
func TestCanonicalID_EntryDepthIndependence(t *testing.T) {
	r := setupInline(t, map[string]string{"test.ts": `import {getRunTypeId} from '@mionjs/run-types';
type N = {kids: N[]};
type DeepShared = {hold: N[]};
type M = {kids: M[]};
type DeepClone = {hold: {kids: M[]}[]};
getRunTypeId<DeepShared>();
getRunTypeId<{hold: {kids: N[]}[]}>();
getRunTypeId<DeepClone>();
`})
	ids := scanSiteIDs(t, r)
	if len(ids) != 3 {
		t.Fatalf("expected 3 call sites, got %d", len(ids))
	}
	// {hold: N[]} and {hold: {kids: N[]}[]} denote the same bisimulation class
	// (N ≡ {kids: N[]}), and the clone-authored DeepClone must match both.
	for i, id := range ids[1:] {
		if id != ids[0] {
			t.Fatalf("entry depth / cloning must not affect the id: site %d got %q, want %q\n  structural[0]: %q\n  structural[%d]: %q",
				i+1, id, ids[0], structuralByID(t, r, ids[0]), i+1, structuralByID(t, r, id))
		}
	}
}

// TestCanonicalID_MutualRecursionEitherEntry — a mutually recursive pair
// scanned through either member first: per-type ids must be stable across the
// entry order, distinct from each other (A and B are NOT bisimilar here), and
// the same-shape mutual pair must merge (bisimilar is bisimilar).
func TestCanonicalID_MutualRecursionEitherEntry(t *testing.T) {
	r := setupInline(t, map[string]string{"test.ts": `import {getRunTypeId} from '@mionjs/run-types';
type A1 = {tag: string; b: B1};
type B1 = {n: number; a: A1};
type A2 = {tag: string; b: B2};
type B2 = {n: number; a: A2};
getRunTypeId<A1>();
getRunTypeId<B1>();
getRunTypeId<B2>();
getRunTypeId<A2>();
type SameA = {n: SameB};
type SameB = {n: SameA};
getRunTypeId<SameA>();
getRunTypeId<SameB>();
`})
	ids := scanSiteIDs(t, r)
	if len(ids) != 6 {
		t.Fatalf("expected 6 call sites, got %d", len(ids))
	}
	if ids[0] != ids[3] {
		t.Fatalf("A scanned A-first vs B-first must share one id: %q vs %q", ids[0], ids[3])
	}
	if ids[1] != ids[2] {
		t.Fatalf("B scanned A-first vs B-first must share one id: %q vs %q", ids[1], ids[2])
	}
	if ids[0] == ids[1] {
		t.Fatalf("A and B are not bisimilar and must not merge: both %q", ids[0])
	}
	if ids[4] != ids[5] {
		t.Fatalf("a same-shape mutual pair IS bisimilar and must merge: %q vs %q", ids[4], ids[5])
	}
}

// TestCanonicalID_UnionArmOrder — checker union member order tiebreaks on
// declaration position for anonymous members, so two clones whose cyclic arms
// are declared in swapped order used to be able to spell differently. The
// canonical emission sorts resolved arms, so the twins must converge.
func TestCanonicalID_UnionArmOrder(t *testing.T) {
	r := setupInline(t, map[string]string{"test.ts": `import {getRunTypeId} from '@mionjs/run-types';
type U1 = {kind: 'x'; next: U1} | {kind: 'y'; prev: U1};
type U2 = {kind: 'y'; prev: U2} | {kind: 'x'; next: U2};
getRunTypeId<U1>();
getRunTypeId<U2>();
`})
	ids := scanSiteIDs(t, r)
	if len(ids) != 2 {
		t.Fatalf("expected 2 call sites, got %d", len(ids))
	}
	if ids[0] != ids[1] {
		t.Fatalf("swapped-arm cyclic union twins must converge:\n  U1: %q → %q\n  U2: %q → %q",
			ids[0], structuralByID(t, r, ids[0]), ids[1], structuralByID(t, r, ids[1]))
	}
}

// TestCanonicalID_RecursiveClassNamesStayDistinct — the class `#Name` suffix
// is part of a block's local template bytes, so same-shape recursive classes
// with different names must NOT merge (class ids route reconstruction through
// the name-keyed class-serializer registry).
func TestCanonicalID_RecursiveClassNamesStayDistinct(t *testing.T) {
	r := setupInline(t, map[string]string{"test.ts": `import {getRunTypeId} from '@mionjs/run-types';
declare class CA { next: CA | null }
declare class CB { next: CB | null }
getRunTypeId<CA>();
getRunTypeId<CB>();
`})
	ids := scanSiteIDs(t, r)
	if len(ids) != 2 {
		t.Fatalf("expected 2 call sites, got %d", len(ids))
	}
	if ids[0] == ids[1] {
		t.Fatalf("same-shape recursive classes with different names must not merge: both %q\n  structural: %q",
			ids[0], structuralByID(t, r, ids[0]))
	}
}

// TestCanonicalID_OverriddenRecursiveTwinsConverge — overrides on cyclic
// targets key by the block's PURE canonical emission. Overrides are
// STRUCTURAL (the pre-canonicalization raw base keys erased alias names too),
// so the bisimilar twin Node2 folds the same `|cfn:` and shares Node1's id,
// and a container above the overridden type must embed the fold (override
// propagation through the canonical id).
func TestCanonicalID_OverriddenRecursiveTwinsConverge(t *testing.T) {
	r := setupInline(t, map[string]string{
		"runtypes.d.ts": overrideDTS,
		"call.ts": `type Node1 = {tag: string; next: Node1 | null};
type Node2 = {tag: string; next: Node2 | null};
import {createValidateFn, overrideValidate} from '@mionjs/run-types';
overrideValidate<Node1>((v) => typeof v === 'object' && v !== null);
export const isNode1 = createValidateFn<Node1>();
export const isNode2 = createValidateFn<Node2>();
export const holder = createValidateFn<{n: Node1}>();
`,
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	var siteIDs []string
	for _, site := range resp.Sites {
		if site.FnId != "" {
			siteIDs = append(siteIDs, site.ID)
		}
	}
	// Source order: overrideValidate<Node1>, isNode1, isNode2, holder.
	if len(siteIDs) != 4 {
		t.Fatalf("expected 4 fn sites (override + 3 createValidateFn), got %d", len(siteIDs))
	}
	siteIDs = siteIDs[1:]
	// Overrides key structurally: bisimilar Node2 folds Node1's override too,
	// so the twins MUST share one (suffixed) id.
	if siteIDs[0] != siteIDs[1] {
		t.Fatalf("bisimilar recursive twins must share the structurally-keyed override fold: %q vs %q", siteIDs[0], siteIDs[1])
	}
	if !strings.Contains(structuralByID(t, r, siteIDs[0]), "|cfn:") {
		t.Fatalf("overridden recursive id must carry the |cfn: fold: %q", structuralByID(t, r, siteIDs[0]))
	}
	validateSources := familyEntrySources(resp, "validate")
	if !strings.Contains(validateSources, "usePureFn(") || !strings.Contains(validateSources, "cfn::") {
		t.Fatalf("overridden recursive type did not fold a cfn redirect:\n%s", validateSources)
	}
	// The holder embeds Node1's overridden id — its structural must contain
	// the |cfn: fold (override propagation through composition).
	holderStructural := structuralByID(t, r, siteIDs[2])
	if !strings.Contains(holderStructural, "|cfn:") {
		t.Fatalf("container above an overridden recursive type must embed the fold: %q", holderStructural)
	}
}
