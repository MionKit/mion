---
type: feature
spec: full-plan
status: ready
created: 2026-09-05
---

# Let handlers return every error instead of throwing

## Problem

mion's stated pattern is that application errors are RETURNED, so they stay in
the handler's signature and reach the client strongly typed. The docs say so
plainly: "return errors instead of throwing them".

You cannot follow that advice today. Measured against the real dispatcher, with
a failing middleFn and a route behind it:

```
A middleFn RETURNS  | route:true  after:true  afterRunOnError:true  hasErrors:false
B middleFn THROWS   | route:false after:false afterRunOnError:true  hasErrors:true
C headersFn RETURNS | route:true  after:true  afterRunOnError:true  hasErrors:false
D route RETURNS     | route:true  after:true  afterRunOnError:true  hasErrors:false
```

Only throwing stops anything. Returning an error changes nothing about the
chain, from any handler kind. `runOnError` works as expected, but only on the
thrown path: in row B the plain middleFn is skipped and the `runOnError` one
still runs.

(Worth knowing while reading the auth examples: they fail on a MISSING header,
which fails param validation before the handler is ever called. Validation
throws, so the chain halts and the route is skipped. It looks like the auth
error stopped things, but it was validation. Send a present but wrong token to
see the handler's own error.)

## Why this is the wrong shape

Two independent facts about an error are both encoded in one keyword.

**Is it part of the contract?** A fact about the CALLER, and the practical test
is where it gets handled: an error that is part of the contract is handled by
the same component that made the call, right at the call site. Everything else
goes to a global handler, an error boundary, a toast, a log. That is the real
line between typed and untyped, and it is why a validation error is typed on the
client even though the server throws it.

**Does it end the request?** A fact about the SERVER. The work after this point
must not happen at all.

They are independent because all three combinations are real:

| | in the contract | ends the request | example |
| --- | --- | --- | --- |
| 1 | yes | no | a session middleFn reporting expiry; the caller wants to know, the route is still fine to run |
| 2 | yes | **yes** | auth |
| 3 | no | yes | a malformed JSON body; nobody declared it, nothing further can run |

`return` gives you case 1 and `throw` gives you case 3. **Case 2 cannot be said
at all**, and it is the most common middleware there is.

### Why auth is case 2

It must end the request because the guarded route must not RUN. This is not
about hiding a value from the response. The route does real work: it reads the
database, it mutates state, it acts. And it acts with no identity, since the
auth middleFn never got to set `ctx.shared.me`, so it either crashes or behaves
as an anonymous caller. An unauthorized request must not reach that code at all.

It must be typed because it is handled at the call site, by the same rule as a
validation error. "Not authorized" has a specific recovery: refresh the token,
redirect to a login, prompt for credentials, chosen from its `errorData`
(missing token, expired, invalid). It is also a NORMAL outcome, not a bug. A
request without a valid token failing is the system working.

Forced to pick one, every auth middleFn picks halting, because the alternative
is unsafe. So it throws and gives up the type. The shipped examples show the
result: `client/auth-user.routes.ts`, `client/server.routes.ts`,
`client/prefill.routes.ts` and `client/hello-sum-auth.routes.ts` all declare
`): void | RpcError<'not-authorized', ...>` and then THROW that exact error,
with a comment claiming it "reaches the client strongly typed". It does not.

## The design

Add case 2 and change nothing else.

| what you write | wire | client | chain |
| --- | --- | --- | --- |
| `return new RpcError(...)` | `body[id]` | typed slot | continues |
| `return new FatalError(...)` | `body[id]` | typed slot | **halts** |
| `throw` anything | `@thrownErrors` | fatal slot, untyped | halts |

Rows 1 and 3 are today's behaviour untouched, so every existing test stays
green, `errorDispatch.spec.ts` T3 and the batch independence tests included. Row
2 is purely additive.

**`FatalError` extends `RpcError`** and sets an `isFatal` brand. It is greppable,
it shows up in the return type, and a reader can tell a guarded route from an
unguarded one by reading the signature.

**Decided: a returned `FatalError` stays in `body[id]`.** Sending it to the
undeclared map instead would leave auth halting but untyped, which is the entire
problem this solves. Confirm this before building, because it fixes what the
word means: **fatal means it ends the request**, not "undeclared". The client's
fatal slot then holds what is fatal AND undeclared.

**Two consequences of that definition, both worth stating:**

`runOnError` should be renamed **`runOnFatal`**. Once a returned `RpcError` is an
error that does not halt, "run on error" actively misdescribes the flag. It runs
after something fatal.

The `@thrownErrors` wire field should NOT be renamed to `@fatalErrors`, which an
earlier round of this discussion proposed. Under this definition a returned
`FatalError` is fatal and is not in that map, so the name would be wrong. It
holds thrown, undeclared errors, and `@thrownErrors` already says that.

**The `validation-error` carve-out stays**, and it stops being an anomaly. It
exists because validation is thrown server side yet is part of every route's
contract (`request.ts:266` keeps it out of the fatal set, `client.ts:211`). By
the call site rule above that is exactly right: a validation error is handled by
the component that made the call. Removing the carve-out by having the framework
RETURN validation errors as `FatalError` is a tidy follow-on, but it is not
needed here and is out of scope.

## Plan

### 1. `FatalError` and the brand (`packages/core/src/errors.ts`)

- `isFatal` on `RpcError`, following the existing brand convention rather than
  `instanceof`: errors cross realms and come back off the wire, where
  `instanceof` stops working. `isRpcError` already does this with the
  `mion@isΣrrθr` key; mirror it.
- Non-enumerable, like `name` at `errors.ts:150`. It must not ride the wire. The
  client decides typed against fatal purely from which map the error arrived in,
  so it never needs the flag.
- `export class FatalError<ErrType, ErrData> extends RpcError` setting it true.
- `isFatalError()` guard beside `isRpcError`.

### 2. The chain honours it (`packages/router/src/dispatch.ts`)

`runExecutionChain` already skips executables when `response.hasErrors`
(`dispatch.ts:79`). Add one check on the returned value: if it is fatal, mark the
response failed the way `onExecutableError` does (the `x-rpc-error` header, the
status code, `hasErrors`) and leave the error itself in `response.body[id]`.
That placement is what keeps it typed.

Mind `dispatch.ts:86`: results are dropped when `hasReturnData` is false, which
is the default for raw middleFns (`lib/reflection.ts:78`). Check the fatal
branch runs before that drop, or a returned `FatalError` from a raw middleFn is
silently discarded. `MayReturnError` (`types/publicMethods.ts:17`) claims raw
middleFns may return errors, so confirm whether that is true today and fix or
document it.

### 3. The catch stamps the brand (`packages/router/src/lib/dispatchError.ts:51`)

Today a thrown `RpcError` passes through untouched and only non-errors are
wrapped. Stamp `isFatal` on whatever comes out, so the flag is truthful for
every error that halted the chain, including one a `runOnFatal` middleFn reads
back off the context. This changes no behaviour, since the thrown path already
halts by placement.

### 4. Rename `runOnError` to `runOnFatal`

A public option, so a breaking change. Surface: `core/src/types/method.types.ts`
(`RemoteMethodOpts`, `RouteOnlyOptions`), `router/src/types/remoteMethods.ts`
(the three option types), the plumbing in `router.ts`, the internal routes that
set it (`routes/client.routes.ts`, `routes/serializer.routes.ts`), the examples
that use it (`introduction/myApi.routes.ts`,
`router/middleFns-definition.routes.ts`, `client/init.routes.ts`) and the docs.

### 5. Examples

The four auth handlers switch from `throw` to `return new FatalError(...)` and
their comments about strongly typed errors become true:
`client/hello-sum-auth.routes.ts`, `client/auth-user.routes.ts`,
`client/server.routes.ts`, `client/prefill.routes.ts`. Same for
`router/full-example.routes.ts`, whose auth also needs its return type widened
from `void`. `router/extending-routes-and-middleFns.routes.ts` throws a bare
object; return a `FatalError` instead.

## Tests

**core** (`errors.spec.ts`): `FatalError` sets the brand and `isFatalError`
recognises it; a plain `RpcError` does not; the brand is non-enumerable, so
`JSON.stringify` and the binary encoder do not carry it.

**router** (new spec): pin all four rows of the measured matrix above, plus a
returned `FatalError` halting from a middleFn, a headersFn and a route; the
error landing in `body[id]` and NOT in `@thrownErrors`; a `runOnFatal` middleFn
still running after it; a plain returned `RpcError` still halting nothing. A
union return travels as its `[index, value]` envelope once serialized, so unwrap
before asserting (see `batches.spec.ts:709` for the helper).

**client** (`errorDispatch.spec.ts`): a returned `FatalError` from a middleFn
reaches its typed record slot and fires `onError`, exactly like a plain returned
error does today.

The whole router, client and core suite must stay green with no test edited.
If a test needs changing, the design is wrong somewhere; stop and say so.

## Docs

- `01.rpc/02.server/06.error-handling.md`: rebuild around the three row table.
  It currently says "always return errors instead of throwing them" with no
  caveat, which is unsafe advice for a gating middleFn today. Explain the call
  site rule: an error the caller handles at the call site is typed, everything
  else is fatal.
- `01.rpc/02.server/02.middle-fns.md:61`: it claims an error in a route or
  middleFn stops the rest of them. That becomes true for a `FatalError` and
  stays false for a plain returned error, so the sentence needs splitting. Also
  the `runOnFatal` rename.
- `01.rpc/06.devtools/01.linter.md`: only if the rule below lands.

## Validate against other chain based servers

Before building, sanity check the naming and the `runOnFatal` semantics against
how other servers solve the same three cases. For each, answer: how do you say
"stop here", how do you say "this always runs", is there a hard abort that skips
even the always run handlers, and is a declared error distinguished from an
unexpected one.

- **Koa**: the onion model, where `await next()` plus try/catch/finally gives you
  stop and always-runs with no flags at all. The strongest argument that mion's
  problem comes from the chain being flat rather than nested.
- **Express**: `next(err)` and the four argument error handler; note how awkward
  "always runs" is there.
- **Fastify**: named lifecycle hooks, with `onResponse` as the always runs slot.
- **Hapi**: `h.continue` versus returning a response or a Boom error to short
  circuit. Closest existing thing to "return an error to stop".
- **NestJS guards**: the direct analogue of the auth case.
- **tRPC**: the closest comparison, typed RPC with middleware. Check what the
  client actually receives; the impression to verify is that it gives up typed
  errors and hands back a generic client error.

Write down which ideas were rejected and why. If the survey argues for a
different name than `FatalError` or `runOnFatal`, say so before building.

## Where the behaviour lives

```
packages/router/src/dispatch.ts:79        the halt: skip non-runOnError when hasErrors
packages/router/src/dispatch.ts:86        results dropped when hasReturnData is false
packages/router/src/dispatch.ts:101       the catch around every handler
packages/router/src/lib/dispatchError.ts:51   onExecutableError, the only writer of hasErrors
packages/router/src/lib/reflection.ts:78  rawMiddleFn defaults to hasReturnData false
packages/router/src/types/publicMethods.ts:17  MayReturnError
packages/core/src/constants.ts:45         MION_ROUTES.thrownErrors, the wire field
packages/client/src/request.ts:266        the validation-error carve-out
packages/client/src/client.ts:211         thrown ids dropped from the typed record
packages/test-server/src/test-server.ts:322   throwsUnexpectedly, :327 the runOnError audit middleFn
```

A shipped spec in `docs/done/` covers the client dispatch contract and its slot
rules R1 to R6. Find it by searching that directory for those rule names.

## Out of scope

- Renaming the `@thrownErrors` wire field. See above: under this design the name
  is correct.
- Having the framework return validation errors as `FatalError` to remove the
  client carve-out. A tidy follow-on, not needed here.
- Converting the router's own request time throws into returns. They are
  undeclared and fatal, which is exactly what throwing already means.
- A lint rule enforcing "always return". Natural follow-on once the advice is
  safe to follow, but not part of this.

## Done when

- `FatalError` and `isFatal` ship, with the brand off the wire.
- A returned `FatalError` halts the chain and stays in its typed slot; a returned
  `RpcError` still halts nothing.
- `runOnError` is `runOnFatal` everywhere, including the docs.
- No example throws an error, and the auth examples' typed comments are true.
- The router, client and core suites are green with no existing test edited.
- The docs say what actually happens.
