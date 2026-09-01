package resolver_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// reportSources is the shared program for the report integration tests: both
// pure-fn lanes and both forms, so the emitted report covers the whole matrix.
var reportSources = map[string]string{
	"runtypes.d.ts": anonPureFnDTS,
	"a.ts": `import {registerPureFnFactory, registerAnonymousPureFn} from '@mionjs/run-types';
export const nf = registerPureFnFactory('acme::mul', (utl) => function _mul(x: number, y: number) { return x * y; });
export const ad = registerAnonymousPureFn((n: number): number => n * 2);
`,
}

// setupReport builds a report-enabled inline resolver (PureFnReportWire +
// PureFnReportFile), matching how the plugin forwards `pureFnReport: true`.
func setupReport(t *testing.T, moduleMode string) *resolver.Session {
	t.Helper()
	return setupReportIn(t, moduleMode, t.TempDir())
}

// setupReportIn is setupReport pinned to a caller-chosen output root, for the
// tests that read the generated report back off disk. The root is session
// config (the spawn-time --gen-dir), not a per-request field.
func setupReportIn(t *testing.T, moduleMode, genDir string) *resolver.Session {
	t.Helper()
	return setupInlineWith(t, reportSources, func(programOpts *program.Options, resolverOpts *resolver.Options) {
		programOpts.SingleThreaded = true
		resolverOpts.SingleThreaded = true
		resolverOpts.PureFnReportWire = true
		resolverOpts.PureFnReportFile = true
		resolverOpts.ModuleMode = moduleMode
		resolverOpts.GenDir = genDir
	})
}

// TestPureFnReport_GenerateWritesJsonAndResponse verifies OpGenerate populates
// Response.PureFnSites AND writes the JSON report file, that the file parses
// back to the same records, and that the report file is NOT part of the module
// manifest (it is data, not a module).
func TestPureFnReport_GenerateWritesJsonAndResponse(t *testing.T) {
	outDir := t.TempDir()
	r := setupReportIn(t, "", outDir)
	gen := r.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	if len(gen.PureFnSites) != 2 {
		t.Fatalf("expected 2 report records on the response, got %d: %+v", len(gen.PureFnSites), gen.PureFnSites)
	}

	// The report lives INSIDE types/, alongside the generated cache modules, so
	// it inherits that dir's .gitignore like every other regenerated artifact.
	reportPath := filepath.Join(outDir, "types", "pure-fns-report.json")
	raw, err := os.ReadFile(reportPath)
	if err != nil {
		t.Fatalf("report file not written: %v", err)
	}
	var fromDisk []protocol.PureFnSite
	if err := json.Unmarshal(raw, &fromDisk); err != nil {
		t.Fatalf("report file is not valid JSON: %v", err)
	}
	if len(fromDisk) != len(gen.PureFnSites) {
		t.Fatalf("disk report has %d records, response has %d", len(fromDisk), len(gen.PureFnSites))
	}

	// Keys on disk match the response keys AND the injected registry ids.
	diskKeys := map[string]bool{}
	for _, site := range fromDisk {
		diskKeys[site.Key] = true
		if site.CalleeModule != "@mionjs/run-types" {
			t.Errorf("record %s calleeModule = %q, want @mionjs/run-types", site.Key, site.CalleeModule)
		}
	}
	for _, site := range gen.PureFnSites {
		if !diskKeys[site.Key] {
			t.Errorf("response key %s missing from disk report", site.Key)
		}
	}
	// Named + anonymous both present.
	if !diskKeys["acme::mul"] {
		t.Errorf("named entry acme::mul missing from report keys %v", diskKeys)
	}

	// The report file is DATA, not a generated module — even though it sits
	// inside types/, it never enters the module manifest and is never a `.js`
	// module (so never resolvable as an rtmod:/ specifier nor GC'd by the
	// stale-module prune, which only touches *.js).
	for _, basename := range gen.Generated {
		if basename == "pure-fns-report" || filepath.Base(basename) == "pure-fns-report.json" {
			t.Fatalf("report file leaked into the module manifest: %q", basename)
		}
	}

	// A second generate must succeed (the report file inside types/ is never
	// inspected by the output-dir guard, and the stale-module prune skips it)
	// and rewrite the report.
	gen2 := r.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if gen2.Error != "" {
		t.Fatalf("second generate must succeed with the report file present, got: %s", gen2.Error)
	}
	if _, err := os.Stat(reportPath); err != nil {
		t.Fatalf("report file must survive a second generate (stale-module prune must skip it): %v", err)
	}
}

// TestPureFnReport_LayoutIndependent verifies the report shape (keys) is
// identical across moduleMode while the per-record `module` field carries the
// actual layout: per-entry pf/<ns>/<fn> vs the single `pf` bundle.
func TestPureFnReport_LayoutIndependent(t *testing.T) {
	perEntry := setupReport(t, "").Dispatch(protocol.Request{Op: protocol.OpGenerate})
	bundled := setupReport(t, "allSingle").Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if perEntry.Error != "" || bundled.Error != "" {
		t.Fatalf("generate errors: %q / %q", perEntry.Error, bundled.Error)
	}
	if len(perEntry.PureFnSites) != len(bundled.PureFnSites) {
		t.Fatalf("record count differs across module modes: %d vs %d", len(perEntry.PureFnSites), len(bundled.PureFnSites))
	}
	keyModuleBundled := map[string]string{}
	for _, site := range bundled.PureFnSites {
		keyModuleBundled[site.Key] = site.Module
		if site.Module != "pf" {
			t.Errorf("allSingle: %s module = %q, want pf bundle", site.Key, site.Module)
		}
	}
	for _, site := range perEntry.PureFnSites {
		if _, ok := keyModuleBundled[site.Key]; !ok {
			t.Errorf("key %s present per-entry but missing in allSingle report", site.Key)
		}
		if site.Module == "" || site.Module == "pf" {
			t.Errorf("default mode: %s module = %q, want per-entry pf/<ns>/<fn>", site.Key, site.Module)
		}
	}
}

// TestPureFnReport_ScanDelta verifies OpScanFiles carries the report delta for
// the rescanned files (the plugin's update-lane callback source).
func TestPureFnReport_ScanDelta(t *testing.T) {
	r := setupReport(t, "")
	scan := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if scan.Error != "" {
		t.Fatalf("scanFiles: %s", scan.Error)
	}
	if len(scan.PureFnSites) != 2 {
		t.Fatalf("scan delta expected 2 records for a.ts, got %d: %+v", len(scan.PureFnSites), scan.PureFnSites)
	}
}

// TestPureFnReport_OffByDefault verifies zero cost when the option is off: no
// PureFnSites on the response and no report file written.
func TestPureFnReport_OffByDefault(t *testing.T) {
	// Pin the output root so the "no report file" assertion checks the dir this
	// session actually writes to, rather than passing vacuously.
	outDir := t.TempDir()
	r := setupInlineWith(t, reportSources, func(programOpts *program.Options, resolverOpts *resolver.Options) {
		programOpts.SingleThreaded = true
		resolverOpts.SingleThreaded = true
		resolverOpts.GenDir = outDir
	})
	gen := r.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	if len(gen.PureFnSites) != 0 {
		t.Fatalf("report disabled but response carried %d records", len(gen.PureFnSites))
	}
	if _, err := os.Stat(filepath.Join(outDir, "types", "pure-fns-report.json")); err == nil {
		t.Fatalf("report disabled but file was written")
	}
}
