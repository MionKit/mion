---
type: fix
spec: guidelines
status: done
created: 2026-07-30
---

# typeid: cycle back-edges anchor at the walk's SCC entry point, not canonically

**Status:** done — fixed via bisimulation-canonical cluster emission (see
"Shipped" below). The fuzz-lane guard (`hasContainerEntryReuse`) is deleted;
the lane runs unguarded.

The residual half of the shared-recursive-container divergence family. The
depth-splice half was fixed by the lowlink cache gate
([json-schema-shared-recursive-container-id-divergence.md](json-schema-shared-recursive-container-id-divergence.md));
this half needed canonical anchoring.

## Symptom (empirical, seeded)

When a walk ENTERED a recursive type's cycle through a container that the
cycle also contains, the back-edge targeted the container frame; a walk whose
containers were cloned per occurrence (the jsonSchema authoring path) anchored
at the interface knot instead. Same structure, different token streams,
different ids.

Reproduced by the json-schema translation fuzz lane at base seed `20260730`,
iteration seeds `1662213203`, `2140920747`, `2144068665` — all three the same
shape class, minimal form:

```ts
interface N0 {p1?: N0; p2?: N0[]; p3: string; kids4: N0[]}
type T = Record<string, N0[]>; // entry through Array<N0>, which N0 also contains
```

## Shipped (2026-07-30) — canonical cluster ids

`ts-go-runtypes/internal/cachegen/runtype/typeid/canonicalize.go` + trigger
wiring in `Compute`/`BaseStructuralKey`:

- **Trigger**: the lowlink machinery detects the raw SCC root (a frame that
  pops cacheable AND was a cycle target — a `cycleTargets` slice marks targets
  at mint time, since a direct self-loop never lowers the lowlink); every
  uncacheable pop is collected into the cluster via a watermarked `pending`
  list.
- **Templates**: each member re-dispatches with in-cluster children resolved
  to slot placeholders (one check at the top of `Compute` covers every child
  site). Content-sorted composites (unions, synthetic unions, intersection
  brand sets, object members + call-signature groups) defer their sort to
  emission via unordered runs — checker union member order tiebreaks on
  declaration position and is NOT canonical across cloned anonymous members.
  User bytes are escaped in template mode so literals cannot spoof control
  bytes.
- **Refinement**: partition by normalized template, then exact-ordinal
  relabeling rounds until the induced partition stabilizes (hashes could
  silently merge non-bisimilar nodes; ordinals cannot). Blocks = bisimulation
  classes; labels derive from structure alone, so bisimilar clusters
  discovered by SEPARATE walks reach identical fixpoints.
- **Emission**: each block's id is a deterministic rooted unroll of the
  quotient — on-stack targets render as bare `$<kind>_<relDepth>` tokens
  (relative to the emission stack, so entry-independent), off-stack targets
  re-expand, runs sort after resolution. The old `:sig` anchor machinery
  (`structuralSignature`/`sigCache`/`bareCycles`) is deleted — the quotient
  already separates distinct shapes.
- **The alias map** (the piece rooted-per-block emission alone misses): each
  block's COMPOSITION SPELLING (template with slots substituted by full final
  ids) maps to its canonical ids, so an entry container that sits OUTSIDE the
  pointer-SCC — the interned `Array<N0>` above, which never triggers
  canonicalization itself — remaps at its own cacheable pop. This is what
  converges the motivating Record case.
- **Overrides**: refinement and the PURE emission are suffix-free; a block's
  `overrideX` families key by its pure emission and the FINAL emission appends
  the `|cfn:` fold at each expansion site. Confirmed contract: overrides key
  STRUCTURALLY (bisimilar twins share the fold — the old raw base keys erased
  alias names too), pinned by `TestCanonicalID_OverriddenRecursiveTwinsConverge`.

## Done when — all satisfied

- The seeded repros converge: same-seed soak (base `20260730`, 45s) runs
  1283 types with 0 violations and 0 skips; a fresh 90s soak (base
  `20260731`) runs 2518 types clean.
- `hasContainerEntryReuse` + its skip counter are deleted from the fuzz lane.
- Knot-entry and acyclic convergence keeps passing: `TestCycleDepthID_*`
  (bare-token pins re-derived), the new `TestCanonicalID_*` suite (entry
  through container, entry-depth independence, mutual recursion from either
  entry, union arm order, recursive class-name distinctness, override
  convergence — the first three red on the pre-change tree), the define suite
  and id-integrity drivers, and the full Go + JS gates.

## Residual (narrower, pre-existing, documented in canonicalize.go)

Cross-walk partial-pointer-sharing: a later walk's cluster that references a
member of a PREVIOUSLY closed, bisimilar-overlapping cluster embeds that
member's finished id as an opaque leaf, so rotated hand-written partial
duplications of one cycle can still spell differently. This class diverged
before canonicalization too, is unreachable by the fuzz lane's two-sided
fixtures (the schema and type-first sides share no pointers), and is strictly
narrower than the class fixed here. If it ever surfaces, the fix is a
session-level block registry extending refinement over stored blocks.
