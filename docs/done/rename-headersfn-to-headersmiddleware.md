---
type: chore
spec: guidelines
status: done
created: 2026-10-01
---

# Rename headersFn to headersMiddleware

## Intent

`mion.headersFn` creates a middleware that reads request headers, but its name says "function", not
"middleware". `mion.headersMiddleware` says what it is, sits next to `mion.middleware` and
`mion.rawMiddleware`, and matches the name the code already uses inside: `HandlerType.headersMiddleware`
in `packages/core/src/constants.ts`.

## Direction

A public rename across router, client, compiler and docs. The implementer plans the details. Verified
starting points:

- Router helper and types: `headersFn` in `packages/rpc-router/src/lib/handlers.ts` and
  `packages/rpc-router/src/router.ts`; `HeadersFnHelper` in `packages/rpc-router/src/types/mionRouter.ts`;
  `PublicHeadersFn` in `packages/rpc-router/src/types/publicMethods.ts`. Rename the related type names too.
- The compiler recognises the helper by name: `@mion:headersFn` and `"headersFn("` in
  `ts-go-runtypes/internal/compiler/routerrules/routerrules.go`. Without this the lint rules and the build
  stop seeing headers middleware.
- Client error messages that say "HeadersFn" in `packages/rpc-client/src/lib/headers.ts`.
- Diagnostic prose naming `headersFn`: `ts-go-runtypes/internal/diagnostics/codes_mionroute.go`, and the
  catalog description in `scripts/core/gen-diagnostics-catalog.mjs` (regenerate the catalog after).
- NOT the same thing: the `headersFns` slot in `rtFns` (`ts-go-runtypes/internal/compiler/resolver/apigen.go`)
  is the compiled header validators, not the helper. Leave it unless the new name reads better there too.
- Tests and examples using `mion.headersFn`: `packages/rpc-router/test`, `packages/rpc-client/test`,
  `packages/private-examples/src`, `packages/private-test-server`, `packages/private-test-router-fuzz`.
- A renamed thing leaves no trace: no `headersFn` alias, no "renamed" hint, no old-name test or doc line.
  `docs/done/` and `CHANGELOG.md` keep their history.

## Docs

Existing pages, existing sections:

- RPC → Server → Headers ("Reading Request Headers" names `mion.headersFn` and "headers function").
- RPC → Server → Middleware, and any other page or example naming `headersFn` or "headers function"
  (a grep of `container/website/content/` and `packages/private-examples/src/`).
- The generated diagnostics catalog pages, after regenerating.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- `mion.headersMiddleware` works everywhere `mion.headersFn` did, the compiler and lint rules see it, and
  a grep for `headersFn` (outside `docs/done/`, `CHANGELOG.md` and the `headersFns` rtFns slot) finds nothing.
- `pnpm test` and `go -C ts-go-runtypes test ./internal/... ./cmd/...` pass.
- The PR carries the `pre-publish-e2e` label (public API rename) and `website`.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.

## Shipped

Renamed as planned across router, client, core, compiler, lint prefilter, docs, examples and tests. The `headersFns` rtFns slot was left as is. The diagnostics catalog was regenerated.
