---
type: fix
spec: guidelines
status: ready
created: 2026-09-21
---

# The type-budget project trips vitest's default hook timeout under load

## Intent

[packages/type-budget/vitest.config.ts](../../packages/type-budget/vitest.config.ts) sets no
`hookTimeout` and no `testTimeout`, so the project runs on vitest's 10 second defaults:

```ts
test: {
  name: 'type-budget',
  environment: 'node',
  include: ['test/**/*.test.ts'],
},
```

Its `beforeAll` is not a setup step, it is the measurement. `modelPipeline.compile.test.ts` compiles
one TypeScript snippet per pipeline step, then a consumer lane on top:

```ts
describe('model pipeline — per-step type-instantiation budget', () => {
  beforeAll(() => {
    for (let i = 0; i < PIPELINE_STEPS.length; i++) {
      const result = measurePipeline(snippetUpTo(i));
      ...
    }
    consumer = measureConsumerLane();
```

That is minutes of `tsc` work squeezed into a 10 second budget.

[packages/run-types/vitest.config.ts](../../packages/run-types/vitest.config.ts) already raises both
to 30000 for exactly this reason, so the precedent is in the tree.

## Repro

`pnpm run test:ci` on a loaded host. The `mion-rest` batch fails:

```
FAIL  |type-budget| test/modelPipeline.compile.test.ts > model pipeline — per-step type-instantiation budget
Error: Hook timed out in 10000ms.
 ❯ test/modelPipeline.compile.test.ts:81:3
     81|   beforeAll(() => {

❯ |type-budget| test/modelPipeline.compile.test.ts (11 tests | 8 skipped) 10598ms
core test-batches: batch 'mion-rest' failed
```

10598ms against a 10000ms budget. `pnpm exec vitest run --project type-budget` on its own passes in
20s, so it is load, not a real regression. That makes it a CI flake that only shows up when the
batches compete, which is the worst kind: it fails a PR that changed nothing near it.

## What to settle

The obvious fix is a `hookTimeout` (and probably `testTimeout`) on the project config, matching what
`run-types` already does. Before taking it, check the other projects too:

- Which vitest projects run real compiles or spawn the resolver inside a hook, and which of those
  still sit on the 10s default? Fix the class, not the one file.
- Is 30000 the right number here, or does the measured work want more? Time the hook on an idle host
  and on a loaded one, and pick a number with headroom rather than the first one that passes.
- A timeout is a ceiling, not a fix for slow work. If the hook is slow because it re-compiles the
  same snippets, say so and decide whether that is worth caching. Do not turn a real slowdown into a
  bigger number.

## Evidence to produce

- The failing run above, and the same batch green after the change.
- `pnpm run test:ci` green end to end.
- A short note of which projects were audited and which were left on the default, with the reason.

## Out of scope

The batch grouping in [scripts/core/test-batches.mjs](../../scripts/core/test-batches.mjs). Moving
type-budget to a quieter batch would hide this rather than fix it.
