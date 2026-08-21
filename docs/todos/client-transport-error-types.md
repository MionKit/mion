# Client error unions omit the transport errors the client actually raises

**Status:** todo
**Type:** bug (type/runtime divergence on a public type)
**Created:** 2026-08-20 (found while turning the examples typecheck into a CI gate --
see [../done/examples-precompile-debt.md](../done/examples-precompile-debt.md))
**Updated:** 2026-08-21 -- investigated; plan below is validated against a working prototype and
widened to cover two further findings (server-framework errors, `validation-error` payload drift).

## The gap

`HandlerErrors` (`packages/client/src/types.ts:113`) is the union a caller narrows on:

```ts
export type HandlerErrors<PH extends (...args: any[]) => Promise<any>> = Simplify<
  Extract<HandlerResponse<PH>, RpcError<string, any>> | ValidationError
>;
```

It carries **the handler's own declared errors plus `ValidationError`, and nothing else**. But the
client raises at least seven more `RpcError` types of its own, none of which appear in any handler
signature. From `packages/client/src/request.ts`:

| type                       | raised at      |
| -------------------------- | -------------- |
| `request-timeout`          | `:269`         |
| `request-aborted`          | `:280`         |
| `route-metadata-not-found` | `:322`, `:358` |
| `routes-cant-be-prefilled` | `:393`         |
| `missing-headers-param`    | `:493`         |
| `invalid-headers-param`    | `:509`         |

So a caller who writes the obvious thing gets a compile error on correct code:

```ts
const [result, error] = await routes.users.sayHello(user).call({timeout: 5000});
if (error?.type === 'request-timeout') {
  /* TS2367: no overlap */
}
```

## Evidence

`packages/examples/src/client/cancellation-timeout.ts` -- the example on the
[cancellation & timeouts](../../website/content/3.client/4.cancellation-timeouts.md) page -- was
written the natural way and did **not** compile. Turning the examples typecheck into a CI gate is
what surfaced it; before that the file was never typechecked. It currently ships an `as string`
cast plus a comment pointing here, which documents the wart rather than the idiom.

Reproduced 2026-08-21 by dropping the cast and running the CI gate:

```
$ pnpm run check-types-examples
src/client/cancellation-timeout.ts(13,5): error TS2367: This comparison appears to be unintentional
because the types '"validation-error" | undefined' and '"request-timeout"' have no overlap.
```

Note what the union actually collapses to: `'validation-error' | undefined`. `sayHello` declares no
errors of its own, so for the majority of routes the error slot is today typed as _one_ member --
and that member is not one of the ones the transport can produce.

The divergence is one-directional and safe at runtime: the client really does produce these, callers
just cannot narrow to them. Nothing is mistyped -- the union is incomplete.

## Findings from the 2026-08-21 investigation

Three things the original write-up did not capture. All three are the _same_ defect and are in
scope for the fix.

### F1 -- the gap is wider than `request.ts`: 18 client-raised literals, not 7

`request.ts` is not the only client module that constructs errors into the same `RequestErrors` map,
and every entry in that map can reach the caller's error slot. `packages/client/src/lib/serializer.ts`
adds `json-stringify-request-error`, `unsupported-content-type`, `parsing-json-response-error` and
`deserialization-error`; `lib/validation.ts` adds `unexpected-validation-error`; `routesFlow.ts`
adds `routesFlow-empty-routes`, `routesFlow-missing-client` and `routesFlow-client-mismatch`;
`subRequest.ts:108` adds an `unknown-error` fallback.

They reach the _route_ slot too, not just their own key -- `MionClient.buildResult` falls back to
`findSubRequestError`, which returns the first error in the map when nothing is keyed to the route
id. So a middleFn-keyed `routes-cant-be-prefilled` can legitimately land in `routeError`.

### F2 -- server-framework errors have exactly the same gap, and a test already proves it

`packages/client/src/client.spec.ts:1227` locks in a contract ("platform error propagation") whose
assertion is `expect(error?.type).toBe('request-payload-too-large')`. That type is produced by the
platform adapter, appears in no handler signature, and is not in `HandlerErrors` -- so the very
behaviour the suite guarantees is un-narrowable by the caller who consumes it.

It is not alone. `route-not-found`, `rpc-metadata-not-found`, `platform-error`, `serialization-error`,
`invalid-request-body`, `parsing-json-request-error`, `json-stringify-response-error`,
`prepare-for-json-response-error`, `request-connection-error`, `response-connection-error`,
`request-payload-too-large`, `server-error`, `not-found` and the `routesFlow-*` family are all
framework-produced, all reach the client's error slot through the response body, and none are
reachable from the public union. Roughly 40 literals across `router` (23), `platform-node` (5),
`platform-bun` (4), `platform-gcloud`/`platform-vercel`/`platform-cloudflare` (2 each),
`platform-aws` (1) and `core` (1).

Fixing only the client half leaves the identical defect standing on the server half, so this spec
covers both.

### F3 -- `validation-error` carries two different payload shapes (separate latent bug)

`ValidationError` is declared as `RpcError<'validation-error', ValidationErrorData>` where
`ValidationErrorData = {typeErrors: RunTypeError[]}` (`packages/core/src/errors.ts:27,37`).

- The **server** honours that: `packages/router/src/dispatch.ts:184,204,218` all build
  `errorData: {typeErrors: [...]}`.
- The **client** does not: `packages/client/src/lib/validation.ts:73` builds `errorData: errors`
  -- a bare `RunTypeError[]`.

So `error.errorData?.typeErrors` -- the access the public type invites -- silently yields
`undefined` whenever the validation error was raised client-side, which is the common case
(`validateParams` defaults to `true`). This predates the union gap and is invisible today only
because callers rarely reach for `errorData` on an error they cannot narrow to in the first place;
widening the union makes the access idiomatic and the drift user-visible.

The bare-array shape has one consumer: `packages/client/src/request.ts:184`
(`.map((subRequest) => subRequest.error?.errorData || []).flat()`), which backs the public
`typeErrors()` API. Both sides move together.

## Decisions taken

Two calls were put to the user on 2026-08-21; both came back _no preference_, so the recommended
option stands and is recorded here.

- **Scope: client + server-framework errors.** Per F2, half a fix leaves the same defect standing.
- **`unknown-error`: normalize the runtime so the union can close.** `request.ts:296` currently
  builds `type: error?.name || 'unknown-error'`, so a fetch network failure surfaces as
  `type: 'TypeError'`. One dynamic site makes the whole union impossible to close honestly, and an
  unbounded `type` is a poor public contract regardless. The fix pins the type to `'unknown-error'`;
  the original error keeps its name in `message` and its identity in `originalError`, so nothing is
  lost. This _is_ a runtime behaviour change and belongs in the release notes.

  Rejected alternative: typing it `RpcError<'unknown-error' | (string & {})>`. It preserves
  behaviour and autocomplete, but reopens the union -- any typo'd string compiles and exhaustive
  switches silently stop being exhaustive. That is the class of divergence this spec exists to end.

## Fix plan

### 1. `@mionjs/core` -- one const per error family, and the unions derived from them

New module `packages/core/src/errorTypes.ts`, re-exported from the package root:

```ts
/** every error `type` mion's server framework produces; the union is derived from it */
export const MION_PROTOCOL_ERROR_TYPES = {
  routeNotFound: 'route-not-found',
  platformError: 'platform-error',
  requestPayloadTooLarge: 'request-payload-too-large',
  // ...
} as const;

export type ProtocolErrorType = (typeof MION_PROTOCOL_ERROR_TYPES)[keyof typeof MION_PROTOCOL_ERROR_TYPES];

/** distributes, so each member is its own discriminated RpcError rather than one RpcError<union> */
type ToRpcErrorUnion<T extends string> = T extends any ? RpcError<T> : never;

export type ProtocolError = ToRpcErrorUnion<ProtocolErrorType>;
```

The distribution matters: `RpcError<'a' | 'b'>` is a single object type with a union-typed `type`
property and does **not** discriminate, whereas `RpcError<'a'> | RpcError<'b'>` does, which is what
`TypedEvent.onError`'s `Extract<E, {type: T}>` needs.

`validation-error` is **excluded** from the derived union and contributed by the existing
`ValidationError` alias instead, so its `ValidationErrorData` payload survives narrowing rather
than being flattened to `any` by a same-`type` sibling. Verified on the prototype: after the change
`error.type === 'validation-error'` still gives `errorData?: ValidationErrorData`, not `any`.

### 2. `@mionjs/client` -- the same, for the errors the client raises

`packages/client/src/lib/clientErrors.ts` (own module, so `types.ts` can import it without a cycle):

```ts
export const CLIENT_ERROR_TYPES = {requestTimeout: 'request-timeout' /* ...18 entries... */} as const;
export type ClientErrorType = (typeof CLIENT_ERROR_TYPES)[keyof typeof CLIENT_ERROR_TYPES];
export type ClientError = ValidationError | ToRpcErrorUnion<Exclude<ClientErrorType, ValidationError['type']>>;
```

Plus a constructor that cannot be called with an unregistered type:

```ts
/** builds an RpcError the client owns; `type` is constrained to ClientErrorType so a new client
 *  error cannot be raised without landing in the public union */
export function clientRpcError<T extends ClientErrorType>(params: {type: T} & Omit<RpcErrorParams<T, any>, 'type'>): RpcError<T>;
```

Every `new RpcError({...})` in `packages/client/src` becomes `clientRpcError({...})`. Runtime shape
is unchanged -- it is `new RpcError` under the hood.

### 3. Wire it into the public union

```ts
export type HandlerErrors<PH extends (...args: any[]) => Promise<any>> = Simplify<
  Extract<HandlerResponse<PH>, RpcError<string, any>> | ClientError | ProtocolError
>;
```

That single edit covers **all four** consumers the original spec asked about -- `MiddleFnError`
(`types.ts:27`), `WorkflowRouteErrors` (`:52`), `RouteSubRequest.call` (`:169`, `:180`) and the
`TypedEvent` returned by `prefill()` (`:205`) all route through `HandlerErrors`. No separate
widening is needed for any of them; confirmed on the prototype.

### 4. Make the constants load-bearing, in the repo's established way

Following [`../done/fn-keys-single-source-of-truth.md`](../done/fn-keys-single-source-of-truth.md):
a constant that merely _duplicates_ the literals drifts, so the throw sites must read from it.

- All ~18 client sites go through `clientRpcError` (type-enforced, compile-time).
- All ~40 framework sites use `MION_PROTOCOL_ERROR_TYPES.x` instead of a bare literal.
- A guard spec (`packages/client/src/lib/clientErrors.spec.ts`) scans the non-spec sources under
  `packages/client/src` and asserts no residual `new RpcError(` outside `clientErrors.ts`. That is
  what stops the next contributor reintroducing an un-unioned literal -- the mechanism the original
  spec asked for ("so a new one cannot be added without landing in the union").

### 5. Normalize `unknown-error`

`request.ts:296`: `type: error?.name || 'unknown-error'` becomes `type: CLIENT_ERROR_TYPES.unknownError`.
The stage message already carries `error.message`, and `originalError` already carries the Error
itself, so `error.name` remains recoverable.

### 6. Fix the `validation-error` payload drift (F3)

- `packages/client/src/lib/validation.ts:73` -- `errorData: errors` becomes `errorData: {typeErrors: errors}`.
- `packages/client/src/request.ts:184` -- the consumer reads `.errorData?.typeErrors ?? []` instead
  of treating `errorData` as the array.

Its own commit, with a spec asserting a client-side validation failure exposes
`errorData.typeErrors` **and** that `typeErrors()` still returns the same flat `RunTypeError[]` it
returns today.

### 7. Examples and docs

- `packages/examples/src/client/cancellation-timeout.ts` -- drop the `as string` cast and the
  four-line note; the example reads as the idiom.
- `cancellation-abort-signal.ts` / `cancellation-global-abort.ts` -- their
  `// error.type === 'request-aborted'` trailing comments were comments _because_ the real thing did
  not compile. Promote them to actual narrowing now that it does.
- New `packages/examples/src/client/client-error-types.ts`, code-imported into
  [`website/content/3.client/1.error-handling.md`](../../website/content/3.client/1.error-handling.md),
  showing narrowing across the three families (handler / client / protocol) and carrying a
  `@ts-expect-error` line on a bogus type -- so the CI examples gate doubles as the type-level test
  that the union stays _closed_. Precedent: `_homepage/home-client.ts:25`.
- Add `// type-client-error-start/end` markers around the unions and a Type Reference entry on the
  same page, matching how `Result`, `TypedEvent` and `RpcError` are already published there.

### 8. Versioning -- nothing to edit

The original spec's item 4 asked whether this is a minor or a breaking bump. Versions are unified
and driven by lerna (`lerna.json`, `forcePublish: true`), so no `package.json` is touched by this
change. What remains is a release-note call: widening a union is source-breaking only for a caller
whose `switch` over `error.type` ends in a `never`-assignment default. On 0.x, minor.

Its other half -- "check the fixtures: `client.routes.spec.ts` and `clientMethodsMetadata.spec.ts`
deep-equal error shapes" -- is resolved: both use a `test-error` fixture and assert runtime shapes
only, and every change here except step 5 and step 6 is type-level. No fixture is affected.

## Tests

- `clientErrors.spec.ts` -- values unique; no residual `new RpcError(` in client sources (step 4).
- `client.spec.ts` -- a case asserting the normalized `unknown-error` for a non-RpcError failure
  (step 5), and the `errorData.typeErrors` shape plus unchanged `typeErrors()` output (step 6).
- The examples typecheck gate carries the type-level assertions (step 7); the repo has no
  `expectTypeOf`/vitest-typecheck setup, and `packages/examples` is the only `tsc` gate in CI.
- Full suite + `pnpm run lint` + `pnpm run format` + `pnpm run check-code-imports`.

## Prototype status

The type change in step 3 was prototyped end to end on 2026-08-21 and reverted. With it in place:

- `cancellation-timeout.ts` compiles with **no cast** -- `pnpm run check-types-examples` clean.
- `error.type === 'request-aborted'` / `'unknown-error'` narrow.
- `error.type === 'validation-error'` still yields `errorData?: ValidationErrorData`, not `any`.
- a bogus `error.type === 'not-a-real-error-type'` is still rejected (union stays closed).
- handler-declared narrowing is untouched (`workflow-vs-single.ts`, `client.ts` still compile).
- `vitest run --project client` green, 140/140.

## Done when

- A caller can narrow `error.type` to `'request-timeout'` without a cast.
- `cancellation-timeout.ts` compiles with no cast and no explanatory note.
- Every `type:` literal constructed anywhere in `packages/client/src` is reachable from the public
  error union, and cannot be added without landing in it.
- Every framework-produced `type:` literal in `router`/`platform-*`/`core` is likewise reachable.
- `validation-error` carries `{typeErrors}` whichever side raised it.
