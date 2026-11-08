package formats

import (
	"sort"
	"strconv"
	"strings"
)

// LenSpan is an inclusive range of lengths, in code points.
type LenSpan struct{ Min, Max int }

// MockGenerator is one built-in mock generator: a string format's `generator` param names it, and the mock draws
// a realistic value from it. The lengths and characters describe its data exactly, so the build can tell when a
// format's own rules leave the generator nothing to produce. A TS test derives the same table from the data and
// fails when the two disagree.
type MockGenerator struct {
	// Name is the drizzle-seed name, also the TS const / type and the GEN member.
	Name    string
	Summary string
	// Lengths are the exact achievable lengths, ascending and disjoint.
	Lengths []LenSpan
	// Chars holds every character an output can contain, Required the ones every output contains, both sorted.
	Chars    string
	Required string
	Examples []string
}

const digits = "0123456789"

var mockGenerators = []MockGenerator{
	{Name: "city", Summary: "A world city, like `Lisbon`.", Lengths: []LenSpan{{4, 14}},
		Chars: " ABCDEFGHIJKLMNOPQRSTVWYZabcdefghijklmnoprstuvwxyz", Examples: []string{"Lisbon", "Buenos Aires", "Osaka"}},
	{Name: "companyName", Summary: "A company name, like `Smith Labs` or `Lee and Park`.", Lengths: []LenSpan{{5, 37}},
		Chars: " ,-ABCDEFGHIJKLMNOPRSTVWYZabcdefghiklmnoprstuvwxyz", Required: " ",
		Examples: []string{"Bianchi Industries", "Zhao - Bell", "Robinson and Kang"}},
	{Name: "country", Summary: "A country name, like `Portugal`.", Lengths: []LenSpan{{4, 14}, {20, 20}},
		Chars: " ABCDEFGIJKMNPRSTUVZabcdefghiklmnoprstuwxyz", Examples: []string{"Portugal", "South Korea", "Egypt"}},
	{Name: "email", Summary: "A lowercase email address, like `brave_emma@example.com`.", Lengths: []LenSpan{{15, 33}},
		Chars: ".@_abcdefghijklmnopqrstuvwxyz", Required: ".@_m",
		Examples: []string{"ancient_jessica@icloud.com", "proud_arjun@aol.com", "smart_thomas@example.org"}},
	{Name: "firstName", Summary: "A first name, letters only, like `Olivia`.", Lengths: []LenSpan{{3, 9}, {11, 11}},
		Chars: "ABCDEFGHIJKLMNOPRSTVWYZabcdefghijklmnoprstuvwxyz", Examples: []string{"Sarah", "Antonio", "Mei"}},
	{Name: "fullName", Summary: "A first and last name, like `Olivia Garcia`.", Lengths: []LenSpan{{6, 22}},
		Chars: " ABCDEFGHIJKLMNOPRSTVWYZabcdefghijklmnoprstuvwxyz", Required: " ",
		Examples: []string{"Evelyn Diaz", "Fernando Hughes", "Carlos Shah"}},
	{Name: "jobTitle", Summary: "A job title, like `Data Analyst`.", Lengths: []LenSpan{{4, 25}},
		Chars: " ABCDEFGHIJLMNOPQRSTUVWXabcdefghijklmnoprstuvwxy", Examples: []string{"Content Writer", "Pilot", "Product Manager"}},
	{Name: "lastName", Summary: "A last name, letters only, like `Smith`.", Lengths: []LenSpan{{2, 10}},
		Chars: "ABCDEFGHIJKLMNOPRSTWYZabcdefghiklmnoprstuvwxyz", Examples: []string{"Hansen", "Chang", "Okafor"}},
	{Name: "loremIpsum", Summary: "One lorem ipsum sentence ending in `.`, sized to the length bounds.", Lengths: []LenSpan{{2, 520}},
		Chars: " .ABCDEFGHIJLMNOPQRSTUVabcdefghijlmnopqrstuv", Required: ".",
		Examples: []string{"Aliquam mi fames lobortis.", "Tempus viverra tortor turpis.", "Varius sagittis turpis facilisis."}},
	{Name: "phoneCountryCode", Summary: "A country calling code, like `+44`.", Lengths: []LenSpan{{2, 4}},
		Chars: "+" + digits, Required: "+", Examples: []string{"+44", "+880", "+1"}},
	{Name: "phoneNumber", Summary: "A phone number with its country code, E.164 style, like `+447700900123`.", Lengths: []LenSpan{{11, 14}},
		Chars: "+" + digits, Required: "+", Examples: []string{"+4535673723", "+66675782114", "+12025550143"}},
	{Name: "phoneNumberLocal", Summary: "A national phone number without the country code, digits only.", Lengths: []LenSpan{{8, 11}},
		Chars: digits, Examples: []string{"980162747", "2025550143", "49696735"}},
	{Name: "postcode", Summary: "A US ZIP code, `#####` or `#####-####`.", Lengths: []LenSpan{{5, 5}, {10, 10}},
		Chars: "-" + digits, Examples: []string{"60122", "15499-0755", "52956"}},
	{Name: "state", Summary: "A US state, like `Oregon`.", Lengths: []LenSpan{{4, 14}},
		Chars: " ACDFGHIJKLMNOPRSTUVWYabcdefghiklmnoprstuvwxyz", Examples: []string{"Minnesota", "Colorado", "North Carolina"}},
	{Name: "streetAddress", Summary: "A street address, like `742 Evans Avenue`.", Lengths: []LenSpan{{8, 26}},
		Chars: " " + digits + "ABCDEFGHIJKLMNOPRSTVWYZabcdefghijklmnopqrstuvwxyz", Required: " ",
		Examples: []string{"8777 Yara View", "648 Edward Parkway", "12 Bryant Park"}},
}

// MockGenerators returns the built-in generators, sorted by name.
func MockGenerators() []MockGenerator {
	return mockGenerators
}

// LookupMockGenerator finds a built-in generator by name.
func LookupMockGenerator(name string) (MockGenerator, bool) {
	index := sort.Search(len(mockGenerators), func(i int) bool { return mockGenerators[i].Name >= name })
	if index < len(mockGenerators) && mockGenerators[index].Name == name {
		return mockGenerators[index], true
	}
	return MockGenerator{}, false
}

// GeneratorProblems explains why a string format's `generator` cannot mock it, one message per reason; nil when it
// can. fromData marks a MockData generator, which wins over the format's own mockSamples, so those do not clash.
// A name that is not built in is a custom generator registered at run time: the build has no table for it, so only
// the param combinations are checked and the mock throws when nothing registered it.
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
	row, builtin := LookupMockGenerator(generator)
	if !builtin {
		return problems
	}
	lo, hi := lengthBounds(params)
	if !spansOverlap(row.Lengths, lo, hi) {
		problems = append(problems, "`"+generator+"` makes values of "+formatSpans(row.Lengths)+
			" characters, but the format allows "+formatBounds(lo, hi))
	}
	if allowed, ignoreCase, ok := charSet(params, "allowedChars"); ok {
		for _, char := range row.Required {
			if !containsChar(allowed, char, ignoreCase) {
				problems = append(problems, "`"+generator+"` always contains `"+string(char)+"`, which `allowedChars` does not allow")
			}
		}
	}
	if disallowed, ignoreCase, ok := charSet(params, "disallowedChars"); ok {
		for _, char := range row.Required {
			if containsChar(disallowed, char, ignoreCase) {
				problems = append(problems, "`"+generator+"` always contains `"+string(char)+"`, which `disallowedChars` forbids")
			}
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

func spansOverlap(spans []LenSpan, lo, hi int) bool {
	for _, span := range spans {
		if span.Max >= lo && (hi < 0 || span.Min <= hi) {
			return true
		}
	}
	return false
}

func formatSpans(spans []LenSpan) string {
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

// charSet reads a `{val, ignoreCase?}` char param; an empty set is no check, as in the validator.
func charSet(params map[string]any, key string) (val string, ignoreCase, ok bool) {
	obj, isMap := params[key].(map[string]any)
	if !isMap {
		return "", false, false
	}
	val, _ = obj["val"].(string)
	ignoreCase, _ = obj["ignoreCase"].(bool)
	return val, ignoreCase, val != ""
}

func containsChar(set string, char rune, ignoreCase bool) bool {
	if ignoreCase {
		return strings.ContainsRune(strings.ToLower(set), []rune(strings.ToLower(string(char)))[0])
	}
	return strings.ContainsRune(set, char)
}
