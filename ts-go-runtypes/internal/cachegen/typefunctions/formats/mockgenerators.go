package formats

import (
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"
)

// MockGenerator names a built-in generator; mockGeneratorNames.test.ts fails when the TS built-ins name others.
type MockGenerator struct {
	// Name is the drizzle-seed name, also the TS const / type and the GEN member.
	Name    string
	Summary string
}

// MockReplacementChars are what the mock may turn a char `disallowedChars` rejects into; generated into TS for fit.ts.
const MockReplacementChars = " 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

// MockGenerators are the built-in generators, sorted by name.
var MockGenerators = []MockGenerator{
	{Name: "city", Summary: "A world city, like `Lisbon`."},
	{Name: "companyName", Summary: "A company name, like `Smith Labs` or `Lee and Park`."},
	{Name: "country", Summary: "A country name, like `Portugal`."},
	{Name: "email", Summary: "A lowercase email address, like `brave_emma@example.com`."},
	{Name: "firstName", Summary: "A first name, letters only, like `Olivia`."},
	{Name: "fullName", Summary: "A first and last name, like `Olivia Garcia`."},
	{Name: "jobTitle", Summary: "A job title, like `Data Analyst`."},
	{Name: "lastName", Summary: "A last name, letters only, like `Smith`."},
	{Name: "loremIpsum", Summary: "One lorem ipsum sentence ending in `.`, sized to the length bounds."},
	{Name: "phoneCountryCode", Summary: "A country calling code, like `+44`."},
	{Name: "phoneNumber", Summary: "A phone number with its country code, E.164 style, like `+447700900123`."},
	{Name: "phoneNumberLocal", Summary: "A national phone number without the country code, digits only."},
	{Name: "postcode", Summary: "A US ZIP code, `#####` or `#####-####`."},
	{Name: "state", Summary: "A US state, like `Oregon`."},
	{Name: "streetAddress", Summary: "A street address, like `742 Evans Avenue`."},
}

// lookupMockGenerator finds a built-in generator by name.
func lookupMockGenerator(name string) (MockGenerator, bool) {
	index := sort.Search(len(MockGenerators), func(i int) bool { return MockGenerators[i].Name >= name })
	if index < len(MockGenerators) && MockGenerators[index].Name == name {
		return MockGenerators[index], true
	}
	return MockGenerator{}, false
}

// GeneratorProblems lists why `generator` cannot mock a format; a MockData one (fromData) overrides mockSamples.
// A custom name (not built in) skips the replacement-char check: its values are unknown.
func GeneratorProblems(name any, params map[string]any, fromData bool) []string {
	generator, isString := name.(string)
	if !isString || generator == "" {
		return []string{"`generator` must be one generator name written as a string literal"}
	}
	var problems []string
	for _, key := range []string{"allowedValues", "disallowedValues", "contentMediaType"} {
		if _, present := params[key]; present {
			problems = append(problems, "`generator` cannot be combined with `"+key+"`")
		}
	}
	if _, present := params["mockSamples"]; present && !fromData {
		problems = append(problems, "`generator` cannot be combined with `mockSamples`: both pick the mock value")
	}
	// The mock fits any length and replaces rejected chars, so only a format leaving it nothing to build from fails.
	// `length: 0` serves '', which `allowedChars` rejects and `disallowedChars` accepts.
	hi, bounded := ReadNumberParam(params, "length")
	if !bounded {
		hi, bounded = ReadNumberParam(params, "maxLength")
	}
	empty := bounded && hi == 0
	if _, _, ok := ReadCharParam(params, "allowedChars"); ok && empty {
		problems = append(problems, "the format allows only '', which `allowedChars` rejects")
	}
	if _, builtin := lookupMockGenerator(generator); builtin && !empty {
		if disallowed, flags, ok := ReadCharParam(params, "disallowedChars"); ok && !hasCharOutside(disallowed, MockReplacementChars, flags != "") {
			problems = append(problems, "`disallowedChars` forbids every letter, digit and space, so `"+generator+"` has nothing to build from")
		}
	}
	return problems
}

func containsChar(set string, char rune, ignoreCase bool) bool {
	if !ignoreCase {
		return strings.ContainsRune(set, char)
	}
	for _, member := range set {
		if jsCanonical(member) == jsCanonical(char) {
			return true
		}
	}
	return false
}

// jsCanonical folds like a JS regex `i` flag without `u`: upper case, never non-ASCII to ASCII (Kelvin sign is not `k`).
func jsCanonical(char rune) rune {
	upper := unicode.ToUpper(char)
	if char >= utf8.RuneSelf && upper < utf8.RuneSelf {
		return char
	}
	return upper
}

// hasCharOutside reports whether at least one of chars is not in set.
func hasCharOutside(set, chars string, ignoreCase bool) bool {
	for _, char := range chars {
		if !containsChar(set, char, ignoreCase) {
			return true
		}
	}
	return false
}
