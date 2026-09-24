package typefunctions

import "testing"

// TestFamilies_RegistryRoundTrip keeps validate LAST: families render in order, so CrossFamilyValRoots hit the entry memo.
func TestFamilies_RegistryRoundTrip(t *testing.T) {
	// 18 = 13 + the two checkUnknowns validators + the two checkUnionUnknowns validators + restoreFromJsonClone.
	if len(Families) != 18 {
		t.Fatalf("expected 18 type-walking families, got %d", len(Families))
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
