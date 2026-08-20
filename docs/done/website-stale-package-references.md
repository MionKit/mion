# Website + examples still reference DELETED packages and removed APIs

**Status:** done — swept in PR #128
**Created:** 2026-07-27 (split out of the retired `docs/partially/`; the PR #125 refresh itself
shipped — see [../done/examples-and-website-refresh.md](../done/examples-and-website-refresh.md))

The PR #125 refresh ported the **examples** off the deepkit/AOT-era API, but a second wave of
drift arrived afterwards when `@mionjs/run-types` and `@mionjs/type-formats` were **deleted**
(see [../done/proxy-packages-removal.md](../done/proxy-packages-removal.md)). The website was
never fully caught up, so it currently documents packages that do not exist.

## Verified state (2026-07-27, counted on this branch)

| Stale reference | Files |
| --- | --- |
| `@mionjs/run-types` (deleted package) | **7** under `website/` |
| `@mionjs/type-formats` (deleted package) | **7** under `website/` |
| Old `Format*` names (`FormatEmail`, `FormatInteger`, `FormatUUID`…) | **11** under `website/` + `packages/` |
| `type-formats-imports` (removed lint rule) | **4** under `website/` + `packages/` |

Plus the three example fixtures that existed only for that removed rule, still present:

- `packages/examples/src/introduction/eslint-type-formats-imports-valid.routes.ts`
- `packages/examples/src/introduction/eslint-type-formats-imports-invalid.routes.ts`
- `packages/router/examples/eslint-rule-test.routes.ts`

**Why it matters:** a reader following the install or import instructions today gets a package
that 404s on npm. This is the most user-visible drift left from the migration.

## What shipped

All four reference classes are gone from source; acceptance counts re-run and zero.

- **Format names** — all 39 stale `Format*` identifiers renamed to the `@ts-runtypes/core/formats`
  names across 13 website files. Mostly a mechanical `Format<X>` -> `<X>`, with three judgement
  calls: `FormatUUID` -> `UUIDv4` (upstream `UUIDv4` is the type carrying format name `'uuid'`),
  `FormatUUIDv7` -> `UUIDv7`, and **`FormatUrlSocialMedia` DROPPED** — it has no upstream
  equivalent at all, so it was removed from the brand table rather than renamed to a name that
  does not exist.
- **Package references** — `@mionjs/type-formats` (incl. the `/StringFormats`, `/NumberFormats`
  category subpaths, which collapse onto the single `./formats` entry point) and
  `@mionjs/run-types` are gone. Prose that described the engine now names `@ts-runtypes/core`;
  `registerMionPureFn` is documented as coming from `@mionjs/core`, matching how the examples and
  test-server actually import it.
- **Removed lint rule** — the `type-formats-imports` section, its summary-table row and its
  config-example entry are deleted from `5.devtools/2.eslint-rules.md`, along with the two example
  fixtures. The retired rule's demo block was also removed from
  `packages/router/examples/eslint-rule-test.routes.ts` — that file was KEPT, since it covers the
  router rules generally, not just the removed one.
- **Friendly-errors pages** swept with the rest (they were wrongly excluded before).
- One stale JSDoc in `packages/core/src/types/formats/formats.types.ts` also fixed. The note in
  `packages/core/index.ts` naming the *removed* `@mionjs/run-types` is deliberate history and was
  left alone, as were generated `build/*.js.map` artifacts.

Verified: 718 tests / 46 files, cold lint green across 13 projects, format clean.

## What did NOT ship

Item 5 (the CI lane that would stop this drift recurring) is unchanged — it still depends on
[examples-precompile-debt.md](examples-precompile-debt.md). The cheaper, narrower check proposed
in [broken-code-import-paths.md](broken-code-import-paths.md) has since shipped as
`scripts/check-code-imports.mjs`.

## Original fix plan

1. **Format names** — switch samples/imports to the `@ts-runtypes/core/formats` names
   (`Email` / `Integer` / `UUIDv4` / …) across
   `website/content/4.run-types/{0.overview,1.features,2.type-formats,3.built-in-formats}.md`.
   Drop `@mionjs/type-formats` package references and any `import type` format guidance that no
   longer applies.
2. **Install/import references** — drop `@mionjs/run-types` / `@mionjs/type-formats` from
   `1.introduction/3.manual-install.md`, `20.server/*` (excluding friendly-errors pages) and
   `21.drizzle-orm/*`.
3. **Removed lint rule** — delete the `type-formats-imports` section from
   `website/content/5.devtools/2.eslint-rules.md`, and delete or repoint the three fixtures above.
   ⚠️ That page also needs the `runtypes/*` rule set documented
   ([eslint-rules-tuning-and-docs.md](eslint-rules-tuning-and-docs.md) item 4) — **do both in one
   pass** rather than editing the page twice.
4. **Friendly-errors pages ARE in scope.** The FriendlyText swap itself shipped
   ([friendlyerrors-to-friendlytext-feasibility.md](../done/friendlyerrors-to-friendlytext-feasibility.md)),
   but the package/format drift on those pages did not go with it — verified 2026-07-27:
   `3.client/2.validation-errors.md` still uses **3** old `Format*` names and
   `20.server/7.validation.md` still references `@mionjs/run-types` **once**. Earlier notes
   excluded these pages as "riding the friendly-errors swap"; that is no longer true, so sweep them
   with the rest.
5. **Stop the drift** — wire an examples typecheck lane into CI so "the examples compile" is
   enforced rather than promised. A `check-types` script + `tsconfig.check.json` already exist but
   are NOT a gate; the pre-existing debt blocking that gate is tracked in
   [examples-precompile-debt.md](examples-precompile-debt.md). Land that first, then turn this on.

## Acceptance

- No file under `website/` or `packages/` references `@mionjs/run-types`, `@mionjs/type-formats`,
  a `Format*`-prefixed format name, or the `type-formats-imports` rule.
- The eslint-rules page documents the shipped rule set (mion + `runtypes/*`).
- Counts above re-run and all zero.
