# Buffer-pooling review findings (routesFlow never pools, dead quantile, dual-load-unsafe state)

**Status:** todo — found by a high-effort review run over PR #137's branch, which used a stale
`origin/master` and so also covered `b3e585c` ("mion owns buffer sizing, seeded by the compile-time
type estimate"). **None of these files are in PR #137's diff** (`git diff --name-only
origin/master...HEAD | grep -c core/src/binary` → 0); they are already on master. Filed rather than
folded in, because widening a devtools/packaging PR to cover buffer-pool internals would be wrong.
**Created:** 2026-08-21

## 1. routesFlow never pools and never learns — `packages/core/src/binary/bodySerializer.ts:113`

The routesFlow path reads size stats under **bare route ids** (`workflowRouteIds`, e.g.
`getCustomerById`), but `recordSize` only ever writes under `context.path` (`/getCustomerById`). The two
key spaces never intersect, so for every routesFlow request:

- `observationCount()` is permanently 0, so the pooled path is never taken;
- `predictSize()` always falls back instead of using learned sizes;
- the escalation at line 154 writes a key the workflow branch never reads.

A feature that silently does nothing. Highest severity here and worth its own PR promptly. Fixing it
needs a decision on which key space wins — normalising route ids to paths at record time, or reading
under both — plus a test that asserts a second routesFlow request actually pools.

## 2. `quantile` is inert on the pooled path — `packages/core/src/binary/sizeStats.ts:100`

`floorAtMax` computes `Math.max(at, sorted[last])`, which is always `sorted[last]`. So the `quantile`
argument does nothing, `POOLED_QUANTILE = 0.99` is dead config, and `sizeStats.spec.ts:31` — which
claims to cover it — would pass with quantile 0. Either honour the quantile or delete the parameter and
the constant; do not leave a knob that reads as tuned.

## 3. Pool singletons are not dual-load safe — `packages/core/src/binary/bufferPool.ts:57`

The pool, sizeStats and strategyStats singletons are plain module state, unlike every other
cross-cutting singleton in core, which goes through `getOrCreateGlobal`
(`packages/core/src/utils.ts:11`). This repo has since documented a real dual-load of `@mionjs/core` in
a packaged consumer ([virtual-module-retired-and-dual-core-load.md](../done/virtual-module-retired-and-dual-core-load.md)).
Under one, `configureBufferPool` and `serializeBinaryBody` land on different instances and pooling is
silently off — the configuration appears to apply and does nothing.

## 4. Any RangeError is treated as a buffer miss — `packages/core/src/binary/bodySerializer.ts:215`

`isCapacityOverflow` treats every `RangeError` as capacity overflow. A RangeError raised inside a
compiled `toBinary` (e.g. `setBigInt64` on an out-of-range value) then costs a wasted re-encode, a
false `retries` bump, and — worse — records a fabricated size class into that route's ring, inflating
predictions for the next 64 requests. Narrow the detection to the actual overflow signal.

## 5. `predictSize` sorts the ring on every serialization — `packages/core/src/binary/sizeStats.ts:98`

It copies and sorts a 64-entry ring per call: one allocation plus O(n log n) on every response, and N
times per routesFlow. That is the hot path of a change whose stated purpose was removing per-request
allocation. Keep the ring sorted on insert, or track the needed order statistic incrementally.

## 6. Reconfiguring `minClassBytes` orphans held buffers — `packages/core/src/binary/bufferPool.ts:64`

Changing `minClassBytes` while the pool is enabled leaves already-held buffers filed under the old
class key while still counting them in `bytesHeld`, so `maxTotalBytes` shrinks permanently. Either
drain on reconfigure or re-file the existing buffers.

## Cleared during the same review (recorded so nobody re-checks)

- Pooled-buffer overflow detection is sound: upstream's non-growing serializer has no bounds checks and
  `writeVarint` drops out-of-range byte writes, but `index` still advances past `byteLength`, so
  `getBufferView()` inside `finish` throws `RangeError` and the retry fires. No silent payload corruption.
- Buffer release lifetimes are correct across adapters — node defers to `finish`/`close`, bun/cloudflare/
  vercel release after `new Response(BufferSource)` (which copies per Fetch spec), gcloud copies via
  `Buffer.from`, aws throws for binary. `releaseCallContext` allocates a fresh response object rather
  than mutating, so a pooled context cannot re-point a live adapter's `releaseBinBuffer` at another
  request's lease.
- `sizeClassFor`'s `2 ** Math.ceil(Math.log2(n))` is exact for all powers of two 2⁰–2⁴⁰.
