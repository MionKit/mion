# Format type modules in core: delete one, trim one, keep one

**Status:** todo — deferred (see parent)
**Type:** chore
**Spec:** full-plan
**Created:** 2026-07-27

**Parent:** [runtypes-glue-0-umbrella.md](runtypes-glue-0-umbrella.md) — deferred until after PR #128 merges.

Surfaced by PR #128 review comments
[r3634575355](https://github.com/MionKit/mion/pull/128#discussion_r3634575355) (*"please check if
there is something in ts-runtypes for this. anyway do not see any reason to keep types related to
type formats in mion"*) and
[r3634590429](https://github.com/MionKit/mion/pull/128#discussion_r3634590429) (*"all these types
belong to ts-runtypes, we should remove them"*).

## Problem

`packages/core/src/types/formats/` holds 221 lines across three modules, all re-exported from
`packages/core/index.ts:31-33`. The review asks to remove them all. Measured per export, the answer
differs for each module — and one of the three should **not** be removed.

Consumer counts below exclude the `packages/core/index.ts` barrel re-export, which otherwise makes
every export look used.

| Module | Lines | Exports | Also upstream | Real consumers |
| --- | --- | --- | --- | --- |
| `formatsParams.types.ts` | 136 | 24 | 4 (`Samples`, `StringParams`, `DateFmt`, `TimeFmt`) | **0 / 24** |
| `formats.types.ts` | 45 | 10 | 1 (`TypeFormatParams`) | **1 / 10** (`TypeFormatValue`) |
| `formatBrands.types.ts` | 40 | 21 | **0** | **21 / 21** |

### `formatsParams.types.ts` — entirely dead

Not one of its 24 exports (`FormatParams_Email`, `FormatParams_UUID`, `StringValidators`,
`AnyFormatParams`, …) is referenced anywhere in the repo outside the barrel. It is 136 lines of
type surface kept alive purely by `export *`. Four of them duplicate upstream names outright.

### `formats.types.ts` — one live export

Only `TypeFormatValue` has a consumer (`packages/core/src/types/pureFunctions.types.ts`). The other
nine (`TypeFormatPrimitives`, `FormatParamLiteral`, `FormatParamMeta`, `FormatParam`,
`TypeFormatParsedParams`, `AliasTypeAnnotation`, `AliasTypeFormat`, `ExtractFormatParams`,
`TypeFormatParams`) are unused; `TypeFormatParams` also exists upstream.

### `formatBrands.types.ts` — keep

All 21 exports are used, every one of them by `@mionjs/drizzle`
(`packages/drizze/src/types/common.types.ts` mainly, plus `sqlite.types.ts` / `mysql.types.ts`).
**None has an upstream equivalent** — `Brand<Base, Name>` and the `BrandEmail` / `BrandUUID` /
`BrandInt8` … family are mion's own vocabulary for mapping run-type formats onto DB columns.
Deleting them breaks the drizzle package. The reviewer's blanket "these belong to ts-runtypes" does
not hold here.

## Plan

1. **Delete `formatsParams.types.ts` outright** and its `export *` line in
   `packages/core/index.ts`. Confirm zero fallout: `pnpm run lint` (typecheck) + full suite.
   ⚠️ These are exported public types, so this is a breaking change for any consumer importing them
   directly — defensible pre-1.0 (`@mionjs/core` 0.8.x), but note it in the PR.
2. **Trim `formats.types.ts`** to what is actually used. Move `TypeFormatValue` (and only what it
   depends on) to a sensible home — most likely straight into
   `packages/core/src/types/pureFunctions.types.ts`, its sole consumer — then delete the module and
   its barrel line. If the remaining dependency chain is non-trivial, keeping a much smaller
   `formats.types.ts` is fine; the goal is no unused exports, not a file count.
   - The stale JSDoc naming the deleted `@mionjs/run-types` package was already fixed on this
     branch; do not reintroduce it.
3. **Keep `formatBrands.types.ts` as is.** Add a one-line header comment recording *why* it stays
   (mion-owned DB-column brand vocabulary, consumed by `@mionjs/drizzle`, no upstream equivalent)
   so the next reviewer does not re-raise it.
4. Re-check the overlap numbers before deleting — this spec's counts were measured on
   `@ts-runtypes/core` 0.11.0 and will drift with upstream releases.

## Tests

No new behaviour, so no new runtime tests. The guard is the **typecheck**: `pnpm run lint` runs it
across all 13 projects including `packages/examples`, which is what proves nothing referenced the
deleted types. Run the full suite (718 tests / 46 files) as the regression net, and pay attention
to the `drizze` project specifically after step 3.

## Out of scope

- Whether the `Brand*` family should eventually move upstream — that is the existing
  [formats-brandname-upstream.md](formats-brandname-upstream.md) todo. This spec only decides what
  stays in mion today.
- Format *name* constants (`FormatNames` → upstream `typeFormats`) — already done in `c9c8566`.

## Done when

- No module under `packages/core/src/types/formats/` contains an export with zero consumers.
- `formatBrands.types.ts` still exports all 21 brands and `drizze` typechecks.
- Full suite + lint + format green.
