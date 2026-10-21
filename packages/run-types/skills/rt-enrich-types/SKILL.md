---
name: rt-enrich-types
description: FriendlyText/MockData enrich loop: mion enrich CLI, @todo blanks, @rt* tags, i18n. Use to scaffold/fill.
---

# RunTypes enrichment: compiler scaffolds, you fill blanks

- Enrichment = committed, type-keyed data RunTypes cannot generate on its own.
  - `FriendlyText<T>`: human labels + error messages. `MockData<T>`: realistic sample values.
- Validators/codecs: pure functions of the type, recomputed every build, never committed.
- Enrichment: authored once, committed, validated against the type forever after.
- Full design: [docs/AI_ENRICHMENT.md](https://github.com/MionKit/mion/blob/main/docs/AI_ENRICHMENT.md).
- Compiler writes the code: real, type-accurate file, every field in place, gaps marked `@todo`.
- You (the agent) fill the gaps with believable, valid content.
- ⚠️ Never call an LLM inside a build. Authoring = explicit out-of-band step → reviewable, committed diff.

## The loop

1. **`enrich`**: scaffold the mirror file. One entry per field, correctly typed, each blank marked `@todo`.
2. **Fill the `@todo`s**: labels, messages, sample values. Delete each `@todo` line when done.
3. **`enrich --no-emit`**: health check. Validates every authored value against the live type.
   - FAILS on WRONG or stale content (dead field, leftover carcass).
   - Only REPORTS unfilled blanks: `@todo` lines, empty `''` labels/messages, empty `[]` pools.
   - (A fresh scaffold is expected to carry blanks.) Fix what fails, repeat until clean.
   - **3b. `enrich --require-complete`**: the "am I done?" gate. All `--no-emit` checks + FAILS on any blank.
     A blank value ships blank to the app → treated exactly like an unresolved `@todo`.
     Run before calling enrichment finished. CI and a production bundler build enforce it.
4. **`enrich --update`**: type changed → value-preserving re-sync (property merge + field rename + orphaning).
   Fill any new `@todo`s it adds.
5. **`enrich --prune`**: the only destructive op. Removes `@rtOrphan`/`@rtOrphanChild` carcasses
   left by deleted types/fields.
6. **`enrich --i18n <locale|all> [<src.ts>] [--update|--prune]`**: scaffold, reconcile or prune
   per-locale translation files of the friendly maps.
7. **`enrich --i18n <locale|all> --no-emit`**: translation status (enrich-i18n-\*, warnings by default).
   **`--require-complete`** (or tsconfig `i18n.strict`) makes it FAIL for CI.

Translations (steps 6-7): CLI, `--update` rules, findings, tsconfig `i18n` block → [translations.md](translations.md).

## tsconfig

- Every verb takes **`--tsconfig <path>`**. Without it: found exactly as tsc does, searching upward from cwd.
- ONE resolved config feeds genDir/i18n settings AND type resolution (same compiler options as the build).
- Config named or discovered but missing/broken → command stops with an error.
- Only a project with no tsconfig at all falls back to built-in defaults.

## Mirror directory + JSDoc tags

Where files live, consumer imports, tag ownership table → [mirror.md](mirror.md). Read before editing a mirror file.

- `@rt`-prefixed tags = compiler-owned. Never edit by hand. Plain `@todo` = yours; compiler only emits it.
- `--update` never edits your values. `--prune` is the only command that deletes.

## `FriendlyText<T>`: labels + error messages

- Combined per-field map: `rt$label` (human name) + `rt$errors`.
- `rt$errors`: one template per declared failable constraint, or exclusive `{rt$default: '…'}` catch-all.
  - `type` required. Other constraint keys optional in the type: `enrich` scaffolds each, a missing one is reported.
  - Count-bearing constraints scaffold plural objects.
  - Scaffold always per-constraint. Switch a node to `rt$default` by hand.
- Pure data. Rendered at runtime by `createFriendlyText<T>(map)`, or `createFriendlyTextI18n` + committed translations.
- Full DSL (node shape, constraint keys, `$[…]` placeholders, plurals, `rt$default`, enrich-text-\* checks,
  runtime rendering) = **`runtypes-friendly-text`** skill. Use it whenever you author or fill a friendly map.

## `MockData<T>`: realistic sample data

- Per-field pools + ranges: `pool`, `min`/`max`, `rt$items`/`rt$length`, `rt$optional`.
- Feeds `createMockDataFn<T>(undefined, { data })`.
- Mechanical generator keeps handling structure + format-correctness; you supply _believable_ values.
- Full DSL (node shapes per field kind, enrich-mock-\* checks, end-to-end wiring) = **`runtypes-mock-data`** skill.
  Use it whenever you author or fill a mock map.

## Authoring checklist

- `enrich` scaffold lays out every field. Write values that fit each field's kind + format.
- Fill **every `@todo`** AND every blank value (`''` label/message, `[]` pool), then **delete that `@todo` line**.
  A leftover blank = unresolved `@todo` for the completeness gate.
- Never touch `@rt*` tags or `@rtOrphan`/`@rtOrphanChild` comment blocks. Compiler owns them; `--prune` clears orphans.
- After editing: `enrich --no-emit`, resolve every Error.
- Before calling it finished: `enrich --require-complete` (+ `enrich --i18n <locale|all> --require-complete`
  for translations). Fails until every `@todo` and blank is filled.
- Type changed → prefer `enrich --update` (keeps your values) over regenerating.
- Family rules (friendly constraint keys, plural arms, translation fill discipline, mock pools/ranges):
  **`runtypes-friendly-text`** and **`runtypes-mock-data`** skills' checklists.
