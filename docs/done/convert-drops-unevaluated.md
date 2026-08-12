---
type: fix
spec: guidelines
status: done
created: 2026-08-12
completed: 2026-08-12
---

# `convert` drops `unevaluatedProperties` silently

## Problem (as filed)

A hand-authored schema carrying `unevaluatedProperties` converted with no
diagnostic and no keyword in the output. The constraint was simply gone, and
the declaration's id moved with it:

    export const xRT = runTypeFromJsonSchema({
      type: 'object',
      properties: {a: {type: 'string'}},
      required: ['a'],
      unevaluatedProperties: false,
    } as const);
    export type X = InferType<typeof xRT>;

    $ ts-runtypes convert --to type src/main.ts
    export type X = {a: string};                 # the sweep is gone

    id: jtNbtbl → XzLpXDh   (same on --to builders)

Silent was the problem. A converted schema that quietly stops rejecting the
values it used to reject is worse than one that refuses to convert.

## How it was found

By the hand-authored keyword coverage added in
[tslabels-schema-to-type-conversion.md](tslabels-schema-to-type-conversion.md)
(`TestHandAuthored_EveryDialectKeyword` in
`ts-go-runtypes/internal/convert/handauthored_test.go`). The roundtrip fuzz
lane could not have found it: the converter never EMITS the keyword, so it
never fed one back in.

## Decision — refuse (option 2 of the filed plan)

The filed spec named two honest options: print the sweep (a `unevaluated:`
structural param on the value-first target, the standard keywords on the
schema target) or refuse it. **Refusal shipped.** The sweep's model is the
largest of the schema checks (`reflection.UnevaluatedCheck`: value / keys /
sources / prefix plus conditional groups whose guards hold nested RunTypes),
and printing it faithfully is real work with no user demand yet — while the
silent drop was actively harmful. Printing can still land later as a pure
widening (refusals only ever become conversions).

## Shipped

- `unevaluatedDiag` in `internal/convert/print.go`, called at the top of all
  three printer cores, so nested nodes, marker call sites and the
  `getRunType` / `embedType` escapes are covered alike (an escape could not
  carry it anyway: the sentinel is lifted OFF the type, and quoted type text
  cannot respell it). The refusal is CNV001 and names the keyword —
  `unevaluatedProperties` for object nodes, `unevaluatedItems` for
  array/tuple nodes.
- A sweep the door itself discards as a NO-OP (e.g. `unevaluatedItems` beside
  `items`, where every slot is evaluated) never reaches the graph and still
  converts — the guard fires only when the check actually carries.
- Pins: `TestUnevaluatedSweep_RefusesInsteadOfDropping`
  (`internal/convert/reviewfindings_test.go`, both keywords × type and
  builders targets, byte-identical source asserted), two rows in
  `packages/ts-runtypes/test/features/unsupported-conversion.test.ts` (the
  official refusal list the website links), the refusal row in the
  converting-forms guide, and the converted-suites refusal counts.

## Sibling finding, fixed in the same change

The same review found the TYPE target missing the oneOf-defect check the
other two printers gained in `848f00e`: `OneOf<[A, B]> | number` written
value-first printed `RT.OneOf<[A, B]>` on `--to type` — the `| number` arm
vanished without a word and the id moved. The type printer now reads the same
projection verdict (`partialOneOfDiag` at its union branch); pinned by
`TestPartialOneOf_RefusesOnTypeTarget` and a third exclusive-union row in
`unsupported-conversion.test.ts`.

## Done when — all met

- The schema above refuses on both value targets with a diagnostic naming
  the keyword. ✔
- `TestHandAuthored_EveryDialectKeyword` no longer skips the row: the
  refusal has its own dedicated pin, and the case comment points at it. ✔
- The refusal is listed in `unsupported-conversion.test.ts` and in the
  website's converting-forms table. ✔
