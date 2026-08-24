package comptimeargs_test

import (
	"context"
	"testing"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/compiler/comptimeargs"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
)

// checkConst builds an inferred program over the overlay, finds the
// `const <name> = <initializer>` declaration in entry.ts, and returns
// CheckLiteral's verdict on that initializer. builderCall is nil — these
// fixtures use plain literals and nested object / array literals, so the
// spread-merge logic is exercised without the resolver's builder-call
// machinery. Crucially NO reflection runs here, so a deliberately
// shape-mismatched reject fixture (an object spread of an array) can't reach
// typeid and crash — that path is the resolver's, not the validator's.
func checkConst(t *testing.T, files map[string]string, name string) comptimeargs.Result {
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
	return comptimeargs.CheckLiteral(typeChecker, initializer, 0, nil)
}

// findConstInitializer walks the file for the first `<name> = <init>`
// variable declaration and returns its initializer node.
func findConstInitializer(root *ast.Node, name string) *ast.Node {
	var found *ast.Node
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil || found != nil {
			return false
		}
		if node.Kind == ast.KindVariableDeclaration {
			declaration := node.AsVariableDeclaration()
			if declaration != nil && declaration.Name() != nil && declaration.Name().Text() == name && declaration.Initializer != nil {
				found = declaration.Initializer
				return false
			}
		}
		node.ForEachChild(visit)
		return false
	}
	root.ForEachChild(visit)
	return found
}

func assertOk(t *testing.T, result comptimeargs.Result, context string) {
	t.Helper()
	if !result.Ok {
		t.Fatalf("%s: expected spread to validate, got kind=%d reason=%q", context, result.Kind, result.Reason)
	}
}

func assertForbidden(t *testing.T, result comptimeargs.Result, context string) {
	t.Helper()
	if result.Ok {
		t.Fatalf("%s: expected rejection, got Ok", context)
	}
	if result.Kind != comptimeargs.FailForbiddenConstruct {
		t.Fatalf("%s: expected FailForbiddenConstruct, got kind=%d reason=%q", context, result.Kind, result.Reason)
	}
}

// TestSpread_ObjectAccepted covers the supported object-spread forms: an
// inline object operand, a same-module `const` fragment, and a nested spread
// (a fragment that itself spreads another fragment).
func TestSpread_ObjectAccepted(t *testing.T) {
	cases := map[string]string{
		"inline": `const target = {...{a: 1}, b: 2};`,
		"const":  `const base = {a: 1}; const target = {...base, b: 2};`,
		"nested": `const inner = {a: 1}; const base = {...inner, b: 2}; const target = {...base, c: 3};`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			assertOk(t, checkConst(t, map[string]string{"entry.ts": body}, "target"), name)
		})
	}
}

// TestSpread_ArrayAccepted is the array analogue — inline and `const` array
// fragments merge cleanly.
func TestSpread_ArrayAccepted(t *testing.T) {
	cases := map[string]string{
		"inline": `const target = [...[1, 2], 3];`,
		"const":  `const base = [1, 2]; const target = [...base, 3];`,
		"nested": `const inner = [1]; const base = [...inner, 2]; const target = [...base, 3];`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			assertOk(t, checkConst(t, map[string]string{"entry.ts": body}, "target"), name)
		})
	}
}

// TestSpread_CrossModuleAccepted pins Decision 2: the operand trace follows
// import aliases, so a fragment imported from another module merges like a
// same-module one.
func TestSpread_CrossModuleAccepted(t *testing.T) {
	files := map[string]string{
		"fragment.ts": `export const base = {a: 1, b: 2};`,
		"entry.ts":    `import {base} from './fragment'; const target = {...base, c: 3};`,
	}
	assertOk(t, checkConst(t, files, "target"), "cross-module object spread")
}

// TestSpread_ShapeMismatchRejected pins Decision 3: an object spread of an
// array `const` (and vice-versa) can't be statically merged in this model and
// is rejected — even though the operand is a perfectly valid `const`.
func TestSpread_ShapeMismatchRejected(t *testing.T) {
	cases := map[string]string{
		"object-spread-of-array": `const list = [1, 2]; const target = {...list, a: 3};`,
		"array-spread-of-object": `const obj = {a: 1}; const target = [...obj, 2];`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			assertForbidden(t, checkConst(t, map[string]string{"entry.ts": body}, "target"), name)
		})
	}
}

// TestSpread_ScalarOperandRejected guards the load-bearing soundness case: a
// scalar `const` IS a valid literal leaf but is NOT a valid spread operand, so
// `{...s}` must be rejected rather than slip through as "a valid literal".
func TestSpread_ScalarOperandRejected(t *testing.T) {
	body := `const s = 'hi'; const target = {...s, a: 1};`
	assertForbidden(t, checkConst(t, map[string]string{"entry.ts": body}, "target"), "scalar spread operand")
}

// TestSpread_DynamicAndNonConstRejected keeps the reject path for operands the
// build can't evaluate: a function-call result and a non-`const` (`let`)
// binding.
func TestSpread_DynamicAndNonConstRejected(t *testing.T) {
	cases := map[string]string{
		"call": `declare function f(): {a: number}; const target = {...f(), b: 1};`,
		"let":  `let base = {a: 1}; const target = {...base, b: 2};`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			assertForbidden(t, checkConst(t, map[string]string{"entry.ts": body}, "target"), name)
		})
	}
}
