# Binary lane: mion-owned buffer sizing + a pooled strategy

**Status:** done — shipped on `claude/ts-runtypes-migration-pending-ukcdzr`
**Type:** feature (redesign) + fix
**Created:** 2026-07-26 · **Completed:** 2026-08-20

The DataView codec moved to `@ts-runtypes/core` during the migration, but the performance machinery
around the buffer was never re-reviewed on mion's side: mion took upstream's defaults wholesale (a
flat 16 KiB cold start, a `mean + 2σ` predictor, one fresh `ArrayBuffer` per response, no reuse), and
the pre-migration router-based pooling was lost with its release contract left wired to a method that
no longer released anything.

**Outcome: mion owns buffer strategy; ts-runtypes stays the wire format and codec.** No upstream
changes were requested — everything is built on the API `@ts-runtypes/core` 0.12.0 already exports.

## Measured results

Harness: `packages/router/src/routes/binaryBuffer.bench.ts`
(`pnpm exec vitest bench --project router binaryBuffer`).

**Growing ("adaptive") strategy — allocation size:**

| profile | payload mean/p50/p90/p99/max | before | after | over-allocation |
| --- | --- | --- | --- | --- |
| tiny | 17/17/17/17/17 B | 49 KB | 43 KB | 1.5× → **1.3×** |
| small | 35/36/36/36/36 B | 87 KB | 90 KB | 1.3× → 1.3× |
| skewed | 541/87/112/11973/13713 B | 4929 KB | **942 KB** | 9.3× → **1.8×** |

**Pooled strategy — allocation count** (what the pool is actually for):

| profile | requests | allocations | reuses | overflow retries |
| --- | --- | --- | --- | --- |
| tiny | 2000 | **1** | 1999 | 0 |
| small | 2000 | **1** | 1999 | 0 |
| skewed | 1000 | **2** | 998 | 0 |

Plus: one full-payload copy per response removed entirely, and a cold request on the bench route down
from a flat 16 KiB to **80 bytes**.

The skewed row is the headline. `mean + 2σ` assumes a symmetric distribution; response sizes are
right-skewed, so it allocated ~9.3× the bytes actually written **and still missed 4.9% of the time** —
paying for headroom on every request and buying accuracy on none.

## What shipped

### mion-owned sizing (`packages/core/src/binary/sizeStats.ts`)

A bounded ring of the last 64 observed sizes per route, predicting a real quantile: **p90 + 25%** for
the growing strategy, **p99 floored at the recent max + 25%** for the pooled one. Skew-aware, and a
regime shift ages out in one window instead of diluting across all history. Keyed by route path
(bounded by the route table, since binary serialization only runs on a matched route) with a
FILO-evicted cap as a backstop.

### Cold start from the compile-time type estimate

Upstream bakes a per-type estimate into the `tb` entry tuple. It is **not exported**:
`binarySizeEstimateFromTuple` lives in an un-exported module, and `registerTypeFnTuple` decodes the
value but omits it from the cache entry it builds, so `getRT()` cannot see it. mion reads the tuple
slot directly in `readBinarySizeEstimate` — the same guarded-internal-read compromise as
`resolveCompiledPureFn`, validated rather than trusted (`tb` family, expected width, plausible byte
count) and degrading to a default instead of throwing.

**The coupling is deliberate and has a tripwire.** `mionAdapter.spec.ts` asserts a real compiled route
still yields a plausible estimate, because the failure mode otherwise is silent: a moved slot would
quietly revert every cold buffer to the flat fallback with no failing test anywhere.

One trap worth recording: the estimate must count **only the methods that will actually be written**.
Summing the whole execution chain made a cold request allocate **82 KB for a 17-byte payload**,
because a binary route's chain carries the metadata middleFn, whose union return type estimates
~80 KiB but whose value is undefined on every normal request. The skip predicate is now shared by the
write loop and the estimate (`willSerialize`) so the two cannot disagree.

### The pool (`packages/core/src/binary/bufferPool.ts`) and the lease

Power-of-two size classes (1 KiB → 1 MiB by default, 32 per class, 64 MiB total, all configurable).
Anything above the ceiling is served but never retained.

The buffer escapes into the platform's response object, so lifetime was the whole design.
`releaseCallContext` is **not** a usable release point — `dispatch.ts` runs it in a `finally` *before*
the adapter writes the response — so `serializeBinaryBody` returns a lease and each adapter releases
at its own proven-safe point:

| adapter | release point | pooled by default |
| --- | --- | --- |
| node | `'finish'` / `'close'`, once the socket is done with the view | **yes** |
| bun | immediately — Bun copies the bytes synchronously, **proven by test** | **yes** |
| gcloud | immediately — `Buffer.from` already copied | no |
| vercel / cloudflare | immediately | no |

Pooling is enabled per-platform (`binaryBufferPool` on `NodeHttpOptions` / `BunHttpOptions`) rather
than via `RouterOptions`, because the router is initialised separately from the server and only the
platform knows whether its release point is safe.

A pooled buffer cannot grow — upstream refuses to resize a buffer it does not own — so an overflow
throws. mion catches **only** `RangeError`, re-encodes once on a growing buffer, and escalates the
route's size class. A route is not pooled until it has **8 observations**, since the type estimate is
tight (8 bytes for a `number` return) and pooling cold would guarantee a first-request overflow.
Measured retry rate in steady state: **0**.

Two invariants a pool must not get wrong, both pinned by tests: a reused buffer never exposes a
previous response's trailing bytes (every consumer reads `getBufferView()`, bounded by the write
index), and an unreleased lease costs a reuse rather than correctness. `mionHttp.spec.ts` drives 25
concurrent requests against a real node server and asserts both reuse and byte-correct responses.

`getBinaryStrategyStats()` reports pooled/adaptive/retry counts, so the specs assert the overflow path
actually ran rather than passing without exercising it.

## Evidence resolved

| | finding | resolution |
| --- | --- | --- |
| E1 | every response recorded its size 2–3× (adapters called `markAsEnded` as a vestigial "release", deflating σ and *tightening* buffers) | fixed — adapters call `releaseBinBuffer`; the size is recorded once, inline |
| E2 | a full-payload `getBuffer()` copy per response that no adapter read | fixed — `rawBody` is no longer set on the binary path |
| E3 | cold start ignored the type estimate; routesFlow multiplied the miss | fixed — estimate-seeded cold start; routesFlow sums member quantiles |
| E4 | `mean + 2σ` is the wrong shape for skewed sizes | fixed — ring quantiles; 9.3× → 1.8× over-allocation |
| E5 | upstream `sizeHistory` module-global, unbounded, un-evictable | fixed — never written to; mion owns bounded stats |
| E6 | the client copied twice | fixed — `getBufferView()`, zero copies |
| E7 | `setSerializationOptions` had zero consumers | fixed — **removed** (breaking) |

## Breaking changes

- **`setSerializationOptions` / `SerializationOptions` removed.** No consumers existed anywhere in the
  monorepo, website or examples. mion now decides what to pass to ts-runtypes per call.
- **`response.rawBody` is no longer set for binary responses.** The payload is read from
  `binSerializer` (`getBufferView()` / `getLength()`), which is what every adapter already did.
- **`serializeBinaryBody` returns `{serializer, view, release}`** instead of `{serializer, buffer}`.
  Callers wanting an owned copy call `serializer.getBuffer()` explicitly.

## Notes for later

- **vercel / cloudflare could be pooled too.** Per the Fetch spec, `new Response(BufferSource)` copies
  the bytes, so their release is already safe — they are left un-pooled out of conservatism about
  unverified runtimes, not a known hazard. Enabling them is a one-line default change plus a proof
  test like bun's.
- **The cold-start estimate mainly buys serverless.** The bench shows upstream's warm prediction was
  already tight, so the flat 16 KiB was a one-request cost on a long-running server. The estimate
  matters where history never warms.
- `platform-bun`'s own `bun test` suite has pre-existing failures from the incomplete injection lane
  ([../todos/platform-bun-runtypes-lane.md](../todos/platform-bun-runtypes-lane.md)); the copy-proof
  test added here passes.

## Follow-up

- [../todos/drop-binary-estimate-slot-read.md](../todos/drop-binary-estimate-slot-read.md) — retire the
  `tb` tuple-slot read once `@ts-runtypes/core` exposes the estimate on the fn cache entry. Blocked on
  that upstream change; a pure cleanup with no behaviour change, so the lane above is complete without it.

## Related

- [dewrapper-core-ts-runtypes-proxies.md](dewrapper-core-ts-runtypes-proxies.md) — the de-wrappering,
  whose last open public-API call (`setSerializationOptions`) this work resolved by deleting it.
