---
type: fix
spec: guidelines
status: ready
created: 2026-10-18
---

# mion on node answers hello-world about 7% slower after the response headers rework

## Intent

The response headers rework (one `responseHeaders` router option, pools of unused response headers, `content-type`
moved to `MionResponse.contentType`) made mion.bun about 18% faster and mion.uws about 8% faster, but the
`mion` lane (node, plain JSON) dropped about 7% against main, and nothing in the code explains it. Find the cause
and fix it, or prove it is not this code.

Measured with `pnpm miondevx bench servers repeat <lane> hello-world --runs 2`, main and the branch back to back
in one session (Claude cloud host, 2026-10-18), req/s:

| Lane | main | branch |
| --- | --- | --- |
| mion (node) | 40,269 / 40,752 | 36,902 / 38,478 |
| mion (node), extra rounds | 39,095-41,476 | 35,485-38,529 |
| mion.compact (node) | 38,441 / 39,753 | 37,733 / 40,501 |
| mion.bun | 56,304 / 61,002 | 68,289 / 70,512 |
| mion.uws | 64,421 / 68,151 | 71,601 / 72,155 |

Earlier comparisons on an older main (2026-10-17) showed the node lane level (33.8k-37.8k vs 35.3k-38.4k, and
12.8k-15.2k vs 13.9k-15.1k on a slower host), so it either appeared with a later change or only shows when the
host is fast enough for the server to be the bottleneck.

**The main clue:** mion.compact is level. It runs the same node adapter, the same `headersFromServerResponse`,
the same reply and the same serializer route; the only difference is `createMionRouter({parser: 'compact'})`
(compare `container/mion-bench/apps/mion/routes.ts` and `routes-compact.ts`). A cost in the header code should
hit both lanes.

## What changed on node's request path

Diff of the branch against main, node only (`packages/platform-node`, `packages/rpc-router/src`):

1. `platform-node/src/mionHttp.ts`: `httpResponse.setHeader('server', '@mionjs')` is gone; `server` now comes
   from `getResponseDefaults()`. The reply adds `httpResp.setHeader('content-type', mionResp.contentType)` after
   `content-length`.
2. `platform-node/src/headers.ts` `headersFromServerResponse`: loops over `{server: 'mionjs', 'content-type': …}`
   and skips `content-type` (main looped over an empty frozen object).
3. `rpc-router/src/routes/serializer.routes.ts`: `response.contentType = JSON_CONTENT_TYPE` replaces
   `response.headers.set('content-type', …)` (which on node was one `setHeader`).
4. `rpc-router/src/callContext.ts` `createContextFromChain`: the response object literal gains a `contentType`
   property (same in `lib/dispatchError.ts`).
5. `rpc-router/src/lib/headers.ts` `MionHeadersImpl` (node's request headers, via `headersFromRecord`): a class
   field `unused = true`, `this.unused = false` in `set` / `append` / `delete`, `entries()` / `values()` rewritten
   to join list values, the record type widened to `string | string[]`. It now has a subclass,
   `RecordResponseHeaders`, which overrides `append` (node never creates one).
6. `rpc-router/src/router.ts`: `getResponseDefaults()` returns a module variable (was a WeakMap lookup per adapter
   options object).

Measured in isolation (`node` script, best of 7 × 300k): the three header writes on a fresh `ServerResponse` take
351-356 ns on main's sequence and 334-338 ns on the branch's; a request headers object takes 9.3-9.6 ns without
`unused` and 10.1-10.5 ns with it. Neither explains ~700 ns per request.

An in-process A/B (a real node server from source under vitest, one socket sending 200 pipelined `GET /hello`
per batch, CPU time per request from `process.cpuUsage`, main and branch sources swapped six times) put the branch
about 2% slower on average, with pairs swinging ±5% either way: not conclusive.

## Direction

The implementer investigates and plans.

- Reproduce first: interleave main and the branch on the `mion` and `mion.compact` lanes (swap `packages/` to
  `origin/main` with `git checkout origin/main -- packages/`, deleting files the branch added; restore with
  `git checkout HEAD -- packages/` and `git clean -fd packages`), several rounds. Confirm the gap is real and
  that compact stays level.
- Bisect the branch's commits on the `mion` lane once it reproduces; the per-request changes above are spread
  over `perf(router)!: one responseHeaders option and a pool of unused response headers`,
  `fix(platform-node, platform-gcloud): leave content-type to the reply`,
  `refactor(router): response headers pools as module functions, one record headers class` and
  `fix(platform-uws, platform-aws): each set-cookie on its own line over the router's record headers`.
- Profile both builds under load (`--cpu-prof`), and look for deopts or lost inlining in the hot functions
  (`--trace-deopt`, `--trace-opt`): `createContextFromChain`, `MionHeadersImpl` methods (now with a subclass),
  the serializer route, the reply. Since compact is level, look first at what the JSON parser path touches that
  compact does not.
- Keep every behaviour the rework added: `server` replaceable, `content-type` written last by the reply, a raw
  middleware that ends the response never sending the JSON type.

## Done when

- The `mion` lane is level with main within noise over repeated interleaved rounds, with mion.compact, mion.bun
  and mion.uws unchanged; or the cause is shown to be outside this code, with the measurements that show it.
- A fix in code ships with its before/after numbers.
