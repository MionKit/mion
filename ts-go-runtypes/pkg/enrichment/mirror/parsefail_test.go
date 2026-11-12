package mirror

import (
	"strings"
	"testing"
)

// TestParseMirror_ErrorOnSyntaxError verifies that ParseMirror returns an error
// (never a usable index) on a mirror file the parser rejects (a syntax error →
// non-empty Diagnostics) — the caller never silently appends to or overwrites an
// unparseable file. The fatal/os.Exit lives in the CLI shim now; the pure
// package signals the failure as a returned error.
func TestParseMirror_ErrorOnSyntaxError(t *testing.T) {
	index, err := ParseMirror("/broken.ts", []byte("export const x: = {{{ ;\n"))
	if err == nil {
		t.Fatalf("expected a parse error on broken input; got index=%v", index)
	}
	if index != nil {
		t.Errorf("expected a nil index on parse failure; got %v", index)
	}
	if !strings.Contains(err.Error(), "cannot parse mirror") {
		t.Errorf("expected a 'cannot parse mirror' error; got: %v", err)
	}
}
