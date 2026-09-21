---
type: fix
spec: guidelines
status: ready
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
