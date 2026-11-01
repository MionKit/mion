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
