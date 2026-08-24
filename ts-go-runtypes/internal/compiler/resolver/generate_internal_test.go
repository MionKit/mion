package resolver

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// materializeModules writes new/changed modules and skips byte-identical ones
// so a dev file-watcher is not retriggered for content-addressed modules.
func TestMaterializeModules_WriteOnlyOnChange(t *testing.T) {
	dir := t.TempDir()
	modules := map[string]string{
		"val_Foo1234": "export const __rt_val_Foo1234=1;\n",
		"fns/val":     "export const __rt_fns_val=2;\n",
	}

	written, err := materializeModules(dir, modules)
	if err != nil {
		t.Fatalf("first write: %v", err)
	}
	if len(written) != 2 {
		t.Fatalf("first write should write both modules, wrote %v", written)
	}
	// Slashed basenames nest into subdirs.
	if _, err := os.Stat(filepath.Join(dir, "fns", "val.js")); err != nil {
		t.Fatalf("fns/val.js not written: %v", err)
	}

	// Identical second pass touches nothing.
	written, err = materializeModules(dir, modules)
	if err != nil {
		t.Fatalf("second write: %v", err)
	}
	if len(written) != 0 {
		t.Fatalf("unchanged modules must not be rewritten, got %v", written)
	}

	// Changing one module rewrites only that one.
	modules["val_Foo1234"] = "export const __rt_val_Foo1234=99;\n"
	written, err = materializeModules(dir, modules)
	if err != nil {
		t.Fatalf("third write: %v", err)
	}
	if len(written) != 1 || written[0] != "val_Foo1234" {
		t.Fatalf("only the changed module should be rewritten, got %v", written)
	}
}

// pruneStaleModules removes generated files no longer in the live set and
// leaves live ones untouched.
func TestPruneStaleModules(t *testing.T) {
	dir := t.TempDir()
	live := map[string]string{"keep": "export const __rt_keep=1;\n"}
	if _, err := materializeModules(dir, live); err != nil {
		t.Fatalf("seed: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "stale.js"), []byte("old\n"), 0o644); err != nil {
		t.Fatalf("write stale: %v", err)
	}

	if err := pruneStaleModules(dir, live); err != nil {
		t.Fatalf("prune: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "stale.js")); !os.IsNotExist(err) {
		t.Fatalf("stale.js should have been pruned (err=%v)", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "keep.js")); err != nil {
		t.Fatalf("keep.js should survive prune: %v", err)
	}
}

// TestCommonDir pins the common-ancestor math the srcDir inference rides on.
func TestCommonDir(t *testing.T) {
	cases := []struct {
		name  string
		paths []string
		want  string
	}{
		{"single file", []string{"/p/src/a.ts"}, "/p/src"},
		{"same dir", []string{"/p/src/a.ts", "/p/src/b.ts"}, "/p/src"},
		{"nested", []string{"/p/src/a.ts", "/p/src/sub/b.ts"}, "/p/src"},
		{"split src+test", []string{"/p/src/a.ts", "/p/test/b.ts"}, "/p"},
		{"no shared root beyond fs root", []string{"/a/x.ts", "/b/y.ts"}, ""},
		{"empty", nil, ""},
	}
	for _, tc := range cases {
		if got := commonDir(tc.paths); got != tc.want {
			t.Errorf("%s: commonDir(%v) = %q, want %q", tc.name, tc.paths, got, tc.want)
		}
	}
}

// TestIsWithin pins the rootDir-acceptance guard: a rootDir at or below cwd is
// honored, one above (the tsconfig.test.json `../..` case) is rejected.
func TestIsWithin(t *testing.T) {
	cases := []struct {
		base, target string
		want         bool
	}{
		{"/p", "/p", true},
		{"/p", "/p/src", true},
		{"/p/", "/p/src", true},
		{"/p", "/p/src/deep", true},
		{"/p/pkg", "/p", false},   // rootDir above cwd (../..)
		{"/p", "/other", false},   // sibling
		{"/p", "/p-extra", false}, // prefix-but-not-child
		{"", "/p", false},
	}
	for _, tc := range cases {
		if got := isWithin(tc.base, tc.target); got != tc.want {
			t.Errorf("isWithin(%q, %q) = %v, want %v", tc.base, tc.target, got, tc.want)
		}
	}
}

// TestUnwritableOutDirError pins the read-only/permission classification: a
// permission or read-only-FS failure gets the actionable "writable" guidance
// (files-mode has no virtual fallback), other failures get a plain wrap.
func TestUnwritableOutDirError(t *testing.T) {
	permission := unwritableOutDirError("/out/types", fmt.Errorf("mkdir /out/types: %w", fs.ErrPermission))
	if !strings.Contains(permission.Error(), "writable") {
		t.Errorf("permission error should mention the writable-dir requirement, got: %v", permission)
	}
	readOnly := unwritableOutDirError("/out/types", errors.New("open /out/types/x.js: read-only file system"))
	if !strings.Contains(readOnly.Error(), "writable") {
		t.Errorf("read-only-FS error should mention the writable-dir requirement, got: %v", readOnly)
	}
	generic := unwritableOutDirError("/out/types", errors.New("disk full"))
	if strings.Contains(generic.Error(), "writable") {
		t.Errorf("generic error should NOT claim a writability fix, got: %v", generic)
	}
	if !strings.Contains(generic.Error(), "/out/types") {
		t.Errorf("generic error should still name the dir, got: %v", generic)
	}
}

// TestResolveOutDir_Precedence pins the output-root layering now that it is
// SESSION config rather than a request field: the explicit spawn-time
// Options.GenDir (`serve --gen-dir`, the host plugin's own genDir option) wins,
// else the tsconfig genDir, else the inferred <srcDir>/__runtypes. Relative
// values anchor under the session cwd. Every op that needs the root — generate,
// transform, enrich — reads it through here, so this ordering is the single
// place the lanes can agree or drift.
func TestResolveOutDir_Precedence(t *testing.T) {
	cwd := t.TempDir()
	tests := []struct {
		name           string
		genDir         string
		tsconfigGenDir string
		want           string
	}{
		{"explicit GenDir wins over tsconfig", "/abs/flag", "/abs/tsconfig", "/abs/flag"},
		{"tsconfig used when GenDir unset", "", "/abs/tsconfig", "/abs/tsconfig"},
		{"relative GenDir anchors under cwd", "gen/rt", "/abs/tsconfig", filepath.Join(cwd, "gen/rt")},
		{"relative tsconfig anchors under cwd", "", "gen/ts", filepath.Join(cwd, "gen/ts")},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			sess := &Session{opts: Options{Cwd: cwd, GenDir: test.genDir, TsconfigGenDir: test.tsconfigGenDir}}
			if got := sess.resolveOutDir(); got != test.want {
				t.Errorf("resolveOutDir() = %q, want %q", got, test.want)
			}
		})
	}

	// Neither override set: fall through to the <srcDir>/__runtypes inference.
	// With no Program to infer from, inferSrcDir lands on the session cwd, so
	// the default is observable without building one.
	sess := &Session{opts: Options{Cwd: cwd}}
	if got, want := sess.resolveOutDir(), filepath.Join(cwd, outputDirName); got != want {
		t.Errorf("no override: resolveOutDir() = %q, want the inferred %q", got, want)
	}
}
