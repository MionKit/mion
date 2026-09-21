package string

import "testing"

// A format carrying BOTH `emailRfc` and the `localPart`/`domain` decomposition validated under
// one set of rules and reported errors under the other, breaking the validate /
// getValidationErrors agreement (fuzz oracle O4); `EmailAddress<{localPart: {maxLength: 8}}>`
// reached it from the public surface. ValidateParams rejects the pair now, and both lanes pick the
// decomposition anyway because FMT002 is only a RuntimeError and the code still ships.

func rfcWithPartsParams() map[string]any {
	return map[string]any{
		"emailRfc":  "ascii",
		"maxLength": 254.0,
		"localPart": map[string]any{"maxLength": 8.0},
	}
}

func TestEmailRfcWithParts_BothLanesDecompose(t *testing.T) {
	annotation := annotationOf("email", rfcWithPartsParams())

	validate := emailEmitter{}.EmitValidateCheck(annotation, "v", newCardStubCtx())
	mustContain(t, "validate", validate, "lastIndexOf('@')")
	mustNotContain(t, "validate", validate, "isEmailAddress")

	errors := emailEmitter{}.EmitValidationErrorsCheck(annotation, "v", "pth", "er", newCardStubCtx())
	mustContain(t, "errors", errors, "lastIndexOf('@')", `errorType:"localPart"`)
	mustNotContain(t, "errors", errors, "isEmailAddress")
}

func TestEmail_ValidateParams_RejectsRfcWithParts(t *testing.T) {
	const want = "FormatEmail: cannot combine `emailRfc` with `localPart`/`domain`"
	rejected := []map[string]any{
		{"emailRfc": "ascii", "localPart": map[string]any{"maxLength": 8.0}},
		{"emailRfc": "unicode", "domain": map[string]any{"maxLength": 253.0}},
	}
	for _, params := range rejected {
		messages := emailEmitter{}.ValidateParams(annotationOf("email", params))
		if !hasMessage(messages, want) {
			t.Errorf("params %v must be rejected with %q; got %v", params, want, messages)
		}
	}

	// These are the preset shapes: EmailAddress / IdnEmail carry emailRfc alone, EmailStrict the decomposition.
	accepted := []map[string]any{
		{"emailRfc": "ascii", "maxLength": 254.0},
		{"localPart": map[string]any{"maxLength": 64.0}, "domain": map[string]any{"maxLength": 253.0}},
	}
	for _, params := range accepted {
		messages := emailEmitter{}.ValidateParams(annotationOf("email", params))
		if len(messages) != 0 {
			t.Errorf("params %v must be accepted; got %v", params, messages)
		}
	}
}

func hasMessage(messages []string, want string) bool {
	for _, message := range messages {
		if message == want {
			return true
		}
	}
	return false
}
