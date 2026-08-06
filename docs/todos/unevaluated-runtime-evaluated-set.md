---
type: feature
spec: ready
status: ready
created: 2026-08-06
---

# `unevaluated*` over a run-time evaluated set

## Intent

`unevaluatedProperties` / `unevaluatedItems` conform wherever the DOCUMENT
decides which members are evaluated. 27 suite cases remain, and they all share
one cause: the evaluated set depends on which applicator branch matched THIS
value, so no static answer is honest and the door resolves `never` (loud, but it
rejects data the schema plainly accepts).

This is the last real feature in the JSON Schema door. Everything else open is
the collapse merge (see
`applicator-scoped-coverage-additionalproperties-items.md`).

## The rule being implemented

A member is "evaluated" when a keyword in scope applied to it AND that keyword's
subschema PASSED. Annotations only propagate from subschemas that succeeded, so
in `anyOf: [A, B]` with A passing and B failing, only A's members count.

Everything already handled stays handled: own `properties` / `patternProperties`
/ `prefixItems`, every `allOf` member, and every `$ref` target are
UNCONDITIONAL (all must pass for the schema to pass), and
`MergedClosedKeys` / `MergedPatternSources` / `LongestPrefixOf` already fold
them. What is missing is the conditional half.

## Conditions, and there are only two kinds

| Applicator | Condition | Contributes |
| --- | --- | --- |
| `anyOf` arm, `oneOf` arm | the arm validates | that arm's merged set |
| `if` (no `then`/`else`) | `if` validates | `if`'s merged set |
| `if` + `then` | `if` validates | `if`'s ∪ `then`'s |
| `if` + `else` | `if` does NOT validate | `else`'s |
| `dependentSchemas: {k: B}` | `k in value` | B's merged set |
| `contains` (items only) | per index, the child validates | that index |

So a group is guarded either by "this subschema validates" or by "this key is
present". Both are expressions the emitter can already produce.

## What the emitted code must satisfy

Deliberately stated as CONSTRAINTS rather than a code sketch: the exact form is
the implementer's call against the real emitter, where it can be measured. Three
attempts at sketching it here were all worse than what the constraints imply.

1. **Nothing at all when the keyword is absent.** The sentinel is not on the
   node, so the object / array emit branches past it exactly as it does for
   `__rtContains` today. A schema without `unevaluated*` must produce
   byte-identical code to now. This is the hard one.
2. **Cost scales with the number of BRANCHES, not the number of properties.**
   No per-property comparison chain in the loop body.
3. **Everything knowable at build time is hoisted into the factory prologue**,
   the way `addObjectPropsToContext` already hoists `const k_<hash> = [...]` and
   the pattern regexes. A group of ONE key is that key, not a one-element array.
4. **No allocation on the common path.** When nothing is conditional the whole
   evaluated set is a compile-time constant and the body is a single traversal.
5. **Traverse with `Object.keys(v)`**, which is what the value's own keys are,
   and gives the count for free if a length comparison beats membership tests.
6. **Reuse the branch results the applicator emit already computes** — `anyOf` /
   `oneOf` / `if` have each evaluated their subschemas by the time the sweep
   runs; nothing may be validated twice.

Items follow the same constraints with a watermark (the highest evaluated index,
`Math.max`'d over the passing branches) instead of a key list, except when
`contains` is in scope: that is the one keyword evaluating scattered indexes, so
it needs per-index marks.

For a SCHEMA-valued keyword the sweep validates the leftovers against it instead
of rejecting them; `false` is just the value nothing satisfies.

## Work plan

1. **Sentinel.** `__rtUnevaluated` is already declared in
   `packages/ts-runtypes/src/runtypes/sentinelKeys.ts` (unused so far). Give it
   a payload in `formats/structural.ts` beside `ContainsSlot`:
   `{rt$value, rt$keys, rt$patterns, rt$when: [{rt$if | rt$hasKey, rt$keys, rt$patterns}]}`,
   and the items twin carrying prefixes instead of keys.
2. **Door.** Replace the `'poison'` arm of `UnevalPropsMode` / `UnevalItemsMode`
   with sentinel construction. The per-branch merged sets reuse
   `MergedClosedKeys` / `MergedPatternSources` / `LongestPrefixOf` verbatim —
   they already take `Root` and fuel.
3. **Protocol + collapse.** A `node.Unevaluated` field, lifted in
   `runtype/intersection_collapse.go` next to `Contains` / `PatternProps`, with
   the MATCHING fold in `typeid/intersection_collapse.go`. The two halves are
   twins by contract; an id that moves on one side only corrupts the cache.
   Add the prop name to `IsContainsSentinelPropName`'s skip list so merged
   property walks never surface it.
4. **Emitters.** `validate.go` and `validationerrors.go`, which must agree on
   every value. The other families do not see the keyword (it constrains
   validity, not shape), but check `hasUnknownKeys` — a key evaluated only by a
   passing branch is still a KNOWN key.
5. **Tests.** Per condition kind, both call shapes where the marker API is
   touched, plus the mock generator (it has to satisfy the same rule it is
   generated from — `mockType.ts` already trims to `closed`, and the run-time
   set needs the same treatment).

## Watch out for

- **Cousins.** `unevaluatedProperties` inside one `allOf` branch must NOT see a
  sibling branch's evaluated keys. Scoping the collection to the subschema tree
  rooted where the keyword sits gives this for free; the suite has explicit
  cases (`unevaluatedProperties can't see inside cousins`) that currently sit
  in `unsupported-input` and should be re-triaged once this lands.
- **`minContains: 0`.** A `contains` with `minContains: 0` passes vacuously and
  then evaluates nothing, which is its own suite case.
- **Instantiation budgets.** Every consumer must keep probing for the KEYWORD
  before asking for the mode; that discipline is what kept the static work
  budget-neutral, and it matters more here.

## Done when

The 27 cases conform (`node scripts/core/gen-json-schema-suite.mjs report
--update-ledger` drops them), `validate` and `validationErrors` agree on every
one, the serialize and typeid halves of the collapse produce matching ids, a
schema without the keyword emits byte-identical code to today, and the guide's
"Unevaluated" section stops describing the `never` fallback.
