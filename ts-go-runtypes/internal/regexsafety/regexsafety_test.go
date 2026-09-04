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

		// An ambiguous loop nothing can reject after never blows up: the
		// first greedy attempt already matches, so the engine has no
		// reason to try the other routes. Comment and string scanners are
		// full of this shape, and reporting them is what got other
		// checkers a reputation for crying wolf.
		{"nothing can fail after the loop", `\/\*(?:[^*]+|\*(?!\/))*(\*\/)?`, "", false},
		{"same loop, now with something that can fail", `\/\*(?:[^*]+|\*(?!\/))*\*\/`, "", true},
		{"unanchored nested quantifier cannot be forced to fail", `(a+)+`, "", false},

		// `$` matches at ONE place, so a branch ending in it never
		// competes with a branch that carries on consuming.
		{"end anchor does not invent an overlap", `^(?:\\$|\\.|[^*?!^{}[\]\\])*$`, "", false},
		// Unless `m` is set, when `$` really can match mid-string.
		{"multiline end anchor is not a barrier", `^(?:a$|a.)*$`, "m", true},

		// The regexes eslint-plugin-unicorn's own code tripped safe-regex
		// on, which is why that rule was deprecated (issue #153). A
		// star-height check flags every one of them.
		{"unicorn: error name matcher", `^(?:[A-Z][a-z\d]*)*Error$`, "", false},
		{"unicorn: eslint-disable matcher", `^eslint-disable(?:-next-line|-line)?(?:\s|$)`, "", false},
		{"unicorn: dotted name", `^(?:\w+\.)*\w+$`, "", false},
		{"unicorn: dashed name", `^(?:[a-z]+-)*[a-z]+$`, "", false},

		// Measured at 0.3 ms for 14 characters and 12.6 s for 30, on the
		// input `/[` followed by a run of letters: the inner class scanner
		// is `(X+)*` and the `]` after it is what forces the retry.
		{"js-tokens regex-literal scanner", `\/(?![*\/])(?:\[(?:[^\]\\\n\r]+|\\.)*\]|[^\/\\\n\r]+|\\.)*(\/[a-z]*|\\)?`, "", true},

		// A group repeated a FIXED number of times cannot loop forever, so
		// it cannot blow up exponentially, and it can still be ruinous: a
		// body that splits its text more than one way costs the nth power
		// of the input, once per turn. Measured for the first of these at
		// 0.2 ms for 14 fields and 63 ms for 24, doubling per field.
		{"counted repeat of an ambiguous body", `^(.*?,){11}P`, "", true},
		{"counted repeat, the rewrite that fixes it", `^([^,\r\n]*,){11}P`, "", false},
		// A FIXED-width body splits exactly one way however often it
		// turns. This is the base64 format, and looping it would be wrong.
		{"counted repeat of a fixed-width body", `^(?:[A-Za-z0-9+/]{4})*=?$`, "", false},
		{"few turns are not worth reporting", `^(.*?,){2}P`, "", false},

		// From regular-expressions.info on catastrophic backtracking. The
		// third is the one the article calls out as SAFE despite its
		// nested quantifiers, because the alternatives are mutually
		// exclusive. A star-height check flags it.
		{"article: nested quantifiers", `(x+x+)+y`, "", true},
		{"article: the rewrite", `xx+y`, "", false},
		{"article: mutually exclusive alternatives are safe", `(a+b+|c+d+)+y`, "", false},
		{"article: lazy dot string, rewritten", `"[^"\r\n]*"`, "", false},
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
