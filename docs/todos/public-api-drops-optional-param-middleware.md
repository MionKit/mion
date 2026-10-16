---
type: fix
spec: guidelines
status: ready
created: 2026-10-16
---

# PublicApi Drops a Void Middleware Whose Params Are All Optional

## Problem

`PublicApi` (`packages/rpc-router/src/types/publicMethods.ts`) removes every member assignable to `PrivateDef`.
`PrivateMiddlewareDef.handler` is `(ctx?: any) => void | never | undefined`. TypeScript checks only the source's
REQUIRED params against the target, so `middleware((ctx, tag?: string): void => undefined)` is assignable to it and
its key disappears from the type.

The runtime rule disagrees: `isPublicExecutable` (`packages/rpc-router/src/types/guards.ts`) calls it public because
`paramsCount` is 1. So the server lists the middleware in its metadata, while:

- the client type has no `middlewares.<group>.<name>`, so an app cannot set its `onRequest` (type error);
- the bundled client lane never injects it (the build reads ids off `PublicApi`), so the bundle-vs-server parity
  check (`packages/rpc-client/test/bundled/bundled.spec.ts`, "every method of the test server") fails.

Same middleware with a required `tag: string`, or returning data, stays public.

## Repro

Add `g: {tag: middleware((_ctx, tag?: string): void => undefined), r: route(...)}` to the test server routes and
list `middlewares.g.tag` in `packages/rpc-client/test/lib/parity.ts`: `tsc` reports the key missing, and the parity
test lists `g/tag` on the server only.

## Direction

- Make the type rule match the runtime one: a middleware is private only when it declares no param after `ctx`
  (check the handler's params tuple is empty, not function assignability) and returns no data.
- Keep the one accepted type-level false positive documented in the done spec for the types-only API package,
  if it still applies after the change.
- Tests: a type test that an optional-param void middleware stays in `PublicApi`, and a test-server member of
  that shape covered by the parity test.

## Plan: type rule follows the params tuple (approved 2026-10-16, automatic mode)

- `IsPrivateDef<T>` in `publicMethods.ts`: raw, or fits `PrivateMiddlewareDef` with no fixed param after the context
  (read off `HandlerParams`). `PublicApi` filters keys with it.
- The types-only API trimmer (`ts-go-runtypes/internal/compiler/apitypes/private.go`) mirrors it: a cut needs the
  handler's last signature to take no fixed param after the context, or the definition to be raw. Probe gains `rawDef`.
- Tests: rpc-router type + runtime test, Go stub + real-router trim tests, a test-server `optionalTag` group read by
  the parity test.
