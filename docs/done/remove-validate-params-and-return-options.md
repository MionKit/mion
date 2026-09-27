---
type: chore
spec: guidelines
status: done
created: 2026-09-27
---

# Remove the validateParams and validateReturn Options

## Intent
Params are always validated and decoded: they are what everything else rests on, so there is no switch to turn that off.

The server never validates a value a handler returned: once a handler has returned, failing the request cannot be recovered from. Checking a server's answers is a client-side choice: a user who wants it turns it on in the client, and a mismatch is reported there.

Write the result as if the two options never existed: no check or error for someone still passing them, no mention of them in the docs, no migration note.

## Direction
- Router options: `validateParams` / `validateReturn` in `packages/rpc-router/src/types/remoteMethods.ts` (~38-65) and the resolved option types in `src/types/resolvedOptions.ts` (~31-47); defaults set in `src/router.ts` (~540, and the route twin).
- Dispatch: `packages/rpc-router/src/dispatch.ts` checks `options.validateParams` before calling a route or headers middleware (~189, ~200) and runs `validateReturnOrThrow` (~117-151, ~292). Params validation becomes unconditional; the return check is deleted.
- `packages/rpc-router/src/batches.ts` (~363) builds an internal executable with `validateParams: false`: decide whether it validates like the rest or needs no params step at all.
- `dispatch.ts` (~246) refuses a params value that is not an array before it is validated, because with validation off nothing else did. Decide whether it stays once validation always runs.
- `mionMethodsMetadata` (`packages/rpc-router/src/middlewares/methodsMetadata.ts`) reads its `mode` param as-is: with validation off today any truthy value acts as `'only'`. Always-on validation fixes that; add a test that a wrong mode is refused.
- The options also reach the client metadata rows (`options.validateParams` in serialized methods) and the Go side that emits bundled rows: grep both and drop them.
- Client: add an opt-in to validate a response against the route's return type (the compiled functions are already on the client), with a clear home for the error (likely the undeclared slot). Decide the option name and where it lives (`initClient` options, per call, or both).
- The implementer plans the details.

## Docs
`01.rpc/02.server/07.validation.md`: rewrite the passages about `validateParams` and `validateReturn` (lines ~12, ~25, and the `sanitizeParams` note at ~87) so the page states params are always validated and says nothing of the options. Add the client-side response check where the client options are documented (existing client options section).

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when
- No route or middleware option turns param validation off, the server never validates a returned value, and nothing in code or docs refers to the two options.
- A client can opt in to checking responses, with tests for a matching and a mismatching answer.
- `pnpm test`, `go -C ts-go-runtypes test ./internal/... ./cmd/...` and `pnpm run lint` pass.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each committed on its own.

## Plan — as built (approved 2026-09-27)

### Server
- The two keys are gone from the route and middleware option types, the resolved option types, `RemoteMethodOpts` in `@mionjs/core`, and the options the router writes on each executable, so they no longer ride the client metadata rows either.
- `dispatch.ts` always runs `validateParametersOrThrow`; `validateReturnOrThrow` and its two call sites are deleted.
- The not-an-array guard in `deserializeBodyParamsOrThrow` stays: a route with no params has a no-op validator, so a string body would still be spread into the handler as characters. Only its comment changed.
- `batches.ts`: the mapping method drops `validateParams: false`. It runs through its own caller and never read the option.
- The Go side reads the options object generically; only its test fixtures named the keys.
- `mionMethodsMetadata` already had validation on by default; a new test pins that an unknown `mode` is refused with a `validation-error` and no route runs.

### Client
- New `validateServerResponses` option on `initClient`, default `false` (the client's own `validateParams` pre-send check stays).
- When on, every answer the response body carries (not an error, method has return data, not a headers return) is checked with the method's return `isType`. A mismatch drops the value and lands in the undeclared slot as a `response-validation-error` with the type errors in `errorData`. Members absent from the body (a chain stopped early) are not checked.
- Tests: `packages/rpc-client/test/validateServerResponses.spec.ts` against a new `wrongAnswer` route in the test server: off by default, a matching answer passes, a wrong answer is dropped and reported.

### Docs
- `01.rpc/02.server/07.validation.md`: params are always validated; the return-value section and its example are gone.
- `01.rpc/03.client/00.client-overview.md`: new "Checking Server Responses" section with `client-validate-server-responses.ts`.

### Not a fuzz candidate
The check reuses the return validators, which the run-types fuzz suites already cover.
