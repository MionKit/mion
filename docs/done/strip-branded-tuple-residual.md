---
type: fix
spec: full-plan
status: done
created: 2026-08-07
completed: 2026-08-07
---

# StripRunTypeMeta: branded tuples recover their slots too

Split out of [json-schema-followups.md](json-schema-followups.md) Item 1 and
then implemented in the same PR (the split existed to keep the two strip
branches reviewable apart, not to defer the work).

## Problem

`StripRunTypeMeta` kept a branded TUPLE verbatim:

```ts
type BrandedTuple = [boolean?, boolean?] & {readonly [__rtFormatName]?: 'formattedArray'; …};
// clean type before: BrandedTuple (brand internals leaked into the hover)
```

`StripMetaArray` handles a branded plain array by inferring its element
(`T extends readonly (infer E)[]`), which drops every slot the brand rode. That
does not work on a tuple: variadic inference collapses the slots and destroys
the very structure the hover exists to show, and a mapped type mangles the
brand. So the branch returned `T` unchanged and the brand showed up in hovers.

Recorded as residual 2 in
[06-clean-type-audit.md](../investigations/json-schema/06-clean-type-audit.md).

## What shipped

`StripMetaUnbrandTuple` in
[stripRunTypeMeta.ts](../../packages/ts-runtypes/src/runtypes/stripRunTypeMeta.ts),
reached from `StripMetaArray`'s fixed-length branded arm (which previously read
`: T; // branded tuple — keep-verbatim residual`).

It reuses the inference-based subtraction Item 1 introduced — target
constituents matched pairwise against the source's under type identity, matches
deleted from both sides, remainder inferred into a naked `infer U` — with two
additions the literal path did not need:

1. **The four STRUCTURAL slots are modelled** alongside the format part, because
   an array brand is
   `Base & StructuralBrand<'formattedArray', …> & ContainsSlot & UnevaluatedSlot`
   ([formats/structural.ts](../../packages/ts-runtypes/src/formats/structural.ts)).
   Identity matching means leaving any part out matches nothing and subtracts
   nothing. `__rtPatternProps` / `__rtPropNames` are object-only but modelled
   too, so an object-ish brand on a tuple degrades rather than half-clears.
   They live in their own part helpers, so the literal path does not pay for
   them.
2. **The recovered tuple then recurses through the ordinary homomorphic map**,
   so a tuple of branded elements strips all the way down — `[Email, Bounded] &
   ArrBrand<…>` becomes `[string, number]`, not just `[Email, Bounded]`.

The safety net is unchanged: `[Extract<keyof U, StripMetaSentinelKeys>] extends
[never]` re-checks the subtraction, and anything that did not fully clear falls
back to today's keep-verbatim. Degradation, never a wrong answer.

### One boundary, kept deliberately

A **variadic** branded tuple (`[Email, ...Bounded[]] & ArrBrand<…>`) has a
number-typed `length`, so it never reaches the fixed-length arm — it takes the
plain-array element-inference path and still flattens to `(string | number)[]`.
That is pre-existing behaviour, unchanged here, and it is now PINNED in the test
so the split between fixed-length and variadic is a decision on the record
rather than something the next reader rediscovers.

## Tests

[stripmeta.compile.test.ts](../../packages/ts-runtypes/test/types/stripmeta.compile.test.ts):

- The residual-policy `it` flips its branded-tuple expectation from
  keep-verbatim to the bare tuple.
- A new `it` covers the shipped `FormattedArray` encoding: `uniqueItems` pair,
  branded ELEMENTS (which is what proves the recursion was wired and not just
  the outer subtraction), nested one level down, the variadic boundary, all
  structural slots stacked on one tuple, a readonly tuple keeping its modifier,
  and a plain array still taking the element-inference arm.

Regression guards that did NOT move, as required: the official conformance lane
and its empty `type-gate-divergences.json`, the `id-integrity` suites, and the
`jsonSchema.compile.test.ts` budgets. This is annotation-only — `FromJsonSchema`
is untouched, so no id can shift.

### Budget ratchet — called out

Two budgets rose, both reviewed exceptions under the one-way ratchet protocol
("a deliberate new capability in the mapping"):

- residual policy **1190 → 2061** (its branded-tuple case now takes the
  subtraction path),
- the new branded-tuple `it` opens at **5586**.

The other budgets in the file are unchanged, including the plain-array one
(2042) — the tuple path is only reached by a fixed-length branded tuple.

## Docs

- Residual 2 in
  [06-clean-type-audit.md](../investigations/json-schema/06-clean-type-audit.md)
  marked fixed; the "hovers naming internals" scoreboard row drops to **0**.
- The residual list in the `StripRunTypeMeta` module docstring.

## Out of scope (unchanged)

- The pathological `unevaluatedProperties` row (residual 3) — a different cause
  (impossible arms on array bases), not an intersection-subtraction problem.
- Anything touching the LOWERING. This was a projection change only.

## Done when — all met

- ✅ A branded fixed-length tuple strips to the bare tuple, elements included.
- ✅ Residual 2 marked fixed and the scoreboard row now reads 0.
- ✅ Official lane, type-gate ledger and id-integrity unchanged.
