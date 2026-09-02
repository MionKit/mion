---
type: fix
spec: guidelines
status: done
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

## Plan (approved 2026-09-02, implemented the same day)

Findings that shaped it:

- No fixing commit exists. Rebuilding the resolver at the root commit of the current history
  (`ece3e26`, the one that also set `expectedRefusals: 23`) and converting that commit's own
  suite tree already yields 22 refusals. The number was stale from the start; nothing in the
  converter changed the count since.
- The suite tree refuses five KINDS: a `unique symbol` literal at a call site (12), a nested
  recursive type reached through `DataOnly<T>` at a call site (4), a recursive tuple reached
  through `DataOnly<T>` at a call site (2), a symbol-keyed member (2), and an `@nonEnumerable`
  member (2). Only the last two kinds had a row in `unsupported-conversion.test.ts`; the docs
  table carried a third row ("a recursive type written inline at a call site") that described
  no real refusal: a call naming a local recursive type is skipped silently, not refused.
- The count cannot be derived from the table: the table lists kinds, the count is instances.
  What CAN be derived is whether every printed refusal belongs to a documented kind.

What shipped:

1. `scripts/core/converted-suites.mjs`: `expectedRefusals` is 22, and every refusal line must
   now contain the `says` fragment of a row in `unsupported-conversion.test.ts` (read off the
   test file itself). An undocumented refusal fails the run with the offending lines, so a new
   limitation cannot land without its row, and a fixed one still trips the count.
2. `packages/run-types/test/features/unsupported-conversion.test.ts`: four new rows, each a
   real declaration handed to the real binary: the unique symbol literal, the `@nonEnumerable`
   member, the nested recursive type through `DataOnly` at a call site, and the recursive tuple
   through `DataOnly` at a call site. The comment on recursion explains why a call site refuses
   where a declaration converts.
3. `container/website/sites/runtypes/content/02.guide/13.source-conversion.md`: the "what does
   not convert" table mirrors the test rows again (four rows added, the inaccurate inline-call
   row reworded to the mapped-type shape that actually refuses).

Verified: the unsupported-conversion test passes (8 rows), and `pnpm rtx core converted-suites`
generates the builders tree with 22 documented refusals and runs it green.
