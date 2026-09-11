---
type: chore
spec: full-plan
status: done
created: 2026-09-11
---

# Fast request body reading per platform, and a 404 that never reads the body

## Problem

Per-route request limits landed with one shared reader, `readBodyWithin` in core, used by bun, cloudflare and vercel. It was correct but slow in the common case: every request built a `new TextDecoder()`, pulled the body through `getReader()` chunk by chunk, decoded each chunk in JS and joined strings. On bun this replaced `await req.text()`, the native fast path. Node and uws were never on the shared reader and already used the fast form, but node carried its own copy of the 413 error and uws copied a zero-copy window it could decode in place.

Separately, an unknown path buffered up to the platform limit, ran the size check, `JSON.parse`d the body, then threw `route-not-found`. An unknown batch id threw out of `createCallContext`, so no middleFn ever saw it. Router-first frameworks (Fastify, Hono, Hapi, Elysia, Bun.serve routes) never read the body for a 404; only middleware-chain frameworks (Express, Koa, Nest on Express) do, and it is a known complaint there.

## What shipped

### The reader lives in the router, with a strategy per runtime

`packages/router/src/lib/bodyReader.ts` exports `requestPayloadTooLarge()` (node and uws use it too, their local copies are gone) and `readRequestBody(req, maxBodySize, strategy)`, the strategy a numeric code (`BodyReadStrategy = {stream: 1, text: 2, buffered: 3}`) so the per-request check is one integer compare. A declared `content-length` past the limit is refused before a byte is read. The strategy names how the runtime reads fastest, measured on each with a real server (requests per second, 16 concurrent clients, one body per request):

| Runtime, 50 KB body | `text()` | `arrayBuffer()` | stream reader loop |
| --- | --- | --- | --- |
| bun, Bun.serve | 8,190 | 4,942 | 1,063 |
| workerd, Miniflare | 1,600 | 1,573 | 1,159 |
| undici, node Request (micro bench, ops/s) | 11,011 | 7,304 | 16,891 |

- `stream` (vercel, a node Request): pull the stream, count bytes, cancel past the limit, decode ONCE at the end with a module-level `TextDecoder` (a non-streaming decode keeps no state, so sharing it is safe; several chunks are joined into one buffer first so a character split across chunks is never decoded in halves). Under undici `text()` is slower than the stream at every size.
- `text` (cloudflare): `req.text()` when a `content-length` is declared (the runtime delivers exactly that many bytes, pinned by a raw-socket test against Miniflare's listener), the stream otherwise, so a chunked upload can still be cancelled mid-flight.
- `buffered` (bun): `req.text()` with a `content-length`, `req.arrayBuffer()` plus a byte check without one, never the stream reader, which is over ten times slower on bun. Bun buffers the body natively before the handler runs, so its server-wide `maxRequestBodySize` (the largest route limit) is the one true mid-flight guard; a smaller route limit refuses the buffered body. `connection: close` stays on the 413.

Node keeps its chunk loop and passes the running total to `Buffer.concat`. uws keeps `collectBody`; the single-read window is decoded to a string inside the native callback (the view over the window is free, the decode is the one copy) and a body-less request skips the view and the decode altogether.

### A not-found chain never reads the body, global middleFns still run

- `MION_ROUTES.batchNotFound` (`mion@batchNotFound`) is a new internal route next to `notFound` that throws the existing `batch-unknown-id` fatal. `getBatchExecutionChain` answers `undefined` for an unknown id and `createCallContext` resolves that chain, exactly as an unknown path resolves the `notFound` one.
- `MethodsExecutionChain.readsBody` is false for those two chains only, surfaced as `CallContext.readsBody`. Every adapter skips the read when it is false: node dispatches before any data listener and lets node discard what the client still sends once the response ends (the 404 goes out before the body finishes, and the same connection serves the next request); uws registers a no-op `onData` so the body is consumed and dropped, never assembled; bun, cloudflare and vercel leave `req.body` untouched. The router's `deserializeRequestBody` returns early too, so a caller that hands a body anyway (aws, gcloud, `dispatchRoute`) gets the same answer.
- `addStartMiddleFns` / `addEndMiddleFns` middleFns and every `alwaysRun` one run for both not-found chains, the way Hapi's and Elysia's `onRequest` do. Route-level middleFns never ran on a 404 and still do not.
- Wire shape: a path 404 is unchanged (`@thrownErrors['mion@notFound']`, `x-rpc-error: route-not-found`). A batch 404 moved from a bare fatal response under `mion@platformError` to the chain's shape under `mion@batchNotFound`, same status and header; the client reads `@thrownErrors` generically, its unknown-id test passes untouched.

### Benchmarks

`aggregate --compare <before> <after>` (`container/mion-bench/aggregate.mjs`, `pnpm miondevx bench servers aggregate --compare a b`) prints the change per lane and suite between two results dirs, and `sweep <app>` runs the payload sizes for one lane. Before is commit `09ab96f` in a separate worktree, after is this branch, full duration, same machine, back to back.

**Server lanes** (`container/mion-bench`, wrk, 100 connections, 20 s measured after 5 s warm-up). Requests per second before, after, and the change; anything under the 10% tolerance the bench records between runs of identical code is noise.

| Lane | Suite | Before | After | Δ req/s | Δ latency |
| --- | --- | --- | --- | --- | --- |
| mion | hello-world (GET) | 16033.4 | 16468.8 | +2.7% | -1.5% |
| mion | light (100 B POST) | 11469.2 | 11261.5 | -1.8% | -1.4% |
| mion | heavy (1 KB POST) | 9096.3 | 9712.1 | +6.8% | -5.6% |
| mion | 1 KB | 8613.5 | 9302.2 | +8.0% | -7.9% |
| mion | 50 KB | 3320.7 | 3331.6 | +0.3% | +1.2% |
| mion | 500 KB | 465.5 | 487.7 | +4.8% | -5.1% |
| mion | 4 MB | 42.9 | 43.1 | +0.4% | -6.2% |
| mion.uws | hello-world (GET) | 28696.8 | 31901.4 | +11.2% | -10.0% |
| mion.uws | light (100 B POST) | 20647.9 | 20906.1 | +1.3% | -1.2% |
| mion.uws | heavy (1 KB POST) | 15101.5 | 14444.5 | -4.4% | +4.5% |
| mion.uws | 1 KB | 15226.9 | 14759.8 | -3.1% | +3.2% |
| mion.uws | 50 KB | 4627.3 | 4549.3 | -1.7% | +1.7% |
| mion.uws | 500 KB | 712.1 | 703.1 | -1.3% | +1.5% |
| mion.uws | 4 MB | 65.9 | 64.2 | -2.5% | +1.6% |
| mion.bun | hello-world (GET) | 19016.1 | 19920.9 | +4.8% | -4.5% |
| mion.bun | light (100 B POST) | 4018.7 | 14311.3 | +256.1% | -71.9% |
| mion.bun | heavy (1 KB POST) | 3942.9 | 10951.9 | +177.8% | -64.0% |
| mion.bun | 1 KB | 3582.5 | 10929.5 | +205.1% | -67.2% |
| mion.bun | 50 KB | 1900.5 | 3130.4 | +64.7% | -39.3% |
| mion.bun | 500 KB | 380.4 | 562.8 | +48.0% | -32.4% |
| mion.bun | 4 MB | 45.4 | 49.9 | +10.0% | -8.7% |

Bun is the lane the reader was slow on: its stream reader is the slow path, and `text()` (its native buffered fast path) took every POST suite from about 4,000 to 11,000 to 14,000 req/s and cut latency by two thirds. Node and uws sit inside the tolerance; uws gained on the GET lane from skipping the empty-body decode.

**Cloudflare handler under workerd** (`cloudflareHandler.bench.ts`, Miniflare in process, sequential dispatches per second):

| Case | Before | After |
| --- | --- | --- |
| POST 100 B | 426 | 455 |
| POST 1 KB | 490 | 555 |
| POST 50 KB | 329 | 371 |
| GET, no body | 693 | 674 |
| POST to an unknown path, 1 KB body | 535 | 590 |

**The reader itself under undici** (`bodyReader.bench.ts`, ops per second, the first shipped reader as baseline against the strategy a node runtime uses, `stream`): 100 B 81,718 to 102,622; 1 KB 68,742 to 78,089; 50 KB 17,509 to 18,029; a chunked 1 KB body in four pieces 42,236 to 34,665 (rare on the wire, every fetch client sends a content-length for a string body); no body 372,601 to 424,011.

`packages/router/src/lib/bodyReader.bench.ts` compares the first shipped reader (kept in the file as `baseline`) with the three strategies under undici; `packages/platform-cloudflare/src/cloudflareHandler.bench.ts` drives the prebuilt test server under workerd through Miniflare.

## Tests

- `packages/router/src/lib/bodyReader.spec.ts`: every strategy against the header path, the chunked path, the cancel with a pull counter (stream strategies), a multi-byte character split across chunks, byte-counted limits, empty and missing bodies.
- `packages/router/src/notFound.spec.ts`: an unknown path and an unknown batch id never parse `'{not json'`, global start and end middleFns run for both, a route-level one does not, `readsBody` is false for exactly the two not-found chains. `batches.spec.ts` and `security.spec.ts` unknown-id blocks now read the 404 off the chain (the junk id and never-echoed checks stay).
- Adapters: node answers the 404 before a 1000-byte body finishes and serves a second request on the same socket; uws answers a 404 with a 600 KB body and keeps serving; bun answers a 404 and keeps serving; cloudflare and vercel answer with the stream never consumed. The `content-length` bound of the native text path is pinned on bun and on workerd (junk after the declared bytes never reaches the body) and on the vercel dev server (a second pipelined request follows the body).

## Docs

Security page (route lookup first in the table, unknown paths never read the body, how each platform stops a body), a new "Unknown Paths" section on the middleFns page with a compiled example, the batch client page, and one line each on the bun, cloudflare and vercel pages.

## Out of scope

- A cloudflare or vercel lane in `container/mion-bench`.
- Any change to derived limits or caps, or to how a known batch id resolves.
- AWS `isBase64Encoded` bodies and `getRouteExecutableFromPath` dead code in the router (surfaced during research; handled as separate findings, not here).
