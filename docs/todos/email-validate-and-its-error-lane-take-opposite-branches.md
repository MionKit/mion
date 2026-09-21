---
type: fix
spec: guidelines
status: ready
created: 2026-09-21
---

# The email validator and its error lane take opposite branches

## Intent

[email.go](../../ts-go-runtypes/internal/cachegen/typefunctions/formats/string/email.go) emits two
lanes for the same format, and they test the same two conditions in opposite order.

Validate:

```go
func (emailEmitter) EmitValidateCheck(annotation *reflection.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation != nil && emailHasParts(annotation.Params) {
		return emailValidateExprFor(ctx, annotation.Params, vλl)
	}
	if annotation != nil && emailHasRfc(annotation.Params) {
		return emailRfcCheckExpr(ctx, annotation.Params, vλl)
	}
	return namedPatternValidate(ctx, annotation, vλl)
}
```

Errors:

```go
func (emailEmitter) EmitValidationErrorsCheck(annotation *reflection.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation != nil && emailHasRfc(annotation.Params) {
		return emailRfcErrorsBlock(ctx, annotation.Params, vλl, pathExpr, errorsArr)
	}
	if annotation != nil && emailHasParts(annotation.Params) {
		return emailErrorsBlockFor(ctx, annotation.Params, vλl, pathExpr, errorsArr)
	}
	return namedPatternErrors(ctx, annotation, vλl, pathExpr, errorsArr, "email")
}
```

`emailHasParts` first in one, `emailHasRfc` first in the other. When a format carries BOTH, the two
lanes validate different rules: the decomposition path splits on the last `@` and runs a sub-format
over each half, the RFC path runs the `isEmailAddress` pure fn plus length bounds.

## Why the combination is reachable

`EmailAddress<P extends Override<EmailParams, 'pattern'>>`
([stringFormats.ts](../../packages/run-types/src/formats/string/stringFormats.ts)) pins only
`pattern`, so `localPart` and `domain` are free. Its defaults are
`DEFAULT_EMAIL_ADDRESS_PARAMS = {emailRfc: 'ascii'; maxLength: 254; mockSamples: [...]}`, and
`FormatDefaults` merges them key-wise with `P`. So `EmailAddress<{localPart: {...}}>` arrives at
emit with `emailRfc` AND `localPart` both set.

`emailEmitter.ValidateParams` rejects `pattern` combined with `localPart`/`domain`, but says nothing
about `emailRfc` combined with them, so the combination is never caught at build time.

## Evidence

Measured on this checkout:

```ts
type E = EmailAddress<{localPart: {maxLength: 8}}>;
const validate = createValidateFn<E>();
const errors = createGetValidationErrorsFn<E>();
validate('averyveryverylonglocalpart@example.com');  // false
errors('averyveryverylonglocalpart@example.com');    // []
```

`validate` takes the decomposition path and rejects the over-long local part. `getValidationErrors`
takes the RFC path, where the address is fine, and pushes nothing. That breaks the
createValidateFn / createGetValidationErrorsFn agreement invariant (fuzz oracle O4), in the
direction that matters most: a caller using the error list as the gate accepts a value the
validator rejects.

## What to settle

Which path should win when both keys are present, and whether the combination should reach emit at
all. Two candidate answers, and they are not exclusive:

- Order the two `if`s the same way in both lanes.
  [domain.go](../../ts-go-runtypes/internal/cachegen/typefunctions/formats/string/domain.go) has the
  identical two-path shape (`domainHasNames` then `domainHasIdna`) and orders it consistently in
  both lanes, so it is the model to follow. Decide which order is RIGHT rather than copying
  whichever lane happens to be first today.
- Reject the combination in `ValidateParams`, the way `pattern` with `localPart`/`domain` is
  already rejected. That turns a silent divergence into a build error. If this is the answer, check
  it does not break the presets that set `emailRfc` by default, since a user adding `localPart` to
  `EmailAddress` would then get an error rather than a working format. Narrowing the preset's `P`
  bound is the other half of that answer.

Decide both questions explicitly, and say why in the shipped doc.

## Evidence to produce

- A test asserting `validate` and `getValidationErrors` agree for a format carrying both
  `emailRfc` and `localPart`/`domain`, failing before the change and passing after. The JS shape to
  follow is
  [verr-record-array-disagreement.test.ts](../../packages/run-types/test/features/verr-record-array-disagreement.test.ts):
  a behaviour test through the full plugin pipeline, paired with a Go emitter test.
- If the answer is a build-time rejection instead, a diagnostic test over the same type plus the
  preset check above.
- `go -C ts-go-runtypes test ./internal/... ./cmd/...` and `pnpm test` green.

## Watch out

- `emailHasParts` returns true for `localPart` OR `domain` alone, while `ValidateParams` requires
  them together. Whatever the fix, keep that asymmetry in mind: a params set with only `domain` is
  already a build error, so the reachable case is the one the preset defaults create.
- The RFC and decomposition paths report errors under different `errorType` modes (the roster is in
  [emit.go](../../ts-go-runtypes/internal/cachegen/typefunctions/formats/emit.go)). Changing which
  path runs changes which modes a consumer sees, so the format-validation suite expectations for
  email move with it.

## Origin

Found by a sweep of every format emitter for a validate lane and an error lane computing the same
thing separately. That sweep was asked for by a different finding, the dateTime separator, which is
fixed on its own branch. This one is a different format, a different root cause and its own fix, so
it is delegated rather than folded in.
