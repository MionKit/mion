package resolver

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
)

// TestApiGen_EveryHardcodedFamilyResolves guards the one place fn keys are
// written out by hand rather than read off a marker. apiFnSite SKIPS a key it
// cannot resolve, so a typo here would quietly drop a compiled function from
// every generated API method instead of failing anything.
func TestApiGen_EveryHardcodedFamilyResolves(t *testing.T) {
	keys := []string{"validate", "validationErrors", "hasUnknownKeys", "unknownKeyErrors", "formatTransform"}
	for _, strategy := range []string{"clone", "mutate", "direct", "compact", ""} {
		keys = append(keys, encodeFamily(strategy), decodeFamily(strategy))
	}
	for _, fnKey := range keys {
		op, known := operations.ByFnKey(fnKey)
		if !known {
			t.Errorf("apigen names fnKey %q, which resolves to no operation", fnKey)
			continue
		}
		if !op.Public {
			t.Errorf("apigen names fnKey %q, which is not a public operation", fnKey)
		}
	}
}
