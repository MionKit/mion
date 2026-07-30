---
type: fix
spec: guidelines
status: ready
created: 2026-07-30
---

# typeid: cycle back-edges anchor at the walk's SCC entry point, not canonically

The residual half of the shared-recursive-container divergence family. The
depth-splice half was fixed by the lowlink cache gate
([json-schema-shared-recursive-container-id-divergence.md](../done/json-schema-shared-recursive-container-id-divergence.md));
this half needs bisimulation-canonical anchoring and is guarded in the fuzz
lane meanwhile (`hasContainerEntryReuse` in
[schemaRender.ts](../../packages/ts-runtypes/test/fuzz/jsonschema/schemaRender.ts)
— delete it with this fix).

## Symptom (empirical, seeded)

When a walk ENTERS a recursive type's cycle through a container that the
cycle also contains, the back-edge targets the container frame; a walk whose
containers are cloned per occurrence (the jsonSchema authoring path) anchors
at the interface knot instead. Same structure, different token streams,
different ids.

Reproduced by the json-schema translation fuzz lane at base seed `20260730`,
iteration seeds `1662213203`, `2140920747`, `2144068665` — all three the same
shape class, minimal form:

```ts
interface N0 {p1: N0; p2?: N0[]; p3: string; kids4: N0[]}
type T = Record<string, N0[]>; // entry through Array<N0>, which N0 also contains
```

Type-first: the checker interns `Array<N0>` once; walking
`Record → Array<N0> → N0 → kids4` finds `Array<N0>` ON THE STACK and emits
`$<KindArray>_2` targeting the array frame. Schema-authored: each
`{type: 'array', items: {$ref: '#/$defs/N0'}}` literal is a fresh type, so
`kids4` walks a new array whose element back-edges to `N0`
(`$<KindObjectLiteral>_2`). Both strings are self-contained and internally
consistent — they disagree only on WHERE the cycle closes.

Knot-entry shapes (`type T = N1` with repeated containers inside) converge
since the lowlink fix — pinned by
`TestCycleDepthID_SharedVsDuplicatedContainer` and the define suite. Root-only
repetition (no container inside the cycle) also converges. The open class is
exactly: a container subtree on the root-to-knot path that also occurs inside
the cycle.

## Fix direction

Canonical back-edge anchoring: the token must not depend on which node of the
SCC the walk happened to enter through. The principled fix is
bisimulation-style canonicalization (compute ids on the quotient of the type
graph by structural bisimilarity, or canonicalize the anchor to a
deterministic SCC representative — e.g. the member with the least structural
signature). Hash-affecting for the entry-point class; the lowlink gate and its
tests must keep holding. Non-trivial: design before code (partition
refinement over the pointer graph, or a rooted-minimization pass in
`structuralSignature`).

## Done when

- The seeded repros above converge (fuzz lane, same seeds).
- `hasContainerEntryReuse` + its skip counter are deleted from the lane and a
  long soak stays green without them.
- Knot-entry and acyclic convergence tests keep passing
  (`TestCycleDepthID_*`, the define suite, id-integrity).
