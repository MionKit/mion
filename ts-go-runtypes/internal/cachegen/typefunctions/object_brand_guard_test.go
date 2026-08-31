package typefunctions

import "testing"

// objectNeedsBrandGuard is the one decision emitObjectValidate and
// emitObjectValidationErrors share about whether an object node carries the
// `[object Object]` brand guard. The guard is skipped wherever a required
// property already excludes an array on its own, and the fourth argument is what
// makes that judgement honest: a required `length` or `0` does NOT, because
// every array has those.
func TestObjectNeedsBrandGuard(t *testing.T) {
	cases := []struct {
		name                                                          string
		contributing, allOptional, hasIndexSig, hasArrayProofRequired bool
		want                                                          bool
	}{
		{"ordinary required prop does the job", true, false, false, true, false},
		{"required prop is `length`, so it does not", true, false, false, false, true},
		{"all optional", true, true, false, false, true},
		{"index signature", true, false, true, true, true},
		{"nothing contributes", false, false, false, false, true},
		{"both kinds of required prop", true, false, false, true, false},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			got := objectNeedsBrandGuard(testCase.contributing, testCase.allOptional, testCase.hasIndexSig, testCase.hasArrayProofRequired)
			if got != testCase.want {
				t.Errorf("objectNeedsBrandGuard = %v, want %v", got, testCase.want)
			}
		})
	}
}

// arrayCarriesName decides whether a required property's NAME can be relied on
// to exclude an array. Every array has `length` and its numeric indices; nothing
// else is guaranteed.
func TestArrayCarriesName(t *testing.T) {
	carries := []string{"length", "0", "1", "42", "4294967294"}
	for _, name := range carries {
		if !arrayCarriesName(name) {
			t.Errorf("arrayCarriesName(%q) = false, but every array has it", name)
		}
	}
	proof := []string{"a", "name", "length2", "0a", "a0", "_0", "", "-1", "1.5", "id"}
	for _, name := range proof {
		if arrayCarriesName(name) {
			t.Errorf("arrayCarriesName(%q) = true, but an array has no such property", name)
		}
	}
}
