---
type: fix
spec: guidelines
status: ready
created: 2026-11-08
---

# Playground engine tests time out under a full test run

## Intent

`packages/run-types/test/playground/engine.test.ts` has tests slow enough to hit the 30 s test timeout when
the whole suite runs at once. A full `pnpm test` on 2026-11-08 failed only on this:

```
FAIL |playground| engine.test.ts > playground engine (WASM, live execution) > mockInvalid (negative generator) produces values that fail validation
Error: Test timed out in 30000ms.
```

The same project alone passes (73/73), with these times:

- `mockInvalid (negative generator) produces values that fail validation`: ~8.4 s (8 rounds of `mockInvalid` + `validate`).
- `every preset shows real emitted factories for every function, and a validator for each`: ~13.9 s.

A flaky gate trains people to rerun until green. Goal: these tests pass reliably under full load.

## Direction

- First find where the time goes: each round recompiling the type in WASM, a cold engine per call, or the
  generator itself. Fix the cause (reuse one compiled type across rounds, fewer rounds that still prove
  the claim) before reaching for a bigger timeout.
- A larger per-test timeout is fine only once the remaining time is shown to be real work.
- Done when: a full `pnpm test` passes three times in a row with no playground timeout, and each touched
  test still proves what its name says.
