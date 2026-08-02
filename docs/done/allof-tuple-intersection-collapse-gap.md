---
type: bug
spec: mini-plan
status: done
created: 2026-08-02
shipped: 2026-08-02
---

# allOf over prefixItems members collapses to a noop validator

**SHIPPED** on `feature/json-schema-rollout` (M9-P2). The intersection
collapse now merges TUPLE ∩ TUPLE member sets slot-wise in BOTH halves
(`typeid/tuplemerge.go`, shared by `typeid/intersection_collapse.go` and
`runtype/intersection_collapse.go`), and the JSON Schema input door accepts
the boolean subschemas the repro is spelled with. The historical repro —
`fn([1, 2, 3])` returning `true` from a `() => true` validator — now
validates exactly and its id converges with the hand-written
`[string?, number?, ...unknown[]]`.

## Logged decisions (the merge algebra)

- **Bounded merge, never a silent noop.** A slot pair resolves when either
  side is unknown/any (the other side wins) or both sides are id-equal
  (each pipeline half passes its own equality: `Compute(a) == Compute(b)`
  on the id side, `Serialize(a).ID == Serialize(b).ID` on the node side —
  twins by construction). Anything else (conflicting slots, impossible
  length windows, variadic `...T` spreads, fixed-after-rest) reports
  `ok=false` and the callers project **KindNever**: over-rejects, never
  under-validates.
- **Raw picks, caller-side optional resolution.** Picks carry the RAW slot
  types (undefined kept on optional slots); each caller applies the exact
  per-slot formula of its plain-tuple projection (`optionalChildID + "?"`
  on the id side, `serializeOptionalChild` on the node side). This is what
  makes the merged id BYTE-EQUAL to the hand-written tuple's. A first cut
  that pre-stripped with `GetNonNullableType` broke on `unknown?` slots
  (`NonNullable<unknown>` is `{}`), conflicting everything to never.
- **Merged-required slots use the stripped type** (an optional-sourced
  winner must not leak its optionality-encoding `undefined` into a
  required slot); an opaque strip (`T | null | undefined`, no single
  checker type) in that position is a bounded give-up (never).
- **Length window.** required = max over members; a closed member caps the
  merge at its fixed length (`maxAllowed`); `minRequired > maxAllowed` is
  a provably empty schema → never. The open tail survives only when EVERY
  member is open (element types merged by the same slot rule).
- **`never` wins a slot** (a JSON Schema `false` subschema): `T ∧ never`
  at an optional position keeps a never slot ("no real value here");
  at a required position the whole merge is never (no length satisfies) —
  semantically exact, not just bounded.
- **Labels are dropped on merge.** Schema tuples carry none; a labeled
  hand-written merge is outside the convergence contract.
- **Translation-side widening (2020-12 core §4.3.2), deliberately scoped
  to the array family**: `prefixItems` elements and `items` now accept
  boolean schemas (`true` slot → unknown padding; `false` slot → never →
  an `undefined?` slot after the checker absorbs `never | undefined`,
  enforcing "no real value at this position" under the engine's
  undefined ≡ absent optional doctrine; `items: true` = open tail, same
  as absent). Boolean members in OTHER schema positions (`anyOf` /
  `oneOf` / `allOf` members, `properties` / `$defs` / `patternProperties`
  values) still reject at the input type — logged as an open corner in
  [json-schema-2020-12-keyword-gaps-and-not-format.md](../todos/json-schema-2020-12-keyword-gaps-and-not-format.md).
- **`ExactJsonSchemaList` skips boolean members** (wrapping `true` in the
  excess-key guard would fold boolean's own method keys into the check),
  mirroring the existing `ExactJsonSchemaBoolMap` rule.

## Where the pins live

- Go (collapse level): `internal/cachegen/runtype/typeid/tuplemerge_test.go`
  — convergence with the hand-written tuple (required + all-optional
  variants), marker form-equivalence, conflict → never, impossible length
  window → never, closed-side capping.
- JS (door level): `test/suites/json-schema-define/structuralKeywords.test.ts`
  — the historical repro validating exactly, id convergence, the
  hand-written `[string, ...unknown[]] & [unknown?, number?, ...unknown[]]`
  twin through both `getRunTypeId` shapes, conflict → never, boolean slot
  schemas, `items: true`; plus verr / mock soundness rows.
- The M5 `unevaluatedItems: false` merged-prefix lowering row is restored in
  `test/suites/json-schema-define/referencesUneval.test.ts` (closes at the
  longest merged prefix across allOf branches).

## Symptom (historical)

`{type:'array', prefixItems:[A], allOf:[{prefixItems:[true, B]}]}`
translates to `own-tuple & member-tuple` (the member is type-less, so its
array arm is a tuple), and the resolver's intersection collapse could not
classify a TUPLE ∩ TUPLE member pair: the node degraded and the emitted
validator was `() => true` — the whole constraint silently vanished.
(A second stacked cause: the input type rejected the `true` padding slot
itself, degrading the whole call to `unknown` before the engine ever saw
tuples.)

Found while testing the M5 `unevaluatedItems: false` merged-prefix
lowering, but the gap was PRE-EXISTING and independent of unevaluated*:
any `allOf` whose members carry `prefixItems` (or any two tuple-producing
constraints intersected) hit it.

## Repro (now a regression row)

```ts
const fn = createValidateFn(runTypeFromJsonSchema({
  type: 'array',
  prefixItems: [{type: 'string'}],
  allOf: [{prefixItems: [true, {type: 'number'}]}],
}));
fn([1, 2, 3]); // false — merged tuple enforced (was true, the noop)
```
