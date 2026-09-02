---
type: fix
spec: guidelines
status: done
created: 2026-09-02
---

# Size fuzz floor: the oversized negative control does not grow the cold buffer

## Intent

The `fuzz soak · size` job (`release-gate.yml`, `fuzz-soak.yml`) fails before its first
iteration with

```
size fuzz floor: the oversized value did not grow the cold buffer — the
respectBinarySize:false negative control lost its teeth (mock-sizing regression?)
```

thrown from `runFloor` in
[packages/run-types/test/fuzz/binary/sizeFuzzRunner.ts](../../packages/run-types/test/fuzz/binary/sizeFuzzRunner.ts)
(line 239 at the time). The floor generates an oversized mock with `respectBinarySize:false`
and expects it to overflow the estimated buffer; on CI it did not, so either the mock is no
longer oversized (a mock-sizing regression, the message's own guess) or the estimate grew
past what the negative control produces. Both cases mean the size fuzz is no longer proving
what it claims.

Found on 2026-09-02 by the release gate on PR #201 (run 33579204363, seed `0xd179ff0b`).
It reproduces locally with that seed (both tests fail in under a second), while an
unseeded `pnpm rtx core fuzz size --quick` on the same tree passes, so the floor's negative
control is seed-dependent, which is itself a weakness: the control must overflow for EVERY
seed. The branch touches no binary or mock code, so this predates it.

## Direction

- Replay with the CI seed: `MION_FUZZ_SEED=0xd179ff0b pnpm rtx core fuzz size --quick`.
- Read `runFloor` and the `respectBinarySize:false` mock path: what the control generates,
  how the cold buffer size is estimated, and why the two can end up on the same side for
  some seeds. Check recent commits to the mock sampler and to the binary size estimate.
- Fix the root cause (the mock sizing or the estimate), not the assertion: the control has
  to overflow deterministically, so the floor should not depend on the seed at all.
- Add a deterministic test for the control (a type whose oversized mock must overflow the
  estimate) beside the fuzz suite.

## Done when

- `MION_FUZZ_SEED=0xd179ff0b pnpm rtx core fuzz size --quick` and the soak pass.
- The negative control overflows for every seed (a few dozen seeds in a loop is enough
  proof), and a deterministic test pins it.
- `fuzz soak · size` is green on `main`.

## Plan (implemented 2026-09-02)

### Root cause

The floor type `{tag: string; items: string[]}` estimates to 82 bytes under `SIZE_CONFIGS[0]`
(items 8, stringBytes 8). The oversized generator (`mockOversized.ts`) started from a plain,
un-sized base mock and inflated ONE string to `2*stringBytes+1 .. 4*stringBytes` chars, past
that one position's budget only. The estimate is the SUM of every position's budget, so a
seed whose base value came in under budget elsewhere never reached it: under `0xd179ff0b`
the base gave `items: []` and a 23-char `tag` (reserve 5 + 3*23 = 74 < 82), so nothing grew.
Seed 8 did the same with a one-char `tag`. Every other seed "passed" only because the
un-sized base mock happened to be kilobytes of unicode strings against an 82-byte estimate,
so the overflow was never attributable to the inflation at all.

### Fix (the mock sizing, not the assertion)

- `binarySize.ts`: `resolveSizing` now also resolves `sizeMaxBytes` (default 64 KiB, the Go
  `DefaultSizeMaxBytes`), and `overBudgetLength(budgetBytes)` gives the shortest serString
  payload whose write reserve (`MAX_VARINT + 3*length`) exceeds a budget.
- `mockOversized.ts`: a string / bigint target is inflated to `overBudgetLength(sizeMaxBytes)`
  chars / digits (plus a little jitter). The estimator clamps every estimate to `sizeMaxBytes`,
  so that one position overflows any cold buffer ON ITS OWN, for every seed and every estimate
  the config can produce. Array-count inflation stays best-effort (documented), and the runner
  already treats a non-growing array-only type as "not exercised", not a violation.
- `createMockData.ts`: `respectBinarySize: false` now starts from the same in-bounds base value
  as `true` (`applyInBoundsSizing`), so the overflow is the inflated position's alone and the
  oversized values stay small.
- The `runFloor` assertion is untouched: it still throws when the control loses its teeth.

### Tests

- `test/suites/mocking/respectBinarySize.test.ts`: the `false` cases now pin, for 64 seeds each,
  that the inflated string / bigint reserve exceeds `sizeMaxBytes` while the rest stays in-bounds,
  the array fallback, the untouched `maxLength` field, and the default 64 KiB cap.
- `test/fuzz/binary/binaryOversizedControl.test.ts` (resolver-backed): compiles the floor type
  under every `SIZE_CONFIGS` entry and checks, for the CI seed, seed 8, the default seed and
  48 more, that the in-bounds value never grows and the oversized value always grows.

### Docs

No website change: the mocking page's option row ("steer a value to fit, or deliberately
exceed, the estimate") stays true. The fuzz README and the option's JSDoc describe the cap.
