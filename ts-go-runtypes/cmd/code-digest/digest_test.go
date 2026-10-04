package main

import (
	"strings"
	"testing"
)

func mustDigest(t *testing.T, filePath, text string) string {
	t.Helper()
	sum, ok := digest(filePath, text)
	if !ok {
		t.Fatalf("%s fell back to raw:\n%s", filePath, text)
	}
	return sum
}

func TestDigest_IgnoresCommentsAndBlankLines(t *testing.T) {
	for _, pair := range []struct{ name, path, before, after string }{
		{"ts line comment added", "a.ts", "const a = 1;\n", "// why\nconst a = 1; // trailing\n"},
		{"ts block comment edited", "a.ts", "/* one */ export function f(x: number) {\n  return x;\n}\n", "/* two,\n   lines */ export function f(x: number) {\n  return /* inline */ x;\n}\n"},
		{"ts blank lines and spacing", "a.ts", "const a = 1;\nconst b = 2;\n", "const a  =  1;\n\n\n\tconst b = 2;\n"},
		{"ts jsdoc", "a.ts", "export const a = 1;\n", "/** The value. */\nexport const a = 1;\n"},
		{"ts template and regex untouched", "a.ts", "const a = `x${1 /* c */}y`; const r = /a\\/b/g;\n", "const a = `x${1}y`;\nconst r = /a\\/b/g; // r\n"},
		{"ts types", "a.ts", "type A<T> = Array<Array<T>>;\n", "type A<T> = Array<Array<T>>; // nested\n"},
		{"js comment", "a.mjs", "export const a = 1;\n", "// header\n\nexport const a = 1;\n"},
		{"js line comment quoting jsdoc", "a.mjs", "// a /** x */\nexport const a = 1;\n", "// b /** y */\nexport const a = 1;\n"},
		{"go comments", "a.go", "package a\n\nfunc F() int {\n\treturn 1\n}\n", "// Package a.\npackage a\n\n// F returns one.\nfunc F() int {\n\n\treturn 1 // one\n}\n"},
		{"go block comment", "a.go", "package a\nvar x = 1\n", "package a\nvar x = /* c */ 1\n"},
	} {
		t.Run(pair.name, func(t *testing.T) {
			if mustDigest(t, pair.path, pair.before) != mustDigest(t, pair.path, pair.after) {
				t.Fatal("a comment or blank line changed the digest")
			}
		})
	}
}

func TestDigest_SeesCodeChanges(t *testing.T) {
	for _, pair := range []struct{ name, path, before, after string }{
		{"ts token", "a.ts", "const a = 1;\n", "const a = 2;\n"},
		{"ts operator", "a.ts", "const a = -x;\n", "const a = +x;\n"},
		{"ts automatic semicolon", "a.ts", "function f() {\n  return x;\n}\n", "function f() {\n  return\n  x;\n}\n"},
		{"ts comment text in a string", "a.ts", "const a = '// x';\n", "const a = '// y';\n"},
		{"ts comment text in a template", "a.ts", "const a = `/* x */`;\n", "const a = `/* y */`;\n"},
		{"ts comment text in a regex", "a.ts", "const r = /\\/\\*a/;\n", "const r = /\\/\\*b/;\n"},
		{"ts let to const", "a.ts", "let a = 1;\n", "const a = 1;\n"},
		{"js jsdoc type", "a.mjs", "/** @type {number} */\nexport const a = 1;\n", "/** @type {string} */\nexport const a = 1;\n"},
		{"go token", "a.go", "package a\nvar x = 1\n", "package a\nvar x = 2\n"},
		{"go statement split", "a.go", "package a\nfunc f() { a(); b() }\n", "package a\nfunc f() { a(); b(); c() }\n"},
		{"go string", "a.go", "package a\nvar x = \"// a\"\n", "package a\nvar x = \"// b\"\n"},
	} {
		t.Run(pair.name, func(t *testing.T) {
			if mustDigest(t, pair.path, pair.before) == mustDigest(t, pair.path, pair.after) {
				t.Fatal("a code change kept the digest")
			}
		})
	}
}

// Each directive marker changes what some tool does, so adding one must move the digest.
func TestDigest_EveryDirectiveCounts(t *testing.T) {
	for _, entry := range tsDirectives {
		base := "export const a = 1;\n"
		if mustDigest(t, "a.ts", base) == mustDigest(t, "a.ts", "// "+entry.marker+" x\n"+base) {
			t.Errorf("ts directive %q (%s) did not move the digest", entry.marker, entry.reason)
		}
	}
	for _, entry := range goDirectives {
		base := "package a\n\nvar x = 1\n"
		marker := entry.marker
		if !strings.HasPrefix(marker, "//") {
			t.Fatalf("go directive %q is not a line comment", marker)
		}
		if mustDigest(t, "a.go", base) == mustDigest(t, "a.go", base+marker+"x\n") {
			t.Errorf("go directive %q (%s) did not move the digest", marker, entry.reason)
		}
	}
}

func TestDigest_FallsBackToRaw(t *testing.T) {
	for _, probe := range []struct{ name, path, text string }{
		{"ts syntax error", "a.ts", "const a = ;\n"},
		{"js syntax error", "a.mjs", "if (a !== 'b's) {}\n"},
		{"go syntax error", "a.go", "package a\nvar x = \"open\n"},
		{"cgo preamble", "a.go", "package a\n\n// #include <stdio.h>\nimport \"C\"\n"},
		{"go example output", "a_test.go", "package a\n\nfunc ExampleF() {\n\t// Output: 1\n}\n"},
		{"unknown extension", "a.tsx", "export const a = <div />;\n"},
	} {
		t.Run(probe.name, func(t *testing.T) {
			if _, ok := digest(probe.path, probe.text); ok {
				t.Fatal("expected a raw fallback")
			}
		})
	}
}
