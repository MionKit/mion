---
type: fix
spec: guidelines
status: done
created: 2026-10-01
---

# Make mocking nested Sets and Maps fast

## Problem

`createMockDataFn` takes seconds to build one small value for a nested collection type:

```ts
createMockDataFn<Record<string, Set<Map<string, Record<string, string>>>>>()(); // ~5.7 s per value
createMockDataFn<Set<Map<string, Record<string, string>>>>()(); // ~240 ms per value
```

The value it returns is tiny (about 400 characters of JSON). Measured on a cloud session, with and without
`{mock: {nonDataTypes: true}}` (about the same). The non-data fuzz lane found it: seed 3635804914 under
`NONDATA_GEN_OPTIONS` (`pnpm miondevx core fuzz nondata`) spends about 8 s per mock call, so one round crossed the
soak's 30 s slow-iteration ceiling.

## Direction

- Find where the time goes in `packages/run-types/src/mocking/` for a `Set` whose items are `Map`s (likely a
  uniqueness or retry loop for structured Set items, or a size/decay setting that does not shrink with nesting).
- Fix the generator so this shape mocks in well under 100 ms per value, without weakening what the mock guarantees
  (valid values, determinism under a seed).
- Pin it with a test that times this shape, plus the seed above replayed through the non-data lane.

## Done when

- Both shapes above mock in under 100 ms per value.
- A regression test fails if the time comes back.

## Plan — shrink the item cap per collection level (approved 2026-10-01, owner away, default taken)

- Cause: the mock was never tiny. `JSON.stringify` prints a Set or Map as `{}`, which hid the size. Every Set, Map,
  array and record drew up to `maxRandomItemsLength` (60) items at EVERY level, so four levels held about a million
  leaves (72 MB as JSON with Sets and Maps spread). No retry loop was involved.
- Fix: `shrinkForNestedItems` in `packages/run-types/src/mocking/mockType.ts` divides `maxRandomItemsLength` by 4
  for the items of each array, rest, Set, Map, index signature and patternProperties value (60, 15, 3, 1, 1, ...).
  It never drops below 1 unless the caller set 0 or 1. An explicit `arrayLength` or `rt$length` still wins.
- Tests: `test/features/mockNestedCollections.test.ts` (both shapes under 100 ms per value, leaf count bounded,
  every draw validated, seeded determinism, `arrayLength` still applies at every level) and
  `test/fuzz/type/nonDataMockSpeed.smoke.test.ts` (seed 3635804914 replayed under `NONDATA_GEN_OPTIONS`).
- Docs: the `maxRandomItemsLength` row of the mock options table (`02.runtypes/02.guide/07.mocking.md`) now says each
  nested level divides the cap by four.
- Shipped: both shapes now mock in about 10 ms per value (was 0.2 s and 3 to 8 s), and the seed replay passes.
