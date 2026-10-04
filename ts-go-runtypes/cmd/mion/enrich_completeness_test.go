package main

import (
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
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
	// Completeness codes — an unfilled @todo (enrich-text-todo-left/enrich-mock-todo-left) or a blank value
	// (enrich-text-blank-value/enrich-mock-blank-value): reported by the default check but failing only --require-complete.
	for _, code := range []string{
		diagnostics.CodeFriendlyTodo, diagnostics.CodeMockTodo,
		diagnostics.CodeFriendlyBlankValue, diagnostics.CodeMockBlankValue,
	} {
		incomplete := []diagnostics.Diagnostic{mkEnrichDiag(code)}
		if got := reportEnrichDiagnostics(incomplete, false, false, false); got != 0 {
			t.Errorf("default check must tolerate completeness code %s; exit=%d, want 0", code, got)
		}
		if got := reportEnrichDiagnostics(incomplete, false, true, false); got != 1 {
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
		if got := reportEnrichDiagnostics(wrong, false, false, false); got != 1 {
			t.Errorf("%s must fail the default check; exit=%d, want 1", code, got)
		}
		if got := reportEnrichDiagnostics(wrong, false, true, false); got != 1 {
			t.Errorf("%s must fail under --require-complete; exit=%d, want 1", code, got)
		}
	}

	// A @todo alongside wrong content still fails the default lane (the wrong
	// content drives it) — completeness tolerance never masks a real error.
	mixed := []diagnostics.Diagnostic{mkEnrichDiag(diagnostics.CodeFriendlyTodo), mkEnrichDiag(diagnostics.CodeFriendlyUnknownField)}
	if got := reportEnrichDiagnostics(mixed, false, false, false); got != 1 {
		t.Errorf("a wrong-content error must fail even when a @todo is present; exit=%d, want 1", got)
	}

	// A clean report exits 0 in both lanes.
	if got := reportEnrichDiagnostics(nil, false, true, false); got != 0 {
		t.Errorf("clean report must exit 0; exit=%d", got)
	}
}

// An Info finding (enrich-text-plural-without-count, a plural arm that can never fire) is advice: it fails neither lane.
func TestReportEnrichDiagnostics_InfoNeverFails(t *testing.T) {
	info := []diagnostics.Diagnostic{mkEnrichDiag(diagnostics.CodeFriendlyPluralNoCount)}
	if info[0].Level != diagnostics.LevelInfo {
		t.Fatalf("enrich-text-plural-without-count must be LevelInfo, got %d", info[0].Level)
	}
	for _, requireComplete := range []bool{false, true} {
		for _, asJSON := range []bool{false, true} {
			if got := reportEnrichDiagnostics(info, asJSON, requireComplete, false); got != 0 {
				t.Errorf("an Info finding must not fail (requireComplete=%v json=%v); exit=%d", requireComplete, asJSON, got)
			}
		}
	}
}

func captureReport(t *testing.T, diags []diagnostics.Diagnostic, asJSON, showInfo bool) (stdout, stderr string) {
	t.Helper()
	outRead, outWrite, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	errRead, errWrite, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	savedOut, savedErr := os.Stdout, os.Stderr
	os.Stdout, os.Stderr = outWrite, errWrite
	reportEnrichDiagnostics(diags, asJSON, false, showInfo)
	os.Stdout, os.Stderr = savedOut, savedErr
	outWrite.Close()
	errWrite.Close()
	outBytes, _ := io.ReadAll(outRead)
	errBytes, _ := io.ReadAll(errRead)
	return string(outBytes), string(errBytes)
}

// The text report hides Info and leaves it out of the count; `levels: "all"` shows it; JSON always keeps it.
func TestReportEnrichDiagnostics_TextHidesInfo(t *testing.T) {
	diags := []diagnostics.Diagnostic{mkEnrichDiag(diagnostics.CodeFriendlyPluralNoCount), mkEnrichDiag(diagnostics.CodeFriendlyUnknownField)}

	stdout, stderr := captureReport(t, diags, false, false)
	if strings.Contains(stdout, "enrich-text-plural-without-count") || !strings.Contains(stdout, diagnostics.CodeFriendlyUnknownField) {
		t.Errorf("default text report must hide enrich-text-plural-without-count and keep the error:\n%s", stdout)
	}
	if !strings.Contains(stderr, "1 finding(s)") {
		t.Errorf("the count must leave hidden Info out: %q", stderr)
	}

	stdout, stderr = captureReport(t, diags, false, true)
	if !strings.Contains(stdout, "enrich-text-plural-without-count") || !strings.Contains(stderr, "2 finding(s)") {
		t.Errorf("levels all must show enrich-text-plural-without-count and count it:\n%s%s", stdout, stderr)
	}

	stdout, _ = captureReport(t, diags, true, false)
	if !strings.Contains(stdout, `"enrich-text-plural-without-count"`) {
		t.Errorf("the JSON report must keep Info:\n%s", stdout)
	}
}

// The tsconfig plugin key decides the enrich report's Info, and a wrong value is refused like `mion compile` does.
func TestTsconfigShowInfo(t *testing.T) {
	dir := canonicalTempDir(t)
	cases := []struct {
		name, tsconfig string
		want           bool
		wantErr        bool
	}{
		{"no plugin entry", `{"compilerOptions":{}}`, false, false},
		{"no levels key", `{"compilerOptions":{"plugins":[{"name":"mion"}]}}`, false, false},
		{"levels all", `{"compilerOptions":{"plugins":[{"name":"mion","levels":"all"}]}}`, true, false},
		{"wrong value", `{"compilerOptions":{"plugins":[{"name":"mion","levels":"warning"}]}}`, false, true},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			path := filepath.Join(dir, strings.ReplaceAll(testCase.name, " ", "-")+".json")
			writeTestFile(t, path, testCase.tsconfig)
			got, err := tsconfigShowInfo(path)
			if (err != nil) != testCase.wantErr || got != testCase.want {
				t.Errorf("tsconfigShowInfo = %v, %v; want %v, error %v", got, err, testCase.want, testCase.wantErr)
			}
		})
	}
	if got, err := tsconfigShowInfo(""); got || err != nil {
		t.Errorf("no tsconfig must hide Info: %v, %v", got, err)
	}
}
