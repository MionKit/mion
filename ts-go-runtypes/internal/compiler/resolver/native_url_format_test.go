package resolver_test

import (
	"strings"
	"testing"

	_ "github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats/all"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// NativeUrl<P>: the brand lifts off `URL & {brand}` onto the SubKindUrl node, and length / pattern checks run on href.

func scanNativeUrl(t *testing.T, params string) protocol.Response {
	t.Helper()
	code := `import {createValidateFn, createGetValidationErrorsFn} from '@mionjs/run-types';
` + typeFormatBrandDecl + `
type Link = TypeFormat<URL, 'nativeUrl', ` + params + `>;
export const isLink = createValidateFn<Link>();
export const linkErrors = createGetValidationErrorsFn<Link>();
`
	session := setupUnderDomLib(t, map[string]string{"a.ts": code})
	response := session.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"a.ts"},
		IncludeRunTypes:     true,
		IncludeEntryModules: true,
	})
	if response.Error != "" {
		t.Fatalf("scanFiles: %s", response.Error)
	}
	return response
}

func findNativeUrl(runTypes []*reflection.RunType) *reflection.RunType {
	for _, runType := range runTypes {
		if runType.FormatAnnotation != nil && runType.FormatAnnotation.Name == "nativeUrl" {
			return runType
		}
	}
	return nil
}

func invalidParamDiags(response protocol.Response) []diagnostics.Diagnostic {
	var found []diagnostics.Diagnostic
	for _, diagnostic := range response.Diagnostics {
		if diagnostic.Code == diagnostics.CodeFMTInvalidParams {
			found = append(found, diagnostic)
		}
	}
	return found
}

func TestNativeUrl_BrandLiftedOntoUrlNode(t *testing.T) {
	response := scanNativeUrl(t, `{maxLength: 20}`)
	node := findNativeUrl(response.RunTypes)
	if node == nil {
		t.Fatal("no RunType carrying the nativeUrl annotation")
	}
	if node.Kind != reflection.KindClass || node.SubKind != reflection.SubKindUrl {
		t.Fatalf("expected KindClass + SubKindUrl, got kind %d subKind %d", node.Kind, node.SubKind)
	}
	for _, child := range node.Children {
		if strings.HasPrefix(child.Name, "__rtFormat") {
			t.Fatalf("brand sentinel %q leaked onto the URL node as a property", child.Name)
		}
	}
}

func TestNativeUrl_ValidateChecksHref(t *testing.T) {
	response := scanNativeUrl(t, `{maxLength: 20; minLength: 5}`)
	source := familyEntrySources(response, "validate")
	for _, want := range []string{"instanceof URL", ".href.length <= 20", ".href.length >= 5"} {
		if !strings.Contains(source, want) {
			t.Fatalf("validate missing %q:\n%s", want, source)
		}
	}
}

// The format errors run only behind the URL guard, and report the URL host.
func TestNativeUrl_ValidationErrorsReportUrl(t *testing.T) {
	response := scanNativeUrl(t, `{maxLength: 20}`)
	source := familyEntrySources(response, "validationErrors")
	for _, want := range []string{"instanceof URL", "expected:\\'URL\\'", "name:\\'nativeUrl\\'", ".href.length > 20"} {
		if !strings.Contains(source, want) {
			t.Fatalf("validationErrors missing %q:\n%s", want, source)
		}
	}
	if strings.Contains(source, "instanceof Date") {
		t.Fatalf("the format errors must not be gated behind the Date guard:\n%s", source)
	}
}

func TestNativeUrl_PatternRunsOverHref(t *testing.T) {
	response := scanNativeUrl(t, `{pattern: {source: '^https:'; flags: ''}; mockSamples: ['https://a.co/']}`)
	if source := familyEntrySources(response, "validate"); !strings.Contains(source, ".test(") || !strings.Contains(source, ".href)") {
		t.Fatalf("validate missing the pattern test over href:\n%s", source)
	}
}

func TestNativeUrl_StructuralIDIncludesParams(t *testing.T) {
	short := findNativeUrl(scanNativeUrl(t, `{maxLength: 20}`).RunTypes)
	long := findNativeUrl(scanNativeUrl(t, `{maxLength: 30}`).RunTypes)
	if short == nil || long == nil {
		t.Fatal("no nativeUrl node")
	}
	if short.ID == long.ID {
		t.Fatalf("Url<{maxLength: 20}> and Url<{maxLength: 30}> must not share a cache id (%q)", short.ID)
	}
}

func TestNativeUrl_ParamValidation(t *testing.T) {
	cases := []struct {
		name    string
		params  string
		wantErr bool
	}{
		{"bounds ok", `{minLength: 5; maxLength: 20}`, false},
		{"max below min", `{minLength: 20; maxLength: 5}`, true},
		{"transform refused", `{transform: {trim: true}}`, true},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			diags := invalidParamDiags(scanNativeUrl(t, testCase.params))
			if (len(diags) > 0) != testCase.wantErr {
				t.Fatalf("params %s: got %+v wantErr %v", testCase.params, diags, testCase.wantErr)
			}
		})
	}
}
