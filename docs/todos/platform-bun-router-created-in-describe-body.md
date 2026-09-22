---
type: fix
spec: guidelines
status: ready
created: 2026-09-22
---

# platform-bun's bun:test files create the router in the describe body, so one of them always throws

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

Both bun test files call `createMionRouter` in the **describe body**, and only reset the router in
`beforeAll`:

```
packages/platform-bun/src/bunHttp.test.ts:17            describe('bun router should', () => {
packages/platform-bun/src/bunHttp.test.ts:34              const mion = createMionRouter({...});   // describe body
packages/platform-bun/src/bunHttp.test.ts:52              beforeAll(async () => { ... });

packages/platform-bun/src/bunHttpMiddleware.test.ts:19  describe('bun asMiddleware should', () => {
packages/platform-bun/src/bunHttpMiddleware.test.ts:23    const mion = createMionRouter({...});   // describe body
packages/platform-bun/src/bunHttpMiddleware.test.ts:30    beforeAll(async () => {
packages/platform-bun/src/bunHttpMiddleware.test.ts:32      resetRouter();
```

`createMionRouter` is guarded by a module-level once-flag (`isRouterCreated`,
`packages/router/src/router.ts:189`). Bun collects both files into ONE process and evaluates every
describe body before it runs any hook, so the second body to be evaluated hits a flag the first body
set, and the `resetRouter()` that would have cleared it has not run yet.

Which file loses depends on evaluation order, which is why this is intermittent: on a dev host it
passes (`15 pass, 0 fail`), in CI it did not.

`bunHttp.test.ts:211` and `:246` also call `createMionRouter`, but inside test bodies, after a reset,
so they are not part of this.

## Intent

Make the two files independent of evaluation order, so neither can eat the other's router.

The obvious shape is to move each `createMionRouter` call out of the describe body and into the
`beforeAll` that already calls `resetRouter()`, with the routes declared there too. That changes what
`mion` is in the enclosing closure, so the implementing session should work out how the route
constants are threaded (a `let` assigned in `beforeAll`, a lazy factory, or a per-file `beforeAll`
that returns the handles) rather than assuming one shape here.

Worth deciding while in there: whether `resetRouter()` belongs in a shared `beforeAll` for the whole
`platform-bun` suite, and whether the other platform adapters have the same latent pattern in their
vitest suites (vitest isolates files by default, so they probably do not, but check).

## Done when

- `pnpm run test:bun` passes with every test running: the count must include
  `bunHttpMiddleware.test.ts`'s tests, and the summary must read `0 fail` AND `0 error`.
- The pass is order-independent, not luck. Prove it: run the suite with the file order reversed
  (`bun --cwd packages/platform-bun test src/bunHttpMiddleware.test.ts src/bunHttp.test.ts` or the
  equivalent) and it still passes.
- A guard so a swallowed file cannot read as green again. An `error` with `0 fail` currently exits
  non-zero, which is what caught this, but nothing pins the test COUNT. Consider asserting the
  expected number of bun tests, or fail the lane on any "Unhandled error between tests".
- `pnpm run lint`, `pnpm run typecheck` and `pnpm run test:ci` stay green.

## Out of scope

- The `createMionRouter` once-guard itself. It is deliberate (see `packages/router/CLAUDE.md`, "One
  router factory"): the runtime is a module singleton and the guard is what catches a second app
  being built on top of the first. The test files are wrong, not the guard.
- The vitest suites of the other platform adapters, unless the check above finds the same pattern
  there, in which case fix it in the same PR.
