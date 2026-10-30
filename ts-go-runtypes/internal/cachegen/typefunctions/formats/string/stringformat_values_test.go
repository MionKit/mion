package string

import "testing"

// A case-sensitive value set is a hoisted Set lookup; ignoreCase keeps the anchored regex, whose folding a Set lacks.
func TestStringFormat_ValueSetsUseASetUnlessIgnoreCase(t *testing.T) {
	sensitive := map[string]any{
		"allowedValues":    map[string]any{"val": []any{"red", "it's"}},
		"disallowedValues": map[string]any{"val": []any{"blue"}},
	}
	validate := stringFormatEmitter{}.EmitValidateCheck(annotationOf("stringFormat", sensitive), "v", newCardStubCtx())
	mustContain(t, "validate", validate, "valSet0.has(v)", "!valSet1.has(v)")
	mustNotContain(t, "validate", validate, ".test(v)")
	errors := stringFormatEmitter{}.EmitValidationErrorsCheck(annotationOf("stringFormat", sensitive), "v", "pth", "er", newCardStubCtx())
	mustContain(t, "errors", errors, "if (!(valSet0.has(v)))", "if (valSet1.has(v))")

	folded := map[string]any{"allowedValues": map[string]any{"val": []any{"red"}, "ignoreCase": true}}
	validate = stringFormatEmitter{}.EmitValidateCheck(annotationOf("stringFormat", folded), "v", newCardStubCtx())
	mustContain(t, "validate", validate, "reFmt0.test(v)")
	mustNotContain(t, "validate", validate, "valSet")
}
