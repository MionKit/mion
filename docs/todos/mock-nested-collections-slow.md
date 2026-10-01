---
type: fix
spec: guidelines
status: ready
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
