---
type: docs
spec: guidelines
status: open
created: 2026-08-05
---

# The JSON Schema guide's keyword table, and a compiled examples file

Split out of
[json-schema-negation-and-jsoncontent-collapse.md](../done/json-schema-negation-and-jsoncontent-collapse.md),
deferred by decision when that landed so the PR stayed on the two code items.

## What exists today

[2.guide/02.json-schema.md](../../container/website/content/2.guide/02.json-schema.md)
is API-TRUE: the accepted-keyword summary and the format/builder rows all match
what ships, including the content keywords. Nothing there is wrong.

## What is missing

A single table a reader can scan to answer "I have this JSON Schema keyword —
what do I write instead?", with one row per keyword and four columns:

| keyword | JSON Schema | RunTypes type | value-first builder |

The source of truth already exists as `SchemaLoweringByKeyword` in
`src/json-schema/fromJsonSchema.ts`, whose totality is compiler-enforced and
whose rows are behaviour-checked by
`test/suites/json-schema-define/loweringTable.test.ts`. The table on the website
is the reader-facing rendering of that, so it should be written FROM it.

Then a compiled examples file under `packages/examples/src/`, imported by the
page with `<code-import>` rather than hand-written fences, so the type checker
catches drift (per the website docs style rule: examples that compile beat
examples that rot).

## Watch out for

- **Website voice** (CLAUDE.md → Website Documentation): plain, user-focused, no
  dashes chaining clauses, no internals. The channel vocabulary the type uses
  (`slot`, `desugar`, `params`) is INTERNAL — a reader wants "becomes an option
  on the array's options bag", not "rides FormattedArrayParams".
- Keep the edit scoped: no restructuring of existing MDC components, and verify
  the per-file MDC-component and code-fence counts against the pre-edit baseline
  afterwards.
- 56 keywords is a long table. Consider grouping by kind (strings / numbers /
  arrays / objects / combinators / references / annotations) the way the existing
  accepted-keyword summary already does, rather than one flat list.
