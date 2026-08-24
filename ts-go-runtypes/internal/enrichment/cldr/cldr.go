// Package cldr carries the built-in CLDR plural-category table the enrichment
// generator uses to decide which arms a plural error template scaffolds for a
// given locale (friendly-type i18n, §4). The table is REQUIRED at
// generation (it sets the emitted shape) but the runtime never reads it —
// `Intl.PluralRules` selects at render, and the mandatory `other` arm backstops
// any table imperfection, so a wrong/missing arm degrades, never breaks.
//
// Coverage is deliberately small: the top ~10 languages by usage get their
// exact cardinal category set; every other locale falls back to ALL SIX
// categories (only `other` is a hard requirement — the extras are optional
// prompts the translator fills where the language uses them and prunes
// otherwise; an unused filled arm is harmless, it is never selected).
package cldr

import "strings"

// AllCategories is the full CLDR cardinal category set, in CLDR order. The
// fallback arm set for a locale the built-in table does not know.
var AllCategories = []string{"zero", "one", "two", "few", "many", "other"}

// categoriesByLanguage is the built-in table: CLDR cardinal categories per
// BASE LANGUAGE (region/script subtags never change the cardinal set for
// these languages). Source: CLDR 45 plurals.xml, cardinal rules.
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

// Categories returns the cardinal plural categories a locale's plural
// templates should scaffold arms for: the built-in set for a known base
// language, ALL SIX for an unknown one. The locale's base language is the
// first BCP-47 subtag, case-insensitive (`pt-BR` → `pt`).
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

// IsCategory reports whether name is a CLDR plural category (a valid plural
// arm key).
func IsCategory(name string) bool {
	for _, category := range AllCategories {
		if name == category {
			return true
		}
	}
	return false
}
