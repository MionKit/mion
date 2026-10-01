package string

import "testing"

// The quick roads (pattern, IDNA) check allowedValues on both lanes; parts bounds without names/tld fail the build.

func TestDomainPattern_AllowedValuesOnBothLanes(t *testing.T) {
	params := map[string]any{
		"pattern":       map[string]any{"source": "^[a-z.]+$"},
		"allowedValues": map[string]any{"val": []any{"example.com"}},
	}
	validate := domainEmitter{}.EmitValidateCheck(annotationOf("domain", params), "v", newCardStubCtx())
	mustContain(t, "validate", validate, "reFmt0.test(v) && reFmt1.test(v)")
	errors := domainEmitter{}.EmitValidationErrorsCheck(annotationOf("domain", params), "v", "pth", "er", newCardStubCtx())
	mustContain(t, "errors", errors, "if (!(reFmt1.test(v)))", "formatPath:['allowedValues']")
	mustNotContain(t, "errors", errors, "errorType")
}

func TestDomainIdna_AllowedValuesOnBothLanes(t *testing.T) {
	params := map[string]any{"idna": "unicode", "allowedValues": map[string]any{"val": []any{"example.com"}}}
	validate := domainEmitter{}.EmitValidateCheck(annotationOf("domain", params), "v", newCardStubCtx())
	mustContain(t, "validate", validate, "isIdnHostname(v,{idn:true})==='' && reFmt0.test(v)")
	errors := domainEmitter{}.EmitValidationErrorsCheck(annotationOf("domain", params), "v", "pth", "er", newCardStubCtx())
	mustContain(t, "errors", errors, "if (!(reFmt0.test(v)))", "formatPath:['allowedValues']")
}

func TestDomainPattern_NoAllowedValuesEmitsNothingExtra(t *testing.T) {
	params := map[string]any{"pattern": map[string]any{"source": "^[a-z.]+$"}}
	validate := domainEmitter{}.EmitValidateCheck(annotationOf("domain", params), "v", newCardStubCtx())
	mustNotContain(t, "validate", validate, "reFmt1")
	errors := domainEmitter{}.EmitValidationErrorsCheck(annotationOf("domain", params), "v", "pth", "er", newCardStubCtx())
	mustNotContain(t, "errors", errors, "allowedValues")
}

func TestDomain_ValidateParams_PartsBoundsNeedNames(t *testing.T) {
	for _, key := range []string{"maxParts", "minParts"} {
		want := "FormatDomain: `" + key + "` needs `names`/`tld` (use DomainParts)"
		for _, params := range []map[string]any{
			{"pattern": map[string]any{"source": "^x$"}, key: 3.0},
			{"idna": "ascii", key: 3.0},
		} {
			if messages := (domainEmitter{}).ValidateParams(annotationOf("domain", params)); !hasMessage(messages, want) {
				t.Errorf("params %v must be rejected with %q; got %v", params, want, messages)
			}
		}
	}
	parts := map[string]any{"names": map[string]any{}, "tld": map[string]any{}, "maxParts": 6.0, "minParts": 2.0}
	if messages := (domainEmitter{}).ValidateParams(annotationOf("domain", parts)); len(messages) != 0 {
		t.Errorf("DomainParts params must be accepted; got %v", messages)
	}
}

func TestEmail_ValidateParams_DomainHalfPartsBoundsNeedNames(t *testing.T) {
	want := "FormatEmail domain: `maxParts` needs `names`/`tld` (use DomainParts)"
	params := map[string]any{"localPart": map[string]any{}, "domain": map[string]any{"maxParts": 3.0}}
	if messages := (emailEmitter{}).ValidateParams(annotationOf("email", params)); !hasMessage(messages, want) {
		t.Errorf("params %v must be rejected with %q; got %v", params, want, messages)
	}
	split := map[string]any{"domain": map[string]any{"names": map[string]any{}, "tld": map[string]any{}, "maxParts": 3.0}}
	if messages := (emailEmitter{}).ValidateParams(annotationOf("email", split)); len(messages) != 0 {
		t.Errorf("a split domain half must be accepted; got %v", messages)
	}
}
