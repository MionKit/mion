package resolver_test

import (
	"strings"
	"testing"

	_ "github.com/mionkit/ts-runtypes/internal/cachegen/typefunctions/formats/all"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// scanForFormatDiagnostics scans `code` and returns the FMT002
// (invalid-params) diagnostics emitted during the validate render.
func scanForFormatParamDiagnostics(t *testing.T, code string) []diagnostics.Diagnostic {
	t.Helper()
	r := setupInline(t, map[string]string{"a.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"a.ts"},
		IncludeEntryModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	var out []diagnostics.Diagnostic
	for _, d := range resp.Diagnostics {
		if d.Code == diagnostics.CodeFMTInvalidParams {
			out = append(out, d)
		}
	}
	return out
}

func TestFormatParams_StringLengthMutualExclusion(t *testing.T) {
	code := `import {createValidateFn} from '@ts-runtypes/core';
` + typeFormatBrandDecl + `
export const _ = createValidateFn<TypeFormat<string, 'stringFormat', {length: 4; maxLength: 8}>>();
`
	diags := scanForFormatParamDiagnostics(t, code)
	if len(diags) == 0 {
		t.Fatalf("expected an %s diagnostic for length+maxLength, got none", diagnostics.CodeFMTInvalidParams)
	}
	if diags[0].Severity != diagnostics.SeverityError {
		t.Errorf("severity: got %d want %d (error)", diags[0].Severity, diagnostics.SeverityError)
	}
	if len(diags[0].Args) == 0 || !strings.Contains(diags[0].Args[0], "length") {
		t.Errorf("expected a length-related message, got %+v", diags[0].Args)
	}
}

func TestFormatParams_StringSingleComplexParam(t *testing.T) {
	code := `import {createValidateFn} from '@ts-runtypes/core';
` + typeFormatBrandDecl + `
export const _ = createValidateFn<TypeFormat<string, 'stringFormat', {
  pattern: {source: '^[0-9]+$'; flags: ''};
  allowedValues: {val: ['a', 'b']};
}>>();
`
	if len(scanForFormatParamDiagnostics(t, code)) == 0 {
		t.Fatalf("expected %s for pattern+allowedValues, got none", diagnostics.CodeFMTInvalidParams)
	}
}

func TestFormatParams_UUIDBadVersion(t *testing.T) {
	code := `import {createValidateFn} from '@ts-runtypes/core';
` + typeFormatBrandDecl + `
export const _ = createValidateFn<TypeFormat<string, 'uuid', {version: '5'}>>();
`
	if len(scanForFormatParamDiagnostics(t, code)) == 0 {
		t.Fatalf("expected %s for uuid version '5', got none", diagnostics.CodeFMTInvalidParams)
	}
}

func TestFormatParams_ValidNoDiagnostic(t *testing.T) {
	code := `import {createValidateFn} from '@ts-runtypes/core';
` + typeFormatBrandDecl + `
export const _ = createValidateFn<TypeFormat<string, 'stringFormat', {maxLength: 8; minLength: 2}>>();
`
	if diags := scanForFormatParamDiagnostics(t, code); len(diags) != 0 {
		t.Fatalf("expected no %s for valid params, got %+v", diagnostics.CodeFMTInvalidParams, diags)
	}
}
