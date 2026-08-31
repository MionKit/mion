---
type: fix
spec: guidelines
status: ready
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
