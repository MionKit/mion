---
type: fix
spec: full-plan
status: ready
created: 2026-08-02
---

# JSON Schema typecost: drop the builder stand-ins, cover every case

Filed from the first full bench run of the JSON Schema rollout branch
(2026-08-02). The typecost JSON_SCHEMA section ships fabricated and
under-scoped data.

## Problem

Two defects in the typecost bench's JSON Schema story:

1. **A fabricated ts-runtypes column.** On JSON_SCHEMA rows, BOTH
   `ts-runtypes (schema)` and `ts-runtypes (jsonSchema)` carry numbers. The
   (schema) values come from hand-written TF-builder equivalents
   (`container/benchmarks/competitors/ts-runtypes/schemaCases.ts:723-737`,
   e.g. `TF.number({integer: true, min: 0, max: 130})` standing in for the
   `int_bounded` document). No runtypes↔JSON-Schema transform exists in the
   product, so presenting a builders number as "ts-runtypes on this schema
   document" is an equivalence we invented for the bench. ts-runtypes' one
   real door for a schema document is `runTypeFromJsonSchema` — the
   (jsonSchema) column.

2. **The document columns cover 10 of 276 cases.** `jsonSchemaCases.ts` (70
   lines) and `json-schema-to-ts/cases.ts` (53 lines) are deliberately
   lane-scoped to the JSON_SCHEMA group (their headers say so), so
   `ts-runtypes (jsonSchema)` and `json-schema-to-ts` render n/a on every
   other row. But the validation suite already proves full coverage is
   possible: `competitors/ajv/cases.ts` is a TOTAL map over all shared case
   keys — every supported case authored as a draft 2020-12 document, and
   everything JSON Schema cannot express marked `NOT_SUPPORTED` (115 keys).
   The typecost document columns should answer the same question over the
   same coverage: what does recovering a type from each case's document cost
   the checker — exactly the "heavy in type mappings" cost the new
   FromJsonSchema feature needs visible.

## Plan

**A. Kill the stand-ins (one ts-runtypes column per lane).**

- `container/benchmarks/competitors/ts-runtypes/schemaCases.ts:723-737` —
  replace the ten JSON_SCHEMA entries with `NOT_SUPPORTED` (comment: a schema
  document has no value-first twin; no runtype→JSON Schema transform exists).
  Keeps the map's declared totality (`CompetitorCases = Record<CaseKey, …>`)
  while the extractor's `unwrapThunk` already skips `NOT_SUPPORTED` → n/a.
  Update the file header (it promises "TOTAL over every key" with entries).

**B. Grow the two document maps to TOTAL coverage.**

- `container/benchmarks/competitors/ts-runtypes/jsonSchemaCases.ts` — from 10
  entries to a total map over `CaseKey`: each ajv-supported case gets
  `() => createValidateFn(runTypeFromJsonSchema(<document>))` with the
  document transcribed from ajv's map (same bytes wherever possible — ajv is
  the validation-suite truth); each ajv-`NOT_SUPPORTED` key gets
  `NOT_SUPPORTED`. Change the type from `Partial<Record<…>>` to the total
  shape and rewrite the "Deliberately LANE-SCOPED" header — the lane is now
  the whole suite.
- `container/benchmarks/competitors/json-schema-to-ts/cases.ts` — same
  growth: per-key document `as const` (FromSchema needs the literal type) or
  `NOT_SUPPORTED`; rewrite the "Lane-scoped like jsonSchemaCases" header.
- `container/benchmarks/_lib/extract-cases.mjs` — `extractSchemaDocs` must
  skip `NOT_SUPPORTED` string entries (thunk maps already skip via
  `unwrapThunk`; the docs map is plain values).
- **The not-supported set mirrors the validation suite exactly** (ajv's 115).
  Where an ajv-supported document trips a `runTypeFromJsonSchema` rejected
  corner (embedded `$id`, `contentSchema`, `unevaluated*` beside
  branch-dependent combinators, `oneOf` beside constraining siblings — the
  guide's keyword table is total, so these are the only classes) or a
  FromSchema limitation, mark it `NOT_SUPPORTED` with a one-line reason and
  list every such delta in the PR description.

**C. Consequential mechanics.**

- `container/benchmarks/typecost/typecost.mjs:377-390` — rewrite the "two
  SCHEMA-DOCUMENT forms are lane-scoped" comment (coverage is now total; ajv
  still has no form: no static inference). Baselines stay as-is.
- `scripts/website/bench-data/gen-docs.mjs` (buildTypecostBench, ~line 484)
  — only emit a hover source for cells that have a measurement
  (`inst !== undefined`). Today `ts-runtypes (type)` shows a
  `runTypeFromJsonSchema` hover source on JSON_SCHEMA rows it doesn't
  measure.
- Runtime json-schema suite (10 cases), zod/typebox/typia typecost entries:
  untouched.

## Tests

- New host-side contract test (sibling of
  `packages/ts-runtypes-devtools/test/repo-contracts.test.ts`, which already
  reaches into bench files): AST-read the three maps (reuse
  `container/benchmarks/_lib/extract-cases.mjs` with the workspace
  TypeScript) and pin: (a) `jsonSchemaCases` and `json-schema-to-ts/cases`
  key sets equal the shared `CaseKey` set — totality; (b) every key ajv marks
  `NOT_SUPPORTED` is `NOT_SUPPORTED` in both document maps, and every
  supported-set delta beyond ajv's carries a reason comment; (c)
  `schemaCases` has no thunk entries in the JSON_SCHEMA group.
- Execution smoke: import `jsonSchemaCases` in Vitest (its imports are
  workspace-only) and call every supported thunk once — each must return a
  function, proving every transcribed document is accepted by
  `runTypeFromJsonSchema` at runtime, not just parsed.
- Marker-API call shapes: not applicable (no `getRunTypeId` surface touched).
- Full verification: `pnpm rtx bench typecost` (container) then
  `node scripts/website/bench-data/gen-docs.mjs` — JSON_SCHEMA rows show one
  ts-runtypes column with values; document columns populated across all
  groups except mirrored not-supported rows.

## Docs

- `container/website/content/7.benchmarks/7.compiletime.md` — the paragraph
  "The schema document columns only apply to the JSON Schema rows … Every
  other row reads n-a for them" becomes false and must be rewritten (plain
  language, no dash punctuation, prose-only edit).
- Check `container/website/content/7.benchmarks/9.json-schema.md` prose still
  matches (runtime lane unchanged, so likely no edit).

## Fuzzing

Not a fuzz target (bench tooling, fixed input set). The execution smoke above
is the cheap oracle: every document accepted by the real
`runTypeFromJsonSchema`.

## Out of scope

- The `(schema)` → "Type Builders" naming
  ([rename-value-first-schema-to-type-builders.md](rename-value-first-schema-to-type-builders.md)).
- A CI `tsc` gate over all competitor maps
  ([benchmark-competitor-maps-never-typechecked.md](benchmark-competitor-maps-never-typechecked.md))
  — the new contract test pins only the JSON-Schema mirror, not general
  totality.
- Runtime json-schema validation suite changes (its 10 cases stay).
- Typecost runtime cost: ~150 extra probes per document column lengthen the
  container run; acceptable, `RT_BENCH_QUICK` exists if it hurts.

## Done when

- JSON_SCHEMA typecost rows show exactly one ts-runtypes column with values
  (`jsonSchema`); `(schema)` reads n/a there.
- `ts-runtypes (jsonSchema)` and `json-schema-to-ts` have a value or an
  explicit mirrored not-supported on every one of the 276 cases.
- The contract test + execution smoke pass in `pnpm test`; the compiletime
  page prose matches the new table; full site regenerates via
  `pnpm rtx bench --website` with no new FAILED lines.
