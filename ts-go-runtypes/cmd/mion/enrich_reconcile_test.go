package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/enrichment/mirror"
)

// TestUpdate_FatalOnUnparseableFile drives the parse-failure fatal through the
// full gen --update CLI path on a real broken mirror file, confirming the binary
// refuses to touch it. updateMirrorFile (the CLI shim) calls fatal() (os.Exit)
// when mirror.Reconcile returns a parse error, so the assertion runs in a
// re-exec'd subprocess.
func TestUpdate_FatalOnUnparseableFile(t *testing.T) {
	if os.Getenv("RT_UPDATEFAIL_CHILD") == "1" {
		updateMirrorFile(mirror.Spec{
			MirrorPath:   os.Getenv("RT_UPDATEFAIL_PATH"),
			WantFriendly: true,
		})
		return // unreachable if fatal fired
	}

	dir := t.TempDir()
	mirrorPath := filepath.Join(dir, "mirror.ts")
	if err := os.WriteFile(mirrorPath, []byte("export const friendlyUser: FriendlyType<User> = {{{ ;\n"), 0o644); err != nil {
		t.Fatalf("seed broken mirror: %v", err)
	}

	cmd := exec.Command(os.Args[0], "-test.run=TestUpdate_FatalOnUnparseableFile")
	cmd.Env = append(os.Environ(), "RT_UPDATEFAIL_CHILD=1", "RT_UPDATEFAIL_PATH="+mirrorPath)
	output, err := cmd.CombinedOutput()
	if exitErr, ok := err.(*exec.ExitError); !ok || exitErr.ExitCode() == 0 {
		t.Fatalf("expected fatal non-zero exit; err=%v output:\n%s", err, output)
	}
	if !strings.Contains(string(output), "cannot parse mirror") {
		t.Errorf("expected 'cannot parse mirror'; got:\n%s", output)
	}
	// The broken file must be left untouched.
	after, _ := os.ReadFile(mirrorPath)
	if !strings.Contains(string(after), "{{{") {
		t.Errorf("the unparseable mirror was modified; got:\n%s", after)
	}
}

// TestAtomicWriteFile_ReplacesCleanly verifies the mirror write flips the file
// old->new with the requested permissions and leaves no temp residue — the
// property the racing-reconcile path (an HMR save and a format-on-save firing
// together) depends on so no reader ever observes a torn/half-written mirror.
func TestAtomicWriteFile_ReplacesCleanly(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "model.ts")

	if err := atomicWriteFile(path, []byte("first\n"), 0o644); err != nil {
		t.Fatalf("first write: %v", err)
	}
	assertMirrorFile(t, path, "first\n", 0o644)

	// Overwrite with longer content: the file must hold the new bytes whole, never
	// a mix of old and new.
	if err := atomicWriteFile(path, []byte("second-and-longer\n"), 0o644); err != nil {
		t.Fatalf("overwrite: %v", err)
	}
	assertMirrorFile(t, path, "second-and-longer\n", 0o644)

	// The temp file must be renamed away, never left behind.
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("readdir: %v", err)
	}
	for _, entry := range entries {
		if strings.Contains(entry.Name(), ".tmp") {
			t.Errorf("atomicWriteFile left a temp file behind: %s", entry.Name())
		}
	}
	if len(entries) != 1 {
		t.Errorf("expected exactly one file in the dir, got %d", len(entries))
	}
}

func assertMirrorFile(t *testing.T, path, want string, perm os.FileMode) {
	t.Helper()
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	if string(got) != want {
		t.Errorf("content = %q, want %q", got, want)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat %s: %v", path, err)
	}
	if info.Mode().Perm() != perm {
		t.Errorf("perm = %o, want %o", info.Mode().Perm(), perm)
	}
}
