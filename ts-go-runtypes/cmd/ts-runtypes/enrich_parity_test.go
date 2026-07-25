package main

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/enrichment/enrichgen"
	"github.com/mionkit/ts-runtypes/internal/enrichment/mirror"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// TestEnrichParity_CLIvsDaemon pins the CLI ≡ daemon contract: the CLI shared-fn
// path (enrichgen.Plan + mirror.Scaffold — what the `enrich` write lane runs) and
// the OpEnrich daemon op must compute BYTE-IDENTICAL mirror files for the same
// type over the same fixture, at the same NON-default hashLength. The non-default
// hashLength (folded into the @rtType hash) is deliberate: it fails loudly if the
// CLI ever stops threading the project hashLength into its resolver, which would
// diverge the two sides' ids. This is the guarantee the plugin-driven sync relies
// on — the daemon produces exactly what the CLI would.
func TestEnrichParity_CLIvsDaemon(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "tsconfig.json"),
		[]byte(`{"compilerOptions":{"plugins":[{"name":"ts-runtypes","genDir":"gen","hashLength":5}]}}`), 0o644); err != nil {
		t.Fatal(err)
	}
	src := filepath.Join(dir, "models.ts")
	if err := os.WriteFile(src, []byte("export interface User { id: number; name: string }\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	absSrc := tspath.NormalizePath(src)

	// The ONE config both sides resolve from (genDir + the non-default hashLength).
	tsconfigPath := resolveConfigPath(dir, "")
	parsed, err := program.ParseInferredConfig(dir, tsconfigPath)
	if err != nil {
		t.Fatalf("parse config: %v", err)
	}
	config := resolveEnrichConfig(absSrc, "", tsconfigPath, parsed)
	if config.HashLength != 5 {
		t.Fatalf("hashLength not threaded from tsconfig: got %d, want 5", config.HashLength)
	}

	cliFiles := enrichParityCLI(t, absSrc, "User", config)
	daemonFiles := enrichParityDaemon(t, dir, tsconfigPath, config.GenDir(), config.HashLength, absSrc)

	if len(cliFiles) == 0 {
		t.Fatal("CLI produced no mirror files")
	}
	if len(cliFiles) != len(daemonFiles) {
		t.Fatalf("mirror count mismatch: CLI %d, daemon %d", len(cliFiles), len(daemonFiles))
	}
	for path, cliContent := range cliFiles {
		daemonContent, ok := daemonFiles[path]
		if !ok {
			t.Errorf("daemon is missing mirror %s", path)
			continue
		}
		if cliContent != daemonContent {
			t.Errorf("content mismatch for %s:\n--- CLI ---\n%s\n--- daemon ---\n%s", path, cliContent, daemonContent)
		}
	}
}

// enrichParityCLI runs the CLI's shared-fn scaffold path: build the inferred
// Program over the source, plan the specs, and Scaffold each from an empty mirror.
func enrichParityCLI(t *testing.T, absSrc, typeName string, config enrichConfig) map[string]string {
	t.Helper()
	prog, res, err := buildProgram(absSrc, config.Parsed, config.HashLength)
	if err != nil {
		t.Fatalf("cli build program: %v", err)
	}
	defer res.Close()
	specs, _, err := enrichgen.Plan(prog, res.Checker(), res.Cache(), absSrc, typeName, "", true, true, config)
	if err != nil {
		t.Fatalf("cli plan: %v", err)
	}
	out := map[string]string{}
	for _, spec := range specs {
		content, _, scaffoldErr := mirror.Scaffold(spec, "")
		if scaffoldErr != nil {
			t.Fatalf("cli scaffold: %v", scaffoldErr)
		}
		out[spec.MirrorPath] = content
	}
	return out
}

// enrichParityDaemon drives an in-process resolver.Session over the same fixture
// (project mode, the same tsconfig + hashLength) and dispatches OpEnrich, returning
// the computed EnrichFiles keyed by path.
func enrichParityDaemon(t *testing.T, dir, tsconfigPath, genDir string, hashLength int, absSrc string) map[string]string {
	t.Helper()
	prog, err := program.New(program.Options{Cwd: dir, TsconfigPath: tsconfigPath})
	if err != nil {
		t.Fatalf("daemon program: %v", err)
	}
	sess, err := resolver.New(prog, resolver.Options{Cwd: dir, TsconfigPath: tsconfigPath, HashLength: hashLength})
	if err != nil {
		t.Fatalf("daemon resolver: %v", err)
	}
	defer sess.Close()

	resp := sess.Dispatch(protocol.Request{
		Op:             protocol.OpEnrich,
		Files:          []string{absSrc},
		TypeName:       "User",
		GenDir:         genDir,
		EnrichFriendly: true,
		EnrichMock:     true,
	})
	if resp.Error != "" {
		t.Fatalf("daemon enrich: %s", resp.Error)
	}
	out := map[string]string{}
	for _, enrichFile := range resp.EnrichFiles {
		out[enrichFile.Path] = enrichFile.Content
	}
	return out
}
