---
type: fix
spec: full-plan
status: ready
created: 2026-08-07
---

# StripRunTypeMeta: branded tuples could recover their slots too

Split out of [json-schema-followups.md](../done/json-schema-followups.md) Item 1.
That change taught `StripRunTypeMeta` to subtract an intersection brand off a
branded LITERAL; the same mechanism reaches the audit's remaining residual, but
in a different branch with its own budget, so it was deliberately left out
rather than smuggled in.

## Problem

`StripRunTypeMeta` keeps a branded TUPLE verbatim:

```ts
type BrandedTuple = [boolean?, boolean?] & {readonly [__rtFormatName]?: 'formattedArray'; …};
// clean type today: BrandedTuple (brand internals leak into the hover)
```

`StripMetaArray` ([stripRunTypeMeta.ts](../../packages/ts-runtypes/src/runtypes/stripRunTypeMeta.ts))
handles a branded plain array by inferring its element (`T extends readonly
(infer E)[]`), which drops every slot the brand rode. That does not work on a
tuple: variadic inference collapses the slots to `unknown[]` and destroys the
very structure the hover exists to show, and a mapped type mangles the brand.
So the branch returns `T` unchanged, and the brand shows up in the hover.

Recorded as residual 2 in
[06-clean-type-audit.md](../investigations/json-schema/06-clean-type-audit.md).
One corpus row.

## Plan

Reuse `StripMetaUnbrandLit`'s mechanism. TypeScript's intersection subtraction
lives in inference: with an intersection inference target, the checker matches
target constituents pairwise against source constituents under type identity,
deletes the matched pairs, and infers the remainder into a naked `infer U`
(checker `inferFromMatchingTypes`; tsgo ports it verbatim in
`internal/checker/inference.go`). Verified during the Item 1 work that
`[boolean?, boolean?] & StructuralBrand<…>` does subtract to
`[boolean?, boolean?]`.

Two things this needs beyond what Item 1 shipped:

1. **Model the four structural sentinels in the residual.** Item 1's residual
   covers `__rtFormatName` / `__rtFormatParams` / `__rtNot` / `__rtOneOf` —
   the ones that can ride a primitive. A tuple brand also carries
   `__rtContains` / `__rtPatternProps` / `__rtPropNames` / `__rtUnevaluated`
   ([formats/structural.ts](../../packages/ts-runtypes/src/formats/structural.ts)).
   Because the matching is by IDENTITY, each needs its own part; merging them
   into one object matches nothing and silently subtracts nothing.
2. **Apply it in `StripMetaArray`'s branded-tuple arm**, then recurse the
   recovered tuple through the existing homomorphic mapped type so element
   types are stripped too. Today the arm returns `T` verbatim, so its elements
   are not stripped either.

Keep the existing safety net: re-check `Extract<keyof U, StripMetaSentinelKeys>`
and fall back to today's keep-verbatim when the subtraction did not fully
clear. Degradation, never a wrong answer.

## Tests

- [stripmeta.compile.test.ts](../../packages/ts-runtypes/test/types/stripmeta.compile.test.ts):
  the branded-tuple expectation in the residual-policy `it` flips from
  keep-verbatim to the bare tuple; the arrays `it` (budget 2042) is the branch
  that moves, so re-measure and call the increase out explicitly under the
  one-way ratchet protocol.
- Cover a branded tuple whose ELEMENTS are themselves branded, which is the
  case that proves the recursion was wired and not just the outer subtraction.
- Regression guards that must NOT move, exactly as in Item 1: the official
  type-gate lane and its empty `type-gate-divergences.json`, and the
  `id-integrity` suites. This is annotation-only, so no id may shift.

## Docs

- The residual-2 bullet in
  [06-clean-type-audit.md](../investigations/json-schema/06-clean-type-audit.md)
  and its scoreboard row.
- The residual list in the `StripRunTypeMeta` module docstring.

## Out of scope

- The pathological `unevaluatedProperties` row (residual 3) — a different
  cause (impossible arms on array bases), not an intersection-subtraction
  problem.
- Anything touching the LOWERING. This is a projection change only.

## Done when

- `StripRunTypeMeta<FormattedArray<[boolean?, boolean?], {uniqueItems: true}>>`
  is `[boolean?, boolean?]`, with elements stripped.
- The audit's residual 2 is marked fixed and the scoreboard row drops to zero.
- Official lane, type-gate ledger and id-integrity all unchanged.
