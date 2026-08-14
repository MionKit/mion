package program

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/core"
)

func writeConfigFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

// TestDiscoverTsconfig — the shared tsc-style discovery every lane uses:
// explicit path aside, the nearest tsconfig.json in cwd or any ancestor wins,
// and "" means none exists anywhere (mirroring tsgo's own findConfigFile).
func TestDiscoverTsconfig(t *testing.T) {
	root := t.TempDir()
	nested := filepath.Join(root, "packages", "app", "src")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}

	if got := DiscoverTsconfig(nested); got != "" {
		t.Errorf("no config anywhere should discover nothing; got %q", got)
	}

	writeConfigFile(t, filepath.Join(root, "tsconfig.json"), `{}`)
	want := filepath.ToSlash(filepath.Join(root, "tsconfig.json"))
	if got := DiscoverTsconfig(nested); got != want {
		t.Errorf("ancestor walk should find the root config; got %q, want %q", got, want)
	}

	writeConfigFile(t, filepath.Join(nested, "tsconfig.json"), `{}`)
	want = filepath.ToSlash(filepath.Join(nested, "tsconfig.json"))
	if got := DiscoverTsconfig(nested); got != want {
		t.Errorf("nearest config wins; got %q, want %q", got, want)
	}
}

// TestParseInferredConfig_NoPathIsNilNil — no tsconfig named means no config
// and no error: the caller falls back to the fixed inferred defaults (tsc's
// loose-file posture).
func TestParseInferredConfig_NoPathIsNilNil(t *testing.T) {
	inferredConfig, err := ParseInferredConfig(t.TempDir(), "")
	if inferredConfig != nil || err != nil {
		t.Fatalf("ParseInferredConfig(cwd, \"\") = (%v, %v), want (nil, nil)", inferredConfig, err)
	}
}

// TestParseInferredConfig_MissingNamedConfigErrors — a NAMED config that does
// not exist is an error (strict like tsc), never a silent fallback.
func TestParseInferredConfig_MissingNamedConfigErrors(t *testing.T) {
	inferredConfig, err := ParseInferredConfig(t.TempDir(), "tsconfig.json")
	if err == nil || inferredConfig != nil {
		t.Fatalf("missing named tsconfig must error; got (%v, %v)", inferredConfig, err)
	}
	if !strings.Contains(err.Error(), "tsconfig not found") {
		t.Errorf("error should name the missing config; got %q", err)
	}
}

// TestParseInferredConfig_BrokenConfigErrors — a named config that fails to
// parse errors, carrying tsgo's own diagnostic.
func TestParseInferredConfig_BrokenConfigErrors(t *testing.T) {
	dir := t.TempDir()
	writeConfigFile(t, filepath.Join(dir, "tsconfig.json"), `this is not json at all {{{`)

	inferredConfig, err := ParseInferredConfig(dir, "tsconfig.json")
	if err == nil || inferredConfig != nil {
		t.Fatalf("broken tsconfig must error; got (%v, %v)", inferredConfig, err)
	}
	if !strings.Contains(err.Error(), "tsconfig parse failed") {
		t.Errorf("error should carry the parse diagnostic; got %q", err)
	}
}

// TestNew_BrokenTsconfigErrors — the build lane rejects a config whose CONTENT
// is broken, not just a missing file: syntax/validation diagnostics ride the
// ParsedCommandLine, and New must read them (it used to check only the
// file-read diagnostics, silently building default-options Programs from
// garbage configs).
func TestNew_BrokenTsconfigErrors(t *testing.T) {
	dir := t.TempDir()
	writeConfigFile(t, filepath.Join(dir, "tsconfig.json"), `this is not json at all {{{`)
	writeConfigFile(t, filepath.Join(dir, "main.ts"), "export const answer = 42;\n")

	prog, err := New(Options{Cwd: dir, TsconfigPath: "tsconfig.json", SingleThreaded: true})
	if err == nil {
		t.Fatalf("New over a garbage tsconfig must error; got a Program (%v)", prog)
	}
	if !strings.Contains(err.Error(), "tsconfig parse failed") {
		t.Errorf("error should carry the parse diagnostic; got %q", err)
	}
}

// TestNewInferred_AdoptsOptionsWholesale — with a parsed config, the FULL
// CompilerOptions govern the Program (module: node16 honored, strict flags off
// when the config says so): full parity with the build lane, nothing kept fixed.
func TestNewInferred_AdoptsOptionsWholesale(t *testing.T) {
	dir := t.TempDir()
	writeConfigFile(t, filepath.Join(dir, "tsconfig.json"), `{
		"compilerOptions": {
			"module": "node16",
			"moduleResolution": "node16",
			"target": "ES2020",
			"strict": false,
			"customConditions": []
		}
	}`)
	sourcePath := filepath.Join(dir, "main.ts")
	writeConfigFile(t, sourcePath, "export const answer = 42;\n")

	inferredConfig, err := ParseInferredConfig(dir, "tsconfig.json")
	if err != nil {
		t.Fatalf("ParseInferredConfig: %v", err)
	}
	prog, err := NewInferred(Options{Cwd: dir, Config: inferredConfig, SingleThreaded: true}, []string{sourcePath})
	if err != nil {
		t.Fatalf("NewInferred: %v", err)
	}
	options := prog.TS.Options()
	if options != inferredConfig.options {
		t.Errorf("Program must alias the frozen parsed options pointer (tsgo's LSP pattern); got a different pointer")
	}
	if options.Module != core.ModuleKindNode16 {
		t.Errorf("Module = %v, want Node16 — the config was not adopted wholesale", options.Module)
	}
	if options.Target != core.ScriptTargetES2020 {
		t.Errorf("Target = %v, want ES2020", options.Target)
	}
	if options.Strict == core.TSTrue || options.StrictNullChecks == core.TSTrue {
		t.Errorf("strict:false in the config must not be overridden by the old hardcoded strict flags")
	}
}

// TestNewInferred_FallbackLiteralWithoutConfig — with no config anywhere the
// fixed bundler-style defaults still apply, and Options.Conditions feeds them.
func TestNewInferred_FallbackLiteralWithoutConfig(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "main.ts")
	writeConfigFile(t, sourcePath, "export const answer = 42;\n")

	prog, err := NewInferred(Options{Cwd: dir, Conditions: []string{"source"}, SingleThreaded: true}, []string{sourcePath})
	if err != nil {
		t.Fatalf("NewInferred: %v", err)
	}
	options := prog.TS.Options()
	if options.Module != core.ModuleKindESNext || options.ModuleResolution != core.ModuleResolutionKindBundler {
		t.Errorf("no-config fallback must keep the fixed bundler-style literal; got module=%v resolution=%v", options.Module, options.ModuleResolution)
	}
	if len(options.CustomConditions) != 1 || options.CustomConditions[0] != "source" {
		t.Errorf("Options.Conditions must feed the fallback literal; got %v", options.CustomConditions)
	}
}

// TestParseInferredConfig_ExtraConditionsCloneNotMutate — extras are folded on
// a Clone(); the bare parse of the same file keeps its own CustomConditions
// untouched, so the shared no-extras pointer is never mutated.
func TestParseInferredConfig_ExtraConditionsCloneNotMutate(t *testing.T) {
	dir := t.TempDir()
	writeConfigFile(t, filepath.Join(dir, "tsconfig.json"), `{
		"compilerOptions": {"customConditions": ["dev"]}
	}`)

	bare, err := ParseInferredConfig(dir, "tsconfig.json")
	if err != nil {
		t.Fatalf("ParseInferredConfig (bare): %v", err)
	}
	withExtras, err := ParseInferredConfig(dir, "tsconfig.json", "source")
	if err != nil {
		t.Fatalf("ParseInferredConfig (extras): %v", err)
	}

	if got := bare.options.CustomConditions; len(got) != 1 || got[0] != "dev" {
		t.Errorf("bare parse CustomConditions mutated: %v, want [dev]", got)
	}
	want := []string{"source", "dev"}
	got := withExtras.options.CustomConditions
	if len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Errorf("extras merge = %v, want %v (extras first, then the config's own)", got, want)
	}
	if bare.options == withExtras.options {
		t.Errorf("extras must fold on a Clone(), not on the shared parsed pointer")
	}
}

// TestParseInferredConfig_CarriesFileNames — the parse keeps the config's
// include-resolved file list (the set tsc itself roots), and
// DeclarationFileNames filters it to the `.d.ts` members the daemon lanes
// union into their roots. Both accessors are nil-safe for the no-config case.
func TestParseInferredConfig_CarriesFileNames(t *testing.T) {
	dir := t.TempDir()
	writeConfigFile(t, filepath.Join(dir, "tsconfig.json"), `{
		"compilerOptions": {"strict": true}
	}`)
	writeConfigFile(t, filepath.Join(dir, "main.ts"), "export const a = 1;\n")
	writeConfigFile(t, filepath.Join(dir, "ambient.d.ts"), "declare interface Ambient { a: string }\n")

	inferredConfig, err := ParseInferredConfig(dir, "tsconfig.json")
	if err != nil {
		t.Fatalf("ParseInferredConfig: %v", err)
	}
	fileNames := inferredConfig.FileNames()
	if len(fileNames) != 2 {
		t.Fatalf("FileNames should carry the config's include-resolved list; got %v", fileNames)
	}
	joined := strings.Join(fileNames, " ")
	if !strings.Contains(joined, "main.ts") || !strings.Contains(joined, "ambient.d.ts") {
		t.Errorf("FileNames should list both project files; got %v", fileNames)
	}

	declarationFiles := inferredConfig.DeclarationFileNames()
	if len(declarationFiles) != 1 || !strings.HasSuffix(declarationFiles[0], "ambient.d.ts") {
		t.Errorf("DeclarationFileNames should keep only the .d.ts members; got %v", declarationFiles)
	}

	var nilConfig *InferredConfig
	if nilConfig.FileNames() != nil || nilConfig.DeclarationFileNames() != nil {
		t.Errorf("nil handle accessors must return nil (the no-config posture)")
	}
}

// TestUnionRoots — dedupes against the base, preserves order, and leaves the
// base untouched when the extras add nothing.
func TestUnionRoots(t *testing.T) {
	base := []string{"/p/a.ts", "/p/b.ts"}
	got := UnionRoots(base, []string{"/p/b.ts", "/p/ambient.d.ts", "/p/a.ts"})
	want := []string{"/p/a.ts", "/p/b.ts", "/p/ambient.d.ts"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Errorf("UnionRoots = %v, want %v", got, want)
	}
	same := []string{"/p/a.ts"}
	if got := UnionRoots(same, nil); len(got) != 1 || got[0] != "/p/a.ts" {
		t.Errorf("empty extras must be a no-op; got %v", got)
	}
	if got := UnionRoots(nil, []string{"/p/only.d.ts"}); len(got) != 1 || got[0] != "/p/only.d.ts" {
		t.Errorf("nil base takes the extras; got %v", got)
	}
}
