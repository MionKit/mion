---
type: fix
spec: guidelines
status: done
created: 2026-11-06
---

# bench-fairness: the clock-read ratio test fails on a busy machine

## Intent

`packages/devtools/test/bench-fairness.test.ts` ("reads the clock once per 1000 or more validator calls, and calls
the validator on every sample") failed once in a full local `pnpm test` and passes alone:

```
AssertionError: expected 400 to be greater than or equal to 500
 ❯ test/bench-fairness.test.ts:40:36
```

A test that depends on how fast the machine is will go red in CI some day for no reason. Make it deterministic.

## Direction

- `benchOps` (the `measure.ts` harness the test loads) reads the clock once to start, once per loop check and once
  for the elapsed time. With 1000 calls per round and `k` rounds, the test's ratio is `1000k / (k + 3)`: it reaches
  500 only when the timed window fits 3 or more rounds. Under load it fit 2 (`2000 / 5 = 400`).
- Likely fix: drive `performance.now` from the spy so the window holds a known number of rounds, then assert the
  structural claim (each timed round makes >= 1000 calls per clock read) exactly. Keep the test proving what its name
  says; do not just lower the bound.
- The implementer confirms the harness shape before choosing.

## Docs

Docs: none, because this changes only a test.

## Done when

- The test passes no matter how many rounds fit the window (checked with a mocked clock that yields 1, 2 and many
  rounds), and still fails if a timed round reads the clock per call.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.

## Plan: fake clock (approved 2026-11-06, automatic delegated run)

- Harness confirmed: warm-up of 1000 rounds before the clock starts, then 1 start read, 1 read per loop check
  (`k` passing + 1 failing) and 1 elapsed read: `k + 3` reads for `k` timed rounds.
- Test only (`packages/devtools/test/bench-fairness.test.ts`): `performance.now` returns 0 for the start read and the
  first `k` checks, then a large time, so the loop runs exactly `k` rounds. Run for `k` = 1, 2 and 50.
- Assert exactly: `reads === k + 3`, and timed calls / timed rounds >= 1000. A harness that reads the clock per call
  makes about 1 call per read and fails.
- No docs (test only), no fuzzing (fix, not a feature).
- Considered instead: the harness counting its own rounds with the real clock. The user chose the fake clock: it pins
  the exact read count and leaves the benchmark code untouched.
- Review fixes: the test pins `MION_VALIDATION_BENCH_TIME_MS` (an empty, 0 or huge ambient value broke the count),
  and the start read clears `seen`, so "every sample" is proven for the timed rounds, not the warm-up.

## Widened: the same class of test (asked by the parent session, with the user's go-ahead)

Tests that asserted on real elapsed time now assert their claim directly:

- `packages/run-types/test/features/jsonDecodeArrayGuard.test.ts`: the decoded field is the untouched
  `{length: 1e9}` object (a loop over it would hang or fill the heap), and validate refuses it.
- `packages/devtools/test/eslint/session.test.ts`: a 0 ms budget makes the first file time out; the second file gets
  the exact same error, naming the first file, so it came from the sticky flag and sent no new request.
- `packages/platform-node/test/security.spec.ts`: the oversized `Content-Length` request sends no body at all, so only
  a refusal from the headers can answer.
- `packages/run-types/test/features/jsonDecodeBadContent.test.ts`: the `toThrow(RangeError)` already proves it does
  not hang; the 5 s limit is gone.
- Kept: `packages/run-types/test/fuzz/type/nonDataMockSpeed.smoke.test.ts`. Its claim is about speed (an 8 s mock
  regression) and its 15 s ceiling is generous; a work count would need new counters in the mock generator.
