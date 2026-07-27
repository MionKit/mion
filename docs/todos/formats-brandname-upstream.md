# Formats carrying a real BrandName (upstream ts-runtypes follow-up)

**Status:** superseded — the mion half is resolved by deleting the brands entirely.
**Created:** 2026-07-21
**Superseded:** 2026-07-27 by [../done/format-type-modules-removal.md](../done/format-type-modules-removal.md)
and [drizzle-owns-brand-vocabulary.md](drizzle-owns-brand-vocabulary.md)

## Original problem (still true, still upstream's)

`@mionjs/core`'s `formatBrands.types.ts` documented nominal brands (`BrandEmail`, `BrandUUID`,
`BrandInteger`, …). The intent was a server↔client contract where a validated `FormatEmail` value is
assignable to `BrandEmail`, so consumer code could brand-narrow off a Format type. That contract is
**broken** under `@ts-runtypes/core`: Format types carry `BrandName = never`, so a `FormatEmail` is a
plain `string` and is NOT assignable to `BrandEmail`.

## Why this is superseded

The decision recorded here — *"KEEP the Brand types, they are still used as a nominal name registry"* —
has been **reversed**. mion no longer ships type formats or brands at all: formats are a `@ts-runtypes`
concern, and mion offers no default vocabulary of its own. `packages/core/src/types/formats/` is gone,
along with the website pages that documented it.

The two consumers named above resolved as follows:

- **`@mionjs/drizzle`** — its `AllBrandNames` key set is now a literal union it owns outright. Follow-up
  tracked in [drizzle-owns-brand-vocabulary.md](drizzle-owns-brand-vocabulary.md).
- **"mion error-param types reference them"** — no longer true, and it is not clear it ever was: at
  removal time `Brand` had zero importers anywhere in the repo, and the only consumer of any `Brand*`
  alias was drizzle.

## What remains, and where it belongs

Step 1 of the old fix plan is still worth doing, but it is now **purely a ts-runtypes request** with no
mion-side follow-up: let built-in Formats carry a real `BrandName` (e.g. `FormatEmail` →
`string & {brand: 'email'}`) so a nominal bridge holds without an explicit cast. File it in the
`ts-run-types` repo. Steps 2 and 3 are void — there are no mion `Brand*` types left to gate on a
release or re-document.
