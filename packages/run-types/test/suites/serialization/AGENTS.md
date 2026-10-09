# Serialization case-suite authoring

Governs this dir AND [`../format-serialization/`](../format-serialization/).

- Both express cases as `SerializationCase` records.
- Type lives in [`types.ts`](./types.ts); format-serialization re-exports it.
- Each `*.ts` file exports a group of cases.
- Sibling `*.test.ts` runs every case through the shared round-trip adapters in
  [`../../util/serializationAsserts.ts`](../../util/serializationAsserts.ts):
  mutate / clone on both sides, compact × compact, plus the value-first `schema` variants.

## ⚠️ Every thunk is self-contained: define ALL types INLINE

- `SerializationCase` = bag of THUNKS: `mutateEncoder` / `cloneEncoder` / `compactEncoder` / `cloneDecoder` /
  `mutateDecoder` / `compactDecoder` / the `schema*` variants / `getTestData`.
- Every type a thunk needs (interfaces, classes, `TF.*` format types, type aliases) MUST be declared INSIDE that thunk.
  Never at module scope.
- Duplication across thunks is deliberate and required.
- Why: each thunk is lifted out as a STANDALONE code sample (website doc pipeline, benchmark harness, code extraction).
  It must compile + run in isolation.
- Type from module scope (or shared via a module-level helper) breaks that extraction.
  → Repeat the type, plus any `registerClassSerializer` / setup call it depends on, in full, in each thunk.
- See the `schemaEncoder` note in [`types.ts`](./types.ts).
- Canonical shape: [`LargeObjects.large_class_union`](./LargeObjects.ts).

```ts
// RIGHT: the class (and its register call) live inside the thunk
mutateEncoder: () => {
  class Ledger { constructor(public owner: string, public balance: bigint) {} }
  registerClassSerializer(Ledger, {deserialize: (d) => new Ledger(d.owner, d.balance)});
  return createJsonEncoderFn<Ledger>(undefined, {strategy: 'mutate'});
},
// WRONG: `class Ledger {}` at module scope, referenced from the thunk.
```

## Class-serializer cases

- Define the class + its `registerClassSerializer(Cls, {deserialize})` INSIDE each thunk (rule above).
- Registry keyed by the class's TYPE ID. Same name + shape → same id in every thunk.
  So per-thunk classes register / look up consistently.
- Round-trip comparison strips prototypes (`normalizeForComparison`).
  Reconstructed instance compares structurally to the `getTestData` instance, whichever thunk's class made it.
- Class is not expressible as a value-first `RT.*` model → set `schemaEncoder` / `schemaDecoder` to `'not-supported'`.
  The id-integrity driver then skips the schema-vs-type comparison for that case.
- Worked examples: `Objects.ts`, `format-serialization/Realworld.ts`.

## Prefer an EXISTING group over a new one

- Add a case to the group it fits.
  Class is object-like → `Objects.ts`. Formatted DTO → `format-serialization/Realworld.ts`.
- Why: every group name is a surface several consumers must know:
  - round-trip runner (`*.test.ts`) and [`../id-integrity/serializers.test.ts`](../id-integrity/serializers.test.ts).
  - benchmark data generator + the `BenchTable` component that renders it:
    [gen-serialization.mjs](../../../../../scripts/website/bench-data/gen-serialization.mjs).
- Existing group already flows through ALL of them: a case added there is covered everywhere for free.
- New group = new key every consumer must pick up (plus `groupToFile` name mapping, aggregation counts, table layout).
  Easy to under-wire → partial coverage.
- New group only for a genuinely new category. Then verify each consumer above.
- To add one: register it in its `index.ts` (`SERIALIZATION_SPEC` in [`index.ts`](./index.ts),
  or `FORMAT_SERIALIZATION_SUITE` in format-serialization).
  Add a sibling `*.test.ts` iterating it through the `serializationAsserts` helpers.
