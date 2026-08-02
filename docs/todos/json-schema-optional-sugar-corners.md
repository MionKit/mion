---
type: feature
spec: guidelines
status: ready
created: 2026-08-02
---

# JSON Schema input: two optional sugar corners

The remainder split out of
[json-schema-2020-12-keyword-gaps-and-not-format.md](../done/json-schema-2020-12-keyword-gaps-and-not-format.md)
when the effort closed (2026-08-02). Both are ergonomics, not gaps: every
behavior below already works through an existing spelling, and nothing is
silently dropped.

## 1. TF presets for the content-encoding family

`contentEncoding: base64 | base32 | base16` and
`contentMediaType: application/json` validate through the schema door, and the
value-first twin exists via `TF.string({pattern})` with the matching alphabet
pattern (already id-convergent). What is missing is only the NAMED sugar:
`TF.base64()` / `TF.Base64` style presets, plus a spelling for the
jsonContent family (parse-checked string content, optionally behind an
encoding). Grow `FormatName` only if a genuinely new emitter is needed —
presets over the existing pattern brand are the cheap path.

## 2. Boolean subschemas beyond items / prefixItems

`true` / `false` are accepted as subschemas at `items` and inside
`prefixItems` (`true` pads a slot, `false` forbids it). Every other schema
position (anyOf/oneOf/allOf members, `properties` / `$defs` /
`patternProperties` values) still rejects a boolean at the key — loudly, per
the disposition doctrine, so nothing is silent today. Full 2020-12 core
§4.3.2 acceptance means widening those input positions plus their
`ExactJsonSchema` legs and `FromJsonSchemaIn` arms (`true` ≡ `{}` ≡ unknown,
`false` ≡ never), with the boolean-method-key folding pitfall documented in
fromJsonSchema.ts (`ExactJsonSchemaList`'s guard is the precedent).

## Done when

Each corner ships with the usual gates: suite rows (both `getRunTypeId`
shapes + a hash-equivalence pair per new suite), budgets, guide + formats
page updates, and the fuzz grammar extended over any new spelling.
