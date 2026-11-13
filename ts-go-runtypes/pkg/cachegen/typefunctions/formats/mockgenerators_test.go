package formats

import (
	"go/token"
	"sort"
	"strings"
	"testing"
)

func TestMockGenerators_RowsSelfConsistent(t *testing.T) {
	rows := MockGenerators
	if !sort.SliceIsSorted(rows, func(i, j int) bool { return rows[i].Name < rows[j].Name }) {
		t.Fatal("rows must be sorted by name, LookupMockGenerator binary-searches them")
	}
	seen := map[string]bool{}
	for _, row := range rows {
		if seen[row.Name] || !token.IsIdentifier(row.Name) {
			t.Fatalf("%q: names must be unique identifiers (they become TS consts)", row.Name)
		}
		seen[row.Name] = true
		if row.Summary == "" {
			t.Fatalf("%s: needs a summary", row.Name)
		}
	}
}

func TestGeneratorProblems(t *testing.T) {
	cases := []struct {
		name   string
		gen    any
		params map[string]any
		want   []string // substrings, one per expected problem; nil = clean
	}{
		{"no bounds", "fullName", map[string]any{}, nil},
		{"widened", map[string]any{"unrecovered": "string"}, map[string]any{}, []string{"string literal"}},
		{"non string", 3.0, map[string]any{}, []string{"string literal"}},
		{"too short is cut", "lastName", map[string]any{"maxLength": 1.0}, nil},
		{"too long is padded", "phoneCountryCode", map[string]any{"minLength": 5.0}, nil},
		{"allowedValues", "city", map[string]any{"allowedValues": map[string]any{"val": []any{"x"}}}, []string{"`allowedValues`"}},
		{"disallowedValues without samples", "city", map[string]any{"disallowedValues": map[string]any{"val": []any{"x"}}}, nil},
		{"contentMediaType", "city", map[string]any{"contentMediaType": "application/json"}, []string{"`contentMediaType`"}},
		{"isRegex", "phoneNumber", map[string]any{"isRegex": true}, []string{"`isRegex`"}},
		{"pattern samples fine", "firstName", map[string]any{"pattern": map[string]any{"source": "^[a-z]+$", "mockSamples": []any{"a"}}}, nil},
		{"rejected chars are replaced", "fullName", map[string]any{"allowedChars": map[string]any{"val": "ABCDEFGHIJKLMNOPQRSTUVWXYZ "}}, nil},
		{"digits only is replaced", "lastName", map[string]any{"allowedChars": map[string]any{"val": "0123456789"}}, nil},
		{"one replacement char is enough", "email", map[string]any{"disallowedChars": map[string]any{"val": MockReplacementChars[1:]}}, nil},
		{"no replacement char left", "email", map[string]any{"disallowedChars": map[string]any{"val": MockReplacementChars}}, []string{"nothing to build from"}},
		{"no replacement char left ignoring case", "city", map[string]any{"disallowedChars": map[string]any{"val": strings.ToLower(MockReplacementChars), "ignoreCase": true}}, []string{"nothing to build from"}},
		{"length 0 leaves disallowedChars nothing to reject", "lastName", map[string]any{"length": 0.0, "disallowedChars": map[string]any{"val": "a"}}, nil},
		{"length 0 serves an empty value under any disallowedChars", "lastName", map[string]any{"length": 0.0, "disallowedChars": map[string]any{"val": MockReplacementChars}}, nil},
		{"ignoreCase folds like a JS regex: the Kelvin sign is not k", "city", map[string]any{"disallowedChars": map[string]any{"val": strings.ReplaceAll(strings.ReplaceAll(MockReplacementChars, "k", "\u212a"), "K", ""), "ignoreCase": true}}, nil},
		{"length 0 fails allowedChars", "lastName", map[string]any{"length": 0.0, "allowedChars": map[string]any{"val": "abc"}}, []string{"only ''"}},
		{"maxLength 0 fails allowedChars for a custom name", "myCode", map[string]any{"maxLength": 0.0, "allowedChars": map[string]any{"val": "abc"}}, []string{"only ''"}},
		{"custom skips the replacement check", "myCode", map[string]any{"disallowedChars": map[string]any{"val": MockReplacementChars}}, nil},
		{"custom still checks combos", "myCode", map[string]any{"allowedValues": map[string]any{"val": []any{"x"}}}, []string{"`allowedValues`"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := GeneratorProblems(tc.gen, tc.params)
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
