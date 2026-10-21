---
type: feature
spec: guidelines
status: done
created: 2026-10-16
---

# Unwrapped Response for a Single Route

## Intent

A route's answer is always wrapped under its id: `GET /hello` sends `{"hello":{"hello":"world"}}`, where
hono and elysia send `{"hello":"world"}`. On a small response that is about a third more bytes, plus the
extra object. The request side already accepts the unwrapped form: a bare params array posted to a route
is read as that route's params (`deserializeRequestBody` in `packages/rpc-router/src/routes/serializer.routes.ts`).
The response has no such form. Find out whether it can, without a large architectural change, and whether
it pays off.

## Direction

The implementer investigates and plans the details. Constraints found so far:

- The wrapped shape carries more than the route value: middleware return values under their own ids,
  `@thrownErrors`, and several routes in a batch (`applyResult` in `packages/rpc-router/src/dispatch.ts`,
  `prepareBodyForJson` in `serializer.routes.ts`, `packages/rpc-router/src/batches.ts`).
- The client treats every top-level key as a method id (`deserializeJsonResponseBody` in
  `packages/rpc-client/src/lib/serializer.ts`). An unwrapped body today fails as `parsing-json-response-error`,
  or worse, is misread when the value's keys happen to match method ids.
- So the unwrapped form needs a clear signal on both sides. Possible shape: the client opts in per request,
  and the server unwraps only when the route is the only member with return data and nothing failed. The
  error path already sets an `x-rpc-error` header, which may be enough to tell the two shapes apart.
- Keep both parser modes (`json`, `compact`) and batches working. Compare bytes and req/s before and after.
- If it needs a large change, stop and write up the findings and options in the PR rather than building it.

## Docs

`container/website/content/01.rpc/02.server/03.call-context.md`, existing section "Request and Response
Format": the unwrapped form and when it is used. None if the investigation ends without a change.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- Either the unwrapped response ships, with client and server tests for the single route, middleware data,
  errors and batches, plus bench numbers, or the PR explains why it should not.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.

## Plan: unwrapped answer + answer object on demand (approved 2026-10-16)

### Context

Feature, guidelines spec. Today every answer is wrapped
under the route id: `{"users/getUser":{"id":42}}`. The goal: send the bare value `{"id":42}` when the request
asks for it and nothing else rides the answer. Mode: automatic.

Decisions taken with the user:

- **Request signal = bare array body.** `[42]` instead of `{"users/getUser":[42]}`. Already accepted by the
  server (`deserializeRequestBody`). Sending it now also asks for an unwrapped answer. Zero extra bytes.
- **Response signal = header `x-nowrap: 1`** on every unwrapped answer. No header = wrapped.
- **Breaking changes are fine.** No compatibility work or tests for older servers / clients,
  or for callers that posted arrays before.

### Server (`packages/rpc-router`)

1. `src/routes/serializer.routes.ts` `deserializeRequestBody`: when the parsed body is an array, mark the
   request as unwrapped (new readonly flag on `MionRequest`, e.g. `unwrapped?: boolean`, in `src/types/context.ts`).
2. Same file, `serializeResponseBody`, AFTER `prepareBodyForJson` (an encode failure adds errors):
   unwrap only when ALL hold:
   - request flagged unwrapped, not a batch (`context.batchId` unset);
   - `!response.hasErrors` and no `request.thrownErrors`;
   - body's only own key is the route id (`executionChain.methods[routeIndex].id`). Covers middleware data,
     a raw middleware writing its own key, a void route (`{}` stays wrapped).
   Then `response.body = body[routeId]` and set header `x-nowrap: 1`.
   Widen `MionResponse.body` type (or add a narrow cast) so a non-object value is legal; check every reader.
3. Adapters (node, uws, bun, cloudflare, vercel, aws, gcloud) already `JSON.stringify` / `Response.json`
   the body: no change expected, verify each with a test that a primitive value (string, number, `null`) is sent right.
4. Header name constant in `@mionjs/core` `src/constants.ts` next to `BUILD_VERSION_HEADER`, shared by both sides.

### Server: build the answer object only when needed (asked by the user)

Today `createContextFromChain` (`packages/rpc-router/src/callContext.ts`) allocates `response.body = {}` on every
request, and `applyResult` (`src/dispatch.ts`) adds one key per member that returns data. `@thrownErrors` is
already created on demand (`addThrownError`). An earlier dispatch change left "pre-shaping the response body per
chain" out on purpose, pending its own bench. Three steps, each landed as its own commit and
measured with `dispatch.bench.ts` against the step before. A step that does not win is dropped and the
numbers go in the spec and PR:

- **Step A, empty answer shared until first write.** `response.body` starts as one shared frozen empty object
  (same trick `request.body` already uses, pinned by `test/contextAllocation.spec.ts`). The first write in
  `applyResult` (and the `@thrownErrors` write in the serializer) allocates the real object. Saves the object on a
  void route, a not-found chain and an error-only answer. Readers that use `Object.hasOwn` (batches mapping,
  `prepareBodyForJson`) keep working on the shared empty one.
- **Step B, no wrapper object at all for an unwrapped answer.** When the request is unwrapped and the route is
  the first member to write, `applyResult` stores the route value as the body directly and marks the response.
  Any later write (end middleware data, `@thrownErrors`) wraps it back as `{[routeId]: value, ...}` on demand.
  The serializer then only checks the mark. Trade-off: a middleware running after the route sees the bare value
  in `response.body`. Kept only if clearly faster than unwrapping in the serializer (the plain approach above).
- **Step C, fixed shape per chain.** The chain builds a body with every return-data member id set to
  `undefined`, so writes never change the object's shape. JSON drops `undefined` keys, key order is already chain
  order. Checks that read "key present" switch to "value not undefined" (`prepareBodyForJson`, batch mapping,
  the unwrap check). Kept only if faster.

Each kept step gets tests: shared empty object (identity + frozen, like `contextAllocation.spec.ts`),
rewrap when a later member writes, fixed-shape key order and dropped `undefined` keys in the wire body.

### Client (`packages/rpc-client`)

1. `src/lib/serializer.ts` `serializeJsonBody`: when the only body entry is the route (no middleware sends
   params, not a batch, not optimistic, no metadata rows asked), write the bare array `[...]`
   (`[]` for a paramless route). Query GET path (`?data=`) follows automatically.
2. `deserializeJsonResponseBody`: when the response has `x-nowrap`, wrap the parsed value as
   `{[routeId]: value}` BEFORE `takeRaw` / `extractThrownErrors` (those use `in`, which throws on a primitive).
   Pass the route id from `src/dispatch.ts` (`context.route.id`). Everything downstream stays unchanged.

### Tests (Vitest)

- Router (`packages/rpc-router/test/`, new `unwrapped.spec.ts`): bare array → unwrapped + header; object body →
  wrapped, no header; middleware with return data → wrapped; thrown error, returned FatalError, encode failure →
  wrapped with `x-rpc-error`; returned non-fatal RpcError from the route → unwrapped value; void route →
  `{}` wrapped; primitive / `null` values; batch → wrapped; both parser strategies (`json`, `compact`).
- Client (`packages/rpc-client/test/`): single route sends bare array and reads the unwrapped answer;
  route + middleware params sends object; middleware return data still reaches its handler; errors;
  batches unchanged; optimistic / metadata-rows call stays wrapped.
- Adapter tests: one primitive-value case per adapter that has a test suite.
- Existing tests asserting the old wire body for array posts: update.

### Bench

- Bytes: before/after for a small and a medium route answer (body + header).
- Speed: `packages/rpc-router/src/routes/dispatch.bench.ts` (`pnpm exec vitest bench --project router dispatch`),
  baseline first, then after the unwrap and after each of steps A / B / C; add a bare-array case to it. Container bench
  (`pnpm miondevx bench`) if the host can reach it, else report that it could not run.
- If the numbers show no gain, say so in the PR (the todo allows shipping or explaining).

### Docs

`container/website/content/01.rpc/02.server/03.call-context.md`, section "Request and Response Format":
turn the existing bare-array tip into the unwrapped request/response pair with an `http` example and the
rule for when the answer stays wrapped. Check the error page "Error Response Format" still reads right.
Fuzzing: not a candidate (no new encoder; same value encoders as the wrapped form).

### Finish

Gate (`pnpm run lint`, `pnpm run format`, `pnpm test`), reconcile the spec with what shipped, write bench numbers
into it, `git mv` to `docs/done/`. Then review (pr-reviewer), docs + comments simplifiers (parallel, own commits),
open PR, drive CI green.

### Done when (from the todo)

- Unwrapped response ships with client + server tests for single route, middleware data, errors, batches,
  plus bench numbers; or the PR explains why not.
- simplify-docs and simplify-comments passes ran, each its own commit.

## Outcome: built, measured, not shipped

The unwrapped answer was built end to end (server, client, adapters, docs, tests), reviewed, and measured. It is
not kept: it brings no speed gain and about zero bytes on HTTP/1.1, while adding a breaking wire change and extra
rules. The only real gain is a plainer answer for callers outside mion (curl, other languages), not worth that cost.

What the built version did, for whoever looks at this again:

- **Request signal**: a bare params array body, or no body at all, asked for the bare answer. The client sent the
  bare array whenever only the route had params; headers middleware params go as HTTP headers, so they did not count.
- **Response signal**: `x-nowrap: 1`. Unwrapped at serialize time only when the route was the only key in the body:
  no error, no other member's value (even `null`), not a batch. A `HeadersSubset` answer never counted. An end
  middleware after the serializer that wrote the body re-keyed it. A cross-origin request also needed `x-nowrap` in
  `access-control-expose-headers`, or a browser could not read it.
- **Traps found on the way**: an end middleware writing into a bare value; the header hidden from cross-origin
  browsers; the client test server answering data from root middlewares on every route, so no end-to-end bare answer.

What this work kept (it stands on its own):

- `dispatchWithContext` goes through `dispatchMaybeSync`: faster or equal in every isolated case (sync chain with
  `alwaysAwait` off 228 → 105 ns, async route 373 → 339 ns, sync route 355 → 303 ns).
- `dispatchNoAwait.bench.ts`: a chain with async steps when `alwaysAwait` is off. Merging the two chain runners
  made it about 2x slower and no existing bench caught it; that merge was reverted.
- Request-shape cases (keyed body vs bare array, with the adapter's `JSON.stringify`) in `dispatch.bench.ts`.

### Isolated cost of the header

- Node: one extra response header costs about 100-120 ns (`setHeader` plus its line in the header block), about
  0.5% of a ~22 µs request. Bun: ~170 ns. uWS: ~65 ns plus one native call.
- On a real mion node server, header on/off and bare/keyed body never moved the median more than ~1%.
- Identical runs on the benchmark host swing 5-10%, so three quick rounds cannot tell these builds apart.

### Bytes

The body saves the route id length plus 5 bytes. On HTTP/1.1 the `x-nowrap: 1` header costs 13 bytes, so the
net is about zero; on HTTP/2 the header compresses to about 1 byte after the first request.

| Answer                   | Keyed | Bare | Body saved | Net with header (HTTP/1.1) |
| ------------------------ | ----- | ---- | ---------- | -------------------------- |
| `GET /hello`             | 27    | 17   | 10         | -3                         |
| `users/getUser`, 2 props | 40    | 22   | 18         | +5                         |
| 1 KB user, `echoUser`    | 948   | 935  | 13         | 0                          |

### Speed (in-process, `dispatch.bench.ts` with the adapter's `JSON.stringify`)

No change outside the noise of this host (±5 to 10% between identical runs). One run each, ops/s:

| Case                     | Before  | After   |
| ------------------------ | ------- | ------- |
| bare array, no params    | 513,871 | 522,533 |
| bare array, object param | 350,366 | 325,812 |
| bare array, 200 items    | 11,309  | 10,302  |

### Speed (HTTP server bench, `pnpm miondevx bench servers one <lane> --quick`)

All three suites answer bare after the change: hello-world sends no body, the validation suites post bare arrays.
Final code against main, 3 alternating rounds, median req/s (each round's value in brackets):

| Lane        | Suite            | Before                         | After                          |
| ----------- | ---------------- | ------------------------------ | ------------------------------ |
| mion (node) | hello-world      | 40,008 (39,148 40,008 40,284)  | 36,748 (36,748 35,396 37,797)  |
| mion (node) | light-validation | 28,264 (27,919 28,264 28,329)  | 28,128 (27,407 28,128 28,938)  |
| mion (node) | heavy-validation | 21,098 (20,290 21,098 21,383)  | 19,560 (20,775 18,265 19,560)  |
| mion.uws    | hello-world      | 55,081 (50,974 57,223 55,081)  | 55,037 (55,176 55,037 54,690)  |
| mion.uws    | light-validation | 42,133 (40,952 45,196 42,133)  | 39,407 (38,579 43,548 39,407)  |
| mion.uws    | heavy-validation | 26,177 (26,027 26,177 26,429)  | 26,663 (27,102 26,663 26,369)  |
| mion.bun    | hello-world      | 46,718 (46,718 48,045 46,151)  | 50,346 (54,837 50,346 44,852)  |
| mion.bun    | light-validation | 33,752 (33,546 35,049 33,752)  | 34,247 (34,663 34,247 32,621)  |
| mion.bun    | heavy-validation | 23,607 (23,607 24,963 22,652)  | 23,054 (23,833 23,054 22,744)  |

Node hello-world looked slower here (every round after below every round before), but isolated runs disproved it:
a real node A/B with a fresh pinned server per round gave hello 42,602 → 43,484 req/s, light
29,665 → 29,607, heavy 20,151 → 20,159. Three quick rounds on this host are not enough: identical runs swing 5-10%.

### Answer object on demand: measured, not shipped

Each step was built, measured against the committed unwrap with 3 alternating runs, and dropped:

- **A + B** (shared empty body until the first write; an unwrapped route value stored as the body with no wrapper
  object, re-keyed on demand): bare cases +3 to +7%, keyed cases -2 to -13%, untouched cases moved ±10%.
  Not a clear win, and a middleware after the route would see the bare value in `response.body`.
- **C** (body built from a per-chain template with every return-data id set to `undefined`, so writes never change
  its shape): most cases within ±3%, the three-middleware chain -20%. Not a win.
