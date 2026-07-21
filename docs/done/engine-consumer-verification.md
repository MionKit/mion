# Verify mion features that consume engine format/error shapes (friendlyErrors + Brands)

**Status:** done — R20 of [migration-review-findings.md](migration-review-findings.md). Shipped on
`claude/ts-runtypes-migration-todos-us21ib-engine-cleanup` (PR3, the "rest" PR).
**Created:** 2026-07-20

## Problem (original)

Two live mion (core) features sat on top of engine shapes that changed in the migration and were NOT
touched by it — the green suite proved nothing about them because their specs ran against hand-built
fixtures: (1) `core/src/friendlyErrors.ts` keys on format paths/names/tokens that drifted; (2)
`core/src/types/formats/formatBrands.types.ts` documented a server↔client brand contract that broke
(ts-runtypes Formats carry `BrandName = never`).

## What shipped

**friendlyErrors — verified against the REAL engine, no longer fixture-only:**

- The getFriendlyErrors mapping is engine-drift-tolerant by construction (it keys on path shape +
  `format.formatPath`, not on the exact `expected` token), so no mapping-code change was needed.
- The stale synthetic fixtures in `core/src/friendlyErrors.spec.ts` were corrected to real tokens
  (`expected: 'object'` → `'objectLiteral'`) and a header comment now points at the real-engine
  canaries so the "won't silently rot" intent is explicit.
- Strengthened the real-engine canary in `client/src/lib/friendlyErrors.spec.ts`: a new test pins the
  EXACT raw ts-runtypes error shape (`expected` base type + `format {name, formatPath, val}`) for the
  name/age/email matrix produced by `.typeErrors()`, then maps it through getFriendlyErrors. Any
  engine shape drift now fails this spec (the type-formats `*.runtype.spec.ts` suite pins the scalar
  format shapes independently).
- Found + filed a pre-existing quirk: friendly field messages nest under the positional param index
  (`friendly[0].name`), see [friendly-errors-positional-nesting.md](../todos/friendly-errors-positional-nesting.md).

**Brands — decision (b, gated): KEEP as nominal helpers, drop the false auto-derivation claim:**

- `@mionjs/drizzle` derives its `BrandColumnMap` key set (`AllBrandNames`) from these brand names, and
  error-param types reference them — so the types stay.
- `formatBrands.types.ts` now carries an advisory docblock: Formats do NOT carry these brands
  automatically (`BrandName = never` upstream); brand explicitly when narrowing.
- The website contract text change rides [examples-and-website-refresh.md](../todos/examples-and-website-refresh.md);
  the upstream "Formats carry a real BrandName" follow-up is split out to
  [formats-brandname-upstream.md](../todos/formats-brandname-upstream.md).
