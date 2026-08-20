# Upstream: CLS001 (`runtypes/class-serializer`) is reported twice per site

**Status:** todo — **upstream bug in `@ts-runtypes/devtools`.** Investigated and localised here;
nothing left to fix on mion's side. Needs an issue filed in `ts-run-types`.
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

## Fix plan

1. File the issue upstream in `ts-run-types` with the reproduction above (both the eslint and the
   vite-plugin surface, since the duplication is common to them).
2. Do **not** work around it in mion — deduping in the config would hide a real upstream bug and
   would silently swallow a genuine second diagnostic at the same position if one ever existed.
3. Once fixed and mion upgrades, re-run `pnpm run lint` and confirm the CLS001 count halves.

## Done when

- Upstream issue filed, and its outcome recorded here.
- After the upgrade, each CLS001 site reports exactly once.
