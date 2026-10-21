---
type: feature
spec: full-plan
status: done
created: 2026-10-02
---

# Every batch entry is the same tuple a single call() returns

## Problem

A single route call returns `[value, error, response]`. A batch returns a different shape: all values in one
list, all errors in a second list, then the response.

```ts
// today
const [[sum, greeting], [sumError, greetingError], response] = await batch([...]).call();
```

The value and its error sit in two parallel lists, matched only by position, and the shape differs from
`call()`. So a helper written for a single call result cannot take a batch entry.

New shape: one entry per route, each exactly a `call()` result. The response is the one shared object (the same
reference) in every entry. There is no extra response item at the end, so the result lines up 1:1 with the
routes passed in.

```ts
// new
const [[sum, sumError, response], [greeting, greetingError]] = await batch([...]).call();
```

Slot rules do not change. Slot 0 holds only the route's typed value, slot 1 only its declared errors plus
`ValidationError`. Anything not strongly typed (a server throw, timeout, abort, network, a failed hook, an
answer the client could not decode) leaves both empty and goes to `response['@thrownErrors']`, exactly as today.

Treat the shape as if batch were brand new: no migration notes, no breaking-change wording anywhere.

## Plan

### Types, `packages/rpc-client/src/types.ts`

- `BatchResult` (:23-28) becomes a mapped tuple, each entry derived from the route's own `call()` result, so
  the two can never drift and a single-call helper accepts an entry:

  ```ts
  export type BatchResult<Routes extends RouteSubRequest<any>[]> = {
    [K in keyof Routes]: Routes[K] extends RouteSubRequest<any> ? Awaited<ReturnType<Routes[K]['call']>> : never;
  };
  ```
- Delete `BatchRouteResults` and `BatchRouteErrors` (:30-38). They are public through `index.ts:8`
  (`export * from './src/types.ts'`). Per the repo rule, they leave no trace: no alias, no note.
- Update the JSDoc on `BatchResult` and on `Result` (:16) to the new shape.

### Building the result, `packages/rpc-client/src/dispatch.ts`

- `buildResult` (:663-691) already branches route vs batch. Move the framework-error lines (:686-688) above the
  branch, so `response` is complete before any entry points at it.
- The batch branch (:679-684) returns one entry per route, all pointing at the same `response`:

  ```ts
  if (batchSubRequests)
    return batchSubRequests.map((batchRoute) => [batchRoute.resolvedValue, declaredErrorFor(batchRoute.id), response]);
  ```

  This drops the "collapse an all-undefined list to undefined" step. Every entry always exists, so its
  empty slots are just `undefined`.
- `dispatchCall`'s return type (:52) and the `BatchResult` import (:10) still fit and need no change.

### `packages/rpc-client/src/batch.ts`

- `call()` (:56-64) returns `client.execute(...)` directly. Remove the `[results, errors, response]`
  destructure and the `emptyResults` / `emptyErrors` refill.

### Package notes

- `packages/rpc-client/CLAUDE.md:5-6`: say `batch()` returns one `Result` per route, the response shared.
- `packages/rpc-client/test/errorDispatch.spec.ts:12`, rule R1: "slot 1 (its index in a batch)" becomes
  "slot 1 (of its own entry in a batch)".

### Container consumers (keep their outputs, so their assertions do not change)

- `container/pre-publish-e2e/mion-consumer/client-app/src/batchFlow.ts:24,28`: destructure per entry. Build
  the same `errors` array from the entries, so `compile-output.spec.ts:146-149` keeps passing unchanged.
- `container/pre-publish-e2e/mion-consumer/src/tests/json.spec.ts:120,145`: switch to per-entry destructuring.
- `container/pre-publish-e2e/apps/mion-next/app/selftest/route.ts:27-38`: per-entry destructuring with the
  same output fields, so `test/build-outputs.test.mjs:85-102` needs no change.

### Commit

A plain `feat(client):` subject, no `!`: the shape is described as new, not as a break.

### Mapping errors leave the target's slots (found while building)

The docs pass showed a route fed by `inputFrom` broke the slot rule: when its source failed, its error slot held
`batch-mapping-source-failed`, an error its type does not declare. Decided with the user: it goes to
`@thrownErrors` instead, and both of the target's slots stay empty.

- `packages/rpc-router/src/lib/dispatchError.ts`: `addThrownError` (non-fatal, the batch keeps going) and
  `hasThrownError`, shared with `recordUndeclaredError`.
- `packages/rpc-router/src/batches.ts`: the mapping step records the error under the target's id, and the
  target guard reads it from there. A source that was itself skipped counts as failed, so a chain A -> B -> C
  with A failing skips B and C instead of crashing the second mapper.
- `serializer.routes.ts`: the undeclared-error case stays, for a handler whose type does not match what it
  returns; its comment and test no longer name the mapping step.
- Tests: the router mapping test, a new A -> B -> C chain test, and the client mapped-source test.

## Tests

Rewrite every batch destructuring to the per-entry shape. Where a test asserted the whole `results` or `errors`
list, assert per entry: `entries.map(([value]) => value)` and `entries.map(([, error]) => error)`.

- `packages/rpc-client/test/batch.spec.ts`: the bulk (about 40 sites, :39-808). This includes the index
  access at :605-612, "keeps the array order" at :647-656, unknown id at :747-749, and timeout / abort at
  :794-808.
- `test/errorDispatch.spec.ts` `describe('batch calls')` (:255-327): T10, T11, T12, T13, T31.
- `test/client.spec.ts:1359-1362, 1397-1400`, `test/onRequest.spec.ts:92-95, 333`,
  `test/oneProgram.spec.ts:39`, `test/middlewares/fetchMetadata.spec.ts:128`,
  `test/bundled/bundled.spec.ts:194-198`.
- `test/types.spec.ts:161-162`: read the response from an entry, `const [[, , batchResponse]] = ...`.

New tests that pin the contract:

- **Shape** (`batch.spec.ts`): the result length equals the number of routes, every entry has 3 items, and
  every entry's slot 2 is the SAME object (`toBe`, not `toEqual`).
- **Parity with a single call** (`errorDispatch.spec.ts`, T33): for a success, a declared error and a
  validation error, the batch entry's slots 0 and 1 equal what `route.call()` returns for the same route (error
  ids left out, they are generated per error). The validation case runs in a batch of its own: wrong params stop
  the whole request client-side, so the other routes would never run. A route is listed once per batch (BAT005).
- **Whole-call failure**: T11 in `errorDispatch.spec.ts` (timeout) pins every entry empty, the error once in
  `response['@thrownErrors']`, and the shared response by reference. The existing abort and unknown id tests
  assert the same empty slots per entry.
- **Types** (`types.spec.ts`): an entry's type equals the single call's result type,
  `expectTypeOf(entry).toEqualTypeOf<Awaited<ReturnType<typeof subRequest.call>>>()`. Also check that a
  3-route batch types each entry by its own route.

Run `pnpm --filter @mionjs/client test`, then `pnpm test`, and `pnpm run typecheck` (it compiles the examples).

## Docs

Every example that destructures a batch result, all under `packages/private-examples/src/`:

- `_homepage/home-batch.ts:10`: `[[order, user]]` becomes `[[order], [user]]`. Shown on
  `01.introduction/01.about-mion-rpc.md:144` (homepage wording rules apply).
- `client/batch-basic.ts:6`, `client/batch-input-from.ts:12`, `client/cancellation-with-middlewares.ts:22`.
- `client/batch-vs-single.ts:13-14`: fix the "returns [[results...], [errors...], response]" comment to
  "returns one [result, error, response] per route".
- `client/batch-with-middlewares.ts:14`: take `response` from the first entry.

Page `container/website/content/01.rpc/04.client/03.batch.md`, existing sections:

- Intro (:7): one entry per route, in order, each the same `[result, error, response]` as a single call.
- Add a tip there: every entry shares the same response object.
- Added on request while building: the page stresses that slots 0 and 1 are strongly typed, and that both are
  `undefined` when the error happened outside the route. **Error Handling in a Batch** was rewritten around one
  table of what each slot holds per case (success, declared or validation error, a middleware failing before the
  route, a timeout / abort / network failure / undeclared throw, another route's wrong params stopping the batch),
  plus a tip that an empty result is not always a success. The warning now says a route failing on the server
  does not stop the others.
- `batch-basic.ts` and `cancellation-with-middlewares.ts` check `response['@thrownErrors']` instead of reading
  an empty error slot as a success.
- **Batch vs Single Route** (:100-112): rewrite the table. The result row becomes "one `[result, error,
  response]` per route", and the separate error row goes.
- **JSON Round Trip in a Batch** (:178): fix the inline snippet.

Label the PR `website` and `pre-publish-e2e`.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Fuzzing

Not a fuzzing candidate. The one property worth checking (a batch entry equals the single call of the same
route) has a small, fixed input set, and the parity test above covers it.

## Out of scope

- Named routes (`batch({user: ..., orders: ...})`). That needs the build to read object literals and put the
  keys in the batch id.
- A throwing variant (`callOrThrow`) or an exported `unwrap` helper.
- Any other change to what goes into slots 0, 1 or 2.
- The server side, the wire format and batch id discovery: none of them depend on the client's result shape.

## Done when

- `batch([...]).call()` returns one `Result` per route, typed and at runtime, the response shared by reference.
- `BatchRouteResults` and `BatchRouteErrors` are gone with no trace.
- Every test, example, doc page and container consumer above uses the new shape. `pnpm test`,
  `pnpm run typecheck` and `pnpm run lint` pass. The `website` and `pre-publish-e2e` lanes are green.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
