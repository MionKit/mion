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

### 2. `SubstituteSelf` rebuilt any class whose members loop

Surfaced by dropping the fuzz lane's reroll filter, which is what this todo
asked for. Inside a `circular(…)` body the substitution asks "does this subtree
contain a `self()` marker?" before deciding whether to rebuild it. It answered
YES for a typed array — the self-returning `subarray()` sends the member walk in
a circle, the walk hits its depth cap, and the cap answered "assume it
recurses". The node was then rebuilt into a plain object, so
`interface A {m: DataView; kids: A[]}` and the
`circular(object({m: …, kids: array(self())}))` that converts from it stopped
agreeing.

The first cut added the binary builtins to `BuiltinClassLeaf`, the same list
Temporal joined earlier (`docs/done/circular-brand-substitution.md`). Review
pushed back on the list as a mechanism, and measuring proved the objection
right: the walk also answered YES for a plain
`class Fluent { clone(): Fluent }`, for `Generator` / `Iterator`, for the weak
collections, and for any plain object nested past 12 levels. A list was never
going to cover that.

The literal inversion review asked for — process only what we explicitly handle
— is not expressible: by the time this walk runs, `DataView` and an object
`RT.object()` built are the same thing to TypeScript, and there is no
`isClass<T>` predicate. But the useful distinction is not class-vs-object, it
is **finite-vs-cyclic**: a schema body is a finite tree and always bottoms out;
a class's member graph loops and never does. That IS observable, and it needs no
list.

Three changes express it, and the list was deleted:

- `any` answers "no Self" (it used to match `Self` and answer yes — this is what
  caught `Generator` / `Iterator`);
- the depth cap answers "no Self" instead of "assume Self";
- the cap went 12 → 24, measured free on the budget corpus.

`Date | RegExp` stay named, purely as a fast path for the two builtins schemas
carry most. Keeping the full list as a fast path measured WORSE (+13..+42 vs
+10..+32) — the union costs more to test than it saves.

## What shipped

- `ts-go-runtypes/internal/cachegen/runtype/typeid/typeid.go` — non-serialisable
  globals key on constructor name + type arguments.
- `packages/ts-runtypes/src/builders/static.ts` — the builtin-class leaf list is
  GONE (`BuiltinClassLeaf` / `TemporalClassLeaf` / `BinaryClassLeaf` deleted);
  `ContainsSelfIn` decides by the terminates-or-opaque rule instead.
- `packages/ts-runtypes/test/fuzz/convert/convertRoundtrip.ts` — `typedarray`
  and `dataview` dropped from `isConvertibleShape`; symbol-keyed members are now
  the only shape the lane rerolls.
- Tests: four in
  `ts-go-runtypes/internal/cachegen/runtype/typeid/structural_test.go` (both
  `getRunTypeId` call shapes, with the hash-equivalence pin on the reflection
  form), two in `ts-go-runtypes/internal/convert/circular_test.go` (the binary
  natives through the full chain, plus the negative control that `self()` still
  substitutes through Map / Set / array), and the two-direction walk battery in
  `packages/ts-runtypes/test/types/substituteSelf.compile.test.ts` — 18 types
  that must be left alone (Fluent, Generator, Iterator, the weak collections,
  every binary native, a deep plain object, `any`) and 10 real `self()`
  placements that must still be found, including one nested 13 deep.
- `packages/ts-runtypes/test/types/structural.test.ts` — the list-exhaustiveness
  assertions are gone with the list; a rule cannot be enumerated.
- `packages/ts-runtypes/test/types/substituteSelf.compile.test.ts` — a second
  documented REVIEWED EXCEPTION, +10..+32 net instantiations per branch (1-4%).

## Deliberately left

Nothing in this family. The weak collections were going to be filed as a
separate defect while the list was the mechanism (they could not join it — a
real `Map` / `Set` is structurally assignable to them, so a leaf arm tested
before the Map / Set arms would swallow `map(string(), self())`). The rule fixes
them for free, and the battery pins them, so there is no follow-up.

The one residual risk is the depth cap, and it is the REVERSE of the old one: a
`self()` nested deeper than 24 would be left alone rather than substituted,
leaking the brand. Exact cycle detection (carry the types seen on the current
path) would remove the cap entirely; it was not attempted, because TypeScript's
cheap membership test is assignability rather than identity, so a false match
would leave a real marker unsubstituted — silently, which is the failure mode
this whole change exists to avoid.

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
