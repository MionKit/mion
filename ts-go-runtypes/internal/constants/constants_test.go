package constants

import (
	"strings"
	"testing"
)

func TestOptionSubsetsTakeOneValuePerGroup(t *testing.T) {
	for _, table := range [][]ValidateOption{ValidateOptions} {
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
	// T and M are the two non-default numberMode values, so plain, T and M are the only 3 subsets.
	if got := len(OptionSubsets(ValidateOptions)); got != 3 {
		t.Errorf("ValidateOptions subsets = %d, want 3", got)
	}
	for _, subset := range OptionSubsets(ValidateOptions) {
		if suffix := ValidateVariantSuffix(subset); strings.Contains(suffix, "T") && strings.Contains(suffix, "M") {
			t.Errorf("subset %v yields impossible numberMode variant %q", subset, suffix)
		}
	}
}
