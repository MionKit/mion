---
type: fix
spec: guidelines
status: ready
created: 2026-07-29
---

# jsonSchema: shared recursive containers diverge from their type-first twin

Found by the M7 translation fuzz lane
([test/fuzz/jsonschema/](../../packages/ts-runtypes/test/fuzz/jsonschema/)) on
its FIRST 100-iteration batch (seed `3559572439` of base `0x5eeded`), then
minimized and confirmed against the real `jsonSchema()` builder through the
full vite pipeline. Shipped with the lane as a documented, counted skip
(`hasSharedRecursiveContainer` in
[schemaRender.ts](../../packages/ts-runtypes/test/fuzz/jsonschema/schemaRender.ts));
remove that guard when this is fixed.

## Symptom

A recursive type whose recursion is wrapped in **two or more structurally
identical containers** resolves to a DIFFERENT structural id when authored as
a JSON Schema literal than when authored type-first — so the two forms get
separate cache entries instead of converging on one factory object.

```ts
interface N1 {
  p1?: N1[];
  kids2: N1[]; // second occurrence of the SAME container shape N1[]
}
getRunTypeId<N1>(); // W2kIowM
getRunTypeId(
  jsonSchema({
    $defs: {
      N1: {
        type: 'object',
        properties: {
          p1: {type: 'array', items: {$ref: '#/$defs/N1'}},
          kids2: {type: 'array', items: {$ref: '#/$defs/N1'}},
        },
        required: ['kids2'],
      },
    },
    $ref: '#/$defs/N1',
  })
); // njtPnTP — DIVERGES
```

Validation/serialization of each form is individually correct; only the
convergence contract (same shape → same id → same cached factory) breaks.

## Class boundary (probed)

| shape | converges? |
| --- | --- |
| `{value: number; next?: N1}` — direct ref, any count of direct refs | yes |
| `{kids: N1[]}` — ONE container-wrapped recursive ref (required or optional) | yes |
| `{a?: N1; b: N1[]}` — direct + container mixed | yes |
| `{x: string[]; y: string[]}` — duplicated NON-recursive containers | yes |
| `T = T[][] \| number` via root `$ref: '#'` — single nested occurrence | yes |
| `{p1?: N1[]; kids2: N1[]}` — TWO identical recursive containers ($defs form) | **no** |
| `{p1?: T[]; kids2: T[]}` — same class via root `$ref: '#'` | **no** |
| `{x: N1[]; y: N1[][]}` — nested reuse (inner `N1[]` shared) | **no** |

## Mechanism (evidence-backed hypothesis)

On the type-first side the checker interns `Array<N1>` ONCE — both properties
point at the same type object. On the schema side each
`{type: 'array', items: {$ref: ...}}` literal occurrence is its own fresh
object type, so `FromJsonSchemaIn` instantiates a distinct (structurally
identical) array type per occurrence. Bare `$ref`s are immune because the
lookup canonicalizes through the single `$defs` node (`D[Name]` resolves to
one type), and acyclic duplicates are immune because the id computer
canonicalizes repeated acyclic structure. The divergence is specifically the
id computer's cyclic walk folding NODE SHARING (shared vs duplicated
structurally-identical nodes inside a cycle) into the emitted token stream —
presumably via where its back-ref/cycle tokens anchor.

## Fix direction

Type-level dedupe is not expressible (no hash-consing of structural types in
TS), so this needs the Go id computer (`typeid.go`, the structural cycle-token
anchor) to canonicalize shared-vs-duplicated identical nodes in cyclic graphs
— e.g. keying back-refs by the structural hash of the target rather than node
identity, or re-walking shared nodes as if expanded. That is a hash-affecting
change (bump `constants.Version`), and the zero-Go-changes invariant of the
implementation todo is why it ships as a known gap instead of a fix.

## Done when

- The repro above converges (one id for both forms), pinned by a define-suite
  case or an id-integrity case covering ≥2 identical recursive containers.
- `hasSharedRecursiveContainer` + its skip counter are deleted from the fuzz
  lane and a re-run batch stays green without them.
- The probed class-boundary table above is covered by tests (the converging
  rows must KEEP converging).
