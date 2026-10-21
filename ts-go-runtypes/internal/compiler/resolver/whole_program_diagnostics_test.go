package resolver_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// overridePairSources holds an override-duplicate pair across two files: a.ts overrides string, b.ts overrides it again.
func overridePairSources() map[string]string {
	return map[string]string{
		"runtypes.d.ts": overrideDTS,
		"a.ts": `import {overrideValidate, getRunTypeId} from '@mionjs/run-types';
overrideValidate<string>((v) => typeof v === 'string');
export const idStatic = getRunTypeId<{name: string}>();
const sample = {name: 'Ada'};
export const idReflected = getRunTypeId(sample);
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

// TestScanFiles_ReportsOnlyTheRequestedFilesOverrideFindings: a linter would report b.ts's override-duplicate at a.ts positions.
func TestScanFiles_ReportsOnlyTheRequestedFilesOverrideFindings(t *testing.T) {
	session := setupInline(t, overridePairSources())
	resp := session.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	for _, diagnostic := range resp.Diagnostics {
		if filepath.Base(diagnostic.Site.FilePath) != "a.ts" {
			t.Fatalf("scanFiles(a.ts) returned %s anchored in %s", diagnostic.Code, diagnostic.Site.FilePath)
		}
	}
	both := session.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"b.ts"}})
	if got := codesAt(both.Diagnostics, diagnostics.CodeDuplicateOverride); len(got) != 1 || got[0] != "b.ts" {
		t.Fatalf("scanFiles(b.ts) must return the override-duplicate anchored in b.ts, got %v", got)
	}
}

// TestTransform_ReportsOnlyTheRequestedFilesOverrideFindings: a dev server transforming several files prints each once.
func TestTransform_ReportsOnlyTheRequestedFilesOverrideFindings(t *testing.T) {
	session := setupInline(t, overridePairSources())
	resp := session.Dispatch(protocol.Request{Op: protocol.OpTransform, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("transform: %s", resp.Error)
	}
	if got := codesAt(resp.Diagnostics, diagnostics.CodeDuplicateOverride); len(got) != 0 {
		t.Fatalf("transform(a.ts) must not return b.ts's override-duplicate, got %v", got)
	}
}

// TestGenerate_ReportsOverrideFindings: override-duplicate (RuntimeError) and the kept override's override-validate-affects-json (Info).
func TestGenerate_ReportsOverrideFindings(t *testing.T) {
	session := setupGen(t, overridePairSources(), t.TempDir())
	resp := session.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if resp.Error != "" {
		t.Fatalf("generate: %s", resp.Error)
	}
	if got := codesAt(resp.Diagnostics, diagnostics.CodeDuplicateOverride); len(got) != 1 || got[0] != "b.ts" {
		t.Fatalf("generate must report the override-duplicate once, anchored in b.ts, got %v", got)
	}
	if got := codesAt(resp.Diagnostics, diagnostics.CodeOverrideValidateCrossFamily); len(got) != 1 || got[0] != "a.ts" {
		t.Fatalf("generate must report override-validate-affects-json for the kept validate override, got %v", got)
	}
	dump := session.Dispatch(protocol.Request{Op: protocol.OpDump})
	if got := codesAt(dump.Diagnostics, diagnostics.CodeDuplicateOverride); len(got) != 1 {
		t.Fatalf("dump (mion compile --no-emit) must report the override-duplicate, got %v", got)
	}
}

// generateAfterScanReportsMarkerInGenericFunction scans a.ts first, as a hot update does.
func generateAfterScanReportsMarkerInGenericFunction(t *testing.T, src string) {
	t.Helper()
	session := setupGen(t, map[string]string{"a.ts": src, "b.ts": "export const b = 1;\n"}, t.TempDir())
	scan := session.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if got := codesAt(scan.Diagnostics, diagnostics.CodeMarkerFreeTypeParameter); len(got) != 1 {
		t.Fatalf("scanFiles must report marker-in-generic-function, got %v", got)
	}
	gen := session.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	if got := codesAt(gen.Diagnostics, diagnostics.CodeMarkerFreeTypeParameter); len(got) != 1 {
		t.Fatalf("generate after a scan must still report a.ts's marker-in-generic-function once, got %v", got)
	}
}

func TestGenerate_ReportsFilesAScanReachedFirst_TypeFirst(t *testing.T) {
	generateAfterScanReportsMarkerInGenericFunction(t, `import {getRunTypeId} from '@mionjs/run-types';
export function describe<T>() { return getRunTypeId<T>(); }
`)
}

func TestGenerate_ReportsFilesAScanReachedFirst_ValueFirst(t *testing.T) {
	generateAfterScanReportsMarkerInGenericFunction(t, `import {getRunTypeId} from '@mionjs/run-types';
export function describe<T>(value: T) { return getRunTypeId(value); }
`)
}

// TestGenerateAndDump_ReportLibSelectionOnce: a lib with no ECMAScript edition is config-lib-missing-base once, at the first program file.
func TestGenerateAndDump_ReportLibSelectionOnce(t *testing.T) {
	source := `import {getRunTypeId} from '@mionjs/run-types';
export const idStatic = getRunTypeId<{name: string}>();
const sample = {name: 'Ada'};
export const idReflected = getRunTypeId(sample);
`
	session := setupInlineWith(t, map[string]string{"a.ts": source}, func(programOpts *program.Options, resolverOpts *resolver.Options) {
		programOpts.SingleThreaded = true
		resolverOpts.SingleThreaded = true
		resolverOpts.GenDir = t.TempDir()
		tsconfig := `{"compilerOptions":{"target":"esnext","module":"esnext","moduleResolution":"bundler","strict":true,"lib":[]}}`
		if err := os.WriteFile(tspath.ResolvePath(programOpts.Cwd, "tsconfig.json"), []byte(tsconfig), 0o644); err != nil {
			t.Fatalf("write tsconfig: %v", err)
		}
		config, err := program.ParseInferredConfig(programOpts.Cwd, "tsconfig.json")
		if err != nil {
			t.Fatalf("ParseInferredConfig: %v", err)
		}
		programOpts.Config = config
	})
	for _, op := range []string{protocol.OpGenerate, protocol.OpDump} {
		resp := session.Dispatch(protocol.Request{Op: op})
		if got := codesAt(resp.Diagnostics, diagnostics.CodeUnsupportedLibSelection); len(got) != 1 {
			t.Fatalf("%s must report config-lib-missing-base once, got %v", op, got)
		}
	}
}
