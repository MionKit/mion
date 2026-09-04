package resolver_test

import (
	"strings"
	"testing"

	_ "github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats/all"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// unsafePatternFormat is a format whose pattern can be made to backtrack
// exponentially: `(\w+\s?)*` splits a run of word characters more than
// one way per turn, so an input that ends up not matching is retried
// exponentially many times.
const unsafePatternSource = `^(\\w+\\s?)*$`

func scanPatternSafety(t *testing.T, params string) protocol.Response {
	t.Helper()
	code := `import {createValidateFn} from '@mionjs/run-types';
` + typeFormatBrandDecl + `
export const _ = createValidateFn<TypeFormat<string, 'stringFormat', {
` + params + `
}>>();
`
	session := setupInline(t, map[string]string{"a.ts": code})
	resp := session.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"a.ts"},
		IncludeEntryModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	return resp
}

// TestFormatPattern_UnsafeEmitsFMT008 — the check has to land on the
// user's createValidateFn call site, as an error, naming the pattern.
func TestFormatPattern_UnsafeEmitsFMT008(t *testing.T) {
	resp := scanPatternSafety(t, `  pattern: {source: '`+unsafePatternSource+`'; mockSamples: ['one two']};`)
	found := findDiag(resp, diagnostics.CodeFMTPatternUnsafe)
	if found == nil {
		t.Fatalf("expected an %s diagnostic, got %+v", diagnostics.CodeFMTPatternUnsafe, resp.Diagnostics)
	}
	if found.Severity != diagnostics.SeverityError {
		t.Errorf("severity: got %d want %d (error)", found.Severity, diagnostics.SeverityError)
	}
	if !strings.Contains(found.Site.FilePath, "a.ts") {
		t.Errorf("site: got %q, want the call site in a.ts", found.Site.FilePath)
	}
	if found.Site.StartLine <= 0 {
		t.Errorf("site: got line %d, want the createValidateFn call site", found.Site.StartLine)
	}
	// Args: [pattern source, reason, offending sub-expression].
	if len(found.Args) != 3 {
		t.Fatalf("args: got %+v, want [source, reason, excerpt]", found.Args)
	}
	if !strings.Contains(found.Args[0], `\w+`) {
		t.Errorf("args[0]: got %q, want the pattern source", found.Args[0])
	}
	if found.Args[2] == "" {
		t.Errorf("args[2]: want the offending sub-expression, got empty")
	}
}

// TestFormatPattern_UnsafePatternOptsOut — the escape hatch, for the
// pattern the check reads wrongly. Nothing else about the format changes.
func TestFormatPattern_UnsafePatternOptsOut(t *testing.T) {
	resp := scanPatternSafety(t, `  pattern: {source: '`+unsafePatternSource+`'; mockSamples: ['one two']; unsafePattern: true};`)
	if found := findDiag(resp, diagnostics.CodeFMTPatternUnsafe); found != nil {
		t.Fatalf("expected no %s with unsafePattern: true, got %+v", diagnostics.CodeFMTPatternUnsafe, found)
	}
}

// TestFormatPattern_SafePatternIsQuiet — a dense but unambiguous pattern
// must not be reported. This is the shape the built-in domain formats
// use, and the check is worthless if it cannot pass it.
func TestFormatPattern_SafePatternIsQuiet(t *testing.T) {
	resp := scanPatternSafety(t, `  pattern: {source: '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$'; mockSamples: ['mion.io']};`)
	if found := findDiag(resp, diagnostics.CodeFMTPatternUnsafe); found != nil {
		t.Fatalf("expected no %s for a safe pattern, got %+v", diagnostics.CodeFMTPatternUnsafe, found)
	}
}
