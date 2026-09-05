---
type: feature
spec: guidelines
status: ready
created: 2026-09-05
---

# Let handlers return every error instead of throwing

## Intent

mion's stated pattern is that application errors are RETURNED, so they stay in
the handler's signature and reach the client strongly typed. The docs say so
plainly: "return errors instead of throwing them".

You cannot actually follow that advice today. Whether you return or throw
changes TWO unrelated things at once, and nothing in a handler's signature says
which you picked:

| | typed on the client | stops the execution chain |
| --- | --- | --- |
| `return new RpcError(...)` | yes | no |
| `throw new RpcError(...)` | no | yes |

An auth middleFn needs both. It cannot have both, so it throws and gives up its
type. The shipped examples show the damage: `client/auth-user.routes.ts`,
`client/server.routes.ts`, `client/prefill.routes.ts` and
`client/hello-sum-auth.routes.ts` all declare
`): void | RpcError<'not-authorized', ...>` and then THROW that exact error,
with a comment claiming it "reaches the client strongly typed". It does not.

Simply switching those examples to `return` is NOT the fix. A returned error
never stops the chain, so the guarded route runs and answers with its data.
Verified against the real dispatcher:

```
RETURNED -> routeRan: true  | hasErrors: false | body: {"auth":[1,{...}],"secret":"top secret"}
THROWN   -> routeRan: false | hasErrors: true  | body: {"@thrownErrors":{"auth":{...}}}
```

The goal is a design where returning is enough for every case, so `throw` is
never needed for control flow. Getting there needs the current behaviour
understood first, because it is deliberate and pinned by tests.

## Investigate first

This is deliberately open. Work out the intended design before proposing one.

**What is throwing actually FOR?** A previous attempt assumed it was a mistake
to be linted away and was wrong. There is a real contract underneath: returned
errors are DECLARED responses and land in `body[handlerId]`, thrown errors are
undeclared and land in `body['@thrownErrors'][handlerId]`, and the client reads
that placement alone to decide which slot an error belongs in. Understand that
contract before changing anything.

**How does a thrown error behave per handler kind?** Do not assume it is
uniform. Check `route`, `query`, `mutation`, `middleFn`, `headersFn` and
`rawMiddleFn` separately, and answer for each: where does the error land on the
wire, does the chain stop, do `runOnError` handlers still run, and can that
handler kind return an error at all.

That last one matters. `MayReturnError` (`types/publicMethods.ts:17`) says a raw
middleFn may return an error, but raw middleFns are built with
`hasReturnData: false` (`lib/reflection.ts:78`) and the chain drops any result
from such a handler at `dispatch.ts:86`. Confirm whether a returned error from a
raw middleFn is silently discarded. If it is, that alone blocks "return only"
for the framework's own serializer middleFns.

**Separate the concerns before designing.** At least three questions hide behind
one keyword today, and a proposal that merges any two of them will be wrong:

- which bucket the error goes in, typed `body[id]` or untyped `@thrownErrors`
- whether the chain stops for handlers without `runOnError`
- whether anything should ever skip `runOnError` handlers too (today nothing
  does, and the response serializer relies on that)

**The router's own throws are a separate population.** Some fire at setup time,
building the router, where no response exists and throwing is the only option.
Others fire during a dispatch, where the router throws and catches its own
error one frame later. Decide whether request-time framework errors belong in
this change at all, and note that they are nobody's declared error, so a typed
slot keyed by a handler id is the wrong home for them.

## Compare against other chain based servers

mion's chain is FLAT: a list of executables walked in order, where "always runs"
is the `runOnError` flag and "stop" is a boolean on the response. Most other
frameworks solve the same three cases differently, and some get them for free
from the shape of their chain. Survey them before inventing something, and say
in the write up which ideas were rejected and why.

Answer these for each one, since they are the cases mion cannot currently
express together:

- how do you say "stop here, nothing further runs"
- how do you say "this always runs, even after a failure" (logging, metrics,
  cleanup, writing the response)
- is there a HARD abort that skips even the always run handlers, or is that
  deliberately impossible
- is a declared or expected error distinguished from an unexpected one, and does
  that distinction reach the caller

Worth looking at:

- **Express**: `next()` continues, `next(err)` skips ahead to the error handling
  middleware, identified only by its four argument signature. Note how awkward
  "always runs" is there, usually a `res.on('finish')` listener rather than part
  of the chain.
- **Koa**: the onion model, where every middleware `await next()` wraps the rest
  of the chain. A plain try/catch/finally gives you both "always runs" and "stop"
  with no flags at all. This is the strongest argument that mion's problem comes
  from the chain being flat rather than nested, so weigh whether the flat chain
  is worth keeping.
- **Fastify**: named lifecycle hooks (`onRequest`, `preHandler`, `onSend`,
  `onResponse`) plus a dedicated error handler, where `onResponse` is the "always
  runs" slot. Compare its hook names to mion's single `runOnError` flag.
- **Hapi**: lifecycle extension points where returning `h.continue` carries on
  and returning a response or a Boom error short circuits. Closest thing to
  "return an error to stop", which is what this todo wants.
- **NestJS guards**: the direct analogue of mion's auth case. A guard returns
  false or throws, and either way the handler does not run. Look at how that
  reaches the client and whether the reason survives typed.
- **tRPC**: the closest comparison, since it is typed RPC with middleware.
  Middleware returns `next()` or throws `TRPCError`. Check what the client
  actually gets: as far as this todo's author could tell, tRPC gives up typed
  errors entirely and hands the caller a generic client error. If so, mion is
  trying to do better than the obvious precedent, which is worth knowing before
  copying anyone.

## Tests that pin today's behaviour

Read these before proposing anything. They are the contract, and a design that
breaks them needs an argument, not a fix.

**`packages/client/src/errorDispatch.spec.ts`** is the main one, 21 tests
written as a contract:

- `T3` route succeeds while a middleFn fails, slot 0 keeps the result. Its
  comment states the rule outright: "a RETURNED middleFn error does not abort
  the chain". Making returned errors halt breaks this one first.
- `T2b` server-side param validation is THROWN yet must arrive typed, the
  carve-out that exists because validation errors are declared but thrown
- `T9` a route throws an undeclared error, must reach the fatal slot, never the
  typed one
- `T4` a middleFn error never appears in the typed route slot
- `T14` a middleFn's DECLARED error reaches both its listener and its slot
- `T17` a failing `runOnError` middleFn plus a throwing route, no information lost

**`packages/router/src/batches.spec.ts:689`** a source route that RETURNS a
declared error: the batch keeps going and `hasErrors` stays false. Several
routes share one chain, so one route's declared error must not kill its
siblings. This is why "returned errors halt" cannot simply be switched on.

**`packages/client/src/batch.spec.ts`** the same rule from the client side,
covering slot contents and array order.

**`packages/router/src/dispatch.spec.ts`** a headersFn auth that RETURNS
`RpcError<'not-authorized'>`, plus the validation-error assertions.

**`packages/test-server/src/test-server.ts`** the fixtures those rest on:
`throwsUnexpectedly` at :322 (a route that throws) and `audit` at :327 (a
`runOnError` middleFn).

## Where the behaviour lives

```
packages/router/src/dispatch.ts:79        the halt: skip non-runOnError when hasErrors
packages/router/src/dispatch.ts:86        results dropped when hasReturnData is false
packages/router/src/dispatch.ts:101       the catch around every handler
packages/router/src/lib/dispatchError.ts:51   onExecutableError, the only writer of hasErrors
packages/router/src/lib/reflection.ts:78  rawMiddleFn defaults to hasReturnData false
packages/router/src/types/publicMethods.ts:17  MayReturnError
packages/core/src/constants.ts:45         MION_ROUTES.thrownErrors, the wire field
packages/client/src/request.ts:257        resolveSubRequests, reads the returned/thrown split
packages/client/src/client.ts:211         thrown ids dropped from the typed record
```

A shipped spec in `docs/done/` covers the client dispatch contract and explains
why the split exists. Find it by searching that directory for the slot rules
R1 to R6.

## Direction

Land on a design where a handler can express, by returning only:

- a declared error that lets the request carry on (today's plain returned error)
- a declared error that ends the request (what auth needs and cannot say)
- an undeclared error that ends the request (what a throw produces today)

`throw` should keep exactly one job afterwards: real bugs and infrastructure
failures from inside user code, which the router catches and treats as
undeclared. Anything the framework itself needs to report during a dispatch
should not travel by throwing.

Ideas raised but NOT settled, and worth re-deriving rather than inheriting: a
flag on the error such as `isFatal`, a subclass such as `FatalError` that sets
it (greppable, and visible in the return type), a per-handler option, and
renaming the `@thrownErrors` wire field to `@fatalErrors`. Each has a different
blast radius. A per-handler option was prototyped and made all 646 router,
client and core tests pass, but it fails open: forget it on an auth middleFn and
the guarded route runs. Weigh that against the alternatives rather than assuming
it.

Whatever lands, the examples above stop throwing and their comments become
true, and the docs need the caveat they are missing today: the error handling
page says "always return" with no exception, and the middleFns page claims an
error in a route or middleFn stops the rest, which is only true for a thrown
one.

A lint rule enforcing "always return" is a natural follow-on, but it is
pointless until the design makes that advice safe to follow, and it is not part
of this.

## Done when

- The intended behaviour of throwing is written down, per handler kind, backed
  by the tests above.
- The survey of other chain based servers is written down, including which of
  their approaches were rejected and why.
- A handler can return a declared error that ends the request, with no throw.
- The examples return their auth errors and the client receives them typed.
- The contract tests still pass, or each intentional change is argued and its
  test updated.
- The docs say what actually happens.
