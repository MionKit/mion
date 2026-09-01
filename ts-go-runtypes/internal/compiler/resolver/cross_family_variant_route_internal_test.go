package resolver

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
)

// TestFamilyByFnHash_RoutesValidateVariants — the cross-family fixpoint routes a
// missing `<fnHash>_<id>` dep by its fnHash. The validationErrors union arm names
// the validate entry compiled under ITS OWN ValidateOptions, so an
// option-carrying hash has to route to the validate family AND carry the variant
// forward; routing it as a plain root would render the wrong entry and leave the
// named one missing.
func TestFamilyByFnHash_RoutesValidateVariants(t *testing.T) {
	validate, ok := operations.ByName("validate")
	if !ok {
		t.Fatal("no `validate` operation in the registry")
	}
	for _, options := range [][]string{nil, {"noLiterals"}, {"numberTypeof"}, {"noLiterals", "noIsArrayCheck"}} {
		hash := operations.FnHashFor(validate, options, "", false)
		target, routed := familyByFnHash[hash]
		if !routed {
			t.Fatalf("validate variant %v (hash %q) does not route to a family", options, hash)
		}
		if target.spec.Key != "validate" {
			t.Errorf("validate variant %v routed to family %q, want \"validate\"", options, target.spec.Key)
		}
		if want := constants.ValidateVariantSuffix(options); target.variantSuffix != want {
			t.Errorf("validate variant %v routed with suffix %q, want %q", options, target.variantSuffix, want)
		}
	}
}

// TestVariantForFnHash_ReversesEveryMintedHash — the reverse map is only sound if
// it covers the whole closed variant set; mustBeCollisionFree already proves the
// mapping is injective there.
func TestVariantForFnHash_ReversesEveryMintedHash(t *testing.T) {
	for _, variant := range operations.AllFnVariants() {
		got, ok := operations.VariantForFnHash(variant.FnHash)
		if !ok {
			t.Fatalf("fnHash %q (%s %v) has no reverse entry", variant.FnHash, variant.Op.Name, variant.Options)
		}
		if got.Op.Name != variant.Op.Name || got.RejectCircular != variant.RejectCircular {
			t.Errorf("fnHash %q reversed to %s (armed=%v), want %s (armed=%v)", variant.FnHash, got.Op.Name, got.RejectCircular, variant.Op.Name, variant.RejectCircular)
		}
	}
	if _, ok := operations.VariantForFnHash("zzz"); ok {
		t.Error("a non-registry hash must not reverse to a variant")
	}
}
