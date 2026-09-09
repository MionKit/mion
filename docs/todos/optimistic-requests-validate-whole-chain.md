---
type: fix
spec: guidelines
status: ready
created: 2026-09-07
---

# An optimistic request must validate the whole chain before any handler runs

## Intent

The optimistic first request is a bet: send plain JSON before the client knows the route's encoder,
and if the server cannot decode or validate it, take the error and retry with the real metadata.
That bet is only safe if a failed request ran nothing.

Today it can run something. The server walks the execution chain one handler at a time, and each
step decodes its own params, validates them, then awaits the handler before the next step is even
looked at:

```ts
// packages/router/src/dispatch.ts:157
async function runRouteOrMiddleFn(context: CallContext, executable: HeadersMethod, request: MionRequest) {
  const params = sanitizeParams(deserializeBodyParamsOrThrow(request, executable as RemoteMethod), request, executable as RemoteMethod);
  if (executable.options.validateParams) validateParametersOrThrow(params, executable as RemoteMethod);
  const result = await executable.handler(context, ...params);
```

So in a chain of `auth` then `updateUser`, if `updateUser`'s optimistic params fail to decode, `auth`
has already run. Worse the other way round: a route that mutates can run and commit a write, and a
later middleFn in the same chain then fails validation, the client gets a retryable error and sends
the whole thing again. The mutation happens twice.

Separately, an optimistic request looks identical to a normal one from outside. Anyone putting a
cache or a proxy in front of the server has no way to tell "this is a speculative first attempt that
may well be retried" from a real call.

## Direction

Two changes, one on each end.

**Client: mark the request in the url.** Append `?optimistic` when the request goes out optimistic.
`makeCall` already has the flag as a local (`isOptimistic`, `packages/client/src/request.ts`, passed
into `buildFetchOptions`), and the url is built right there:

```ts
// packages/client/src/request.ts:131
const url = new URL(this.path, this.options.baseURL);
```

Note a batch already carries a query string (`this.path` is `${batchPath}?id=...`, request.ts:61),
so this appends a parameter, it never replaces the query.

**Server: an option to validate the whole chain up front.** Three levels, last one wins:

1. A router-wide option, next to `strictTypes` and `sanitizeParams` in
   `packages/router/src/types/general.ts`.
2. A per route / middleFn override in `RemoteMethodOpts`
   (`packages/core/src/types/method.types.ts:48`), resolved as `route option ?? router option` where
   `strictTypes` is resolved today (`packages/router/src/router.ts:486` for middleFns, `:562` for
   routes).
3. The `?optimistic` url parameter, which forces the mode on whatever the options say.

When the mode is on, decode and validate every handler in the chain first. If any one fails, answer
with that error and execute no handler at all. When it is off, keep today's behaviour exactly.

Pointers worth having before designing it:

- The chain loop is `runExecutionChain` (`packages/router/src/dispatch.ts:74`); the three callers it
  dispatches to are `runRawMiddleFn`, `runHeadersMiddleFn` and `runRouteOrMiddleFn` (`:124`, `:137`,
  `:157`). A pre-pass means splitting decode+validate out of those callers.
- `deserializeBodyParamsOrThrow` writes the decoded params back into `request.body` in place
  (`dispatch.ts:210`). A pre-pass must not end up decoding twice.
- A raw middleFn has no declared params, so it has nothing to pre-validate.
- The url query already reaches the server and is already parsed: `dispatchRoute` takes `urlQuery`
  (`dispatch.ts:35`), and `readBatchId` (`packages/router/src/batches.ts:138`) splits it today. The
  `?data=` query body (`packages/router/src/lib/queryBody.ts`) shares the same query string, so the
  new parameter has to coexist with both.

The implementer plans the rest. Open points to settle rather than assume:

- **Whose option decides for a chain.** A chain mixes a route and its middleFns, each with its own
  resolved value. The route heading the chain deciding for all of it is the obvious answer, but pin
  it in a test rather than leaving it implied. Same question again for a batch, where one request
  carries several routes.
- **Whether the resolved value rides the client metadata.** `strictTypes` and `sanitizeParams` both
  do, because the client acts on them. Check whether the client has any use for this one before
  copying that.
- **What it costs.** Fail-fast's whole point is not decoding the rest of the chain after a failure.
  The new mode gives that up on purpose, so the option's default should be off and the docs should
  say what turning it on buys and costs.
- **Naming.** Something that says what it does at the call site, not how it is implemented.

## Done when

- An optimistic request carries `?optimistic`, batch requests included, without losing their existing
  query parameters.
- The server has the option at all three levels, with the url parameter overriding the other two.
- With the mode on, a chain whose second handler fails validation or decoding never runs the first
  one, and a mutation never commits on a request that is answered with a retryable error.
- With the mode off, behaviour is unchanged from today.
- Tests cover both option levels, the url override, a chain where an early handler would have run, a
  batch, and the client actually sending the parameter.
- The website's router options and route options pages describe the new option, what it protects
  against, and why it is off by default.
