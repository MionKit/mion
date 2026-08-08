---
type: chore
spec: full-plan
status: ready
created: 2026-08-08
---

# Retire the per-format `Fz*` aliases by moving the id-convergence leg out of the fuzz lane

Split out of the [fuzz-followups audit](../done/fuzz-followups.md) (2026-08-08).

## Problem

`FUZZ_FORMAT_PREAMBLE`
([typeGen.ts:323-351](../../packages/ts-runtypes/test/fuzz/core/typeGen.ts)) is
18 declarations in two unequal tiers. Tier (a) — `FzTF`, `FzNot`, `FzString`,
`FzNumber` — restates the raw sentinel encoding the Go scanner reads, and is a
genuinely independent oracle. Tier (b) is 14 per-format aliases restating the
result of `PresetFormat<Tag, DEFAULT_X_PARAMS, {}>`, **eleven of which carry a
full transcribed regex source**, four of those multi-kilobyte RFC 3986 / 3987
grammars.

Tier (b) exists to serve one assertion in the json-schema lane:

```ts
getRunTypeId<FzUri>() === getRunTypeId(jsonSchemaOf({type: 'string', format: 'uri'}));
```

That assertion is **not a fuzz property**. The format keyword set is a 19-row
lookup table (`BrandBySchemaFormat`,
[fromJsonSchema.ts:343-371](../../packages/ts-runtypes/src/json-schema/fromJsonSchema.ts)),
so every seed re-runs the same handful of comparisons. Sampling only beats
enumeration when the space is too big to enumerate.

It is already enumerated, twice, and both versions are **stronger** because they
use the shipped brands rather than a hand-copy that cannot fail when the shipped
brand changes:

- `test/suites/id-integrity/jsonSchema.test.ts` — 24 live string-format
  convergence cases, covering 16 of the 19 `BrandBySchemaFormat` rows.
- `test/suites/json-schema-define/loweringTable.test.ts:170-190` — 53
  `getRunTypeId` assertions on the format channel.
- `test/features/formatLengthOverrides.test.ts` — 10 cases over the
  `PresetFormat` / `FormatDefaults` merge itself.

Evidence the hand-copy is the weaker oracle: `FzJson`'s `mockSamples` pool has
already drifted from the shipped `DEFAULT_JSON_CONTENT_PARAMS` (6 samples vs 7,
different content) with nothing failing.

## What the fuzz lane must KEEP

The compositional half, which is genuinely unbounded and which no enumerated
suite covers: that a format leaf and its type-first spelling still converge when
**composed** — buried at arbitrary depth under nested objects, unions,
optionality, tuples, `contains` / `patternProperties` / `propertyNames`, `$defs`
/ `$ref`, and negation. That needs leaves already known to be equivalent, not
per-format aliases.

## Plan

1. Close the enumerated-suite gaps first, so nothing is lost when the fuzz leg
   goes: **there is no id-convergence case for `format: 'email'`, `'idn-email'`
   or `'regex'`** (3 of the 19 rows). `email` in particular is recorded as
   `'not-supported'` in `format-validation/StringFormat.ts:2340,2368` because the
   keyword lowers to `EmailAddress`, not `TF.Email` — add the case against the
   brand it actually lowers to.
2. Thin `FORMAT_LEAVES` ([typeGen.ts:131-308](../../packages/ts-runtypes/test/fuzz/core/typeGen.ts))
   to one or two representative leaves. Mind the density comments at `:148-152`
   and `:279-283`: the roster exists partly to keep the negation lanes' rejection
   sampling viable, so whatever survives must keep a dense complement.
3. Delete the 14 tier-(b) aliases and the four multi-kilobyte regex
   transcriptions with them. Keep tier (a).
4. Rewrite the `srcOverlay.ts:14-18` carve-out paragraph: it should scope the
   exception to tier (a) and stop claiming there is only one exception (see
   [fuzz-undocumented-type-duplication](fuzz-undocumented-type-duplication.md)).

## Out of scope

The other three duplications (structural brands, `i18nModel.ts`, `RUNTYPES_DTS`)
— they have their own todo.

## Done when

The json-schema fuzz lane still checks composed convergence and no longer checks
per-format convergence; tier (b) is gone; `email` / `idn-email` / `regex` have
enumerated id-convergence cases; `pnpm rtx core fuzz jsonschema` and the full
suite are green.
