# Upstream: CLS001 (`runtypes/class-serializer`) is reported twice per site

**Status:** done — shipped in `@ts-runtypes/core` 0.12.1, mion upgraded 2026-08-21.
No mion code change was needed; the fix was entirely upstream.
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


## Verified against mion (2026-08-21)

Measured on mion's router suite with a locally built resolver (overlay recipe in
[platform-bun-adopt-upstream-adapter.md](platform-bun-adopt-upstream-adapter.md)), caches cleared
between runs:

| resolver | CLS001 lines |
| --- | --- |
| published 0.12.0 | 148 |
| + per-family dedupe | 15 |
| + nested-type provenance | **29** |

So the count drops ~5x while COVERAGE goes up: nested and union-member classes now report at all,
which they never did before (a class only warned when it sat at the root of an encoder). The
remaining 29 are one per call site, no duplicates.

⚠️ **Measure with a cold cache.** RT diagnostics are cached per package under
`node_modules/.cache/ts-runtypes`, and until the upstream cache fix (below) a warm cache reported
ZERO of them. Comparing a warm run against a cold one gives meaningless numbers — that cost an
hour of confusion here.

## A second upstream bug this uncovered

Diagnostics used to vanish entirely on a warm cache: the walker emits them, and a cache hit skips
the walker. Published 0.12.0 shows 148 cold and **0** warm, so from the second build onward mion's
warnings silently disappeared and only returned after wiping the cache. Fixed upstream in the same
branch (entries now persist their findings and re-emit them against the current build's call
sites); verified 29 cold / 29 warm / 29 warm again.

## Outcome on 0.12.1

Measured on mion's router suite after the upgrade, exactly as predicted:

| | cold | warm |
| --- | --- | --- |
| 0.12.0 | 148 | **0** |
| 0.12.1 | **29** | **29** |

Both upstream bugs are closed: the count drops ~5x (duplicates gone, nested/union classes now
reporting), and diagnostics no longer vanish on a warm cache.

## Fix plan (mion side) — completed

1. Do **not** work around it here — deduping in mion's config would hide the upstream bug.
2. Upgrade `@ts-runtypes/devtools` once the fix is released.
3. Re-run `pnpm run lint` and confirm the CLS001 count roughly halves (114 → ~57).

## Done when

- mion is on a release carrying the fix, and each CLS001 site reports exactly once.
