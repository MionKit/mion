---
type: fix
spec: guidelines
status: ready
created: 2026-08-30
---

# The FormatFloat benchmark case labels legal values as invalid

## Intent

The benchmark lane reports a permanent correctness failure that is not a RunTypes bug. The
BENCHMARK CASE is wrong, and while it stands it publishes a fake divergence against
ts-runtypes on the Correctness page, and rewards any competitor that models `Float` as
"rejects integers" for being wrong.

Reproduced with `pnpm rtx bench bench-one ts-runtypes`:

```
✗ 2 fail/errored metric-case(s) across competitors:
  ts-runtypes / NUMBER_FORMAT.number_float [validate]: fail — invalid[0] accepted
  ts-runtypes / NUMBER_FORMAT.number_float [validationErrors]: fail — invalid[0] accepted
```

`invalid[0]` is `1`. RunTypes accepts it, and accepting it is CORRECT. `float` is
documented as a generation and presentation tag, never a constraint that can fail
(`packages/ts-runtypes/src/formats/numberFormats.ts:22`):

```ts
  /** Generation/presentation tag, NEVER a failable constraint (a float
   *  legally holds whole values like 2.0): steers mock generation toward
   *  fractional samples and keeps binary packing on the float64 arm.
   *  Mutually exclusive with `integer`. */
  float?: boolean;
```

and again on the builder (`numberFormats.ts:97`):

```ts
/** Float-natured number (`Float`): fractional mocks, float64 packing; whole values still validate. **/
export const float = presetBuilder<Float>('number');
```

The case contradicts both (`container/benchmarks/shared/cases/format-validation/NumberFormat.ts:38`):

```ts
  number_float: {
    title: 'FormatFloat — non-integer only',
    getSamples: () => ({valid: [1.5, -0.5, 3.14], invalid: [1, 0, -2]}),
    expectedFormatErrors: () => [
      {name: 'numberFormat', val: true, formatPathTail: 'float'},
      ...
```

Three declared `expectedFormatErrors` that no correct implementation can ever produce.

## Direction

Verify the contract first, then decide which side is wrong. The documented behaviour above
is clear and this todo assumes the case is at fault, but the implementer should confirm
that nothing else in the repo (Go emitter, the format docs on the website) treats `float`
as failable before changing the samples.

Assuming the case is at fault, roughly: retitle it to what `Float` actually is, move
`[1, 0, -2]` into `valid`, and give the case a real invalid set (non-numbers, and whatever
else `Number` genuinely rejects). `expectedFormatErrors` has to line up with the new
invalid list. Then check whether the other four competitors' `number_float` entries encode
the same wrong assumption and fix them alongside, or the divergence just moves.

The implementer plans the details.

**Test it the way a mislabelled sample actually gets caught.** No unit test fails today,
which is why this shipped: a wrong label is invisible to the suite and only shows up as a
cross-library divergence. So the fix needs something that pins the intent, not just a
changed literal. Consider a check that a format tagged non-failable declares no
`expectedFormatErrors`, which would catch this whole class rather than this one case.

Worth a look while in here: are there other presentation-only format tags whose benchmark
cases assert failures? `money` is flagged "PURE PRESENTATION METADATA" in the same file.

## Done when

- `pnpm rtx bench bench-one ts-runtypes` reports zero fail/errored metric-cases for
  `NUMBER_FORMAT.number_float`, and the lane's exit status and coverage table are clean on
  that case.
- The case's title and samples match the documented `Float` contract.
- Something in the test suite would now catch a presentation-only format being asserted as
  failable, so the class does not come back.
- `pnpm test`, `pnpm run lint`, `pnpm run format` clean.

## Context

Found while implementing `docs/done/bench-duplicate-columns-and-strict-section.md` on
branch `claude/runtypes-benchmark-docs-si7uca`, running the benchmark lane to verify that
work. Unrelated to it: that change touched the results reader and the strict suite, never
format validation.

Same class of problem as something that change had to guard against by hand: a wrongly
labelled benchmark sample fails no test, it only surfaces later as a cross-library
divergence. That is why the strict `realworld_order` case added there had its labelling
checked against an independent implementation before landing.

## Plan — what shipped (2026-08-30)

**The case was the wrong side, confirmed on three independent sources** before any sample
was touched:

- The Go emitter agrees the tag never fails
  (`ts-go-runtypes/internal/cachegen/typefunctions/formats/numeric/numberformat.go:52`,
  `:90`): "The `float` tag deliberately emits nothing (annotation-only, whole values are
  legal floats)" and "`float` never produces an error (annotation-only)". It only routes
  binary packing to the float64 arm and rejects the contradictory `integer` + `float`
  pair.
- The repo's OWN format-validation suite already models it correctly
  (`packages/ts-runtypes/test/suites/format-validation/NumberFormat.ts:235`):
  `valid: [1.5, -0.5, 3.14, 1, 0, -2]`, `invalid: []`, `expectedFormatErrors: () => []`.
- The website says the same and needed no edit
  (`container/website/sites/mion/content/03.drizzle-orm/01.column-formats.md:77`): "Float
  columns use the Float format: whole values like 2.0 still validate". Nothing on either
  site claims `Float` rejects integers.

### The shared case

`container/benchmarks/shared/cases/format-validation/NumberFormat.ts` — retitled to
"FormatFloat — float-tagged number (whole values legal)", the three whole numbers moved
into `valid`, and a real invalid set of non-numbers (`'1.5'`, `null`, `true`) put in their
place, so the reject path still measures something. `expectedFormatErrors` became three
`null`s (the sibling `number_max` case already uses `null` for a root type mismatch).

An empty invalid list was rejected as the alternative: the runner times the reject and
mixed streams, and the website's Correctness page prints both sample arrays.

### The competitor maps

All four non-RunTypes columns encoded the same wrong assumption and were fixed alongside,
or the divergence would just have moved:

| Competitor | Before | After |
| --- | --- | --- |
| zod | `z.number().refine((n) => !Number.isInteger(n))` | `z.number()` |
| ajv | `{type: 'number', not: {type: 'integer'}}` | `{type: 'number'}` |
| typia | `NOT_SUPPORTED` ("our FormatFloat means non-integer") | `number` |
| typebox | `NOT_SUPPORTED` ("no non-integer constraint") | `Type.Number()` |

The two `NOT_SUPPORTED` entries were unsupported ONLY because of the wrong assumption, so
both became real entries and the case gained two columns. `tags.Type<'float'>` was
rejected for typia: it adds a float32 representability check RunTypes never imposes.
`ts-runtypes/cases.ts` and `schemaCases.ts` were already correct (`TF.Float`) and are
unchanged.

### The test that pins the class

`packages/ts-runtypes-devtools/test/bench-lane-contracts.test.ts` gained
"the shared cases never assert a presentation-only format tag as failable". It DERIVES the
non-failable tag set from the format sources (every param whose JSDoc says "NEVER a
failable constraint" or "PURE PRESENTATION METADATA" — today `float` and `isCurrency`)
rather than hardcoding it, so a presentation-only param added later is covered the day it
lands. One test asserts the derivation still finds both tags, so it cannot go quietly
empty; the other walks `shared/cases/**` and fails naming the file and tag.

Verified it fails on the original bug before being accepted:

```
FAIL  test/bench-lane-contracts.test.ts > declares no expectedFormatErrors on any of them
+   "container/benchmarks/shared/cases/format-validation/NumberFormat.ts: float",
```

The `packages/` suites need no such guard: their cases are executed, so a wrong assertion
there already fails a real test. Only the benchmark copy was data nothing checked.

### The `money` question

`isCurrency` is flagged "PURE PRESENTATION METADATA" in the same file and was checked: no
shared case ever asserted it as failable, so nothing needed fixing. The new test now keeps
it that way.

### Docs

No website change. Both sites already describe `Float` correctly (evidence above), and the
benchmark case titles are lane data, not site content.
