---
type: fix
spec: guidelines
status: ready
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
