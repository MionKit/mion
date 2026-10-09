# Translations: per-locale friendly files

CLI, file layout, reconcile rules and tsconfig block for `enrich --i18n`.

## Layout

- The friendly map you author IS the source language: tsconfig `i18n.sourceLocale`, default `en`.
- No separate default catalog, no separate translation type.
- Each target locale gets committed `FriendlyText<T>` files shadowing the friendly mirror tree:
  `<i18nDir>/<locale>/<rel>.ts`.
  - Default `i18nDir`: `<genDir>/enriched/i18n`, resolved under the project root.
  - e.g. `src/.mion/enriched/i18n/pl/src/models/user.ts`.
  - Locale is a path segment, so `pt-BR` works verbatim.
- Const per type: `<locale>_friendly<Name>`. BCP-47 `-` becomes `_`: `pt_BR_friendlyUser`.
  - Annotated `FriendlyText<Name>`, SAME `@rtType <Name>#<id> @rtIds {…}` markers as the source.
  - Path + const prefix carry the locale. No i18n marker.
- Every locale file is generated FROM THE SOURCE TYPE by the same driver as the friendly mirror.
  - Mirror = discovery input only (which sources translate), never a content input.
  - No generated file ever feeds the generation of another.

## CLI

```
mion enrich --i18n <locale> [<src.ts>]           # scaffold (create-only)
mion enrich --i18n <locale> --update [<src.ts>]  # reconcile from the SOURCE TYPE
mion enrich --i18n <locale> --prune  [<src.ts>]  # strip @rtOrphan carcasses (the only delete)
mion enrich --i18n all [--update]                # fan out over tsconfig i18n.locales
mion enrich --i18n <locale|all> --no-emit        # report status (warnings, exit 0)
mion enrich --i18n <locale|all> --require-complete  # completeness gate (fails CI)
```

- No `<src.ts>` → targets = sources that have a friendly mirror (path math over `<genDir>/enriched/friendly/`).
  Mirror content never read.
- Scaffold = type's tree, every string leaf + plural arm an `@todo` blank (`''`).
  NEVER copies source text as if translated.
- Fill rules (translate only blank leaves, arms locale-owned, prune freely): **`runtypes-friendly-text`** skill,
  translations page.

## `--update`

- Same value-preserving reconcile as `enrich --update`: one driver for every friendly-family file.
- Includes the one-level `rt$errors` descent:
  - Newly declared constraint key → blank of the right kind (string, or plural with THAT FILE's locale arms).
  - Dropped RECOGNIZED constraint key → `@rtOrphanChild` carcass. Unknown keys = author-owned, untouched.
  - Same-key leaf kept byte-identical. `rt$default`-only node never descended.
- Plural arms never orphaned, renamed or down-scoped.
- Type renames carry across locales via shared `@rtType` id.
  Const, annotation, marker AND intra-file references renamed in place.

## `enrich --i18n --no-emit` findings

- enrich-i18n-missing-translation: translation file missing.
- enrich-i18n-todo-left: unfilled `@todo` blanks.
- enrich-i18n-out-of-date: out of date vs the SOURCE TYPE (a src-driven reconcile would change the file).
- enrich-i18n-orphans: orphan carcasses awaiting review/prune.
- All Warnings (exit 0). tsconfig `i18n.strict: true` OR `--require-complete` → Errors (exit 1).
- Runtime always lenient regardless.

## tsconfig `i18n` block

Lives on the `mion` tsconfig plugin entry. Dormant by default: zero change when absent.

```jsonc
{
  "name": "mion",

  "i18n": {
    "sourceLocale": "en", // language the source FriendlyText maps are written in
    "dir": "src/.mion/enriched/i18n", // translation subtree root (default <genDir>/enriched/i18n)
    "locales": ["es", "pl", "pt-BR"], // target locales (the source locale is NOT listed)
    "strict": false, // when true, the i18n check fails on incompleteness by default (same as --require-complete)
  },
}
```

Runtime rendering (`createFriendlyTextI18n`, `resolveLocale` matching, per-leaf fallback,
type-driven `$[val]` for Currency / date bounds): **`runtypes-friendly-text`** skill.
