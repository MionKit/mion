---
type: fix
spec: guidelines
status: ready
created: 2026-11-01
---

# Strict key count disagrees with the error list when a declared prop is not an own enumerable key

## Intent

With `checkUnknowns`, an all-required object with no index signature validates its keys with a count:
`cntEK(v) === N` (`countFastPathN` + `emitCountKeys`, `ts-go-runtypes/internal/cachegen/typefunctions/unknownkeys_shared.go`).
That count is only sound when every declared prop is an enumerable key of the value. The error list instead scans
key NAMES (`getUnknownKeysFromArray`), so the two disagree on any value whose declared prop passes the property
check without being enumerated.

Repro (both seen on run-types at this commit):

```ts
interface G {id: number; name: string}
class WithGetter { get id() { return 1; } name = 'a'; }
createValidateFn<G>(undefined, {checkUnknowns: true})(new WithGetter()); // false: for-in sees 1 key, not 2
createGetValidationErrorsFn<G>(undefined, {checkUnknowns: true})(new WithGetter()); // []
```

Add an extra own key (`extra = 1` on the class) and it flips: the count is 2, so validate says true while the
error list reports `extra`. Same for a prop defined with `Object.defineProperty(..., {enumerable: false})`.

An array's `length` is the one built-in case and is already handled: `countFastPathN` refuses the count when a
declared name is `length`. This todo is the general case, which needs a design call: the count is the strict
validator's fast path (the `STRICT.*` benchmark cases ride it), and a sound check per value costs a per-key test.

## Direction

- Decide the contract first: is "a strict object's enumerable key set equals its declared set" the rule (then the
  error list should also flag a declared prop that is not enumerable), or is "no undeclared enumerable key" the
  rule (then the count needs a fallback to the name scan, without a per-value cost on the clean path)?
- Whichever wins, validate and the error list must agree for class instances with getters, inherited props and
  non-enumerable own props, both marker call shapes.
- Measure the strict benchmark cases before and after. The implementer plans the details.

## Docs

None, because strict objects already document rejecting and reporting unknown keys; this makes both functions say
the same thing.

## Done when

- Validate and errors agree on the repro above and its `extra` variant, pinned by paired tests.
- No measurable slowdown on the clean path of the strict benchmark cases, or the trade is stated in the PR.
- The simplify-comments pass ran on every touched source file, committed on its own.

## Plan: count in both strict families (approved 2026-11-04)

The maintainer chose to keep the key count, the strict validator's fast path, and to make the error report follow it,
rather than switch either function to a name check. Which answer a value with a getter, inherited or non-enumerable
declared prop deserves is left to a separate review of class getters and setters.

- Validate: unchanged, `cntEK(v) === N` on an all-required shape.
- Errors (`emitParentUnknownKeyErrors`): on the same shapes, snapshot the error count before the property checks.
  A node whose props all passed reports keys only when `cntEK(v) !== N`: the unknown names as before, plus one
  shape error (`objectLiteral` / `class`) at the object when no name is unknown. A node with a prop error lists every
  unknown name, as before, so a missing prop plus an extra key still names the extra key.
- Tests: paired static / value-first Vitest cases over a getter, non-enumerable and inherited prop, each with and
  without an extra key, for an all-required and an optional-prop shape; Go tests pin the gated error body.
- Fuzz: the value lane hides one own key (non-enumerable, inherited or prototype getter) of the valid, extras and
  planted values and checks O3 + O21. Proven by a negative control: the old resolver fails O21 on that phase.
- Benchmark: measure the STRICT cases' validate and errors before and after.

## What shipped

- As planned. Both repro values now get the same answer from validate and errors: `{get id, name}` is rejected with a
  `{path: [], expected: 'objectLiteral'}` entry, `{get id, name, extra}` is accepted by both (count 2 === 2).
- Benchmark (Node, ns per call, valid values): validate unchanged; strict errors got faster on the count path, e.g.
  moltar_dto 65 → 32, flat_required 27 → 21, realworld_order 145 → 100. Invalid values unchanged.
- Getter semantics, and the all-required class that declares its own getter (its instances fail the count), moved to
  a separate guidelines todo on class getter and setter support.
