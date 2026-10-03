---
type: fix
spec: guidelines
status: ready
created: 2026-10-02
---

# Decide how runtypes treat TypeScript private fields

## Intent

A TypeScript `private x: T` field is validated like a public one in source: `memberIDs` in
`ts-go-runtypes/internal/cachegen/runtype/typeid/typeid.go` walks it like any member. A `.d.ts` writes
`private x;` with no type, so the same class read from a published package gets `any` for that field: a
different type id and a validator that accepts anything for it, with no diagnostic. ES `#private` fields are
fine, both sides fold them into `#pf`.

## Direction

Investigate the options and pick one rule, then implement it:

- leave TypeScript `private` (and maybe `protected`) fields out of runtypes, in source and in `.d.ts` alike;
- a build warning for an optional private field and an error for a required one, when the class is read
  typeless from a `.d.ts`;
- another rule the investigation finds better.

Pointers: `memberIDs` in `typeid.go` (~591-615), the twin skip at `cachegen/runtype/serialize.go:1104`,
visibility in `cachegen/runtype/modifiers.go:57-63`, and the silent-any walk at
`compiler/resolver/silent_any_walk.go:120`, which today lets this implicit `any` through. The implementer plans
the details.

## Docs

`container/website/content/02.runtypes/02.guide/04.json-round-trip.md`, existing section Classes.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

A class with private fields gets one documented behaviour whether it is read from source or from a `.d.ts`,
pinned by paired tests for both `getRunTypeId` call shapes. The simplify-docs pass ran on every touched page and
the simplify-comments pass on every touched source file, each committed on its own.

## Plan (approved 2026-10-03)

Rule: the TypeScript `private` / `protected` modifier never changes the type id or the checks; the fields are
validated like public ones. Only the type that a `.d.ts` erases is the problem, solved at both ends:

- `mion compile` turns each class member's `private` into `protected` in the declaration-emit overlay
  (`batchcompile`), so the emitted `.d.ts` keeps the type and the imports it uses. Constructors, private
  parameter properties and `#name` fields are untouched; the JS emit is untouched. The declaration map is
  mapped back to the original source columns for every overlay splice.
- A class read from a `.d.ts` with a typeless `private` member (`private b;`, what plain `tsc` writes) fails
  the build with the new MKR016 (`LevelRuntimeError`, like the other silent-any codes). No fallback.

Tests: visibility parity (public / private / protected, source and `.d.ts`) for both `getRunTypeId` shapes;
MKR016 fires / stays quiet cases with the corpus grid; `mion compile` declaration output and a
compile-then-consume round trip; JS validation of TS private fields.
Docs: one short addition to the Classes section of the JSON round-trip page.
