package resolver_test

import (
	"path/filepath"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

func codesAt(diags []diagnostics.Diagnostic, code string) []string {
	var files []string
	for _, diagnostic := range diags {
		if diagnostic.Code == code {
			files = append(files, filepath.Base(diagnostic.Site.FilePath))
		}
	}
	return files
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
