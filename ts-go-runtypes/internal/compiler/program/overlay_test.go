package program

import (
	"slices"
	"testing"

	"github.com/microsoft/typescript-go/shim/vfs/osvfs"
)

// The overlay FS must synthesize the DIRECTORY tree implied by its virtual file
// paths — otherwise node/bundler module resolution can't walk a purely-virtual
// `node_modules/<pkg>/…` (the wasm playground, in-memory scans), and DirectoryExists
// / GetAccessibleEntries fall through to the base OS FS and report the virtual
// package as missing. This is the fix behind the marker package-name gate reading
// overlay-staged packages (see internal/compiler/marker + internal/compiler/resolver/pkgjson_fs_test.go).
func TestOverlayFS_SynthesizesVirtualDirectories(t *testing.T) {
	// Paths under /virtual do not exist on the real disk — everything is overlay-only.
	files := map[string]string{
		"/virtual/node_modules/pkg/package.json": `{"name":"pkg"}`,
		"/virtual/node_modules/pkg/src/index.ts": `export const x = 1;`,
		"/virtual/app.ts":                        `import 'pkg';`,
	}
	fs := newOverlayFS(osvfs.FS(), files)

	// Every ancestor directory of an overlay file is walkable.
	for _, dir := range []string{
		"/virtual",
		"/virtual/node_modules",
		"/virtual/node_modules/pkg",
		"/virtual/node_modules/pkg/src",
	} {
		if !fs.DirectoryExists(dir) {
			t.Errorf("DirectoryExists(%q) = false, want true (synthesized from overlay files)", dir)
		}
	}

	// A directory that no overlay file lives under is NOT reported (nothing on the
	// base disk either) — the synthesis must not over-report.
	if fs.DirectoryExists("/virtual/node_modules/absent") {
		t.Error("DirectoryExists reported a directory with no overlay files under it")
	}

	// Overlay files read back their content; a real path falls through to the base FS.
	if content, ok := fs.ReadFile("/virtual/node_modules/pkg/package.json"); !ok || content != `{"name":"pkg"}` {
		t.Errorf("ReadFile(package.json) = (%q, %v), want the overlay content", content, ok)
	}
	if !fs.FileExists("/virtual/node_modules/pkg/src/index.ts") {
		t.Error("FileExists(overlay file) = false, want true")
	}

	// GetAccessibleEntries lists the immediate virtual children (files + subdirs)
	// so module resolution can enumerate the package directory.
	entries := fs.GetAccessibleEntries("/virtual/node_modules/pkg")
	if !slices.Contains(entries.Files, "package.json") {
		t.Errorf("GetAccessibleEntries.Files = %v, want to contain package.json", entries.Files)
	}
	if !slices.Contains(entries.Directories, "src") {
		t.Errorf("GetAccessibleEntries.Directories = %v, want to contain src", entries.Directories)
	}
}
