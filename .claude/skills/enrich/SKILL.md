---
name: enrich
description: Entry point for ALL RunTypes enrichment work — the committed, type-keyed FriendlyText<T> (human labels + rt$errors message templates, per-locale translations) and MockData<T> (realistic sample pools/ranges) maps, and the `ts-runtypes` CLI that maintains them (`enrich` / `enrich --update` / `enrich --prune` / `enrich --i18n` / `enrich --no-emit` / `enrich --require-complete`). Use when scaffolding or filling an enrichment mirror file, writing friendly validation errors or field labels, authoring mock data pools, translating a friendly map, filling `@todo` blanks, working with `rt$label` / `rt$errors` / `rt$default` / `rt$items` / pool keys or the `@rtType` / `@rtOrphan` JSDoc tags, or configuring the tsconfig i18n block (enrichment paths are convention under `genDir`, not configurable). This skill only ROUTES: the authoritative skills live in packages/run-types/skills/ — read the one you need before authoring.
---

# RunTypes enrichment — where the real skills live

The three enrichment skills are maintained in ONE place, inside the published
package (they ship to consumers via `npx ts-runtypes-skills`). Do not duplicate
their content here — READ the relevant file before doing enrichment work:

| Read this file | When the task is |
| --- | --- |
| [packages/run-types/skills/rt-enrich-types/SKILL.md](../../../packages/run-types/skills/rt-enrich-types/SKILL.md) | the WORKFLOW: running `enrich` / `enrich --update` / `enrich --prune` / `enrich --i18n` / `enrich --no-emit` / `enrich --require-complete`, the mirror directory layout, the `@rtType`/`@rtIds`/`@rtOrphan`/`@todo` tag contract, translations + the tsconfig `i18n` block |
| [packages/run-types/skills/runtypes-friendly-type/SKILL.md](../../../packages/run-types/skills/runtypes-friendly-type/SKILL.md) | AUTHORING a `FriendlyText<T>`: the `{ rt$label, rt$errors, ...children }` node shape, param-precise error keys, the exclusive `rt$default` mode, the `$[…]` placeholder DSL, plurals, translations, `createFriendlyText` / `createFriendlyTextI18n` |
| [packages/run-types/skills/runtypes-mock-data/SKILL.md](../../../packages/run-types/skills/runtypes-mock-data/SKILL.md) | AUTHORING a `MockData<T>`: per-field `{ pool }` / `{ min, max }` / `{ rt$items, rt$length }` / `{ rt$optional }` nodes and the MD003 pool-validation rule |

Two ground rules that apply across all three:

- Enrichment meta keys carry the RESERVED `rt$` prefix (`rt$label`, `rt$errors`,
  `rt$default`, `rt$items`, …) — a source-type property named `rt$…` cannot be
  enriched (`enrich` refuses it; FT011/MD011), while a plain `$foo` property is an
  ordinary field.
- The compiler scaffolds, you fill the blanks: never delete a scaffolded key
  (blank `''` = no custom text), never edit `@rt*` tags by hand, and `enrich
  --prune` is the only destructive operation.

Design reference: [docs/AI_ENRICHMENT.md](../../../docs/AI_ENRICHMENT.md).
