package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestEntryDeclaration: --entry, then package.json "types" or exports["."].types, map to the emitted .d.ts.
func TestEntryDeclaration(t *testing.T) {
	root := t.TempDir()
	declarationDir := filepath.Join(root, ".mion-api-types")
	declarations := map[string]string{
		filepath.Join(declarationDir, "index.d.ts"):        "",
		filepath.Join(declarationDir, "api", "index.d.ts"): "",
		filepath.Join(declarationDir, "api.d.ts"):          "",
	}
	writePackage := func(text string) {
		if err := os.WriteFile(filepath.Join(root, "package.json"), []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	cases := []struct{ name, pkg, flag, want string }{
		{"types", `{"types": "./dist/api.d.ts"}`, "", "api.d.ts"},
		{"nested types", `{"types": "./dist/api/index.d.ts"}`, "", "api/index.d.ts"},
		{"exports types", `{"exports": {".": {"types": "./dist/index.d.ts", "default": "./dist/index.js"}}}`, "", "index.d.ts"},
		{"no hint", `{"name": "x"}`, "", ""},
		{"flag wins", `{"types": "./dist/index.d.ts"}`, "src/api.ts", "api.d.ts"},
	}
	for _, testCase := range cases {
		writePackage(testCase.pkg)
		got, err := entryDeclaration(root, root, declarationDir, declarations, testCase.flag)
		if err != nil {
			t.Fatalf("%s: %v", testCase.name, err)
		}
		want := ""
		if testCase.want != "" {
			want = filepath.Join(declarationDir, filepath.FromSlash(testCase.want))
		}
		if got != want {
			t.Errorf("%s: entry = %q, want %q", testCase.name, got, want)
		}
	}
	if _, err := entryDeclaration(root, root, declarationDir, declarations, "src/missing.ts"); err == nil || !strings.Contains(err.Error(), "matches no emitted declaration") {
		t.Errorf("an --entry with no declaration must fail, got %v", err)
	}
}
