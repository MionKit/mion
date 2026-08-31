---
type: fix
spec: guidelines
status: done
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

## Plan — resolve the delegate under the walker's own variant (approved 2026-08-31)

What shipped, in three pieces.

**1. The union arm reads the walker's variant.** `emitUnionValidationErrors` no
longer hard-codes `operations.PlainHash("validate")`. A new
`EmitContext.CrossFamilyVariantHash("validate")` mints the hash from the
ValidateOptions names in force on the current walker, so a `noLiterals` /
`numberMode` error function asks the validator the caller actually holds.

`rejectCircularRefs` is deliberately NOT folded in. The armed guard is emitted
once at the variant ROOT, so at every node the walker inlines the armed fork
behaves exactly like the plain one, while the armed ENTRY for that node's own
type would carry a guard of its own. Naming the plain hash is what keeps the two
sides in step. The armed root still reports a cycle: its own guard fires and
returns before the union body runs.

The spec's second check ("read the variant in force at this node") resolves to
the walker's option set. `HasVariantOption` is walker-scoped, and root-scoping is
enforced by dep-call dispatch, not by the node: a child the walker INLINES sees
the option (which is why `noLiterals` bites on a literal nested in a union arm at
all), and a child it does NOT inline is dep-called as a plain entry whose own
body resolves the plain hash. Validate's walker inlines at the same positions, so
the two stay in step at every node.

**2. Demand plumbing, as the spec suspected.** A verr-only variant site never
demands the matching validate variant. The plain lane was already carried by the
resolver's cross-family fixpoint (`registerRTLookup` records the edge, the entry
rides `SoftDeps`), but that fixpoint routed edges through a PLAIN-fnHash-only
reverse map and collected every missing edge as a plain root.

- `operations.AllFnVariants()` enumerates the closed (operation, args) set once;
  the collision guard and a new `VariantForFnHash` reverse map both read it, so
  they cannot drift.
- `familyByFnHash` (dispatch.go) replaces `familyByPlainHash`, routing an
  option-carrying hash to its family AND its variant. Only the option axes are
  enumerated, so the plain rows are unchanged.
- `typefunctions.ExtraRoot` replaces the bare `[]string` extra roots, so the
  fixpoint can ask a family for a VARIANT root rather than only a plain one.

**3. Tests.**

- `ts-go-runtypes/internal/cachegen/typefunctions/union_verr_variant_test.go` —
  the union arm's resolved hash is the variant's validate entry across plain /
  noLiterals / numberTypeof / a two-option combo, the edge lands in
  `CrossFamilyDeps`, and following that edge the way the fixpoint does actually
  renders the entry. Confirmed to fail on the unfixed emitter.
- `ts-go-runtypes/internal/compiler/resolver/cross_family_variant_route_internal_test.go`
  — the routing map sends every validate variant to the validate family with the
  right suffix, and the reverse map covers every minted hash.
- `packages/ts-runtypes/test/features/validateOptionsDispatch.test.ts` — a new
  describe block pairing `createValidateFn` and `createGetValidationErrorsFn`
  over unions under each option, asserting `errors(v).length === 0` exactly when
  `validate(v)` is true. Both repros from this spec are in it, plus the
  value-first call shape per the marker coverage rule.

**No fuzz suite added.** Oracle O4 (`packages/ts-runtypes/test/fuzz/value/fuzzOracle.ts`)
already states this property; its targets are built schema-form with no options,
so the variant lane is out of its reach. Widening the fuzz harness to option
variants is its own change, not this fix. The value matrix in the new JS test
covers the same property deterministically.

**No docs change.** The guide already states the contract this restores ("Same
checks, but instead of a boolean you get an array of what failed") and already
documents every option as applying to both factories. Nothing on the site
described the broken behaviour.
