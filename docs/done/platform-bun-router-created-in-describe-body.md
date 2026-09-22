---
type: fix
spec: guidelines
status: done
created: 2026-09-22
---

# platform-bun's bun:test files created the router in the describe body, so one of them was always skipped

## The finding

The `js tests + lint` lane went red on `test:bun`, with a test file that ran ZERO of its tests:

```
##[group]src/bunHttpMiddleware.test.ts:

# Unhandled error between tests
-------------------------------
187 |   opts?: RouterOptionsArg<O>
188 | ): MionRouter<O> {
189 |   if (isRouterCreated)
190 |     throw new Error(
191 |       'createMionRouter has already been called: create the router once per app (resetRouter() clears it in tests)'
192 |     );
          ^
error: createMionRouter has already been called: create the router once per app (resetRouter() clears it in tests)
      at createMionRouter (packages/router/src/router.ts:192:5)
      at <anonymous> (packages/platform-bun/src/bunHttpMiddleware.test.ts:24:16)

 12 pass
 0 fail
 1 error
 42 expect() calls
Ran 12 tests across 3 files.
```

Job: https://github.com/MionKit/mion/actions/runs/35788800071/job/106952264884

Note the shape: **0 fail, 1 error**. The three tests in `bunHttpMiddleware.test.ts` never ran at all. A
test file that silently stops contributing is worse than one that fails, and `12 pass` reads like a
healthy run at a glance.

## The mechanism

Both bun test files called `createMionRouter` in the **describe body**, and only reset the router in
`beforeAll`. `createMionRouter` is guarded by a module-level once-flag (`isRouterCreated`,
`packages/router/src/router.ts`). Bun runs a package's test files in ONE process, so the second body
to be evaluated hit a flag the first body had set, and the `resetRouter()` that would have cleared it
had not run yet.

Which file lost depends on evaluation order, which is why it was intermittent: on a dev host it
passed (`15 pass, 0 fail`), in CI it did not.

`bun test --randomize --seed=1` reproduces the CI failure exactly (`12 pass, 0 fail, 1 error`) and was
the reproduction used here.

## What shipped

**1. Both files build the router inside a hook.** Every `createMionRouter` call in
`packages/platform-bun` now runs from a `beforeAll` or a test body, after the reset that precedes it.

- `bunHttpMiddleware.test.ts`: the router and its one route moved into the existing `beforeAll`,
  after `resetBunHttpOpts()` / `resetRouter()`. Nothing outside that hook referenced them.
- `bunHttp.test.ts`: the first describe's router and three routes moved into a `buildApp()` factory
  called from `beforeAll`. The factory returns `{mion, routes}`, and the tests that re-register or
  build a second router read the handles off that. Its second describe already built its router in
  `beforeAll` and was left alone.

**2. A gate so a swallowed file cannot read as green again.** `test:bun` now runs
`scripts/core/test-bun.mjs` (`pnpm miondevx core test-bun`) instead of `bun test` directly. It runs
the same suite with bun's junit reporter, then fails if any `*.test.ts` / `*.spec.ts` file on disk is
missing from the report or reported zero tests. A swallowed file is absent from the junit output
entirely, so the gate names it:

```
==> A bun test file ran none of its tests. Bun shares one process across files, so a throw
==> while a describe body is evaluated skips that whole file and the summary still reads green:
==>   src/bunHttpMiddleware.test.ts
core test-bun: the bun suite is incomplete
```

**3. A contract test.** `packages/devtools/test/repo-contracts.test.ts` fails if any bun test file
calls `createMionRouter` at indentation 0 or 2 (module level or a describe body), and pins the gate's
junit parsing against both the healthy and the swallowed report shape.

## The other platform adapters

Checked, and they do not have this pattern. Their suites are vitest, and the root `vitest.config.ts`
sets no `isolate` or `pool` override, so each file gets its own module registry and a module-level
`createMionRouter` cannot reach another file. Within a file, no adapter spec creates a router in two
describe bodies; the only file with two evaluation-time calls is `packages/router/src/parser.spec.ts`,
which has an explicit `resetRouter()` between them.

## Done when

- `pnpm run test:bun` passes with every test running, `0 fail` and `0 error`. ✅ `15 pass`, and the
  gate reports `3 test file(s), all reporting tests`.
- The pass is order-independent. ✅ Verified with `--randomize` on the seeds that previously failed
  (1, 2, 4, 5), and with both explicit file orders.
- A guard so a swallowed file cannot read as green again. ✅ The junit gate above, proven to fire by
  restoring the bug and re-running.
- `pnpm run lint`, `pnpm run typecheck` and `pnpm run test:ci` stay green. ✅

## Out of scope (and left that way)

- The `createMionRouter` once-guard itself. It is deliberate (see `packages/router/CLAUDE.md`, "One
  router factory") and was not touched. The test files were wrong, not the guard.
