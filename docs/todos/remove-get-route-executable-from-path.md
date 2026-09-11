---
type: chore
spec: guidelines
status: ready
created: 2026-09-11
---

# Remove the unused getRouteExecutableFromPath

## Intent

`getRouteExecutableFromPath` (`packages/router/src/router.ts:304-311`) has no callers anywhere in the repo. Its last caller, the array-body reshape in the request deserializer, was replaced when the dispatch hot path was reworked, and the not-found fallback it duplicates now lives in `getExecutionChain` (`packages/router/src/callContext.ts:96-107`). Two copies of the same fallback drift; one already did (only one of them throws when the not-found route is missing). Found while tracing the not-found path; it predates the per-route size limit work.

## Direction

- Delete the function. It is reachable through the router's `export *` in `packages/router/index.ts`, so check the published API surface (`packages/router` d.ts, the docs under `container/website/content/01.rpc/`) and note the removal in the changelog if the repo tracks public removals there.
- Search once more for dynamic uses (`getAnyExecutable`, string references in tests or examples) before deleting.
- If a consumer-facing need for "route executable by path" turns out to exist, the replacement is `createCallContext(...).executionChain.methods[routeIndex]`, not a second lookup.
- The implementer plans the details.

## Done when

The function is gone, lint and typecheck pass, no doc or example names it, and the router tests are green.
