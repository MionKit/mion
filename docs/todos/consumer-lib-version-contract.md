---
type: fix
spec: guidelines
status: ready
created: 2026-08-30
---

# What a consumer's TypeScript lib version does to what we compile

## Intent

The resolver adopts the consumer's tsconfig wholesale, on purpose: it and their own `tsc`
must agree about every type. The consequence is that the standard library shipping with
their TypeScript, and the `lib` they select, decides what shape the resolver actually sees.
We do not record that, check it, or test against most of it.

The ESNext Buffer fix (docs/done/esnext-buffer-reflection-mkr009.md) was one symptom, and
fixing it produced two more, which is what makes this worth investigating rather than
patching again:

- A fix for one type did not cover the next one. `Buffer` was fixed; `PromiseLike` was
  still broken by the same mechanism and was found only by accident.
- Recognising a family by what it inherits fixed binary types and silently broke iterable
  ones, stripping the data fields off any user type that extends `Iterator`. Caught in
  review, not by design.

The concern under all of it: **we write functionality against a particular type shape, and
a consumer on a different lib hands us a different shape.** When that difference makes the
build stop, we find out. When it does not, we compile something that quietly does not
match what the code was written against, and nobody knows what the difference was.

## What is already verified

Do not re-derive these; they were checked while filing this.

- **Nothing validates or records the consumer's lib.** `program.NewInferred`
  (ts-go-runtypes/internal/compiler/program/program.go) adopts the parsed `CompilerOptions`
  wholesale, with a no-config fallback literal. No lib is inspected, stored, or compared.
- **The same source type can compile to a different structural id per lib.** Reflecting
  `{id: number; name: string; at: Date; tags: string[]; seen: Set<string>}` gives one id on
  es2015 through esnext and a different one on es5. Before the Buffer fix, a `Buffer` field
  gave three different ids across es2020, es2022 and es2023.
- **A missing type fails loudly; a differently-shaped one does not.** On es5 the `Set`
  above raises MKR013 (an error, so the build stops). A type that still resolves but with a
  different member surface produces no diagnostic at all.
- **The only guard today is a test, not a contract.** `TestLibMatrix_ReflectionSurvivesEveryLib`
  reflects a handful of shapes under es2020 through esnext. It catches a build-stopping
  regression on those libs and nothing about older libs, `dom`, `lib: []`, or a shape that
  compiles differently without erroring.

## Direction

The implementer investigates and plans; this records what to find out and the options
already on the table.

**Establish the blast radius first, before choosing any fix.** The open question is not
"which types break" but "what can differ at all, and which differences are silent". Worth
answering:

- Which libs can a consumer realistically select (including `lib: []`, `dom` without an ES
  lib, and a `target` with no explicit `lib`), and what does each do to a representative
  model? An extension of the existing matrix test is the cheap instrument.
- Which differences stop the build, and which compile to something different in silence?
  The silent set is the actual problem; the loud set is already tolerable.
- Does the consumer's TypeScript *version* matter separately from their `lib` setting? The
  resolver embeds its own tsgo, so a consumer on a different TypeScript may typecheck
  against one standard library while we reflect against another. Whether that is possible,
  and what it would do, is unknown.
- Is the structural id supposed to be lib-independent? Two consumers on different libs
  sharing one cached type is either correct or a bug, and the answer decides much of the
  rest.

**Options on the table.** These came up while discussing it; the investigation should
weigh them rather than assume one:

1. **Pin the supported lib and hard-fail outside it.** The strongest guarantee: if the
   tsconfig does not select a lib the resolver was built against, the program stops with a
   clear message rather than compiling something we cannot reason about. The objection to
   weigh is that it forces a consumer to change their tsconfig to use the library at all,
   and ESNext keeps moving. Note the standing constraint below.
2. **Support every existing lib and prove it.** Extend the matrix to every lib TypeScript
   ships and treat a new edition as a required update. Weaker guarantee, no consumer
   friction, and the maintenance lands on us on TypeScript's schedule.
3. **Record the lib and refuse to share a cache entry across libs.** Does not prevent the
   difference, but stops one consumer's compiled shape standing in for another's.
4. Something narrower that falls out of the blast-radius work.

**Standing constraint for now:** support all existing TypeScript libraries. Hard-failing
on a lib mismatch is a real candidate but is a product decision that has not been taken,
so this todo does not authorise it. If the investigation makes the case, put it to the
owner before building it.

**Not in scope:** the two items left open by the ESNext Buffer fix (the iterator
disagreement between the Go set and `DataOnly<T>`, and type-only names reaching
`classType = globalThis.<name>`). They are recorded in
docs/done/esnext-buffer-reflection-mkr009.md and are their own work.

## Done when

There is a written answer to what a differing lib can change, separating the differences
that stop the build from the ones that pass silently, backed by something reproducible
rather than argument. The options above are assessed against that evidence with a
recommendation, and either the recommendation is small enough to ship in the same pass, or
it is put to the owner as a decision with the cost of each option stated.
