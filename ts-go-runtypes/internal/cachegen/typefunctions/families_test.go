package typefunctions

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// TestFamilies_RegistryRoundTrip — every registry row resolves a real
// CacheModules entry, FamilyByKey round-trips it, and validate stays the
// LAST row (the dispatcher renders families in registry order so the
// CrossFamilyValRoots collection passes hit the per-dispatch entry memo).
func TestFamilies_RegistryRoundTrip(t *testing.T) {
	// 19 = 17 + the two fused validator families (validateStrict /
	// validationErrorsStrict) behind `{checkUnknowns: true}`.
	if len(Families) != 19 {
		t.Fatalf("expected 19 type-walking families, got %d", len(Families))
	}
	for _, spec := range Families {
		if spec.Settings.Tag == "" {
			t.Fatalf("family %q resolved empty settings — CacheModules key drift", spec.Key)
		}
		if FamilyByKey(spec.Key).Settings.Tag != spec.Settings.Tag {
			t.Fatalf("FamilyByKey(%q) returned a different family", spec.Key)
		}
	}
	if last := Families[len(Families)-1].Key; last != "validate" {
		t.Fatalf("validate must be the LAST registry row, got %q", last)
	}
}

// TestAddedFormatTransform_GatesOnTransform — the resolver's
// AddedFormatTransform signal must use the transform-gated
// AnyFormatTransformSupported predicate, NOT FamilySpec.AnySupported:
// FormatTransformEmitter.Supports is true for every runtype (identity is
// a valid transform), which would fire the HMR signal on every scan.
func TestAddedFormatTransform_GatesOnTransform(t *testing.T) {
	plainString := []*reflection.RunType{{ID: "x", Kind: reflection.KindString}}
	if AnyFormatTransformSupported(plainString) {
		t.Fatalf("plain string runtype must not trip the formatTransform added-gate")
	}
	// Precondition the special case exists for: the generic registry pass
	// accepts everything. If this ever flips, the dispatch.go override can go.
	if !FamilyByKey("formatTransform").AnySupported(plainString) {
		t.Fatalf("generic AnySupported no longer accepts everything — revisit the added-gate special case")
	}
}
