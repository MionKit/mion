---
type: fix
spec: guidelines
status: done
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

- Make the type rule match the runtime one: a middleware is private only when it declares no fixed param after
  `ctx` (read the handler's params tuple, not function assignability; a bare rest param counts as none, as at
  runtime) and returns no data.
- Keep the one accepted type-level false positive documented in the done spec for the types-only API package,
  if it still applies after the change.
- Tests: a type test that an optional-param void middleware stays in `PublicApi`, and a test-server member of
  that shape covered by the parity test.

## Done when

- An optional-param void middleware stays in `PublicApi`, pinned by a type test.
- A test-server member of that shape is read by the parity test.
- The types-only API trimmer keeps the same members `PublicApi` keeps, pinned by its stub and real-router tests.

## Plan: type rule follows the params tuple (approved 2026-10-16, automatic mode)

- `IsPrivateDef<T>` in `publicMethods.ts`: raw, or fits `PrivateMiddlewareDef` with no fixed param after the context
  (read off `HandlerParams`). `PublicApi` filters keys with it.
- The types-only API trimmer (`ts-go-runtypes/internal/compiler/apitypes/private.go`) mirrors it: a cut needs the
  handler's last signature to take no fixed param after the context, or the definition to be raw. Probe gains `rawDef`.
- Tests: rpc-router type + runtime test, Go stub + real-router trim tests, a test-server `optionalTag` group read by
  the parity test.

## What shipped (2026-10-16)

As planned, plus what the review found:

- `IsPrivateDef` stays unexported: `PublicApi` is its only user.
- A bare rest param (`(ctx, ...tags: string[])`) counts as no param on every side, as the runtime counts it
  (`paramsCount` 0). The type uses `Required<HandlerParams<H>> extends [any, ...any[]]`.
- The Go trimmer reads the params like `HandlerParams`: a tuple rest param counts its elements, and an optional
  context gives no params. Its stub and real-router tests add `tagged`, `tuple` (kept) and `rest`, `optionalCtx` (cut).
- The test-server group `optionalTag` holds only the middleware: the parity test reads its id off `TestServerApi`.
- The accepted false positive in the types-only API trimmer still applies: a `PublicMiddleware` typed with a
  no-params, void handler fits `PrivateDef`, and the public-method check keeps it.
- Type cost: the client chain in `private-type-budget` grew by 34 instantiations, inside its budget.
