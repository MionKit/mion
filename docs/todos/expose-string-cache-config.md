# mion exposes none of ts-runtypes' string-cache configuration

**Status:** todo — found while shipping
[binary-pooling-review-findings.md](../done/binary-pooling-review-findings.md); needs a decision on
public API shape.
**Created:** 2026-08-22

## Evidence

`b3e585c` removed mion's `setSerializationOptions` wrapper as having zero consumers (E7 of
[binary-buffer-strategy-redesign.md](../done/binary-buffer-strategy-redesign.md)). Two of the four
options it proxied are genuinely inert for mion, and two are not:

| upstream option | still relevant to mion? |
| --- | --- |
| `defaultBufferSize` | no — mion always passes an explicit `size` or `buffer`, so upstream's cold-start default is never consulted |
| `sizeMultiplier` | no — same reason; upstream's `mean + n*stddev` predictor is never called |
| `maxStrCacheLength` | **yes** | 
| `maxCacheSize` | **yes** |

The last two govern the encoded-string bytes cache, and through it how much a string write RESERVES.
In `@ts-runtypes/core`'s `serString`: a string shorter than `maxStrCacheLength` that HITS the cache
reserves exactly `varintLen(bytes) + bytes`; anything else (a longer string, or a cache miss) goes
through `reserveForString`, which reserves the worst case `MAX_VARINT + charLength * 3` because
`encodeInto` must not be allowed to truncate. So these two knobs decide, for a given workload,
whether string writes reserve exactly or 3x — which is why the "grow off the pooled buffer"
experiment failed (recorded in the done spec, and as a comment on
`createPooledDataViewSerializer`).

A mion consumer whose payloads are dominated by repeated short strings (enum-ish values, ids, keys)
currently has no way to raise the cache bounds to get them onto the exact-reserve path.

## Fix plan

1. Decide the surface: re-export upstream's `setSerializationOptions` from `@mionjs/core` as-is, or a
   narrow mion-named wrapper exposing only `maxStrCacheLength` / `maxCacheSize` (the two that do
   something), so the inert options do not read as tunable.
2. Wire it, and document in `packages/core/src/binary/dataView.ts` what each knob actually reaches —
   the module comment there already explains that mion owns the BUFFER and ts-runtypes owns the
   ENCODING, which is exactly the line these two options sit on.
3. Cover it with a spec asserting a repeated short string lands on the exact-reserve path once the
   cache bound admits it (observable through `getBinaryStrategyStats().retries` on a pooled buffer
   sized to the exact bytes).
