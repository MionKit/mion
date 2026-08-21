# Upstream: CLS001 (`runtypes/class-serializer`) is reported twice per site

**Status:** todo — **root cause confirmed and FIXED upstream**; waiting on a release + a mion
upgrade to close. Nothing to change on mion's side.
**Type:** bug (diagnostic noise)
**Created:** 2026-08-20 (concluded while closing
[../done/eslint-rules-tuning-and-docs.md](../done/eslint-rules-tuning-and-docs.md))

## The bug

Every `runtypes/class-serializer` (CLS001) advisory fires **twice**, at the identical file, line and
column, with the identical message:

```
packages/core/src/error-class-serializers.spec.ts
  14:62  warning  [CLS001] class `RpcError` is serialized structurally; ...  runtypes/class-serializer
  14:62  warning  [CLS001] class `RpcError` is serialized structurally; ...  runtypes/class-serializer
```

`pnpm run lint` emits **114** CLS001 lines across the monorepo, roughly half of them duplicates.

It is not eslint-only: the same doubling appears in the **vite plugin's** build output, so the
duplication is in the diagnostic stream, not in either consumer's reporting.

## It is not mion's config (this is the part worth not re-deriving)

The obvious suspicion — the rule reachable through two config layers — is wrong:

- `eslint.config.js` registers `mionESLintPlugin.configs.recommended` under the `@mionjs/` prefix and
  `tsRuntypesESLint.configs.recommended` under `runtypes/`. No overlap; mion has no CLS-style rule.
- `tsRuntypesESLint.configs.recommended` is a **single** config object (not an array), registering
  **one** plugin (`runtypes`) with **one** `runtypes/class-serializer` entry among its 25 rules.

Verified with:

```js
import cfg from '@ts-runtypes/devtools/eslint';
const rec = cfg.configs.recommended;         // not an array
Object.keys(rec.plugins);                    // ['runtypes']
Object.keys(rec.rules).filter(r => r.includes('class-serializer'));  // exactly one
```

One registration, one rule entry, two reports. The duplication is upstream of both.

## Why it matters

CLS001 is a warning users are meant to **act on** — it says a class will decode to a plain object
rather than a real instance unless `registerClassSerializer` is called. Doubling every instance
makes a real signal read as noise, and inflates any "warnings count" gate a consumer sets up.

## Root cause (confirmed upstream, 2026-08-21)

Two layers stack, and **the bug is not CLS001-specific** — it hits any diagnostic emitted from
a code path shared across cache families:

- `Walker.EmitDiagnostic` dedupes per code **per walk** — but a walk is per cache FAMILY. The
  resolver fans out one Walker, and one diagnostic sink, per family, so each family's latch is
  blind to its siblings.
- Each walk then emits against **every** provenance site of the root type. So a class the JSON
  encoder family and the decoder family both walk reports twice at BOTH call sites.

Reproduced minimally: one class, two call sites (`createJsonEncoderFn<Pet>()` +
`createJsonDecoderFn<Pet>()`) produced **four** identical CLS001s. The per-family-prefixed
codes (`PJ001`, `SJ001`, `TB001`) escaped this only because their codes differ per family.

The per-family codes were never affected, which is why this looked like a class-serializer
problem rather than a general one.

## Fixed upstream

`diagnostics.Dedupe`, applied once in `Session.Dispatch` — the single point every operation
returns through, so it covers the marker, pure-fn and enrich lanes too. Keyed on the full wire
identity (code, family, severity, args, site, related), so only diagnostics that would render
byte-identically collapse; two findings at one position with different args both survive.

Branch: `feature/devtools-bun-lane-and-diagnostics` in `ts-run-types`.

## Fix plan (mion side)

1. Do **not** work around it here — deduping in mion's config would hide the upstream bug.
2. Upgrade `@ts-runtypes/devtools` once the fix is released.
3. Re-run `pnpm run lint` and confirm the CLS001 count roughly halves (114 → ~57).

## Done when

- mion is on a release carrying the fix, and each CLS001 site reports exactly once.
