---
type: fix
spec: full-plan
status: done
created: 2026-08-10
completed: 2026-08-10
---

# A `oneOf` that is not the WHOLE union is silently dropped everywhere

## Problem

`OneOf<[A, B]> | C` is a type a user can write today. It type-checks, it
reflects with all of its arms, and the consumers of that graph mishandled it —
including `validate`, which rejected values the type accepts.

Found by the widened convert fuzz generator (`fuzz_atoms_test.go`), which
started drawing `OneOf` arms inside plain unions. Eight of eight seeds failed on
the same shape.

### The soundness bug, with no converter involved

```ts
type WithExtraArm = OneOf<[{a: string}, {b: number}]> | number;
const isWithExtra = createValidateFn<WithExtraArm>();
isWithExtra(42); // false — but 42 IS a valid WithExtraArm, and this call type-checks
```

The realistic spelling is the nullable one, `OneOf<[A, B]> | null`, which was
broken the same way: `validate` rejected `null`.

### The graph was fine; the consumers were not

Reflecting `OneOf<[{a}, {b}]> | number` gives exactly what
`reflection.RunType.OneOf`'s contract promises:

```
kind=23 (union)  oneOf=2  children=3
  children -> [number, {a}, {b}]
  oneOf    -> [{a}, {b}]
```

`Children` held all three flattened members, `OneOf` held the two branches.
Nothing was lost in the reflection. Every downstream reader then assumed `OneOf`
IS the whole union.

## What the surfaces turned out to be

The spec was filed naming five surfaces. Investigation corrected that to **two**:

- The **door was fine.** `FromAnyOf` (`fromJsonSchema.ts:1377`) is a plain TS
  union, so `{anyOf: [{oneOf: […]}, C]}` already built `OneOf<[A,B]> | C`
  correctly.
- The **builder surface was fine.** `RT.oneOf` returns `RunType<OneOf<…>>`
  (`compose.ts:299`), so `RT.union([RT.oneOf([…]), X])` was already the right
  type.
- Both had been measured through the converter, whose printers dropped the arm —
  so the drop looked like it lived in them.

| Surface | What happened | Where |
| --- | --- | --- |
| `validate` codegen | Branch counting REPLACED the OR-chain, so the extra arm was never checked → rejected valid values | `typefunctions/validate.go`, `emitUnionValidate` |
| `validationErrors` | Same assumption, inherited from the validate delegate | `typefunctions/validationerrors.go` |
| convert (all THREE printers) | Emitted the branches alone, dropping the arm — the type printer had no guard at all | `internal/convert/print.go` |

Two carriers was a second, deeper defect: `OneOfFromMembers`
(`typeid/formats.go`) returned `(nil, false)` on ≥2 unclaimed carriers, so
`OneOf<[A,B]> | OneOf<[C,D]>` projected plain and **both** exclusivity
constraints vanished. It also made that type collide with `A | B | C | D` on its
id — two different types, one identity.

## What shipped

**The model grew groups.** `RunType.OneOf` is now `[][]*RunType`: one branch
list per exclusive level. `OneOfFromMembers` returns every level carrier instead
of failing on the second, ordered by the carrier tuple's canonical print so the
result is deterministic.

**Ids did not move.** The fold appends one `oo{…}` per group, so a single-group
type prints the byte string it always did. The only id that changed is the
two-carrier collision, which gains its first `oo{…}` and stops sharing an
identity with the plain union of the same members.

**`emitUnionValidate` joins instead of replacing.** Each group emits its own
`count === 1`, they OR together, and the ordinary OR-chain over the arms the
groups do not cover ORs in beside them. The OR-chain was extracted
(`emitUnionMemberChain`) so both paths run the same weak-type gating and shared
object guard rather than a copy. A single group covering its whole union emits
exactly the code it always did.

**`validationerrors.go`** counts per group and keeps the largest count, so the
"matched several" story names the group that actually over-matched. One group
emits byte-identical code.

**convert prints the real spelling** on all three targets — `RT.OneOf<[…]> | C`,
`RT.union([RT.oneOf([…]), C])`, `{anyOf: [{oneOf: […]}, C]}` — and the CNV001
refusal that shipped as a stopgap is gone, along with its rows in
`unsupported-conversion.test.ts` and the website table.

**The JS reflection surface follows:** `RunType.oneOf` is `RunType[][]`, and the
mock walker and negation matcher iterate groups (the mock's exclusivity check
now counts siblings within the drawn branch's own group).

### One thing deliberately left conservative

Coverage is computed by differencing `RunType.ID`, which is exact only while
every branch is an ordinary member. A UNION-valued branch flattens into the
outer union and may be re-distributed on the way, so the outer `Children` hold
members that belong to the branch without appearing in the branch node's own
children — differencing ids then invents arms.

That is not hypothetical: the door lowers `allOf: [A, B, {oneOf: [C, D]}]` to
`OneOf<[A∧B∧C, A∧B∧D]>`, two branches that are unions of 69 members while the
outer union holds 93. Three of the difference were artifacts, and ORing them in
accepted two values the exclusivity rejects — caught by
`unevaluatedProperties.json :: unevaluatedProperties + ref inside allOf / oneOf`
in the official 2020-12 suite.

So a union-valued branch means no arms: the whole union counts as covered, which
is the behaviour that has always shipped. `OneOf<[A | B, C]> | D` therefore still
drops `D`. Filed as `docs/todos/oneof-union-valued-branch-arms.md`, with the fix
direction (carry the plain-arm split from the serializer, where the carriers are
still visible, instead of re-deriving it downstream).

### One bug found while landing it

The type printer joined union arms without parenthesizing a function arm, so
`OneOf<[…]> | ((a: A) => B)` printed as `(a: A) => B | RT.OneOf<[…]>` — which
reparses as a function RETURNING the union, a different type and a different id.
The non-oneOf path had the guard; the new one did not. Both now share
`unionArmTypeText`. Found by the fuzz lane on the first program that put a
function beside an exclusive group.

## Tests

`packages/ts-runtypes/test/suites/json-schema-define/oneOfAnyOf.test.ts` gained
two groups of cases: a oneOf beside ordinary arms (extra primitive arm, `| null`,
extra object arm, the reflected shape, and identity with both `getRunTypeId`
call shapes), and two exclusive groups in one union (both constraints kept, two
groups reflected, and the id no longer colliding with the plain union).

The convert fuzz generator draws `OneOf` in plain-union position again —
`randomUnionArm`, the workaround added when the converter refused, is deleted.

## Done when

- `createValidateFn<OneOf<[A,B]> | C>()` accepts a `C` and still rejects a value
  matching both A and B. ✅
- `OneOf<[A,B]> | null` accepts `null`. ✅
- Two `OneOf`s in one union keep both exclusivity constraints, and no longer
  share an id with the plain union of the same members. ✅
- convert emits a real spelling on all three targets; the fuzz generator draws
  `OneOf` in union position again. ✅
- Every id that works today is byte-identical. ✅
- The door round-trips `{anyOf: [{oneOf: […]}, …]}` — it always did; no change
  was needed. ✅
