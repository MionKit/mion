---
type: fix
spec: guidelines
status: ready
created: 2026-09-06
---

# The type-modification fuzzer edits members through the wrong declaration

## Problem

The random type generator now emits heritage: `declare class B extends A` and
`interface D extends B, C`, including a narrowing property override. Every fuzz
lane took it except one.

`packages/run-types/test/fuzz/enrich/typeModFuzzRunner.ts` sets
`heritage: false` in its own `MOD_GEN_OPTIONS`, and it is the only lane that
does. The reason is in `packages/run-types/test/fuzz/enrich/typeModify.ts`:

- `propOwners` collects `{props}` holders and the lane RENAMES, ADDS and
  DELETES members in those arrays in place.
- `allSlots` walks `decl.props` and rewrites shapes in place.

On a derived declaration those two lists are not the same thing. `props` is the
FLATTENED member list (inherited, then own, an override replacing the base's
entry) because that mirrors what the resolver hands the emitters. `ownProps` is
the subset the declaration itself spells, and it is what `renderDecl` prints.

So an edit that lands on an inherited member changes the model but not the
source. The next reconcile then disagrees with the fixture and the nothing-lost
oracle fires on the harness rather than on a real bug.

## What to do

Teach `typeModify` to edit a declaration through the members it actually
declares:

- `propOwners` should hand back `decl.ownProps ?? decl.props` for a
  declaration, so a rename or a delete only ever touches a member this
  declaration spells.
- An ADD on a derived declaration has to avoid the inherited names, or
  TypeScript rejects the redeclaration.
- After any edit, the flattened view has to be rebuilt. `flattenHeritage` in
  `packages/run-types/test/fuzz/core/typeGen.ts` already does exactly this in
  one forward pass and is the function to reuse rather than reimplement.
- A rename of an INHERITED member is a legitimate edit too, but it belongs on
  the base declaration and must propagate to everything that extends it. Either
  support it that way or leave it out and say so.

Then flip `heritage: false` to `heritage: true` in `MOD_GEN_OPTIONS` and drop
the comment that explains why it was off.

## Done when

- The type-modification lane runs with heritage on and is green over a soak,
  not just a quick batch.
- A derived declaration in that lane can be renamed, extended and trimmed
  without the rendered source and the model drifting apart.
- No lane is left with a `heritage: false` override.

## Out of scope

Classes themselves. Every lane including this one already generates them; only
the heritage clause is held back here.
