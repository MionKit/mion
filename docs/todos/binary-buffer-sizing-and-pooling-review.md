# Binary lane: review buffer sizing, caching and pooling after the ts-runtypes move

**Status:** todo — GUIDELINES + investigation. **Discuss findings with the user before ANY
implementation.**
**Created:** 2026-07-26

The DataView codec moved to `@ts-runtypes/core` (mion's compiled `toBinary`/`fromBinary` are
emitted against ITS wire protocol, so the serializer objects must come from that package). mion
now keeps only a thin creation/option surface in `src/binary/dataView.ts`. That move was correct
for the wire format, but the **performance machinery around the buffer** was never re-reviewed
on this side. This spec is the review.

**This is a guideline, not a ready-to-build plan.** The next agent investigates, then presents
findings and open questions to the user and agrees on a direction. No implementation first.

## Current state (verified 2026-07-26 against @ts-runtypes/core 0.11.0)

### What ts-runtypes DOES already have

The recollection that "there is no caching or pool functionality there" is **half right** —
caching and size prediction exist; pooling does not.

- **Per-key size history.** `sizeHistory: Map<string, SizeStats>` with a Welford online
  mean/variance. `sizeForKey` predicts `ceil(mean + sizeMultiplier * stddev)`;
  `markAsEnded()` calls `recordObservedSize(cacheKey, index)` so every completed
  serialization feeds the next prediction. mion passes the route path as `cacheKey`.
- **String bytes cache.** `stringBytesCache: Map<string, Uint8Array>`, bounded by
  `maxStrCacheLength` (strings longer than this are never cached) and `maxCacheSize`.
- **`relatedKeys`.** Sums predicted sizes across several keys — what mion's `workflowRouteIds`
  (routesFlow) maps onto.
- **Escape hatches.** `createDataViewSerializer` accepts an explicit `size`, or an existing
  `buffer` to serialize into.
- **Growth on underestimate.** `ensureCapacity` doubles (`byteLength * 2`) and `resize()`
  allocates a NEW `ArrayBuffer` and copies the kept prefix across.

Defaults: `defaultBufferSize: 2**14` (16 KiB), `sizeMultiplier: 2`, `maxStrCacheLength: 64`,
`maxCacheSize: 1000`.

### What ts-runtypes does NOT have

- **No buffer pooling / reuse.** Every serializer allocates `new ArrayBuffer(size)`
  (`dataView.js:129`, `:142`). There is no freelist, no acquire/release, no ring. The only reuse
  path is a caller passing `options.buffer` in explicitly. Under load this is one fresh
  allocation per response, plus another per growth step, all left to the GC.

### mion's side

`src/binary/dataView.ts` maps mion option names onto ts-runtypes ones and adapts the creation
signature. `bodySerializer.ts` / `bodyDeserializer.ts` sit on top, exported from
`packages/core/index.ts` and reached by `router/src/dispatch.ts`. Tests:
`router/src/dispatch.binary.spec.ts`, `router/src/routes/serializer.binary.spec.ts`,
`client/src/lib/serializer.binary.spec.ts`.

## Issues to investigate and discuss

1. **Pooling: wanted, and whose job?** A per-request `ArrayBuffer` is pure GC pressure in a hot
   server loop. Does a pool belong in ts-runtypes (every consumer benefits, but it needs a
   lifecycle contract — when is a buffer safe to return?) or in mion's `bodySerializer`, which
   actually knows the request boundary? Note `getBuffer()` hands the underlying buffer to the
   platform adapter, so "when is it done" is a real question, not a detail. Async platform
   adapters may still hold it after the handler returns.
2. **Is `mean + 2*stddev` the right predictor?** It is symmetric, but response sizes are usually
   right-skewed. Consider a high percentile instead. Weigh the cost asymmetry: an underestimate
   costs a full realloc + copy (possibly several, since growth doubles), an overestimate costs
   only untouched memory. Quantify both before changing anything.
3. **`sizeHistory` is module-global and unbounded.** Keyed by cacheKey with no eviction and no
   cap, so it grows with the number of distinct routes and lives process-wide. Check: memory
   under many routes, isolation between tenants, and leakage between tests (a shared Map means
   test order can change predictions).
4. **String-cache eviction is not LRU.** `evictStringBytesCache` sorts nothing — it drops the
   older half of insertion order wholesale. Check behaviour under churn (does a hot string get
   evicted repeatedly?) and whether the 64-char cap is right for mion's payloads.
5. **mion does not expose `sizeHistory` / `stringBytesCache`.** mion's `SerializationOptions`
   maps only 4 of the 6 knobs, so a mion consumer cannot inject or clear either Map. That blocks
   per-tenant isolation and test reset. Decide whether to expose them.
6. **Cold start.** 16 KiB for an unseen route. Right for mion's typical response? Should mion
   seed the history at startup from route metadata rather than paying a realloc on first hit?
7. **No benchmark covers this.** There is no measurement of allocation churn, realloc rate, or
   cache hit rate for the binary lane. Any change here needs a baseline first, or it is guesswork.

## Suggested approach for the investigating agent

1. Read `node_modules/@ts-runtypes/core/dist/runtypes/dataView.js` end to end — it is the
   authority, and this spec's line references will drift.
2. Read mion's `src/binary/*` and the four binary spec files; establish what is actually
   exercised today.
3. **Measure before proposing.** Add a throwaway benchmark for allocation count / realloc rate /
   string-cache hit rate on a representative route. Numbers, not intuition.
4. Write up findings against each numbered issue above, mark which are real, and bring the
   options (with the mion-vs-ts-runtypes split for each) to the user. **Stop there.**
5. Anything that lands in ts-runtypes becomes a todo in that repo, not a mion change.

## Related

- `docs/partially/dewrapper-core-ts-runtypes-proxies.md` — the open call on whether
  `setSerializationOptions` / `SerializationOptions` stay mion public API. That decision and this
  review overlap: if mion keeps the option surface, it should probably expose all six knobs
  (issue 5); if it drops it, consumers configure ts-runtypes directly and issues 3/5 move
  upstream.
