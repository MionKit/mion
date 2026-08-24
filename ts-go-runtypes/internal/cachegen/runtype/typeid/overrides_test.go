package typeid_test

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/cachegen/runtype/typeid"
)

// TestOverrideStructuralKey_DeterministicAndSorted — the `|cfn:…` suffix is
// canonical: family order in the map never changes the output, and each
// (family, hash) pair renders one segment.
func TestOverrideStructuralKey_DeterministicAndSorted(t *testing.T) {
	empty := typeid.OverrideStructuralKey(nil)
	if empty != "" {
		t.Fatalf("nil map: want empty suffix, got %q", empty)
	}

	single := typeid.OverrideStructuralKey(map[string]string{"jsonEncoder": "abc123"})
	if single != "|cfn:jsonEncoder:abc123" {
		t.Fatalf("single: got %q", single)
	}

	// Two different insertion orders of the same families must hash identically.
	a := typeid.OverrideStructuralKey(map[string]string{"jsonEncoder": "h1", "val": "h2"})
	b := typeid.OverrideStructuralKey(map[string]string{"val": "h2", "jsonEncoder": "h1"})
	if a != b {
		t.Fatalf("family order leaked: %q != %q", a, b)
	}
	if a != "|cfn:jsonEncoder:h1|cfn:val:h2" {
		t.Fatalf("multi: got %q", a)
	}
}
