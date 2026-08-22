# Client error dispatch: define the contract, then make the runtime obey it

**Status:** done — implemented 2026-08-21 on `claude/client-transport-error-types-u2hd0j`
(**revised 2026-08-22**: middleFn errors were separated back OUT of the single unexpected slot into
their own typed `middleFnErrors` record — the tuple is `[result, error, fatal, middleFnResults,
middleFnErrors]`. The single-slot fold silently dropped information: several middleFns can fail at
once, and a middleFn failure can coexist with a fatal error, but one slot can hold only one error.
The contract below is updated to the 5-tuple; the fatal slot keeps only what NOBODY declared.)
(runtime + tests: `feat(client)!: dispatch errors per the contract`; examples and website docs in
the two follow-up commits on the same branch).
**Type:** bug (several) + public API change
**Created:** 2026-08-21

Implementation notes vs the plan: all of R1–R7, D1–D8 and the tests landed as specified. The
contract tests live in `packages/client/src/errorDispatch.spec.ts` (T1–T18, with T2b covering the
server-side validation carve-out) and the type-level assertions in
`packages/examples/src/client/client-error-slots.ts` (T19–T23). Step 6b landed as
`events()`/`onError`/`offError`/`onSuccess`/`offSuccess` on `MiddlewareSubRequest`. The test
server gained `throwsUnexpectedly` (T9) and the `runOnError` `audit` middleFn (T17).

## Summary

The client has no written contract for **which error goes into which slot** of the result tuple.
Each slot's _type_ implies one, the runtime implements another, and single-route calls and
`routesFlow` disagree with each other. The result: a route's error slot is statically typed as the
route's own declared errors but at runtime receives timeouts, platform failures and _other
subrequests'_ errors; a successful route result is silently discarded; and a `routesFlow` transport
failure is reachable at runtime but unreachable through the public types.

This spec (a) states the intended contract, (b) lists the defects that violate it, (c) plans the
fix, and (d) specifies the tests that pin each rule.

The headline API change: **the tuple gains a `fatal` slot at index 2.** Declared responses stay
strongly typed in their own slots — the route's errors in slot 1, each middleFn's errors by name in
slot 4 — and everything _nobody_ declared (transport, platform, framework, undeclared throws, and
errors for middleFns that were not part of the request) lands untyped in `fatal`. MiddleFn errors
additionally keep their strongly typed listener channel (`onError`, now registrable without
prefill).

```ts
// before
const [result, error, middleFnResults, middleFnErrors] = await routes.users.getById(id).call();
// after
const [result, error, fatal, middleFnResults, middleFnErrors] = await routes.users.getById(id).call();
```

`routesFlow` gets the same slot, request-scoped:

```ts
// before
const [[user, order], [userErr, orderErr], middleFnResults, middleFnErrors] = await routesFlow([
  routes.users.getById('1'),
  routes.orders.getById('9'),
]).call();
// after
const [[user, order], [userErr, orderErr], fatal, middleFnResults, middleFnErrors] = await routesFlow([
  routes.users.getById('1'),
  routes.orders.getById('9'),
]).call();
```

Arity 4 → 5, `fatal` inserted at index 2 — see Breaking changes.

## How errors flow today (measured, not inferred)

All measurements below come from probes run against the managed test server on 2026-08-21.

There is exactly one channel: `RequestErrors = Map<subRequestId, RpcError>`. Producers key into it,
`MionClient.buildResult` distributes out of it.

| producer                                                                                         | key used                              |
| ------------------------------------------------------------------------------------------------ | ------------------------------------- |
| errors in the server response body (`resolveSubRequests`)                                        | the subrequest id that produced it    |
| client-side param validation (`lib/validation.ts`)                                               | the subrequest id being validated     |
| client transport/global errors — timeout, abort, fetch failure, serialization, header extraction | `this.requestId`                      |
| platform errors (`handlePlatformError`)                                                          | fanned out to **every** subrequest id |

`request.ts:47` sets `this.requestId = route ? route.id : 'no-route'`, and the `routesFlow` branch
sets it to the literal `'mion-routes-flow'`. **So for a single-route call the request-level key IS
the route's key** — transport errors are indistinguishable from the route's own errors by
construction.

Distribution (`client.ts`, `buildResult`):

- route slot ← `errors.get(routeId)` **else the first error in the map** (`findSubRequestError`)
- each named middleFn slot ← `errors.get(middleFnId)`
- ids matching neither → dumped into the middleFn errors record under their **raw id**
- prefill listeners (`processMiddleFnsResponses`) ← strictly `errors.get(middleFn.id)`

Measured outcomes:

| scenario                                        | route slot                  | middleFn slot                         | listener          |
| ----------------------------------------------- | --------------------------- | ------------------------------------- | ----------------- |
| middleFn returns its declared `session-expired` | `session-expired` ⚠️        | `session-expired`                     | fires             |
| route returns its declared error                | declared error ✅           | —                                     | —                 |
| route param validation fails (client-side)      | `validation-error` ✅       | —                                     | —                 |
| single-route timeout                            | `request-timeout`           | —                                     | does **not** fire |
| network failure                                 | `TypeError` ⚠️              | —                                     | —                 |
| platform error (payload too large)              | `request-payload-too-large` | `mion@methodsMetadata=…` ⚠️           | —                 |
| **routesFlow** timeout                          | all `undefined` ⚠️          | `mion-routes-flow=request-timeout` ⚠️ | —                 |
| **routesFlow** + failing middleFn               | all `undefined`             | `session=session-expired`             | fires             |

Two further measurements worth recording:

- **A successful route result is discarded when any foreign error exists.** With a failing `session`
  middleFn, `subRequest.resolvedValue` was `"Hello John Doe"` — the server ran the route and
  returned it — yet the tuple's result slot was `undefined`, because
  `routeResultPart = routeError ? undefined : routeSubRequest.resolvedValue`.
- **Prefill listeners never see transport errors.** A `prefill().onError('request-timeout', …)` on a
  middleFn never fires: the timeout is keyed to the route, not the middleFn.

## The protocol already carries the distinction the client needs

This is the key finding, and it means no new enumeration or heuristic is required.

The server already separates **returned** errors from **thrown** errors, and ships them in different
places on the wire:

- **Returned** `RpcError` (the handler declared it in its return type) → `response.body[executableId]`
- **Thrown** `RpcError` or any other exception → `response.body['@thrownErrors'][executableId]`
  (`lib/dispatchError.ts:57`, `routes/serializer.routes.ts:89`)
- Platform failures, which happen before the router runs → `@thrownErrors[@platformError]`

`routes/errors.routes.ts:17` states the intent in prose:

> `"@thrownErrors"` is expected to be a field in response body that contain all thrown errors from
> other executables. thrown Errors are **not strongly typed** and are all serialized/deserialized as
> `RpcError<string>`.

That is precisely the `fatal` slot's type: _not strongly typed_, `RpcError<string>`. (The
client even names the concept already: the function that receives the split is called
`unwrapUnexpectedErrors`.)

**The client receives this split and immediately destroys it.** `lib/serializer.ts:194`:

```ts
function unwrapUnexpectedErrors(parsedBody: any): RpcError<string> | undefined {
  if (!(MION_ROUTES.thrownErrors in parsedBody)) return;
  const unexpectedErrors = parsedBody[MION_ROUTES.thrownErrors];
  if (MION_ROUTES.platformError in unexpectedErrors) {
    /* ...returns platform error... */
  }
  Object.assign(parsedBody, unexpectedErrors); // <-- flattened into the root
  delete parsedBody[MION_ROUTES.thrownErrors]; // <-- distinction gone
}
```

After this, `resolveSubRequests` cannot tell a declared error from a thrown one, so everything is
keyed the same way and the route slot becomes a catch-all.

The split matters in two places under the new contract:

- an error keyed to the **route's own id** goes to slot 1 if returned, slot 2 if thrown — without
  the split a route's undeclared throw would land in the closed slot 1;
- a middleFn's `onError` listener fires only for its **returned** (declared) errors — a middleFn's
  undeclared throw reaches slot 2 only.

**One carve-out.** Server-side `validation-error` is _thrown_
(`dispatch.ts:187`, `:207`, `:220`) but is by design part of the expected union — `ValidationError`
is an explicit member of `HandlerErrors`. So the classification rule is "thrown ⇒ fatal,
**except** `validation-error`". The cleaner alternative — making the server _return_ validation
errors instead of throwing — is a larger change to how the execution chain short-circuits and is
deliberately out of scope here; the carve-out is one condition in one function.

## The contract

### Slots

Only declared responses are strongly typed: the route's in slots 0–1, each middleFn's in slots
3–4. Everything **nobody** declared is `fatal`.

```ts
type Result<RouteSuccess, RouteError, MiddleFnsResults, MiddleFnsErrors> = [
  RouteSuccess | undefined, // 0 result — what the route returned
  RouteError | undefined, // 1 error — the route's DECLARED errors | ValidationError (CLOSED)
  FatalError | undefined, // 2 fatal — anything NOBODY declared (OPEN)
  MiddleFnsResults | undefined, // 3 middleFn results, by name
  MiddleFnsErrors | undefined, // 4 middleFn DECLARED errors | ValidationError, by name (typed)
];

/** any error that is not part of a declared response: transport, platform, framework, an
 *  undeclared throw (route or middleFn), or an error for a middleFn that was not part of the
 *  request. Open by nature — the code can be anything. */
type FatalError = RpcError<string>;
```

The `middleFnErrors` record is **typed per middleFn** (`{[K in keyof H]?: MiddleFnError<H[K]>}`)
and holds one slot per middleFn — several middleFns failing, or a middleFn failing while the route
throws, loses **no information** (this is why the earlier revision's single shared slot was
reverted). A middleFn's declared errors therefore have two outlets: its slot in the record and its
`onError` listener (registrable without prefill — `events()`/`onError` on the subrequest). A
middleFn's **thrown/undeclared** error cannot appear in its typed record slot: it is fatal.

`routesFlow` mirrors it, with **one** fatal slot — the flow shares one transport, one platform,
one middleFn chain:

```ts
type WorkflowResult<Routes, MiddleFns> = [
  WorkflowRouteResults<Routes>, // 0 per-route results
  WorkflowRouteErrors<Routes>, // 1 per-route DECLARED errors (each index closed)
  FatalError | undefined, // 2 fatal — request-scoped, ONE slot
  MiddleFnsResults | undefined, // 3 middleFn results, by name
  MiddleFnsErrors | undefined, // 4 middleFn DECLARED errors, by name
];
```

From the caller's side:

```ts
const [[user, order], [userErr, orderErr], fatal] = await routesFlow([
  routes.users.getById('1'),
  routes.orders.getById('9'),
]).call();
if (fatal) retryLater(); // one check covers transport, platform, framework, undeclared throws
```

### Dispatch rules

| #   | error                                                                                                                                  | goes to                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| R1  | route returned its own declared error                                                                                                  | slot 1 (that route's index in a flow)                                                               |
| R2  | param validation failed for a route (client- or server-side)                                                                           | slot 1 (that route's index)                                                                         |
| R3  | middleFn returned its own declared error, or its params failed validation                                                              | slot 4 under its name (typed) **and** its `onError` listener (typed)                                |
| R4  | anything thrown / undeclared — transport, platform, framework, an undeclared throw, or an error for a middleFn not part of the request | slot 2 (`fatal`) only; **no** listener fires. Several fatals: the **first in execution order** wins |
| R5  | route produced a result                                                                                                                | slot 0 keeps it, whatever else failed                                                               |
| R6  | an error the route did not declare                                                                                                     | **never** appears in slot 1                                                                         |

The first-in-execution-order rule inside R4 exists because slot 2 is a single value, and applies
only among genuinely fatal errors. In practice multiple candidates are rare: the server
short-circuits the chain at the first thrown error (`dispatch.ts:79`), a transport failure means no
server errors at all, and a platform error precludes body errors.

R4 covers what previously scattered across three places: the route slot (single call),
`middleFnsErrors['mion-routes-flow']` (flow), and `middleFnsErrors['mion@methodsMetadata']`
(internal route ids leaking into a user-facing record). Internal ids can no longer leak: an error
keyed to an id that is not a middleFn of the request is fatal, never a record entry.

Note R3/R5 mean **several slots can be populated at once** — a flow where one route succeeds and
another fails, a route succeeding while a middleFn fails, or a middleFn failing while the route
throws (each error keeps its own slot). The client's job is correct per-slot assignment. Callers
may use the shorthand

```ts
if (result) …
else if (error) …
else 'fatal error, try again later'
```

but that is a caller's choice, **not an invariant the client guarantees**, and no test should
assert it as one.

## Defects

Each is a violation of a rule above; each gets a failing test written first.

- **D1 — a successful route result is discarded (violates R5).** `client.ts` `buildResult`:
  `routeResultPart = routeError ? undefined : routeSubRequest.resolvedValue`. Measured: server
  returned `"Hello John Doe"`, caller got `undefined`.
- **D2 — a foreign error hijacks the typed route slot (violates R6).** `findSubRequestError`
  returns the **first error in the map** when nothing is keyed to the route. Measured: a middleFn's
  `session-expired` in the route slot, typed as the route's own union. Under the contract that
  error belongs in its own `middleFnErrors` slot (R3) — same reachability, honest type.
- **D3 — single-route and routesFlow disagree.** The flow branch of `buildResult` has no such
  fallback. Same failure, different slot, depending on call shape. The contract removes the
  fallback entirely, so both converge.
- **D4 — routesFlow fatals are statically unreachable (violates R4).** They land at
  `middleFnsErrors['mion-routes-flow']`; that key cannot exist in `{[K in keyof H]?: …}`.
- **D5 — the declared union cannot express undeclared errors, forcing casts.** Symptom that started
  this: `packages/examples/src/client/cancellation-timeout.ts` ships an `as string` cast because
  `error?.type === 'request-timeout'` does not compile (`TS2367`, union is
  `'validation-error' | undefined`). The `fatal` slot removes the need for the cast _and_
  keeps slot 1 closed.
- **D6 — `validation-error` carries two different payload shapes.** `ValidationError` is declared
  `RpcError<'validation-error', {typeErrors: RunTypeError[]}>`. The server honours it
  (`dispatch.ts:184`); the client builds a **bare array** (`lib/validation.ts:73`,
  `errorData: errors`). So `error.errorData?.typeErrors` is `undefined` whenever validation failed
  client-side — the common case, since `validateParams` defaults to `true`. Sole consumer of the
  bad shape is `request.ts:184`, backing the public `typeErrors()` API.
- **D7 — internal route ids leak into the user-facing middleFn errors record.** Measured:
  `middleFnsErrors['mion@methodsMetadata']` on a platform error. Under R4 an error keyed to
  anything that is not a middleFn of the request is fatal — the record only ever carries the
  middleFns the caller knows about.
- **D8 — `UnknownErrorHandler` is dead.** `types.ts:105` declares and exports it; a repo-wide grep
  finds no reader. It is the vestige of the untyped channel this spec finally builds. Delete it
  (its role is now the `fatal` slot, not a handler).

## Implementation plan

1. **Preserve the wire distinction.** `lib/serializer.ts` `unwrapUnexpectedErrors` must stop
   flattening. Return the `@thrownErrors` map to the caller alongside the body instead of
   `Object.assign`-ing it into the root. Platform errors keep their existing special case but are
   classified as fatal rather than fanned out to every subrequest (kills D7's cause).
2. **Classify on the way in.** `request.ts` keeps errors keyed by subrequest id but tags each as
   `returned` or `thrown`:
   - server body entry → returned, keyed by id
   - `@thrownErrors` entry → thrown, keyed by id (`validation-error` re-tagged returned — carve-out)
   - client-side validation error → returned, keyed by id
   - client transport error (timeout, abort, fetch failure, serialization, header extraction) →
     thrown, request-scoped. **Stop keying these to `this.requestId`** — that is what made them
     indistinguishable from the route's own errors.
3. **Distribute per the contract.** Rewrite `buildResult`: no `findSubRequestError` fallback,
   result slot preserved independently of the error slots.
   - slot 1 ← the route's id, `returned` only
   - slot 4 ← each request middleFn's `returned` error, under its record name
   - slot 2 ← first (execution order) of: any middleFn's `thrown` error, the route's `thrown`
     error, any request-scoped error, any error keyed to an id that is not part of the request
     (middleFns restored from prefill while a record was passed are merged into the record under
     their id, so their results/errors are never dropped)
   - Single-route and flow branches share the same rules.
4. **Reshape the tuple.** `Result` and `WorkflowResult` gain `FatalError | undefined` at index 2;
   the middleFn results and typed errors records shift to indexes 3 and 4. The
   `RouteSubRequest.call` overloads, `RoutesFlowBuilder.call` and `routesFlow()`'s result padding
   follow.
5. **Keep slot 1 closed.** `HandlerErrors` stays `declared | ValidationError`. No widening — that
   was the earlier proposal and it is explicitly rejected: it dilutes route typing, and with the
   `fatal` slot it is unnecessary.
6. **Scope the listeners.** `processMiddleFnsResponses` fires `onError` only for a middleFn's
   _returned_ (declared) errors, matching `TypedEvent<S, E>`'s declared `E`. Fatals never fire
   listeners.
   **6b — listeners without prefill.** Expose the middleFn subrequest's `TypedEvent` so inline
   middleFns can register typed handlers without prefilling (previously `prefill()` was the only
   path to one). Registration was the only missing piece — dispatch is already id-keyed for every
   middleFn in the request. Landed as `events()`/`onError`/`offError`/`onSuccess`/`offSuccess` on
   `MiddlewareSubRequest`.
7. **Fix D6.** `lib/validation.ts:73` → `errorData: {typeErrors: errors}`; `request.ts:184` reads
   `.errorData?.typeErrors ?? []`. Own commit.
8. **Delete D8.** Remove `UnknownErrorHandler`.
9. **Examples + website docs** (next section).

## Required tests

Written **first**, failing, one per rule. Client suite unless noted.

### Contract tests — single route

- **T1 (R1)** route returns its declared error → slot 1 holds it; slots 0 and 2 `undefined`.
- **T2 (R2)** route params invalid → slot 1 holds `validation-error`; slot 2 `undefined`.
- **T3 (R5+R3, pins D1)** route succeeds while a middleFn fails → **slot 0 holds the route
  result**, slot 1 and 2 `undefined`, slot 4 holds the middleFn error under its name, listener
  fires. This is the regression test for the discarded-result bug.
- **T4 (R6, pins D2)** middleFn returns its declared error → slot 1 stays `undefined`, slot 4
  holds the error. Asserts the error does **not** appear in the typed route slot nor in `fatal`.
- **T5 (R4)** timeout → slot 2 holds `request-timeout`; slots 0 and 1 `undefined`.
- **T6 (R4)** abort → slot 2 holds `request-aborted`.
- **T7 (R4)** platform error (oversized payload) → slot 2 only. Replaces the current
  "surface in EVERY positional slot" contract in `client.spec.ts:1227`, which this spec
  deliberately reverses — **that describe block must be rewritten, not deleted**, so the new
  single-slot contract is just as explicitly locked in.
- **T8 (R4)** unreachable `baseURL` → slot 2 holds the wrapped network failure.
- **T9 (R4)** route throws an undeclared error server-side → slot 2, not slot 1. Needs a new
  test-server route that `throw`s (existing `alwaysFails` **returns** its declared error, so it
  stays a slot-1 case and its current assertions are unaffected).

### Contract tests — routesFlow

- **T10 (R1)** one route fails, another succeeds → failing route's index in slot 1, succeeding
  route's value in slot 0 at its own index; slot 2 `undefined`.
- **T11 (R4, pins D4)** flow timeout → slot 2 holds `request-timeout`; per-route slots all
  `undefined`.
- **T12 (R3)** flow + failing middleFn → slot 4 holds the middleFn error under its name, listener
  fires, per-route error slots and `fatal` `undefined`.
- **T13** single-route and flow agree: the same failure yields the same slot in both shapes.

### Listener tests

- **T14 (R3)** middleFn's declared error → listener fires **and** its `middleFnErrors` slot is
  populated (both channels, matching the "two ways" claim in `1.error-handling.md`).
- **T15 (R4)** transport failure → **no** listener fires, even one registered for that code.
- **T15b (6b)** an **inline** (non-prefilled) middleFn with a registered `onError` → the listener
  fires with the typed error when that middleFn fails.
- **T16 (D7)** platform error → slot 2 holds it; no internal id (`mion@methodsMetadata`) is
  observable anywhere in the tuple (slots 3 and 4 both empty).
- **T17** a failing `runOnError` middleFn plus a route that throws → **no information is lost**:
  slot 4 holds the middleFn's declared error under its name, `fatal` holds the route's undeclared
  throw, and the middleFn's listener still fires. (This is the scenario that killed the
  single-shared-slot revision.) Uses the test-server `audit` (`runOnError`) middleFn and the
  `throwsUnexpectedly` route.

### Payload test

- **T18 (D6)** client-side validation failure exposes `errorData.typeErrors`, matching the server's
  shape, **and** `typeErrors()` still returns the same flat `RunTypeError[]` it returns today.

### Type-level tests

The examples package is the only `tsc` gate in CI (`.github/workflows/pull-requests.yml`,
`check-types-examples`), and there is no `expectTypeOf`/vitest-typecheck setup — so type assertions
live in a compiled example:

- **T19** `fatal.type === 'request-timeout'` compiles with **no cast** (this is D5's
  done-when).
- **T20** slot 1 stays closed: `error.type === 'request-timeout'` is a compile error, asserted with
  `@ts-expect-error` (precedent: `_homepage/home-client.ts:25`).
- **T21** an exhaustive `switch` over slot 1 ending in `const _n: never = error` compiles.
- **T22** declared payloads survive narrowing (`error.errorData?.until` typed, unknown fields
  rejected) and `ValidationError` keeps `ValidationErrorData` rather than collapsing to `any`.
- **T23** slot 4 is the typed middleFn **errors** record: a declared code narrows
  (`middleFnErrors.auth.type === 'not-authorized'` gives typed `errorData`), and a name that was
  not passed to the call is a compile error (`@ts-expect-error`).

## Website docs

The docs describe the current tuple everywhere, so they change with the code — **they cannot be
updated ahead of the implementation without documenting behaviour that does not exist.** Every item
below lands in the same PR as the change.

- **[`website/content/3.client/1.error-handling.md`](../../website/content/3.client/1.error-handling.md)**
  - "The Result Pattern" section — rewrite for the 5 slots, describing each slot's guarantee
    (closed vs open) rather than just naming it.
  - Add a section documenting the dispatch rules (the R1–R6 table, in prose) — this is the piece
    that has never been written down and is the root of the whole problem.
  - The "two ways to read a middleFn error" passage: the typed `onError` listener and the typed
    `middleFnErrors` record (T14 pins it).
  - Type Reference: the `Result` entry is a `code-import` over the
    `// type-result-start/end` markers, so it follows automatically; add a `FatalError` entry
    with new markers.
- **[`website/content/3.client/0.client-overview.md`](../../website/content/3.client/0.client-overview.md)**
  - The features list and two prose passages name the tuple's elements explicitly — update.
  - Note that undeclared/transport errors are **not** delivered to listeners (T15).
- **[`website/content/3.client/3.client-flow.md`](../../website/content/3.client/3.client-flow.md)**
  - Names `middleFnsErrors` in its flow description — update to the new slots.
- **[`website/content/3.client/4.cancellation-timeouts.md`](../../website/content/3.client/4.cancellation-timeouts.md)**
  - Prose says aborted/timed-out requests "return an error with `type === 'request-aborted'`" —
    correct but now it is the **fatal** slot; say so.
- **Examples** (each is code-imported by the pages above, and each is a CI-gated typecheck):
  - `cancellation-timeout.ts` — drop the `as string` cast and its explanatory comment; read
    `fatal` instead. This file is D5's acceptance criterion.
  - `cancellation-abort-signal.ts`, `cancellation-global-abort.ts` — their
    `// error.type === 'request-aborted'` trailing comments are comments _because_ the real code did
    not compile. Promote them to real narrowing on `fatal`.
  - Verified readers of the errors record (grep 2026-08-21): `client.ts`, `client-usage.ts`,
    `client-using-middleFns.ts`, `client-prefill-middleFns.ts`, `handling-errors.ts`,
    `workflow-vs-single.ts`, `workflow-with-middleFns.ts` — their record reads stay valid (the
    record moved to index 4); every client example destructures the tuple positionally and moves
    to the new slot order. Audit with `grep -rn "\.call(" packages/examples/src/client`.
  - New `client-error-slots.ts` carrying T19–T23, code-imported into the new dispatch-rules
    section.
- Run `pnpm run check-code-imports` — a dangling marker renders an error placeholder on the site
  rather than failing the build.

## Breaking changes

- **Tuple arity 4 → 5**, with `fatal` inserted at index 2: the middleFn results and errors records
  shift to indexes 3 and 4. Positional destructuring past index 1 breaks. Appending `fatal` at the
  end would be non-breaking but puts the most important error slot last; on 0.x the insert is
  worth it. The release notes must lead with it.
- **Errors move between slots.** A middleFn's declared error no longer appears in the route slot; a
  transport/platform error moves from the route slot to `fatal`. Callers reading only slot 1 will
  see `undefined` where they previously saw an error — they must read `fatal` and/or
  `middleFnErrors`.
- **An error for a middleFn that was not part of the request is now fatal**, not a raw-id entry in
  the record.
- **A successful route result now survives a middleFn failure** (D1). Callers using `if (!result)`
  as a proxy for "something failed" need to check the error slots instead.
- Versions are lerna-unified with `forcePublish` (`lerna.json`), so no `package.json` edits; this is
  a release-notes item.

## Done when

- Every rule R1–R6 has a passing test, and each of D1–D8 has a test that fails before the fix.
- `cancellation-timeout.ts` compiles with no cast and no explanatory comment.
- Slot 1's union is unchanged (`declared | ValidationError`) and a transport code in it is still a
  compile error.
- No error the route did not declare ever appears in slot 1; no error nobody declared ever appears
  in slot 4.
- No internal mion route id is reachable through the tuple — `middleFnsErrors['mion-routes-flow']`
  and `middleFnsErrors['mion@methodsMetadata']` no longer exist anywhere.
- The dispatch rules are documented on the website, not just in this spec.
- Full suite + `pnpm run lint` + `pnpm run format` + `pnpm run check-code-imports` +
  `pnpm run check-types-examples` green.
