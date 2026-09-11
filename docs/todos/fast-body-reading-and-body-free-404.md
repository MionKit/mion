---
type: chore
spec: full-plan
status: ready
created: 2026-09-11
---

# Fast request body reading per platform, and a 404 that never reads the body

## Problem

Per-route request limits landed with one shared reader, `readBodyWithin` in `packages/core/src/bodyReader.ts`, used by bun, cloudflare and vercel. It is correct but slow in the common case: every request builds a `new TextDecoder()`, pulls the body through `getReader()` chunk by chunk, decodes each chunk in JS and joins strings. On bun this replaced `await req.text()`, a native fast path (the body is already buffered in native memory when the handler runs, so a JS-side mid-flight cancel saves nothing there). Node and uws were never on the shared reader and already use the fast form (Buffer chunks, one concat, one native decode), but node carries its own copy of the 413 error and uws copies a zero-copy window it could decode in place.

Separately, an unknown path today buffers up to the platform limit (128 KB default), runs `rejectOversizedBody`, `JSON.parse`s the body, then throws `route-not-found`. Batches already refuse an unknown id before the body is read; paths do not. Router-first frameworks (Fastify, Hono, Hapi, Elysia, Bun.serve routes) never read the body for a 404; only middleware-chain frameworks (Express, Koa, Nest on Express) do, and it is a known complaint there.

Goal: keep the per-route limit feature, make every adapter read the body in the fastest form its runtime offers, keep the shared code in the router package, prove it with before/after numbers, and make a 404 body-free while global middleFns (logging, rate limiting) still run.

## Plan

### 1. Move the shared reader to the router and make it fast

Delete `packages/core/src/bodyReader.ts` (and its `export *` in `packages/core/index.ts:42`). Create `packages/router/src/lib/bodyReader.ts`, exported from `packages/router/index.ts`, with:

- `requestPayloadTooLarge()` (moved as is). Node drops its local `payloadTooLarge()` (`packages/platform-node/src/mionHttp.ts:221`) and uws its inline `FatalError` (`packages/platform-uws/src/uwsHttp.ts:205`) for this one.
- `readRequestBody(req: Request, maxBodySize: number): Promise<string | undefined>` for the fetch-style adapters (bun, cloudflare, vercel):

```ts
if (!req.body) return undefined;
const declared = req.headers.get('content-length');
if (declared !== null) {
  if (Number(declared) > maxBodySize) throw requestPayloadTooLarge();
  return req.text(); // the runtime delivers exactly content-length bytes: one native decode
}
// no content-length (chunked): count bytes, cancel past the limit, decode ONCE at the end
const reader = req.body.getReader();
const chunks: Uint8Array[] = []; let size = 0;
for (;;) {
  const {done, value} = await reader.read();
  if (done) break;
  size += value.byteLength;
  if (size > maxBodySize) { await reader.cancel(); throw requestPayloadTooLarge(); }
  chunks.push(value);
}
return decodeOnce(chunks, size); // shared module-level TextDecoder, non-streaming call (stateless, safe to share)
```

`decodeOnce`: one chunk decodes directly; several are copied into one `Uint8Array(size)` then decoded. No per-request decoder, no per-chunk decode, no string join.

The `content-length` fast path relies on the runtime enforcing the declared length. Verify per runtime before adopting it (bun, workerd via miniflare, undici for vercel): a body longer than its declared length must never reach `req.text()` as extra bytes. Pin with a test on each (raw socket for bun and node; miniflare listening on a port for cloudflare).

### 2. Per-platform body reading

| Platform | Today | After |
| --- | --- | --- |
| bun (`bunHttp.ts:64`) | `readBodyWithin` (JS chunk loop) | `readRequestBody`. In practice the header path (`req.text()`) since fetch clients send `content-length`. The native `maxRequestBodySize` (already the largest route limit, `getMaxRouteBodySize()`) stays the only true mid-flight abort; a smaller route limit refuses after the buffer. Keep `connection: close` on 413. |
| cloudflare (`cloudflareHandler.ts:67`) | `readBodyWithin` | `readRequestBody`. The body is a real stream from the edge, so the chunked path keeps its `cancel()`; the platform refuses over 100 MB before the Worker. |
| vercel (`vercelHandler.ts:59`) | `readBodyWithin` | `readRequestBody`. The platform refuses over 4.5 MB before the function; the reader only enforces app limits below that. |
| node (`mionHttp.ts:148-177`) | Buffer chunks, `Buffer.concat`, `toString` | Keep. Pass the running total: `Buffer.concat(bodyChunks, size)`. Use the shared 413. |
| uws (`uwsHttp.ts:170-245`) | native `collectBody`, `Buffer.from(fullBody)` copy, then `toString` | Keep `collectBody`. For the single-read (zero-copy, detached on return) path, decode synchronously inside the callback and drop the memcpy: the string is built before the window is detached. Verify with the existing boundary test (`uwsHttp.spec.ts:182`). Skip `Buffer.from` + `toString` entirely when `byteLength === 0` (every GET pays it today). |
| aws, gcloud | body arrives whole | No change. |

Numbers behind the choices: Node's own tracking shows `Buffer.toString('utf8')` about 2.9x faster than `TextDecoder.decode` (nodejs/performance#18); Bun's streams design doc describes `.text()` as a native buffered fast path an order of magnitude faster than the reader loop; uWS frameworks uniformly use `Buffer.concat` + `toString`.

### 3. A 404 that never reads the body

Decision: a 404 keeps running its chain (so `addStartMiddleFns` / `addEndMiddleFns` and every `alwaysRun` middleFn still see the request, the way Hapi's and Elysia's `onRequest` do) but never reads, buffers or parses the body. Route-level middleFns declared in the routes object never ran on a 404 and still do not. The same rule applies to an unknown batch id: today `getBatchExecutionChain` (`packages/router/src/batches.ts:192-201`) throws out of `createCallContext`, so the adapter answers directly and no middleFn ever sees the request. Both not-found cases become one mechanism: a body-free internal chain.

- New internal route `MION_ROUTES.batchNotFound` (`'mion@batchNotFound'`, `packages/core/src/constants.ts:38-50`) in `packages/router/src/routes/errors.routes.ts`, next to `notFound`: it throws the existing `batch-unknown-id` FatalError (404, same public message, id never echoed). `getBatchExecutionChain` returns that route's chain instead of throwing; `batchId` / `batchRouteIds` stay undefined.
- `packages/router/src/router.ts:428-450`: the internal error routes (`notFound`, `batchNotFound`, `thrownErrors`, `platformError`) register their chain with `readsBody: false` on `MethodsExecutionChain` (`packages/router/src/types/remoteMethods.ts:111-120`); every real route and every merged batch chain `true`. Surface it as `CallContext.readsBody` from `createCallContext` (`packages/router/src/callContext.ts:43-67`).
- Adapters: `if (!context.readsBody)` skip the read and dispatch with no body. Node: answer, then drain (`httpReq.resume()`) so keep-alive survives; a `content-length` past the platform limit is destroyed as today. Fetch runtimes: leave `req.body` untouched. uws: skip `collectBody` (uWS discards an unread body; verify `onAborted` still fires). The `createCallContext` try/catch in each adapter stays for real failures (a missing not-found route, a `pathTransform` throw).
- `deserializeRequestBody` (`packages/router/src/routes/serializer.routes.ts:27`) already returns on an empty body; no change. The path 404 wire shape (`@thrownErrors['mion@notFound']`, `x-rpc-error: route-not-found`) is unchanged. The batch 404 moves from a bare fatal response to the chain's shape, `@thrownErrors['mion@batchNotFound']` with `x-rpc-error: batch-unknown-id` and status 404; the client reads `@thrownErrors` generically (`packages/client/src/request.ts:201`), so its unknown-id test (`packages/client/src/batch.spec.ts:771`) must still see a 404 `batch-unknown-id` fatal, adjusted only for the slot key.

### 4. Before / after benchmarks

- **Server lanes** (`container/mion-bench`, lanes `mion`, `mion.uws`, `mion.bun`; suites `hello-world` GET, `light-validation` ~100 B POST, `heavy-validation` ~1 KB POST, and the size sweep 1 KB to 4 MB). Run the full set twice, once at the commit before the change and once after, with `MION_BENCH_RESULTS_DIR` pointing at two dirs, never `--quick`. Add `aggregate --compare <before> <after>` (`container/mion-bench/aggregate.mjs`) that prints the delta per lane and suite; the done doc records the table. There is no cloudflare or vercel lane and adding one is out of scope; the cloudflare handler gets an in-process bench instead.
- **Router micro bench** `packages/router/src/lib/bodyReader.bench.ts`: old reader vs new for a `Request` with a string body (100 B, 1 KB, 50 KB, with and without `content-length`) and a chunked `ReadableStream` body. Runs under node like `dispatch.bench.ts`.
- **Cloudflare** `packages/platform-cloudflare/src/cloudflareHandler.bench.ts`: Miniflare `dispatchFetch` (the setup `cloudflareHandler.workers.spec.ts:25-40` already uses) on the same three bodies, before and after.
- Acceptance: no lane slower than before outside the recorded 10% tolerance; bun `light-validation` and `heavy-validation` at or above the numbers `main` had with `req.text()`.

## Tests

- Router: `'an unknown path never parses the body'` (send `'{not json'` to `/nope`, expect `route-not-found`, not `parsing-json-request-error`); `'global start and end middleFns run on an unknown path'`; `'a route-level middleFn does not run on an unknown path'`; `readsBody` false only for the internal error routes.
- Batches: the unknown-id block in `packages/router/src/batches.spec.ts:321-362` and `packages/router/src/security.spec.ts:225-260` change from "rejects" to "answers a 404 `batch-unknown-id` through the chain": the `'{not json'` body still proves the body is never parsed, the id is still never echoed, and a new test proves global start/end middleFns run on an unknown batch id.
- `bodyReader.spec.ts` in the router: header path, chunked path, cancel past the limit (pull counter), multi-byte characters split across chunks decode correctly (the one-decode design must not corrupt them), empty body, no body.
- Adapters, on top of the existing 413 / streamed / boundary specs, which must all stay green: node raw socket, `POST /nope` with a 1000-byte `content-length` and 10 bytes sent gets its 404 before the body finishes and the connection serves a second request; cloudflare and vercel `ReadableStream` body on an unknown path, `pulled === 0`; bun, 404 then liveness; uws, 404 with a body and the next request on the same connection works; the lying `content-length` test per fetch runtime from step 1.
- `pnpm test:bun`, the cloudflare workers specs, and the HTTP fuzz lane (`pnpm miondevx core fuzz sechttp`, whose `json.unknown-route` attack already sends junk to unknown paths) all pass.

## Docs

- `container/website/content/01.rpc/02.server/09.security.md`: the per-request table lists route lookup FIRST; a new sentence in Body Size Limits that an unknown path never reads the body; a bun note that the native server limit is the largest route limit and a smaller route limit refuses after the buffer.
- `02.middle-fns.md`: a short "Unknown Paths" section (global start/end middleFns run for an unknown path and an unknown batch id, route-level ones do not, the body is never read).
- `03.client/03.batch.md:98` says an unknown id "costs no work"; reword to "the body is never read and global middleFns still run".
- Platform pages for bun, cloudflare and vercel: one line each on how the body is read against the limit.
- `docs/done/per-route-max-payload.md` line 59 names `readBodyWithin` in core; update to the router reader.

## Fuzzing

No new lane. The existing HTTP fuzz lane already mutates paths and bodies; add unknown-path-with-chunked-body cases to its attack table if missing.

## Out of scope

- A cloudflare or vercel lane in `container/mion-bench`.
- Any change to derived limits or caps, or to how a known batch id resolves.
- AWS `isBase64Encoded` bodies and `getRouteExecutableFromPath` dead code in the router (surfaced during research; handled as separate findings, not here).

## Done when

- `readBodyWithin` is gone from core; bun, cloudflare and vercel use the router's `readRequestBody`; node and uws use the shared 413 and their small fast-path fixes.
- A 404 runs global middleFns and never reads the body, pinned by router and adapter tests.
- Before/after tables for the three server lanes, the router micro bench and the cloudflare bench are in the done doc, with no lane slower than before beyond tolerance.
- All 21 vitest projects, `test:bun`, the sechttp fuzz lane, lint and format pass; docs updated.
