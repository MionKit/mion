---
type: fix
spec: guidelines
status: done
created: 2026-09-21
---

# The headers reflection recomputed a param count it was just handed

## What shipped

In [packages/core/src/runtypes/mionAdapter.ts](../../packages/core/src/runtypes/mionAdapter.ts),
`getHeadersReflectionFromMarkers` used to do this:

```ts
const reflection = getReflectionFromMarkers(rtFns, handler, methodId);
const bodyArity = getParamCountFromRunType(resolveInjectedRunType(rtFns.paramsId));
reflection.paramsCount = bodyArity;
```

The two lines are gone. What remains is the shared call plus a one-line comment saying why no
second count is needed:

```ts
// paramsCount is already the body arity: `paramsId` holds HeaderHandlerParams<H>, which starts after the HeadersSubset
const reflection = getReflectionFromMarkers(rtFns, handler, methodId);
```

## Why the two cannot diverge

- Both read the SAME input, `resolveInjectedRunType(rtFns.paramsId)`. `resolveInjectedRunType` is a
  cache lookup by injected id, so a second call cannot answer differently.
- Both run the SAME computation. `getParamCountFromRunType(x)` is `getParamsFromRunType(x).length`,
  and `getReflectionFromMarkers` sets `paramsCount` to `getParamsFromRunType(paramsRunType).length`
  over that same node.
- "Body arity" was never a different number. For a headers middleFn the router's `paramsId` slot
  holds `HeaderHandlerParams<H>` (`packages/router/src/types/handlers.ts`), which already drops the
  context and the HeadersSubset, so `paramsCount` IS the body arity on both paths.
- Ordering is not a factor: `getReflectionFromMarkers` runs first and throws when `paramsId` is
  missing, so the deleted lines could only ever see the id it already resolved.

`getParamCountFromRunType` itself stays: it is part of the `@mionjs/core` public surface and is
still covered by its own test.

## Tests

`packages/core/src/runtypes/mionAdapter.spec.ts` gained a `fakeHeadersFn` marker wrapper (the
plugin fills the header slots the way `mion.headersFn` does) and a
`mionAdapter: headers middleFn reflection` block pinning:

- `paramsCount` is 2 for `(ctx, headers: HeadersSubset<'authorization', 'x-trace'>, pet, notes?)`
  and 0 for a handler with headers only, with `paramNames` matching. This is the value that rides
  the client's methods-metadata payload, so it is public behaviour.
- `getHeadersReflectionFromMarkers` returns the same `paramsCount` as
  `getReflectionFromMarkers` and as `getParamCountFromRunType(resolveInjectedRunType(paramsId))`,
  so a future divergence fails here.
- `headersParam` still carries the declared header names and a working validator.

Green: `@mionjs/core` (94 tests), `@mionjs/router` (448 tests), plus the full JS suite, lint and
format.

## Origin

Found during a repo-wide comment simplification pass, while checking a comment on the surrounding
code.
