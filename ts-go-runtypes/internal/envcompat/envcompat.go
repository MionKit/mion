// Package envcompat reads an env var under its current MION_ name, falling back
// to the pre-rename RT_ spelling.
//
// The whole RT_ family moved to MION_ when the package namespace did. Most of
// those vars are internal plumbing the repo's own scripts set on both ends, so
// they moved and were done. A handful are read from a CONSUMER's environment,
// where the repo controls neither end: someone's shell profile, CI job, or
// .env still says RT_BIN. Dropping the old name there would silently stop
// honouring a value they deliberately set, which for a binary-path override
// means running a DIFFERENT binary than asked for.
//
// So the old name keeps working and warns once per process. The warning is the
// point: a rename a user never hears about is a rename they debug later.
package envcompat

import (
	"fmt"
	"os"
	"strings"
	"sync"
)

// legacyName is the pre-rename spelling of a current name. Only the vars a
// consumer actually sets belong here; internal plumbing moved outright.
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

// LookupEnv is os.LookupEnv plus the legacy fallback. The current name wins
// whenever it is SET, even when set empty: an empty value is a deliberate
// choice for the vars that read one (MION_CACHE_DIR="" forces the cache off),
// so it must not fall through to the old name.
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

// Getenv is os.Getenv plus the legacy fallback. Its callers treat empty as
// unset, so an empty current value falls through to the old name rather than
// ending the lookup there.
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
