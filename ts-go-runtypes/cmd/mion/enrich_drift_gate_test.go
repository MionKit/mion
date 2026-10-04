package main

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment"
)

// TestHygieneSeverity pins the drift report's severity POLICY for the tag-hygiene
// codes: an incomplete finding is a Warning, a stale carcass is an Error. Every
// one of these codes is LevelWarning in the catalog (a mirror with a carcass still
// runs), so the report must not read the level, or a stale carcass stops failing.
func TestHygieneSeverity(t *testing.T) {
	for _, code := range []string{
		diagnostics.CodeFriendlyTodo, diagnostics.CodeMockTodo,
		diagnostics.CodeFriendlyBlankValue, diagnostics.CodeMockBlankValue,
	} {
		if got := hygieneSeverity(code); got != enrichment.Warning {
			t.Errorf("completeness code %s severity = %v, want Warning", code, got)
		}
	}
	for _, code := range []string{
		diagnostics.CodeFriendlyOrphanConst, diagnostics.CodeMockOrphanConst,
		diagnostics.CodeFriendlyOrphanField, diagnostics.CodeMockOrphanField,
	} {
		if got := hygieneSeverity(code); got != enrichment.Error {
			t.Errorf("carcass code %s severity = %v, want Error", code, got)
		}
	}
}

// TestMirrorDriftExitCode pins the single-file gate contract on the tree walk; a @todo never masks a carcass.
func TestMirrorDriftExitCode(t *testing.T) {
	finding := func(code string, severity enrichment.Severity) driftFinding {
		return driftFinding{File: "mirror.ts", Code: code, Severity: severity}
	}
	hygiene := func(code string) driftFinding { return finding(code, hygieneSeverity(code)) }

	for _, code := range []string{
		diagnostics.CodeFriendlyTodo, diagnostics.CodeMockTodo,
		diagnostics.CodeFriendlyBlankValue, diagnostics.CodeMockBlankValue,
	} {
		incomplete := []driftFinding{hygiene(code)}
		if got := mirrorDriftExitCode(incomplete, false); got != 0 {
			t.Errorf("default check must tolerate completeness code %s; exit=%d, want 0", code, got)
		}
		if got := mirrorDriftExitCode(incomplete, true); got != 1 {
			t.Errorf("--require-complete must fail on completeness code %s; exit=%d, want 1", code, got)
		}
	}

	for _, code := range []string{
		diagnostics.CodeFriendlyOrphanConst, diagnostics.CodeMockOrphanConst,
		diagnostics.CodeFriendlyOrphanField, diagnostics.CodeMockOrphanField,
	} {
		stale := []driftFinding{hygiene(code)}
		if got := mirrorDriftExitCode(stale, false); got != 1 {
			t.Errorf("%s must fail the default check; exit=%d, want 1", code, got)
		}
		if got := mirrorDriftExitCode(stale, true); got != 1 {
			t.Errorf("%s must fail under --require-complete; exit=%d, want 1", code, got)
		}
	}

	for _, code := range []string{diagnostics.CodeGenMirrorUnreadable, diagnostics.CodeGenSourceMissing, diagnostics.CodeGenTypeMissing} {
		if got := mirrorDriftExitCode([]driftFinding{finding(code, enrichment.Error)}, false); got != 1 {
			t.Errorf("%s must fail the default check; exit=%d, want 1", code, got)
		}
	}

	cosmetic := []driftFinding{finding(diagnostics.CodeGenMirrorDrift, enrichment.Warning)}
	if got := mirrorDriftExitCode(cosmetic, true); got != 0 {
		t.Errorf("enrich-mirror-moved location drift is cosmetic and must not fail even --require-complete; exit=%d, want 0", got)
	}

	mixed := []driftFinding{hygiene(diagnostics.CodeFriendlyTodo), hygiene(diagnostics.CodeFriendlyOrphanField)}
	if got := mirrorDriftExitCode(mixed, false); got != 1 {
		t.Errorf("a stale carcass must fail even when a @todo is present; exit=%d, want 1", got)
	}

	if got := mirrorDriftExitCode(nil, true); got != 0 {
		t.Errorf("clean report must exit 0; exit=%d", got)
	}
}
