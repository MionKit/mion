package resolver_test

import (
	"path/filepath"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// overridePairSources holds an OVR001 pair across two files: a.ts overrides string, b.ts overrides it again.
func overridePairSources() map[string]string {
	return map[string]string{
		"runtypes.d.ts": overrideDTS,
		"a.ts": `import {overrideValidate} from '@mionjs/run-types';
overrideValidate<string>((v) => typeof v === 'string');
`,
		"b.ts": `import {overrideValidate} from '@mionjs/run-types';
overrideValidate<string>((v) => v !== null);
`,
	}
}

func codesAt(diags []diagnostics.Diagnostic, code string) []string {
	var files []string
	for _, diagnostic := range diags {
		if diagnostic.Code == code {
			files = append(files, filepath.Base(diagnostic.Site.FilePath))
		}
	}
	return files
}

// TestScanFiles_ReportsOnlyTheRequestedFilesOverrideFindings: scanning a.ts must not return the OVR001 anchored in
// b.ts, which a linter would otherwise report at a.ts positions.
func TestScanFiles_ReportsOnlyTheRequestedFilesOverrideFindings(t *testing.T) {
	r := setupInline(t, overridePairSources())
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	for _, diagnostic := range resp.Diagnostics {
		if filepath.Base(diagnostic.Site.FilePath) != "a.ts" {
			t.Fatalf("scanFiles(a.ts) returned %s anchored in %s", diagnostic.Code, diagnostic.Site.FilePath)
		}
	}
	both := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"b.ts"}})
	if got := codesAt(both.Diagnostics, diagnostics.CodeDuplicateOverride); len(got) != 1 || got[0] != "b.ts" {
		t.Fatalf("scanFiles(b.ts) must return the OVR001 anchored in b.ts, got %v", got)
	}
}

// TestTransform_ReportsOnlyTheRequestedFilesOverrideFindings: the transform lane filters the same way, so a dev
// server transforming several files prints each override finding once.
func TestTransform_ReportsOnlyTheRequestedFilesOverrideFindings(t *testing.T) {
	r := setupInline(t, overridePairSources())
	resp := r.Dispatch(protocol.Request{Op: protocol.OpTransform, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("transform: %s", resp.Error)
	}
	if got := codesAt(resp.Diagnostics, diagnostics.CodeDuplicateOverride); len(got) != 0 {
		t.Fatalf("transform(a.ts) must not return b.ts's OVR001, got %v", got)
	}
}

// TestGenerate_ReportsOverrideFindings: the build-start report carries OVR001 (RuntimeError) and the kept
// override's OVR010 (Info).
func TestGenerate_ReportsOverrideFindings(t *testing.T) {
	r := setupGen(t, overridePairSources(), t.TempDir())
	resp := r.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if resp.Error != "" {
		t.Fatalf("generate: %s", resp.Error)
	}
	if got := codesAt(resp.Diagnostics, diagnostics.CodeDuplicateOverride); len(got) != 1 || got[0] != "b.ts" {
		t.Fatalf("generate must report the OVR001 once, anchored in b.ts, got %v", got)
	}
	if got := codesAt(resp.Diagnostics, diagnostics.CodeOverrideValidateCrossFamily); len(got) != 1 || got[0] != "a.ts" {
		t.Fatalf("generate must report OVR010 for the kept validate override, got %v", got)
	}
	dump := r.Dispatch(protocol.Request{Op: protocol.OpDump})
	if got := codesAt(dump.Diagnostics, diagnostics.CodeDuplicateOverride); len(got) != 1 {
		t.Fatalf("dump (mion compile --no-emit) must report the OVR001, got %v", got)
	}
}

// generateAfterScanReportsMKR003 scans a.ts first, as a hot update does, then checks generate still reports its
// marker finding once.
func generateAfterScanReportsMKR003(t *testing.T, src string) {
	t.Helper()
	r := setupGen(t, map[string]string{"a.ts": src, "b.ts": "export const b = 1;\n"}, t.TempDir())
	scan := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if got := codesAt(scan.Diagnostics, diagnostics.CodeMarkerFreeTypeParameter); len(got) != 1 {
		t.Fatalf("scanFiles must report MKR003, got %v", got)
	}
	gen := r.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	if got := codesAt(gen.Diagnostics, diagnostics.CodeMarkerFreeTypeParameter); len(got) != 1 {
		t.Fatalf("generate after a scan must still report a.ts's MKR003 once, got %v", got)
	}
}

func TestGenerate_ReportsFilesAScanReachedFirst_TypeFirst(t *testing.T) {
	generateAfterScanReportsMKR003(t, `import {getRunTypeId} from '@mionjs/run-types';
export function describe<T>() { return getRunTypeId<T>(); }
`)
}

func TestGenerate_ReportsFilesAScanReachedFirst_ValueFirst(t *testing.T) {
	generateAfterScanReportsMKR003(t, `import {getRunTypeId} from '@mionjs/run-types';
export function describe<T>(value: T) { return getRunTypeId(value); }
`)
}
