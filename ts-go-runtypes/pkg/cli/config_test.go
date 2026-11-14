package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/pkg/constants"
)

// TestStripJSONC verifies comment + trailing-comma stripping is string-aware.
func TestStripJSONC(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"line comment", "{\n  // hi\n  \"a\": 1\n}", "{\n  \n  \"a\": 1\n}"},
		{"block comment", "{ /* hi */ \"a\": 1 }", "{  \"a\": 1 }"},
		{"trailing comma object", "{ \"a\": 1, }", "{ \"a\": 1 }"},
		{"trailing comma array", "[ 1, 2, ]", "[ 1, 2 ]"},
		{"slash in string kept", "{ \"a\": \"http://x\" }", "{ \"a\": \"http://x\" }"},
		{"comma in string kept", "{ \"a\": \"x,\" }", "{ \"a\": \"x,\" }"},
		{"escaped quote in string", "{ \"a\": \"x\\\"//\" }", "{ \"a\": \"x\\\"//\" }"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := stripJSONC(test.in); got != test.want {
				t.Errorf("stripJSONC(%q) = %q, want %q", test.in, got, test.want)
			}
		})
	}
}

// mustSymlinkDir links linkPath -> target, skipping the test where the platform
// refuses (Windows without the create-symlink privilege).
func mustSymlinkDir(t *testing.T, target, linkPath string) {
	t.Helper()
	if err := os.Symlink(target, linkPath); err != nil {
		t.Skipf("symlinks unavailable on this platform: %v", err)
	}
}

// TestCanonicalize: mustAbs moves a symlinked path into os.Getwd()'s space, where tsconfig discovery and RootDir live.
// Symlinks resolve on the longest existing prefix, so a not-yet-created `--out-dir` leaf keeps its spelling.
func TestCanonicalize(t *testing.T) {
	base := t.TempDir()
	real := filepath.Join(base, "real")
	mustMkdirAll(t, filepath.Join(real, "src"))
	writeTestFile(t, filepath.Join(real, "src", "models.ts"), "export interface User { id: number }\n")
	link := filepath.Join(base, "link")
	mustSymlinkDir(t, real, link)

	// t.TempDir() can itself sit behind a symlink (macOS hands out /var/folders/...
	// for a $TMPDIR that really is /private/var/folders/...), so the expectations
	// are anchored on the RESOLVED real dir rather than a literal path.
	resolved, err := filepath.EvalSymlinks(real)
	if err != nil {
		t.Fatalf("resolve %s: %v", real, err)
	}

	tests := []struct {
		name string
		in   string
		want string
	}{
		{"existing file through a symlink", filepath.Join(link, "src", "models.ts"), filepath.Join(resolved, "src", "models.ts")},
		{"missing leaf keeps its spelling", filepath.Join(link, "src", "new.ts"), filepath.Join(resolved, "src", "new.ts")},
		{"several missing segments", filepath.Join(link, "src", "a", "b", "c.ts"), filepath.Join(resolved, "src", "a", "b", "c.ts")},
		{"already-real path is a no-op", filepath.Join(resolved, "src", "models.ts"), filepath.Join(resolved, "src", "models.ts")},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := canonicalize(test.in); got != test.want {
				t.Errorf("canonicalize(%q) = %q, want %q", test.in, got, test.want)
			}
		})
	}
}

// canonicalTempDir is t.TempDir() in projectCwd's symlink space; on macOS a raw one is /var/... for /private/var/....
func canonicalTempDir(t *testing.T) string {
	t.Helper()
	dir, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatalf("resolve temp dir: %v", err)
	}
	return dir
}

func writeTestFile(t *testing.T, path, content string) {
	t.Helper()
	mustMkdirAll(t, filepath.Dir(path))
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func mustMkdirAll(t *testing.T, dir string) {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", dir, err)
	}
}

// TestResolveClientRoutes: the flag beats the tsconfig key, and nothing set means bundle.
func TestResolveClientRoutes(t *testing.T) {
	decode := func(raw string) string {
		var plugin tsRuntypesPlugin
		if err := json.Unmarshal([]byte(`{"clientRoutes":`+raw+`}`), &plugin); err != nil {
			t.Fatalf("decode %s: %v", raw, err)
		}
		return plugin.ClientRoutes
	}
	for _, tc := range []struct {
		flag string
		key  string
		want constants.ClientRoutesMode
	}{
		{"", `null`, constants.ClientRoutesBundle},
		{"", `"bundle"`, constants.ClientRoutesBundle},
		{"", `"fetch"`, constants.ClientRoutesFetch},
		{"bundle", `"fetch"`, constants.ClientRoutesBundle},
		{"fetch", `"bundle"`, constants.ClientRoutesFetch},
	} {
		got, ok := resolveClientRoutes(tc.flag, decode(tc.key))
		if !ok || got != tc.want {
			t.Errorf("flag %q, key %s: got %q (ok %v), want %q", tc.flag, tc.key, got, ok, tc.want)
		}
	}
	for _, mode := range []string{"fetched", "all"} {
		if _, ok := resolveClientRoutes(mode, ""); ok {
			t.Errorf("flag %q: an unknown mode is refused", mode)
		}
		if _, ok := resolveClientRoutes("", mode); ok {
			t.Errorf("key %q: an unknown mode is refused", mode)
		}
	}
}

// The tsconfig plugin key decides a report's Info, and a wrong value or a broken tsconfig is refused like
// `mion compile` does.
func TestShowInfo(t *testing.T) {
	dir := canonicalTempDir(t)
	cases := []struct {
		name, tsconfig string
		want           bool
		wantErr        bool
	}{
		{"no plugin entry", `{"compilerOptions":{}}`, false, false},
		{"no levels key", `{"compilerOptions":{"plugins":[{"name":"mion"}]}}`, false, false},
		{"levels all", `{"compilerOptions":{"plugins":[{"name":"mion","levels":"all"}]}}`, true, false},
		{"wrong value", `{"compilerOptions":{"plugins":[{"name":"mion","levels":"warning"}]}}`, false, true},
		{"broken tsconfig", `{"compilerOptions": {`, false, true},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			path := filepath.Join(dir, strings.ReplaceAll(testCase.name, " ", "-")+".json")
			writeTestFile(t, path, testCase.tsconfig)
			got, err := ShowInfo(path)
			if (err != nil) != testCase.wantErr || got != testCase.want {
				t.Errorf("ShowInfo = %v, %v; want %v, error %v", got, err, testCase.want, testCase.wantErr)
			}
		})
	}
	if got, err := ShowInfo(""); got || err != nil {
		t.Errorf("no tsconfig must hide Info: %v, %v", got, err)
	}
}

// convert and drizzle-migrate resolve their project through ResolveProject: an explicit --tsconfig anchors under the
// cwd, else tsc's upward discovery, and the config is parsed once for the Program.
func TestResolveProject(t *testing.T) {
	dir := canonicalTempDir(t)
	writeTestFile(t, filepath.Join(dir, "tsconfig.json"), `{"compilerOptions":{"strict":true},"include":["src"]}`)
	writeTestFile(t, filepath.Join(dir, "custom.json"), `{"compilerOptions":{"strict":false},"include":["src"]}`)
	writeTestFile(t, filepath.Join(dir, "src", "a.ts"), "export const a = 1;\n")
	nested := filepath.Join(dir, "src")
	t.Chdir(nested)

	discovered, parsed := ResolveProject("")
	if discovered != filepath.Join(dir, "tsconfig.json") || parsed == nil {
		t.Fatalf("discovery = %q (%v), want the tsconfig.json above the cwd", discovered, parsed)
	}
	explicit, parsed := ResolveProject("../custom.json")
	if explicit != filepath.Join(nested, "..", "custom.json") || parsed == nil {
		t.Fatalf("explicit = %q (%v), want ../custom.json anchored under the cwd", explicit, parsed)
	}
}
