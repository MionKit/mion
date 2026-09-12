package resolver_test

import (
	"strings"
	"testing"

	_ "github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats/all"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
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
	code := `import {createValidateFn} from '@mionjs/run-types';
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
	code := `import {createValidateFn} from '@mionjs/run-types';
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
	code := `import {createValidateFn} from '@mionjs/run-types';
` + typeFormatBrandDecl + `
export const _ = createValidateFn<TypeFormat<string, 'uuid', {version: '5'}>>();
`
	if len(scanForFormatParamDiagnostics(t, code)) == 0 {
		t.Fatalf("expected %s for uuid version '5', got none", diagnostics.CodeFMTInvalidParams)
	}
}

func TestFormatParams_ValidNoDiagnostic(t *testing.T) {
	code := `import {createValidateFn} from '@mionjs/run-types';
` + typeFormatBrandDecl + `
export const _ = createValidateFn<TypeFormat<string, 'stringFormat', {maxLength: 8; minLength: 2}>>();
`
	if diags := scanForFormatParamDiagnostics(t, code); len(diags) != 0 {
		t.Fatalf("expected no %s for valid params, got %+v", diagnostics.CodeFMTInvalidParams, diags)
	}
}

// ─────────────── Structural formats: the collection keywords ───────────────
//
// The scalar families have reported a contradictory params bag since the
// validateParams port (the cases above). The collection keywords reported only
// `maxItems` < `minItems`, and the occurrence bounds reported nothing at all,
// because `minContains` / `maxContains` ride the `__rtContains` sentinel rather
// than the brand params — so a provably-empty bag compiled into a validator that
// always rejects, with no build-time word about it.
//
// Each case below is EMPTY by construction, not merely suspicious.

func TestStructuralParams_MinContainsOverMaxContains(t *testing.T) {
	code := `import {createValidateFn} from '@mionjs/run-types';
import * as TF from '@mionjs/run-types/formats';
export const _ = createValidateFn<TF.FormattedArray<unknown[], {contains: number; minContains: 3; maxContains: 1}>>();
`
	diags := scanForFormatParamDiagnostics(t, code)
	if len(diags) == 0 {
		t.Fatalf("expected %s for minContains > maxContains, got none", diagnostics.CodeFMTInvalidParams)
	}
	if len(diags[0].Args) == 0 || !strings.Contains(diags[0].Args[0], "minContains") {
		t.Errorf("expected a minContains message, got %+v", diags[0].Args)
	}
	if diags[0].Severity != diagnostics.SeverityError {
		t.Errorf("severity: got %d want %d (error)", diags[0].Severity, diagnostics.SeverityError)
	}
}

// The count bound and the occurrence bound live in DIFFERENT channels (the
// brand and the sentinel), which is exactly why this one went unreported: a
// collection of at most 2 entries can never hold 3 matching ones.
func TestStructuralParams_MinContainsOverMaxItems(t *testing.T) {
	code := `import {createValidateFn} from '@mionjs/run-types';
import * as TF from '@mionjs/run-types/formats';
export const _ = createValidateFn<TF.FormattedArray<unknown[], {maxItems: 2; contains: number; minContains: 3}>>();
`
	diags := scanForFormatParamDiagnostics(t, code)
	if len(diags) == 0 {
		t.Fatalf("expected %s for minContains > maxItems, got none", diagnostics.CodeFMTInvalidParams)
	}
	if len(diags[0].Args) == 0 || !strings.Contains(diags[0].Args[0], "maxItems") {
		t.Errorf("expected a maxItems message, got %+v", diags[0].Args)
	}
}

// Every collection family reports, and names the wrapper the author WROTE: a
// message naming FormattedArray on a Map would send them to the wrong line.
func TestStructuralParams_EveryCollectionFamilyReports(t *testing.T) {
	cases := []struct {
		wrapper string
		spelled string
	}{
		{"FormattedArray", `TF.FormattedArray<unknown[], {contains: number; minContains: 3; maxContains: 1}>`},
		{"FormattedSet", `TF.FormattedSet<Set<unknown>, {contains: number; minContains: 3; maxContains: 1}>`},
		{"FormattedMap", `TF.FormattedMap<Map<string, number>, {contains: [unknown, 100]; minContains: 3; maxContains: 1}>`},
	}
	for _, tc := range cases {
		code := `import {createValidateFn} from '@mionjs/run-types';
import * as TF from '@mionjs/run-types/formats';
export const _ = createValidateFn<` + tc.spelled + `>();
`
		diags := scanForFormatParamDiagnostics(t, code)
		if len(diags) == 0 {
			t.Errorf("%s: expected %s, got none", tc.wrapper, diagnostics.CodeFMTInvalidParams)
			continue
		}
		if len(diags[0].Args) == 0 || !strings.HasPrefix(diags[0].Args[0], tc.wrapper+":") {
			t.Errorf("%s: message must name the wrapper the author wrote, got %+v", tc.wrapper, diags[0].Args)
		}
	}
}

// The rule holds for the WHOLE type, not just its root (the walk rule in
// ts-go-runtypes/CLAUDE.md): the same bag one object deeper must report too.
func TestStructuralParams_ContradictionReportsAtDepth(t *testing.T) {
	code := `import {createValidateFn} from '@mionjs/run-types';
import * as TF from '@mionjs/run-types/formats';
interface Holder {
  nested: {deeper: TF.FormattedSet<Set<unknown>, {contains: number; minContains: 3; maxContains: 1}>};
}
export const _ = createValidateFn<Holder>();
`
	if len(scanForFormatParamDiagnostics(t, code)) == 0 {
		t.Fatalf("expected %s for a contradiction one object deeper, got none", diagnostics.CodeFMTInvalidParams)
	}
}

// The inverse: a satisfiable bag must stay SILENT. `minContains: 0` is legal
// 2020-12 (it makes `contains` vacuous) and the generator draws it, so treating
// it as a contradiction would red a valid build.
func TestStructuralParams_SatisfiableBagsStaySilent(t *testing.T) {
	for _, spelled := range []string{
		`TF.FormattedArray<unknown[], {contains: number; minContains: 2; maxContains: 4}>`,
		`TF.FormattedArray<unknown[], {maxItems: 5; contains: number; minContains: 5}>`,
		`TF.FormattedArray<unknown[], {contains: number; minContains: 0}>`,
		`TF.FormattedSet<Set<unknown>, {minItems: 1; maxItems: 3; uniqueItems: true; contains: number}>`,
		`TF.FormattedMap<Map<string, number>, {maxItems: 4; contains: [unknown, 100]; maxContains: 1}>`,
	} {
		code := `import {createValidateFn} from '@mionjs/run-types';
import * as TF from '@mionjs/run-types/formats';
export const _ = createValidateFn<` + spelled + `>();
`
		if diags := scanForFormatParamDiagnostics(t, code); len(diags) != 0 {
			t.Errorf("%s must not report: got %+v", spelled, diags[0].Args)
		}
	}
}
