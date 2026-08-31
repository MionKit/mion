---
name: rt-enrich-types
description: Drive the RunTypes enrichment workflow — author and maintain the committed, type-keyed FriendlyText<T> (human labels + error messages) and MockData<T> (realistic sample data) for a type. Use when scaffolding or filling a type's enrichment file, when running the `ts-runtypes` CLI (`enrich` / `enrich --update` / `enrich --prune` / `enrich --no-emit` / `enrich --require-complete`), when filling `@todo` blanks the compiler left, or when working with the enrichment JSDoc tags (`@rtType`, `@rtIds`, `@rtOrphan`, `@rtOrphanChild`, `@todo`). Covers the mirror directory, the compiler-scaffolds/agent-fills loop, the CLI verbs, and the tsconfig i18n block; the per-family authoring DSLs are the runtypes-friendly-type and runtypes-mock-data skills.
---

# RunTypes enrichment — the compiler scaffolds, you fill the blanks

Enrichment is the **committed, type-keyed data RunTypes can't generate on its own**: human
labels + error messages (`FriendlyText<T>`) and realistic sample values (`MockData<T>`).
Unlike validators/codecs (pure functions of the type, recomputed every build, never
committed), enrichment is **authored once, committed, and validated against the type
forever after**. Full design: [docs/AI_ENRICHMENT.md](https://github.com/mionkit/ts-runtypes/blob/main/docs/AI_ENRICHMENT.md).

The division of labour: **the compiler writes the code; you (the agent) fill the blanks.**
The compiler scaffolds a real, type-accurate file with every field in place and the gaps
marked `@todo`; your job is to fill those gaps with believable, valid content.

## The loop

1. **`enrich`** — the compiler scaffolds the mirror file: one entry per field, correctly
   typed, each blank marked `@todo`.
2. **Fill the `@todo`s** — write the labels, messages, and sample values; delete each
   `@todo` line as you finish it.
3. **`enrich --no-emit`** — the health check: the compiler validates every authored value
   against the live type. It fails on WRONG or stale content (a dead field, a leftover
   carcass) but only REPORTS the unfilled blanks (`@todo` lines, empty `''` labels/messages,
   empty `[]` pools), since a fresh scaffold is expected to carry them. Fix anything it fails
   on, repeat until clean.
   3b. **`enrich --require-complete`** — the "am I done?" gate. Everything `--no-emit` checks,
   plus it FAILS on any unfilled blank. A blank value ships blank to the app, so it is
   treated exactly like an unresolved `@todo`. Run it before you call the enrichment finished
   (it is what CI and a production bundler build enforce).
4. **`enrich --update`** — when the type later changes, re-sync the file _value-preservingly_
   (property merge + field rename + orphaning); fill any new `@todo`s it adds.
5. **`enrich --prune`** — the only destructive op: removes the `@rtOrphan`/`@rtOrphanChild`
   carcasses left by deleted types/fields.
6. **`enrich --i18n <locale|all> [<src.ts>] [--update|--prune]`** — scaffold, reconcile,
   or prune the per-locale translation files of the friendly maps (see **Translations**
   below).
7. **`enrich --i18n <locale|all> --no-emit`** — report translation status (TR001–TR004,
   warnings by default); **`--require-complete`** (or tsconfig `i18n.strict`) makes it FAIL
   for CI. See **Translations** below.

Every verb takes **`--tsconfig <path>`**. Without it the CLI finds the config exactly as
tsc does — searching upward from the working directory. The ONE resolved config feeds
both the genDir/i18n settings AND type resolution — the CLI reads types under the same
compiler options as the build. A config that was named or discovered but is missing or
broken stops the command with an error; only a project with no tsconfig at all falls back
to the built-in defaults.

Never call an LLM inside a build — enrichment authoring is an explicit, out-of-band step
that produces a reviewable, committed diff.

## Where it lives — the mirror directory, one file per family

Enrichment is committed to a **mirror directory** whose tree shadows your source, split
**per family**: a type defined in `<rootDir>/models/user.ts` gets its `friendly<Name>`
consts (`FriendlyText<Name>`) in `<genDir>/enriched/friendly/models/user.ts` and its
`mock<Name>` consts (`MockData<Name>`) in `<genDir>/enriched/mock/models/user.ts` (default
`genDir`: `<genDir>/enriched`, configurable via the `ts-runtypes` entry under
`compilerOptions.plugins` in `tsconfig.json`). One mirror file per family per source
file, anchored at the type's **definition** (not its call sites); the two families never
share a file, and each family file imports only its own wrapper type.

A pre-split combined mirror is migrated automatically on the next `enrich` run over that
source: every const, marker, comment and `@rtOrphan` carcass is carried verbatim into its
family's file, the source breadcrumb import is recomputed, and the old combined file is
deleted (an existing family file is never overwritten — a warning is printed instead).
`enrich --no-emit` flags a pre-split combined mirror as GE001 location drift. `--out` keeps the
old combined single-file behavior as an explicit escape hatch.

Each family file holds a strict `import type` back to the source (the rename
**breadcrumb**) and committed consts you import by name:

```ts
// src/__runtypes/enriched/mock/models/user.ts — GENERATED, COMMITTED, hand-editable
import type {User} from '../../../../models/user';
import type {MockData} from 'ts-runtypes';

/** @rtType User#9f3a @rtIds {name: a1, age: b2} */
// @todo: generated skeleton — fill in real data, then delete this line
export const mockUser: MockData<User> = {name: {pool: []}, age: {pool: []}};
```

Consumers use a **real, committed import** (never plugin-injected — enrichment is
committed, so its link is committed too):

```ts
import {friendlyUser} from 'src/__runtypes/enriched/friendly/models/user';
import {mockUser} from 'src/__runtypes/enriched/mock/models/user';
createMockDataFn<User>({data: mockUser});
```

## The JSDoc tags

`@rt`-prefixed tags are **compiler-owned** — the compiler reads/writes them; do not edit
them by hand. A plain `@todo` is **yours** — the compiler only emits it.

| Tag                     | Owner    | Meaning                                                                                            |
| ----------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `@rtType <Name>#<id>`   | compiler | the const's stable structural identity; reconcile matches by this, not the var name                |
| `@rtIds {field: id, …}` | compiler | each field's child type id — lets `--update` detect a field **rename** and carry your value across |
| `@rtOrphan …`           | compiler | a whole const whose source type is gone — commented out (value preserved), removed by `--prune`    |
| `@rtOrphanChild …`      | compiler | a single field removed from the type — commented out (value preserved), removed by `--prune`       |
| `@todo …`               | **you**  | a blank the compiler scaffolded — fill it in, then **delete the line**                             |

Hand-authored comments are preserved across `--update` and travel with a renamed field.
`--update` never edits your values; it only adds blanks, flags stale values, and orphans
gone fields. `--prune` is the only command that deletes.

## `FriendlyText<T>` — labels + error messages

A combined, per-field map: `rt$label` (a human name) + `rt$errors` (one message template per
declared failable constraint — the mapped type requires each key — or the exclusive
`{rt$default: '…'}` catch-all; count-bearing constraints scaffold plural objects; the
scaffold is always per-constraint; switch a node to `rt$default` by hand). Pure data;
rendered at runtime by `createFriendlyText<T>(map)`, or by `createFriendlyTextI18n` with
committed translations. The full authoring DSL — node shape, constraint keys, the `$[…]`
placeholder DSL, plural rules, the `rt$default` mode, the FT0xx checks, runtime
rendering — is the **`runtypes-friendly-type`** skill; use it whenever you author or
fill a friendly map.

## Translations — per-locale friendly files

The friendly map you author IS the source language (tsconfig `i18n.sourceLocale`, default
`en`) — there is no separate default catalog and no separate translation type. Each
target locale gets committed `FriendlyText<T>` files that shadow the friendly mirror
tree: `<i18nDir>/<locale>/<rel>.ts` (default `i18nDir`: `<genDir>/enriched/i18n`, resolved
under the project root; the locale is a path segment, so `pt-BR` works verbatim). The
const per type is `<locale>_friendly<Name>` (BCP-47 `-` becomes `_`:
`pt_BR_friendlyUser`), annotated `FriendlyText<Name>`, carrying the SAME
`@rtType <Name>#<id> @rtIds {…}` markers as the source — the path + const prefix carry
the locale. Every locale file is generated FROM THE SOURCE TYPE by the same driver as
the friendly mirror itself; the mirror is a discovery input only (which sources
translate), never a content input.

```
ts-runtypes enrich --i18n <locale> [<src.ts>]           # scaffold (create-only)
ts-runtypes enrich --i18n <locale> --update [<src.ts>]  # reconcile from the SOURCE TYPE
ts-runtypes enrich --i18n <locale> --prune  [<src.ts>]  # strip @rtOrphan carcasses (the only delete)
ts-runtypes enrich --i18n all [--update]                # fan out over tsconfig i18n.locales
ts-runtypes enrich --i18n <locale|all> --no-emit        # report status (warnings, exit 0)
ts-runtypes enrich --i18n <locale|all> --require-complete  # completeness gate (fails CI)
```

Without `<src.ts>`, targets are "sources that have a friendly mirror" — path math over
`<genDir>/enriched/friendly/`; the mirror's content is never read.

- **Scaffold + fill rules** — a scaffold is the type's tree with every string leaf and
  plural arm as an `@todo` blank (`''`); it NEVER copies source text as if translated.
  The authoring rules (translate only blank leaves, arms are locale-owned, prune
  freely) are in the **`runtypes-friendly-type`** skill's Translations section.
- **`--update`** — the same value-preserving reconcile as `enrich --update` (one driver for
  every friendly-family file), including the one-level `rt$errors` descent: a newly
  declared constraint key arrives as a blank of the right kind (string, or a plural with
  THAT FILE's locale arms); a dropped RECOGNIZED constraint key becomes an
  `@rtOrphanChild` carcass (unknown keys are author-owned, untouched); a same-key leaf is
  kept byte-identical; a `rt$default`-only node is never descended. Plural arms are never
  orphaned, renamed, or down-scoped. Type renames carry across locales via the shared
  `@rtType` id (const, annotation, marker AND intra-file references are renamed in
  place).
- **`enrich --i18n --no-emit` findings** — TR001 missing translation file; TR002 unfilled
  `@todo` blanks; TR003 out of date vs the SOURCE TYPE (a src-driven reconcile would
  change the file); TR004 orphan carcasses awaiting review/prune. All Warnings (exit 0)
  unless tsconfig `i18n.strict: true` OR the `--require-complete` flag flips them to Errors
  (exit 1); the runtime is always lenient regardless.

The `i18n` block lives on the `ts-runtypes` tsconfig plugin entry (dormant by default —
zero change when absent):

```jsonc
{
  "name": "ts-runtypes",

  "i18n": {
    "sourceLocale": "en", // language the source FriendlyText maps are written in
    "dir": "src/__runtypes/enriched/i18n", // translation subtree root (default <genDir>/enriched/i18n)
    "locales": ["es", "pl", "pt-BR"], // target locales (the source locale is NOT listed)
    "strict": false, // when true, the i18n check fails on incompleteness by default (same as --require-complete)
  },
}
```

Runtime rendering — `createFriendlyTextI18n`, `resolveLocale` matching, per-leaf fallback,
type-driven `$[val]` rendering (Currency / date bounds) — is covered in the
**`runtypes-friendly-type`** skill.

## `MockData<T>` — realistic sample data

Per-field value pools and ranges (`pool`, `min`/`max`, `rt$items`/`rt$length`, `rt$optional`)
that feed `createMockDataFn<T>({ data })`: the mechanical generator keeps handling
structure + format-correctness, you supply _believable_ values. The full authoring DSL
— node shapes per field kind, the MD0xx checks, end-to-end wiring — is the
**`runtypes-mock-data`** skill; use it whenever you author or fill a mock map.

## Authoring checklist

- The `enrich` scaffold lays out every field; write values that fit each field's kind + format.
- Fill **every `@todo`** the scaffold left AND every blank value (`''` label/message, `[]`
  pool), then **delete that `@todo` line**. A leftover blank is treated exactly like an
  unresolved `@todo` by the completeness gate.
- Never touch `@rt*` tags or `@rtOrphan`/`@rtOrphanChild` comment blocks — the compiler
  owns them; `--prune` clears orphans.
- After editing, run `enrich --no-emit` and resolve every Error. Before you call the
  enrichment finished, run `enrich --require-complete` (and `enrich --i18n <locale|all>
--require-complete` for translations) — it fails until every `@todo` and blank is filled.
- When the type changes, prefer `enrich --update` (keeps your values) over regenerating.
- The family-specific rules — friendly constraint keys, plural arms, translation fill
  discipline, mock pools/ranges — are in the **`runtypes-friendly-type`** and
  **`runtypes-mock-data`** skills' checklists.
