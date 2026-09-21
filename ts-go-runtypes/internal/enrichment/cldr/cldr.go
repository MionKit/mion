// Package cldr holds the plural-category table deciding which arms a plural error template scaffolds for a locale.
// Generation only: Intl.PluralRules selects at render and the `other` arm backstops any gap, so a wrong arm degrades.
// Coverage is deliberately small: the top ~10 languages exact, every other locale gets all six for the translator to prune.
package cldr

import "strings"

// AllCategories is the full CLDR cardinal set, in CLDR order, and the arm set for a locale the table does not know.
var AllCategories = []string{"zero", "one", "two", "few", "many", "other"}

// categoriesByLanguage is keyed by BASE language (region/script never change the set); source: CLDR 45 plurals.xml.
var categoriesByLanguage = map[string][]string{
	"en": {"one", "other"},
	"es": {"one", "many", "other"},
	"zh": {"other"},
	"hi": {"one", "other"},
	"ar": {"zero", "one", "two", "few", "many", "other"},
	"pt": {"one", "many", "other"},
	"ru": {"one", "few", "many", "other"},
	"ja": {"other"},
	"de": {"one", "other"},
	"fr": {"one", "many", "other"},
	"pl": {"one", "few", "many", "other"},
}

// Categories returns the arms a locale's plural templates scaffold: the built-in set, or all six for an unknown language.
func Categories(locale string) []string {
	language := strings.ToLower(locale)
	if idx := strings.IndexAny(language, "-_"); idx >= 0 {
		language = language[:idx]
	}
	if categories, ok := categoriesByLanguage[language]; ok {
		return categories
	}
	return AllCategories
}

// IsCategory reports whether name is a CLDR plural category, i.e. a valid plural arm key.
func IsCategory(name string) bool {
	for _, category := range AllCategories {
		if name == category {
			return true
		}
	}
	return false
}
