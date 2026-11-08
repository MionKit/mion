---
type: fix
spec: guidelines
status: done
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

## What shipped

- **Cause:** every engine call re-ran a whole-program WASM scan (~350 ms). One round of the mockInvalid test
  made three (its validator, its generator, then the test's own `run('validate')`), so 8 rounds made 24.
- **Fix:** `scan()` in `container/website/app/playground/engine.ts` keeps its results. Lookup goes by resolver
  `dispatch`, then by the package-sources overlay object, then by the full scan source. It keeps the newest 64
  and drops the oldest first. A scan is a pure function of its sources, so a stored result is the same answer.
  The browser playground gains too: a repeat click on the same snippet skips the scan.
- **Result:** the mockInvalid test went from ~8.4 s to under 1 s (2 scans instead of 24). Three full `pnpm test`
  runs in a row passed with no playground timeout, while image builds loaded the machine (memo as shipped;
  the review then added the two tests below and narrowed one type).
- **Preset test left as is:** "every preset shows real emitted factories..." makes about 40 scans, every one a
  different preset, factory or option, so nothing repeats to reuse. That is real work. Its 120 s limit was
  already there and stays.
- **Tests:** a fake resolver counts scans with no WASM: a repeat is reused, the 65th distinct snippet pushes out
  the oldest, and new package sources start over. A real-resolver test shows a second `mockInvalid` call scans
  nothing new.
