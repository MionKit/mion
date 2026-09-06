---
type: feature
spec: full-plan
status: done
created: 2026-09-06
---

# Lint rule: handlers return errors, they never throw them

## Problem

Since the error refactor, every handler kind can return an error and choose whether the
request stops:

| what a handler writes | client | chain |
| --- | --- | --- |
| `return new RpcError(...)` | typed slot | keeps running |
| `return new FatalError(...)` | typed slot | stops |
| `throw` anything | undeclared slot, untyped | stops |

Row three is the escape hatch, not the pattern. A thrown error leaves the handler's
signature, so the client only gets a public message and cannot handle it at the call
site. The docs said "throw only for truly unexpected situations", but nothing enforced it:
an auth gate written as `throw new RpcError(...)` still linted clean, and its declared
return type quietly stopped being true.

The examples had the matching problem from the other side. Two auth gates returned a plain
`RpcError`, so the chain kept running with no identity, and every other gate returned a
`FatalError` while declaring `RpcError`, which is the mismatch the refactor calls a typed
mistake.

## What shipped

### The rule

`@mionjs/no-throw-in-handlers`
(`packages/devtools/src/lint/rules/no-throw-in-handlers.ts`), registered in `mionPlugin.rules`
and at `error` in `configs.recommended` (`packages/devtools/src/lint/index.ts`).

One `ThrowStatement` visitor. From each `throw` it walks `parent` outward:

- crossing out of the `block` of a `TryStatement` that has a `handler` stops the walk with no
  report, since that throw never reaches the router;
- reaching a function node asks `getRouterHelperOfHandler` whether it is a handler. If yes it
  reports; if no it keeps walking, so a throw in a callback nested in the handler body still
  resolves to the handler that contains it;
- reaching the program stops.

The rule never classifies the thrown value. The router does not either: anything leaving a
handler by `throw` is stamped fatal and lands in `@thrownErrors` untyped (`onExecutableError`,
`packages/router/src/dispatch.ts`), so a class extending `Error` through any number of parents,
a bare string and a rethrown `unknown` are one mistake. That keeps the rule syntactic, which is
what OXlint's plugin host requires: the `@mionjs/*` rules get no type information.

`rawMiddleFn` is not covered. It cannot declare a return type, so a returned error from one
halts as undeclared anyway, and `ROUTER_HELPERS` already leaves it out.

### Repo fallout

- `packages/router/src/routes/errors.routes.ts`, the router's own not-found route: kept the
  throw behind an `eslint-disable-next-line`. Router errors are undeclared by design and the
  wire location of `route-not-found` is a client contract.
- `packages/test-server/src/test-server.ts`, `throwsUnexpectedly`: same, the throw is what the
  fixture pins.
- `eslint.config.js`: the rule is `off` for `**/*.spec.ts` and `**/*.test.ts`. Tests build
  throwing handlers on purpose to pin the thrown path, and a comment on each would be noise.
- `packages/examples/**` is ignored by the root eslint config, so the documented throw example
  stays as it is.

### Examples audit

The rule applied: a handler that GATES returns `FatalError`, a handler reporting its OWN
outcome returns plain `RpcError`. Both directions were checked.

Two behaviour bugs fixed. `router/sharing-data.ts` returned a plain `RpcError` from its auth
gate, so `sayMyName` behind it still ran and read `context.shared.myUser.name` on an
unauthenticated request. `router/middleFns-header-definition.routes.ts` had the same shape.
Both now return and declare `FatalError`.

Six gates already returned a `FatalError` but declared `RpcError<'not-authorized'>`. The client
decodes by the DECLARED type, so it received a plain `RpcError` and the signature never said the
request halts. Annotations aligned to `FatalError<...>` in `introduction/myApi.routes.ts`,
`router/error-handling.routes.ts`, `client/auth-user.routes.ts`, `client/server.routes.ts`,
`client/hello-sum-auth.routes.ts` and `client/prefill.routes.ts`. No wire change: the fatal brand
never travels, only the decoded class changes.

One change the other way. `router/extending-routes-and-middleFns.routes.ts` is a ROUTE returning
`operation-failed` as a `FatalError`; a route reporting that its own work failed has no reason to
stop the rest of the chain, so it is a plain `RpcError` now.

Everything reporting its own outcome stays `RpcError`: every `user-not-found` /
`pet-not-found` / `data-not-found` / `order-not-found` site, both drizzle examples, and
especially `client/batch-orders.routes.ts`, where one route answering "not found" must not drop
its siblings in the batch.

`client/client.ts` had one comment naming the old type. The client examples otherwise match on
`error.type` and read `error.errorData`, both of which survive the class change, so no client
logic moved.

## Tests

- `packages/devtools/src/lint/rules/no-throw-in-handlers.spec.ts`, 21 cases. Valid: both return
  forms; a throw caught by `try`/`catch` inside the handler; a plain function no helper takes;
  express-style `app.route('/x', handler)`; `route` imported from a package; a `rawMiddleFn`
  handler. Invalid: every helper (`route`, `query`, `mutation`, `middleFn`, `headersFn`), the
  destructured form, a function expression, a nested callback, a rethrow from `catch`, a throw in
  `finally`, a `try` with no `catch`, a subclass of `FatalError`, a subclass of `Error`, a bare
  string, and a router imported from a relative module.
- `packages/devtools/test/eslint/plugin.test.ts` pins the rule at `error` in the recommended
  config.
- `container/pre-publish-e2e/mion-consumer`: a third deliberately wrong route that throws, its
  eslint config enables the rule, and `lint-transport.spec.ts` asserts the rule fired with the
  `noThrow` message id from the PUBLISHED package.
- `pnpm run typecheck` is the gate on the examples audit: the root typecheck compiles
  `packages/examples`, so a wrong `FatalError` annotation fails there.

## Docs

- `01.rpc/06.devtools/01.linter.md`: summary-table row, the rule in the hand-picked config
  snippet, and a full section with valid and invalid `<code-import>` examples plus the note about
  which handler shapes the rule can see.
- `01.rpc/02.server/06.error-handling.md`: a note in the throw section pointing at the rule and
  at the disable comment for a deliberate throw.
- `packages/examples/src/introduction/eslint-rule-test.routes.ts`: new `start:no-throw-valid` and
  `start:no-throw-invalid` blocks.

## Out of scope

- **Handler shapes the rule cannot see.** `getRouterHelperOfHandler` only recognises a handler
  written inline in the helper call, so a named function reference (`mion.route(myHandler)`), a
  `Handler`-typed const, a `satisfies Handler` expression and a `@mion:route` JSDoc tag are not
  checked. `no-unreachable-union-types` and `no-mixed-union-properties` accept the same limit.
  Closing it means lifting the handler finder out of `strong-typed-routes.ts` into
  `routerHelperCall.ts` so both rules share one copy; deliberately left out to keep this change
  small. Still work owed.
- An autofix. `throw` to `return` is not mechanical: `RpcError` and `FatalError` differ in
  behaviour, and the handler's declared return type has to grow the error type too.
- Following calls into a helper declared outside the handler. No call graph in a syntactic rule.
- Type-aware classification of the thrown value. Not needed, the router does not classify either.
- Loading the `@mionjs/*` rules into OXlint. They stay ESLint-only like their siblings.
- Making the router return its own errors instead of throwing them. A separate wire contract.
