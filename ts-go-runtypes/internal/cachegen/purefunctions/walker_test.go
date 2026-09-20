package purefunctions

import (
	"context"
	"sort"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/testfixtures"
)

// testPackageName is the package every overlay fixture belongs to, so an id a
// test asserts reads the same on any machine.
const testPackageName = "@acme/app"

// idPrefix is what every id in an overlay fixture starts with: the package,
// then the separator. The hash half is the body's, so a test never spells it.
const idPrefix = testPackageName + "#"

// entryNamed returns the entry the registration bound to `name` produced. An id
// is a hash of the body that ships, so a test names a registration the way the
// source does and asks the extraction which id it got.
func entryNamed(t *testing.T, entries []Entry, name string) Entry {
	t.Helper()
	for _, entry := range entries {
		if entry.BindingName == name {
			return entry
		}
	}
	t.Fatalf("no registration bound to %q; entries=%+v", name, entries)
	return Entry{}
}

// realMarkerFiles returns the REAL `@mionjs/run-types` package (package.json +
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
	return extractFromOverlayWith(t, files, nil)
}

// extractFromOverlayWith is extractFromOverlay with a hook over the marker
// options the extractor runs under (a test wiring a PureFnBindings resolver).
func extractFromOverlayWith(t *testing.T, files map[string]string, mutate func(*marker.Options)) ([]Entry, []Diagnostic) {
	t.Helper()
	cwd := tspath.NormalizePath(t.TempDir())
	// A package.json at the root gives every fixture file a stable id: the id
	// rule names the package a file belongs to, and a test that asserts one
	// should not be reading a temp directory name.
	overlay := map[string]string{tspath.ResolvePath(cwd, "package.json"): `{"name": "` + testPackageName + `"}`}
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
	markerOpts := marker.WithDefaults(marker.Options{FS: prog.FS})
	if mutate != nil {
		mutate(&markerOpts)
	}
	return ExtractFromProgramCached(typeChecker, markerOpts, prog, abs, nil)
}

func TestExtract_HappyPath_FunctionExpression(t *testing.T) {
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFnFactory} from '@mionjs/run-types/runtime';
export const asJSONString = registerPureFnFactory(function () {
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
	if got.BindingName != "asJSONString" || !strings.HasPrefix(got.ID, idPrefix) {
		t.Errorf("id = %q (bound to %q), want an id under %q", got.ID, got.BindingName, idPrefix)
	}
	if len(got.ParamNames) != 0 {
		t.Errorf("expected empty paramNames, got %v", got.ParamNames)
	}
	if strings.Contains(got.Code, ": string") {
		t.Errorf("inner annotations should be stripped, got code:\n%s", got.Code)
	}
	if _, hash, _ := SplitID(got.ID); len(hash) != bodyHashLength {
		t.Errorf("the id's hash half should be %d chars, got %q", bodyHashLength, hash)
	}
}

func TestExtract_HappyPath_ArrowFunction(t *testing.T) {
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFnFactory} from '@mionjs/run-types/runtime';
export const arrowFn = registerPureFnFactory((jUtils) => {
  return function _fn(x: number) {
    return x;
  };
});`,
	})
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	if len(entries) != 1 || entries[0].BindingName != "arrowFn" {
		t.Fatalf("expected the arrowFn entry, got %+v", entries)
	}
	if entries[0].ParamNames[0] != "jUtils" {
		t.Errorf("expected paramNames=[jUtils], got %v", entries[0].ParamNames)
	}
}

func TestExtract_HappyPath_ArrowExpressionBody(t *testing.T) {
	entries, _ := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFnFactory} from '@mionjs/run-types/runtime';
export const inline = registerPureFnFactory((j) => () => 42);`,
	})
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if !strings.Contains(entries[0].Code, "return") {
		t.Errorf("arrow expression body should be wrapped in return, got:\n%s", entries[0].Code)
	}
}

func TestExtract_NameUnwrapsThroughSatisfies(t *testing.T) {
	// The binding is still the name when the call is wrapped in something with
	// no runtime meaning, which is how an author pins a type on it.
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFnFactory} from '@mionjs/run-types/runtime';
export const wrapped = (registerPureFnFactory(function () { return function () { return 1; }; }) as string);`,
	})
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	if len(entries) != 1 || entries[0].BindingName != "wrapped" {
		t.Fatalf("expected the wrapped entry, got %+v", entries)
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
import {registerPureFnFactory} from '@mionjs/run-types/runtime';
const myFactory = function () { return function inner(x: number) { return x; }; };
export const tracedFn = registerPureFnFactory(myFactory);`,
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
import {registerPureFnFactory} from '@mionjs/run-types/runtime';
function myFactory() { return function inner() { return 1; }; }
export const tracedFnDecl = registerPureFnFactory(myFactory);`,
	})
	if len(entries) != 0 {
		t.Fatalf("expected no entry for a named function-declaration factory (literal-only), got %+v", entries)
	}
	if len(diags) != 0 {
		t.Fatalf("walker must not emit shape diagnostics (those flow through scanCall now), got %+v", diags)
	}
}

func TestExtract_NonInlineFactory_SilentSkip(t *testing.T) {
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFnFactory} from '@mionjs/run-types/runtime';
declare const someFn: () => () => void;
export const fn = registerPureFnFactory(someFn);`,
	})
	if len(entries) != 0 {
		t.Fatalf("expected no entry for non-inline factory, got %+v", entries)
	}
	if len(diags) != 0 {
		t.Fatalf("walker must not emit shape diagnostics (those flow through scanCall now), got %+v", diags)
	}
}

func TestExtract_NonLiteralID_RidesThrough(t *testing.T) {
	// An id argument the build cannot read is a forwarded value, not a mismatch:
	// there is nothing to compare it against, so the registration extracts under
	// its own location and no diagnostic fires.
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFnFactory} from '@mionjs/run-types/runtime';
declare const dynamicId: string;
export const fn = registerPureFnFactory(function () { return function () {}; }, dynamicId);`,
	})
	if len(entries) != 1 || entries[0].BindingName != "fn" {
		t.Fatalf("expected the entry under its own id, got %+v", entries)
	}
	if len(diags) != 0 {
		t.Fatalf("an unreadable id must be a quiet pass-through, got %+v", diags)
	}
}

func TestExtract_DestructuredParam_PFE9005(t *testing.T) {
	_, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFnFactory} from '@mionjs/run-types/runtime';
export const fn = registerPureFnFactory(function ({a, b}) {
  return function() {};
});`,
	})
	if !hasCode(diags, CodeDestructuredParam) {
		t.Fatalf("expected %s diagnostic, got %+v", CodeDestructuredParam, diags)
	}
}

func TestExtract_SameBodyTwiceIsOneEntry(t *testing.T) {
	// Two registrations that ship the same body ARE one function, however many
	// times it was written. The id is the hash of that body, so they land on one
	// entry with nothing to report.
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFnFactory} from '@mionjs/run-types/runtime';
var first = registerPureFnFactory(function () {
  return function _fn() { return 1; };
});
var second = registerPureFnFactory(function () {
  return function _fn() { return 1; };
});`,
	})
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d: %+v", len(entries), entries)
	}
	if len(diags) != 0 {
		t.Errorf("the same function written twice must report nothing, got %+v", diags)
	}
}

func TestExtract_DifferentBodiesGetDifferentIDs(t *testing.T) {
	// The same binding name, two different bodies. A name is not an identity
	// here, so both survive under their own ids.
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFnFactory} from '@mionjs/run-types/runtime';
var asJSONString = registerPureFnFactory(function () {
  return function v1() { return 1; };
});
var asJSONString = registerPureFnFactory(function () {
  return function v2() { return 2; };
});`,
	})
	if len(entries) != 2 {
		t.Fatalf("expected both registrations to survive, got %d: %+v", len(entries), entries)
	}
	if entries[0].ID == entries[1].ID {
		t.Errorf("two different bodies collapsed to one id: %q", entries[0].ID)
	}
	if len(diags) != 0 {
		t.Errorf("two distinct functions must report nothing, got %+v", diags)
	}
}

func TestExtract_DeterministicOrder(t *testing.T) {
	entries, _ := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFnFactory} from '@mionjs/run-types/runtime';
export const zeta = registerPureFnFactory(function () { return function() { return 3; }; });
export const alpha = registerPureFnFactory(function () { return function() { return 1; }; });
export const mu = registerPureFnFactory(function () { return function() { return 2; }; });`,
	})
	if len(entries) != 3 {
		t.Fatalf("expected 3 entries, got %d", len(entries))
	}
	wantOrder := []string{entryNamed(t, entries, "alpha").ID, entryNamed(t, entries, "mu").ID, entryNamed(t, entries, "zeta").ID}
	sort.Strings(wantOrder)
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
import {registerPureFnFactory as regPF} from '@mionjs/run-types/runtime';
export const doubled = regPF(() => (n: number) => n * 2);`,
	})
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	if len(entries) != 1 {
		t.Fatalf("renamed import must still extract: expected 1 entry, got %d", len(entries))
	}
	if entries[0].BindingName != "doubled" || !strings.HasPrefix(entries[0].ID, idPrefix) {
		t.Errorf("id = %q (bound to %q), want an id under %q", entries[0].ID, entries[0].BindingName, idPrefix)
	}
	if _, hash, _ := SplitID(entries[0].ID); len(hash) != bodyHashLength {
		t.Errorf("the id's hash half should be %d chars, got %q", bodyHashLength, hash)
	}
}

func TestExtract_BrandedWrapperCallSite(t *testing.T) {
	// A framework factory whose params carry the SAME brands as
	// registerPureFnFactory: extraction happens at the WRAPPER's call site — the
	// inline factory is right there — while the wrapper's inner forward (a
	// non-inline argument) stays a silent pass-through.
	entries, diags := extractFromOverlay(t, map[string]string{
		"wrapper.ts": `
import {registerPureFnFactory} from '@mionjs/run-types/runtime';
import type {PureFunctionFactory, InjectPureFnId} from '@mionjs/run-types';
type Factory = (utl: unknown) => (...args: any[]) => any;
export function mionPureFn<F extends Factory>(createPureFn: PureFunctionFactory<F> | null, id?: InjectPureFnId<F>) {
  return registerPureFnFactory(createPureFn as never, id as never);
}`,
		"consumer.ts": `
import {mionPureFn} from './wrapper';
export const tripled = mionPureFn(() => (n: number) => n * 3);`,
	})
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	if len(entries) != 1 {
		t.Fatalf("branded wrapper call site must extract: expected 1 entry, got %d", len(entries))
	}
	if entries[0].BindingName != "tripled" || !strings.HasPrefix(entries[0].ID, idPrefix) {
		t.Errorf("id = %q (bound to %q), want the CALL SITE's own id under %q", entries[0].ID, entries[0].BindingName, idPrefix)
	}
	if _, hash, _ := SplitID(entries[0].ID); len(hash) != bodyHashLength {
		t.Errorf("the id's hash half should be %d chars, got %q", bodyHashLength, hash)
	}
}
