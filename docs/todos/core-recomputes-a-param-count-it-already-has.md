---
type: fix
spec: guidelines
status: ready
created: 2026-09-21
---

# The headers reflection recomputes a param count it was just handed

## Intent

In [packages/core/src/runtypes/mionAdapter.ts](../../packages/core/src/runtypes/mionAdapter.ts),
`getHeadersReflectionFromMarkers` does this:

```ts
const reflection = getReflectionFromMarkers(rtFns, handler, methodId);
const bodyArity = getParamCountFromRunType(resolveInjectedRunType(rtFns.paramsId));
reflection.paramsCount = bodyArity;
```

`getReflectionFromMarkers` already set `paramsCount` from the same source, and the two spellings are
the same computation:

```ts
export function getParamCountFromRunType(paramsRunType: RunType<unknown>): number {
  return getParamsFromRunType(paramsRunType).length;
}
```

Inside `getReflectionFromMarkers` it is `getParamsFromRunType(paramsRunType).length`, over
`resolveInjectedRunType(rtFns.paramsId)`, the same input. So the reassignment always writes back the
value that is already there, and it costs a second walk of the params tuple on every headers
middleFn.

## What to settle

Confirm the two really cannot diverge, then delete the two lines. The reason to check rather than
just delete: a headers middleFn takes the HeadersSubset as its second parameter, so it is worth
proving that `rtFns.paramsId` means the same thing in both calls and that nothing downstream wants a
"body arity" that differs from the full param count.

If they CAN diverge, the code is right and the fix is the opposite one: give the second computation
a name and a one-line comment saying what makes it different.

## Evidence to produce

- A test in `packages/core/src/runtypes/mionAdapter.spec.ts` asserting `paramsCount` for a headers
  middleFn, so the behaviour is pinned whichever way this goes.
- `pnpm test` green for `@mionjs/core` and `@mionjs/router`.

## Watch out

- `paramsCount` rides the client's methods-metadata payload, so a change in its value is observable
  by `@mionjs/client`, not just internal. That is why this wants a test rather than a blind delete.

## Origin

Found during a repo-wide comment simplification pass, while checking a comment on the surrounding
code.
