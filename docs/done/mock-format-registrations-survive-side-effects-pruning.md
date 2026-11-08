---
type: fix
spec: guidelines
status: done
created: 2026-11-08
---

# Mock format registrations can be dropped by `sideEffects` pruning

## Intent

`createMockDataFn` registers the per-kind format mock functions through bare side-effect imports
(`packages/run-types/src/mocking/createMockData.ts:10-12`):

```ts
import './mockStringFormat.ts';
import './mockNumberFormat.ts';
import './mockBigIntFormat.ts';
```

But `packages/run-types/package.json:6-15` `sideEffects` lists `src/formats`, `src/runtypes`, `src/builders` and
`createRTFunctions`, never `src/mocking/**` (nor the `dist` twin). A bundler that honours `sideEffects` (Vite / Rollup
production builds, webpack, rspack) may drop a bare import of a file it was told is side-effect free. Then the registry is
empty and, as the comment above those imports says, format-branded nodes mock as kind-default values that fail their own
validators. `mockStringFormat.ts` likely survives only because `mocking/mockType.ts:20` also imports `mockUrlObject` from
it; number and bigint have no such named import.

Found while planning the mock data generators feature (which adds more registration-by-import under `src/mocking/`),
not caused by it.

## Direction

- Reproduce first: a consumer production build (Vite or webpack) of a file that mocks a `TF.Integer<{min: 1; max: 3}>`
  through `@mionjs/run-types/mocking`, then check the mock validates. Keep it as the regression test.
- Likely fix: add the `src/mocking` / `dist/mocking` registration files (or the whole folder) to `sideEffects`, or turn
  the registrations into explicit calls that a named import reaches. The implementer picks; check the
  `packages/AGENTS.md` dependency and package rules first.
- Look for other bare side-effect imports outside the listed globs while there.

## Docs

None, because this is a packaging fix with no user-facing API change.

## Done when

- The reproduction fails before the fix and passes after, in CI.
- Every bare side-effect import under `packages/run-types/src` is covered by `sideEffects` or replaced by a named import.
- The simplify-comments pass ran on every touched source file, committed on its own.

## Plan: sideEffects entry + bundle regression (approved 2026-11-08)

Delegated session, no user in the loop: planned and approved in automatic mode.

- Fix: `packages/run-types/package.json` `sideEffects` gains `./src/mocking/mock*Format.ts` and its
  `./dist/mocking/mock*Format.js` twin. Narrow on purpose: the mock subtree stays droppable from bundles that never
  import `@mionjs/run-types/mocking` (pinned by `rpc-client/test/bundleSplit.spec.ts`). New registration files
  named `mock<Kind>Format.ts` are covered with no edit.
- Test: `packages/run-types/test/features/mockFormatSideEffects.test.ts` runs a real Vite production build of a
  consumer that mocks one number, bigint and string format (type-only formats import), loads the bundle and checks
  50 mocks validate, both marker shapes. Failed before the fix, passes after.
- Guard in the same file: every bare `import './x.ts'` under `src` must resolve to a file a `sideEffects` glob
  keeps, and every `./src/` glob has its `./dist/` twin.
- Other bare imports checked: `src/index.ts`, `src/builders/index.ts`, `src/formats/index.ts` all land under
  already-listed globs. `@mionjs/client`'s `import '@mionjs/run-types/formats'` is governed by run-types' own list.
- Docs: none, packaging fix with no user-facing API change.
