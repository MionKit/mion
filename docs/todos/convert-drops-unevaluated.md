---
type: fix
spec: guidelines
status: ready
created: 2026-08-12
---

# `convert` drops `unevaluatedProperties` silently

## Problem

A hand-authored schema carrying `unevaluatedProperties` converts with no
diagnostic and no keyword in the output. The constraint is simply gone, and the
declaration's id moves with it:

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

Silent is the problem. A converted schema that quietly stops rejecting the
values it used to reject is worse than one that refuses to convert.

## How it was found

By the hand-authored keyword coverage added in
[docs/done/tslabels-schema-to-type-conversion.md](../done/tslabels-schema-to-type-conversion.md)
(`TestHandAuthored_EveryDialectKeyword` in
`ts-go-runtypes/internal/convert/handauthored_test.go`, where the row is
currently skipped pointing here). The roundtrip fuzz lane could not have found
it: the converter never EMITS the keyword, so it never fed one back in.

## Why the printer has nothing to print

`internal/convert/print.go` handles `node.Contains`, `node.PatternProps` and
`node.PropNames` in the structural-params block, and has no branch for
`node.Unevaluated` at all — no printer, and no refusal either.

The model it would have to print is the largest of the four
(`reflection.UnevaluatedCheck` in `internal/reflection/runtype.go`, mirrored by
`UnevaluatedSpec` in `packages/ts-runtypes/src/formats/structural.ts`):

- `value` — what an unevaluated member must satisfy, absent for the `false`
  reading;
- `keys` / `sources` / `prefix` — evaluated unconditionally;
- `groups` — conditional contributions, each with exactly one guard (`when`,
  `whenNot`, `whenKey`) plus its own keys / sources / prefix / `all`. The
  guards hold nested RunTypes, so printing one means recursing into the
  printer.

## Fix directions to evaluate

Two honest options, and the choice is the actual decision to make:

1. **Print it.** A `unevaluated` entry becomes the `unevaluated:` structural
   param on the value-first target and `unevaluatedProperties` /
   `unevaluatedItems` on the schema target. The guard subschemas recurse
   through the same printer the other params use. Most faithful, most work,
   and the conditional groups are where it gets hard.
2. **Refuse it.** A CNV001 row saying an `unevaluated*` sweep is not
   convertible yet, added to
   `packages/ts-runtypes/test/features/unsupported-conversion.test.ts` and the
   table in `container/website/content/02.guide/11.converting-forms.md`. Small,
   honest, and turns a silent loss into a loud one — the same trade the
   symbol-keyed-member guard already made.

Option 2 is worth shipping on its own even if option 1 follows, because the
silent drop is the actual harm.

## Done when

- The schema above either converts with the sweep intact on both targets, or
  refuses with a diagnostic naming the keyword.
- `TestHandAuthored_EveryDialectKeyword`'s `unevaluatedProperties` row is
  un-skipped (asserting whichever outcome shipped).
- If it refuses, the refusal is listed in `unsupported-conversion.test.ts` and
  in the website's converting-forms table.
