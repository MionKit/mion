---
type: feature
spec: full-plan
status: ready
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
site. The docs say "throw only for truly unexpected situations", but nothing enforces it:
an auth gate written as `throw new RpcError(...)` still lints clean today, and its declared
return type quietly stops being true.

The linter is the place to say it. mion's own ESLint rules already know how to find a
handler (`packages/devtools/src/lint/routerHelperCall.ts`), so the rule is one visitor on
top of that: a `throw` inside a route, query, mutation, middleFn or headersFn handler is
reported, with the two return forms named in the message.

### Why every `throw`, not only Error subclasses

The router does not care what was thrown. Anything that leaves a handler by `throw` is
stamped fatal and lands in `@thrownErrors` untyped (`onExecutableError` in
`packages/router/src/dispatch.ts`). A class that extends `Error`, directly or through any
number of parents (`class AuthError extends FatalError`, `class DbError extends Error`), is
the common case and is covered by the same rule; a thrown string or a rethrown `unknown`
from a catch clause is the same mistake with less information. So the rule reports the
`throw` statement itself and never has to classify the thrown value. That keeps it purely
syntactic, which is what OXlint's plugin host and the other `@mionjs/*` rules require
(no type information).

### Why a `throw` caught inside the handler is fine

```ts
mion.route((ctx, id: string): User | RpcError<'db'> => {
  try {
    if (!id) throw new Error('empty'); // never reaches the router
    return db.get(id);
  } catch {
    return new RpcError({type: 'db', publicMessage: 'lookup failed'});
  }
});
```

A `throw` inside the `block` of a `try` that has a `catch` clause, both within the handler,
never reaches the router. The rule skips it. A `throw` inside the `catch` or `finally`
clause, or inside a `try` with no `catch`, does reach the router and is reported.

## Plan

### 1. One shared handler finder (chore, same PR)

`strong-typed-routes.ts` carries private copies of the discovery every rule needs:

- `buildFunctionCache` (`packages/devtools/src/lint/rules/strong-typed-routes.ts:69`) and
  `getHandlerFunction` (`:100`): the helper call's first argument, inline or a top-level
  function reference.
- `getHandlerTypeFromAnnotation` (`:269`), `getHandlerTypeFromSatisfies` (`:289`),
  `getHandlerTypeFromJSDoc` (`:311`): `const h: Handler = ...`, `(...) satisfies Handler`,
  and the `@mion:route` / `@mion:middleFn` / `@mion:headersFn` JSDoc tags.

Lift them into `routerHelperCall.ts` as one exported
`collectHandlerFunctions(program, sourceCode): Map<HandlerFunction, RouterHelperName>`,
built once per file (cache it in a `WeakMap` keyed by the program, like
`collectRouterHelperBindings`). The annotation and JSDoc forms map to a helper name the way
`handlerTypeToFunctionName` (`:471`) does today (`HeaderHandler` → `headersFn`,
`@mion:middleFn` → `middleFn`, else `route`). `strong-typed-routes` switches to the shared
finder and keeps its own reporting; its spec is the proof nothing moved. `getRouterHelperOfHandler`
stays as it is for the two union rules.

### 2. The rule

`packages/devtools/src/lint/rules/no-throw-in-handlers.ts`, same header and shape as the
siblings (`TSESLint.RuleModule`, `meta.type: 'problem'`, no options, no fixer).

- `Program`: build the handler map from step 1.
- `ThrowStatement`: walk `parent` up to the first function node. If that function is not in
  the map, keep walking (a `throw` inside a callback nested in a handler still runs inside
  the request and is reported); stop at the program. On the way up, if the walk leaves the
  `block` of a `TryStatement` that has a `handler` (a `catch`), the throw is caught locally:
  stop, no report. If a handler function is reached, report on the `ThrowStatement`.
- One message id, `noThrow`:
  `mion {{helper}}() handler must return errors, never throw them: return new FatalError(...) to stop the request, or new RpcError(...) to keep it running.`
  `{{helper}}` is the helper name from the map (`route`, `middleFn`, ...).

`rawMiddleFn` is not a handler kind here: it cannot declare a return type, so a returned
error from one halts as undeclared anyway (`ROUTER_HELPERS` already leaves it out).

### 3. Register it

`packages/devtools/src/lint/index.ts`: import the rule, add
`'no-throw-in-handlers'` to `mionPlugin.rules` (`:191`) and
`'@mionjs/no-throw-in-handlers': 'error'` to `configs.recommended` (`:204`). The plugin is
consumed from `dist/`, so rebuild `@mionjs/devtools` before running the repo lint
(`pnpm run check:builds` says when it is stale).

### 4. The repo's own lint fallout

`pnpm run lint` is the real test. Sites that throw inside a handler today:

- `packages/router/src/routes/errors.routes.ts:31`: the router's own not-found route. It
  throws on purpose: router errors are undeclared by design (the docs say so in the throw
  section of the error handling page), and the wire location of `route-not-found` is a
  client contract. Keep the throw, add an `eslint-disable-next-line` with a one-line note.
- `packages/test-server/src/test-server.ts:344`: `throwsUnexpectedly`, which pins the
  thrown-to-undeclared-slot dispatch. Same treatment: a disable comment with the reason.
- Router specs that build throwing handlers to pin the thrown path
  (`batches.spec.ts`, `dispatch.spec.ts`, `dispatch.binary.spec.ts`, `fatalDispatch.spec.ts`,
  `security.spec.ts`): turn the rule off for `**/*.spec.ts` and `**/*.test.ts` in the root
  `eslint.config.js` (the block that already relaxes `no-unused-vars` for them). Tests
  exercise the escape hatch on purpose; a per-line comment on every one would only add
  noise.
- `packages/examples/**` is ignored by the root eslint config, so the documented
  `throw-error` example in `packages/examples/src/router/error-handling.routes.ts` stays as
  it is. It is the documentation of the escape hatch.

### 5. Consumer proof

`container/pre-publish-e2e/mion-consumer/lint/caveat.routes.ts`: add a third deliberately
wrong route that throws. `lint-transport.spec.ts` asserts `@mionjs/no-throw-in-handlers`
fired and `noThrow` is among the message ids. That lane (`pnpm miondevx release e2e`) is
what proves the compiled `./eslint` entry registers the rule for a real consumer.

## Tests

`packages/devtools/src/lint/rules/no-throw-in-handlers.spec.ts` with the same `RuleTester`
setup as `strong-typed-routes.spec.ts`.

Valid:

- a route returning `new RpcError(...)` and one returning `new FatalError(...)`;
- a `throw` inside `try { } catch { }` where both sit in the handler;
- a `throw` in a top-level function that is never passed to a helper;
- a `throw` in a function passed to something that is not a mion helper
  (`app.route('/x', (req, res) => { throw ... })`, and `route` imported from a package);
- a `throw` in a `rawMiddleFn` handler;
- a `throw` in a function declared next to a handler and only called from it (no call
  graph, documented limit, see out of scope).

Invalid, one case per detection path and per helper:

- inline arrow and `function` expression handlers on `route`, `query`, `mutation`,
  `middleFn`, `headersFn` (both `mion.route(...)` and the destructured `route(...)` forms);
- a top-level function reference passed to a helper;
- `const h: Handler = ...`, `(...) satisfies HeaderHandler`, and each `@mion:*` JSDoc tag;
- a `throw` inside a nested callback in the handler (`items.map(() => { throw ... })`);
- a `throw` in a `catch` clause (rethrow of the caught value), in `finally`, and in a `try`
  with no `catch`;
- `throw new AuthError(...)` where `class AuthError extends FatalError` is declared in the
  file, and `throw new DbError(...)` where `DbError extends Error`;
- `throw 'nope'` and `throw err`.

Each invalid case asserts the message id and the reported node is the `ThrowStatement`.

Also:

- `packages/devtools/test/eslint/plugin.test.ts:189`: the recommended config pins
  `@mionjs/no-throw-in-handlers` at `error`.
- `strong-typed-routes.spec.ts` stays green after the shared finder refactor, unchanged.
- `pnpm run lint` green on the whole repo with the rule on.

## Docs

- `container/website/content/01.rpc/06.devtools/01.linter.md`: a row in the summary table,
  the rule in the hand-picked config snippet, and a `### @mionjs/no-throw-in-handlers`
  section (why, valid, invalid) placed before the `no-unsafe-property-names` section. The
  examples come through `<code-import>` from new `start:no-throw-valid` /
  `start:no-throw-invalid` blocks in
  `packages/examples/src/introduction/eslint-rule-test.routes.ts` (the file already has
  `/* eslint-disable */` at the top, so its invalid examples compile and lint).
- `container/website/content/01.rpc/02.server/06.error-handling.md`, throw section: one
  tip saying the lint rule reports a `throw` in a handler, and that a throw meant as the
  escape hatch takes an `eslint-disable-next-line` comment with the reason.
- Website tree is hand-edited only, never formatted (repo rule).

## Fuzzing

Not a candidate. The rule is a pure syntax walk with no oracle cheaper than the
`RuleTester` matrix above.

## Out of scope

- An autofix or suggestion. `throw` → `return` is not mechanical: `RpcError` and
  `FatalError` differ in behaviour, and the handler's return type annotation must grow the
  error type too.
- Following calls: a helper declared outside the handler that throws when called from it.
  No call graph in a syntactic rule; the documented limit.
- Type-aware classification of the thrown value. Not needed, see the design note above.
- `rawMiddleFn` handlers.
- Loading the `@mionjs/*` rules into OXlint. They stay ESLint-only like their siblings.
- Making the router return its own errors (`route-not-found` and friends) instead of
  throwing them. A separate wire-contract change.

## Done when

- `@mionjs/no-throw-in-handlers` exists, is in `mionPlugin.rules` and in
  `configs.recommended` at `error`.
- The handler finder lives once in `routerHelperCall.ts` and `strong-typed-routes` uses it.
- The rule spec covers every valid and invalid case listed above and passes.
- `pnpm run lint` is green with the rule on, with the disable comments and the spec-file
  override described in step 4.
- The e2e consumer lint transport test asserts the rule fires from the published package.
- The linter page documents the rule with imported examples, and the error handling page
  points at it.
