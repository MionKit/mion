---
type: feature
spec: full-plan
status: done
created: 2026-09-05
---

# Let handlers return every error instead of throwing

## Problem

mion's stated pattern is that application errors are RETURNED, so they stay in
the handler's signature and reach the client strongly typed. The docs said so
plainly: "return errors instead of throwing them".

You could not follow that advice. Measured against the dispatcher, with a
failing middleFn and a route behind it:

```
A middleFn RETURNS  | route:true  after:true  alwaysRun:true  hasErrors:false
B middleFn THROWS   | route:false after:false alwaysRun:true  hasErrors:true
C headersFn RETURNS | route:true  after:true  alwaysRun:true  hasErrors:false
D route RETURNS     | route:true  after:true  alwaysRun:true  hasErrors:false
```

Only throwing stopped anything. Returning an error changed nothing about the
chain, from any handler kind.

## Why this is the wrong shape

Two independent facts about an error were encoded in one keyword.

**Is it part of the contract?** A fact about the CALLER: an error in the
contract is handled by the component that made the call, right at the call
site. Everything else goes to a global handler, an error boundary, a toast, a
log. That is the line between typed and untyped, and it is why a validation
error is typed on the client even though the server throws it.

**Does it end the request?** A fact about the SERVER. The work after this point
must not happen at all.

All three combinations are real:

| | in the contract | ends the request | example |
| --- | --- | --- | --- |
| 1 | yes | no | a session middleFn reporting expiry; the route still runs for a guest |
| 2 | yes | **yes** | auth: the route must not run, and the client must know why, typed |
| 3 | no | yes | a malformed JSON body; nobody declared it, nothing further can run |

`return` gave case 1 and `throw` gave case 3. Case 2 could not be said, and it
is the most common middleware there is. Every auth middleFn picked halting
(the alternative is unsafe: the route reads and mutates with no identity), so
it threw and gave up the type. Four shipped examples declared
`RpcError<'not-authorized'>` in their signature and then THREW it, with a
comment claiming it "reaches the client strongly typed".

### Why a plain returned error must keep NOT halting

This was investigated before building, because "return = halt" is what every
other server does (hapi returns a Boom to take over, Elysia short-circuits on
any value returned from `beforeHandle`, Hono on a returned Response). It cannot
be mion's single rule:

- **Batches.** The routes of a batch run in order on ONE execution chain, and
  the docs promise a failing route does not stop the others. A route answering
  `user-not-found` must not drop the sibling `listOrders`. The mapping guard
  (`batch-mapping-source-failed`) exists for exactly that.
- **Non-gating middleFns.** A middleFn may report a typed error without
  blocking: an expired session on a route that works for guests, a soft
  warning. The client contract (several slots populated at once, route result
  next to a middleFn error) is built on it.

So the choice was between two rules keyed on handler kind (middleFn return
halts, route return continues) and one explicit marker that works the same for
every handler and also lets a route end a batch on purpose. The explicit marker
won.

## What shipped

| what you write | wire | client | chain |
| --- | --- | --- | --- |
| `return new RpcError(...)` | `body[id]` | typed slot | continues |
| `return new FatalError(...)` | `body[id]` | typed slot | **halts** |
| `throw` anything | `@thrownErrors` | fatal slot, untyped | halts |

Rows 1 and 3 are the old behaviour untouched. Row 2 is additive.

**`class FatalError extends RpcError`** (`packages/core/src/errors.ts`). It
reads like `new RpcError()`, so the router's own errors and the examples use
it too. Notes that matter:

- The halting check is the **`isFatal` brand on `RpcError`**, never
  `instanceof`: a thrown plain `RpcError` is stamped by the router without
  becoming a `FatalError`. `isFatalError()` reads the brand, `markFatal()`
  stamps it. The brand is optional, writable on `RpcError`, `readonly` on the
  subclass, and `@nonEnumerable`: it never rides the wire, and `DataOnly`
  stays right.
- `RpcError`'s constructor forces its own prototype, so `FatalError` restores
  its own after `super()`; otherwise `instanceof FatalError` is false.
- The class NAME is part of a class type id (and so is `readonly`), so the two
  classes never share an id. `FatalError` registers its own class serializer,
  rebuilding a real `FatalError`: a handler declared `FatalError<'x'>`
  decodes to one on the client, a handler declared `RpcError<'x'>` that
  answers a `FatalError` decodes to an `RpcError` by its declared type.
  Changing the instance class against the declared type would be a typed
  mistake.

**The dispatcher** (`packages/router/src/dispatch.ts`) checks the returned
value: a fatal one calls `markResponseFailed` (error header, status code,
`hasErrors`, `fatalError`) and still lands in `response.body[id]`, the typed
slot. The check runs before the `hasReturnData` drop.

**`response.fatalError`** (`MionResponse`) holds the error that ended the
chain, thrown or returned, first one wins. One place for an `alwaysRun` logger
to look instead of two (`thrownErrors` vs the body).

**Every thrown error is stamped fatal**, existing `RpcError`s included
(`onExecutableError`). **The router's own errors are built with
`new FatalError`** (route not found, deserialize, validation, payload too
large, batch lookups, mapper failures, the unknown-error wrapper), and so are
the adapters' platform errors; `getRouterFatalErrorResponse` sets
`fatalError` on the response it builds. Three stay plain `RpcError` because
they are declared answers that do not halt: `batch-mapping-source-failed`,
`rpc-metadata-not-found`, and the type-only platform-error placeholder.

**Raw middleFns** cannot declare a return type, so a returned `RpcError` from
one halts as an undeclared error (`@thrownErrors`). Before, it was silently
dropped in two places (`hasReturnData` is always false for them, and the
serializer skips their body slot), while `MayReturnError` claimed otherwise.

**`runOnError` is `alwaysRun`.** The flag runs the middleFn on every request,
errors or not; "run on error" misdescribed it once a returned `RpcError` is an
error that does not halt. A breaking rename, no alias.

**The client does not change.** A returned `FatalError` reaches its middleFn's
typed slot and `onError` listeners, never the fatal slot. That the route was
skipped is a server detail: the route slots stay `undefined`, nothing pretends
otherwise. The client's fatal-slot type alias was renamed from `FatalError` to
`UndeclaredError` so it no longer collides with the core class.

**Batches halt as a whole.** A `FatalError` from one route skips every later
route in the batch, on purpose: the routes run in order and may depend on one
another, and one rule is simpler than resolving dependencies. Pinned by tests.

**The `validation-error` carve-out stays**, and it is no longer an anomaly: a
validation error is thrown server side yet handled at the call site, so typed.

## Tests

- `packages/core/src/errors.spec.ts`, `error-class-serializers.spec.ts`: the
  class, the brand, `markFatal`, `isFatalError`, the brand off the wire, both
  decode lanes.
- `packages/router/src/fatalDispatch.spec.ts`: the whole matrix above, per
  handler kind; `fatalError` first-wins; the raw middleFn rule; no brand on the
  wire.
- `packages/router/src/batches.spec.ts`: a fatal route halts the batch (first
  and in the middle), a plain returned error does not.
- `packages/client/src/errorDispatch.spec.ts` T19 to T21: the typed slot and
  listener, the empty route slots, both decode lanes end to end.
- Tests pinning the old thrown-error class (`dispatch.spec.ts`,
  `headers.spec.ts`) now expect `FatalError`.

## Docs

- `01.rpc/02.server/06.error-handling.md`: rebuilt around the three-row table,
  the call-site rule, why a plain return keeps going, `alwaysRun`,
  `response.fatalError`, batches.
- `01.rpc/02.server/02.middle-fns.md`: fatal halts, a plain return does not,
  `alwaysRun`.
- `01.rpc/03.client/01.error-handling.md`: the `UndeclaredError` alias.
- The auth examples return `new FatalError`, and their typed comments are true.

## Out of scope

- Renaming the `@thrownErrors` wire field. A returned `FatalError` is fatal and
  is not in that map, so the name is correct as it is.
- Having the framework return validation errors as `FatalError` to remove the
  client carve-out. A tidy follow-on, not needed.
- Renaming the client's `batch()` (to say the routes run in order). A separate
  batch refactor lands first; the rename is its own PR.
- A lint rule enforcing "always return". Natural follow-on now the advice is
  safe to follow.
