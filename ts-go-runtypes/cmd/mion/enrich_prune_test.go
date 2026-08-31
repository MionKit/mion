package main

import (
	"path/filepath"
	"strings"
	"testing"
)

// TestCollectPruneTargets_FileUsedAsIs is the regression for `gen --prune <file>`:
// an explicit mirror-file argument must be pruned directly, never redirected
// through mirrorPath — so a mirror living in a NON-default enrich dir (resolved
// without --gen-dir) still resolves to itself, not to a non-existent
// mirror-of-mirror that yields "0 files".
func TestCollectPruneTargets_FileUsedAsIs(t *testing.T) {
	dir := t.TempDir()
	mirrorFile := filepath.Join(dir, "custom-out", "models", "user.ts")
	writeTestFile(t, mirrorFile, "export const friendlyUser = {};\n")

	got := collectPruneTargets([]string{mirrorFile}, "", "")
	if len(got) != 1 || !strings.HasSuffix(got[0], "custom-out/models/user.ts") {
		t.Fatalf("collectPruneTargets(%q) = %v, want the file itself", mirrorFile, got)
	}
}
