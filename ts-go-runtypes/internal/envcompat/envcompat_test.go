package envcompat

import "testing"

// The MION_ / RT_ fallback. The RT_ family moved to MION_ with the package
// namespace, and the vars a CONSUMER sets must keep working across that rename
// rather than going quietly unread.

func TestLookupEnv_PrefersCurrentName(t *testing.T) {
	t.Setenv("MION_TEST_KNOB", "new")
	t.Setenv("RT_TEST_KNOB", "old")

	value, found := LookupEnv("MION_TEST_KNOB")
	if !found || value != "new" {
		t.Fatalf("want new/true, got %q/%v", value, found)
	}
}

func TestLookupEnv_FallsBackToLegacyName(t *testing.T) {
	t.Setenv("RT_TEST_KNOB", "old")

	value, found := LookupEnv("MION_TEST_KNOB")
	if !found || value != "old" {
		t.Fatalf("want old/true, got %q/%v", value, found)
	}
}

// An EMPTY current value is a deliberate choice for the vars that read one
// (MION_CACHE_DIR="" forces the cache off), so it must end the lookup rather
// than fall through to a stale legacy value and turn the cache back on.
func TestLookupEnv_EmptyCurrentValueIsSet(t *testing.T) {
	t.Setenv("MION_TEST_KNOB", "")
	t.Setenv("RT_TEST_KNOB", "old")

	value, found := LookupEnv("MION_TEST_KNOB")
	if !found || value != "" {
		t.Fatalf(`want ""/true, got %q/%v`, value, found)
	}
}

func TestLookupEnv_NeitherSet(t *testing.T) {
	if _, found := LookupEnv("MION_TEST_KNOB_UNSET"); found {
		t.Fatal("want not found")
	}
}

// Getenv's callers treat empty as unset, so unlike LookupEnv it keeps looking.
func TestGetenv_EmptyCurrentValueFallsThrough(t *testing.T) {
	t.Setenv("MION_TEST_RUNTIME", "")
	t.Setenv("RT_TEST_RUNTIME", "/usr/bin/node")

	if got := Getenv("MION_TEST_RUNTIME"); got != "/usr/bin/node" {
		t.Fatalf("want /usr/bin/node, got %q", got)
	}
}

func TestGetenv_PrefersCurrentName(t *testing.T) {
	t.Setenv("MION_TEST_RUNTIME", "/usr/bin/bun")
	t.Setenv("RT_TEST_RUNTIME", "/usr/bin/node")

	if got := Getenv("MION_TEST_RUNTIME"); got != "/usr/bin/bun" {
		t.Fatalf("want /usr/bin/bun, got %q", got)
	}
}

// A name outside the MION_ namespace has no legacy twin to fall back to, so an
// RT_-prefixed value must never be picked up for it.
func TestLegacyName_OnlyForMionPrefix(t *testing.T) {
	if got := legacyName("MION_CACHE_DIR"); got != "RT_CACHE_DIR" {
		t.Fatalf("want RT_CACHE_DIR, got %q", got)
	}
	for _, name := range []string{"CI", "NPM_TOKEN", "GENERATE_ROUTER_SPEC", "MIONX_THING"} {
		if got := legacyName(name); got != "" {
			t.Fatalf("%s must have no legacy twin, got %q", name, got)
		}
	}
}
