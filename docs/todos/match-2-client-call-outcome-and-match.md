---
type: feature
spec: guidelines
status: ready
created: 2026-09-06
---

# Client call() returns a matchable outcome, callRaw() keeps the tuple

## Intent

Make error handling in `@mionjs/client` one obvious thing. Today `call()` returns a 5-tuple
and every call site rewrites the same if / switch ladder over slots. The new default is the
union the route handler itself returns, plus the undeclared error, matched with the runtypes
`match()` family (its own todo; this one needs it first):

```ts
// server: (ctx, id: string): User | RpcError<'user-not-found', NotFoundData>
const outcome = await routes.users.getById(id).call();
// outcome: User | RpcError<'user-not-found', NotFoundData> | ValidationError | UndeclaredError

match(outcome)
  .when<User>(user => setUser(user))
  .catchTyped('user-not-found', e => setMissing(e.errorData.requestedId))
  .otherwise(e => setError(e.publicMessage));
```

Server and client see the same union. The lazy path stays one line:
`if (isRpcError(outcome)) ...` narrows the rest to the value.

`callRaw()` keeps the CURRENT 5-tuple, unchanged: `[result, error, undeclared,
middleFnResults, middleFnErrors]`. The order is deliberate and documented in
`packages/client/CLAUDE.md`; it stays the escape hatch for a call site that needs every
outcome at once, middleware function slots included.

## Direction

The implementer plans the details. Decided shape and rules:

- `call()` resolves to the outcome union. A middleware function's DECLARED fatal error (it
  stopped the route) is part of that union, typed, since the middleware functions are known
  at the call. A middleware error that did NOT stop the route is not in the outcome: the
  value is, and the middleware's own `onError` / `onSuccess` listeners (prefill or per sub
  request) carry its outcome. `callRaw()` still exposes it in slot 4.
- The dispatch rules pinned by `packages/client/src/errorDispatch.spec.ts` keep holding for
  `callRaw()`; the outcome union is derived from the same dispatch, not a second one.
- `batch([...]).call()` resolves to ONE outcome per route, in order, each with the same union
  its single call would have. A request-level failure (timeout, abort, network) fills every
  slot with the same undeclared error; a middleware function stopping the batch fills every
  slot with its typed error; a dependent route whose source failed already receives
  `batch-mapping-source-failed` from the router (`packages/router/src/batches.ts`), undeclared.
  `batch(...).callRaw()` keeps today's `BatchResult` 5-tuple.
- `matchAll(outcomes)` for the "all or nothing" reading: pure TypeScript, collapses to the
  first error in route order or the tuple of values, then hands that to the normal matcher
  (`when<[Order, User]>` is the success branch). Its `catch` callback receives the slot index,
  typed to the slots that declare that tag (the `catchTyped` branch), because two routes can declare the same tag or
  both fail validation. Two errors at once is the per-slot match or the raw tuple.
- TypeScript already does most of the checking: `match` reads the union from the outcome,
  so a branch the route never returns is a compile error, and `otherwise` is always required
  because the undeclared error can never be a branch. The client's own lint rule adds the
  strictness a type cannot express: every DECLARED error of the route gets its own branch
  rather than falling into `otherwise` (a lint error naming the member), and the silence
  case, an awaited `.call()` must be matched, narrowed with `isRpcError`, or explicitly
  ignored with `void`. The compiler already resolves route ids and handler types for the
  batch diagnostics (`BAT001`-style codes routed to lint), follow that road.
- Types: `Result` / `BatchResult` in `packages/client/src/types.ts` stay for `callRaw()`; the
  outcome types are new. Every client example under `packages/examples/src/client/` and the
  client error-handling and batch pages under `container/website/content/01.rpc/03.client/`
  move to `call()` + `match`, with `callRaw()` shown once as the escape hatch.

## Done when

- `call()` and `batch().call()` return outcomes; `callRaw()` variants return the unchanged
  tuples; the dispatch contract suite passes against both.
- `matchAll` exists with the slot-typed `catch`.
- The client lint rule exists: a branch per declared error, and the silence case.
- Examples and the website pages use the new default; `packages/client/CLAUDE.md` names
  `callRaw()` as the tuple's home.
