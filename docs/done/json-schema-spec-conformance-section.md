---
type: feature
spec: full-plan
status: done
created: 2026-08-03
---

# JSON Schema spec-conformance section on the Correctness page

Built directly on request rather than from a filed todo, so this doc is the
record of what shipped.

## Problem

The JSON_SCHEMA group on the validation pages proves we SUPPORT a keyword. It
does not prove we read it the way draft 2020-12 says: each case is one document
with a handful of samples, chosen so the other competitors could express it too.
Nothing anywhere measured our schema door against the dialect.

The existing Correctness table could not answer it either, because it makes
RunTypes the reference column: every library is scored against the
ts-runtypes-authored samples, so our own column is zero by construction.

## What shipped

A second table on the Correctness page, `bench: json-schema-spec`, where **the
oracle is the specification**. The corpus samples are labelled by draft 2020-12
and every library is scored against those labels, so the ts-runtypes column can
show a non-zero cell, which is the whole point.

- **Corpus**: `container/benchmarks/shared/cases/json-schema-spec/` — **65 cases
  over 351 samples**, one per keyword, in 11 families (Types, Objects, Arrays,
  Combinators, Conditionals, References, Strings, Numbers, Unevaluated,
  Annotations, Content). Sourced from the guide's keyword table, which is total
  over the dialect.
- **Competitors**: ts-runtypes (`runTypeFromJsonSchema`) and ajv, the only two
  that consume a document. TypeBox's compiler refuses a plain document (its
  `Schema.Compile` is unreleased, see
  [bench-website-e2e-followups.md](../todos/bench-website-e2e-followups.md));
  zod and typia have no document input at all.
- **Runner**: `container/benchmarks/shared/harness/spec.ts`, gated by
  `RT_SPEC_CONFORMANCE=1`, same per-competitor process model as `audit.ts`.
- **Lane**: `pnpm rtx bench spec`, also called from `cmdWebsiteBench`.
- ajv builds its map from the shared corpus, so a case can never be silently
  missing; ts-runtypes must re-author each document inline (the door reads its
  literal at build time), and that second copy is deep-equalled against the
  corpus by a contract test.

**Nothing touches `CaseKey`**, which is what keeps the validation and typecost
tables unchanged.

## Results on the first run

- **ts-runtypes 61/65.** Four genuine conformance gaps, filed as
  [json-schema-spec-conformance-gaps.md](../todos/json-schema-spec-conformance-gaps.md):
  `allOf` silently dropping a bare `minimum`, a bare constraint at the root
  tripping MKR009, `dependentSchemas` over-rejecting when the trigger key is
  absent, and two format patterns (`ipv4` accepting `localhost`, `uri` rejecting
  `mailto:`). Not fixed here: each is a core-library change needing its own
  investigation and unit tests.
- **ajv 62/65.** Exactly the three expected divergences, documented on the
  corpus and in the page prose: NaN/Infinity under `{type: 'number'}`, and the
  two content keywords the dialect defines as optional annotations.

## Two bugs the build caught in itself

- **A wrong label in the corpus.** `{oneOf: [{multipleOf: 3}, {multipleOf: 5}]}`
  was written expecting `'a'` to match only the string branch. A bare
  `multipleOf` is vacuously TRUE for a non-number, so every value hit both
  branches. ajv contradicted the label, the label was wrong, and both `oneOf`
  cases now gate their branches with `type`.
- **`*.spec.json` clobbering the validation data.** `gen-docs`'s competitor
  results loader globs `results/*.json` behind an exclusion list, and the new
  spec files carry the same `competitor` field with spec-keyed `cases`, so they
  overwrote the real ts-runtypes and ajv timing results and blanked every row
  only those two populate. Caught by `check --static`, which is exactly the
  failure that gate exists for. `.spec.json` is now excluded.

## Verification

`pnpm test` 10,476 passed; lint and typecheck clean; `pnpm rtx bench --website`
exit 0 with only the two known pre-existing FAILED lines (zod and typia exit
codes, both already tracked); `pnpm rtx website check --static` PASS on all 8
benchmark pages, the Correctness page reporting two bench tables and 65/65 cases
rendering in 11 sections.

## Out of scope

- Fixing the four conformance gaps (filed separately).
- The official JSON-Schema-Test-Suite corpus as a deeper gate; the curated
  matrix is what shipped.
- Build-time rejections (embedded `$id`, `contentSchema`, `unevaluated*` beside
  branch-dependent combinators, `oneOf` beside a constraining sibling). They are
  not runtime verdicts and the `json-schema-define` unit suite covers them.
