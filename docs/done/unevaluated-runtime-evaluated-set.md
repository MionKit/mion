---
type: feature
spec: ready
status: done
created: 2026-08-06
---

# `unevaluated*` over a run-time evaluated set

**Status:** done. All 27 cases conform, plus 6 more the spec did not count (the
`contains` interaction groups). `unevaluated*` no longer resolves `never` for
any input. See "Shipped" at the bottom for where the implementation departed
from this plan.

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

| Applicator                 | Condition                     | Contributes             |
| -------------------------- | ----------------------------- | ----------------------- |
| `anyOf` arm, `oneOf` arm   | the arm validates             | that arm's merged set   |
| `if` (no `then` / `else`)  | `if` validates                | `if`'s merged set       |
| `if` + `then`              | `if` validates                | `if`'s ∪ `then`'s       |
| `if` + `else`              | `if` does NOT validate        | `else`'s                |
| `dependentSchemas: {k: B}` | `k in value`                  | B's merged set          |
| `contains` (items only)    | per index, the child validates | that index             |

A third contribution kind the first draft of this spec MISSED: an arm may
evaluate EVERYTHING. An `anyOf` arm carrying `additionalProperties`, `items`, or
its own `unevaluated*` contributes every key/index when it passes, and the
official suite has such cases. Those groups carry an `AllKeys` / `AllItems` flag
and lower to a single `if (ueN) break;` at the top of the sweep — without it
they are unrepresentable.

## Emitted code

Designed against the real emitters and reviewed. Two repo facts anchor it, both
verified rather than assumed:

- `for…in` is the house sweep and stays. `unknownkeys_shared.go:271` records the
  measurement: a for-in counter beats `Object.keys(v).length` by ~1.4x on V8
  (no array allocation), and `validate.go:423` already justifies the same choice
  for the index-signature loop. Using it also keeps own-vs-inherited key
  semantics identical across every keyword.
- The chain-vs-Set threshold already exists: `identityChainMaxKeys = 8` in
  `formats/structural/objectformat.go`. REUSE it rather than inventing a second
  one, so the two closedness paths can never disagree.

When the keyword is present and at least one conditional group survives
normalization, the object emit switches from today's `CodeE` AND-chain to a
`CodeRB` statement body (the shape arrays/tuples already return, so the walker's
existing hoist handles union-arm positions). Body order is fixed: today's
guard+props chain as one bail, then one `const ueN` flag per guard, then the
applicator's validity re-expressed over the flags, then the sweep LAST.

### `anyOf`, three arms

```js
if (!(typeof v === 'object' && v !== null && (v.foo === undefined || typeof v.foo === 'string'))) return false;
const ue0 = v.bar === 'bar';
const ue1 = v.baz === 'baz';
const ue2 = v.quux === 'quux';
if (!(ue0 || ue1 || ue2)) return false;
for (const k0 in v) {
  if (k0 === 'foo') continue;
  if (ue0 && k0 === 'bar') continue;
  if (ue1 && k0 === 'baz') continue;
  if (ue2 && k0 === 'quux') continue;
  return false;
}
return true;
```

Arms bind EAGERLY into consts rather than riding the usual short-circuiting OR:
when two arms pass, both contribute evaluated keys, so a short-circuit would
mislabel the second arm's keys as unevaluated. The `||` reappears only in the
validity line. Each group here is one key, so nothing hoists (constraint: a
one-key group is that key, not a one-element array).

### `if` / `then` / `else` — one flag, one skip line

```js
const ue0 = v.foo === 'then';
if (!(ue0 ? typeof v.bar === 'string' : typeof v.baz === 'string')) return false;
for (const k0 in v) {
  if (ue0 ? (k0 === 'foo' || k0 === 'bar') : k0 === 'baz') continue;
  return false;
}
```

`then` / `else` need no flags of their own: if `if` passed and `then` failed we
already returned false, so "then's keys count when then passed" collapses to
"when `if` passed". The complementary pair then fuses into one ternary.

### `dependentSchemas` — presence is the guard

```js
const ue0 = 'foo' in v;
if (ue0 && !(v.bar === 'bar')) return false;
for (const k0 in v) {
  if (k0 === 'foo') continue;
  if (ue0 && k0 === 'bar') continue;
  return false;
}
```

### A pattern-source contribution

```js
const reU0 = new RegExp('foo'); // prologue, keyed by SOURCE so the arm shares it
const ue0 = ((() => { for (const pk0 in v) { if (reU0.test(pk0) && !(typeof v[pk0] === 'string')) return false; } return true; })());
for (const k0 in v) {
  if (ue0 && reU0.test(k0)) continue;
  return false;
}
```

Hoisting `if (!ue0) return false;` above the loop would be wrong: `{}` must pass
even when the `if` failed, since it has no keys to be unevaluated.

### Schema-valued tail

Only the tail changes; `return false;` becomes the leftover check:

```js
const r0 = typeof v[k0] === 'string';
if (!(r0)) return false;
```

### `unevaluatedItems`

Prefix lengths rather than key lists, sorted DESCENDING so the boundary is a
ternary chain with no `let` and no branches:

```js
const un0 = ue0 ? 3 : ue1 ? 2 : 1;
if (v.length > un0) return false;             // false-mode
for (let i0 = un0; i0 < v.length; i0++) { … } // schema-mode
```

Over-approximating a prefix past the array's length is unobservable. `contains`
is the one keyword evaluating SCATTERED indexes; fuse its count into the same
loop so the child is evaluated once per element and no index set is allocated:

```js
let cn0 = 0;
for (let ci0 = 0; ci0 < v.length; ci0++) {
  const m0 = typeof v[ci0] === 'string';
  if (m0) cn0++;
  if (m0) continue;
  if (ci0 < un0) continue;
  return false;
}
if (!(cn0 >= 1)) return false;
```

## The mechanical rule

Payload, beside `PatternProps` / `OneOf` in `protocol.go` (with matching refslot
visits — a format-annotation param cannot carry child RunTypes):

```go
type UnevaluatedCheck struct {
    Schema  *RunType // nil => false-mode
    Keys    []string // static: own + allOf + $ref, deduped and sorted
    Sources []string // static pattern sources, ditto
    Groups  []UnevalGroup
}
type UnevalGroup struct {
    Guard   GuardRef // BranchFlag{armRef} | BranchFlagNegated{armRef} | KeyPresent{key}
    Keys    []string
    Sources []string
    AllKeys bool
}
```

Build-time normalization, in the door: fold the unconditional contributors into
`Keys`/`Sources`; if any of them evaluates all keys, DROP the payload entirely
(zero emit); subtract the static set from every group; merge groups with
identical guards (this is what fuses `if` + `then`); drop empty groups. If
`Groups` is empty the result is static-only and lowers onto the EXISTING
`closed` / `closedPatterns` sweep — no flags, no `CodeRB` switch, no applicator
change.

Membership lowering, shared by the static and group tests: 0 keys emits nothing;
1–8 keys emit an `===` chain; more hoist a `Set` and test `.has`. Sources emit
one prologue RegExp each, keyed by source. Join with `||`, parenthesize after
`ueN &&`. Deterministic order throughout: `dedupSortStrings` for keys, groups in
declaration order, `AllKeys` lines first and the static test second.

## Two corrections to this spec's earlier draft

- **"Reuse the branch results the applicator emit already computes" was wrong.**
  It cannot be done today: the `anyOf` OR-chain short-circuits and the `oneOf`
  counter is IIFE-scoped, so neither result is nameable or complete. The honest
  requirement is **compile each arm exactly once**, which the flag protocol
  satisfies at the cost of a demand-gated shape change in the applicator emits —
  invisible to every schema without the keyword.
- **"Cost scales with the number of branches, not properties" was sloppy.** The
  sweep is inherently O(keys in the value); every key must be looked at once,
  exactly as the existing closedness sweep does. What scales with branch count
  is the work PER KEY.

## Invariants to state in code

- **The sweep is emitted LAST.** That is what lets "arm passed AND subschema
  passed" collapse to a bare flag, and `dependentSchemas` to bare presence. It
  also means invalid values exit before paying for the sweep.
- **Regex context items are keyed by SOURCE.** Today's keys are position-based
  (`rePPSkip_<id>_<pos>`), which would emit the same RegExp twice — once for the
  arm's own check, once for the sweep.
- **Nothing at all when the keyword is absent.** The sentinel is not on the node,
  so the emit branches past it exactly as it does for `__rtContains`.

## Watch out for

- **Cousins.** `unevaluatedProperties` inside one `allOf` branch must NOT see a
  sibling branch's evaluated keys. Scoping the collection to the subschema tree
  rooted where the keyword sits gives this for free; the suite's explicit cases
  currently sit in `unsupported-input` and should be re-triaged once this lands.
- **`minContains: 0`** passes vacuously and then evaluates nothing.
- **Guarded `contains`.** An arm's flag has already consumed its contains count,
  so the sweep needs the child predicate re-run on tail items (bounded, pure,
  allocation-free). Recording matched indexes allocates per call; rejected. Only
  UNCONDITIONAL contains appears in the suite, and it fuses with no double
  evaluation.
- **Instantiation budgets.** Every consumer must keep probing for the KEYWORD
  before asking for the mode; that discipline is what kept the static work
  budget-neutral.

## Work plan

1. **Sentinel.** `__rtUnevaluated` is already declared in `sentinelKeys.ts`
   (unused). Give it the payload above in `formats/structural.ts` beside
   `ContainsSlot`, plus the items twin.
2. **Door.** Replace the `'poison'` arm of `UnevalPropsMode` / `UnevalItemsMode`
   with sentinel construction. Per-branch sets reuse `MergedClosedKeys` /
   `MergedPatternSources` / `LongestPrefixOf` verbatim — they already take
   `Root` and fuel.
3. **Protocol + collapse.** `node.Unevaluated`, lifted in
   `runtype/intersection_collapse.go`, with the MATCHING fold in
   `typeid/intersection_collapse.go` — twins by contract, an id that moves on one
   side only corrupts the cache. Add the prop to `IsContainsSentinelPropName`'s
   skip list.
4. **Emitters.** `validate.go` and `validationerrors.go`, which must agree on
   every value. Also check `hasUnknownKeys`: a key evaluated only by a passing
   branch is still a KNOWN key.
5. **Tests.** Per condition kind, plus the mock generator — it has to satisfy the
   rule it is generated from, and `mockType.ts` already trims to `closed`.

## Done when

The 27 cases conform (`node scripts/core/gen-json-schema-suite.mjs report
--update-ledger` drops them), `validate` and `validationErrors` agree on every
one, the serialize and typeid halves produce matching ids, a schema without the
keyword emits byte-identical code to today, and the guide's "Unevaluated"
section stops describing the `never` fallback.

## Shipped

All of it, and the plan held. `UnevalPropsPoison` / `UnevalItemsPoison` are now
constant `false` and the `never` fallback is gone from the door. Four places
where the implementation differs from the text above:

**The payload is flatter than the sketch.** `GuardRef` as a tagged union did not
survive contact with the wire format: a guard is a compiled subschema, and the
protocol already knows how to carry those. `UnevalGroup`
([protocol.go](../../ts-go-runtypes/internal/protocol/protocol.go)) carries
`When` / `WhenNot` as plain `*RunType` children and `WhenKey` as a string, so
the three guard kinds are three fields rather than a discriminator. `Prefix`
sits beside `Keys` / `Sources` so one struct serves both the object and array
sides.

**The items sweep is a watermark, not a ternary chain.** The descending-sort
trick assumed the groups are ordered at build time; they are not, once `if`
without `then` and a sibling `else` both contribute. `emitUnevaluatedItemsCheck`
opens `let uw = <static prefix>` and raises it per passing group
(`if (guard && uw < N) uw = N`), which is one comparison per group and needs no
ordering guarantee.

**`contains` reads the node, not the payload.** Scattered evaluated indexes
cannot ride a prefix at all, so the items emit takes the RunType node and reads
`rt.Contains` directly: any index at or past the watermark that matches a
`contains` child is skipped. This is what closed the 6 extra cases.

**Object and array splices had to be gated apart.** `rt.Unevaluated` is shared
by both kinds, and the first cut ran the object key sweep (`for (const k in v)`)
over arrays, rejecting every one. `isArrayNodeKind` now gates each side.

### Follow-up debt

Guard subschemas are compiled **twice** — once for the applicator itself, once
for the sweep — so their checks run twice at run time. Correct, but wasteful;
hoisting each arm into a shared flag (which is what this spec's "compile each arm
exactly once" line was reaching for) is the next optimisation pass. It is a
performance change, not a correctness one, so it did not block the feature.

### The last array gap, closed separately

`unevaluatedItems with nested prefixItems and items` and `… with nested
unevaluatedItems` were correctly identified here as belonging to the collapse
merge, not to this feature. They shipped in the same change via a widened
`tuple ∩ array` merge gate; see
[applicator-scoped-coverage-additionalproperties-items.md](applicator-scoped-coverage-additionalproperties-items.md).
