---
type: fix
spec: guidelines
status: done
created: 2026-09-21
---

# The dateTime validator accepts a lowercase separator its error lane rejects

## Intent

[datetime.go](../../ts-go-runtypes/internal/cachegen/typefunctions/formats/datetime/datetime.go) emits
two lanes for the same format, and they find the separator differently.

The validator goes through `splitSearch`, which matches a letter separator case-insensitively:

```go
// splitSearch locates the date/time separator, matching a LETTER separator case-insensitively: RFC 3339 allows
// `1963-06-19t08:30:06z` and a plain indexOf would miss it. Anything else keeps the exact single-character search.
func splitSearch(vλl, splitChar string) string {
	lower := strings.ToLower(splitChar)
	upper := strings.ToUpper(splitChar)
	if lower == upper {
		return vλl + ".indexOf(" + strconv.Quote(splitChar) + ")"
	}
	return vλl + ".search(/[" + upper + lower + "]/)"
}
```

`EmitValidationErrorsCheck`, in the same file, does the plain search the comment says would miss it:

```go
stmt := "const dtSplit=" + vλl + ".indexOf(" + split + ");" +
	"if (dtSplit===-1) " + errFor("splitChar") + ";" +
```

So for `1963-06-19t08:30:06z` (a lowercase `t`, legal per RFC 3339):

- `validate()` returns true.
- `getValidationErrors()` reports a `splitChar` error.

A caller that trusts `validate` and then asks for reasons gets a contradiction, and a caller that
uses the error list as the gate rejects a value the validator says is fine.

## What to settle

Almost certainly the error lane should use `splitSearch` too, so both lanes find the separator the
same way. Confirm that is right rather than the reverse (the comment's RFC 3339 argument is the
reason the case-insensitive search exists, so narrowing the validator instead would need its own
justification).

While you are in there, check every other format emitter for the same shape: a validate lane and an
error lane that each compute the same thing separately. Anywhere one is derived from the other, say
so; anywhere they are written twice, that is the next instance of this bug waiting.

## Evidence to produce

- A test over `1963-06-19t08:30:06z` asserting that `validate` and `getValidationErrors` agree,
  failing before the change and passing after.
- `go -C ts-go-runtypes test ./internal/... ./cmd/...` green.
- The result of the sweep, even if this is the only instance: say so, so the next reader does not
  redo it.

## Watch out

- The two lanes select different cache families, so a fix must not change the validator's emitted
  code by accident: the id-convergence and generated-code oracles compare exact output.
- `splitChar` is a parameter, not always `T`. `splitSearch` already handles a separator with no case
  distinction (it falls back to `indexOf`), so whatever replaces the error lane's `indexOf` must keep
  that branch.

## Origin

Found during a repo-wide comment simplification pass. The comment on `splitSearch` is accurate about
its own function; reading it against the other lane in the same file is what surfaced the gap.

## Plan — one separator rule, four call sites (approved 2026-09-21)

The error lane was right to be suspected and wrong in a bigger way than the report saw: the
separator rule was spelled FOUR times in this package, and only one spelling was
case-insensitive. Confirmed the case-insensitive reading is the correct one (RFC 3339 §5.6 permits
lower case for both the separator and `Z`, and `isTimeZone` already accepts a lowercase `z`), so the
other three moved to it rather than the reverse.

The rule now lives in one helper pair in [datetime.go](../../ts-go-runtypes/internal/cachegen/typefunctions/formats/datetime/datetime.go):

```go
func foldedSeparator(splitChar string) (upper, lower string, folded bool)
func splitSearch(vλl, splitChar string) string     // the emitted JS expression
func splitIndex(value, splitChar string) (index, width int)  // its build-time twin
```

The four call sites:

1. `EmitValidateCheck` — already on `splitSearch`, unchanged (the id-convergence and
   generated-code oracles compare exact output, so the validator's emitted bytes had to stay put
   for the unbounded case).
2. `EmitValidationErrorsCheck` — was `vλl + ".indexOf(" + split + ")"`, now `splitSearch`.
   This is the reported bug.
3. `valueKeyExpr` in [boundcodegen.go](../../ts-go-runtypes/internal/cachegen/typefunctions/formats/datetime/boundcodegen.go)
   — the min/max comparison key, which BOTH lanes use. It also spelled its own `indexOf`, so a
   lowercase separator went `NaN` and every bound comparison came out false. Fixing only the error
   lane would have left a bounded `dateTime` rejecting the value in both lanes: agreeing, and
   agreeing on the wrong answer.
4. `dateTimeEpochMs` in [literals.go](../../ts-go-runtypes/internal/cachegen/typefunctions/formats/datetime/literals.go)
   — the build-time bake of an absolute bound literal, `strings.Index`. A bound written
   `min: '1963-01-01t00:00:00'` failed to parse and halted the build. Now on `splitIndex`.

`splitIndex` returns the byte width of the spelling that matched, so `dateTimeEpochMs` slices the
time half correctly whichever case it found. A separator with no case distinction (` `, `_`) keeps
the exact search on both sides, as before.

### Tests

- [splitsearch_test.go](../../ts-go-runtypes/internal/cachegen/typefunctions/formats/datetime/splitsearch_test.go)
  — the emitter unit pins: both lanes split with the same expression, the bound key splits with it
  too, `splitIndex` agrees with `splitSearch`, and a lowercase bound literal bakes to the same
  instant as the upper-case one.
- [datetime-splitchar-lane-disagreement.test.ts](../../packages/run-types/test/features/datetime-splitchar-lane-disagreement.test.ts)
  — the behaviour twin through the full plugin pipeline: `1963-06-19t08:30:06z` validates true and
  returns no errors, the same holds with bounds declared, a lowercase bound literal is accepted, and
  a battery of separator spellings keeps the two lanes in step (fuzz oracle O4).
- `'1963-06-19t08:30:06z'` joins the `dateTime_default` valid samples in
  [StringFormat.ts](../../packages/run-types/test/suites/format-validation/StringFormat.ts), which
  asserts `validate → true` AND `getValidationErrors → []` across five resolution paths.

Each of the three production edits was reverted in turn and the matching test observed failing.

### Docs

None. The website names `TF.StringDateTime` once and says nothing about the separator, so no
documented behaviour changed; this restores what RFC 3339 and the `splitSearch` comment already
promised.

## The sweep

Every format emitter in
[formats/](../../ts-go-runtypes/internal/cachegen/typefunctions/formats/) was read for the same
shape, a validate lane and an error lane computing the same thing separately. The result, so the
next reader does not redo it:

**Clean, both lanes build the check from one helper:** `temporalFormat.go` (one `boundCompare`),
`nativeDate.go` (the key-based bound helpers), `collectionformat.go` and `url.go` (one-line
delegations), and `numberformat.go`'s `multipleOf` alone.

**Duplicated and currently agreeing.** Each writes the rule twice and the two copies match today:

| Where | What is written twice |
| --- | --- |
| `stringformat.go` | the three code-point length bands, hand-negated (the riskiest of these) |
| `objectformat.go` | the key-counting walk and its min/max comparisons |
| `domain.go` | the label-splitting loop and the part count |
| `numberformat.go`, `bigintformat.go` | five comparisons each, hand-negated |
| `arrayformat.go` | the two length comparisons |
| `creditcard.go` | the two pure-fn calls and the no-networks guard |
| `ip.go` | the pass/fail derivation when `allowPort` is set |
| `uuid.go`, `pattern.go` | the whole call expression, character for character |
| `boundcodegen.go` | the comparison, as `op` and `if (!(op))` over shared operands |

**A second real disagreement, in `email.go`:** the two lanes test the same two conditions in
opposite order, so a format carrying both `emailRfc` and `localPart`/`domain` validates under the
decomposition rules and reports errors under the RFC ones. `ValidateParams` rejects `pattern` with
`localPart`/`domain` but not `emailRfc` with them, and `FormatDefaults` merges `emailRfc: 'ascii'`
into every `EmailAddress<P>`, so the combination is reachable. `domain.go` has the same two-path
shape and orders it consistently. That is a different format, a different root cause and its own
fix, so it was delegated to a parallel session rather than folded in here.
