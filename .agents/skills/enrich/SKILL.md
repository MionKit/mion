---
name: enrich
description: Routes FriendlyText, MockData and mion enrich CLI work to the run-types skills. Use for any enrichment.
---

# RunTypes enrichment: where the real skills live

Use [the tool mapping](../TOOLS.md) for assistant-specific calls and fallbacks.

The three enrichment skills live in ONE place: the published package (ships to consumers via `npx mion-skills`).
Never duplicate them here. READ the matching file before any enrichment work:

- [rt-enrich-types](../../../packages/run-types/skills/rt-enrich-types/SKILL.md): the WORKFLOW.
  - Running `enrich` / `enrich --update` / `enrich --prune` / `enrich --i18n` / `enrich --no-emit` /
    `enrich --require-complete`.
  - Mirror directory layout. The `@rtType`/`@rtIds`/`@rtOrphan`/`@todo` tag contract.
  - Translations + the tsconfig `i18n` block.
- [runtypes-friendly-text](../../../packages/run-types/skills/runtypes-friendly-text/SKILL.md):
  AUTHORING a `FriendlyText<T>`.
  - The `{ rt$label, rt$errors, ...children }` node shape, param-precise error keys, the exclusive `rt$default` mode.
  - The `$[…]` placeholder DSL, plurals, translations, `createFriendlyText` / `createFriendlyTextI18n`.
- [runtypes-mock-data](../../../packages/run-types/skills/runtypes-mock-data/SKILL.md): AUTHORING a `MockData<T>`.
  - Per-field `{ pool }` / `{ min, max }` / `{ rt$items, rt$length }` / `{ rt$optional }` nodes.
  - The enrich-mock-invalid-pool pool-validation rule.

## Ground rules (all three)

- Meta keys carry the RESERVED `rt$` prefix (`rt$label`, `rt$errors`, `rt$default`, `rt$items`, …).
- A source-type property named `rt$…` cannot be enriched: `enrich` refuses it
  (enrich-text-reserved-prefix / enrich-mock-reserved-prefix). A plain `$foo` property is an ordinary field.
- Compiler scaffolds, you fill the blanks. Never delete a scaffolded key (blank `''` = no custom text).
- Never edit `@rt*` tags by hand.
- `enrich --prune` is the only destructive operation.

Design reference: [docs/AI_ENRICHMENT.md](../../../docs/AI_ENRICHMENT.md).
