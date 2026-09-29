package resolver_test

import (
	"os"
	"path/filepath"
	"regexp"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// sharedThrowSources holds two identical createValidateFn<symbol>() calls, which share one generated validator.
func sharedThrowSources() map[string]string {
	return map[string]string{
		"a.ts": `import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
export const isSymbolA = createValidateFn<symbol>();
export const idStatic = getRunTypeId<{name: string}>();
`,
		"b.ts": `import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
export const isSymbolB = createValidateFn<symbol>();
const sample = {name: 'Ada'};
export const idReflected = getRunTypeId(sample);
`,
	}
}

var throwSiteRE = regexp.MustCompile(`\(at [^)]*\)`)

func throwSitesIn(t *testing.T, outDir string) []string {
	t.Helper()
	var found []string
	_ = filepath.WalkDir(outDir, func(path string, entry os.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return err
		}
		content, readErr := os.ReadFile(path)
		if readErr == nil {
			found = append(found, throwSiteRE.FindAllString(string(content), -1)...)
		}
		return nil
	})
	return found
}

// throwSiteAfterScanning scans firstFile alone first, as a hot update does.
func throwSiteAfterScanning(t *testing.T, firstFile string) string {
	t.Helper()
	outDir := t.TempDir()
	r := setupGen(t, sharedThrowSources(), outDir)
	if resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{firstFile}}); resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if resp := r.Dispatch(protocol.Request{Op: protocol.OpGenerate}); resp.Error != "" {
		t.Fatalf("generate: %s", resp.Error)
	}
	found := throwSitesIn(t, outDir)
	if len(found) != 1 {
		t.Fatalf("expected exactly one runtime error site in the generated modules, got %v", found)
	}
	return found[0]
}

// TestThrowProvenance_StableAcrossScanOrder: the named site must not depend on which file a scan reached first.
func TestThrowProvenance_StableAcrossScanOrder(t *testing.T) {
	fromA := throwSiteAfterScanning(t, "a.ts")
	fromB := throwSiteAfterScanning(t, "b.ts")
	if fromA != fromB {
		t.Fatalf("the named call site changed with scan order: %q vs %q", fromA, fromB)
	}
	if !regexp.MustCompile(`a\.ts:2:\d+, and 1 other call site\)$`).MatchString(fromA) {
		t.Fatalf("expected the a.ts site plus the shared count, got %q", fromA)
	}
}

// TestThrowProvenance_WarmCacheNamesTheLiveSite: after an edit moves the call, a warm build names the new line.
func TestThrowProvenance_WarmCacheNamesTheLiveSite(t *testing.T) {
	cacheDir := t.TempDir()
	build := func(source string) string {
		outDir := t.TempDir()
		r := setupInlineWith(t, map[string]string{"a.ts": source}, func(programOpts *program.Options, resolverOpts *resolver.Options) {
			programOpts.SingleThreaded = true
			resolverOpts.SingleThreaded = true
			resolverOpts.GenDir = outDir
			resolverOpts.TransformRelative = true
			resolverOpts.CacheDir = cacheDir
		})
		if resp := r.Dispatch(protocol.Request{Op: protocol.OpGenerate}); resp.Error != "" {
			t.Fatalf("generate: %s", resp.Error)
		}
		found := throwSitesIn(t, outDir)
		if len(found) != 1 {
			t.Fatalf("expected one runtime error site, got %v", found)
		}
		return found[0]
	}
	const header = "import {createValidateFn, getRunTypeId} from '@mionjs/run-types';\n"
	const rest = "export const isSymbol = createValidateFn<symbol>();\nexport const idStatic = getRunTypeId<{name: string}>();\nconst sample = {name: 'Ada'};\nexport const idReflected = getRunTypeId(sample);\n"
	if cold := build(header + rest); !regexp.MustCompile(`a\.ts:2:`).MatchString(cold) {
		t.Fatalf("cold build: expected line 2, got %q", cold)
	}
	if warm := build(header + "\n\n" + rest); !regexp.MustCompile(`a\.ts:4:`).MatchString(warm) {
		t.Fatalf("warm build after the call moved: expected line 4, got %q", warm)
	}
}
