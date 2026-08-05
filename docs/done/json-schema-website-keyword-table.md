---
type: docs
spec: guidelines
status: done
completed: 2026-08-05
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

## What shipped

One section, `Which keywords map to what`, REPLACING both tables that were there.
They overlapped heavily: the coverage table listed all 56 keywords by area, and
the mapping table gave the type and builder spellings for most of them. A table
with one row per keyword does both jobs, and being one row per keyword is itself
the totality claim.

Four columns, as specified: keyword, how it looks in a schema, the type
spelling, the builder spelling. Split into per-area tables (Types, Objects,
Arrays and tuples, Strings, Numbers, Combinators, Conditionals, References,
Unevaluated, Annotations) rather than one 56-row block, which is what the
grouping note in this spec asked for.

Totality is checked, not asserted: every key of `SchemaLoweringByKeyword` appears
in the section exactly once. The 15 keywords the old mapping table never covered
(the annotations, `unevaluated*`, and the anchors) now have rows, with "nothing,
the type is unchanged" where that is the honest answer.

Compiled examples in `packages/examples/src/guide/json-schema-keywords.ts`,
imported per area with `<code-import>`, so the type checker catches drift. Each
shows the schema, the type and the builder landing on ONE generated function via
`getRunTypeId`, rather than merely behaving alike.

### Two things beyond the original scope

`Things worth knowing` lost the paragraph that described the structural keywords
riding a params bag: the new tables say it row by row, so the prose was repeating
them. The rest of that section was re-read and is still accurate.

The type-formats page said formats come in FOUR families, which stopped being
true when the collection keywords became a surface of their own. It now says five,
the family table has an Array / object row, and there is a new section,
`Constraints on arrays and objects`, covering the two wrappers, the full option
list, and why `uniqueItems` has no TypeScript spelling. Its examples live in
`packages/examples/src/guide/structural-formats.ts` and cross-link back to the
keyword table.

## Original scope follows

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
