---
type: fix
spec: guidelines
status: done
created: 2026-09-20
---

# Keep mock generation out of a default client bundle

Shipped together with the client-size todo, in one PR: publishing an honest size number and
making that number small were the same job.

## What shipped

Mock generation now lives on its own export subpath, `@mionjs/run-types/mocking`, and the
main entry exports no mock name. Three separate causes had to go, and any one left in place
would have kept the mock subtree in every bundle.

**A `./mocking` subpath, and the barrel loses four lines.** These left
`packages/run-types/src/index.ts` for a new `src/mocking/index.ts`:

```ts
export {registerMockingFunction, type MockFormatFn} from './mocking/mockRegistry.ts';
export {createMockDataFn} from './mocking/createMockData.ts';
export type {MockOptions, MockTypeFn, RunTypeMockOptions} from './mocking/mockTypes.ts';
export {MockRandom} from './mocking/mockRandom.ts';
```

This is a **breaking change**. `import {createMockDataFn} from '@mionjs/run-types'` becomes
`from '@mionjs/run-types/mocking'`. No deprecated re-export was kept: a re-export on the
barrel is the exact thing being removed. `MockData` / `MockNode` stayed on the main entry,
because those are enrichment file types read by the `mion enrich` CLI, not the mock runtime.

**The duplicate registrations left the formats entry.** The spec expected an ordering
problem here. There was none, because `packages/run-types/src/mocking/createMockData.ts:12`
already carried the same three imports:

```ts
import './mockStringFormat.ts';
import './mockNumberFormat.ts';
import './mockBigIntFormat.ts';
```

The copies in `formats/index.ts` were redundant, and they were what dragged the mocks into
every bundle that touched a format. The documented ordering constraint turned out to sit on
the three pure-fn imports above them, not on these, so those three were not touched and the
guarantee never moved.

**The pattern table became a type-only import.** `registerFormatPattern` is not a registry:
it validates a pattern's declared samples and returns a frozen object
(`packages/run-types/src/runtypes/formatPattern.ts:80`). Nothing reads it back at runtime,
and `stringFormats.ts` used all 25 constants in type position only (`typeof ALPHA_PATTERN`).
So its import became `import type`, the side-effect import left `formats/index.ts`, and the
load-time sample check moved to `packages/run-types/test/features/builtinPatternSamples.test.ts`.

## What the spec expected and did not happen

- **No `sideEffects` field was added.** The plan held it in reserve as the lever that would
  let a bundler drop the mock subtree from the barrel. Once mocking left the barrel, nothing
  in a client's graph reached it, so the field bought nothing and the risk of a wrong
  allowlist (silently dropping the format registrations) was not worth taking.
- **`mockDateTimeBounds` needed no separate handling.** It rides behind `mockStringFormat`,
  which the mock walker owns, so it left with the rest.

## Result

Measured by `pnpm miondevx website client-size`, which bundles the published dist the way a
consumer's bundler does:

| | minified | gzipped |
| --- | --- | --- |
| before | 91.8 kB | 30.6 kB |
| after | 70.1 kB | 24.1 kB |

A build test proves it rather than a reading of the source:
`packages/client/src/bundleSplit.spec.ts` builds a real app through the real
`mionVitePlugin` and asserts no chunk contains `createMockDataFn`, `mockStringFormat`,
`mockBoundedDateTime`, `registerMockingFunction` or the pattern constants.

## Pinned by

- `packages/client/src/bundleSplit.spec.ts` — the artifact carries no mock generation and no pattern table.
- `packages/devtools/test/repo-contracts.test.ts` — the barrel re-exports nothing from `./mocking/`, the formats entry imports nothing from it, and the subpath is published.
- `packages/run-types/test/features/builtinPatternSamples.test.ts` — every built-in pattern still accepts its own samples.
