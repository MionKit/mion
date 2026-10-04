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
	for _, marker := range tsDirectives {
		base := "export const a = 1;\n"
		if mustDigest(t, "a.ts", base) == mustDigest(t, "a.ts", "// "+marker+"x\n"+base) {
			t.Errorf("ts directive %q did not move the digest", marker)
		}
	}
	for _, marker := range goDirectives {
		base := "package a\n\nvar x = 1\n"
		if !strings.HasPrefix(marker, "//") {
			t.Fatalf("go directive %q is not a line comment", marker)
		}
		if mustDigest(t, "a.go", base) == mustDigest(t, "a.go", base+marker+"x\n") {
			t.Errorf("go directive %q did not move the digest", marker)
		}
	}
}

// The tags and directives this repo's own tools read from comments.
func TestDigest_ToolCommentsCount(t *testing.T) {
	for _, pair := range []struct{ name, path, before, after string }{
		{"resolver @nonEnumerable", "a.ts", "class E {\n  declare message?: string;\n}\n", "class E {\n  /** @nonEnumerable */ declare message?: string;\n}\n"},
		{"@mion-expect-error", "a.ts", "f();\n", "// @mion-expect-error marker-any-from-unresolved-name\nf();\n"},
		{"shebang", "a.mjs", "#!/usr/bin/env node\nrun();\n", "#!/usr/bin/env bun\nrun();\n"},
		{"grouped cgo import", "a.go", "package a\n\nimport (\n\t\"C\"\n)\n", "package a\n\nimport (\n\t// #include <x.h>\n\t\"C\"\n)\n"},
	} {
		t.Run(pair.name, func(t *testing.T) {
			before, okBefore := digest(pair.path, pair.before)
			after, okAfter := digest(pair.path, pair.after)
			if okBefore && okAfter && before == after {
				t.Fatal("a comment a tool reads kept the digest")
			}
		})
	}
}

// The digest of a fixed corpus is pinned, so a change to the token rules cannot ship without a toolVersion bump.
func TestDigest_RulesChangeBumpsToolVersion(t *testing.T) {
	// The goldens of the current toolVersion: a rules change moves them, and a new version gets new goldens.
	const goldenVersion = "2"
	corpus := []struct{ path, text, golden string }{
		{"a.ts", "export const a = `x${1}` + /re/g.source; // c\n", "1264c62476f9f66870d04a472885288d3a89cb1bd87c4491fa4c0725978f2243"},
		{"a.mjs", "/** @type {number} */\nexport const a = 1;\n", "02b20481df12b696f64154e75110aefbe30a5070bf17dd0e17fc0696bab7e65d"},
		{"a.go", "package a\n\n//go:generate x\nvar A = 1 // c\n", "07c5fdce42e13784b383a725c912792b4e57f10d0ef5023b66692edc13ce2b04"},
	}
	if toolVersion != goldenVersion {
		t.Fatalf("toolVersion is %s: recompute the goldens below and set goldenVersion to it", toolVersion)
	}
	for _, entry := range corpus {
		if got := mustDigest(t, entry.path, entry.text); got != entry.golden {
			t.Errorf("the digest of %s moved to %s: bump toolVersion in digest.go, then update this golden", entry.path, got)
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
		{"grouped cgo preamble", "a.go", "package a\n\nimport (\n\t// #include <stdio.h>\n\t\"C\"\n)\n"},
		{"unknown extension", "a.tsx", "export const a = <div />;\n"},
	} {
		t.Run(probe.name, func(t *testing.T) {
			if _, ok := digest(probe.path, probe.text); ok {
				t.Fatal("expected a raw fallback")
			}
		})
	}
}
