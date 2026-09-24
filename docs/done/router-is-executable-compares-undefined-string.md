---
type: fix
spec: guidelines
status: done
created: 2026-09-24
---

# `isExecutable` compares `routes` to the string `'undefined'`

## Intent

`packages/router/src/types/guards.ts:45-50` has a typo that makes one half of the check dead:

```ts
((entry as any).routes === 'undefined' || typeof (entry as RemoteMethod).handler === 'function')
```

`routes` is never the string `'undefined'`, so the guard only passes on `handler`. Today it still works
because every executable has a handler, but the intended check is unclear and the dead branch hides it.

## Direction

The implementer plans the details. Work out what the first branch was meant to test (probably
`typeof routes === 'undefined'`, meaning "not a group"), then either fix it or drop it if the `handler`
test alone is correct. Caller: `packages/router/src/router.ts:431`. The same file has several guards
with no users (`isRouteDef`, `isRawExecutable`, `isHeaderExecutable`, `isRouteExecutable`) and
`isPublicExecutable`, which duplicates `hasClientMetadata` in `router.ts:310`; remove the unused ones
in the same change.

## Docs

None, because the guards are internal and no page describes them.

## Done when

- The guard tests what it means to test, with a unit test that fails on the old code or proves the
  branch was dead and is gone.
- `isPublicExecutable` and `hasClientMetadata` are one function.
- `pnpm test` and `pnpm run typecheck` pass.
- The simplify-comments pass ran on every touched source file, committed on its own.

## Plan (approved 2026-09-24, revised after review)

- `isExecutable` drops the dead `routes === 'undefined'` branch. A routes group reaches it as
  `{pathPointer, routes}` with no `id`, so the `id` + `handler` checks are the whole test.
- `isRoutes` now narrows to `Routes` instead of `Route` (wrong type predicate in the same file).
- The unused guards stay (review asked to keep them and only fix what was wrong).
- `isPublicExecutable` and `hasClientMetadata` were near copies: `hasClientMetadata` also returned
  `false` for raw middleware. `isPublicExecutable` now has `hasClientMetadata`'s exact body and doc
  comment, returns `boolean`, and `hasClientMetadata` is gone. Every caller (`router.ts`,
  `client.routes.ts`, `router.spec.ts`) uses `isPublicExecutable`.
- `hasClientMetadata` was exported from `@mionjs/router`, so dropping it is a public API change; no
  package in the repo used it outside the router.
- Test: `packages/router/test/types/guards.spec.ts`; its `routes: 'undefined'` case fails on the old code.

## Shipped

As planned above. `pnpm run lint` (includes typecheck) and `pnpm run test:ci` passed.
