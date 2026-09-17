---
type: chore
spec: full-plan
status: ready
created: 2026-09-17
---

# Pin the typed context in every router helper

## Problem

`createMionRouter(opts)` types `ctx.shared` from the options `contextDataFactory`, and it does so for
ALL FIVE helpers: `RouterCallContext<O>` (`packages/router/src/types/mionRouter.ts:60`) is the
context type of `RouteHelper` (:77), `MiddleFnHelper` (:93), `HeadersFnHelper` (:118) and
`RawMiddleFnHelper` (:133).

The context reaches a handler when the handler is DECLARED, because each helper is a closure the
factory already created with its options. `initRoutes` plays no part in it: it registers the
definitions and returns the API type.

Only the `route` path is pinned by a test (`packages/router/src/mionRouter.spec.ts:92-103`). The
other helpers have runtime tests that happen to read `ctx.shared` (`lib/headers.spec.ts:78`,
`batches.spec.ts:89`), but nothing asserts the TYPE. If `ctx.shared` silently widened to `any` in
four of the five helpers, every test in the repo would still pass.

Nothing pins that the type survives a round trip through `initRoutes` either, which is the part that
reads as uncertain from outside the type file.

## Plan

Tests only. No source change: the behaviour is already correct.

Extend the `createMionRouter types` describe block in `packages/router/src/mionRouter.spec.ts`
(opens at :91). Reuse what the file already has: the module-level `mion`, `SharedData` and
`getSharedData` (:18-22), the destructured helpers (:24) and the `routes` object (:26-34).

Each new case follows the shape of the existing `route` assertion:

```ts
mion.middleFn((ctx, greeting: string): string => {
  expectTypeOf(ctx.shared).toEqualTypeOf<SharedData>();
  // @ts-expect-error not a field of the shared data
  void ctx.shared.nope;
  return greeting;
});
```

One `it` per case:

- `mion.middleFn`
- `mion.headersFn`, where the context is the 1st param and the `HeadersSubset` the 2nd
- `mion.rawMiddleFn`
- `mion.query` and `mion.mutation`, which pin `isMutation`: confirm that does not disturb the context
- the destructured `destructuredRoute` / `destructuredMiddleFn`, already declared at :24
- a handler read back OUT of an object that went through `initRoutes`, proving registration widens
  nothing. `PublicApi` drops the context param from the public handler, so read the definition
  instead: `expectTypeOf<Parameters<(typeof routes)['visits']['handler']>[0]['shared']>()`

## Tests

The change IS the tests.

`expectTypeOf` and `@ts-expect-error` are compile-time only, and this repo configures no vitest
typecheck, so vitest alone would run these tests green whatever the types said. What enforces them
is tsc over a config that includes the spec files:

```bash
pnpm --filter @mionjs/router run typecheck:test   # tsc -p tsconfig.test.json --noEmit
pnpm exec vitest run mionRouter
pnpm test
```

`pnpm run typecheck`, inside `pnpm run lint`, runs the same check across the workspace.

Prove each new assertion bites: flip it once to the wrong type, watch `typecheck:test` fail, flip it
back. An `expectTypeOf` that was never seen failing has not been shown to test anything.

The Marker test coverage rule does not apply here: this adds no `getRunTypeId` call site and no new
marker shape, only assertions around helper calls that already exist.

## Docs

None. Behaviour is unchanged, and the routes page already covers the factory
(`container/website/content/01.rpc/02.server/01.routes.md`, `### Context Data Factory` at line 173).

## Out of scope

`initRoutes` accepts the widest `Routes` type, so a routes object declared through a DIFFERENT
`createMionRouter` call type-checks even when its `contextDataFactory` or `encoder` disagree. Every
definition already carries the options it was declared under
(`packages/router/src/types/definitions.ts:39`), so the guard is expressible. That is a missing
CHECK, not a missing propagation, and it is its own change.

## Done when

`ctx.shared` is pinned to the factory's type for all five helpers and for the destructured ones, one
assertion proves the type survives `initRoutes`, every new assertion has been seen to fail when
wrong, and `pnpm test` plus `pnpm run lint` pass.

## What shipped

Six new `it` blocks in `packages/router/src/mionRouter.spec.ts`, covering `middleFn`, `headersFn`,
`rawMiddleFn`, the `query` / `mutation` pair, the destructured helpers, and a readback of four
definitions off the `routes` object the file registers. Twelve assertions in total.

No source change was needed: all five helpers already typed the context correctly. That was checked,
not assumed. Every assertion was flipped to a wrong type and seen to fail under `typecheck:test`
before being flipped back, the `@ts-expect-error` directives included (a directive over an `any`
context would have reported itself unused, and none did).
