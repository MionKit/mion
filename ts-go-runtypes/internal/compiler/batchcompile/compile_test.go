package batchcompile

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	// Register the concrete format emitters — the in-process test never runs
	// main.go, whose blank import normally does this.
	_ "github.com/mionkit/ts-runtypes/internal/cachegen/typefunctions/formats/all"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/compiler/sourcerewrite"
	"github.com/mionkit/ts-runtypes/internal/constants"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/jsengine"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// Minimal ambient marker declaration so `ts-runtypes` resolves in a bare temp
// project (the marker scanner honors the `declare module` form).
const runtypesDTS = `declare module '@ts-runtypes/core' {
  export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
  export function getRunTypeId<T>(value?: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
}
`

const tsconfigJSON = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "rootDir": "src",
    "outDir": "dist",
    "sourceMap": true,
    "strict": true
  },
  "include": ["src"]
}
`

const fooTS = `import {getRunTypeId} from '@ts-runtypes/core';
type User = {id: number; name: string};
export const userId = getRunTypeId<User>();
`

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

// TestCompile_EmitsJsWithComposedMap is the load-bearing integration test: a
// real temp project compiles to .js + a source map, and the map — after
// composing our rewrite map with tsgo's emit map — points at the ORIGINAL .ts
// line, not the import-shifted rewritten line.
func TestCompile_EmitsJsWithComposedMap(t *testing.T) {
	tmp := t.TempDir()
	writeFile(t, filepath.Join(tmp, "tsconfig.json"), tsconfigJSON)
	writeFile(t, filepath.Join(tmp, "src", "runtypes.d.ts"), runtypesDTS)
	writeFile(t, filepath.Join(tmp, "src", "foo.ts"), fooTS)

	result, err := Run(Options{
		Cwd:          tmp,
		TsconfigPath: "tsconfig.json",
		GenDir:       filepath.Join(tmp, "__runtypes"),
		ResolverOpts: resolver.Options{
			Cwd:        tmp,
			EmitMode:   constants.EmitCode,
			ModuleMode: constants.ModuleModeDefault,
			InlineMode: constants.InlineModeDefault,
			CacheDir:   filepath.Join(tmp, ".cache"),
		},
	})
	if err != nil {
		t.Fatalf("compile: %v", err)
	}

	// The .js was emitted (types stripped) with the rewrite applied.
	jsPath := filepath.Join(tmp, "dist", "foo.js")
	jsBytes, err := os.ReadFile(jsPath)
	if err != nil {
		t.Fatalf("read emitted js: %v", err)
	}
	js := string(jsBytes)
	if !strings.Contains(js, "getRunTypeId(") {
		t.Errorf("emitted js missing the call:\n%s", js)
	}
	if !strings.Contains(js, "__rt_") {
		t.Errorf("emitted js missing the injected binding:\n%s", js)
	}
	// rtmod: specifiers must be relativized to the cache dir in the OUTPUT.
	if strings.Contains(js, "rtmod:") {
		t.Errorf("emitted js still has a rtmod: specifier (not relativized):\n%s", js)
	}
	if !strings.Contains(js, "__runtypes/types/") {
		t.Errorf("emitted js import not relativized to the cache dir:\n%s", js)
	}

	// The composed map must resolve to the ORIGINAL foo.ts (3 lines, 0..2), NOT
	// the rewritten source (4 lines — an import line prepended). If composition
	// were missing, a segment would reference original line 3.
	mapBytes, err := os.ReadFile(jsPath + ".map")
	if err != nil {
		t.Fatalf("read emitted map: %v", err)
	}
	var sm protocol.SourceMap
	if err := json.Unmarshal(mapBytes, &sm); err != nil {
		t.Fatalf("parse map: %v", err)
	}
	if len(sm.Sources) != 1 || !strings.HasSuffix(sm.Sources[0], "foo.ts") {
		t.Errorf("map sources = %v, want [..foo.ts]", sm.Sources)
	}
	maxLine, sawCallLine := -1, false
	for _, line := range sourcerewrite.OriginalLines(sm.Mappings) {
		if line > maxLine {
			maxLine = line
		}
		if line == 2 {
			sawCallLine = true
		}
	}
	if maxLine > 2 {
		t.Errorf("composed map references original line %d — composition failed (rewritten line leaked)", maxLine)
	}
	if !sawCallLine {
		t.Errorf("composed map has no segment for the call line (original line 2)")
	}

	// Cache modules were generated to <genDir>/types.
	if len(result.Caches) == 0 {
		t.Errorf("no cache modules generated")
	}
	if entries, _ := os.ReadDir(filepath.Join(tmp, "__runtypes", "types")); len(entries) == 0 {
		t.Errorf("no cache module files written under __runtypes/types")
	}
}

// patternDTS extends the ambient marker module with createValidateFn — a
// FUNCTION-family marker: pattern validation runs inside the format
// emitters, which only render for function-cache demand (a getRunTypeId-only
// file emits zero function entries and would never reach it).
const patternDTS = `declare module '@ts-runtypes/core' {
  export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
  export type CompTimeFnArgs<T> = T & {readonly __rtCompTimeFnArgsBrand?: never};
  export type InjectTypeFnArgs<T, F1 extends string> = string & {readonly __rtInjectTypeFnArgsBrand?: T; readonly __rtInjectTypeFnArgsFns?: [F1]};
  export interface ValidateOptions {noLiterals?: boolean}
  export function getRunTypeId<T>(value?: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
  export function createValidateFn<T>(val?: T, options?: CompTimeFnArgs<ValidateOptions>, id?: InjectTypeFnArgs<T, 'val'>): (v: unknown) => boolean;
}
`

// patternTS declares a stringFormat whose pattern uses a JS-only lookbehind
// and carries a mockSample that does NOT match it. Both marker call shapes
// reference the format (marker coverage rule): static with the type
// argument, reflect with an annotated value.
const patternTS = `import {createValidateFn} from '@ts-runtypes/core';
type TypeFormat<Base, Name extends string, Params> = Base & {
  readonly __rtFormatName?: Name;
  readonly __rtFormatParams?: Params;
};
type Code = TypeFormat<string, 'stringFormat', {
  pattern: {source: '(?<=x)y'; flags: ''; mockSamples: ['nope']};
}>;
export const isCodeStatic = createValidateFn<Code>();
const sample: Code = 'y';
export const isCodeReflect = createValidateFn(sample);
`

// TestCompile_ValidatesJsOnlyPatternSamples pins the headline of the JS-engine
// move: the standalone compile verb — which has no lint lane — now really
// validates samples of patterns RE2 could never compile. Before, this exact
// fixture was unverifiable on this path (fail-closed FMT004, or a silent skip
// under the removed allowUncheckedPatterns); now the mismatching sample is a
// plain FMT001. Runs the real node sidecar; skipped only where none exists.
func TestCompile_ValidatesJsOnlyPatternSamples(t *testing.T) {
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("no node in PATH")
	}
	tmp := t.TempDir()
	writeFile(t, filepath.Join(tmp, "tsconfig.json"), tsconfigJSON)
	writeFile(t, filepath.Join(tmp, "src", "runtypes.d.ts"), patternDTS)
	writeFile(t, filepath.Join(tmp, "src", "pattern.ts"), patternTS)

	result, err := Run(Options{
		Cwd:          tmp,
		TsconfigPath: "tsconfig.json",
		GenDir:       filepath.Join(tmp, "__runtypes"),
		NoEmit:       true,
		ResolverOpts: resolver.Options{
			Cwd:        tmp,
			EmitMode:   constants.EmitCode,
			ModuleMode: constants.ModuleModeDefault,
			InlineMode: constants.InlineModeDefault,
			JSEngine:   jsengine.NewSidecar(""),
		},
	})
	if err != nil {
		t.Fatalf("compile --no-emit: %v", err)
	}
	var fmt001 *diagnostics.Diagnostic
	for i := range result.Diagnostics {
		if result.Diagnostics[i].Code == diagnostics.CodeFMTSampleMismatch {
			fmt001 = &result.Diagnostics[i]
			break
		}
		if result.Diagnostics[i].Code == diagnostics.CodeFMTMissingJsRuntime {
			t.Fatalf("engine should have run (node is present), got FMT004: %+v", result.Diagnostics[i])
		}
	}
	if fmt001 == nil {
		t.Fatalf("expected an %s for the mismatching lookbehind sample, got %+v",
			diagnostics.CodeFMTSampleMismatch, result.Diagnostics)
	}
	if len(fmt001.Args) == 0 || fmt001.Args[0] != "nope" {
		t.Errorf("expected offending sample 'nope' in args, got %+v", fmt001.Args)
	}
}
