---
type: fix
spec: full-plan
status: done
created: 2026-08-10
completed: 2026-08-10
---

# A `oneOf` that is not the WHOLE union is silently wrong

## Problem

`OneOf<[A, B]> | C` is a type a user can write today, and `validate` **rejected
values it accepts**:

```ts
type WithExtraArm = OneOf<[{a: string}, {b: number}]> | number;
createValidateFn<WithExtraArm>()(42); // false — 42 IS a valid WithExtraArm
```

The realistic spelling is the nullable one, `OneOf<[A, B]> | null`, broken the
same way: `validate` rejected `null`.

Found by the widened convert fuzz generator (`fuzz_atoms_test.go`) once it
started drawing `OneOf` arms inside plain unions. Eight of eight seeds failed.

### Why

Exclusivity is checked by COUNTING how many branches a value matches, and that
count decides the whole union — `emitUnionValidate` returned the counting and
never reached the OR-chain. So a member that is not one of the branches was
never checked at all.

A second shape was wrong in the other direction. `OneOfFromMembers` gave up when
it found two level carriers, so `OneOf<[A,B]> | OneOf<[C,D]>` projected as a
PLAIN union: both exclusivity constraints vanished, and the type hashed
identically to `A | B | C | D` — two different types, one identity.

## What shipped: refuse it, do not approximate it

The engine refuses both shapes at build time with **OOF001** (severity Error, so
the build fails at the call site under the `failOnError` contract). There is
deliberately no runtime `alwaysThrow` backstop — the build error is the
enforcement.

Detection lives in `typeid.OneOfDefect`
(`internal/cachegen/runtype/typeid/formats.go`) and runs on CHECKER types, where
a `__rtOneOf` carrier is directly visible. `serialize.go` stamps the finding on
the union node as `reflection.FlagOneOfDefect`, because by the time any consumer
reads the projected graph the collapse has stripped the carriers and a plain
union is indistinguishable from a two-carrier one. `emitUnionValidate` and
`emitUnionValidationErrors` read the flag and emit the diagnostic.

A member with no carrier is fine when it is IN the level's branch tuple — a
nullish branch stays plain by construction, so `OneOf<[A, null]>` is whole while
`OneOf<[A, B]> | null` is not. A union-valued branch has its members expanded
into that tuple, which is what keeps the official suite's nullable-via-`anyOf`
shape working.

### What is NOT refused

`oneOf` written beside other KEYWORDS in a JSON Schema is untouched. The
official 2020-12 suite tests exactly that — `allOf.json :: "allOf combined with
anyOf, oneOf"`, the schema `{allOf: [{multipleOf: 2}], anyOf: [{multipleOf: 3}],
oneOf: [{multipleOf: 5}]}` with an 8-case truth table — and it goes through the
door's push-in (`OneOfBase` conjoins the siblings into each branch), not through
this path. Refusing it would fail a named conformance group.

No official schema nests a `oneOf` inside an `anyOf` ARM, which is why the
refused shape costs no conformance.

## The approach that was tried first, and reverted

The original plan was to SUPPORT the shape: grow `RunType.OneOf` into groups,
count each group independently, and OR in the arms the groups do not cover. That
landed in `1213e66` and was reverted in `82b0180`.

It worked, but it needed the uncovered arms computed by differencing node ids,
and that difference over-reports the moment a branch is itself a union: the
checker may re-distribute an intersection while flattening, putting members in
the outer union that the branch node does not list. The door lowers
`allOf: [A, B, {oneOf: [C, D]}]` to `OneOf<[A∧B∧C, A∧B∧D]>`, two branches that
are unions of 69 members while the outer union holds 93 — three of the
difference were artifacts, and ORing them in accepted two values the exclusivity
rejects (caught by `unevaluatedProperties + ref inside allOf / oneOf`).

Guarding that corner left the model carrying groups, an uncovered-arms walk and
a heuristic with a documented blind spot, for a shape with no official coverage.
Refusing is a fraction of the machinery and has no blind spot.

## Tests

`packages/ts-runtypes-devtools/test/oneof-defect-diagnostics.test.ts` — one case
per refused shape (arm beside the group, `| null`, two groups), each asserting a
single OOF001 at Error severity with the right reason, plus a case pinning FOUR
shapes that must keep building: a plain `oneOf`, a nullish branch, a nested
`oneOf`, and the union-valued branch carrying a nullish member.

The convert fuzz generator keeps `randomUnionArm`, which draws `OneOf` in every
position EXCEPT a direct union arm — the refused one.

## Done when

- `createValidateFn<OneOf<[A,B]> | C>()` fails the build with OOF001. ✅
- `OneOf<[A,B]> | null` and two-groups-in-one-union do the same. ✅
- Every shape where the exclusive union IS the whole union still builds. ✅
- Sibling `anyOf` / `oneOf` is untouched and the official suite still passes. ✅

## Follow-up left open

The refusal is build-time only. A lane running with `failOnError: false` gets
today's behaviour rather than a throw, because `CodeOneOfDefect` is not
registered in `rootThrowWording` (`alwaysthrow_message.go`). Adding the runtime
backstop means registering it there and latching it as the leaf code. Left out
deliberately: the build error is the contract.
