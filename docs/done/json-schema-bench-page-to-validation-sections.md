---
type: fix
spec: full-plan
status: done
created: 2026-08-02
---

# Fold the JSON Schema bench page into Validation + Validation Formats sections

Follow-up to the JSON Schema rollout benchmarks. Related to but distinct from
[json-schema-typecost-full-coverage.md](json-schema-typecost-full-coverage.md)
(typecost columns); this one is the RUNTIME pages and the case set.

## Problem

The dedicated `/benchmarks/json-schema` page frames the lane as "who can
consume a schema document directly", so only ts-runtypes and ajv have
numbers and every other column reads not-supported ("no JSON Schema input").
Two things are wrong with that:

1. **Most of its 10 cases are not JSON-Schema stories at all.** string_array,
   tuple_pair, object_simple, record_number, union_anyof, recursive_tree and
   realworld_user are plain shapes or unions the main Validation table
   already benches in every dialect (ARRAY.string_array is literally the
   same case). A whole page for that duplicates comparisons.
2. **The consumption framing hides real competitor capability.** The
   interesting JSON Schema stories are the schema-only CONSTRAINTS
   (additionalProperties: false, patternProperties, uniqueItems, contains,
   multipleOf, …). Competitors cannot consume the document, but their
   dialects can often express the same constraint (TypeBox supports most of
   these natively; zod some). Those columns should be filled the same way
   every other validation row is: each library in its own dialect.

So: remove the page, and give the Validation and Validation Formats pages a
JSON_SCHEMA section holding only schema-unique constraint cases, competitors
filled wherever their dialect has an equivalent.

## Plan

**A. Re-home the shared cases (suite fold).**

- `container/benchmarks/shared/cases/json-schema/JsonSchema.ts` keeps the
  `JsonSchemaCase` shape (the `schema` document field) but splits into two
  group objects: structural cases collected into `VALIDATION_SUITE` and
  value-constraint cases into `FORMAT_VALIDATION_SUITE`, both under the
  group name `JSON_SCHEMA` (placed last in each suite object, so the section
  renders last on each page). Case names must stay unique across the two.
- `container/benchmarks/shared/cases/index.ts` — drop `'json-schema'` from
  `SuiteName`, its import and its `collect()` call. `CaseKey` keeps the
  `JSON_SCHEMA.<name>` spelling via the two host suites.
- ajv keeps importing the shared docs
  (`competitors/ajv/cases.ts` top: `doc(key)` helper) — import path
  unchanged.

**B. The case set (schema-only constraints; everything else drops).**

Dropped (covered by existing groups): string_array, tuple_pair,
object_simple, record_number, union_anyof, recursive_tree, realworld_user.

Kept, moved to the Validation FORMATS section: string_email (format as a
real constraint), int_bounded (minimum/maximum), string_pattern (bare
2020-12 regex — the value-first side needs registerFormatPattern, which is
exactly what makes it schema-flavored).

New cases. Validation page section (structural constraints):

| case | document core |
|---|---|
| closed_object | `additionalProperties: false` really closing the shape |
| pattern_properties | `patternProperties` |
| property_names | `propertyNames` |
| contains_count | `contains` + `minContains`/`maxContains` |
| unique_items | `uniqueItems` |
| object_size | `minProperties`/`maxProperties` |
| dependent_required | `dependentRequired` |

Validation Formats page section: multiple_of (`multipleOf`), joining the
three kept cases. Skip min/maxLength (STRING_FORMAT already benches bounded
strings).

Every case follows the existing shared-case shape: draft 2020-12 document on
the case, samples as the RunTypes truth (divergent values stay in shared
samples so the audit reports them; a competitor opts its timing lane out
with a `samples` override — the ATOMIC.number posture).

**C. Competitor fill (the framing change).**

Entries are authored in each library's OWN dialect, like every other
validation row, not document consumption. **As shipped**, every cell below was
verified by running the real validator against this group's exact samples
(TypeBox `TypeCompiler.Compile`, zod `safeParse`, typia through a real ttsc
transform build), which corrected the original guesses in both directions:

| case | ajv | typebox | zod | typia |
|---|---|---|---|---|
| closed_object | doc | `additionalProperties: false` | `strictObject` | `createEquals` |
| pattern_properties | doc | `Record(TemplateLiteral)` + `additionalProperties: false` | `record(key regex)` | ``Record<`col_${string}`, number>`` + Equals |
| property_names | doc | not compiled | `record(key regex)` | no regex-constrained key |
| contains_count | doc | `contains` + `minContains` | no array contains | no count tag |
| unique_items | doc | `uniqueItems` | no array uniqueness | `tags.UniqueItems` |
| object_size | doc | `min/maxProperties` | no key-count bounds | no key-count bounds |
| dependent_required | doc | not compiled | `z.union` | union + Equals |
| multiple_of | doc | `multipleOf` | `.multipleOf()` | `tags.MultipleOf` |
| string_email / int_bounded / string_pattern | doc | pattern / bounds | `z.email()` / min-max / `.regex()` | `tags.Format` / `Minimum`-`Maximum` / `Pattern` |

Corrections against the original guesses:

- **zod is far stronger than assumed** (8 of 11, not "some"): a regex-constrained
  record key really does reject a bad key, covering both patternProperties and
  propertyNames.
- **TypeBox is weaker than assumed** on three: it accepts `propertyNames` and
  `dependentRequired` into the schema object but never compiles them into a
  check, and `Type.Record(/regex/)` compiles to `{"not":{}}` in the pinned build.
  Its template-literal Record needs `additionalProperties: false` to close, which
  the alignment audit caught after the first pass shipped an open one.
- **typia needs `createEquals`** for every closedness case, since `createIs` is
  structural and accepts excess keys.

ts-runtypes' own entries stay the schema door:
`createValidateFn(runTypeFromJsonSchema(<inline document>))` in
`competitors/ts-runtypes/cases.ts` (build-time read requires the inline
copy; the alignment audit keeps copies honest). The guide's keyword table
(`container/website/content/2.guide/02.json-schema.md:66-67`) confirms every
new keyword is supported by the door.

**D. Wiring and pages.**

- `scripts/website/bench-data/gen-docs.mjs:316-345` — delete the
  `isJsonSchema` filter and the third `emitValidationBench('json-schema', …)`
  call; the JSON_SCHEMA groups flow into the two pages by suite. Sections
  render from `group` automatically; `bench-data/json-schema/` stops being
  emitted (git-ignored output, no repo cleanup).
- Delete `container/website/content/7.benchmarks/9.json-schema.md`.
  check-static auto-discovers pages, so the gate adjusts itself.
- `container/website/content/7.benchmarks/7.compiletime.md:17` — the only
  link to `/benchmarks/json-schema`; repoint the sentence at the Validation
  page's section (prose edit, docs style: plain language, no dash
  punctuation). NOTE: the typecost todo also rewrites this paragraph —
  whichever lands second reconciles.
- SHIPPED: one short intro sentence on each of `1.validation.md` and
  `2.validation-formats.md` explaining what the JSON Schema section covers and
  that a dialect which cannot express a constraint reads n-a.
- CaseKey ripple: dropped/added keys must be reflected in EVERY competitor
  map (`zod`, `typebox`, `typia`, `ajv` cases.ts; ts-runtypes `cases.ts`,
  `schemaCases.ts` — new keys land there as `NOT_SUPPORTED` per the
  one-door rule — plus `jsonSchemaCases.ts` and
  `json-schema-to-ts/cases.ts` for typecost, since removed). Totality is declared but
  unenforced ([benchmark-competitor-maps-never-typechecked.md](benchmark-competitor-maps-never-typechecked.md)).

## Tests

- Host-side unit (sibling of
  `packages/ts-runtypes-devtools/test/repo-contracts.test.ts`; the shared
  cases are library-free and import cleanly): assert `iterateCases()` has no
  `json-schema` suite, both `validation` and `format-validation` contain a
  JSON_SCHEMA group, every JSON_SCHEMA case carries a `schema` document plus
  non-empty valid AND invalid samples, and none of the seven dropped keys
  survive anywhere.
- The in-container audit is the semantic oracle: every filled competitor
  entry runs against the shared samples; divergences land on the
  Correctness page instead of passing silently.
- Marker-API call-shape rule: not applicable (no `getRunTypeId` surface).
- End to end: `pnpm rtx bench --website` then
  `pnpm rtx website build` + `pnpm rtx website check --static` — validation
  and validation-formats pages must render the JSON_SCHEMA sections and no
  page requests `bench-data/json-schema/` anymore.

## Docs

- Page deletion + the compiletime link repoint (above).
- `container/website/content/2.guide/02.json-schema.md` — check for links to
  the deleted page (none found today, re-grep at build time).

## Fuzzing

Not a fuzz target: fixed case set, and the alignment audit already replays
every competitor against shared samples as the correctness oracle.

## Out of scope

- Typecost column coverage
  ([json-schema-typecost-full-coverage.md](json-schema-typecost-full-coverage.md)).
  Interaction: this todo changes the JSON_SCHEMA case set, which rebases
  that todo's case counts (ajv NOT_SUPPORTED tally, the 10-case references).
  Whichever lands second updates the other's numbers.
- The competitor-map totality CI gate
  ([benchmark-competitor-maps-never-typechecked.md](benchmark-competitor-maps-never-typechecked.md)).
- Playground JSON Schema mode, the (schema) rename, and any change to the
  guide's keyword semantics.

## What shipped

Case count 276 -> 277 (7 dropped, 3 re-homed to formats, 8 added). Verified end
to end: `pnpm rtx bench --website` regenerates 277 cases across validation,
validation-formats, typecost and alignment; `pnpm rtx website check --static`
passes on 8 benchmark pages (the 9th is gone) with the JSON Schema section
rendering real numbers on both pages. The only two FAILED lines in the run are
the pre-existing typia and zod exit codes, both already tracked and neither in
this group.

The `schemaCases.ts` opt-out (item A) was folded in here rather than left to the
typecost spec, since the same keys were being rewritten.

## Done when

- `/benchmarks/json-schema` is gone: no content page, no gen-docs bench, no
  content link to it.
- The Validation page renders a JSON_SCHEMA section with only schema-unique
  structural cases; Validation Formats renders one with the value-constraint
  cases; no plain-shape or union case remains in either.
- TypeBox has real numbers on every case its dialect supports (verified, not
  assumed); zod and typia filled or honestly `NOT_SUPPORTED` with reasons;
  ajv still compiles the shared documents.
- Host unit test passes in `pnpm test`; full pipeline
  (`pnpm rtx bench --website`, `pnpm rtx website check --static`) is green.
