---
type: fix
spec: guidelines
status: ready
created: 2026-08-08
---

# The non-data soak finds O1 violations: mock values the validator rejects

## Symptom

The DataOnly non-data soak lane reports **O1** violations — "validate rejected a
value the mock generator produced" — at a rate of roughly 3 per 470 generated
types. O1 is a strong oracle: `createMockDataFn<T>()` must produce a value that
`createValidateFn<T>()` accepts, so every hit is either a mock bug or a validator
bug, and the two disagree on the same `T`.

Found on 2026-08-08 while fixing the soak-timeout item of
[fuzz-followups](../done/fuzz-followups.md). It is **not** caused by that change
(the fix only bounds when the loop stops; the per-iteration seeds are untouched)
— it was hidden before, because the soak used to die on a vitest timeout before
its assertion was read.

## Reproduction

```bash
RT_FUZZ_NONDATA_SOAK_MS=20000 RT_FUZZ_SEED=1 pnpm exec vitest run nonDataTypeFuzz.integration -t soak
# or, now that the lane has an rtx entry:
RT_FUZZ_SEED=1 pnpm rtx core fuzz nondata --soak
```

`[nondata-fuzz] soak finished: 466 types, 3 violation(s), 0 invalid-TS false
positive(s) filtered`. Every violation prints its per-iteration `seed`, so each
replays exactly.

## The three findings (seed 1, 20s budget)

Two distinct shapes, worth splitting once diagnosed:

1. **Negated format** — `¬F:iriReference` (seed `4176415290`), value
   `"Vh_im()#,iO0zk&GS_7"`. The type is "a string that is NOT an
   `iriReference`"; the mock produced this string and the validator rejected it.
   The smallest of the three and the natural starting point: either the mock's
   negation arm draws from a pool the validator still considers a match, or the
   negation validator is over-broad.

2. **Object intersections** — `({4}&{4}&{4})` (seed `1761395552`) and
   `({4}&{3}&{2})[]` (seed `1191249200`), i.e. an intersection of 2-4 member
   object types, and an array of one. The mock builds a value per intersection
   member and merges; the validator checks the merged shape. A member whose
   generated value is overwritten by a later member's key of a different type
   would produce exactly this.

## Direction

Diagnose each shape from its seed, decide whether the mock or the validator is
wrong, and fix with a pinned regression test per shape (the enumerated suites
under `packages/ts-runtypes/test/suites/`, not the fuzz lane). Then re-run the
soak to confirm the rate drops to zero.

Check whether the WILD lane (`pnpm rtx core fuzz types --soak`) reports the same
shapes: its values come from `shapeValue.ts` rather than the product mock, so a
hit there points at the validator and a miss points at `createMockDataFn`.

## Done when

Every O1 shape above is diagnosed, fixed at its real cause, and pinned by an
enumerated regression test; a 60s `nondata` soak reports zero violations.
