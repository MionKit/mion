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
