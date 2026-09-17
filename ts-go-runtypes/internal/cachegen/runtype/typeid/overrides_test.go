package typeid_test

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/runtype/typeid"
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
	a := typeid.OverrideStructuralKey(map[string]string{"jsonEncoder": "h1", "validate": "h2"})
	b := typeid.OverrideStructuralKey(map[string]string{"validate": "h2", "jsonEncoder": "h1"})
	if a != b {
		t.Fatalf("family order leaked: %q != %q", a, b)
	}
	if a != "|cfn:jsonEncoder:h1|cfn:validate:h2" {
		t.Fatalf("multi: got %q", a)
	}
}

// TestOverrideStructuralKey_SpeaksOperationNames pins the vocabulary the type id
// folds. Overrides are keyed by the operation NAME, never by the token a marker
// spells, so the public marker vocabulary can be renamed without shifting the id
// of every overridden type (and of every type that contains one). A key that is
// a family tag or a retired short token means that contract slipped.
func TestOverrideStructuralKey_SpeaksOperationNames(t *testing.T) {
	for _, name := range []string{"validate", "validationErrors", "jsonEncoder", "toBinary"} {
		key := typeid.OverrideStructuralKey(map[string]string{name: "h"})
		if want := "|cfn:" + name + ":h"; key != want {
			t.Errorf("OverrideStructuralKey(%q) = %q, want %q", name, key, want)
		}
	}
	// The two vocabularies must stay apart: a short family tag is not an
	// operation name, so it can never be a legitimate override key.
	for _, tag := range []string{"val", "verr", "tb", "pjs"} {
		if _, known := operations.ByName(tag); known {
			t.Errorf("family tag %q resolves as an operation name; the two vocabularies have merged", tag)
		}
	}
}
