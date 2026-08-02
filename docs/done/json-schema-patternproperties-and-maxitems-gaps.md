---
type: feature
spec: full-plan
status: done
created: 2026-07-31
---

# JSON Schema input: `patternProperties` and `maxItems` have type meanings but are rejected

> **SHIPPED** (2026-08-02, feature/json-schema-rollout M4): `maxItems` rides
> the arrayFormat brand (exact length bound over any array/tuple shape) and
> `patternProperties` is fully accepted — pattern-keyed value children on
> the record node (`__rtPatternProps` sentinel), regex-gated per-key
> validation, closedness interplay via `closedPatterns`, and pooled key
> mocking. Pinned in structuralKeywords.test.ts.


Found while reframing the guide's keyword list after the rollout ([json-schema-first-class-rollout.md](../done/json-schema-first-class-rollout.md)). The guide now says *most* keywords outside the accepted table assert something no type can express — "most", not "all", because these two are the exceptions.

## Problem

`JsonSchemaInput` ([fromJsonSchema.ts](../../packages/ts-runtypes/src/json-schema/fromJsonSchema.ts)) is a closed 28-keyword vocabulary and `ExactJsonSchema` rejects everything else at the keyword. That is the right stance for `uniqueItems`, `if`/`then`/`else`, `not`, `contains` etc. — no TypeScript meaning to recover. But two rejected keywords DO have TypeScript spellings:

- **`maxItems`** — `minItems` already maps (arity floor on an array/tuple). `maxItems` is the matching ceiling, expressible with optional tuple elements: `{type: 'array', items: T, minItems: 1, maxItems: 3}` → `[T, T?, T?]`. Rejecting the ceiling while accepting the floor reads as arbitrary to a schema author.
- **`patternProperties`** — a pattern that is template-literal-expressible (anchored literal prefix/suffix/infix, e.g. `"^sku_"`) maps to a template-literal index signature: `{[key: ` + "`sku_${string}`" + `]: V}`. General regexes have no TS spelling.

## Design decisions for the implementer

- **`patternProperties`: accept only the template-expressible subset, reject the rest AT the pattern key** (same loud-rejection stance as `ExactJsonSchema` today). Never accept-and-approximate: mapping an inexpressible pattern to a plain `string` index signature would enforce the value type on the wrong key set.
- **`maxItems` needs an expansion bound.** Check how `minItems` encodes today and what bound (if any) it applies; a huge `maxItems` must be rejected at the keyword rather than exploding into a giant tuple. Whatever the bound is, `minItems` and `maxItems` should share it.

## Fix plan sketch

1. Type level only, in `fromJsonSchema.ts`: extend `JsonSchemaInput` + the `FromJsonSchema` translation. No Go changes expected — the marker reflects whatever `FromJsonSchema<S>` resolves to (structural detection), and optional tuple members / template-literal index signatures are existing TS features the resolver already handles. Verify that assumption against the existing validation/serialization suites before relying on it.
2. Docs: add the keywords to the guide table ([02.json-schema.md](../../container/website/content/2.guide/02.json-schema.md), Objects and Arrays-and-tuples rows) and revisit the "Most of what the spec defines beyond this table" sentence, which exists because of this gap.
3. Optional: a shared bench case per keyword in `container/benchmarks/shared/cases/json-schema/JsonSchema.ts` — ajv supports both, so the alignment audit gets a real second column.

## Tests

- `packages/ts-runtypes/test/suites/json-schema-define/` — cases per keyword, covering BOTH `getRunTypeId` call shapes (marker rule), plus completion meta-check rows.
- Type-level rejections in `packages/ts-runtypes/test/types/jsonSchemaHarness.ts`: an inexpressible `patternProperties` regex and an over-bound `maxItems` must error at the keyword.

## Done when

- Both keywords validate / mock / serialize like their hand-written TS equivalents and converge on the same structural id; inexpressible spellings still error where written; guide table updated; full `pnpm test` green.
