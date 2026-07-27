# Retire mion's `TS_RUNTYPES_BIN` now that upstream ships `RT_BIN`

**Status:** done — retired outright (option 1); shipped in PR #128
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

## What shipped

**Option 1 (delete), not the forwarding alternative** — because forwarding cannot work. The vite
plugin and ESLint run in **separate processes**: setting `process.env.RT_BIN` from inside
`resolveRtBinary` would only affect the vite process, and an ESLint run never executes
`mionVitePlugin` at all. So no mion-side variable can make the two lanes agree. Deleting leaves
exactly ONE variable (`RT_BIN`, honoured by `@ts-runtypes/bin` for both lanes), which makes the
divergence structurally impossible rather than merely discouraged.

- `resolveRtBinary` no longer reads `TS_RUNTYPES_BIN`; it is `explicit → undefined`, deferring to
  `getExePath()` (which resolves `RT_BIN` → published platform package).
- It does **not** read `RT_BIN` either — doing so would bypass `getExePath()` and re-create a
  mion-side lane. Pinned by a test.
- **Warns once** when `TS_RUNTYPES_BIN` is set and `RT_BIN` is not, so anyone still using it is
  told rather than silently moved onto a different binary. Silent when `RT_BIN` is also set,
  since nothing is being ignored then.
- JSDoc updated on both `MionRunTypesOptions.binary` and `resolveRtBinary`; the typeId-divergence
  warning now applies to `RT_BIN`.
- New spec `packages/devtools/src/vite-plugin/resolveRtBinary.spec.ts` (6 tests) covering
  precedence, the two no-read guarantees, warn-once, and the quiet path.

### Fix-plan steps 3 and 4 needed no code

- **Step 3:** `TS_RUNTYPES_BIN` appears in no website doc and no example — only in the source, the
  generated build, and historical `docs/done/` records (left as-is; they are records of what
  happened, not live docs).
- **Step 4:** the symmetric lint-lane override already exists **upstream**
  (`settings.runtypes.binary`, see `@ts-runtypes/devtools/dist/eslint/session-protocol.d.ts`).
  mion deliberately does not set it in its own `eslint.config.js` — pinning mion's lint to a
  specific binary is exactly the divergence hazard this spec removes. `RT_BIN` is the answer for
  users who need both lanes on one binary.

### Risk accepted

`TS_RUNTYPES_BIN` was public surface (it shipped in the build), so this is a breaking change for
anyone who set it. Judged low-risk: mion is pre-1.0 (`@mionjs/devtools` 0.8.10), the variable was
never documented in any user-facing doc, and the one-time warning means no one is ignored
silently.

Verified: full suite **718 tests / 46 files** green, COLD lint green across 13 projects, format
clean, devtools rebuilt so consumers pick up the change.
