package cldr

import (
	"reflect"
	"testing"
)

// TestCategories pins the built-in table (verified against ICU via
// Intl.PluralRules(locale).resolvedOptions().pluralCategories) and the
// all-six fallback for unknown locales.
func TestCategories(t *testing.T) {
	tests := []struct {
		locale string
		want   []string
	}{
		{"en", []string{"one", "other"}},
		{"en-US", []string{"one", "other"}},
		{"es", []string{"one", "many", "other"}},
		{"zh", []string{"other"}},
		{"hi", []string{"one", "other"}},
		{"ar", []string{"zero", "one", "two", "few", "many", "other"}},
		{"pt-BR", []string{"one", "many", "other"}},
		{"ru", []string{"one", "few", "many", "other"}},
		{"ja", []string{"other"}},
		{"de", []string{"one", "other"}},
		{"fr", []string{"one", "many", "other"}},
		{"pl", []string{"one", "few", "many", "other"}},
		{"PL", []string{"one", "few", "many", "other"}},
		{"zh_Hant", []string{"other"}},
		// Unknown → all six (only `other` is a hard requirement).
		{"fi", AllCategories},
		{"xx", AllCategories},
		{"", AllCategories},
	}
	for _, test := range tests {
		t.Run(test.locale, func(t *testing.T) {
			if got := Categories(test.locale); !reflect.DeepEqual(got, test.want) {
				t.Errorf("Categories(%q) = %v, want %v", test.locale, got, test.want)
			}
		})
	}
}

func TestIsCategory(t *testing.T) {
	for _, category := range AllCategories {
		if !IsCategory(category) {
			t.Errorf("IsCategory(%q) = false, want true", category)
		}
	}
	for _, bad := range []string{"", "lots", "One", "rt$default"} {
		if IsCategory(bad) {
			t.Errorf("IsCategory(%q) = true, want false", bad)
		}
	}
}
