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

// parityMarkerOverlay fakes the marker package (the ambient declare-module form
// the marker scanner honors) so the daemon's scan can DEMAND the fixture type —
// the demand-scoped path is the only daemon lane since the protocol slim-down
// (the wire carries files; the session carries config).
const parityMarkerOverlay = `declare module '@mionjs/run-types' {
  export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
  export function getRunTypeId<T>(value?: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
}
`

// parityMain demands User through BOTH getRunTypeId call shapes (the marker
// test-coverage rule): static (caller supplies T) and value-first reflection
// (T inferred from the value). Both resolve to the same demanded type name.
const parityMain = `import {getRunTypeId} from '@mionjs/run-types';
import type {User} from './models';
export const idStatic = getRunTypeId<User>();
const someUser: User = {id: 1, name: 'ada'};
export const idValue = getRunTypeId(someUser);
`

// TestEnrichParity_CLIvsDaemon pins the CLI ≡ daemon contract: the CLI shared-fn
// path (enrichgen.Plan + mirror.Scaffold — what the `enrich` write lane runs) and
// the OpEnrich daemon op must compute BYTE-IDENTICAL mirror files for the same
// type over the same fixture, at the same NON-default hashLength. The non-default
// hashLength (folded into the @rtType hash) is deliberate: it fails loudly if the
// CLI ever stops threading the project hashLength into its resolver, which would
// diverge the two sides' ids. The daemon side runs the shipping demand-scoped
// lane: a marker call in main.ts demands User, an OpScanFiles populates the
// session's demand set, and OpEnrich carries ONLY the target file — families and
// the output root are session config (resolver.Options), never wire fields.
func TestEnrichParity_CLIvsDaemon(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "tsconfig.json"),
		[]byte(`{"compilerOptions":{"plugins":[{"name":"ts-runtypes","genDir":"gen","hashLength":5}]}}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "rt-overlay.d.ts"), []byte(parityMarkerOverlay), 0o644); err != nil {
		t.Fatal(err)
	}
	src := filepath.Join(dir, "models.ts")
	if err := os.WriteFile(src, []byte("export interface User { id: number; name: string }\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	main := filepath.Join(dir, "main.ts")
	if err := os.WriteFile(main, []byte(parityMain), 0o644); err != nil {
		t.Fatal(err)
	}
	absSrc := tspath.NormalizePath(src)
	absMain := tspath.NormalizePath(main)

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
	daemonFiles := enrichParityDaemon(t, dir, tsconfigPath, config.GenDir(), config.HashLength, absSrc, absMain)

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
// (project mode, the same tsconfig + hashLength; the output root as session
// config), scans the marker file so User is DEMANDED, then dispatches the
// files-only OpEnrich and returns the computed EnrichFiles keyed by path.
func enrichParityDaemon(t *testing.T, dir, tsconfigPath, genDir string, hashLength int, absSrc, absMain string) map[string]string {
	t.Helper()
	prog, err := program.New(program.Options{Cwd: dir, TsconfigPath: tsconfigPath})
	if err != nil {
		t.Fatalf("daemon program: %v", err)
	}
	sess, err := resolver.New(prog, resolver.Options{Cwd: dir, TsconfigPath: tsconfigPath, HashLength: hashLength, GenDir: genDir})
	if err != nil {
		t.Fatalf("daemon resolver: %v", err)
	}
	defer sess.Close()

	// Populate the session's demand set: the marker scan is what makes User a
	// demanded type name (the daemon enriches demanded ∩ exported, nothing else).
	scanResp := sess.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{absMain}})
	if scanResp.Error != "" {
		t.Fatalf("daemon scan: %s", scanResp.Error)
	}

	resp := sess.Dispatch(protocol.Request{Op: protocol.OpEnrich, Files: []string{absSrc}})
	if resp.Error != "" {
		t.Fatalf("daemon enrich: %s", resp.Error)
	}
	out := map[string]string{}
	for _, enrichFile := range resp.EnrichFiles {
		out[enrichFile.Path] = enrichFile.Content
	}
	return out
}
