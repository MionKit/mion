---
type: fix
spec: guidelines
status: ready
created: 2026-08-31
---

# A validate variant plus a union makes getValidationErrors contradict validate

## Intent

`createGetValidationErrorsFn` reports `{path: [], expected: 'union'}` for values
that the matching `createValidateFn` accepts, whenever a validate OPTION is set
and the type is a union. The two functions are supposed to be two views of one
decision, so a caller that validates, gets `true`, then asks for a report anyway
is handed a contradiction.

Reproduced with real compiled functions on `main`:

```ts
type U = {a: 'x'} | {b: number};
createValidateFn<U>(undefined, {noLiterals: true})({a: 'zzz'});            // true
createGetValidationErrorsFn<U>(undefined, {noLiterals: true})({a: 'zzz'}); // [{path: [], expected: 'union'}]

type N = {n: number} | {s: string};
createValidateFn<N>(undefined, {numberMode: 'typeof'})({n: NaN});            // true
createGetValidationErrorsFn<N>(undefined, {numberMode: 'typeof'})({n: NaN}); // [{path: [], expected: 'union'}]
```

## Cause

`emitUnionValidationErrors`
(`ts-go-runtypes/internal/cachegen/typefunctions/validationerrors.go`) has no
union logic of its own: it delegates the verdict to a validator and records one
`'union'` error when that validator says no. The hash it resolves is
`operations.PlainHash("validate")` — always the PLAIN entry. Under a validate
variant (`noLiterals`, `numberMode`, `rejectCircularRefs`) the error function is
therefore asking a validator compiled with different options than the one the
caller holds.

PR #187 fixed the `checkUnknowns` half of this same line: it now picks
`validateStrict` when `ctx.ChecksUnknownKeys()`. The VARIANT half is untouched
and is what this spec is about.

## Direction

Resolve the hash from the walker's current variant rather than from
`PlainHash`. `variantKey` / `operations.FnHashFor` in `module.go` already take
the option names + `rejectCircular` and produce exactly that key.

Two things to check before assuming it is a one-line change:

- **Demand plumbing.** The comment above `emitUnionValidationErrors` explains
  that it deliberately does NOT add the hash to `walker.RTDependencies`, and
  leans on the plain validate entry always being populated by load order. A
  VARIANT validate entry has no such guarantee: a site that only ever calls
  `createGetValidationErrorsFn<U>(undefined, {noLiterals: true})` may never
  demand the matching validate variant. Verify, and demand it if not.
- **Variants are root-scoped.** `HasVariantOption` is only true at the variant
  root, and a root-scoped variant's children dispatch to PLAIN entries
  (`entryInnerPrefix`). Make sure the fix reads the variant that is actually in
  force at this node rather than assuming the root's.

## Tests

- A Go emit test per variant: the union arm's resolved hash must be the variant's
  validate entry, not the plain one, and that entry must exist in the emitted
  modules.
- A JS test pairing `createValidateFn` and `createGetValidationErrorsFn` under
  each validate option over a union, asserting `errors(v).length === 0` exactly
  when `validate(v)` is true. Both repros above belong in it.
- Worth a fuzz oracle if one does not already cover it: the plain error family
  and its validator must agree, the same property O21 pins for the strict pair.
