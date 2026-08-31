package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/enrichment"
	"github.com/mionkit/ts-runtypes/internal/enrichment/mirror"
)

// TestWriteMirrorFile_CreateOnly_IdempotentTodo is the create-only first-gen
// idempotency guard for Task 1: a SECOND create-only write (writeMirrorFile, the
// no --update path) over an already-populated mirror is a no-op (HasExport skip),
// so it never duplicates or re-adds the `@todo`. The first write stamps exactly
// one @todo per const; the re-run leaves the file byte-identical.
func TestWriteMirrorFile_CreateOnly_IdempotentTodo(t *testing.T) {
	dir := t.TempDir()
	mirrorPath := filepath.Join(dir, "models.ts")
	spec := mirror.Spec{
		MirrorPath:   mirrorPath,
		SourceFile:   filepath.Join(dir, "models-src.ts"),
		Out:          mirrorPath, // single-file: skip cross-file import wiring
		WantFriendly: true,
		WantMock:     true,
		Consts: []enrichment.NamedConst{{
			TypeName:    "User",
			FriendlyVar: "friendlyUser",
			MockVar:     "mockUser",
			Friendly:    "{rt$label: ''}",
			Mock:        "{}",
			TypeID:      "uID",
		}},
	}

	if wrote := writeMirrorFile(spec); !wrote {
		t.Fatalf("first create-only write should have written the mirror")
	}
	first, err := os.ReadFile(mirrorPath)
	if err != nil {
		t.Fatalf("read mirror after first write: %v", err)
	}
	if n := strings.Count(string(first), "@todo"); n != 2 {
		t.Errorf("first write should stamp one @todo per const (friendly + mock); got %d:\n%s", n, first)
	}

	// Re-run create-only: every export is already present → HasExport skip → no-op.
	if wrote := writeMirrorFile(spec); wrote {
		t.Errorf("second create-only write must be a no-op (every export already present)")
	}
	second, err := os.ReadFile(mirrorPath)
	if err != nil {
		t.Fatalf("read mirror after second write: %v", err)
	}
	if string(second) != string(first) {
		t.Errorf("create-only re-run must be byte-identical:\n first  = %q\n second = %q", first, second)
	}
	if n := strings.Count(string(second), "@todo"); n != 2 {
		t.Errorf("re-run must not duplicate or re-add @todo; got %d:\n%s", n, second)
	}
}
