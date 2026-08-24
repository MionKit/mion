// Package builtinpurefns is the single build-owned home of the package's own
// (`rt::` / `rtFormats::`) pure-fn bodies. For a published consumer the marker
// package is dist + `.d.ts` — there is no `src/` for the resolver's program
// extractor to walk — so the built-in bodies must reach the consumer through the
// binary. The generated table (table.generated.go) carries one row per built-in
// pure fn, extracted from packages/ts-runtypes/src by cmd/gen-builtin-purefns
// (`pnpm rtx core codegen builtinpurefns [--check]`). The resolver serves a
// demanded built-in key from this table as an ordinary pure-fn virtual module,
// so `rt::newRunTypeErr` and friends ride the module graph exactly like a user
// pure fn instead of relying on the always-on side-effect import.
//
// The TS files stay the single authored, type-checked source of truth; this
// table is only how their bodies travel. Because the generator runs the SAME
// extractor the resolver uses on user pure fns, a table row is byte-identical to
// what an in-repo program extraction would produce for the same source — the
// `--check` CI lane fails if the table drifts from src.
package builtinpurefns

import (
	"sort"

	"github.com/mionkit/ts-runtypes/internal/cachegen/purefunctions"
)

// builtinEntry is one row of the generated built-in pure-fn table. Fields mirror
// the extractor's purefunctions.Entry (minus the source-position bookkeeping,
// which a table-served entry has no use for). table.generated.go is the only
// producer of builtinEntries; edit the TS source and regenerate, never this.
type builtinEntry struct {
	namespace    string
	functionName string
	bodyHash     string
	paramNames   []string
	code         string
	deps         []string
}

func (e builtinEntry) key() string { return e.namespace + "::" + e.functionName }

func (e builtinEntry) toEntry() purefunctions.Entry {
	return purefunctions.Entry{
		Namespace:          e.namespace,
		FunctionName:       e.functionName,
		ParamNames:         e.paramNames,
		Code:               e.code,
		BodyHash:           e.bodyHash,
		PureFnDependencies: e.deps,
	}
}

// byKey indexes the generated table for O(1) lookup and enforces the
// one-producer-per-key invariant at process init (the generator asserts no clash
// too, but a hand-edited table.generated.go would trip this).
var byKey = func() map[string]builtinEntry {
	out := make(map[string]builtinEntry, len(builtinEntries))
	for _, entry := range builtinEntries {
		if _, dup := out[entry.key()]; dup {
			panic("builtinpurefns: duplicate key in generated table: " + entry.key())
		}
		out[entry.key()] = entry
	}
	return out
}()

// Has reports whether key names a package-owned built-in pure fn. The resolver
// uses it two ways: to drop a program-extracted entry that clashes with a
// built-in (the table is the sole producer — the precedence rule), and to decide
// whether a demanded pure-fn key is a built-in that must resolve from the table.
func Has(key string) bool {
	_, ok := byKey[key]
	return ok
}

// Keys returns every built-in key, sorted. Used by tests and the precedence
// filter.
func Keys() []string {
	out := make([]string, 0, len(byKey))
	for key := range byKey {
		out = append(out, key)
	}
	sort.Strings(out)
	return out
}

// Closure returns the built-in pure-fn entries for the demanded keys plus the
// transitive closure of their built-in pure-fn dependencies (e.g. demanding
// `rtFormats::isDateString_YMD` also pulls `rtFormats::isDateString`), and the
// sorted list of demanded keys that are NOT in the table. A non-empty `missing`
// is a build error at the call site: once delivery is build-owned there is no
// runtime registration lane left to cover a typo'd built-in reference. Only
// built-in keys are followed; a non-built-in dep (a user pure fn) is left for the
// program extractor's own graph and never appears here.
func Closure(demanded []string) (entries []purefunctions.Entry, missing []string) {
	seen := make(map[string]bool, len(demanded))
	missingSet := make(map[string]bool)
	var queue []string
	for _, key := range demanded {
		queue = append(queue, key)
	}
	for len(queue) > 0 {
		key := queue[len(queue)-1]
		queue = queue[:len(queue)-1]
		if seen[key] {
			continue
		}
		entry, ok := byKey[key]
		if !ok {
			missingSet[key] = true
			continue
		}
		seen[key] = true
		entries = append(entries, entry.toEntry())
		for _, dep := range entry.deps {
			if !seen[dep] {
				queue = append(queue, dep)
			}
		}
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Key() < entries[j].Key() })
	for key := range missingSet {
		missing = append(missing, key)
	}
	sort.Strings(missing)
	return entries, missing
}
