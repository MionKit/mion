package regexsafety

import "testing"

func TestCheckFlagsExponentialShapes(t *testing.T) {
	cases := []struct {
		name    string
		source  string
		flags   string
		wantHit bool
	}{
		// The shapes the check exists for.
		{"nested plus", `^(a+)+$`, "", true},
		{"nested star", `^(a*)*$`, "", true},
		{"nested star inside plus", `(\d*)+$`, "", true},
		{"identical alternatives", `^(a|a)*b$`, "", true},
		{"overlapping classes", `^(\w|\d)+$`, "", true},
		{"overlapping ranges", `^([a-z]|[a-c])*x$`, "", true},
		{"optional body", `^(a?)+$`, "", true},
		{"empty alternative", `^(a|)+$`, "", true},
		{"nested inside group chain", `^x(?:(?:b+)+)y$`, "", true},
		{"overlap only under folding", `^(a|A)+$`, "i", true},

		// Shapes that look alarming and are not.
		{"plain plus", `^[a-z]+$`, "", false},
		{"plain star", `^\d*$`, "", false},
		{"two char group", `^(ab)+$`, "", false},
		{"disjoint alternatives", `^(?:a|b)+$`, "", false},
		{"disjoint classes", `^(?:[a-m]|[n-z])+$`, "", false},
		{"no overlap without folding", `^(a|A)+$`, "", false},
		{"fixed bounded body", `^(?:[a-z]{4})+$`, "", false},
		{"bounded label, the shape the domain formats use", `^(?:[a-z](?:[a-z-]{0,61}[a-z])?\.)+[a-z]{2,63}$`, "", false},
		{"separated loops", `^(?:[a-z]+\.)+[a-z]{2,6}$`, "", false},
		{"anchored alternation", `^(?:foo|bar|baz)$`, "", false},
		{"lookahead body is checked", `^(?=(a+)+$)\w+$`, "", true},
		{"safe lookahead", `^(?=.{1,8}$)[a-z]+$`, "", false},
		{"backreference is not assumed to overlap", `^(\w+)-\1$`, "", false},
		{"escapes and classes parse", `^[\w.\-+]{1,64}@[\d\p{L}]+$`, "u", false},
		{"unicode property class", `^[\p{L}\p{N}]+$`, "u", false},
		{"named group", `^(?<word>[a-z]+)$`, "", false},
		{"lazy quantifier is no safer", `^(a+?)+$`, "", true},
		// A bounded body with room to stretch splits an input more than
		// one way just like an open one: `aaaa` is 4, or 2 and 2.
		{"stretchy bounded body", `^(?:[a-z]{2,4})+$`, "", true},
		{"stretchy bounded body, short form", `^(a{1,10})+$`, "", true},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			finding, found := Check(testCase.source, testCase.flags)
			if found != testCase.wantHit {
				t.Fatalf("Check(%q, %q) = %v (%q), want hit %v", testCase.source, testCase.flags, found, finding.Reason, testCase.wantHit)
			}
			if found && finding.Excerpt == "" {
				t.Fatalf("Check(%q) reported %q with no excerpt", testCase.source, finding.Reason)
			}
		})
	}
}

// A pattern this package cannot model must come back clean: the real
// regex engine owns the verdict on whether a pattern is even valid, and
// a guess here would fail a build over a fine pattern.
func TestCheckStandsDownOnUnmodelledPatterns(t *testing.T) {
	cases := []string{
		`^(a+`,        // not a valid pattern at all
		`[z-a]`,       // a reversed range
		`^[\q{ab}]+$`, // `v`-flag set notation
		`(?<=(a+)+)x`, // handled, but only if the lookbehind parses
	}
	for _, source := range cases {
		if _, found := Check(source, ""); found && source != `(?<=(a+)+)x` {
			t.Fatalf("Check(%q) reported a finding on a pattern it cannot model", source)
		}
	}
}
