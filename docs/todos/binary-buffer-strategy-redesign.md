# Binary lane: mion-owned buffer sizing + a pooled strategy

**Status:** todo — ARCHITECTURE AGREED, ready to implement in phases.
**Type:** feature (redesign) + fix
**Spec:** full-plan
**Created:** 2026-07-26 · **Rewritten:** 2026-08-20

Supersedes the original "review buffer sizing, caching and pooling" investigation spec. The
investigation is DONE — findings are recorded below as evidence, and the direction was agreed with
the user. What follows is the design and the build order.

## Why

The DataView codec moved to `@ts-runtypes/core` (mion's compiled `toBinary`/`fromBinary` are emitted
against ITS wire protocol, so the serializer objects must come from that package). mion kept only a
thin option surface in `src/binary/dataView.ts`, and the **performance machinery around the buffer
was never re-reviewed on this side**. Today mion takes upstream's defaults wholesale: a flat 16 KiB
cold start, a `mean + 2σ` predictor, one fresh `ArrayBuffer` per response, and no reuse.

The decision: **mion owns buffer strategy.** ts-runtypes stays the wire format and the codec; mion
decides how big the buffer is, where it comes from, and when it goes back. No upstream changes are
requested — the design is built strictly on the API `@ts-runtypes/core` 0.12.0 already exports.

## What upstream gives us (verified against @ts-runtypes/core 0.12.0)

Read from the published tarball's `src/runtypes/dataView.ts` + `src/createRTFBinary.ts`. **Note the
original spec was written against 0.11.0 and several of its claims are now stale.**

`createDataViewSerializer(cacheKey, options)` takes `{size?, relatedKeys?, grow?, buffer?,
coldStartSize?}`:

- **`buffer`** — wraps a caller-supplied `ArrayBuffer`. **Growth is forced OFF** for it
  (`new DataViewSerializerImpl(cacheKey, byteLength, false, buffer)`), because upstream cannot
  resize a caller's buffer without breaking their reference. Overflow therefore **throws**
  (`RangeError` out of `DataView`/`Uint8Array.set`, or the `encodeInto` truncation guard). This is
  the pooling hook, and the throw-on-overflow contract is exactly what mion must manage.
- **`size`** — explicit allocation size; bypasses upstream prediction entirely.
- **`grow`** — defaults `true`. `ensureCapacity` is a shared `growEnsureCapacity` (kept monomorphic);
  it grows geometrically but at least to the exact deficit, and `resize()` **preserves the written
  prefix**, so an underestimate costs one copy, never a re-encode.
- **`coldStartSize`** — a compile-time per-type estimate, used only when the key has no history.
- **`relatedKeys`** — sums predicted sizes across keys (what mion's routesFlow maps onto).
- **`getBufferView()`** — zero-copy `Uint8Array(buffer, 0, index)`. **`getBuffer()` is a COPY**
  (`buffer.slice(0, index)`).
- **`markAsEnded()`** — sets `hasEnded` and calls `recordObservedSize(cacheKey, index)`.
  **Not idempotent**: every call re-records.
- **`setSerializationOptions`** — patches a module-global `opts`, including the `sizeHistory` and
  `stringBytesCache` Maps.

What upstream does **not** have: **any buffer pooling.** Every serializer does `new ArrayBuffer(size)`,
plus another allocation per growth step, all left to the GC.

Relevant 0.12.0 additions the original spec predates: the `sizeStrategy` model
(`dynamic` / `precalculate` / `initialSize` / `intoBuffer`), `createBinarySizerFn()` (exact on-wire
size with no output allocation), and the **compile-time per-type size estimate** (see below). mion
does not use `createBinaryEncoderFn` at all (it writes its own multi-method envelope), so it gets
none of these for free.

### The compile-time per-type estimate — reachable, and worth reaching for

Upstream's `dynamic` strategy seeds a cold buffer from a per-type estimate the plugin bakes into the
`tb` entry tuple, read back by `binarySizeEstimateFromTuple()`. Neither that helper nor the estimate
is exported: `binarySizeEstimateFromTuple` lives in the un-exported `runtypes/entryTuple` module, and
`registerTypeFnTuple` decodes the value into its `record` but **omits it from the cache entry it
builds** — so it is NOT readable from `getRT(hash)`.

It *is* readable from the raw injected tuple, which **mion already holds**: `buildJitFnsFromMarker`
receives `fns.tb` (`packages/core/src/runtypes/mionAdapter.ts:225`). Probed against real
plugin output, the estimate sits at slot 11 and is per-type and meaningful:

| handler return type | `tb` tuple estimate |
| --- | --- |
| `number` | 8 B (exactly a float64) |
| `Pet {name: string; born: Date}` | 35 B |
| `{id: string; tags: string[]; notes: string; nested: {...}}` | 2798 B |

Every non-`tb` family's tuple is shorter than 12 slots and has nothing at 11, so the read is
identifiable rather than blind: require `familyTag === 'tb'`, `length === 12`, and a finite positive
number at slot 11, else fall back. Today all three of those routes cold-start at a flat 16 KiB —
a **468× over-allocation** for `savePet`.

This is an internal slot, so the coupling is real. It is mitigated exactly the way mion already
mitigates the same class of read in `resolveCompiledPureFn` (which reads the raw `pureFnsCache`
because upstream exposes no API for it): a validated read that degrades to a default, **plus a test
that asserts a real compiled route still yields a plausible estimate** — so if upstream moves the
slot the build fails loudly instead of silently reverting to 16 KiB.

## Evidence — what is wrong today

**E1. Every binary response records its size 2–3×.** `serializeBinaryBody`
(`packages/core/src/binary/bodySerializer.ts:45`) calls `serializer.markAsEnded()`, and then **every**
platform adapter calls it again — `platform-node/src/mionHttp.ts:205-207` and
`platform-gcloud/src/googleCF.ts:123-125` register it on **both** `'finish'` and `'close'`
(so a normal Node response fires it twice more), while bun / vercel / cloudflare call it inline after
constructing the `Response`. The comments give the game away: *"Release buffer when response is
finished"*, *"Bun copies the buffer to the response"* — this is the **vestigial release contract of a
pool that no longer exists**, still wired up to a method that now only records statistics.

The consequence is not cosmetic. Re-recording a value that already equals the running mean adds ~0
to Welford's `m2` while still incrementing `count`, so **variance is diluted toward zero**. Since the
predictor is `mean + 2 × stddev`, a deflated σ means systematically **tighter buffers and more grow
copies** — the mechanism is inverted from its intent.

**E2. A full-payload copy is allocated per response and then ignored.**
`packages/router/src/routes/serializer.routes.ts:126-128` does
`response.rawBody = new Uint8Array(serializer.getBuffer())` — and `getBuffer()` is a `slice`, i.e. a
complete copy of the payload. But **every** platform adapter reads `mionResp.binSerializer!` and calls
`getBufferView()` (the zero-copy view) instead; none reads `rawBody` on the binary path. So the server
pays one extra full-size allocation + memcpy per binary response for a value nothing consumes.
(`rawBody` *is* read by the router's own specs, so it must keep working — as a view.)

**E3. Cold start ignores the per-type estimate, and routesFlow multiplies the miss.** `predictBufferSize` sums
`sizeForKey(k)` over `relatedKeys`, and each cold key falls back to `defaultBufferSize` — and note
`coldStartSize` is **ignored** on the `relatedKeys` path. A 5-route flow cold-starts at 80 KiB.

**E4. `mean + 2σ` is the wrong shape.** It is symmetric; response sizes are right-skewed. Cost is
asymmetric too: an underestimate costs a realloc + copy, an overestimate costs untouched memory.
Compounded by E1's variance deflation.

**E5. `sizeHistory` is module-global, unbounded, un-evictable and process-wide** — no tenant
isolation, and shared across tests so ordering changes predictions.

**E6. The client copies twice.** `packages/client/src/lib/serializer.ts:127` does
`new Uint8Array(buffer)` over an already-`slice`d `getBuffer()`.

**E7. `setSerializationOptions` has zero consumers** anywhere in the monorepo, the website, or the
examples — it maps 4 of upstream's 6 knobs and nothing calls it.

## Architecture

### Principle

mion computes the size and owns the memory; ts-runtypes encodes into it. mion always passes an
explicit `size` or `buffer`, so **upstream's predictor and its module-global `sizeHistory` are
bypassed entirely** — which retires E5 without asking upstream for anything. mion stops calling
upstream `markAsEnded()` (nothing in mion reads `hasEnded` — verified) and records observations into
its own statistics instead, so there is exactly one bookkeeping path.

### Two strategies

**`adaptive` (default, every platform).** mion predicts from its own per-route stats and passes
`{size, grow: true}`. Growth stays armed, so an underestimate costs one in-place grow copy and
**never throws**. This is today's behaviour with mion's sizing substituted for upstream's, plus a
real cold-start size instead of a flat 16 KiB.

**`pooled` (opt-in; node + bun only).** mion acquires an `ArrayBuffer` from a size-class free list,
sized at a high quantile of the route's recent sizes, and passes `{buffer}` — upstream growth is off,
so mion's job is to size such that overflow is rare and to handle it correctly when it happens.
On overflow: catch, **re-encode once** through the `adaptive` path, and escalate that route's size
class so the next request does not repeat it.

**Only warm routes are pooled.** The compile-time estimate is a tight per-type figure (8 B for a
`number`), so pooling a route on its first request would invite an overflow-retry storm. A route
takes the `adaptive` path until it has enough observations to predict a p99 (proposed: 8), then
becomes eligible for the pool. Cold-start retries therefore cannot happen by construction. Steady-state retry rate should trend to ~0; the
benchmark measures whether it does.

### mion-owned size statistics

New `packages/core/src/binary/sizeStats.ts`. Per key: a **bounded ring of the last N observed sizes**
(N = 64) plus count and running max, and a `predict(key, quantile)`.

A bounded ring beats upstream's lifetime Welford on both counts that matter here — it is
**skew-aware** (a real quantile, not `mean + kσ` on an assumed-symmetric distribution) and
**regime-shift responsive** (a payload-size change ages out in N requests instead of being diluted
across all history). That answers E4.

- `adaptive` asks for ~p90 plus a pad; `pooled` asks for ~p99 (floored at the recent max) rounded up
  to a size class.
- **Cold start uses the compile-time estimate, not a flat default**: before a route has observations,
  mion sizes the envelope as the sum over the execution chain of each method's `tb` estimate, plus
  its key string and framing, plus the pad. `RtMethodReflection` carries the per-method estimate,
  read once at reflection-build time. A route with no usable estimate falls back to the configured
  default.
- Keyed by route path. Binary serialization only runs on a **matched** route (unmatched paths error
  out as JSON before reaching it), so the key space is bounded by the route table. A hard cap with
  FILO eviction backstops that invariant anyway, mirroring the existing
  `routesFlowChainCacheSize` idiom.
- routesFlow predicts as the **sum of member-route quantiles** plus one pad — fixing E3.

### The pool

New `packages/core/src/binary/bufferPool.ts`.

- Power-of-two size classes from 1 KiB to a `maxPooledBytes` ceiling; anything above the ceiling is
  allocated directly and never pooled, so one huge response cannot hold megabytes hostage.
- Per-class free-list cap plus a global byte cap; `clear()` for tests and shutdown.
- `stats()` exposes hits / misses / retries / bytes held — the benchmark and any future tuning read
  this rather than guessing.

### Lifetime — the part that has to be right

The buffer escapes into the platform's response object, so "when is it safe to return" is the whole
design, not a detail. `releaseCallContext` is **not** the answer: `dispatch.ts:57-62` runs it in a
`finally` **before** the adapter has written the response — and that file already documents the same
hazard for the response object (*"we must NOT mutate the existing response object because it's
returned to the platform wrapper"*).

So the release point is per-adapter and explicit. `serializeBinaryBody` returns a lease:

```ts
export interface BinaryBodyResult {
    serializer: DataViewSerializer;
    view: Uint8Array;  // zero-copy; valid until release()
    release(): void;   // idempotent: returns the buffer to the pool, records the observed size once
}
```

`response.releaseBinBuffer?: () => void` carries it to the adapter. Each adapter's current
`serializer.markAsEnded()` line becomes `mionResp.releaseBinBuffer?.()` — which simultaneously fixes
E1, since release is idempotent and records exactly once.

Per-adapter contract:

| adapter | write | safe release point | pooling |
| --- | --- | --- | --- |
| node | `httpResp.end(view)` | `'finish'` / `'close'` (hooks already exist) | **yes** |
| bun | `new Response(view)` | immediately after — **only if** Bun copies synchronously | **yes, pending verification** |
| gcloud | `resp.end(Buffer.from(view))` | immediately (`Buffer.from` already copies) | safe, low priority |
| vercel / cloudflare | `new Response(view)` | copy semantics unverified on those runtimes | **no** — forced `adaptive` |
| aws | — | binary responses throw `not yet supported` | n/a |

**Bun's copy semantics are the one load-bearing assumption and must be proven, not assumed** — with a
test that mutates the source buffer after constructing the `Response` and asserts the body is
unchanged. If it fails, bun drops to `adaptive` and the table is corrected.

A lease that is never released is a **safe** failure: the buffer is simply not returned to the free
list and gets GC'd. No corruption, no leak — just a lost reuse.

### Enabling it

One knob on `RouterOptions`, mirroring the existing `maxContextPoolSize` idiom
(`0` = disabled): `binaryBufferPoolSize`. Default `0`. `startNodeServer` / `startBunServer` may
default it on, since they own the release hook.

### Stale bytes — explicit invariant

A pooled buffer carries bytes from whatever response used it last. Exposure is bounded because every
consumer goes through `getBufferView()` (offset 0, length `index`) and `content-length` comes from
`getLength()`. That invariant gets a **regression test**: a large response followed by a small one on
the same pooled buffer must not expose a single trailing byte of the first.

### `setSerializationOptions` — removed

Deleted along with mion's `SerializationOptions` interface (E7: no consumers). mion now decides what
to pass to ts-runtypes per call; upstream's remaining global knobs (`maxStrCacheLength`,
`maxCacheSize`) keep their defaults. This also closes the one deliberate public-API question left
open by [../done/dewrapper-core-ts-runtypes-proxies.md](../done/dewrapper-core-ts-runtypes-proxies.md).

## Build order

Each phase is independently shippable and independently measurable.

**Phase 0 — benchmark first.** `packages/core/src/binary/binary.bench.ts` (vitest bench) plus a
metrics harness reporting **allocations, grow count** (derived honestly: final `buffer.byteLength`
vs. the size requested), **retry count, predicted-vs-actual spread, string-cache hit rate, ns/op** —
over payload profiles: small/uniform, medium, right-skewed with a fat tail, and a routesFlow
multi-route case. **Baseline recorded before any production change.** Without this every later claim
is guesswork.

**Phase 1 — the bugs (no design risk).** E1 (adapters stop calling `markAsEnded`), E2
(`rawBody` = view, not copy), E6 (client uses `getBufferView()`). Re-measure: this alone should
remove one full-payload allocation + memcpy per response and restore the predictor's intended σ.

**Phase 2 — mion-owned sizing.** `sizeStats.ts`; `adaptive` becomes the default path; explicit
`size` on every call; routesFlow sums member quantiles (E3); delete `setSerializationOptions` (E7).

**Phase 3 — the pool.** `bufferPool.ts`, the lease, `binaryBufferPoolSize`, node + bun wiring,
the bun copy-semantics proof, overflow-retry with class escalation, and the stale-bytes test.

**Phase 4 — close out.** Re-run the benchmark, record before/after numbers, `git mv` this spec to
`docs/done/` trimmed to what shipped, and file any genuinely separable remainder as its own todo.

## Tests

- **Sizing** — ring quantiles over a skewed distribution; regime shift ages out within N; cold start
  uses the configured size, not 16 KiB; routesFlow sums members.
- **Pool** — acquire/release round-trips; free-list and byte caps respected; above-ceiling sizes are
  never pooled; `clear()` empties it; double-release is a no-op; an unreleased lease does not corrupt
  the next request.
- **Overflow** — a payload that outgrows its pooled class retries once, produces a byte-identical
  result to the `adaptive` path, and escalates the class; a second failure surfaces as `RpcError`,
  not a raw `RangeError`.
- **Stale bytes** — the invariant above.
- **Lifetime** — node releases on `'finish'` and on `'close'` (aborted connection); bun's copy proof.
- **Round-trip** — the four existing binary specs (`router/src/dispatch.binary.spec.ts`,
  `router/src/routes/serializer.binary.spec.ts`, `client/src/lib/serializer.binary.spec.ts`,
  `platform-bun/src/bunHttp.binary.test.ts`) stay green throughout, unmodified where possible.

## Done when

- Both strategies exist, `adaptive` is the default everywhere, `pooled` is opt-in and wired on
  node + bun with a proven release point per adapter.
- mion owns size statistics; upstream's module-global `sizeHistory` is no longer written to.
- E1–E7 are each fixed or explicitly recorded as won't-fix with a reason.
- Benchmark numbers before/after are in the `done/` record — not adjectives.
- Full suite + lint + format green.

## Decisions (agreed 2026-08-20)

1. **`rawBody` is dropped on the binary path.** Every adapter reads `binSerializer`; the router's own
   specs move to the same accessor. One payload accessor, no aliasing trap, no wasted copy. This is an
   observable contract change and must be called out in the `done/` record.
2. **The pool is ON by default on node + bun** — `startNodeServer` / `startBunServer` default
   `binaryBufferPoolSize`, since they own the release hook. Every other adapter stays `adaptive`.
3. **Ladder and caps are configurable router options**, defaulting to 1 KiB → 1 MiB powers of two,
   32 buffers per class, 64 MiB held globally.
4. **Quantiles: adaptive p90 + 25%; pooled p99 floored at the recent max, + 25%**, rounded up to a
   size class.

## Related

- [../done/dewrapper-core-ts-runtypes-proxies.md](../done/dewrapper-core-ts-runtypes-proxies.md) —
  the de-wrappering, whose last open public-API call (`setSerializationOptions`) this spec resolves
  by deleting it.
