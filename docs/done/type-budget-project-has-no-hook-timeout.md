---
type: fix
spec: guidelines
status: done
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

## Plan — raise the timeouts on the whole compile/resolver class (approved 2026-09-21)

### What was measured

The `modelPipeline` hook body, timed directly against the real harness:

| condition | hook body |
| --- | --- |
| idle host | 4598 ms |
| four copies on a four-core host | 8537 / 8577 / 8584 / 8680 ms |
| the reported CI failure | 10598 ms, against the 10000 ms default |

So the default leaves no headroom at all: roughly a 2x slowdown under contention is enough
to cross it.

Caching the compiles was considered and rejected. `makeMeasurer`
(`packages/run-types/test/types/compileHarness.ts`) already caches every lib source file and
memoises the empty-snippet baseline, and the six compiles are CUMULATIVE snippets whose
pairwise difference IS the metric. There is no repeated work left to remove; this is a real
5 s of checker time, not a slow-code smell hiding behind a timeout.

### The class

Every `beforeAll` / `beforeEach` in `packages/**` whose body compiles, builds or spawns was
matched against whether it carries its own inline timeout. 23 hooks do that work with no
inline guard, in four projects that sit on the 10 s default:

| project | unguarded heavy hooks | heaviest file, alone |
| --- | --- | --- |
| `type-budget` | 3 | `modelPipeline.compile.test.ts`, 5.5 s |
| `devtools-core` | 11 | `batch-diagnostics.test.ts`, 16.0 s |
| `devtools` | 3 | `viteEnvironments.spec.ts`, 7.3 s |
| `drizzle-pg` | 1 | `drizzleConvert.integration.spec.ts`, 6.0 s |

Left on the default, with the reason:

- `client`, `client-bundled`, `client-mixed` — the one hook that boots a vite dev server
  (`middlewareMode.e2e.spec.ts`) already carries its own inline timeout, as do the other eight
  heavy hooks in the package.
- `@mionjs/go-be-sidecar` — no heavy hook; the sidecar spawns inside tests that carry their
  own inline timeouts.
- `core`, `router`, `bin-uws`, `drizzle-root`, `drizzle-mysql`, `drizzle-sqlite`, every
  `platform-*` — hooks build fixtures in memory or start an in-process server, all under a
  second.
- `mock-format-isolation` — no hooks at all; its `testTimeout` is already 30000.
- `runtypes` and `playground` — already in the class and already at 30000.

### The change

1. `testTimeout: 60000` and `hookTimeout: 60000` on the four project configs above. 60000 is
   the number this tree already picked for a single heavy compile: `type-budget`'s own
   `declarationEmit.test.ts` and `drizzleFreeAuthoring.test.ts` pass `{timeout: 60_000}`
   per test. It is 13x the idle hook and 5.7x the figure that failed CI, so a real hang
   still fails, just later.
2. A drift gate in `packages/devtools/test/test-batch-contracts.test.ts`: every project the
   root `vitest.config.ts` declares is classified heavy or light, exactly once, and every
   heavy one must declare both timeouts at 30000 or above. A new compile or resolver project
   can no longer arrive on the 10 s default unnoticed.

The existing inline timeouts were left in place. They are independently correct and still
guard their hook if a project value is ever lowered.

### Out of scope, as the spec asked

The batch grouping in `scripts/core/test-batches.mjs` is untouched.
