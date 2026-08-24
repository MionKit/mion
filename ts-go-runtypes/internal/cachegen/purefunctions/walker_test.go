package purefunctions

import (
	"context"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/compiler/marker"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/testfixtures"
)

// realMarkerFiles returns the REAL `@ts-runtypes/core` package (package.json +
// built dist .d.ts tree) as node_modules-relative overlay entries, so the
// marker-driven discovery in walker.go recognises register* calls in test
// fixtures exactly the way it recognises them in real consumer code — no
// hand-written stand-in to drift.
func realMarkerFiles(t *testing.T) map[string]string {
	t.Helper()
	files, err := testfixtures.RealMarkerPackage()
	if err != nil {
		t.Fatalf("real marker package unavailable: %v", err)
	}
	return files
}

func extractFromOverlay(t *testing.T, files map[string]string) ([]Entry, []Diagnostic) {
	t.Helper()
	cwd := tspath.NormalizePath(t.TempDir())
	overlay := map[string]string{}
	abs := []string{}
	for name, source := range files {
		path := tspath.ResolvePath(cwd, name)
		overlay[path] = source
		abs = append(abs, path)
	}
	// Overlay the real marker package; never a root (module resolution pulls
	// it in), so the caller's first file stays at abs[0] (some tests index in).
	for rel, content := range realMarkerFiles(t) {
		overlay[tspath.ResolvePath(cwd, rel)] = content
	}
	prog, err := program.NewInferred(program.Options{
		Cwd:            cwd,
		SingleThreaded: true,
		Overlay:        overlay,
	}, abs)
	if err != nil {
		t.Fatalf("program.NewInferred: %v", err)
	}
	typeChecker, releaseLease := prog.TS.GetTypeChecker(context.Background())
	if typeChecker == nil {
		t.Fatalf("program.TS.GetTypeChecker returned nil")
	}
	t.Cleanup(func() {
		if releaseLease != nil {
			releaseLease()
		}
	})
	return ExtractFromProgramCached(typeChecker, marker.WithDefaults(marker.Options{FS: prog.FS}), prog, abs, nil)
}

func TestExtract_HappyPath_FunctionExpression(t *testing.T) {
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFnFactory} from '@ts-runtypes/core';
export const cpf = registerPureFnFactory('rt::asJSONString', function () {
  return function _stringify(s: string): string {
    return JSON.stringify(s);
  };
});`,
	})
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	got := entries[0]
	if got.Namespace != "rt" || got.FunctionName != "asJSONString" {
		t.Errorf("unexpected key: ns=%q fn=%q", got.Namespace, got.FunctionName)
	}
	if len(got.ParamNames) != 0 {
		t.Errorf("expected empty paramNames, got %v", got.ParamNames)
	}
	if strings.Contains(got.Code, ": string") {
		t.Errorf("inner annotations should be stripped, got code:\n%s", got.Code)
	}
	if len(got.BodyHash) != bodyHashLength {
		t.Errorf("bodyHash should be %d chars, got %q", bodyHashLength, got.BodyHash)
	}
}

func TestExtract_HappyPath_ArrowFunction(t *testing.T) {
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFnFactory} from '@ts-runtypes/core';
export const cpf = registerPureFnFactory('test::arrowFn', (jUtils) => {
  return function _fn(x: number) {
    return x;
  };
});`,
	})
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	if len(entries) != 1 || entries[0].FunctionName != "arrowFn" {
		t.Fatalf("expected arrowFn entry, got %+v", entries)
	}
	if entries[0].ParamNames[0] != "jUtils" {
		t.Errorf("expected paramNames=[jUtils], got %v", entries[0].ParamNames)
	}
}

func TestExtract_HappyPath_ArrowExpressionBody(t *testing.T) {
	entries, _ := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFnFactory} from '@ts-runtypes/core';
export const cpf = registerPureFnFactory('t::inline', (j) => () => 42);`,
	})
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if !strings.Contains(entries[0].Code, "return") {
		t.Errorf("arrow expression body should be wrapped in return, got:\n%s", entries[0].Code)
	}
}

func TestExtract_TracedIdConst(t *testing.T) {
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFnFactory} from '@ts-runtypes/core';
const ID = 'rt::foo';
export const cpf = registerPureFnFactory(ID, function () { return function() {}; });`,
	})
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	if len(entries) != 1 || entries[0].Namespace != "rt" || entries[0].FunctionName != "foo" {
		t.Fatalf("expected traced id, got entries=%+v", entries)
	}
}

// Under the literal-only PureFunction rule a named factory reference — a
// module-private `const f = function(){…}` or a `function f(){}` declaration —
// is no longer a valid pure-fn: the build extracts and AOT-compiles the body, so
// the literal must be inline at the call site. The walker silently skips these
// (the marker layer emits PFN001 via scanCall), so no entry is extracted and the
// walker emits no diagnostic.

func TestExtract_NamedConstFactory_SilentSkip(t *testing.T) {
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFnFactory} from '@ts-runtypes/core';
const myFactory = function () { return function inner(x: number) { return x; }; };
export const cpf = registerPureFnFactory('rt::tracedFn', myFactory);`,
	})
	if len(entries) != 0 {
		t.Fatalf("expected no entry for a named const factory (literal-only), got %+v", entries)
	}
	if len(diags) != 0 {
		t.Fatalf("walker must not emit shape diagnostics (those flow through scanCall now), got %+v", diags)
	}
}

func TestExtract_NamedFunctionDeclFactory_SilentSkip(t *testing.T) {
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFnFactory} from '@ts-runtypes/core';
function myFactory() { return function inner() { return 1; }; }
export const cpf = registerPureFnFactory('rt::tracedFnDecl', myFactory);`,
	})
	if len(entries) != 0 {
		t.Fatalf("expected no entry for a named function-declaration factory (literal-only), got %+v", entries)
	}
	if len(diags) != 0 {
		t.Fatalf("walker must not emit shape diagnostics (those flow through scanCall now), got %+v", diags)
	}
}

// The PFE9001 / PFE9002 / PFE9003 codes were retired with the marker
// migration — the walker no longer emits shape diagnostics. Their
// replacements (CTA001 for a non-literal id, PFN001 for a non-inline
// factory) flow through resolver.scanCall now. The two tests below pin
// the walker's silent-skip behaviour for each shape failure: the entry
// must not be extracted and no walker diagnostic must be emitted (the
// marker layer would emit one if scanCall ran).

func TestExtract_NonLiteralId_SilentSkip(t *testing.T) {
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFnFactory} from '@ts-runtypes/core';
export const cpf = registerPureFnFactory(getId(), function () { return function() {}; });
declare function getId(): string;`,
	})
	if len(entries) != 0 {
		t.Fatalf("expected no entry for non-literal id, got %+v", entries)
	}
	if len(diags) != 0 {
		t.Fatalf("walker must not emit shape diagnostics (those flow through scanCall now), got %+v", diags)
	}
}

func TestExtract_NonInlineFactory_SilentSkip(t *testing.T) {
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFnFactory} from '@ts-runtypes/core';
declare const someFn: () => () => void;
export const cpf = registerPureFnFactory('rt::fn', someFn);`,
	})
	if len(entries) != 0 {
		t.Fatalf("expected no entry for non-inline factory, got %+v", entries)
	}
	if len(diags) != 0 {
		t.Fatalf("walker must not emit shape diagnostics (those flow through scanCall now), got %+v", diags)
	}
}

func TestExtract_DestructuredParam_PFE9005(t *testing.T) {
	_, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFnFactory} from '@ts-runtypes/core';
export const cpf = registerPureFnFactory('rt::fn', function ({a, b}) {
  return function() {};
});`,
	})
	if !hasCode(diags, CodeDestructuredParam) {
		t.Fatalf("expected %s diagnostic, got %+v", CodeDestructuredParam, diags)
	}
}

func TestExtract_BodyHashCollision_PFE9004(t *testing.T) {
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFnFactory} from '@ts-runtypes/core';
export const a = registerPureFnFactory('rt::asJSONString', function () {
  return function v1() { return 1; };
});`,
		"b.ts": `
import {registerPureFnFactory} from '@ts-runtypes/core';
export const b = registerPureFnFactory('rt::asJSONString', function () {
  return function v2() { return 2; };
});`,
	})
	if len(entries) != 1 {
		t.Fatalf("expected 1 (first-wins) entry, got %d", len(entries))
	}
	if !hasCode(diags, CodeBodyHashCollision) {
		t.Fatalf("expected %s diagnostic, got %+v", CodeBodyHashCollision, diags)
	}
	// Related site must be populated and point at the winner's file.
	for _, diag := range diags {
		if diag.Code == CodeBodyHashCollision {
			if len(diag.Related) != 1 {
				t.Fatalf("expected 1 Related site, got %d", len(diag.Related))
			}
			if diag.Related[0].FilePath == diag.Site.FilePath {
				t.Errorf("Related site should point at a different file from the conflict")
			}
		}
	}
}

func TestExtract_IdempotentSameBodyHash_NoDiagnostic(t *testing.T) {
	// Same key + same body in two files → silent dedupe (no diagnostic).
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFnFactory} from '@ts-runtypes/core';
export const a = registerPureFnFactory('rt::sameFn', function () {
  return function _fn() { return 1; };
});`,
		"b.ts": `
import {registerPureFnFactory} from '@ts-runtypes/core';
export const b = registerPureFnFactory('rt::sameFn', function () {
  return function _fn() { return 1; };
});`,
	})
	if len(entries) != 1 {
		t.Fatalf("expected 1 deduped entry, got %d", len(entries))
	}
	for _, diag := range diags {
		if diag.Code == CodeBodyHashCollision {
			t.Errorf("idempotent re-registration must not emit a collision diagnostic, got %+v", diag)
		}
	}
}

func TestExtract_DeterministicOrder(t *testing.T) {
	entries, _ := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFnFactory} from '@ts-runtypes/core';
export const a = registerPureFnFactory('z::zeta', function () { return function() {}; });
export const b = registerPureFnFactory('a::alpha', function () { return function() {}; });
export const c = registerPureFnFactory('m::mu', function () { return function() {}; });`,
	})
	if len(entries) != 3 {
		t.Fatalf("expected 3 entries, got %d", len(entries))
	}
	wantOrder := []string{"a::alpha", "m::mu", "z::zeta"}
	for i, e := range entries {
		if e.Key() != wantOrder[i] {
			t.Fatalf("entry %d: got %q, want %q", i, e.Key(), wantOrder[i])
		}
	}
}

func hasCode(diags []Diagnostic, code string) bool {
	for _, diag := range diags {
		if diag.Code == code {
			return true
		}
	}
	return false
}

func TestExtract_RenamedImport(t *testing.T) {
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFnFactory as regPF} from '@ts-runtypes/core';
export const cpf = regPF('mionjs::doubled', () => (n: number) => n * 2);`,
	})
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	if len(entries) != 1 {
		t.Fatalf("renamed import must still extract: expected 1 entry, got %d", len(entries))
	}
	if entries[0].Namespace != "mionjs" || entries[0].FunctionName != "doubled" {
		t.Errorf("unexpected key: ns=%q fn=%q", entries[0].Namespace, entries[0].FunctionName)
	}
	if len(entries[0].BodyHash) != bodyHashLength {
		t.Errorf("bodyHash should be %d chars, got %q", bodyHashLength, entries[0].BodyHash)
	}
}

func TestExtract_BrandedWrapperCallSite(t *testing.T) {
	// A framework factory (mion's shape) whose params carry the SAME brands as
	// registerPureFnFactory: extraction happens at the WRAPPER's call site — the
	// id literal + inline factory are right there — while the wrapper's inner
	// forward (non-literal args) stays a silent pass-through.
	entries, diags := extractFromOverlay(t, map[string]string{
		"wrapper.ts": `
import {registerPureFnFactory} from '@ts-runtypes/core';
import type {CompTimeArgs, PureFunctionFactory, PureFnId} from '@ts-runtypes/core';
type Factory = (utl: unknown) => (...args: any[]) => any;
export function mionPureFn<F extends Factory>(pureFnId: CompTimeArgs<PureFnId>, createPureFn: PureFunctionFactory<F> | null) {
  return registerPureFnFactory(pureFnId, createPureFn as never);
}`,
		"consumer.ts": `
import {mionPureFn} from './wrapper';
export const cpf = mionPureFn('mionjs::tripled', () => (n: number) => n * 3);`,
	})
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	if len(entries) != 1 {
		t.Fatalf("branded wrapper call site must extract: expected 1 entry, got %d", len(entries))
	}
	if entries[0].Namespace != "mionjs" || entries[0].FunctionName != "tripled" {
		t.Errorf("unexpected key: ns=%q fn=%q", entries[0].Namespace, entries[0].FunctionName)
	}
	if len(entries[0].BodyHash) != bodyHashLength {
		t.Errorf("bodyHash should be %d chars, got %q", bodyHashLength, entries[0].BodyHash)
	}
}
