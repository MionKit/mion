---
type: fix
spec: guidelines
status: ready
created: 2026-08-05
---

# `additionalProperties` / `items` must not see inside `allOf`

## Intent

Two JSON-Schema-Test-Suite cases remain divergent after the keyword-semantics
sweep, and they share one root cause: the "already covered" set those two
keywords apply is computed from the MERGED object / array, so a sibling declared
inside an `allOf` arm wrongly exempts a key or an index.

Per 2020-12 both keywords look at their OWN siblings only. Everything else in
their families now conforms; these two are the last of the family, and one of
them UNDER-validates, which is the outcome the pipeline promises never to have.

## Scope note

Two MORE cases turn out to need the same capability, both from
`unevaluatedItems.json` (`with nested prefixItems and items`, `with nested
unevaluatedItems`): a tuple from an `allOf` arm meeting an array from the outer
schema. So this todo is worth **4** suite cases, not 2, and it is the only thing
standing between the door and full conformance once
`unevaluated-runtime-evaluated-set.md` lands.

## The two cases

Both from `node_modules/json-schema-test-suite/tests/draft2020-12/`:

```jsonc
// additionalProperties.json :: "additionalProperties does not look in applicators"
{"allOf": [{"properties": {"foo": {}}}], "additionalProperties": {"type": "boolean"}}
// data {"foo": 1, "bar": true}  → spec INVALID, we accept
// (additionalProperties has no sibling `properties`, so EVERY key must be
//  boolean; `foo` is only declared inside the allOf arm and must not be exempt)
```

```jsonc
// items.json :: "items does not look in applicators, valid case"
{"allOf": [{"prefixItems": [{"minimum": 3}]}], "items": {"minimum": 5}}
// data [5, 5]  → spec VALID, we reject
```

The first is the serious one: we accept data the spec rejects.

## Why they are not door fixes

Both lower to a checker INTERSECTION whose halves each carry a piece of the
answer, and the collapse cannot combine those pieces:

- **additionalProperties.** The allOf arm contributes `Record<string, unknown> &
  {foo?: unknown}`; the outer contributes `Record<string, boolean>`. TypeScript
  says the merged `foo` is `unknown & boolean` = `boolean`, but
  `GetPropertiesOfType` returns only the DECLARED `foo` (type `unknown`), and
  the emitted index-signature loop then skips every declared sibling by name
  (`siblingNamedSkipCode`). That skip is sound for a single declaration — TS
  rejects a declared member incompatible with its own index signature — but not
  across an intersection.
- **items.** The allOf arm contributes the tuple `[Number<min 3>?,
  ...unknown[]]`, the outer the array `Number<min 5>[]`.
  `MergeTupleIntersection` handles tuple ∩ tuple, not tuple ∩ array, so the
  merge falls through to the object-literal path and rejects every array. Even
  taught about arrays, its slot rule only resolves a pair when one side is
  `unknown` or both are equal — here it would need `Number<min 3> & Number<min
  5>`.

Both therefore need the same missing capability: **intersect two ALREADY-LOWERED
types.** `checker.GetIntersectionType` is not exposed by
`third_party/tsgolint/shim/checker/shim.go`, and that tree is off-limits, so the
merge has to happen at the protocol level (serialize each side, then merge the
nodes) — with a `typeid` twin doing the identical fold, per the collapse's
two-halves-stay-twins discipline.

Worth noting the annotation half of that merge now EXISTS:
`MergeFormatAnnotations` folds same-family params, tightening bounds and taking
the least common multiple of `multipleOf` (added 2026-08-05). A protocol-level
node merge could lean on it directly for the branded-leaf cases, which is what
both of these reduce to.

## Direction

Investigate and recommend a shape before building. Two candidate designs, both
plausible, and the choice is the actual decision to make:

1. **Protocol-level node merge in the collapse.** Generalise
   `MergeTupleIntersection` to accept arrays and return per-slot LISTS, then
   merge the serialized nodes (kind agreement + `MergeFormatAnnotations`).
   Fixes `items`; extends naturally to the property-vs-index case. Needs the
   `typeid` twin.
2. **Make `additionalProperties` a real keyword rather than an index
   signature.** The `false` form already rides `FormattedObjectParams.closed` +
   `closedPatterns`, which name the exemption set explicitly. A schema-VALUED
   `additionalProperties` could ride the same params (value type + exempt keys +
   exempt patterns), so the exemption comes from the schema's own siblings by
   construction and never from whatever the merge produced. Fixes
   `additionalProperties`; does nothing for `items`.

Design 2 is the semantically faithful model for the object side and is probably
right on its own merits; design 1 is the only one that reaches `items`. They are
not exclusive.

## Cross-checks the implementer owes

- `siblingNamedSkipCode`'s soundness argument, written down. Today it skips
  EVERY declared sibling; the honest rule is "skip only siblings whose declared
  type the index signature could not narrow". Note that
  `collectSiblingNamedKeys` deliberately keeps DataOnly-stripped names (G6), so
  a naive "stop skipping" breaks `{p0: ArrayBuffer, [k: string]: T}`.
- Every emit family, not just validate: `validationErrors` must agree with
  `validate` on the same value, and the strip / clone / json / binary walks read
  the same index-signature loop.
- The `patternProperties` exemption landed 2026-08-05
  (`publishSiblingPatternsForIndexSig` / `siblingPatternSkipCode` in
  `unknownkeys_shared.go`) and is the closest working precedent for wiring a new
  per-index-signature exemption through the emitters.

## Done when

Both suite cases conform (`node scripts/core/gen-json-schema-suite.mjs report
--update-ledger` drops them), the chosen design is recorded with why the other
was not taken, `validate` and `validationErrors` agree on every case added, and
the collapse's serialize half and `typeid` half stay twins.
