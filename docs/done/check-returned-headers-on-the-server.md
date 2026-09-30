---
type: fix
spec: guidelines
status: done
created: 2026-09-30
---

# Check Returned Headers on the Server

## Intent

A route, middleware or `headersFn` can return a `HeadersSubset`, and the router copies its values straight
onto the response (`packages/rpc-router/src/dispatch.ts`, the `executable.headersReturn` branch around line
135). Nothing checks them first. The type check for returned headers is already compiled:
`packages/core/src/routerUtils.ts` builds `headersReturn.jitFns` from `metadata.headersReturn.jitHash`, but the
dispatcher never calls it. Request headers do get checked (`executable.headersParam.jitFns.isType` in the same
file, around line 309).

So a handler that returns a header with a wrong value (a number cast as string, a missing required name, an
empty string, a value holding a line break) sends it as is, or lets the platform throw at a random place.

Found while writing the website Headers page (`container/website/content/01.rpc/02.server/04.headers.md`).

## Direction

- Decide what the router should do with a returned `HeadersSubset` that fails its type: treat it like other
  handler bugs (an undeclared error in `@thrownErrors`, 500) or drop only the bad header. Match how the router
  already treats a return value it cannot serialize.
- Use the compiled `headersReturn.jitFns` instead of a hand-written check, and keep the hot path cheap (only
  when the executable declares `headersReturn`).
- Check whether the client side (`packages/rpc-client/src/lib/headers.ts`,
  `reconstructHeadersSubsetFromResponse`) should validate returned headers too, for symmetry with
  `validateServerResponses`.
- Tests in `packages/rpc-router/test/` (mirroring `src/`), plus a platform test if a platform throws today.
- If the behaviour is user visible, add one line to the "Sending Response Headers" section of
  `container/website/content/01.rpc/02.server/04.headers.md`.

## Done when

A returned header that does not match its declared type never reaches the wire unnoticed, with a test for
the failing case and the passing case.

## Plan (approved 2026-09-30, delegated session) and what shipped

- **Server** (`packages/rpc-router/src/dispatch.ts`): a returned `HeadersSubset` runs through the compiled
  `headersReturn.jitFns.isType` before any header is copied. A mismatch throws a `FatalError` of type
  `response-validation-error` (status `UNEXPECTED_ERROR`, type errors in `errorData`), which the dispatch loop
  records like any undeclared error: it lands in `thrownErrors`, fails the call, and no header is sent. The
  check only runs when the executable declares `headersReturn`.
- **Line breaks** match `string`, so the type check cannot see them. They were already safe: platform-node's
  `setHeader` and the web `Headers.set` throw inside the dispatch loop's try block, so the call fails with an
  `unknown-error` and nothing reaches the wire; platform-uws drops unsafe headers. A platform-node test pins it.
- **Client** (`packages/rpc-client/src/lib/validation.ts`): with `validateServerResponses`, a `HeadersSubset`
  that came back is checked against `headersReturn.jitFns`. No header on the wire is not checked, since a
  `void | HeadersSubset` return may legitimately send none.
- **Docs**: the Headers page this spec named is not on `main` yet, so the line went into the headers part of
  `02.middleware.md` and the "Checking Server Responses" section of the client overview instead. The parent
  branch adds it to its new Headers page after rebasing.
- **Tests**: `packages/rpc-router/test/dispatch.spec.ts` (valid, wrong value, missing required, route return),
  `packages/platform-node/test/mionHttp.spec.ts` (line break), `packages/rpc-client/test/lib/validation.spec.ts`.
