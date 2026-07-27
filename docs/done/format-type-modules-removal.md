# Format type modules in core: all of them removed

**Status:** done — branch `refactor/runtypes-glue-umbrella`
**Created:** 2026-07-27 (as `docs/todos/runtypes-glue-3-format-type-modules.md`)
**Parent:** [runtypes-glue-0-umbrella.md](../todos/runtypes-glue-0-umbrella.md) — phase 1 of 3

Surfaced by PR #128 review comments
[r3634575355](https://github.com/MionKit/mion/pull/128#discussion_r3634575355) and
[r3634590429](https://github.com/MionKit/mion/pull/128#discussion_r3634590429) (*"all these types
belong to ts-runtypes, we should remove them"*).

## Outcome: the reviewer was right, the original spec was wrong

The spec this replaces concluded *"delete one module, trim one, **keep** `formatBrands.types.ts`"* on
the strength of drizzle's 20-alias dependency. The owner's call overrode that: **no type format or
brand survives in mion.** Formats are a `@ts-runtypes` concern and mion offers no default vocabulary
of its own, so the correct move was to decouple drizzle rather than to keep a module alive for it.

That turned out to be cheap — drizzle's entire brand dependency was one type-alias chain in one file.

## What was removed

| What | Size |
|---|---|
| `packages/core/src/types/formats/` — all three modules + barrel lines `index.ts:32-34` | 221 lines, 55 exported types |
| `packages/examples/src/type-formats/builtin/**` — 19 files, zero `@mionjs` imports, pure ts-runtypes demos | 239 lines |
| `website/content/4.run-types/{2.type-formats,3.built-in-formats}.md` | 518 lines |
| `website/content/3.client/2.validation-errors.md` | 146 lines |
| `GenericPureFunction`, `ErrorsPureFunction`, `PureFunctionDeps` (`pureFunctions.types.ts`) | — |
| `export type {FormatName}` pass-through (`constants.ts`) | 1 line |

`3.client/2.validation-errors.md` was **already broken** before this change: it documents
`getFriendlyErrors` / `FriendlyErrors<T>`, removed in `d76c326e`, and 12 of its `code-import` blocks
point at 5 files that do not exist (logged in [broken-code-import-paths.md](../todos/broken-code-import-paths.md)).

## What stayed, and why

**`packages/core/index.ts:13` — `import '@ts-runtypes/core/formats'`.** Unrelated to mion's format
*types*. It side-effect-registers `rtFormats::isUUID` & co, the mocking fns and the string patterns,
which the Go-emitted validator cache resolves at **runtime** via `utl.getPureFn(...)`. Any mion route
whose params use a ts-runtypes format needs it, and several do
(`packages/router/src/lib/formats.spec.ts`, `packages/test-server/src/test-server.ts`). Deleting it
would be a runtime break, not a type-only one. The comment there now says so explicitly.

Format-typed **test fixtures** across router/client/test-server all import from
`@ts-runtypes/core/formats`, never from mion — kept; they are the regression net for the line above.

## Drizzle decoupling

`packages/drizze/src/types/common.types.ts` derived `AllBrandNames` by round-tripping 20 `Brand*`
types through `ExtractBrandName<T>` to recover the 20 brand *strings*. Replaced with a literal union
of the same 20 names — zero runtime change, and the per-dialect completeness guards
(`_Missing*Brands` / `_Extra*Brands` in `sqlite`/`mysql`/`postgres.types.ts`) still work. Follow-up
recorded in [drizzle-owns-brand-vocabulary.md](../todos/drizzle-owns-brand-vocabulary.md).

Two related fixes fell out while repointing `FormatName` at upstream:

- `base.mapper.ts` imported `FormatName` from `@mionjs/core`; it now imports from `@ts-runtypes/core`
  like its three subclasses already did.
- That surfaced a **latent type bug** the stale `.dist` tree had been masking (`TS6305` on the import
  line swallowed the real type): `PropertyInfo.formatName` was `string`, passed into
  `mapFormat(formatName: FormatName, …)`. Upstream types `FormatAnnotation.name` as a bare `string`,
  so the narrowing now happens once, in `typeTraverser.ts`, where untyped reflection data enters
  drizzle's model. Runtime was always safe — the mappers fall back to a text column for an
  unrecognised name.

## Adjacent fixes

- Root `package.json` `test:ci` still passed `--project run-types --project type-formats`. **Both
  projects were deleted**, and vitest tolerates unknown project filters silently — so those batches had
  been running fewer projects than the script claims. Removed.
- Same stale names cleaned from `scripts/pack-packages.sh` and `website/server/api/twoslash.post.ts`.
- `CLAUDE.md` / `AGENTS.md` used `import {TypeFormatParams, Brand} from '@mionjs/core'` as their
  canonical "correct reflection import" example. Rewritten against `@ts-runtypes/core/formats`.
- Two inbound website links to the deleted pages repointed at ts-runtypes.

## Corrections to the original spec

| Spec claim | Reality |
|---|---|
| `packages/core/index.ts:31-33` | `:32-34`. Line 31 is `pureFunctions.types.ts` — following the spec literally deletes the wrong line. |
| `formats.types.ts` — "the other nine are unused", listing `TypeFormatPrimitives` | `TypeFormatPrimitives` had a live consumer: `formatBrands.types.ts` imported it as the `Brand` constraint. The spec's step 2 would have broken the module its step 3 said to keep. |
| `formatBrands.types.ts` — "all 21 exports used by drizzle" | **20.** `Brand` itself had zero importers repo-wide — it was only the definition base for the other 20. |
| drizzle files listed as `common.types.ts` + `sqlite`/`mysql` | `postgres.types.ts` uses `AllBrandNames` identically and was omitted. |
| "`pnpm run lint` (typecheck) … is what proves nothing referenced the deleted types" | **eslint is not a typechecker**, and `packages/examples/**` is in `eslint.config.js` `ignores`, so its `lint` script lints nothing. The stated guard did not exist. |
| "counts measured on `@ts-runtypes/core` 0.11.0 and will drift" | Still 0.11.0 — no drift. But `node_modules` had **no** `@ts-runtypes/*` installed at all, and the `.dist` trees were 2 months stale, which is what masked the drizzle type bug above. |
| `TypeFormatValue` needs relocating to `pureFunctions.types.ts` | Unnecessary — its only two consumers (`GenericPureFunction`, `ErrorsPureFunction`) were themselves dead, so the whole chain deleted cleanly. |
| `ExtractFormatParams` is a useful type | It was **provably broken**: `AliasTypeAnnotation` resolves to `unknown`, so `AliasTypeFormat<B,N,P> = B & unknown = B` carries no structure encoding `P`, and the `infer P` could never bind. |

## Verification

Typecheck baselines were recorded before the change (nothing here is a green gate today) and diffed
after: **0 new errors** in `core` / `router` / `client` / `examples`, **3 pre-existing errors fixed**
(2 stale-`.dist` resolution failures in drizzle, 1 real `FormatName` mismatch in examples).
Full suite **719 tests / 46 files, green**, unchanged from baseline.
