package typefunctions

import "testing"

func TestOverrideOpKeyForTag_OptionFamiliesReadThePlainOverride(t *testing.T) {
	rows := map[string]string{
		"val":  "validate",
		"vst":  "validate",
		"vuk":  "validate",
		"verr": "validationErrors",
		"vest": "validationErrors",
		"veuk": "validationErrors",
		"ruk":  "removeUnknownKeys",
		"ruks": "removeUnknownKeys",
		"rukr": "removeUnknownKeys",
	}
	for tag, want := range rows {
		if got := overrideOpKeyForTag(tag); got != want {
			t.Errorf("overrideOpKeyForTag(%q) = %q, want %q", tag, got, want)
		}
	}
}
