package resolver

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// mionGenDirReadme is the genDir README mion wrote before the entries became rows; it must not move a byte.
const mionGenDirReadme = "# RunTypes output\n" +
	"\n" +
	"This folder is managed by RunTypes (the `genDir` option, set in tsconfig\n" +
	"or on the bundler plugin). Everything under it follows convention:\n" +
	"\n" +
	"- `types/`, `api/`, `rpc/` — modules generated on every build. Not committed; do not edit.\n" +
	"- `enriched/` — committed enrichment files: `friendly/` (labels and\n" +
	"  messages), `mock/` (sample data), `i18n/<locale>/` (translations).\n"

func TestGenDir_MionReadmeUnchanged(t *testing.T) {
	outDir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(outDir, typesSubdir), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := EnsureOutputHygiene(outDir, filepath.Join(outDir, typesSubdir)); err != nil {
		t.Fatal(err)
	}
	if got := readFile(t, filepath.Join(outDir, "README.md")); got != mionGenDirReadme {
		t.Fatalf("genDir README drifted:\n%s", got)
	}
	for _, readme := range []string{"types/README.md", "enriched/README.md"} {
		if readFile(t, filepath.Join(outDir, readme)) == "" {
			t.Errorf("%s not written", readme)
		}
	}
}

// The enrich CLI self-documents a genDir that does not exist yet, before any types/: the root README and the
// enriched/ folder must still land, and only the missing types/ fails.
func TestGenDir_HygieneOnAMissingDir(t *testing.T) {
	outDir := filepath.Join(t.TempDir(), "gen")
	if err := EnsureOutputHygiene(outDir, filepath.Join(outDir, typesSubdir)); err == nil {
		t.Fatal("types/ does not exist, so its ignores cannot be written")
	}
	if got := readFile(t, filepath.Join(outDir, "README.md")); got != mionGenDirReadme {
		t.Fatalf("genDir README on a fresh dir:\n%s", got)
	}
	if readFile(t, filepath.Join(outDir, "enriched", "README.md")) == "" {
		t.Fatal("enriched/README.md not written on a fresh dir")
	}
}

func TestGenDir_ExtensionEntry(t *testing.T) {
	withTables(t)
	RegisterGenDirEntry(GenDirEntry{Name: "extra", Dir: true, Owner: "ext", Bullet: "- `extra/` — an extension's output.\n", Readme: "# Extra\n"})
	outDir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(outDir, typesSubdir), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := EnsureOutputHygiene(outDir, filepath.Join(outDir, typesSubdir)); err != nil {
		t.Fatal(err)
	}
	if got := readFile(t, filepath.Join(outDir, "README.md")); got != mionGenDirReadme+"- `extra/` — an extension's output.\n" {
		t.Fatalf("an extension bullet must follow mion's:\n%s", got)
	}
	if readFile(t, filepath.Join(outDir, "extra", "README.md")) != "# Extra\n" {
		t.Fatal("a Dir entry gets its own README")
	}
	if err := ensureOutDirAvailable(outDir); err != nil {
		t.Fatalf("an extension member must be accepted: %v", err)
	}

	if err := os.WriteFile(filepath.Join(outDir, "foreign.txt"), nil, 0o644); err != nil {
		t.Fatal(err)
	}
	err := ensureOutDirAvailable(outDir)
	if err == nil || !strings.Contains(err.Error(), "the extension members `extra/` (ext)") {
		t.Fatalf("the refusal must name the extension members: %v", err)
	}

	RegisterGenDirEntry(GenDirEntry{Name: "extra", Owner: "ext", Replace: true})
	if row := genDirTable.rows["extra"]; row.Dir || row.Bullet != "" {
		t.Fatalf("Replace must swap the row: %+v", row)
	}
	expectRegistryPanic(t, func() { RegisterGenDirEntry(GenDirEntry{Name: "extra"}) })
	expectRegistryPanic(t, func() { RegisterGenDirEntry(GenDirEntry{Name: "absent", Replace: true}) })
}

func readFile(t *testing.T, path string) string {
	t.Helper()
	content, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return string(content)
}
