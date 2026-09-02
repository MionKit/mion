---
type: fix
spec: guidelines
status: ready
created: 2026-09-02
---

# The converted-suites refusal count no longer matches the tree (23 expected, 22 seen)

## Intent

The release gate's "suite tree in the value forms" job (`pnpm rtx core converted-suites`)
fails on `main`: the builders conversion now refuses 22 declarations, and
[scripts/core/converted-suites.mjs](../../scripts/core/converted-suites.mjs) still expects 23.
The script's own message says what happened: a conversion limitation was fixed and the count
was not lowered with the commit that fixed it. Until it is, `release-gate.yml` cannot go green,
so no release can ship.

Found on 2026-09-02 while running the release gate on the merge-plan close-out branch
(PR #201); reproduces locally on that branch and predates it (the branch touches no
conversion code).

## Direction

- Reproduce: `pnpm rtx core converted-suites`. The log lists the 22 remaining refusals.
- Find which of the 23 documented limitations now converts: diff the listed refusals against
  the rows in
  [packages/run-types/test/features/unsupported-conversion.test.ts](../../packages/run-types/test/features/unsupported-conversion.test.ts)
  (that test is the documented list; when a row starts converting it fails too, so it may
  already be red, or its row may already have been removed without the count following).
  `git log` on `ts-go-runtypes/internal/convert` (or the equivalent package) shows the fixing
  commit.
- Lower `expectedRefusals` to 22 and, if the unsupported-conversion table still carries the
  fixed row, drop it. Keep the count and the table in the same commit, as the script asks.
- Consider deriving the expected count from the unsupported-conversion rows instead of a
  literal, so the two can never drift again; the implementer decides whether that is worth it.

## Done when

- `pnpm rtx core converted-suites` passes.
- `packages/run-types/test/features/unsupported-conversion.test.ts` passes and lists exactly
  the refusals the script prints.
- `release-gate.yml`'s "suite tree in the value forms" job is green on `main`.
