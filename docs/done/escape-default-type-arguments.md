---
type: fix
spec: guidelines
status: done
created: 2026-08-09
---

# A typed array's id moved across a conversion (two causes, both fixed)

## Problem as filed

`getRunType<T>()` / `embedType<T>()` render their type text from the resolved
checker type, which spells type arguments even when they are the declaration's
own defaults:

    export type A = Int32Array;

    $ ts-runtypes convert --to builders src/main.ts
    export const aRT = getRunType<Int32Array<ArrayBuffer | SharedArrayBuffer>>();

and the declaration then resolved a different structural id after conversion.
The filed diagnosis blamed the printed type arguments.

## What it actually was

**The printed type arguments were innocent.** Probing the four spellings against
the id oracle showed them all agreeing:

    Int32Array                                  → OIg6EaQ
    Int32Array<ArrayBufferLike>                 → OIg6EaQ
    Int32Array<ArrayBuffer | SharedArrayBuffer> → OIg6EaQ

What moved the id was reaching the type a different WAY. `typeof someValue`,
an indexed access, and the `InferType<typeof aRT>` the escape lands in all gave
`LhbHHF5` where the direct spelling gave `GO2gGie`. So printing the bare name
would not have fixed anything.

Two independent defects were behind it, both now fixed.

### 1. The non-serialisable id was built from the lib member surface

`typeid.go`'s non-serialisable branch hashed `memberIDs(tsType, true)` — 26 KB
of id string for a single `Uint8Array`. A typed array's `subarray()` returns its
own type, so whether the walk got the SAME checker type pointer back (emit a
cycle token) or a fresh instantiation (unroll one more level) decided the id,
and which one you got depended on how the type was spelled.

The projection side had already refused to walk those members, and its comment
says exactly why: builtins "project ATOMICALLY — subKind + classRef… Expanding
the lib interface would intern dozens of method/parameter nodes per builtin…
dead weight with an unstable structural id." The id computer had simply never
been brought into lockstep.

Fixed by keying a non-serialisable global on its CONSTRUCTOR NAME plus its type
arguments — `2004{<arg ids>}#Uint8Array` — the same `#name` convention the class
branch below it already uses. It is also strictly MORE discriminating than the
member walk was: `Error` and `EvalError` are structurally identical interfaces,
so they used to share one cache entry.

### 2. `SubstituteSelf` walked binary builtins instead of treating them as leaves

Surfaced by dropping the fuzz lane's reroll filter, which is what this todo
asked for. Inside a `circular(…)` body the substitution walked a typed array,
the self-returning `subarray()` made the member walk circular, TypeScript
resolved the property to `any`, and the node was rebuilt into a plain object —
so `interface A {m: DataView; kids: A[]}` and the
`circular(object({m: …, kids: array(self())}))` that converts from it stopped
agreeing.

This is the SAME failure the Temporal types hit earlier
(`docs/done/circular-brand-substitution.md`); the leaf list just never grew to
cover the binary family. Fixed by adding `ArrayBuffer | SharedArrayBuffer |
ArrayBufferView` to `BuiltinClassLeaf` — three arms covering all twelve, the
same collapse `DataOnlyStripped` uses.

## What shipped

- `ts-go-runtypes/internal/cachegen/runtype/typeid/typeid.go` — non-serialisable
  globals key on constructor name + type arguments.
- `packages/ts-runtypes/src/builders/static.ts` — `BuiltinClassLeaf` splits into
  `TemporalClassLeaf | BinaryClassLeaf`.
- `packages/ts-runtypes/test/fuzz/convert/convertRoundtrip.ts` — `typedarray`
  and `dataview` dropped from `isConvertibleShape`; symbol-keyed members are now
  the only shape the lane rerolls.
- Tests: four in
  `ts-go-runtypes/internal/cachegen/runtype/typeid/structural_test.go` (both
  `getRunTypeId` call shapes, with the hash-equivalence pin on the reflection
  form), two in `ts-go-runtypes/internal/convert/circular_test.go` (the binary
  natives through the full chain, plus the negative control that `self()` still
  substitutes through Map / Set / array).
- `packages/ts-runtypes/test/types/substituteSelf.compile.test.ts` — a second
  documented REVIEWED EXCEPTION, 3–12 net instantiations per branch (under 1%).

## Deliberately left

`WeakMap` / `WeakSet` break the same way but cannot join the leaf list as-is: a
real `Map` / `Set` is structurally assignable to them, so a leaf arm tested
before the Map / Set arms would swallow `map(string(), self())` and leak the
`Self` brand. Filed as
[weak-collections-flatten-in-recursive-schemas.md](../todos/weak-collections-flatten-in-recursive-schemas.md)
with the ordering fix written out.

Also noted, not fixed: `IsNonSerializableSymbol` matches by NAME, so a
user-declared `class Error` collides with the global. That predates this change
— the projection already stamps such a type `SubKindNonSerializable` with
`ClassRef.Builtin: "Error"`, so the behaviour was already shared; only the id
used to differ. Making the id match the projection is the honest state.

## Done when (met)

`type A = Int32Array` converts and the id holds; the id holds under every
spelling in both the vitest and resolver environments; and
`packages/ts-runtypes/test/fuzz/convert/convertRoundtrip.ts` no longer excludes
`typedarray` / `dataview`, with the lane green across the seed list.
