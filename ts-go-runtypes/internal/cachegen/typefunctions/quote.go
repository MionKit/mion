package typefunctions

import (
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/jsquote"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// quoteJS is jsquote.Single, package-local shorthand: this package quotes on nearly every emit line.
func quoteJS(s string) string { return jsquote.Single(s) }

// stringSliceJS renders xs as a JS array literal of quoted strings. An empty slice becomes `[]`, not `null`,
// to hold the `rtDependencies: []` / `pureFnDependencies: []` invariant on every entry.
func stringSliceJS(xs []string) string {
	if len(xs) == 0 {
		return "[]"
	}
	parts := make([]string, len(xs))
	for i, x := range xs {
		parts[i] = quoteJS(x)
	}
	return "[" + strings.Join(parts, ",") + "]"
}

// pureFnDepsJS projects PureFnDep triples down to the flat array of ids the JS runtime consumes. FilePath is
// NOT emitted: it is a Go-only walk-time check that the referenced pure fn exists in source, no part of the
// runtime contract. The ids stay fully quoted, a per-entry tuple evaluating in its own module scope with no
// shared-skeleton const to reference.
func pureFnDepsJS(deps []protocol.PureFnDep) string {
	if len(deps) == 0 {
		return "[]"
	}
	parts := make([]string, len(deps))
	for i, dep := range deps {
		parts[i] = quoteJS(dep.ID)
	}
	return "[" + strings.Join(parts, ",") + "]"
}

// objectGuard wraps inner in the non-null-object guard shared across the union / serialization emitters,
// and yields the bare null-safe object check when inner is empty.
func objectGuard(value, inner string) string {
	guard := "(typeof " + value + " === 'object' && " + value + " !== null"
	if inner != "" {
		guard += " && " + inner
	}
	return guard + ")"
}
