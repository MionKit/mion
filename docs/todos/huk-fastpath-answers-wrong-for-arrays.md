---
type: fix
spec: guidelines
status: ready
created: 2026-08-31
---

# hasUnknownKeys runsAfterValidation reports undeclared keys on an array

## Intent

An array is never checked for extra properties. A JSON array cannot carry
undeclared object properties (its enumerable keys ARE its elements), so every
unknown-keys family answers "nothing undeclared" for one. The
`runsAfterValidation` variant of `createHasUnknownKeysFn` does not, and answers
wrongly as a result.

Reproduced with real compiled functions:

```ts
type L = {length: number};

createHasUnknownKeysFn<L>()([]); // false, correct
createHasUnknownKeysFn<L>(undefined, {runsAfterValidation: true})([]); // true, wrong
// [] carries no undeclared keys at all
```

The `[]` case is the sharp one. The fast path compares ENUMERABLE key counts,
and `length` is not enumerable on an array, so `cntEK([])` is 0 against a
declared 1 and the compare reports undeclared keys where there are none.

This makes the two documented ways of writing strict validation disagree on any
shape an array satisfies:

```ts
validate(v) && !hasUnknownKeys(v);                              // accepts []
validate(v) && !hasUnknownKeysRunsAfterValidation(v);           // rejects []
createValidateFn<L>(undefined, {checkUnknowns: true})(v);       // accepts []
```

## Cause

`emitInterfaceHasUnknownKeys`
(`ts-go-runtypes/internal/cachegen/typefunctions/unknownkeys_has.go`) drops
`unknownKeysObjectGuard` entirely under the variant:

```go
if ctx.HasVariantOption("runsAfterValidation") {
    return RTCode{Code: chain, Type: CodeE}
}
return RTCode{Code: "(" + unknownKeysObjectGuard(ctx.Vλl) + " && " + chain + ")", Type: CodeE}
```

Dropping the `typeof` / `!== null` half is right: the caller promised the value
passed validate, so shape is established. Dropping `!Array.isArray` is not, and
the reason is easy to miss — passing validate does NOT prove the value is not an
array, because an array really can satisfy an object shape (`[1, 2]` is a
`{length: number}`, `['x']` is a `{0: string}`).

## Direction

Skip the parent key check for an array in the `runsAfterValidation` variant too,
matching the blind variant and the fused `checkUnknowns` families (see
`arraySkipsKeyCheck` in `unknownkeys_shared.go`, which does exactly this for
them and documents the reasoning).

Watch the polarity and the scope:

- `hasUnknownKeys` composes with `||`, so "skip" means contributing FALSE, not
  true. The fused validator's `&&` chain wants the opposite.
- Skip the PARENT check only. The child descent must still run, and under this
  variant the child arms are guardless by contract, so wrapping the whole chain
  would change more than intended.

## Tests

- A Go emit test: the `runsAfterValidation` variant's object arm carries an array
  gate on its parent check.
- A JS test asserting the blind variant, the fast variant and the fused
  `checkUnknowns` validator all give the same answer for `[]`, `[1, 2]` and
  `['a', 'b', 'c']` against `{length: number}` and `{0: string}`.
- A fuzz target with an array-satisfiable shape, so the existing O18 parity
  oracle covers the case rather than never generating it.
