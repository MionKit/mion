// Package envcompat reads an env var under its current MION_ name, falling back to the pre-rename RT_ spelling.
// Only the vars read from a CONSUMER's environment keep the old name: their shell profile or CI job is not ours to rename,
// and ignoring RT_BIN would silently run a DIFFERENT binary than asked for. The fallback warns once per process.
package envcompat

import (
	"fmt"
	"os"
	"strings"
	"sync"
)

// legacyName is the pre-rename spelling of a current name; only vars a consumer sets should be looked up, plumbing moved outright.
func legacyName(name string) string {
	if rest, found := strings.CutPrefix(name, "MION_"); found {
		return "RT_" + rest
	}
	return ""
}

var warned sync.Map

func warnOnce(legacy, current string) {
	if _, seen := warned.LoadOrStore(legacy, true); seen {
		return
	}
	fmt.Fprintf(os.Stderr, "[mion] %s is deprecated and will be removed. Rename it to %s; it is still being honoured for now.\n", legacy, current)
}

// LookupEnv is os.LookupEnv plus the legacy fallback; a SET but empty current name wins (MION_CACHE_DIR="" forces the cache off).
func LookupEnv(name string) (string, bool) {
	if value, found := os.LookupEnv(name); found {
		return value, true
	}
	legacy := legacyName(name)
	if legacy == "" {
		return "", false
	}
	value, found := os.LookupEnv(legacy)
	if found {
		warnOnce(legacy, name)
	}
	return value, found
}

// Getenv is os.Getenv plus the legacy fallback; its callers treat empty as unset, so an empty current value falls through.
func Getenv(name string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	legacy := legacyName(name)
	if legacy == "" {
		return ""
	}
	value := os.Getenv(legacy)
	if value != "" {
		warnOnce(legacy, name)
	}
	return value
}
