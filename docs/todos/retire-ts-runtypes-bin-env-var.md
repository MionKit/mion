# Retire mion's `TS_RUNTYPES_BIN` now that upstream ships `RT_BIN`

**Status:** todo
**Created:** 2026-07-26 (found while validating @ts-runtypes 0.11.0 in mion, PR #128)

mion's `resolveRtBinary` predates the upstream override and now duplicates it — but only for
ONE of the two lanes, which makes the two lanes resolvable to _different binaries_.

## Evidence

`packages/devtools/src/vite-plugin/mionVitePlugin.ts:115-119`:

```ts
export function resolveRtBinary(explicit?: string): string | undefined {
  if (explicit) return explicit;
  if (process.env.TS_RUNTYPES_BIN) return process.env.TS_RUNTYPES_BIN;
  return undefined; // @ts-runtypes/bin getExePath() takes over
}
```

As of @ts-runtypes 0.11.0 the two lanes resolve like this:

| lane             | resolution order                                                                 |
| ---------------- | -------------------------------------------------------------------------------- |
| vite (transform) | `options.binary` → **`TS_RUNTYPES_BIN`** → `getExePath()` (which reads `RT_BIN`) |
| ESLint (lint)    | `settings.runtypes.binary` → `getExePath()` (**`RT_BIN` only**)                  |

So `TS_RUNTYPES_BIN` is honoured by the transform lane and **ignored by the lint lane**.

### Why that is a trap, not just redundancy

Setting only `TS_RUNTYPES_BIN` points the transform at one binary while lint keeps using
whatever `getExePath()` finds (the published platform package, or `RT_BIN`). The binary version
is **folded into every typeId**, so two different-version binaries across the two lanes produce
caches whose `<typeId>` halves do not match — the exact divergence the warning comment directly
above `resolveRtBinary` already cautions about, now reachable through mion's own env var.

It is currently latent: nothing in-repo sets `TS_RUNTYPES_BIN`, and this PR's validation used
`RT_BIN` alone (full suite 712 tests + cold lint across 13 projects, both green, with no platform
binary installed).

## Fix plan

1. Delete the `TS_RUNTYPES_BIN` branch from `resolveRtBinary`, leaving
   `options.binary → undefined` so `getExePath()` (and therefore `RT_BIN`) is the single env
   path for BOTH lanes. Keep `options.binary`: an explicit per-plugin override is still useful
   and is not duplicated upstream.
2. Update the JSDoc at `mionVitePlugin.ts:110-114` — it names `TS_RUNTYPES_BIN` in the
   resolution order — and keep the typeId-divergence warning, which now applies to `RT_BIN`.
3. Grep the website docs + `packages/examples` for `TS_RUNTYPES_BIN` and repoint to `RT_BIN`.
4. Consider exposing `settings.runtypes.binary` guidance for mion's ESLint config, mirroring the
   upstream lint option, so the two lanes have symmetric explicit overrides.

### Breaking-change note

`TS_RUNTYPES_BIN` is public surface, so removing it is a breaking change for anyone who set it.
Alternative if that matters: keep reading it but **forward it to `RT_BIN`** (set
`process.env.RT_BIN` when only `TS_RUNTYPES_BIN` is present) so both lanes agree, and mark it
deprecated. Decide which before implementing.
