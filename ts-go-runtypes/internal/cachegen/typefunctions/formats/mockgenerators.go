package formats

import (
	"sort"
	"strconv"
	"strings"
)

// lenSpan is an inclusive range of lengths, in code points.
type lenSpan struct{ Min, Max int }

// MockGenerator describes a built-in generator's data exactly, so the build can reject a format it cannot satisfy.
// mockGeneratorMeta.test.ts derives the same table from the TS data and fails when the two disagree.
type MockGenerator struct {
	// Name is the drizzle-seed name, also the TS const / type and the GEN member.
	Name    string
	Summary string
	// Lengths are the exact achievable lengths, ascending and disjoint.
	Lengths []lenSpan
	// Chars: every char an output can contain; Required: in every output; Leading: can start one. All sorted.
	Chars    string
	Required string
	Leading  string
}

const digits = "0123456789"

// MockGenerators are the built-in generators, sorted by name.
var MockGenerators = []MockGenerator{
	{Name: "city", Leading: "ABCDEFGHIJKLMNOPQRSTVWYZ", Summary: "A world city, like `Lisbon`.", Lengths: []lenSpan{{4, 14}},
		Chars: " ABCDEFGHIJKLMNOPQRSTVWYZabcdefghijklmnoprstuvwxyz"},
	{Name: "companyName", Leading: "ABCDEFGHIJKLMNOPRSTWYZ", Summary: "A company name, like `Smith Labs` or `Lee and Park`.", Lengths: []lenSpan{{5, 37}},
		Chars: " ,-ABCDEFGHIJKLMNOPRSTVWYZabcdefghiklmnoprstuvwxyz", Required: " "},
	{Name: "country", Leading: "ABCDEFGIJKMNPSTUV", Summary: "A country name, like `Portugal`.", Lengths: []lenSpan{{4, 14}, {20, 20}},
		Chars: " ABCDEFGIJKMNPRSTUVZabcdefghiklmnoprstuwxyz"},
	{Name: "email", Leading: "abcdefghijklmnopqrstvwyz", Summary: "A lowercase email address, like `brave_emma@example.com`.", Lengths: []lenSpan{{15, 33}},
		Chars: ".@_abcdefghijklmnopqrstuvwxyz", Required: ".@_m"},
	{Name: "firstName", Leading: "ABCDEFGHIJKLMNOPRSTVWYZ", Summary: "A first name, letters only, like `Olivia`.", Lengths: []lenSpan{{3, 9}, {11, 11}},
		Chars: "ABCDEFGHIJKLMNOPRSTVWYZabcdefghijklmnoprstuvwxyz"},
	{Name: "fullName", Leading: "ABCDEFGHIJKLMNOPRSTVWYZ", Summary: "A first and last name, like `Olivia Garcia`.", Lengths: []lenSpan{{6, 22}},
		Chars: " ABCDEFGHIJKLMNOPRSTVWYZabcdefghijklmnoprstuvwxyz", Required: " "},
	{Name: "jobTitle", Leading: "ABCDEFGHIJLMNOPQRSTUVW", Summary: "A job title, like `Data Analyst`.", Lengths: []lenSpan{{4, 25}},
		Chars: " ABCDEFGHIJLMNOPQRSTUVWXabcdefghijklmnoprstuvwxy"},
	{Name: "lastName", Leading: "ABCDEFGHIJKLMNOPRSTWYZ", Summary: "A last name, letters only, like `Smith`.", Lengths: []lenSpan{{2, 10}},
		Chars: "ABCDEFGHIJKLMNOPRSTWYZabcdefghiklmnoprstuvwxyz"},
	{Name: "loremIpsum", Leading: "ABCDEFGHIJLMNOPQRSTUV", Summary: "One lorem ipsum sentence ending in `.`, sized to the length bounds.", Lengths: []lenSpan{{2, 520}},
		Chars: " .ABCDEFGHIJLMNOPQRSTUVabcdefghijlmnopqrstuv", Required: "."},
	{Name: "phoneCountryCode", Leading: "+", Summary: "A country calling code, like `+44`.", Lengths: []lenSpan{{2, 4}},
		Chars: "+" + digits, Required: "+"},
	{Name: "phoneNumber", Leading: "+", Summary: "A phone number with its country code, E.164 style, like `+447700900123`.", Lengths: []lenSpan{{11, 14}},
		Chars: "+" + digits, Required: "+"},
	{Name: "phoneNumberLocal", Leading: "123456789", Summary: "A national phone number without the country code, digits only.", Lengths: []lenSpan{{8, 11}},
		Chars: digits},
	{Name: "postcode", Leading: "0123456789", Summary: "A US ZIP code, `#####` or `#####-####`.", Lengths: []lenSpan{{5, 5}, {10, 10}},
		Chars: "-" + digits},
	{Name: "state", Leading: "ACDFGHIKLMNOPRSTUVW", Summary: "A US state, like `Oregon`.", Lengths: []lenSpan{{4, 14}},
		Chars: " ACDFGHIJKLMNOPRSTUVWYabcdefghiklmnoprstuvwxyz"},
	{Name: "streetAddress", Leading: "123456789", Summary: "A street address, like `742 Evans Avenue`.", Lengths: []lenSpan{{8, 26}},
		Chars: " " + digits + "ABCDEFGHIJKLMNOPRSTVWYZabcdefghijklmnopqrstuvwxyz", Required: " "},
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
// A name not built in is a custom run-time generator: no table, so only param combinations are checked.
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
	row, builtin := lookupMockGenerator(generator)
	if !builtin {
		return problems
	}
	lo, hi := lengthBounds(params)
	if !spansOverlap(row.Lengths, lo, hi) {
		problems = append(problems, "`"+generator+"` makes values of "+formatSpans(row.Lengths)+
			" characters, but the format allows "+formatBounds(lo, hi))
	}
	if allowed, flags, ok := ReadCharParam(params, "allowedChars"); ok {
		for _, char := range row.Required {
			if !containsChar(allowed, char, flags != "") {
				problems = append(problems, "`"+generator+"` always contains `"+string(char)+"`, which `allowedChars` does not allow")
			}
		}
		if !containsAny(allowed, row.Leading, flags != "") {
			problems = append(problems, "`"+generator+"` starts every value with one of `"+row.Leading+"`, and `allowedChars` allows none")
		}
	}
	if disallowed, flags, ok := ReadCharParam(params, "disallowedChars"); ok {
		for _, char := range row.Required {
			if containsChar(disallowed, char, flags != "") {
				problems = append(problems, "`"+generator+"` always contains `"+string(char)+"`, which `disallowedChars` forbids")
			}
		}
		if !hasCharOutside(disallowed, row.Leading, flags != "") {
			problems = append(problems, "`"+generator+"` starts every value with one of `"+row.Leading+"`, and `disallowedChars` forbids them all")
		}
	}
	return problems
}

// lengthBounds reads [lo, hi] from length / minLength / maxLength; hi -1 means no upper bound.
func lengthBounds(params map[string]any) (lo, hi int) {
	hi = -1
	if length, ok := ReadNumberParam(params, "length"); ok {
		return int(length), int(length)
	}
	if minLength, ok := ReadNumberParam(params, "minLength"); ok {
		lo = int(minLength)
	}
	if maxLength, ok := ReadNumberParam(params, "maxLength"); ok {
		hi = int(maxLength)
	}
	return lo, hi
}

func spansOverlap(spans []lenSpan, lo, hi int) bool {
	for _, span := range spans {
		if span.Max >= lo && (hi < 0 || span.Min <= hi) {
			return true
		}
	}
	return false
}

func formatSpans(spans []lenSpan) string {
	parts := make([]string, len(spans))
	for i, span := range spans {
		if span.Min == span.Max {
			parts[i] = strconv.Itoa(span.Min)
		} else {
			parts[i] = strconv.Itoa(span.Min) + " to " + strconv.Itoa(span.Max)
		}
	}
	return strings.Join(parts, " or ")
}

func formatBounds(lo, hi int) string {
	switch {
	case hi < 0:
		return "at least " + strconv.Itoa(lo)
	case lo == hi:
		return "exactly " + strconv.Itoa(lo)
	default:
		return strconv.Itoa(lo) + " to " + strconv.Itoa(hi)
	}
}

func containsChar(set string, char rune, ignoreCase bool) bool {
	if ignoreCase {
		return strings.ContainsRune(strings.ToLower(set), []rune(strings.ToLower(string(char)))[0])
	}
	return strings.ContainsRune(set, char)
}

// containsAny reports whether set holds at least one of chars.
func containsAny(set, chars string, ignoreCase bool) bool {
	for _, char := range chars {
		if containsChar(set, char, ignoreCase) {
			return true
		}
	}
	return false
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
