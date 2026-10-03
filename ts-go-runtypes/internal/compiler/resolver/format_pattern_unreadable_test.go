package resolver_test

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// scanPatternDecl scans a validator over a string format whose pattern is `typeof p`, p declared by patternDecl.
func scanPatternDecl(t *testing.T, patternDecl, call string) protocol.Response {
	t.Helper()
	code := `import {createValidateFn} from '@mionjs/run-types';
` + typeFormatBrandDecl + `
` + patternDecl + `
type Sku = TypeFormat<string, 'stringFormat', {pattern: typeof p}>;
` + call + `
`
	resp := setupInline(t, map[string]string{"a.ts": code}).Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"a.ts"},
		IncludeEntryModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	return resp
}

// The shape a .d.ts keeps of a const typed as a plain pattern: a source the type does not spell.
const widenedPatternDecl = `declare const p: {readonly source: string; readonly flags?: string};`

// TestFormatPattern_WidenedEmitsFMT009Static: the validator cannot check a pattern it cannot read, so the build stops.
func TestFormatPattern_WidenedEmitsFMT009Static(t *testing.T) {
	resp := scanPatternDecl(t, widenedPatternDecl, `export const isSku = createValidateFn<Sku>();`)
	found := findDiag(resp, diagnostics.CodeFMTPatternUnreadable)
	if found == nil || found.Severity != diagnostics.SeverityError || found.Site.StartLine <= 0 {
		t.Fatalf("expected an FMT009 error at the call, got %+v", resp.Diagnostics)
	}
}

// TestFormatPattern_WidenedEmitsFMT009Value is the value call shape of the same case.
func TestFormatPattern_WidenedEmitsFMT009Value(t *testing.T) {
	resp := scanPatternDecl(t, widenedPatternDecl, `declare const sku: Sku;
export const isSku = createValidateFn(sku);`)
	if findDiag(resp, diagnostics.CodeFMTPatternUnreadable) == nil {
		t.Fatalf("expected FMT009, got %+v", resp.Diagnostics)
	}
}

// TestFormatPattern_DeclaredLiteralPatternIsRead: an unannotated registerFormatPattern const keeps its source in a .d.ts.
func TestFormatPattern_DeclaredLiteralPatternIsRead(t *testing.T) {
	resp := scanPatternDecl(t, `declare const p: {readonly source: '^[A-Z]{3}-[0-9]{4}$'; readonly flags: ''};`, `export const isSku = createValidateFn<Sku>();`)
	if found := findDiag(resp, diagnostics.CodeFMTPatternUnreadable); found != nil {
		t.Fatalf("a literal source is readable, got %+v", found)
	}
}

// scanFormatPattern scans call over formatDecl, a type built from the formats package with a widened `typeof p` pattern.
func scanFormatPattern(t *testing.T, formatDecl, call string) protocol.Response {
	t.Helper()
	code := `import {createValidateFn, createGetValidationErrorsFn} from '@mionjs/run-types';
import * as TF from '@mionjs/run-types/formats';
` + widenedPatternDecl + `
` + formatDecl + `
` + call + `
`
	resp := setupInline(t, map[string]string{"a.ts": code}).Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"a.ts"},
		IncludeEntryModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	return resp
}

const widenedStringFormat = `type Sku = TF.String<{pattern: typeof p}>;`

// TestFormatPattern_ErrorsOnlyEmitsFMT009Static: a validation-errors function would skip the pattern as silently.
func TestFormatPattern_ErrorsOnlyEmitsFMT009Static(t *testing.T) {
	resp := scanFormatPattern(t, widenedStringFormat, `export const skuErrors = createGetValidationErrorsFn<Sku>();`)
	if findDiag(resp, diagnostics.CodeFMTPatternUnreadable) == nil {
		t.Fatalf("expected FMT009, got %+v", resp.Diagnostics)
	}
}

// TestFormatPattern_ErrorsOnlyEmitsFMT009Value is the value call shape of the same case.
func TestFormatPattern_ErrorsOnlyEmitsFMT009Value(t *testing.T) {
	resp := scanFormatPattern(t, widenedStringFormat, `declare const sku: Sku;
export const skuErrors = createGetValidationErrorsFn(sku);`)
	if findDiag(resp, diagnostics.CodeFMTPatternUnreadable) == nil {
		t.Fatalf("expected FMT009, got %+v", resp.Diagnostics)
	}
}

// TestFormatPattern_NestedMemberEmitsFMT009: the pattern one object deeper is read by the same walk.
func TestFormatPattern_NestedMemberEmitsFMT009(t *testing.T) {
	resp := scanFormatPattern(t, widenedStringFormat+`
type Order = {item: {sku: Sku}};`, `export const isOrder = createValidateFn<Order>();`)
	if findDiag(resp, diagnostics.CodeFMTPatternUnreadable) == nil {
		t.Fatalf("expected FMT009, got %+v", resp.Diagnostics)
	}
}

// TestFormatPattern_NamedAndPartFormatsEmitFMT009: a named format's own pattern and a part's pattern, in both families.
func TestFormatPattern_NamedAndPartFormatsEmitFMT009(t *testing.T) {
	cases := map[string]string{
		"email pattern":     `type Value = TF.Email<{pattern: typeof p}>;`,
		"email local part":  `type Value = TF.EmailParts<{localPart: {pattern: typeof p}}>;`,
		"domain label name": `type Value = TF.DomainParts<{names: {pattern: typeof p}}>;`,
	}
	for name, formatDecl := range cases {
		for _, call := range []string{
			`export const isValue = createValidateFn<Value>();`,
			`export const valueErrors = createGetValidationErrorsFn<Value>();`,
		} {
			resp := scanFormatPattern(t, formatDecl, call)
			if findDiag(resp, diagnostics.CodeFMTPatternUnreadable) == nil {
				t.Errorf("%s, %s: expected FMT009, got %+v", name, call, resp.Diagnostics)
			}
		}
	}
}
