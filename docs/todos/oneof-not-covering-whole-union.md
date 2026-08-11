---
type: fix
spec: full-plan
status: ready
created: 2026-08-10
---

# A `oneOf` that is not the WHOLE union is silently dropped everywhere

## Problem

`OneOf<[A, B]> | C` is a type a user can write today. It type-checks, it
reflects with all of its arms, and **every consumer of that graph mishandles
it** — including `validate`, which rejects values the type accepts.

Found by the widened convert fuzz generator (`fuzz_atoms_test.go`), which
started drawing `OneOf` arms inside plain unions. Eight of eight seeds failed
on the same shape.

### The soundness bug, with no converter involved

```ts
type WithExtraArm = OneOf<[{a: string}, {b: number}]> | number;
const isWithExtra = createValidateFn<WithExtraArm>();
isWithExtra(42); // false — but 42 IS a valid WithExtraArm, and this call type-checks
```

A validator that rejects a value its own type accepts is the most serious class
of defect in this codebase. Reproduced in
`packages/ts-runtypes/test/features/` with a plain `createValidateFn`.

### The graph is fine; the consumers are not

Reflecting `OneOf<[{a}, {b}]> | number` gives exactly what
`reflection.RunType.OneOf`'s contract promises:

```
kind=23 (union)  oneOf=2  children=3
  children -> [number, {a}, {b}]
  oneOf    -> [{a}, {b}]
```

`Children` holds all three flattened members, `OneOf` holds the two branches.
Nothing is lost in the reflection. Every downstream reader then assumes
`OneOf` IS the whole union.

## Five surfaces, one root cause

| Surface | What happens | Where |
| --- | --- | --- |
| `validate` codegen | Branch counting REPLACES the OR-chain, so the extra arm is never checked → rejects valid values | `internal/cachegen/typefunctions/validate.go`, `emitUnionValidate` (`if len(rt.OneOf) > 0 { return … }`) |
| `validationErrors` | Same shape, same assumption | `internal/cachegen/typefunctions/validationerrors.go` |
| convert → builders | Emits `RT.oneOf([A,B])`, silently dropping `C` | `internal/convert/print.go`, `builderExpr` KindUnion |
| convert → json-schema | Emits `{oneOf: [A,B]}`, silently dropping `C` | `internal/convert/print.go`, `schemaExpr` KindUnion |
| the door | `{anyOf: [{oneOf: [A,B]}, {type: 'number'}]}` reads back as `OneOf<[A,B]>` | `packages/ts-runtypes/src/json-schema/fromJsonSchema.ts` |

Two arms make it worse than a single dropped member:

- **Two `OneOf`s in one union** (`OneOf<[A,B]> | OneOf<[C,D]>`) collapse to a
  PLAIN union `A | B | C | D` — both exclusivity constraints silently lost.
- **`OneOf<[A,B]> | null`** reflects to `any` through the builder surface.

### The builder surface cannot express it either

The obvious spelling does not round-trip:

```ts
RT.union([RT.oneOf([RT.object({a: TF.string()}), RT.object({b: TF.number()})]), TF.number()])
// reflects back as: RT.OneOf<[{a: string}, {b: number}]>   ← the number arm is gone
```

So there is currently NO way to write this shape in value-first form, which is
why the converter cannot simply emit the right thing.

## The design question (why this is filed, not fixed inline)

Two coherent answers, and picking one is not a call to make alone:

1. **Support it.** `OneOf<[A,B]> | C` means "exactly one of A/B, or C". Validate
   becomes `oneOfCount(branches) === 1 || <check the uncovered arms>`. The graph
   already carries everything needed — the uncovered arms are
   `Children` minus the branch members, comparable by `RunType.ID`. The door
   gets the matching `anyOf`-of-`oneOf` reading, and the builder surface needs
   `RT.union` to stop swallowing a `oneOf` arm's sentinel.
2. **Reject it at the type level**, so `OneOf<[A,B]> | C` is a compile error and
   the shape can never reach the graph. Narrower, but it forbids something JSON
   Schema expresses natively, which the door then cannot accept.

Answer 1 is the better product, and the graph is already shaped for it. Answer 2
is much less work. The choice decides whether the door must ALSO learn the
reading, so it should be made before any code moves.

## Plan (assuming answer 1)

1. **`validate.go` — `emitUnionValidate`.** When `len(rt.OneOf) > 0`, compute the
   children not covered by the branches (a branch may itself be a union, so a
   union branch contributes its own children's IDs, and any other branch
   contributes its own). No uncovered arms → today's code path, unchanged. Some
   uncovered → `oneOfCount(branches) === 1 || <ordinary union check over the
   uncovered arms>`. The cleanest build is a shallow copy of the node with
   `OneOf` cleared and `Children` set to the uncovered arms, recursed through
   the same emitter, so all the existing weak-type / dataOnly / discriminator
   handling is reused rather than duplicated. Check the discriminator caches
   (`safeUnionChildren`, `unionDiscriminators`) are recomputed or cleared on the
   copy — they are computed for the FULL child set and would be stale.
2. **`validationerrors.go`** — the same treatment, so the reported error matches
   the verdict.
3. **The door** — `anyOf` whose arm carries `oneOf` must build the union of
   (that arm's `OneOf`) with the other arms, instead of hoisting the `oneOf` to
   the whole node.
4. **The builder surface** — `RT.union([RT.oneOf([…]), X])` must keep both. This
   is the piece with the least evidence so far; investigate how the `__rtOneOf`
   sentinel survives `RT.union` before designing.
5. **convert** — once a representation exists, replace the refusal (see below)
   with the real spelling on both targets.

## Tests

- A `validate` test per shape: extra primitive arm, extra object arm, `| null`,
  two `OneOf`s in one union. Each asserts BOTH that a value matching the extra
  arm is accepted AND that a value matching two branches of one `OneOf` is
  rejected — the exclusivity must survive the fix.
- The marker coverage rule applies: any case touching `getRunTypeId` covers both
  call shapes.
- Chain tests in `internal/convert` once convert can spell it.
- The convert fuzz generator already draws the shape; put `OneOf` back into the
  plain-union arm of `randomTypeText` when this lands (it is currently placed so
  it cannot land inside a union — see the comment there).

## Done when

- `createValidateFn<OneOf<[A,B]> | C>()` accepts a `C` and still rejects a value
  matching both A and B.
- Two `OneOf`s in one union keep both exclusivity constraints.
- The door round-trips `{anyOf: [{oneOf: […]}, …]}`.
- The convert refusal is replaced by a real spelling, and the fuzz generator
  draws `OneOf` in union position again.

## What shipped meanwhile (in the conversion PR)

The converter no longer drops the arm silently: a union carrying a `oneOf` that
does not cover every member REFUSES with CNV001 on both targets, and the row is
pinned in `unsupported-conversion.test.ts`. Silent loss became a loud refusal,
which is the converter's documented contract for anything it cannot spell. The
underlying soundness bug in `validate` is untouched and is what this spec is
for.
