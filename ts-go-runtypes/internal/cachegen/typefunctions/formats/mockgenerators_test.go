package formats

import (
	"go/token"
	"sort"
	"strings"
	"testing"
	"unicode/utf8"
)

func TestMockGenerators_RowsSelfConsistent(t *testing.T) {
	rows := MockGenerators()
	if !sort.SliceIsSorted(rows, func(i, j int) bool { return rows[i].Name < rows[j].Name }) {
		t.Fatal("rows must be sorted by name, LookupMockGenerator binary-searches them")
	}
	seen := map[string]bool{}
	for _, row := range rows {
		if seen[row.Name] || !token.IsIdentifier(row.Name) {
			t.Fatalf("%q: names must be unique identifiers (they become TS consts)", row.Name)
		}
		seen[row.Name] = true
		for i, span := range row.Lengths {
			if span.Min < 0 || span.Max < span.Min || (i > 0 && span.Min <= row.Lengths[i-1].Max+1) {
				t.Fatalf("%s: spans must be valid, ascending and disjoint, got %v", row.Name, row.Lengths)
			}
		}
		if !isSorted(row.Chars) || !isSorted(row.Required) {
			t.Fatalf("%s: Chars and Required must be sorted", row.Name)
		}
		for _, char := range row.Required {
			if !strings.ContainsRune(row.Chars, char) {
				t.Fatalf("%s: required %q is not in Chars", row.Name, char)
			}
		}
		if len(row.Examples) == 0 || row.Summary == "" {
			t.Fatalf("%s: needs a summary and examples", row.Name)
		}
		for _, example := range row.Examples {
			if !spansOverlap(row.Lengths, utf8.RuneCountInString(example), utf8.RuneCountInString(example)) {
				t.Fatalf("%s: example %q has a length outside %v", row.Name, example, row.Lengths)
			}
			for _, char := range example {
				if !strings.ContainsRune(row.Chars, char) {
					t.Fatalf("%s: example %q has %q, not in Chars", row.Name, example, char)
				}
			}
		}
	}
}

func isSorted(text string) bool {
	runes := []rune(text)
	return sort.SliceIsSorted(runes, func(i, j int) bool { return runes[i] < runes[j] })
}

func TestGeneratorProblems(t *testing.T) {
	cases := []struct {
		name     string
		gen      any
		params   map[string]any
		fromData bool
		want     []string // substrings, one per expected problem; nil = clean
	}{
		{"fits", "lastName", map[string]any{"maxLength": 120.0}, false, nil},
		{"no bounds", "fullName", map[string]any{}, false, nil},
		{"widened", map[string]any{"unrecovered": "string"}, map[string]any{}, false, []string{"string literal"}},
		{"non string", 3.0, map[string]any{}, false, []string{"string literal"}},
		{"too short", "lastName", map[string]any{"maxLength": 1.0}, false, []string{"2 to 10", "0 to 1"}},
		{"exact length gap", "postcode", map[string]any{"length": 7.0}, false, []string{"5 or 10", "exactly 7"}},
		{"length hits a span", "postcode", map[string]any{"length": 10.0}, false, nil},
		{"too long", "phoneCountryCode", map[string]any{"minLength": 5.0}, false, []string{"at least 5"}},
		{"allowedValues", "city", map[string]any{"allowedValues": map[string]any{"val": []any{"x"}}}, false, []string{"`allowedValues`"}},
		{"disallowedValues", "city", map[string]any{"disallowedValues": map[string]any{"val": []any{"x"}}}, false, []string{"`disallowedValues`"}},
		{"contentMediaType", "city", map[string]any{"contentMediaType": "application/json"}, false, []string{"`contentMediaType`"}},
		{"mockSamples", "city", map[string]any{"mockSamples": []any{"x"}}, false, []string{"`mockSamples`"}},
		{"mockSamples from data", "city", map[string]any{"mockSamples": []any{"x"}}, true, nil},
		{"pattern samples fine", "firstName", map[string]any{"pattern": map[string]any{"source": "^[a-z]+$", "mockSamples": []any{"a"}}}, false, nil},
		{"required char not allowed", "fullName", map[string]any{"allowedChars": map[string]any{"val": letters()}}, false, []string{"` `"}},
		{"required char allowed ignoring case", "email", map[string]any{"allowedChars": map[string]any{"val": "ABCDEFGHIJKLMNOPQRSTUVWXYZ@._", "ignoreCase": true}}, false, nil},
		{"required char disallowed", "email", map[string]any{"disallowedChars": map[string]any{"val": "@"}}, false, []string{"`@`", "forbids"}},
		{"custom skips the table", "myCode", map[string]any{"maxLength": 1.0}, false, nil},
		{"custom still checks combos", "myCode", map[string]any{"allowedValues": map[string]any{"val": []any{"x"}}}, false, []string{"`allowedValues`"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := GeneratorProblems(tc.gen, tc.params, tc.fromData)
			if len(tc.want) == 0 {
				if len(got) != 0 {
					t.Fatalf("want clean, got %v", got)
				}
				return
			}
			joined := strings.Join(got, " | ")
			for _, want := range tc.want {
				if !strings.Contains(joined, want) {
					t.Fatalf("want %q in %q", want, joined)
				}
			}
		})
	}
}

func letters() string { return "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz" }
