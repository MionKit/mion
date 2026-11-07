---
type: fix
spec: guidelines
status: ready
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
