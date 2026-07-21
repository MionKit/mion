# Formats carrying a real BrandName (upstream ts-runtypes follow-up)

**Status:** todo — split out of R20 ([engine-consumer-verification.md](engine-consumer-verification.md)) while adopting the Brand decision.
**Created:** 2026-07-21

## Problem

`@mionjs/core`'s `formatBrands.types.ts` documents nominal brands (`BrandEmail`, `BrandUUID`,
`BrandInteger`, …). The original intent was a server↔client contract where a validated
`FormatEmail` value is assignable to `BrandEmail`, so consumer code could brand-narrow off a
Format type. That contract is **broken** under `@ts-runtypes/core`: Format types carry
`BrandName = never`, so a `FormatEmail` is a plain `string` and is NOT assignable to `BrandEmail`.

## Decision taken (this wave)

KEEP the Brand types — they are still used as a **nominal name registry**, not via
Format-assignability:

- `@mionjs/drizzle` derives its `BrandColumnMap` key set (`AllBrandNames`) from these brand
  names (`packages/drizze/src/types/common.types.ts`).
- mion error-param types reference them.

The false "Formats are automatically these brands" claim was removed from the `formatBrands.types.ts`
docblock (advisory note added) and must be removed from the website
(`website/content/4.run-types/2.type-formats.md`, rides
[examples-and-website-refresh.md](examples-and-website-refresh.md)).

## Fix plan (deferred, upstream-gated)

1. File a ts-run-types bucket-4 request: let built-in Formats carry a real `BrandName` (e.g.
   `FormatEmail` → `string & {brand: 'email'}`) so the server↔client nominal bridge holds without
   an explicit cast.
2. When that ships, gate the mion `Brand*` types on the release and re-document the (now real)
   contract, restoring the website section as a supported feature rather than an advisory.
3. Until then, the brands remain nominal helpers only; brand explicitly when narrowing is wanted.
