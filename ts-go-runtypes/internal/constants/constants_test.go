package constants

import (
	"strings"
	"testing"
)

func TestOptionSubsetsTakeOneValuePerGroup(t *testing.T) {
	for _, table := range [][]ValidateOption{ValidateOptions, HasUnknownKeysOptions} {
		groupOf := map[string]string{}
		for _, opt := range table {
			groupOf[opt.Name] = opt.Group
		}
		for _, subset := range OptionSubsets(table) {
			seen := map[string]bool{}
			for _, name := range subset {
				group := groupOf[name]
				if group != "" && seen[group] {
					t.Errorf("subset %v sets option group %q twice", subset, group)
				}
				seen[group] = true
			}
		}
	}
}

func TestOptionSubsetsDropOnlyImpossibleCombinations(t *testing.T) {
	// L and A are free, T and M are the two non-default numberMode values: 2*2*3 possible subsets.
	if got := len(OptionSubsets(ValidateOptions)); got != 12 {
		t.Errorf("ValidateOptions subsets = %d, want 12", got)
	}
	if got := len(OptionSubsets(HasUnknownKeysOptions)); got != 2 {
		t.Errorf("HasUnknownKeysOptions subsets = %d, want 2", got)
	}
	for _, subset := range OptionSubsets(ValidateOptions) {
		if suffix := ValidateVariantSuffix(subset); strings.Contains(suffix, "T") && strings.Contains(suffix, "M") {
			t.Errorf("subset %v yields impossible numberMode variant %q", subset, suffix)
		}
	}
}
