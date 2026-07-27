# `@mionjs/drizzle` owns the brand→column vocabulary now

**Status:** todo
**Type:** decision recorded / follow-up
**Created:** 2026-07-27

## What changed

mion no longer ships type formats or brands of any kind. `packages/core/src/types/formats/` — including
the `Brand<Base, Name>` helper and the 20 `Brand*` aliases — was deleted wholesale
(see [../done/format-type-modules-removal.md](../done/format-type-modules-removal.md)). Formats are a
`@ts-runtypes` concern; mion offers no default vocabulary of its own.

drizzle was the only consumer. It used the aliases purely as a **nominal name registry**: a chain in
`packages/drizze/src/types/common.types.ts` re-derived the 20 brand *strings* out of the 20 brand
*types* via `ExtractBrandName<T>`, and the result (`AllBrandNames`) is the shared key set for the
per-dialect `BrandColumnMap` types.

That chain is now a plain literal union in the same file. Zero runtime change, zero behaviour change —
the derivation was always a roundabout way of writing 20 string literals.

## Why this is a todo and not just a note

`AllBrandNames` is now **unanchored**. Previously it was (loosely) tied to a shared vocabulary in
core; now it is a list drizzle maintains by hand, and nothing checks it against anything:

- `@ts-runtypes` has no `Brand` equivalent — its nominal marker is `__rtFormatBrand`, reached via
  `TypeFormat`'s 4th type parameter, which is a different mechanism with different ergonomics.
- Upstream `FormatAnnotation.name` is a bare `string`, so the reflection data that actually drives
  column mapping is not typed against this list either. `typeTraverser.ts` narrows it with a cast, and
  the mappers fall back to a text column for any name they do not recognise.

So the completeness guards (`_MissingSqliteBrands` / `_ExtraSqliteBrands` and their mysql/postgres
twins) now verify only that drizzle's three dialect maps agree with drizzle's own list — not that the
list matches any real format vocabulary.

## Options

1. **Derive from upstream.** Key the dialect maps off `FormatName` from `@ts-runtypes/core` instead of
   a hand-maintained list. That is the real source of truth for what the reflection layer can stamp on
   a property, and it would make the guards meaningful again. Note `FormatName` is a wider set than the
   20 brands (it includes the temporal formats), so this is a genuine scope decision, not a rename.
2. **Keep the literal list**, and add a test that asserts it against `typeFormats` at runtime.
3. **Do nothing** until drizzle is refactored — see below.

## Context

drizzle is likely to be refactored or parked. If that lands first, fold this into it rather than doing
the work twice. Supersedes the "keep the Brand types in mion" decision recorded in
[formats-brandname-upstream.md](formats-brandname-upstream.md).

## Done when

- `AllBrandNames` is either derived from a real source of truth or pinned by a test, **or** this todo
  is closed as part of a drizzle refactor that removes the question.
