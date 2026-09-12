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

### The route is resolved before the body, the context built after it

Reading against the route's own limit needs the route before the body, but NOT the context. `resolveRequest(path, urlQuery, rawRequest)` answers the chain, its `maxBodySize` and `readsBody`, and allocates nothing else; `createContextFromResolved(resolved, reqHeaders, respHeaders, rawBody, bodyType)` builds the context once the body is in hand, with the body already in it. `createCallContext` is now the two together, for a caller that already has the body (aws, gcloud, `dispatchRoute`, tests).

The order matters at large bodies. A context built first survives the whole read, is promoted to the old heap, and the body string assigned into it afterwards is promoted with it, so bodies that should have died in the cheap half of the garbage collector are collected by the expensive one. Measured on the 4 MB payload lane on node: 47.1 to 42.5 req/s and 329 to 375 MB with the context built first, back to 46.5 req/s and 349 MB with it built after. Node, uws, bun, cloudflare and vercel all resolve first and build after.

### A not-found chain never reads the body, global middleFns still run

- `MION_ROUTES.batchNotFound` (`mion@batchNotFound`) is a new internal route next to `notFound` that throws the existing `batch-unknown-id` fatal. `getBatchExecutionChain` answers `undefined` for an unknown id and the resolve step picks that chain, exactly as an unknown path picks the `notFound` one.
- `MethodsExecutionChain.readsBody` is false for those two chains only, surfaced as `CallContext.readsBody`. Every adapter skips the read when it is false: node dispatches before any data listener and lets node discard what the client still sends once the response ends (the 404 goes out before the body finishes, and the same connection serves the next request); uws registers a no-op `onData` so the body is consumed and dropped, never assembled; bun, cloudflare and vercel leave `req.body` untouched. The router's `deserializeRequestBody` returns early too, so a caller that hands a body anyway (aws, gcloud, `dispatchRoute`) gets the same answer.
- `addStartMiddleFns` / `addEndMiddleFns` middleFns and every `alwaysRun` one run for both not-found chains, the way Hapi's and Elysia's `onRequest` do. Route-level middleFns never ran on a 404 and still do not.
- Wire shape: a path 404 is unchanged (`@thrownErrors['mion@notFound']`, `x-rpc-error: route-not-found`). A batch 404 moved from a bare fatal response under `mion@platformError` to the chain's shape under `mion@batchNotFound`, same status and header; the client reads `@thrownErrors` generically, its unknown-id test passes untouched.

### Benchmarks

`aggregate --compare <before> <after>` (`container/mion-bench/aggregate.mjs`, `pnpm miondevx bench servers aggregate --compare a b`) prints the change per lane and suite between two results dirs, and `sweep <app>` runs the payload sizes for one lane. Before is the branch point in a separate worktree, after is this branch, full duration, same machine.

**Server lanes** (`container/mion-bench`, wrk, 100 connections, 20 s measured after 5 s warm-up). Requests per second before, after, and the change; anything under the 10% tolerance the bench records between runs of identical code is noise.

| Lane | Suite | Before | After | Δ req/s |
| --- | --- | --- | --- | --- |
| mion | hello-world (GET) | 15269.8 | 15418.9 | +1.0% |
| mion | light (100 B POST) | 10977.6 | 11653.1 | +6.2% |
| mion | heavy (1 KB POST) | 9360.7 | 9010.9 | -3.7% |
| mion | 1 KB | 9310.2 | 9404.8 | +1.0% |
| mion | 50 KB | 3259.7 | 3215.5 | -1.4% |
| mion | 500 KB | 483.2 | 459.1 | -5.0% |
| mion | 4 MB | 47.1 | 46.5 | -1.2% |
| mion.uws | hello-world (GET) | 29298.3 | 29563.6 | +0.9% |
| mion.uws | light (100 B POST) | 21173.8 | 21311.1 | +0.6% |
| mion.uws | heavy (1 KB POST) | 14671.8 | 14811.5 | +1.0% |
| mion.uws | 1 KB | 14910.6 | 14810.3 | -0.7% |
| mion.uws | 50 KB | 4505.3 | 4542.1 | +0.8% |
| mion.uws | 500 KB | 737.4 | 731.8 | -0.8% |
| mion.uws | 4 MB | 64.9 | 65.4 | +0.8% |
| mion.bun | hello-world (GET) | 20327.9 | 20203.8 | -0.6% |
| mion.bun | light (100 B POST) | 14046.4 | 15034.2 | +7.0% |
| mion.bun | heavy (1 KB POST) | 11427.2 | 11601.4 | +1.5% |
| mion.bun | 1 KB | 10965.4 | 11228.3 | +2.4% |
| mion.bun | 50 KB | 3261.4 | 3248.8 | -0.4% |
| mion.bun | 500 KB | 570.3 | 562.3 | -1.4% |
| mion.bun | 4 MB | 49.8 | 49.5 | -0.8% |

Every lane sits inside the tolerance: the per-route limits this branch added cost nothing on the wire. What the reader work bought shows against the first version of it instead, the one that read every body through a stream loop with a `TextDecoder` per request. Against that commit bun runs +256% on the 100 B POST suite (4,019 to 14,311 req/s), +178% on the 1 KB one, +205% at 1 KB payloads, +65% at 50 KB and +48% at 500 KB, with latency down about two thirds, while node and uws stay inside the tolerance.

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
- `packages/router/src/resolveRequest.spec.ts`: resolving answers the chain and the limit and does NOT run the shared-data factory, building from the resolved request does, and an unknown path resolves to the not-found chain with `readsBody` false. `packages/platform-node/src/contextTiming.spec.ts` pins the same order over a socket: the head and half the body sit on the server for 150 ms and no context is built until the body ends.
- Adapters: node answers the 404 before a 1000-byte body finishes and serves a second request on the same socket; uws answers a 404 with a 600 KB body and keeps serving; bun answers a 404 and keeps serving; cloudflare and vercel answer with the stream never consumed. The `content-length` bound of the native text path is pinned on bun and on workerd (junk after the declared bytes never reaches the body) and on the vercel dev server (a second pipelined request follows the body).

## Docs

Security page (route lookup first in the table, unknown paths never read the body, how each platform stops a body), a new "Unknown Paths" section on the middleFns page with a compiled example, the batch client page, and one line each on the bun, cloudflare and vercel pages.

## Out of scope

- A cloudflare or vercel lane in `container/mion-bench`.
- Any change to derived limits or caps, or to how a known batch id resolves.
- AWS `isBase64Encoded` bodies and `getRouteExecutableFromPath` dead code in the router (surfaced during research; handled as separate findings, not here).
