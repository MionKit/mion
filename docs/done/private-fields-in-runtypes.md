---
type: fix
spec: guidelines
status: done
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

## Plan (approved 2026-10-03), as shipped

Rule: the TypeScript `private` / `protected` modifier never changes the type id or the checks; the fields are
validated and serialized like public ones. Dropping them (as `keyof` and `DataOnly<T>` do) was weighed and
rejected: a registered class decoded to a real instance needs its private state. Only the type that a `.d.ts`
erases is the problem, solved at both ends.

Producer side, `mion compile` (`batchcompile/declarations.go`):

- Before the declaration emit, every class member's `private` is turned `protected` in the overlay (fields,
  methods, accessors and constructor parameter properties; a `private constructor` and `#name` fields are
  untouched; the JS emit is untouched), so the `.d.ts` keeps the type and the imports it uses. There is no guard:
  whatever TypeScript then says about the `protected` member is the package author's to fix.
- `isolatedDeclarations` exempts a private member from a written type but not a protected one, so when it is on
  the source as written is checked for it (the user's own errors still fail), and the spliced emit runs with it off.
- The declaration map, and the position of any declaration error, are mapped back to the source as written for
  every overlay splice, which also fixes the drift the build-version splices caused.

Consumer side, the resolver:

- A class read from ambient code (a `.d.ts` or a `declare class`) with a typeless `private` field, method or
  accessor (`private b;`, what plain tsc writes) fails the build with the new MKR016 (`LevelRuntimeError`,
  like the other silent-any codes). Reading the package from its TypeScript sources never raises it.
- Such a member reads as an optional `any` in the id and in every generated function, whether MKR016 halts or
  is turned off: tsc writes a private method the same way as a field, and a plain JSON object never carries a
  method. So turning MKR016 off (`@mion-downgrade-error`, `downgradeErrors`) is a safe way out for a class from a
  package the consumer does not build.
- The silent-any walk no longer collapses repeated `any` members: every silent-any code (MKR013, MKR007,
  TMP001, MKR016) now fires once per member. Before, every `any` shared one type, so a hand-written `any`
  member hid every later typeless private member.

Why an error and not a warning for an optional member and an error for a required one: the whole member is
unknown, field or method, so optional / required says nothing about it; and a typed `.d.ts` is one
`mion compile` away for a package the team owns. For a third-party package the consumer turns MKR016 off and
gets the optional `any` above. The closest precedent, MET013 (a plain-tsc `.d.ts` without a build version), is a
warning because the runtime version check still catches a mismatch; nothing catches an unchecked private field.

Accepted costs of the `protected` rewrite:

- A consumer's subclass can read, call and redeclare a former private member (TS2341 / TS2415 against the plain
  `.d.ts`). Those members become part of the package's subclass surface.
- A type a private member uses now ships in the `.d.ts` with its import, a devDependency's included, so the
  package's users need it installed.
- A type tsc never had to name (one only reachable through another package's own `node_modules`) now fails
  `mion compile` with TypeScript's own error at the member (TS2883), until the author writes the type.
- Each declaration build with a `private` member builds one more program to emit from.

Tests: visibility parity (public / private / protected, source and `.d.ts`) for both `getRunTypeId` shapes;
MKR016 fires (fields, methods, getters, setters, optional, one object deeper, after a written `any`) and stays
quiet (typed, protected, `#name`, a `private constructor`, a source class), plus the catalog examples at root and
one level deep, all paired; turned off it reads as an optional `any` (Go and JS); `mion compile` declaration
output, both declaration-map cases, both splice sources in one file, a devDependency type kept with its import,
an unnameable type failing at its source column, `isolatedDeclarations` both ways, and a compile-then-consume
round trip. MKR016 has no row
in the nested-diagnostic corpus grid: that grid covers non-data shapes and their throws and drops, and no
silent-any code has a row there.
Docs: the Classes section of the JSON round-trip page and the published API types section of the CLI page.
