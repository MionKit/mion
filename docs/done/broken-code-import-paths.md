# Website `<code-import>` blocks that resolved to nothing

**Status:** done
**Created:** 2026-07-27 (found while sweeping the stale package references — see
[website-stale-package-references.md](website-stale-package-references.md))
**Shipped:** 2026-08-20

## What was actually wrong when this was picked up

The spec recorded 13 `<code-import>` blocks pointing at files that do not exist. By the time it was
worked, **12 of those had been fixed**: the friendly-errors pages were rewritten and the example
files they wanted no longer exist at all.

But the original scan only checked **path existence**, and that turned out to be the smaller half of
the problem. Re-scanning all 142 blocks for path *and* marker gave **5 broken blocks**:

| Block | Problem |
| --- | --- |
| `packages/client/src/typedEvent.ts` | file had moved to `packages/client/src/lib/typedEvent.ts` |
| `types.ts -> // type-result-start` | marker existed nowhere in the repo |
| `types.ts -> // type-sub-request-start` | marker existed nowhere in the repo |
| `types.ts -> // type-route-sub-request-start` | marker existed nowhere in the repo |
| `types.ts -> // type-middleFn-sub-request-start` | marker existed nowhere in the repo |

Four blocks whose `path` resolved perfectly while the `commentStart` they asked for was never
written. `extractByComments` throws `Start comment marker not found`, and `processCodeImports`
catches it and renders a ```text block reading `// Error processing code-import: ...`
(`website/server/utils/code-import.ts:107,148-151`) — so the page ships a hole and the site build
stays green. Same visible outcome as a missing file, invisible to a path-only check.

## What shipped

1. **`typedEvent`** — repointed `3.client/1.error-handling.md:90` at `packages/client/src/lib/typedEvent.ts`
   and wrapped the `TypedEvent` class in `// type-typed-event-start` / `-end`.
2. **The four missing markers** added in `packages/client/src/types.ts`, around `Result`,
   `SubRequest`, `RouteSubRequest` and `MiddlewareSubRequest`.
3. **A rename the docs had drifted past.** The website asked for `MiddleFnSubRequest`; the exported
   type is `MiddlewareSubRequest` — a site missed by the middleware→middleFn rename. The marker is
   `// type-middleware-sub-request-*` and the `### MiddleFnSubRequest` heading in
   `3.client/0.client-overview.md` now matches the real name. **Renaming the exported type was left
   alone** — it is a public API change and out of this scope.
4. **`scripts/check-code-imports.mjs`** — validates every block's path AND both markers, mirroring
   `parseAttributes` / `extractByComments` from the real parser rather than re-inventing them.
   Wired as `pnpm run check-code-imports` and a CI step in `.github/workflows/pull-requests.yml`.
   Negative-tested against both a bogus path and a bogus marker before landing.

## Acceptance

- ✅ Every `<code-import>` under `website/content/` resolves — file and markers.
- ✅ CI fails if a future one does not, for either reason.
