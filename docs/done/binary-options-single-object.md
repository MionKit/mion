# One options object for the binary lane (and the ts-runtypes knobs mion had stopped exposing)

**Status:** done — shipped on `claude/binary-pooling-review-uqdqh3` (PR #140)
**Type:** refactor (breaking) + fix
**Created:** 2026-08-22 · **Completed:** 2026-08-22

Supersedes the `expose-string-cache-config` todo, which this implements: the knobs it was filed for
are now part of the single options object rather than a separate surface.

## The problem

The binary lane had grown three unrelated configuration surfaces:

| surface | set by | reached |
| --- | --- | --- |
| `BufferPoolConfig` | `configureBufferPool` | platform adapters (`binaryBufferPool` option) |
| `SizeStatsConfig` | `configureSizeStats` | nobody — exported and never called |
| `@ts-runtypes/core` `SerializationOptions` | `setSerializationOptions` | nobody, since `b3e585c` removed mion's proxy |

Three ways to configure one lane, one of them unreachable in practice and one dropped entirely. The
third mattered more than it looked: `maxStrCacheLength` / `maxCacheSize` decide whether a string
write reserves its exact byte count (cache hit) or upstream's worst-case `charLength * 3`, so a
payload of repeated short strings had no way to get onto the exact-reserve path.

## What shipped

`packages/core/src/binary/options.ts` — **one object, `BinaryOptions`**, patched through
`configureBinary()` and read by everything in the lane:

```ts
interface BinaryOptions extends Partial<Pick<SerializationOptions, 'maxStrCacheLength' | 'maxCacheSize' | 'stringBytesCache'>> {
    pool: BufferPoolOptions;      // enabled, minClassBytes, maxClassBytes, maxPerClass, maxTotalBytes
    sizeStats: SizeStatsOptions;  // ringSize, maxKeys
}
```

- **Nested groups**, merged not replaced: `configureBinary({pool: {enabled: true}})` keeps the size
  classes already configured.
- **Only the upstream options that REACH mion are inherited.** `defaultBufferSize` and
  `sizeMultiplier` drive upstream's own predictor, which mion never consults — every serializer it
  creates is given an explicit `size` or `buffer` — and `sizeHistory` is only written by
  `markAsEnded`, which mion never calls. Inheriting those three would have put three knobs on the
  public surface that provably do nothing, which is the exact defect finding #2 of
  [binary-pooling-review-findings.md](binary-pooling-review-findings.md) was about.
- The inherited members are forwarded to `setSerializationOptions`, and **only when present**: an
  absent member leaves upstream's own default alone rather than mion pinning a value it has no
  opinion about.

### Self-reconciling state, instead of a config hook

`configureBinary` knows nothing about the pool or the statistics — a change reaches them because each
one reconciles with the options at its own entry points:

- the pool drops what it holds when pooling is turned off, or when a class boundary moves (held
  buffers are filed BY class, so a moved boundary would orphan them under a key nothing looks up
  while they still counted against `maxTotalBytes`);
- a size ring whose length no longer matches `ringSize` is rebuilt rather than read at the wrong
  length.

This is why there is no listener registry and no import cycle between the options and the modules
they configure: the reaction lives with the state, not with the setter.

## Breaking changes

- `configureBufferPool(...)` → `configureBinary({pool: {...}})`; `configureSizeStats(...)` →
  `configureBinary({sizeStats: {...}})`. Both old functions are gone.
- `BufferPoolConfig` → `BufferPoolOptions`, `SizeStatsConfig` → `SizeStatsOptions`, both now nested
  under `BinaryOptions`.
- `resetBufferPool()` / `resetSizeStats()` now reset only STATE; the options reset separately through
  `resetBinaryOptions()`.
- Platform option `binaryBufferPool: false | Partial<BufferPoolConfig>` → `binary: BinaryOptionsPatch`
  on `NodeHttpOptions` / `BunHttpOptions`. Pooling is still armed by default on both adapters
  (`binary: {pool: {enabled: false}}` turns it off), because only an adapter with a proven-safe
  release point may enable it.

## Tests

`packages/core/src/binary/options.spec.ts` — defaults, nested-group merging, the pool and the
statistics both reading from the one object, a ring rebuilt when `ringSize` changes, buffers dropped
when pooling is disabled or a class boundary moves, and the inherited upstream options proven to
ARRIVE upstream (a cacheable string lands in the `stringBytesCache` mion handed it, and stops landing
there once `maxStrCacheLength` is lowered below its length).
