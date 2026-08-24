package typefunctions

import (
	"strings"

	"github.com/mionkit/ts-runtypes/internal/jsquote"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// quoteJS produces a single-quoted JS string literal — package-local
// shorthand for the shared jsquote.Single (this package quotes on
// nearly every emit line).
func quoteJS(s string) string { return jsquote.Single(s) }

// stringSliceJS renders xs as a JS array literal of quoted strings.
// Empty/nil slices become `[]` (not `null`) so the rendered J(...) arg
// matches the `rtDependencies: []` / `pureFnDependencies: []`
// invariant on every entry.
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

// pureFnDepsJS projects PureFnDep triples down to the wire shape the JS
// runtime consumes — a flat array of "<namespace>::<fnName>" strings.
// FilePath is intentionally NOT emitted: it's a Go-only safety check
// used at walk time to assert the referenced pure-fn exists in source,
// not part of the runtime contract.
//
// Always fully quoted: per-entry tuples evaluate in their own module scope,
// so the skeleton-scoped `k_<alias>` identifier shortcuts the pre-migration
// cache modules used are gone (see purefn_aliases.go — the alias table now
// only shortens context-item variable NAMES inside factory bodies).
func pureFnDepsJS(deps []protocol.PureFnDep) string {
	if len(deps) == 0 {
		return "[]"
	}
	parts := make([]string, len(deps))
	for i, dep := range deps {
		parts[i] = quoteJS(dep.Namespace + "::" + dep.FunctionName)
	}
	return "[" + strings.Join(parts, ",") + "]"
}

// objectGuard wraps inner in the standard non-null-object guard shared
// across the union/serialization emitters:
//
//	(typeof <value> === 'object' && <value> !== null && <inner>)
//
// When inner is empty the trailing clause is omitted, yielding the bare
// null-safe object check `(typeof <value> === 'object' && <value> !== null)`.
func objectGuard(value, inner string) string {
	guard := "(typeof " + value + " === 'object' && " + value + " !== null"
	if inner != "" {
		guard += " && " + inner
	}
	return guard + ")"
}
