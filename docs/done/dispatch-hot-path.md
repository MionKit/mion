---
type: chore
spec: full-plan
status: ready
created: 2026-09-08
---

# Fewer operations on the happy path of the request dispatch

## Problem

`runExecutionChain` (`packages/router/src/dispatch.ts:68`) runs for every request. The fatal-error
work added guards after each handler returns, so a plain successful result now pays three guard calls
before it can be written to the body:

```ts
if (isFatalError(result)) markResponseFailed(context, result, StatusCodes.APPLICATION_ERROR);
else if (!isRpcError(result) && isAnyError(result)) { ... }
```

`isFatalError` calls `isRpcError` inside itself, so `isRpcError` runs twice. Each run walks the
prototype chain (`error instanceof RpcError`) before it reads the brand, and `isAnyError` re-probes
`typeof Error.isError === 'function'` on every call. Every mion error carries the own property
`'mion@isΣrrθr': true` (set in the `TypedError` constructor, `packages/core/src/errors.ts:56`), so the
brand alone answers the question. The comment above `isRpcError` already says so: "The BRAND is the
whole test."

While looking at that, a read-only sweep of the rest of route dispatch and of the seven platform
adapters turned up more happy-path work that is either constant per route or a copy nothing reads.
The stages below cover all of it.

**Security is not part of this.** Body size limits, `__proto__` guards, header-safe error types,
unknown-key rejection, param validation, abort handling and the uWS detachment tripwire all stay
exactly as they are. Every item below moves a *gate* to registration time or removes a *copy*; no
check is ever skipped.

## Measured results

All numbers from `packages/router/src/routes/dispatch.bench.ts`, three alternating A/B rounds per
stage with the order reversed halfway. `control` is a case dispatch does not touch, so subtract its
drift before reading any row: this is a shared cloud container and it moved between 2% and 8% run to
run. **Anything under about 5% here is not distinguishable from noise.**

| stage | what it did | measured (control drift subtracted) |
| --- | --- | --- |
| 1, error guards | three guard calls collapsed to one brand read | +0 to +6% on small routes, nothing on payload-heavy ones |
| 2a, inner await | step callers return instead of awaiting | **+26 to +36% on every dispatch case** |
| 2c, isAsync | correct for a promise-returning arrow | correctness, not speed. Enables 2b |
| 2b, alwaysAwait off | skip the await for proven-sync steps | +2 to +21%, biggest on chains of short sync steps |
| 4, registration constants | methodCaller and alwaysRun flattened | +1 to +6%, partly under the noise floor |
| 5+6, quoted id and allocations | one fewer stringify and two fewer allocations per request | 0 to +3%, inside the noise floor |
| 7, adapters | copies and allocations removed | not visible in this bench, it does not go through an adapter |

**2a is the whole story.** Everything else is single digits, and several stages are below what this
machine can measure. Stages 5 and 6 were kept anyway (agreed with the author): they cut real
garbage, which shows up as GC pressure under sustained load rather than in a micro bench.

### End to end, over real HTTP

`pnpm miondevx bench servers repeat mion <suite> --runs 3`, mion on platform-node in the mion-bench
container, everything shipped, `alwaysAwait` at its default (so this is the free part only, not 2b).

| suite | before | after | latency | delta |
| --- | --- | --- | --- | --- |
| hello-world | 26004 to 27424 req/s | 28142 to 30238 req/s | 3.86ms to 3.34ms | **+14%** |
| heavy-validation | 16414 to 17153 req/s | 17510 to 17910 req/s | 6.06ms to 5.72ms | **+5.5%** |

The ranges do not overlap on either suite, so both are real rather than drift. The gap between them
is what you would expect: hello-world is nearly all chain overhead, and in heavy-validation the
validator does most of the work, so the same saving is a smaller share of the whole.

A three-run repeat of the same tree spread 6.9% on hello-world (tolerance 10%), so this box cannot
resolve anything smaller than about 7% end to end. That is the reason several stages above show no
end-to-end number of their own.

## Two premises in this spec were wrong

Recorded because they cost time and would cost it again:

1. **"The resolver awaits the return type, so the promise bit is already computed and discarded."**
   It is not. `Awaited<>` is applied by TypeScript, in the marker's own type argument
   (`HandlerReturn<H> = Awaited<ReturnType<H>>`, `packages/router/src/types/handlers.ts:58`), so
   nothing on the Go side ever sees a promise. Proven at runtime: a sync route, an async route and a
   promise-returning arrow all resolve to the SAME return type id. Getting the bit needed a new
   injected slot, which is what 2c became.
2. **"skipClientRoutes skips only the metadata route, and that looks unintended."** It is
   intentional, or at least load-bearing. `skipClientRoutes` defaults to true under test, and the
   metadata middleFn answers a metadata request piggybacked on any call, with no dependence on the
   metadata route being registered. Removing it broke six tests that exercise exactly that. **Stage 3
   was reverted**, see below.

## How this gets measured

**One number per stage, measured alone.** Each stage is its own commit, and its before/after is
recorded for that commit only. A single total at the end is recorded too, but it never replaces the
per-stage numbers: without them there is no way to tell which change earned its keep. A stage with no
measurable win is reverted, and the numbers that killed it stay in this doc.

The starting evidence is thin on purpose. A standalone toy loop put the guard collapse at 24.4 ns vs
16.1 ns per returned value on Node 26.8.1, which says only that it is worth trying. Nothing in this
doc should be treated as a measured result until it is measured in the real chain.

## Plan

### Stage 1 - collapse the error guards

`packages/core/src/errors.ts:207` - the brand is the whole test, drop the prototype walk:

```ts
export function isRpcError(error: any): error is RpcError<string> {
  if (!error) return false;
  return error['mion@isΣrrθr'] === true; // was: instanceof RpcError first, then this
}
```

Safe because the brand is an own property on every instance, every subclass and every copy that came
off the wire. Already pinned by `packages/core/src/errors.spec.ts:88-92`.

`packages/core/src/errors.ts:225` - hoist the capability probe out of the call body:

```ts
const isNativeError: (v: unknown) => boolean =
  typeof (Error as any).isError === 'function' ? (Error as any).isError : (v) => v instanceof Error;
```

`packages/router/src/dispatch.ts:87-103` - one classification instead of three calls, common case
first:

```ts
const brand = result['mion@isΣrrθr'] === true;
if (!executable.hasReturnData) {
  if (brand || isNativeError(result)) onExecutableError(context, executable, result);
  continue;
}
if (brand) {
  if (result.isFatal === true) markResponseFailed(context, result, StatusCodes.APPLICATION_ERROR);
} else if (isNativeError(result)) {
  onExecutableError(context, executable, result);
  continue;
}
```

Keep `Error.isError` rather than `instanceof Error`. It measured about 7 ns dearer, but it is the only
one that catches an error made in another realm, and letting one through means serializing an error
into the body as a successful answer.

### Stage 2a - drop the inner await in the step callers

The three step callers are `async` and each awaits the handler only to return the value
(`dispatch.ts:132-135`, `:153-154`, `:164-165`). Returning the handler's result directly hands back
the same value, or the same promise, and removes one frame per step:

```ts
return executable.handler(context, rawRequest, rawResponse, opts);
```

The loop at `dispatch.ts:84` still awaits, so nothing about yielding changes, and a synchronous throw
still lands in the loop's own `try`.

Also delete the `catch { return Promise.reject(err) }` at `dispatch.ts:54-56`. Its own comment says it
never happens, and it forces the whole function body into a try/catch.

### Stage 2b - EXPERIMENT: skip the await when a step returned a plain value

This is not a decision. It has been looked at before and it is not assumed to be a win. Measure it
alone, then decide.

Why it is doubtful:

- **The await is doing a job.** It yields, so a long chain never holds the event loop. Removing it can
  raise single-request throughput and still make tail latency worse under load. The measurement is
  therefore not throughput alone: it must include p99 latency under concurrency, which the container
  lane already reports.
- **A per-request `typeof value.then === 'function'` is duck typing, not a promise test**, and it is
  paid on every request by exactly the sync steps the change is meant to speed up. It is the wrong
  shape for this. Stage 2c replaces it with a decision made once, at registration.
- **A synthetic 3-step loop showed 254 ns vs 113 ns.** That loop had no payload, no validation and no
  serialization, so it measured only the thing being removed and none of the work that dilutes it.
  It is not evidence for the real chain.

**If it ships, it ships behind a router option** so the current behaviour stays the default:

```ts
// packages/router/src/types/general.ts, next to maxContextPoolSize (:65)
/** Await every chain step, even one that returned a plain value. Keeps the event loop yielding
 *  between steps. Turn off only for a chain of short sync steps, under measured load. */
alwaysAwait: boolean;

// packages/router/src/constants.ts:27
alwaysAwait: true,
```

Measured on its own commit, with both option values, across several payload sizes (the
`payload-sizes` sweep exists for this), reading the p99 column and not just requests per second. It
ships only if the gain is real at realistic payloads AND tail latency does not get worse with the
option on. Otherwise it is dropped, option included, and the numbers stay in this doc.

**Stage 2c below is a hard prerequisite.** Without it, 2b cannot be correct.

### Stage 2c - make `isAsync` right, and decide the caller once

`isAsyncHandler` is `handler.constructor?.name === 'AsyncFunction'`
(`packages/core/src/runtypes/mionAdapter.ts:338`). That misses a very common shape:

```ts
const getUser = (ctx: CallContext, id: string) => db.findUser(id); // returns a promise, not an AsyncFunction
```

Today that is harmless, because dispatch awaits everything and nothing reads `isAsync` (it only rides
the client metadata, `packages/router/src/lib/remoteMethods.ts:84`). Under stage 2b it becomes
load-bearing, so it has to be right first. It is worth fixing on its own merits either way: the
metadata currently tells clients "sync" for handlers that are not.

**The signal is already computed at build time.** The resolver awaits the handler's return type before
it derives the return runtype, which is why `RunTypeKind.promise` never reaches the router. Carry the
"this was a promise" bit through instead of discarding it:

1. Where the resolver resolves a handler's return type for the marker, record whether it unwrapped a
   promise, and emit it as a new slot on the injected payload:

   ```ts
   // packages/core/src/runtypes/mionAdapter.ts:65
   export interface RtMarkerPayload {
     // ...
     /** build time: the handler's declared return type was a promise */
     isAsync?: boolean;
   }
   ```

   `checker.Checker_getAwaitedType` is already used in the repo
   (`ts-go-runtypes/internal/compiler/routerrules/rules.go:136`), so the API is available.
   **Careful:** that call returns non-nil for a non-promise type too (awaiting a number gives a
   number), so `awaited != nil` is NOT the test. The test is that the awaited type differs from the
   declared one, or that the type resolves to `Promise`.

2. Combine both signals at registration, keeping the runtime one as a cheap second opinion:

   ```ts
   // packages/core/src/runtypes/mionAdapter.ts:372
   isAsync: rtFns.isAsync === true || isAsyncHandler(handler),
   ```

3. **Attach the decision to the executable, not to the request.** Stage 4 already moves
   `methodCaller` to registration; this extends it to two variants per kind, an awaiting one and a
   plain one, chosen from `isAsync` once. The loop then makes one monomorphic call and never
   duck-types a returned value:

   ```ts
   // dispatch.ts:84, with alwaysAwait off
   const result = executable.isAsync
     ? await executable.methodCaller(context, executable, request, response, opts, rawRequest, rawResponse)
     : executable.methodCaller(context, executable, request, response, opts, rawRequest, rawResponse);
   ```

**The hole that stays**, and why the option exists: a handler that lies about its return type
(declared `T`, returns a promise through a cast or `any`) is still flagged sync, and with the await
skipped its promise would be written into the body. `alwaysAwait: true` is the default precisely so
nothing can hit this unless a deployment opts out. A build-time lint rule flagging a handler whose
body returns a promise under a non-promise declared type would close it properly, and is a follow-up,
not part of this change.

### Stage 3 - REVERTED, the escape hatch was not unintended

**Not shipped.** The change (make `skipClientRoutes` drop the metadata middleFn as well as the
metadata route) was built, broke six tests, and was reverted. The reason it broke them is the reason
not to do it: the metadata middleFn answers a metadata request piggybacked on ANY call and does not
need the metadata route registered, so `skipClientRoutes` removing it takes away a working
capability rather than dead weight. It also defaults to true under test, so the change altered the
chain for every test in the repo.

A separate option that turns the metadata lane off entirely would be a real feature with a real
decision behind it. That is filed on its own.

The original reasoning is kept below for whoever picks that up.

### Stage 3 (not shipped) - the metadata middleFn is in every chain, even when it can never answer

The minimum chain has four members (`packages/router/src/router.ts:87-93`, `:403-404`):

| # | member | per-request work on the happy path |
| --- | --- | --- |
| 1 | `mionDeserializeRequest` (raw) | limit resolve, `JSON.parse`, array-body reshape |
| 2 | the route | decode, sanitize, validate, handler |
| 3 | **`mion@methodsMetadata`** (middleFn) | `[]` alloc, decode check, a compiled validator run, spread call, returns `undefined` |
| 4 | `mionSerializeResponse` (raw) | full-chain serialize walk |

Member 3 goes through `runRouteOrMiddleFn` (`dispatch.ts:157`) and `validateParams` defaults to `true`
for a middleFn (`router.ts:483`), so it runs the whole params pipeline on every request for a tuple
that is empty unless a client is asking for metadata. Its own guard (`client.routes.ts:79`) is only
reached afterwards.

**Do NOT try to skip validation for empty params.** Two ideas were considered and both are rejected:

- A plain "the slot is absent, skip it" gate is a correctness hole. Absent params are exactly how a
  caller omits a required argument, and today the slot resolves to `[]`, the validator rejects it and
  the request is refused. Skipping would hand `undefined` to a required parameter.
- A static `canSkipEmptyParams` flag (all declared params optional, computed from reflection at
  startup) would be correct, but it is not worth building: the compiled validator checks optionality
  as its first operation and is already optimised for it. A hand-rolled duplicate of a check the
  generated code does better is a second thing to keep right, for no gain.

`isNoop` stays exactly as it is (`getNoopJitFns` / `fakeJitFn`,
`packages/core/src/routerUtils.ts:293-310`, read at `dispatch.ts:244`). It is decided at startup and
it means validation is not needed at all, which is a different statement from "these params happen to
be empty". Keep it, do not extend it.

**What Stage 3 actually is, then:** stop paying for the metadata middleFn when it cannot answer.
`skipClientRoutes` (`router.ts:194`) skips only the metadata **route**; the metadata **middleFn** sits
unconditionally in `defaultEndMiddleFns`, so the escape hatch does not remove its per-request cost.
That looks unintended. Make the option remove both, so a deployment that does not serve client
metadata drops a whole chain member instead of validating an empty tuple forever.

The cheap allocation part of this member is covered by Stage 6 (the shared empty params array) and
does not touch validation.

### Stage 4 - resolve per-route constants at registration, not per request

Each of these is re-derived for every chain member on every request and is fixed when the route is
registered. Collapse each into one flat, always-present field on the executable. The gate moves to
registration, the check itself still runs:

| site | read today | becomes |
| --- | --- | --- |
| `dispatch.ts:82` | `executable.methodCaller \|\| getMethodCaller(executable)` | assigned at registration (stage 2c makes it two variants) |
| `dispatch.ts:176-178` | `options.sanitizeParams`, `paramsJitFns.formatTransform`, `.isNoop` | `executable.sanitizeFn?` |
| `dispatch.ts:205-206` | `paramsJitFns.json.decode`, `decode.isNoop` | `executable.decodeFn?` |
| `dispatch.ts:163,244` | `options.validateParams`, `paramsJitFns.isType.isNoop` | `executable.validateFn?` |
| `dispatch.ts:268-270` | `options.strictTypes`, `hasUnknownKeys`, `.isNoop` | `executable.unknownKeysFn?` |

In the loop preamble as well: `context.executionChain` is read twice (`dispatch.ts:75-76`); the
`response.serializer` write at `:76` overwrites what `acquireCallContext` just wrote
(`callContext.ts:70,117`) and can move there; `executionList.length` can be hoisted out of the loop
condition; and `request.bodyType === SerializerModes.binary` (`dispatch.ts:204`) is constant per
request but re-read per step. The `hasErrors` and `alwaysRun` ordering at `:79` already short-circuits
correctly, leave it alone.

### Stage 5 - the two serializer raw middleFns

In `packages/router/src/routes/serializer.routes.ts`:

- `:201-204`, `:260-263` - both `stringifyBody` and `prepareBodyForJson` walk the whole chain testing
  `hasReturnData` per member. That subset is fixed when the chain is built. Store it on
  `MethodsExecutionChain` next to the already-precomputed `serializer` field
  (`packages/router/src/types/remoteMethods.ts:94-99`).
- `:208`, `:220` - `JSON.stringify(method.id)` is constant per method and recomputed per request.
  Precompute a `quotedId`.
- `:255`, `:302` - `json.strategy === 'direct'` is a string compare against a constant. Precompute a
  boolean.
- `:93-102` - `effectiveMaxBodySize` calls `getPlatformConfig()` and `getRouterOptions()` per request
  for a number that is fixed after boot (adapters call `setPlatformConfig` at startup). Resolve once
  and invalidate in `setPlatformConfig` and `resetRouter`. `rejectOversizedBody` itself stays exactly
  as it is.
- `:77` - the array-body reshape calls `getRouteExecutableFromPath(context.path)`, a second
  `flatRouter.get` after the one already done in `getExecutionChain` (`callContext.ts:190`). The id is
  reachable at `executionChain.methods[executionChain.routeIndex].id`. Note the scope: this branch is
  for plain HTTP clients sending a bare array. The mion client sends the keyed object shape
  (`packages/client/src/lib/serializer.ts:80`), so this is a narrower win than it first looks.
- `:134,143,149` - `response.headers.set('content-type', ...)` goes through `MionHeadersImpl.set`,
  which lowercases and `__proto__`-checks a literal that is already lowercase and known safe. Add an
  internal `setKnownLower` fast path and leave the public `set` guarded.

### Stage 6 - per-request allocations

- `callContext.ts:202` - a fresh `BatchExecutionResult` wrapper on every non-batch request, then
  immediately destructured. Return the chain directly on the non-batch path.
- `callContext.ts:147-157` - `release` builds a fresh 9-field response object and `acquire`
  (`:110-119`) then overwrites all nine. Build it once, in acquire.
- `callContext.ts:126` - `ctx.shared = {}` allocated per request even with no `contextDataFactory`.
- `dispatch.ts:201` - `(request.body[executable.id] as any[]) || []` allocates a fresh empty array for
  every step whose id is absent from the body, which is always the case for the metadata middleFn. A
  shared frozen `EMPTY_PARAMS` is safe for the zero-param case; confirm no handler mutates its params
  array first.
- `dispatch.ts:144-148` - headers middleFns allocate a `{}` plus a `forEach` closure per request. An
  indexed loop over `headerNames` removes the closure.
- `packages/router/src/lib/headers.ts:59-69` - `entries()`, `keys()` and `values()` each build
  `Object.entries(...)` AND a whole `new Map`. Return a generator over the record instead.

Deliberately left out, because it needs its own bench and it changes `JSON.stringify` key order:
pre-shaping the response body object per chain so the property stores stay monomorphic.

### Stage 7 - platform adapters

Ranked. None of these touch a limit, a guard or an abort path.

1. **uWS copies the whole request body, then throws the copy away.**
   `packages/platform-uws/src/uwsHttp.ts:206` does `Buffer.from(Buffer.from(fullBody))`, a full
   memcpy, but the JSON path immediately does `buffer.toString()` (`:152`) inside the same native
   callback, copying again. Take the retaining copy only when the content type is
   `application/octet-stream`. `collectBody`'s limit contract and the multi-read tripwire stay as is.
2. **Node concatenates a body that is one chunk, or none.** `packages/platform-node/src/mionHttp.ts:158`
   always allocates and copies. Use the single chunk directly, and a shared empty value for a
   body-less request.
3. **Node and gcloud build a Buffer just to get a content-length.** `mionHttp.ts:241-244`, `:250-252`
   and `packages/platform-gcloud/src/googleCF.ts:101-112`. `Buffer.byteLength(str)` for the header
   plus `end(str)` for the body is the same bytes with one copy fewer.
4. **gcloud re-lowercases every request header.** `packages/platform-gcloud/src/headers.ts:12` omits
   the skip flag that `packages/platform-node/src/headers.ts:12` passes, and Express headers are
   node's headers, already lowercased. Do NOT do the same on AWS: API Gateway v1 preserves header
   case, so the lowering there is load-bearing.
5. **Default response headers rebuilt with `Object.entries().forEach` per request** on node, uws and
   gcloud, when the default is `{}`. Bun, Cloudflare and Vercel already prebuild the pairs. On uws,
   keep the order: `server` is set after the defaults there, so a user default cannot override it.
6. **uws materializes a pair array per response header inside the cork** (`uwsHttp.ts:280`); **AWS
   iterates the response headers through four layers** (`packages/platform-aws/src/awsLambda.ts:103`)
   and **rebuilds the query string with a filter, map and join chain** (`awsLambda.ts:60-65`).
7. Smaller ones: uws reads `content-type` twice across the native boundary (`uwsHttp.ts:138-139`),
   builds a status-line string per response (`:246-249`), and uses `.then().catch()` where one async
   block would do (`:167-182`); node re-reads `httpOptions.maxBodySize` once per chunk rather than
   once per request (`mionHttp.ts:135`).

Flagged and NOT included, because each is a behaviour change needing its own decision and test:
Cloudflare and Vercel pay a full `new URL()` per request (`cloudflareHandler.ts:45`,
`vercelHandler.ts:46`) where bun uses index arithmetic, but `URL.pathname` normalizes dot-segments and
duplicate slashes and raw slicing does not, which is a routing change. And gcloud's
`originalUrl.split('?')[1]` (`googleCF.ts:61`) truncates at a second `?`, which is legal inside a
query string.

## Benchmarks

Before anything, prove the machine can measure a win of the size being claimed:

```bash
pnpm miondevx bench servers repeat mion hello-world --runs 5
```

If the spread approaches the 10% tolerance, a smaller win is unmeasurable there and needs a quieter
machine.

**Micro: new `packages/router/src/routes/dispatch.bench.ts`**, the same shape as the two existing
bench files in that directory. No config registration is needed, and it stays out of `pnpm test`
because the router project only includes `*.spec.ts`.

```bash
pnpm run check:builds                                # mion-bin/mion must exist before vitest boots
pnpm exec vitest bench --project router dispatch
```

Cases: a sync route with no params, a sync route with a validated object param, an async route, a
route behind three middleFns, a route with a large payload so a win is not measured only on an empty
body, and a route returning a `FatalError` so the error path is shown not to regress. Keep one
unchanged case as a drift control.

**End to end: the existing container HTTP benchmarks**, no new lane needed. Read the p99 latency
column, not just requests per second, so a change that trades tail latency for throughput shows up as
such.

```bash
pnpm miondevx container login
pnpm miondevx bench servers prep
pnpm miondevx bench servers suite hello-world      # before, then copy results/ aside
pnpm miondevx bench servers suite heavy-validation # a realistic payload, same treatment
pnpm miondevx bench servers sweep                  # payload sizes, for stage 2b
# ...apply ONE stage...
pnpm miondevx bench servers suite hello-world      # after
MION_BENCH_RESULTS_DIR=<saved> node container/mion-bench/aggregate.mjs
```

Results land in `container/mion-bench/results/<suite>/<app>.json` and are git-ignored, and there is no
compare flag, so the before run must be copied aside. Never publish `--quick` numbers. Alternate
before and after several times, reversing the order halfway to cancel slot bias.

## Tests

- `packages/core/src/errors.spec.ts` - brand-only `isRpcError` still answers true for a subclass, a
  `FatalError` and a plain object off the wire, and false for a plain `Error` and for a look-alike
  without the brand. Add an error made in another realm (`vm.runInNewContext('new Error("x")')`) so
  the `Error.isError` choice is pinned.
- `packages/router/src/dispatch.spec.ts` and `packages/router/src/fatalDispatch.spec.ts` already cover
  a returned `FatalError`, a returned plain `Error`, a returned `RpcError` and thrown errors. They
  must pass unchanged. Add for stage 2a: a sync handler returning a promise still resolves.
- Stage 2c, on the Go side and the JS side: an arrow handler returning a promise
  (`(ctx, id) => db.find(id)`) is flagged `isAsync: true`, an `async function` still is, and a plain
  sync handler still is not. Include a handler whose return type is a union with a promise arm, and
  one returning a non-promise thenable-shaped object, which must NOT be flagged async. These touch the
  marker API, so they follow the **Marker test coverage rule** in `ts-go-runtypes/CLAUDE.md`: both
  `getRunTypeId` call shapes, as paired tests.
- Only if stage 2b survives its measurement: with `alwaysAwait` off, a promise-returning arrow handler
  still resolves (this is what 2c buys), a handler returning an object that merely has a `then` method
  is written to the body untouched, and a long sync chain does not starve a concurrent request. Both
  option values covered.
- Params validation now has its guard test on this branch: `dispatch.spec.ts`, "omitting the params of
  an all-optional handler is valid, a required one is not". It pins today's outcome for both shapes
  (empty body accepted when every param is optional, rejected with the same validation error when one
  is required), so no stage can quietly weaken it. It stays whether or not Stage 3 ships.
- Stage 3: with `skipClientRoutes` on, the metadata middleFn is gone from the chain and a metadata
  request gets the same answer it gets today when the route is skipped. With the option off, the
  middleFn still validates its params and still rejects bad ones.
- Adapter suites exist for node, uws and bun, security suites included. Run the whole JS suite
  (`pnpm test`, or `pnpm run test:ci` in batches) and `go -C ts-go-runtypes test ./internal/...`.

## Docs

Nothing user-facing changes, except the `alwaysAwait` option if stage 2b ships. That needs a row in
the router options page under `container/website/content/01.rpc/`, with the tail-latency trade-off
stated plainly. If an adapter change alters an option's behaviour, which it should not, that page gets
updated too.

## Out of scope

The two flagged URL-parsing behaviour changes (Cloudflare/Vercel `new URL`, gcloud `split('?')`),
unifying the header implementations across adapters, batch dispatch, the binary buffer strategy, and
any change to a limit, guard or abort path.

## Done when

All of the below is done.

- Every stage applied or explicitly dropped, each with its own before/after numbers in this doc.
  Stage 3 was reverted and its numbers are the six tests it broke; everything else shipped.
- `packages/router/src/routes/dispatch.bench.ts` exists and runs
  (`pnpm exec vitest bench --project router dispatch`).
- End-to-end requests per second and latency measured over real HTTP, before and after, with
  non-overlapping ranges: +14% on hello-world, +5.5% on heavy-validation.
- Full JS suite green (9522 + 1093 + 81 + 501 + 363 + 93 + 291 across the seven batches), Go tests
  green, `pnpm run lint` and `pnpm run format` clean.
- The `alwaysAwait` option is documented on the website under the routes page, with the tail-latency
  trade-off stated.

## What shipped

| commit | stage |
| --- | --- |
| `test(router): throughput harness for the request dispatch chain` | the bench, commit 0 |
| `perf(core,router): one brand read classifies a handler result...` | 1 |
| `perf(router): the chain step callers return the handler result...` | 2a |
| `fix(router): isAsync sees a plain function that returns a promise` | 2c |
| `feat(router): alwaysAwait option, on by default` | 2b |
| `perf(router): the dispatch loop reads its per-method fields...` | 4 |
| `perf(router): the JSON body writer reuses each method's quoted id` | 5 |
| `perf(router): stop allocating an empty params array...` | 6 |
| `perf(platform-*): remove per-request copies and allocations...` | 7 |

Not shipped: stage 3 (reverted, see above), and within the other stages a handful of items judged not
worth their churn and recorded where they appear: caching `effectiveMaxBodySize` (two module reads,
not a cost), precomputing the `json.strategy === 'direct'` boolean (an interned-string compare), the
`setKnownLower` header fast path, and the precomputed serializable-methods subset (the per-request
`typeof returnValue === 'undefined'` test has to stay either way, so only half the walk goes).
