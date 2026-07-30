---
type: fix
spec: guidelines
status: done
created: 2026-07-29
---

# jsonSchema: shared recursive containers diverge from their type-first twin

**Status:** done — fixed Go-side (the depth-splice class; see "Shipped" below).
The residual entry-point-anchoring half of the family is split out to
[typeid-scc-entry-point-anchoring.md](../todos/typeid-scc-entry-point-anchoring.md).

Found by the M7 translation fuzz lane
([test/fuzz/jsonschema/](../../packages/ts-runtypes/test/fuzz/jsonschema/)) on
its FIRST 100-iteration batch (seed `3559572439` of base `0x5eeded`), then
minimized and confirmed against the real `jsonSchema()` builder through the
full vite pipeline.

## Symptom

A recursive type whose recursion is wrapped in **two or more structurally
identical containers** resolved to a DIFFERENT structural id when authored as
a JSON Schema literal than when authored type-first — so the two forms got
separate cache entries instead of converging on one factory object.

```ts
interface N1 {
  p1?: N1[];
  kids2: N1[]; // second occurrence of the SAME container shape N1[]
}
getRunTypeId<N1>(); // was W2kIowM
getRunTypeId(jsonSchema({$defs: {N1: {…, p1: {type: 'array', items: {$ref: '#/$defs/N1'}}, …}}, $ref: '#/$defs/N1'})); // was njtPnTP
```

## Root cause (as diagnosed, superseding the original canonicalization hypothesis)

Not a missing sharing-canonicalization: the id computer never emits DAG-share
tokens at all. The real defect was **stale-depth memo reuse** in
`typeid.Computer`:

1. The pointer-keyed cache stored FINAL id strings that can contain cycle
   back-edge tokens `$<kind>_<relDepth>:<sig>` whose `relDepth` was baked at
   first-visit stack depth. A cache hit at a DIFFERENT depth spliced the stale
   depth into the stream. The interned type-first container (`N1[]` once for
   both members) hit this; the schema side's per-literal containers walked
   fresh and stayed self-consistent — so the two forms disagreed.
2. Aggravator: `memberID` unconditionally pre-walked the raw `T | undefined`
   union wrapper of optional properties and discarded the result — polluting
   the cache with union-frame-inflated depths (the tuple and signature paths
   already used if/else).

## Shipped (2026-07-30)

All in `ts-go-runtypes/internal/cachegen/runtype/typeid/` (+ one call-site fix
in `serialize.go`):

- **Lowlink-gated caching**: a `lowlinks` slice parallels the walk stack
  (Tarjan-style); `cycleRef` records the escape on the top frame, and a frame
  popping with a token that dangles above itself is NEVER cached — every
  occurrence of a cycle-crossing subtree re-walks at its live depth.
  Self-contained cycle roots and all acyclic subtrees cache as before.
- **`memberID` if/else** — the discarded optional pre-walk is gone.
- **Cycle-before-cache in `Compute`** — a node both cached and on the live
  stack (re-entrant `BaseStructuralKey` walks) closes the cycle instead of
  splicing its completed root form.
- **Cold-computer stamp keys** — `stampOverrides` computes its lookup key on a
  fresh computer exactly like the override fold pass does; the warm hashing
  cache legitimately holds root-form spellings of cycle members that differ
  from the fold's entry-point spelling (surfaced by
  `TestOverride_RecursiveTypeItselfOverride` during the fix).
- **Frame helpers** (`pushFrame`/`popFrame`) shared by `Compute` and
  `BaseStructuralKey` so the parallel slices cannot desync.

Id impact: recursive types with optional container-wrapped self-refs and any
type that previously hit a stale-depth splice got corrected (changed) ids;
acyclic types, direct-ref recursion, and single-consistent-depth containers
kept theirs. Nothing committed bakes real ids and `constants.Version` rides
release bumps, so no artifact regeneration and no manual bump.

## Done when — all satisfied

- The repro converges (one id for both forms): pinned by the define suite
  ("shared recursive containers converge", "nested reuse", "root '#'
  self-ref through two identical containers") and Go-side
  `TestCycleDepthID_*` in
  [structuralid_cycledepth_test.go](../../ts-go-runtypes/internal/compiler/resolver/structuralid_cycledepth_test.go)
  (red on the pre-fix tree, green after).
- The broad `hasSharedRecursiveContainer` guard and its skip counter are
  deleted; the batch runs green without them. A NARROWER guard
  (`hasContainerEntryReuse`) remains for the split-out entry-point class
  only — same-seed soak: 1346 types, 0 violations, exactly the 3 residual
  fixtures skipped (previously 12 skipped under the broad guard).
- The probed class-boundary table is covered:
  `TestCycleDepthID_ConvergingClassesKeepConverging` pins every converging
  row; the diverging rows are the fixed tests above.
