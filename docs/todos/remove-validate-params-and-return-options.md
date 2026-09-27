---
type: chore
spec: guidelines
status: ready
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
