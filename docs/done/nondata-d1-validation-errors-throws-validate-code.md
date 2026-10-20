---
type: fix
spec: guidelines
status: done
created: 2026-10-20
---

# nondata soak: getValidationErrors throws a `validate-*` diagnostic its call site never reported (D1)

## Evidence

Release PR #507 (`release/v0.13.1`, commit `53243aa2a`), lane `gate / fuzz soak · nondata`:

```
[nondata-fuzz] seed 0x30b95e85 from MION_FUZZ_SEED
[nondata-fuzz][D1/compile] {4} (seed=3823141169): getValidationErrors throws [validate-non-data-root]
  but its call site reports only validation-errors-non-data-property-dropped,
  validation-errors-non-data-root, validate-non-data-property-dropped
soak finished: 3455 types, 1 violation(s)
```

Generated type:

```ts
type T = {
  p0: Float64Array;
  p1?: RegExp;
  p2:
    | {kind: 't0'; f0: Record<string, bigint>; f1: Set<SharedArrayBuffer>; f2: RegExp}
    | {kind: 't1'; f0?: RegExp; f1: Record<string, Date>}
    | {kind: 't2'};
  p3?: Map<string, SharedArrayBuffer>;
};
```

The runtime error of `createGetValidationErrorsFn<T>()` carries the `validate-non-data-root` code,
while the compile-time diagnostics at that call site name `validation-errors-non-data-root`.
Either the runtime throw uses the wrong family's code or the build reports the wrong one.

## Repro

```bash
pnpm run check:builds   # rebuild the resolver first: a stale binary gives false results
MION_FUZZ_SEED=0x30b95e85 pnpm miondevx core fuzz nondata --soak
```

Never re-roll the seed. The soak is time-bound, so a rerun may stop before this type; the iteration seed
`3823141169` rebuilds it alone (now pinned in `diagnosticTruth.smoke.test.ts`). The suspected cache entry shared
between families was not the cause: see the plan below.

## Intent

D1 holds: whatever a generated function throws at runtime is named by the diagnostics its call
site reports at build time. Fix the real cause, with a regression test for the shrunk type.

## Plan: report every reached throw (approved 2026-10-20, automatic mode)

Cause: not a cache entry shared between families. `ReportReachedFindings` hid a foreign throw (the validate
entry a union asks to pick its member) whenever the site's own family reached a throw with the same args. Both
`validate-non-data-root` and `validation-errors-non-data-root` carry `[NonSerializableClass]`, so the validate
throw was hidden, though the two fire at unrelated positions (`p2`'s `Set<SharedArrayBuffer>` member vs `p3`'s
Map value). At runtime a throwing entry throws when its parent materializes it, so whichever `getRT` runs first
decides the code: here the union's validate lookup. The `ArrayBuffer | SharedArrayBuffer` encoder case the
filter was written for throws `validate-non-data-root` too, so the filter was wrong there as well.

- `typefunctions/module.go`: report every throw a site reaches, own family or not. Drop the own/foreign filter;
  `reachableFindings` returns the throws as diagnostics, since no caller needs the entries any more.
- Go tests, both call shapes: flip `TestNestedThrow_OwnFamilyThrowWins_*` to require both codes; add a pair for the
  shrunk fuzz shape (validation-errors union with a `Set<SharedArrayBuffer>` member + a Map of the same kind).
- Pin iteration seed `3823141169` in `diagnosticTruth.smoke.test.ts` (fails on the old binary with the soak's D1).
- `dataonly-union-drop.test.ts`: its three `HasNativeUnion` encoder sites now also name `validate-non-data-root`.
- No docs: no page describes the hidden code. Not a fuzz candidate: the nondata lane already covers it.
