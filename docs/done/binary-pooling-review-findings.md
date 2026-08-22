# Buffer-pooling review findings: per-method sizing + a measure pass for volatile payloads

**Status:** done — shipped on `claude/binary-pooling-review-uqdqh3`
**Type:** fix (6 findings) + redesign (buffer sizing model)
**Created:** 2026-08-21 · **Completed:** 2026-08-22

Filed from a high-effort review over PR #137's branch, which used a stale `origin/master` and so also
covered `b3e585c` ("mion owns buffer sizing, seeded by the compile-time type estimate"). None of the
findings were in that PR's diff; they were already on master, and are fixed here.

The headline finding turned into a redesign of how a binary buffer is sized, because the fix for it
made the old model's real defect visible: it was not missing its predictions, it was **over-allocating
by 24-44x**.

## The model now

**One buffer per request. Sized per METHOD. Measured exactly when the size window is volatile.**

- Sizing is keyed by method id and direction, never by request path. A routesFlow request merges
  several routes into ONE envelope; the combination is usually new even when every member route is
  well observed, so only per-method statistics can size it — by summing the parts.
- Each method's real byte span is recorded inline as the envelope is written, so a routesFlow
  response teaches every route it carried, not just the combination it happened to be.
- Before writing, the plan pass compares the TYPICAL envelope (per-method medians) with the
  WORST-CASE one (per-method maxima). If both land in the same pool size class the statistics are
  trusted; if they diverge — or there is no history yet — the size comes from a MEASURE PASS that
  runs the same emitted `toBinary` against a no-op sink, so it is exact.
- A measured size cannot be too small, so a cold route pools from its first request. The warm-up gate
  now only decides whether the measure pass can be SKIPPED.

## Measured

`packages/router/src/routes/routesFlowBuffer.bench.ts`
(`pnpm exec vitest bench --project router routesFlowBuffer`), n=2000 per profile. `bufferBytes ÷
payloadBytes` is what the pool has to carry per byte actually sent.

**A: routesFlow, membership varies (2-4 routes), right-skewed sizes**

| strategy | allocations | peak KB/req | buffer ÷ payload | copied KB | misses |
| --- | --- | --- | --- | --- | --- |
| predicted only (before) | 5 | 80 | **24.6x** | 0 | 3 |
| per-route buffers + merge | 19 | 131 | 28.5x | 1327 | 7 |
| measured only | 5 | 32 | 2.6x | 0 | 0 |
| **shipped (hybrid)** | 5 | **32** | **2.6x** | 0 | **0** |

**B: routesFlow, fixed membership, one route swinging 100x**

| strategy | allocations | peak KB/req | buffer ÷ payload | copied KB | misses |
| --- | --- | --- | --- | --- | --- |
| predicted only (before) | 4 | 171 | **44.4x** | 0 | 2 |
| per-route buffers + merge | 11 | 237 | 47.0x | 4316 | 2 |
| **shipped (hybrid)** | 3 | **64** | **1.8x** | 0 | 1 |

**Throughput** (200 responses per op): on STEADY traffic the hybrid never measures and beats
always-measuring (2440 vs 2304 hz). On volatile traffic it costs ~25-30% against always-predicting,
which is the price of the memory column above.

## Two structural questions this answered

**Should each route own a buffer, merged on the way out?** No — measured worse on every axis,
including profile B, which was built to favour it: 3.8x the allocations, 1.6x the peak per in-flight
request, an extra memcpy of 100% of the payload, more retained pool memory (parts scatter across more
classes), and 10% slower. The reason is the pool's minimum class: every part rounds up to 1 KiB, so N
routes cost N KiB before the merge buffer exists. Per-route sizing independence buys nothing the
sum-of-parts does not already have.

**Can a routesFlow envelope be sized at all, when its composition varies?** Yes, and two ways. The
composition is KNOWN before serializing (the merged chain is built first), so nothing has to predict
*which* routes — only each route's own size, the same problem as a single route, and a sum of maxima
is conservative by construction. Measured miss rate for the pure statistical path: 3/2000 and 2/2000.
And where that is not good enough, the measure pass gives the exact count with no statistics at all.

## Findings, and what shipped for each

| | finding | resolution |
| --- | --- | --- |
| 1 | routesFlow never pooled and never learned — stats were written under `context.path` but read under bare route ids | fixed — sizing is per METHOD, recorded from the bytes each method actually wrote; the `workflowRouteIds` parameter is gone rather than repaired |
| 2 | `quantile` was inert on the pooled path (`floorAtMax` always returned the window max), so `POOLED_QUANTILE = 0.99` was dead config | fixed — `floorAtMax` deleted; quantile 1 IS the max, so the constant now says what it does |
| 3 | pool / sizeStats / strategyStats were plain module state, unlike every other cross-cutting singleton in core | fixed — all three go through `getOrCreateGlobal`, so a dual load cannot leave `configureBufferPool` applying to a different instance than the serializer reads |
| 4 | any `RangeError` was treated as a buffer miss, costing a wasted re-encode and recording a fabricated size class | fixed — nothing is classified any more. A pooled attempt that fails for ANY reason returns its buffer and re-encodes on the growing reference path, whose failure is the real one. Silent overflow (the varint writer drops out-of-range bytes while the cursor advances) is caught precisely by `index > byteLength`. The fabricated escalation is deleted: the failed attempt already observed real byte counts |
| 5 | `predictSize` copied and sorted a 64-entry ring on every serialization | fixed — each key keeps an ascending view maintained on insert (binary search + `copyWithin`); reading a quantile is one indexed read |
| 6 | reconfiguring `minClassBytes` orphaned held buffers under a stale class key while still counting them in `bytesHeld` | fixed — `configureBufferPool` drains when class boundaries move, and `returnToPool` refuses a buffer whose length is no longer its class |

## Found along the way

- **Request and response sizes shared one key space.** Pre-existing: the client records *param* sizes
  and the server records *return* sizes under the same key, so a mion client inside a mion server
  mixed two unrelated distributions. Fixed — `sizeStats` keeps one map per direction.
- **A growable pooled buffer is a trap.** Installing mion's own `ensureCapacity` so a pooled buffer
  grows off itself looks like it removes the re-encode path entirely. It does not: upstream reserves
  the WORST-CASE UTF-8 size for an uncached string (`MAX_VARINT + charLength * 3`), so a 50 KB string
  reserves 150 KB and grows off a 64 KiB class its real bytes fit in three times over — on every
  request. Reverted; the reason is a comment on `createPooledDataViewSerializer` so nobody retries it.
- **A shorter size window is worse, not cheaper.** After a spike, the straddle gate keeps measuring
  until that observation ages out of the ring, which reads like wasted CPU — so shortening the window
  (making the worst case forget sooner) looks like a free win. Measured over the same two profiles,
  it loses on every axis, memory included:

  | ringSize | A misses | A buffer÷payload | B misses | B buffer÷payload | B peak/req |
  | --- | --- | --- | --- | --- | --- |
  | 8 | 62 | 2.8x | 82 | 3.0x | 175 KB |
  | 16 | 29 | 2.6x | 82 | 3.0x | 175 KB |
  | 32 | 10 | 2.6x | 1 | 1.8x | 64 KB |
  | **64 (default)** | **0** | **2.6x** | **1** | **1.8x** | **64 KB** |

  Forgetting a spike does not save the measure pass, it converts it into a RE-ENCODE: the gate stops
  straddling, the cheap predicted buffer is used, it misses, and the retry runs on the growing
  adaptive path — which allocates and grows, leaving a bigger buffer behind than the exact one would
  have been. A measure pass is one traversal; a miss is a whole second encode plus that buffer. The
  sweep lives in `routesFlowBuffer.bench.ts` so the trade stays visible; `ringSize` remains tunable
  through `configureSizeStats` for a workload that disagrees.

- **`serializeBinaryBody` walks the execution chain more times than it needs** (plan pass + write
  pass, with `willSerialize` evaluated twice per method). Worth ~9% on tiny steady payloads against a
  hand-rolled single pass. Not fixed here: collapsing it needs a per-request writers array, which is
  the allocation this whole lane exists to avoid. See
  [serialize-chain-single-pass.md](../todos/serialize-chain-single-pass.md).
- **mion no longer exposes upstream's serialization config.** `setSerializationOptions` was removed as
  unused in `b3e585c` (E7 of the redesign record). `defaultBufferSize` / `sizeMultiplier` are indeed
  inert for mion — it always passes an explicit size — but `maxStrCacheLength` / `maxCacheSize` still
  govern the string bytes cache, and through it whether a string write reserves exactly or 3x. FIXED
  in the same PR: they are inherited by the single options object, see
  [binary-options-single-object.md](binary-options-single-object.md).

## Cleared during the same review (recorded so nobody re-checks)

- Pooled-buffer overflow detection is sound: upstream's non-growing serializer has no bounds checks and
  `writeVarint` drops out-of-range byte writes, but `index` still advances past `byteLength`, so
  `getBufferView()` throws `RangeError` and the fallback fires. No silent payload corruption.
- Buffer release lifetimes are correct across adapters — node defers to `finish`/`close`, bun/cloudflare/
  vercel release after `new Response(BufferSource)` (which copies per Fetch spec), gcloud copies via
  `Buffer.from`, aws throws for binary. `releaseCallContext` allocates a fresh response object rather
  than mutating, so a pooled context cannot re-point a live adapter's `releaseBinBuffer` at another
  request's lease.
- `sizeClassFor`'s `2 ** Math.ceil(Math.log2(n))` is exact for all powers of two 2⁰–2⁴⁰.

## Tests

- `packages/router/src/routes/measurePass.spec.ts` — TRIPWIRE. The measure pass reassembles what
  upstream builds internally for `sizeStrategy: 'precalculate'` and does not export, so it pins
  measured == written on real compiled encoders across every LEB128 width boundary, multi-byte and
  surrogate-pair strings, collections, optionals, unions and nested graphs, and asserts it allocates
  nothing.
- `packages/router/src/routes/binaryPooled.spec.ts` — a cold route pools by measuring; a steady window
  stops measuring; a first jump costs exactly one miss and every request after it is measured; a
  volatile route round-trips indefinitely without a miss; a routesFlow envelope pools from its members'
  history and teaches every route it carried; and a value that CHANGES between the measure pass and the
  write (a getter returning different bytes twice) is abandoned rather than truncated.
- `packages/core/src/binary/sizeStats.spec.ts` — the maintained sorted view is cross-checked against a
  naive sort over 200 randomized inserts at five quantiles, plus the direction split and the quantile.

## Breaking changes

- `serializeBinaryBody(path, chain, body, isResponse)` — the trailing `workflowRouteIds` parameter is
  removed; a merged chain needs no special casing.
- `recordSize` / `observationCount` / `predictSize` take the direction (`isResponse`) explicitly, and
  `predictSize` lost its `floorAtMax` flag (pass quantile 1).
- `CallContext.routesFlowRouteIds` is KEPT, but is no longer used by mion — it is consumer-facing
  information now (logging, metrics, middleFns that branch on the flow).
