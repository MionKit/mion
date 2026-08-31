package main

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/diagnostics"
)

// mkEnrichDiag builds a minimal registered diagnostic for the given code.
func mkEnrichDiag(code string) diagnostics.Diagnostic {
	return diagnostics.New(code, diagnostics.Site{FilePath: "mirror.ts", StartLine: 1, StartCol: 1})
}

// TestReportEnrichDiagnostics_CompletenessGate is the exit-code contract behind
// the two check lanes. The default health check (`enrich <file> --no-emit`,
// requireComplete=false) tolerates an unfilled @todo scaffold — a fresh scaffold
// is expected to carry blanks — but the completeness gate (`--require-complete`,
// requireComplete=true) fails on it. Wrong/stale content fails BOTH lanes.
func TestReportEnrichDiagnostics_CompletenessGate(t *testing.T) {
	// Completeness codes — an unfilled @todo (FT020/MD020) or a blank value
	// (FT023/MD023): reported by the default check but failing only --require-complete.
	for _, code := range []string{
		diagnostics.CodeFriendlyTodo, diagnostics.CodeMockTodo,
		diagnostics.CodeFriendlyBlankValue, diagnostics.CodeMockBlankValue,
	} {
		incomplete := []diagnostics.Diagnostic{mkEnrichDiag(code)}
		if got := reportEnrichDiagnostics(incomplete, false, false); got != 0 {
			t.Errorf("default check must tolerate completeness code %s; exit=%d, want 0", code, got)
		}
		if got := reportEnrichDiagnostics(incomplete, false, true); got != 1 {
			t.Errorf("--require-complete must fail on completeness code %s; exit=%d, want 1", code, got)
		}
	}

	// Wrong/stale content (malformed field, orphan carcass): always fails, both lanes.
	for _, code := range []string{
		diagnostics.CodeFriendlyUnknownField,
		diagnostics.CodeFriendlyOrphanConst,
		diagnostics.CodeMockUnknownField,
		diagnostics.CodeMockOrphanConst,
	} {
		wrong := []diagnostics.Diagnostic{mkEnrichDiag(code)}
		if got := reportEnrichDiagnostics(wrong, false, false); got != 1 {
			t.Errorf("%s must fail the default check; exit=%d, want 1", code, got)
		}
		if got := reportEnrichDiagnostics(wrong, false, true); got != 1 {
			t.Errorf("%s must fail under --require-complete; exit=%d, want 1", code, got)
		}
	}

	// A @todo alongside wrong content still fails the default lane (the wrong
	// content drives it) — completeness tolerance never masks a real error.
	mixed := []diagnostics.Diagnostic{mkEnrichDiag(diagnostics.CodeFriendlyTodo), mkEnrichDiag(diagnostics.CodeFriendlyUnknownField)}
	if got := reportEnrichDiagnostics(mixed, false, false); got != 1 {
		t.Errorf("a wrong-content error must fail even when a @todo is present; exit=%d, want 1", got)
	}

	// A clean report exits 0 in both lanes.
	if got := reportEnrichDiagnostics(nil, false, true); got != 0 {
		t.Errorf("clean report must exit 0; exit=%d", got)
	}
}
