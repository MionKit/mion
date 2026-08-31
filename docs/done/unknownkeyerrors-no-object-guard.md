---
type: fix
spec: guidelines
status: done
created: 2026-08-31
---

# createUnknownKeyErrorsFn throws on null and invents keys on a primitive

## Intent

`createUnknownKeyErrorsFn<T>()` descends into `T`'s declared properties with no
object guard at the root. Given anything that is not a non-null object it either
throws or fabricates entries:

```ts
type Address = {street: string; city: string};
type Person = {name: string; age: number; address: Address};
const keyErrors = createUnknownKeyErrorsFn<Person>();

keyErrors(null);        // TypeError: Cannot read properties of null (reading 'address')
keyErrors(undefined);   // TypeError: Cannot read properties of undefined (reading 'address')
keyErrors('a string');  // 8 entries: {path:['0'],expected:'never'} … {path:['7'],expected:'never'}
```

The string case is the nastier one: it returns confidently wrong data rather than
failing, one bogus `{expected: 'never'}` per character index.

`createHasUnknownKeysFn` does not have this problem, and neither does the fused
`{checkUnknowns: true}` validator (its key check sits inside the object guard's
`else`), so this is specific to the `unknownKeyErrors` (`uke`) family.

## Evidence

Found while building the `checkUnknowns` fused validators. The parity test there
compares the fused report against `[...typeErrors(v), ...keyErrors(v)]`, and the
composition blew up on exactly these inputs while the fused family returned the
correct `[{path: [], expected: 'objectLiteral'}]`. The test now restricts its
oracle to guard-admitted values and says why, so it will keep passing after this
fix; see `packages/ts-runtypes/test/features/checkUnknowns.test.ts`, the
"parity with the two-call composition" suite.

The crash is in the CHILD descent, `unknownKeysChildrenCode` (reached from
`emitObjectUnknownKeyErrors`,
`ts-go-runtypes/internal/cachegen/typefunctions/unknownkeys_errors.go`), which
emits `v.address`-style property reads with nothing above them asserting `v` is an
object. Compare `emitObjectValidationErrors`
(`typefunctions/validationerrors.go`), which wraps the whole child body in
`if (!(typeof v === 'object' && v !== null)) {...} else {...}`.

Pre-existing, not introduced by the `checkUnknowns` work: the only edit that
landed in `unknownkeys_errors.go` there was extracting the PARENT-level block into
`emitParentUnknownKeyErrors`, which is behaviour-identical and does not touch the
child path.

## Direction

The implementer plans it. The open question worth settling first is what the
family should DO for a guard-rejected value, because there is a real choice:

- Return `[]` (nothing was undeclared, because nothing is there). Simple, and
  consistent with `createHasUnknownKeysFn` returning false.
- Return a single shape error, matching what the fused family reports.

Prefer whichever keeps `uke` composable with `verr`, since concatenating the two
is the documented way to build a strict report today.

Note this family sits in the same "caller promises a validated value" tradition as
`hasUnknownKeys`'s `runsAfterValidation`, so an alternative reading is that the
input is simply out of contract. Even then, silently returning per-character
entries is not an acceptable failure mode; pick a defined answer.

## Done when

`keyErrors(null)`, `keyErrors(undefined)`, `keyErrors('a string')` and
`keyErrors(42)` all return the chosen defined result and never throw; a test pins
each; the choice is reflected in the `createUnknownKeyErrorsFn` doc comment in
`packages/ts-runtypes/src/createRTFunctions.ts`; `pnpm test` and
`go -C ts-go-runtypes test ./internal/...` green.

---

## What shipped (2026-08-31)

### The decision the spec left open

**A guard-rejected value yields the family's NEUTRAL answer: `unknownKeyErrors`
returns `[]`, `hasUnknownKeys` returns `false`.** Not a shape error.

The reason is the composition the spec asked to protect. `getValidationErrors`
already reports the shape, so a shape error from `unknownKeyErrors` would make
the documented strict report name it twice:

```ts
// null, with uke returning a shape error:  DUPLICATED
[...typeErrors(null), ...keyErrors(null)];
// [{path: [], expected: 'objectLiteral'}, {path: [], expected: 'objectLiteral'}]

// null, with uke returning []:  what shipped
[...typeErrors(null), ...keyErrors(null)];
// [{path: [], expected: 'objectLiteral'}]
```

Returning `[]` also lines the family up with `hasUnknownKeys` returning `false`,
and states the honest thing: this family answers "which keys are undeclared",
and a value that is not the declared shape has none.

### The bug was wider than the spec knew

Two claims in the Intent section above did not survive contact with the code:

- **`createHasUnknownKeysFn` has the SAME bug.** Its parent key scan is guarded,
  but the `||` chain does not short-circuit the CHILD descent away, so
  `has(null)` on a shape with a nested object still read `v.address` and threw.
- **It is not only the object node.** Every composite descent was unguarded:
  an array root read `null.length`, a tuple root read `null[0]`, and a Map / Set
  root bailed with a bare `return`, which — inlined into the parent closure —
  abandoned the whole walk and handed back `undefined` where the contract
  promises an array.

All of it is one defect (the unknown-keys descent assumes a shape nothing
asserts) on one code path, so all of it is fixed here.

### The fix

Every composite unknown-keys node renders its body under a shape guard, the
same predicate the merged-union emit already used:

```go
// object node                                    array / tuple node
typeof v === 'object' && v !== null            Array.isArray(v)
  && !Array.isArray(v)
```

Touched, all in `ts-go-runtypes/internal/cachegen/typefunctions/`:

- `unknownkeys_shared.go` — the two guard helpers plus `guardStatement`; tuple
  descent guarded.
- `unknownkeys_errors.go` — object node guarded; Map / Set bail turned into a
  positive wrap so the errors array is always returned.
- `unknownkeys_arms.go` — array element descent guarded.
- `unknownkeys_has.go` — the whole `||` chain guarded, and the parent scan's own
  now-redundant copy of the guard dropped.

`hasUnknownKeys`'s `runsAfterValidation` variant stays guardless: its contract is
that the caller already validated the value, and that is the point of the option.

### Tests

- `packages/ts-runtypes/test/features/unknownKeys.test.ts` — behaviour: every
  rejected value across both families, at the root and nested, on object / array
  / tuple / Map / Set / index-signature roots; that real unknown keys are still
  reported at both depths; that the strict report never double-names the shape;
  and both factory call shapes (static and value-first).
- `ts-go-runtypes/internal/cachegen/typefunctions/unknownkeys_guard_test.go` —
  the guard is present in the emitted source and opens the body, so a key scan
  can never run ahead of it.

### Docs

- `createUnknownKeyErrorsFn`'s doc comment in
  `packages/ts-runtypes/src/createRTFunctions.ts` states the keys-only contract.
- `container/website/sites/runtypes/content/02.guide/03.validation.md` and the
  `packages/examples/src/guide/unknown-keys-errors.ts` example say the same for
  readers, and show the two lists being joined.

### Not done here

The parity suite the spec points at (`test/features/checkUnknowns.test.ts`) does
not exist on `main`; it belongs to the unmerged `checkUnknowns` work. Widening
its oracle back out is that branch's to do, and the fix here is what makes it
possible.

