---
type: fix
spec: guidelines
status: ready
created: 2026-08-07
---

# if/then/else over const arms brands the literals, so the clean type widens them away

Found by the clean-type audit
([06-clean-type-audit.md](../investigations/json-schema/06-clean-type-audit.md),
residual 1). Not a soundness bug — a documentation-quality limit with an
id-affecting fix, which is why it is filed instead of shipped with the audit.

## What happens

`{if: {maxLength: 4}, then: {const: "yes"}, else: {const: "other"}}` lowers
its branches as `(IfBrand & "yes") | (NotSlot<String<…>> & "other")` — the
condition rides each literal as an intersection brand. The reflected type
needs that (the validator reads the condition from the brand), but TypeScript
has no intersection subtraction, so StripRunTypeMeta cannot recover the bare
literal and widens the arm to `string`. The ideal clean type `"yes" | "other"`
is lost; the shipped one is `string`.

## The fix this needs (a decision, then a lowering change)

Move the if-condition off the literal arms — e.g. carry it once on the union
carrier (the `__rtOneOf`-style slot) instead of intersecting each branch. Then
the branches stay plain literals, the strip keeps them, and the clean type is
`"yes" | "other"`.

This changes FromJsonSchema's encoding for the if/then/else lowering, which
moves the structural id of every affected schema — a cache-invalidating,
id-affecting change that needs its own review of the emitter's reading of the
slot, id-convergence tests for all three authoring modes, and a mode-parity
check. Scope is small but the blast surface is the id fold, hence its own PR.

## Done when

- The lowering carries the if-condition without branding the literal arms.
- `JsonSchemaType` of the example above is `"yes" | "other"` (pin it in the
  type-gate or the compile suite).
- Go + JS id-convergence and the official suite stay green; the audit doc's
  residual 1 is updated to point here as fixed.
