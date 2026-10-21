# Step 4: Replay seed, shrinking, the loop, the gap table

The four pieces: input maker ([input-makers.md](input-makers.md)), replay seed, loop, shrinker.
Reuse what exists, build only the gaps.

## The replay button (seed)

- List **every** non-deterministic source the code or the maker touches: RNG, `Date.now()`, filesystem, network,
  hash seeds, `Object` key order, `Set` / `Map` iteration order.
- Make each one replayable from one saved number, or a failure cannot be reproduced and the loop is useless.
- Repo trick: don't thread an RNG through every call. Swap `Math.random` for a seeded one for one run, then restore:

```ts
// packages/run-types/test/fuzz/core/seededRng.ts (real)
export function withSeededRandom<T>(seed: number, fn: () => T): T {
  const original = Math.random;
  Math.random = mulberry32(seed); // tiny, fast, well-distributed 32-bit PRNG
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}
// mixSeed(baseSeed, label, iteration) → one uint32 per run, so two targets never share a draw stream.
```

- Everything else random: pin it. Pass a fixed `now`, use an in-memory filesystem, sort keys before comparing.
- Rule: a `Violation` carries the single `seed` that replays it:

```ts
// packages/run-types/test/fuzz/value/fuzzOracle.ts (real)
export interface Violation {
  oracle: OracleId;
  target: string;
  seed: number; // ← the exact seed to replay this iteration
  phase: 'valid' | 'invalid' | 'junk' | 'compile';
  message: string;
  value: string;
}
```

## Shrinking a failure

- Raw random failure = huge + noisy. Shrinking to the smallest still-failing input makes it diagnosable.
- fast-check: free, built in. On failure prints seed, shrunk counterexample, shrink count.
- By hand, pick one:
  - smallest-prefix: fewest first-K actions that still fail (the enrich fuzzer uses this).
  - drop-subsets: remove chunks, see if it still fails.
  - simplify-the-value: shrink the input itself.
  - conservative generation: failures already small. RunTypes corrupts exactly ONE position → O2 near-minimal.
- Event streams: shrink = drop events + simplify each event. `fc.commands` shrinks command lists for you.
- Always keep the **seed** alongside the shrunk reproducer.

## Wire the rules into the loop

- Loop = run an input, check every rule, record any failures.
- Rules in one place, each returning a replayable `Violation`, as `fuzzOracle.ts` does.
- The `FuzzTarget` interface IS the contract between input maker and rules:

```ts
// packages/run-types/test/fuzz/value/fuzzOracle.ts (real, trimmed)
export interface FuzzTarget {
  title: string;
  schema: RunType; // drives mock + corruption (the input maker)
  validate: (v: unknown) => boolean; // SUT functions to exercise...
  getValidationErrors: (v: unknown) => unknown[];
  jsonEncode?: (v: unknown) => string | undefined;
  jsonDecode?: (s: string) => unknown;
}
// each check*(target, value, ctx) → Violation | null   ← one rule, one function
```

## Fill the gap table with the user (the hand-off)

Fill together, then build only what is **missing**:

| Part        | Need                            | Tool (existing or to build) | Have? | Build? |
| ----------- | ------------------------------- | --------------------------- | ----- | ------ |
| Generator   | valid-input producer            |                             |       |        |
|             | invalid / near-miss producer    |                             |       |        |
| Determinism | seeded RNG + injected I/O       |                             |       |        |
| Observation | value / error / files / diag    |                             |       |        |
| Shrink      | minimiser or conservative gen   |                             |       |        |
| Runner      | iterate × seed × collect        |                             |       |        |

- Worked, RunTypes value fuzzing: every cell "have", each a real file (`createMockDataFn` / `invalidValue.ts` /
  `seededRng.ts` / return + throw / one-spot corruption / `fuzzRunner.ts`). Why it stood up fast.
- Enrichment pipeline has gaps (event maker + state model):
  [enrich-pipeline.md](enrich-pipeline.md#building-the-pieces).
- Come in with rules from [rules.md](rules.md), or from [grow-test.md](grow-test.md) if an example test exists.
