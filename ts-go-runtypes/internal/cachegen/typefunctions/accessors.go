package typefunctions

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/jsquote"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// JS accessor / string-literal helpers shared across the emitters. Relocated
// from istype.go.

// propertyAccessor builds the JS subscript expression for `parent.name`
// (safe identifier names) or `parent["name"]` (anything else). Mirrors
// the RunType `useArrayAccessor` / `getChildVarName` split applied
// to property names — protocol.IsSafeName captures the safe-name bit
// at resolver time so the emit doesn't repeat the regex.
func propertyAccessor(parent, name string, safe bool) string {
	if safe && name != "" {
		return parent + "." + name
	}
	return parent + "[" + quoteJS(name) + "]"
}

// isEnumerabilityGuarded reports whether a property member's by-name write
// must be gated by a runtime own-enumerability check — the single source of
// truth read by BOTH the serializer emitters and the noop predicates (per the
// noop-soundness anti-drift rule). Set on lib-global-inherited members and
// `@nonEnumerable`-tagged ones (see reflection.RunType.NonEnumerable /
// typeid.IsNonEnumerable).
func isEnumerabilityGuarded(rt *reflection.RunType) bool {
	return rt != nil && rt.NonEnumerable
}

// propertyIsEnumerableGuard builds the JS own-enumerability test for a guarded
// property: `Object.prototype.propertyIsEnumerable.call(<v>, "<name>")`. This
// is exactly `JSON.stringify`'s own-enumerable semantics, so a value that
// carries the property non-enumerably (a vanilla error's name/message/stack)
// skips it, and one that defines it enumerably serializes it.
func propertyIsEnumerableGuard(v, name string) string {
	return "Object.prototype.propertyIsEnumerable.call(" + v + ", " + quoteJS(name) + ")"
}

// quoteJSDouble produces a double-quoted JS string literal — shorthand
// for the shared jsquote.Double (regex sources are dense with
// backslashes; double quotes keep them readable).
func quoteJSDouble(s string) string { return jsquote.Double(s) }

// positionStr returns the tuple element's index as a JS literal.
// Falls back to "0" when Position is nil (defensive — shouldn't
// happen for well-formed cache entries).
func positionStr(rt *reflection.RunType) string {
	if rt.Position == nil {
		return "0"
	}
	return strconv.Itoa(*rt.Position)
}

// joinAnd composes parts into a JS `a && b && c` chain, filtering
// empty entries the same way the `.filter(Boolean).join(' && ')`
// pattern does.
func joinAnd(parts []string) string {
	out := parts[:0]
	for _, part := range parts {
		if part == "" {
			continue
		}
		out = append(out, part)
	}
	return strings.Join(out, " && ")
}
