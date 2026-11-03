package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestListRootFiles_PrintsTheTsconfigRoots(t *testing.T) {
	dir := t.TempDir()
	for path, content := range map[string]string{
		"tsconfig.json":     `{"compilerOptions": {"rootDir": "src"}, "include": ["src"], "exclude": ["src/**/*.spec.ts"]}`,
		"src/index.ts":      "export const a = 1;\n",
		"src/lib/util.ts":   "export const b = 2;\n",
		"src/index.spec.ts": "export {};\n",
		"other/outside.ts":  "export {};\n",
	} {
		full := filepath.Join(dir, path)
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	var out strings.Builder
	if err := listRootFiles(dir, "tsconfig.json", &out); err != nil {
		t.Fatal(err)
	}
	got := strings.Split(strings.TrimSpace(out.String()), "\n")
	slashDir := filepath.ToSlash(dir)
	want := []string{slashDir + "/src/index.ts", slashDir + "/src/lib/util.ts"}
	if strings.Join(got, "|") != strings.Join(want, "|") {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestListRootFiles_ReportsABadTsconfig(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "tsconfig.json"), []byte(`{"extends": "./missing.json"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	err := listRootFiles(dir, "tsconfig.json", &strings.Builder{})
	if err == nil || !strings.Contains(err.Error(), "missing.json") {
		t.Fatalf("expected the missing extends to be reported, got %v", err)
	}
}
