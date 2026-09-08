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

## Plan — edit through own members, settle after every edit (approved 2026-09-08)

`flattenHeritage` in `packages/run-types/test/fuzz/core/typeGen.ts` is exported and
takes an optional `onDerived` hook that runs on each derived declaration just before
its flattened view is rebuilt, with the inherited members it is about to merge.
`inheritedProps` is exported alongside it. The hook has to ride that same forward pass:
a middle link in a chain would otherwise be repaired against a base view still stale.

`packages/run-types/test/fuzz/enrich/typeModify.ts`:

- `propOwners` hands back a `PropOwner` — `props` (the members the declaration itself
  spells, the only list an edit may touch), `taken` (every name in scope: its flattened
  view plus what anything extending it spells) and `pinned` (its narrowing overrides).
  `freshPropName` takes `taken`, so an add or a rename never collides with an inherited
  name or one a subclass already spells.
- Renaming an inherited member IS supported, and it happens on the base declaration.
  Derived declarations hold the same `PropShape` objects, so the new name shows up
  everywhere that extends it and the settle pass keeps the flattened view right.
- `allSlots` walks own members, so each declared member is reached once, through the
  declaration that renders it. It skips narrowing overrides, whose literal is dictated
  by the base member; `toggleOptional` skips them for the same reason. Overrides can
  still be renamed and deleted, both of which leave valid TypeScript.
- `renameRefs` became `renameTypeUses` and also rewrites `extends` clauses, which name
  a declaration in the rendered source but are not shapes.
- `settleHeritage` runs after every valid edit: `flattenHeritage` plus `repairOverrides`,
  which re-derives each override against the member it now narrows (keeping its literal
  when it still fits) and drops it when that member stopped being a plain primitive.
  Deterministic, so a repair never consumes an rng draw.

`heritage: false` → `heritage: true` in `MOD_GEN_OPTIONS`, comment replaced.

Tests: a new `packages/run-types/test/fuzz/enrich/typeModify.unit.test.ts` drives random
edit streams over heritage-on types and asserts after every edit that the flattened view
is exactly what the rendered source implies, that own members are the same objects
`props` holds, that no name is duplicated, that every `extends` target is declared, and
that every override still narrows its inherited member. The generator reaches an override
on about one draw in a thousand, far too thin to sample, so a hand-built base + override
fixture drives that path directly and asserts overrides get both repaired and dropped.
Plus the typemod fuzz lane itself, quick tier and soak.

No docs: this is test-harness internals with no user-visible surface.
