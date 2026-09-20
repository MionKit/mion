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
	for _, strategy := range []string{"clone", "mutate", "compact", ""} {
		keys = append(keys, encodeFamily(strategy), serverDecodeFamily(strategy), clientDecodeFamily(strategy))
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

// TestApiGen_DecodeFamilyPerSide pins why the two differ: the server decodes params
// from any caller, the client a return its own server wrote. The TS copy is
// DECODE_FAMILY_BY_STRATEGY in packages/core/src/constants.ts.
func TestApiGen_DecodeFamilyPerSide(t *testing.T) {
	cases := []struct{ strategy, server, client string }{
		{"clone", "restoreFromJsonClone", "restoreFromJsonClone"},
		{"mutate", "restoreFromJsonMutate", "restoreFromJsonClone"},
		{"compact", "compactFromJson", "compactFromJson"},
		{"", "restoreFromJsonClone", "restoreFromJsonClone"},
	}
	for _, testCase := range cases {
		if got := serverDecodeFamily(testCase.strategy); got != testCase.server {
			t.Errorf("serverDecodeFamily(%q) = %q, want %q", testCase.strategy, got, testCase.server)
		}
		if got := clientDecodeFamily(testCase.strategy); got != testCase.client {
			t.Errorf("clientDecodeFamily(%q) = %q, want %q", testCase.strategy, got, testCase.client)
		}
	}
}
