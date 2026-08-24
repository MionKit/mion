package comptimeargs_test

import (
	"context"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/compiler/comptimeargs"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
)

// checkConstFunction is the CheckLiteralFunction analogue of checkConst: it
// finds `const <name> = <initializer>` in entry.ts and returns the pure-fn
// shape verdict on that initializer (the node a PureFunction<F> arg would hold).
// Reflection-free, like checkConst.
func checkConstFunction(t *testing.T, files map[string]string, name string) comptimeargs.Result {
	t.Helper()
	cwd := tspath.NormalizePath(t.TempDir())
	overlay := make(map[string]string, len(files))
	abs := make([]string, 0, len(files))
	for rel, source := range files {
		path := tspath.ResolvePath(cwd, rel)
		overlay[path] = source
		abs = append(abs, path)
	}
	prog, err := program.NewInferred(program.Options{Cwd: cwd, SingleThreaded: true, Overlay: overlay}, abs)
	if err != nil {
		t.Fatalf("program.NewInferred: %v", err)
	}
	typeChecker, release := prog.TS.GetTypeChecker(context.Background())
	t.Cleanup(func() {
		if release != nil {
			release()
		}
	})
	entry := prog.SourceFile(tspath.ResolvePath(cwd, "entry.ts"))
	if entry == nil {
		t.Fatalf("entry.ts not found in program")
	}
	initializer := findConstInitializer(entry.AsNode(), name)
	if initializer == nil {
		t.Fatalf("const %q with an initializer not found in entry.ts", name)
	}
	_, result := comptimeargs.CheckLiteralFunction(typeChecker, initializer)
	return result
}

func assertResultOk(t *testing.T, result comptimeargs.Result, context string) {
	t.Helper()
	if !result.Ok {
		t.Fatalf("%s: expected Ok, got kind=%d reason=%q", context, result.Kind, result.Reason)
	}
}

func assertWidened(t *testing.T, result comptimeargs.Result, context string) {
	t.Helper()
	if result.Ok {
		t.Fatalf("%s: expected FailWidenedConst, got Ok", context)
	}
	if result.Kind != comptimeargs.FailWidenedConst {
		t.Fatalf("%s: expected FailWidenedConst, got kind=%d reason=%q", context, result.Kind, result.Reason)
	}
}

func assertNotLiteral(t *testing.T, result comptimeargs.Result, context string) {
	t.Helper()
	if result.Ok {
		t.Fatalf("%s: expected FailNonLiteral, got Ok", context)
	}
	if result.Kind != comptimeargs.FailNonLiteral {
		t.Fatalf("%s: expected FailNonLiteral, got kind=%d reason=%q", context, result.Kind, result.Reason)
	}
}

func assertExternalHandle(t *testing.T, result comptimeargs.Result, context string) {
	t.Helper()
	if result.Ok {
		t.Fatalf("%s: expected FailExternalHandle, got Ok", context)
	}
	if result.Kind != comptimeargs.FailExternalHandle {
		t.Fatalf("%s: expected FailExternalHandle, got kind=%d reason=%q", context, result.Kind, result.Reason)
	}
}

// --- Decision 1: cross-module whole-const args + the `as const` guard ---

// TestWholeConst_CrossModuleAccepted proves a WHOLE imported `const` (not just a
// spread fragment) resolves cross-module when it is declared `as const`, mirroring
// the spread trace's import-alias follow.
func TestWholeConst_CrossModuleAccepted(t *testing.T) {
	files := map[string]string{
		"lib.ts":   `export const preset = {strategy: 'mutate'} as const;`,
		"entry.ts": `import {preset} from './lib'; const target = preset;`,
	}
	assertResultOk(t, checkConst(t, files, "target"), "cross-module whole-const (as const)")
}

// TestWholeConst_AsConstAccepted is the same-module twin: an `as const` object
// keeps its literal value types and validates.
func TestWholeConst_AsConstAccepted(t *testing.T) {
	body := `const preset = {strategy: 'mutate', size: 5} as const; const target = preset;`
	assertResultOk(t, checkConst(t, map[string]string{"entry.ts": body}, "target"), "same-module as const")
}

// TestWholeConst_WidenedRejected pins the user-requested hardening: a `const`
// object whose primitive members widened (no `as const`, or an explicit widening
// annotation) is rejected with CTA004 — same-module and cross-module.
func TestWholeConst_WidenedRejected(t *testing.T) {
	cases := map[string]map[string]string{
		"same-module-no-as-const": {"entry.ts": `const preset = {strategy: 'mutate'}; const target = preset;`},
		"annotated-widened":       {"entry.ts": `const preset: {strategy: string} = {strategy: 'mutate'}; const target = preset;`},
		"cross-module-no-as-const": {
			"lib.ts":   `export const preset = {strategy: 'mutate'};`,
			"entry.ts": `import {preset} from './lib'; const target = preset;`,
		},
	}
	for name, files := range cases {
		t.Run(name, func(t *testing.T) {
			assertWidened(t, checkConst(t, files, "target"), name)
		})
	}
}

// --- Part 2: PureFunction<F> "no external handle" rule ---

// TestPureFn_InlineAccepted: under literal-only the accepted forms are an inline
// arrow and an inline function expression (modulo wrappers) — nothing else.
func TestPureFn_InlineAccepted(t *testing.T) {
	cases := map[string]string{
		"inline-arrow":    `const target = (v: unknown) => typeof v === 'string';`,
		"inline-function": `const target = function (v: unknown) { return typeof v === 'string'; };`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			assertResultOk(t, checkConstFunction(t, map[string]string{"entry.ts": body}, "target"), name)
		})
	}
}

// TestPureFn_NamedLocalRejected: even a module-private `const` / `function`
// reference is rejected (PFN001) — literal-only means the function must be
// inline so there is no named handle anything else could reach.
func TestPureFn_NamedLocalRejected(t *testing.T) {
	cases := map[string]string{
		"local-const-arrow": `const f = (v: unknown) => typeof v === 'string'; const target = f;`,
		"local-function":    `function f(v: unknown) { return typeof v === 'string'; } const target = f;`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			assertNotLiteral(t, checkConstFunction(t, map[string]string{"entry.ts": body}, "target"), name)
		})
	}
}

// TestPureFn_ExportedRejected is the new restriction: an EXPORTED pure-fn literal
// (in any form — inline export, exported function, or a separate `export {f}`)
// is reachable as a value, so it is rejected with PFN002.
func TestPureFn_ExportedRejected(t *testing.T) {
	cases := map[string]string{
		"export-const-arrow": `export const f = (v: unknown) => typeof v === 'string'; const target = f;`,
		"export-function":    `export function f(v: unknown) { return typeof v === 'string'; } const target = f;`,
		"export-statement":   `const f = (v: unknown) => typeof v === 'string'; export {f}; const target = f;`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			assertExternalHandle(t, checkConstFunction(t, map[string]string{"entry.ts": body}, "target"), name)
		})
	}
}

// TestPureFn_ImportedRejected pins the other half of the rule: an IMPORTED pure-fn
// is rejected (PFN002) — the AOT-compiled copy must be the only callable one.
func TestPureFn_ImportedRejected(t *testing.T) {
	files := map[string]string{
		"lib.ts":   `export const f = (v: unknown) => typeof v === 'string';`,
		"entry.ts": `import {f} from './lib'; const target = f;`,
	}
	assertExternalHandle(t, checkConstFunction(t, files, "target"), "imported pure-fn")
}
