package resolver_test

import (
	"sort"
	"strings"

	"github.com/mionkit/ts-runtypes/internal/cachegen/operations"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// keyPrefixFor returns the `<plainFnHash>_` entry-key prefix a family's
// default-variant entries are keyed by. The opaque, version-isolated fnHash
// comes from the operation registry, so scope assertions derive the prefix
// through the same helper the emitter uses.
func keyPrefixFor(opName string) string {
	return operations.PlainHash(opName) + "_"
}

// familyEntryKeys returns the sorted EntryModules basenames keyed under a
// family's plain-hash prefix — the per-entry equivalent of grepping a family's
// pre-migration cache-module body for `init('<prefix>` lines.
func familyEntryKeys(resp protocol.Response, opName string) []string {
	prefix := keyPrefixFor(opName)
	var keys []string
	for basename := range resp.EntryModules {
		if strings.HasPrefix(basename, prefix) {
			keys = append(keys, basename)
		}
	}
	sort.Strings(keys)
	return keys
}

// hasFamilyEntry reports whether at least one entry module of the family
// exists in the response.
func hasFamilyEntry(resp protocol.Response, opName string) bool {
	return len(familyEntryKeys(resp, opName)) > 0
}

// entryModule returns the module source for an exact basename ("" when
// absent).
func entryModule(resp protocol.Response, basename string) string {
	return resp.EntryModules[basename]
}

// allEntrySources concatenates every entry-module source in sorted-basename
// order — for substring assertions that don't care which module carries the
// fragment.
func allEntrySources(resp protocol.Response) string {
	basenames := make([]string, 0, len(resp.EntryModules))
	for basename := range resp.EntryModules {
		basenames = append(basenames, basename)
	}
	sort.Strings(basenames)
	var all strings.Builder
	for _, basename := range basenames {
		all.WriteString(resp.EntryModules[basename])
		all.WriteString("\n")
	}
	return all.String()
}

// familyEntrySources concatenates the sources of one family's entry modules in
// sorted-key order.
func familyEntrySources(resp protocol.Response, opName string) string {
	var all strings.Builder
	for _, key := range familyEntryKeys(resp, opName) {
		all.WriteString(resp.EntryModules[key])
		all.WriteString("\n")
	}
	return all.String()
}
