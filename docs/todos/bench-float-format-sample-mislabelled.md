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
