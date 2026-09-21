---
type: docs
spec: guidelines
status: done
created: 2026-09-21
---

# The recursive schema builders have no page on the website

## Intent

`RT.circular` and `RT.self` are public builders, exported from
[packages/run-types/src/builders/compose.ts](../../packages/run-types/src/builders/compose.ts),
and they are the only way to write a recursive shape value-first. The website never
introduces them.

The one mention on the whole site is a clause on the source-conversion page, which tells
you what the converter EMITS:

> In builder form, labeled tuples and named function parameters use `RT.slot`, an index
> signature beside named properties becomes an intersection, and recursive shapes come out
> as `RT.circular` with `RT.self()`.

So a reader meets `RT.circular` as converter output, with no page saying what it is, how to
call it, or what it costs. The builders page
([container/website/content/02.runtypes/02.guide/01.type-builders.md](../../container/website/content/02.runtypes/02.guide/01.type-builders.md))
covers tuples, slots, shared fields and option presets, and stops there.

## What to settle

- Where a recursive-schema section belongs: a section on the builders page, or its own
  page. Use the *Where a change goes* table in
  [container/website/CLAUDE.md](../../container/website/CLAUDE.md).
- Whether the type-first spelling (a plain recursive `type`) should be shown beside the
  builder one, since both reach the same schema.

## Evidence to produce

- A page or section that shows a recursive schema written with `RT.circular` and
  `RT.self`, with a compiling `<code-import>` example under
  [packages/examples/src/](../../packages/examples/src/) rather than a hand-written fence.
- The limits a reader hits, in plain words and without internals:
  - `self()` has to sit within 24 levels of nesting inside the body. Past that the
    inferred type keeps the placeholder instead of the recursive type. The cap is pinned
    by the depth-cap battery in
    [packages/run-types/test/types/substituteSelf.compile.test.ts](../../packages/run-types/test/types/substituteSelf.compile.test.ts).
  - A recursion that loops back through a tuple slot has no value spelling, which the
    source-conversion page already states from the converter's side.
  - Deeply nested input on a recursive type throws `RangeError` at validate time, which
    the decoding page already covers.
- The `website` label on the PR, so the docs lane runs.

## Watch out

- Do not document the depth cap as a mechanism. The reader needs the number and what
  happens past it, not the walk that enforces it.
- Keep the examples compiling: the root `typecheck` script builds
  [packages/examples/](../../packages/examples/), so a drifted example fails CI.

## Origin

Found while settling the `Self` substitution depth cap. Looking for the page that should
carry the cap's user-facing limit turned up no page at all.

## Plan — a section on the builders page (approved 2026-09-21)

**Where it goes.** A new `## Recursive Shapes` section on
[container/website/content/02.runtypes/02.guide/01.type-builders.md](../../container/website/content/02.runtypes/02.guide/01.type-builders.md),
placed after *Labeled Tuples and Named Parameters*. The *Where a change goes* table calls
this "a new job a reader would look for in the table of contents" — its own section, own
title. Not its own page: one paragraph, one example, one table and one tip is nowhere near
the three sections a page needs.

**The type-first spelling is shown beside the builder one**, inside the same example. The
page's whole premise is "same shape, two spellings", and the pair also shows that both
reach the same cached validator.

**The example** is
[packages/examples/src/guide/type-builders-recursive.ts](../../packages/examples/src/guide/type-builders-recursive.ts),
a comment with replies: `RT.circular` wrapping `RT.object`, the loop back written with
`RT.array(RT.self())`, `InferType` recovering the recursive type, and the hand-written
`type` twin beside it.

**The limits ride a three-row table**, in plain words and with no mechanism:

- `RT.self()` nested more than 24 levels deep inside the body leaves the placeholder in the
  inferred type.
- A loop that points back straight from a tuple slot (`[number, Pair]`) has no builder
  spelling; put the loop behind an object, array, Map, Set or function slot, or write the
  shape as a type. (A loop that merely RUNS THROUGH a tuple slot and closes on an object
  member does convert, so the row names the closing slot, not any tuple.)
- A value nested deeper than the call stack makes validation throw `RangeError`, linked to
  the decoding page that already covers it.

A `::tip` covers mutual recursion: each type writes its own loop back with `RT.self()` and
names the other by its const.

**Tests.** No new code test — this is a `docs` todo and nothing in `packages/` changed.
The example is covered by the root `typecheck`, and the new link by the `website-links`
suite.
