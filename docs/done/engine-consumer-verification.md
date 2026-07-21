# Verify mion features that consume engine format/error shapes (friendlyErrors + Brands)

**Status:** todo — R20 of [migration-review-findings.md](../done/migration-review-findings.md); verified still fully open 2026-07-20 (both files untouched on the branch).
**Created:** 2026-07-20

## Problem

Two live mion (core) features sit on top of engine shapes that changed in the migration and
were NOT touched by it — the green suite proves nothing about them because their specs run
against hand-built fixtures:

1. **`core/src/friendlyErrors.ts`** keys on exactly the fields that changed upstream:
   `error.format.formatPath[0]` (paths now flattened, part indexes gone), `error.format.val`
   (dateTime carries the splitChar now), format `name`s (`'email'` → `'domain'`/
   `'stringFormat'` in sub-errors) and `error.expected` (`'object'` → `'objectLiteral'`).
   `friendlyErrors.spec.ts` uses hand-built error fixtures, so it stayed green while the
   real engine output drifted under it.
2. **`core/src/types/formats/formatBrands.types.ts`** documents a server↔client brand
   contract that is broken: ts-runtypes formats carry `BrandName = never` (a `FormatEmail`
   value is a plain `string`), so `FormatEmail` is no longer assignable to `BrandEmail` and
   brand-narrowing code silently stops matching. The website still documents the old
   contract (`4.run-types/2.type-formats.md`).

## Fix plan

1. Generate REAL ts-runtypes validation errors for the friendly-errors format matrix
   (email, dateTime, number formats, nested objects) via `createGetValidationErrors`,
   replace the hand-built fixtures, and update `getFriendlyErrors`' mapping for the new
   paths/names/tokens. The fixtures should be produced in-spec (markers), not pasted, so
   the next engine change fails the suite instead of rotting silently.
2. Decide the Brand story: (a) drop it — delete `formatBrands.types.ts` + the website
   section; or (b) keep it — file brand-support upstream (ts-run-types bucket-4 candidate:
   formats carrying a real `BrandName`) and gate the mion types on that release. Either
   way the website section changes with [examples-and-website-refresh.md](examples-and-website-refresh.md).
