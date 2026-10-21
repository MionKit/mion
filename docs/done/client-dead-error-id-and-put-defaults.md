---
type: fix
spec: guidelines
status: done
created: 2026-09-24
---

# Client options `autoGenerateErrorId` and `fetchOptions.method` do nothing

## Intent

Two client options look configurable but have no effect:

- `ClientOptions.autoGenerateErrorId` (`packages/client/src/types.ts:80`, default at
  `packages/client/src/constants.ts:26`) is never read. The client never calls `setErrorOptions`.
- `fetchOptions.method: 'PUT'` (`packages/client/src/constants.ts:17`) is always replaced by `GET` or
  `POST` in `buildFetchOptions` (`packages/client/src/request.ts:~488-521`). A user setting a method
  gets silently ignored.

## Direction

The implementer plans the details. The project is cutting unused surface, so prefer removing
`autoGenerateErrorId` from the client options and the `method` default. Make sure the `fetchOptions`
type or docs do not suggest the method can be chosen (for example, omit `method` from the accepted
type). The router-side `autoGenerateErrorId` stays.

## Docs

Check the client pages under `container/website/content/01.rpc/` for either option and remove them.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- Neither dead option remains in the client types, defaults, tests or docs.
- `pnpm test` and `pnpm run typecheck` pass; label the PR `pre-publish-e2e` (public API change).
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.

## Plan (approved 2026-09-24, delegated session, built as below)

- `ClientOptions` no longer extends `CoreRouterOptions`: it already declares `basePath` and `suffix`, and
  `autoGenerateErrorId` is gone from the type and from `DEFAULT_PREFILL_OPTIONS`.
- New `ClientFetchOptions = Omit<RequestInit, 'method' | 'body' | 'signal'>` types `fetchOptions`.
  `body` and `signal` were overwritten by `buildFetchOptions` too, so they were dead the same way.
  The `method: 'PUT'` default is removed.
- `getRoutePath` in `@mionjs/core` takes `Pick<CoreRouterOptions, 'basePath' | 'suffix'>`, the only fields
  it reads, so the client options still fit.
- No new test: the options no longer exist, so there is nothing to test. The existing client suite covers the change.
- Docs: no website page mentions either option, so no page changes.
