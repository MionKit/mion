---
type: fix
spec: guidelines
status: done
created: 2026-08-31
---

# hasUnknownKeys runsAfterValidation reported undeclared keys on an array

**Status:** done — shipped on `fix/huk-fastpath-arrays`

## What was wrong

An array is never checked for extra properties. A JSON array cannot carry
undeclared object properties (its enumerable keys ARE its elements), so every
unknown-keys family answers "nothing undeclared" for one. The
`runsAfterValidation` variant of `createHasUnknownKeysFn` did not:

```ts
type L = {length: number};

createHasUnknownKeysFn<L>()([]); // false, correct
createHasUnknownKeysFn<L>(undefined, {runsAfterValidation: true})([]); // true, wrong
```

The `[]` case is the sharp one. The fast path compares ENUMERABLE key counts,
and `length` is not enumerable on an array, so `cntEK([])` was 0 against a
declared 1 and the compare reported undeclared keys where there were none.

Cause: `emitInterfaceHasUnknownKeys` dropped `unknownKeysObjectGuard` whole
under the variant. Dropping the `typeof` / `!== null` half is right (the caller
promised the value passed validate). Dropping `!Array.isArray` is not: passing
validate does NOT prove the value is not an array, because an array really can
satisfy an object shape (`[1, 2]` is a `{length: number}`, `['x']` is a
`{0: string}`).

## What shipped

`arraySkipsHasKeyCheck` in
`ts-go-runtypes/internal/cachegen/typefunctions/unknownkeys_shared.go` gates an
object node's PARENT key check on `!Array.isArray(v)`. The hasUnknownKeys chain
is `||` ("true = something undeclared is here"), so skipping means contributing
FALSE, which is why the gate ANDs rather than ORs.

It wraps the parent check in both of the variant's forms, the count compare and
the key-array scan fallback, in `unknownkeys_has.go`. Scope is the parent check
only: the child descent still runs, guardless as the variant's contract
promises, and on an array the property reads are `undefined`, which every child
arm already answers false for. A declared `Item[]` never reaches the gate at
all, so element extras are still reported.

The JSDoc on `UnknownKeyErrorsFn` had recorded the old behaviour as intentional
("it drops the guards deliberately"); it now says which half goes and which
half stays.

## Tests

- Go emit: `TestHasUnknownKeys_RunsAfterValidationSkipsArrayParentCheck` pins the
  array gate on both parent forms and that the `typeof` / null halves stay
  dropped. `TestHasUnknownKeys_PlainVariantKeepsWholeChainGuard` pins that the
  plain family gains no second gate.
- JS: `hasUnknownKeys — an array satisfying an object shape` in
  `packages/ts-runtypes/test/features/unknownKeys.test.ts` asserts the plain
  predicate, the fast variant and `createUnknownKeyErrorsFn` all agree on `[]`,
  `[1, 2]` and `['a', 'b', 'c']` against `{length: number}` and `{0: string}`,
  plus the two flows that must not disagree, plus the declared-array and
  nested-object-on-an-array cases. All four array assertions fail without the
  emit fix.
- Fuzz: a new **O19 huk-variants-agree** oracle
  (`packages/ts-runtypes/test/fuzz/value/fuzzOracle.ts`) compares the two
  variants on every value that PASSES validate, run in the valid, invalid and
  junk passes, plus an `ArraySatisfiable` target (`{length: number}`) so the
  junk stream's arrays reach it. 22 violations in 700 runs without the fix.

## Not covered here

The spec was written against a branch carrying fused `checkUnknowns` validators
and their O18 parity oracle. Neither exists on `main`, so the three-way JS
comparison uses `createUnknownKeyErrorsFn` as the third family and the fuzz
coverage is its own oracle rather than a new target for O18. When the fused
families land they carry their own array skip; O18 and O19 then police the same
rule from two directions.
