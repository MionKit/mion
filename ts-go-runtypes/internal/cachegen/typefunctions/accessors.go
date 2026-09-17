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

// isEnumerabilityGuarded reports whether a property member's presence test and
// by-name write must be gated by a runtime own-enumerability check — the single
// source of truth read by BOTH the serializer emitters and the noop predicates
// (per the noop-soundness anti-drift rule). Two cases:
//
//   - rt.NonEnumerable: a lib-global-inherited member (Error's
//     name/message/stack) or a `@nonEnumerable`-tagged one (see
//     reflection.RunType.NonEnumerable / typeid.IsNonEnumerable). Projected as
//     optional upstream, so the wire may omit it.
//   - isInheritedPropertyName: a member whose name every object answers through
//     its prototype, so an absent own key does not read as undefined. Derived
//     from the name rather than carried on the wire: the name is already part of
//     the member id, so the id and the projection cannot drift on it, and unlike
//     NonEnumerable it does NOT make the member optional.
func isEnumerabilityGuarded(rt *reflection.RunType) bool {
	return rt != nil && (rt.NonEnumerable || isInheritedPropertyName(rt.Name))
}

// isInheritedPropertyName reports whether reading this name off a plain object
// answers something inherited when the own key is absent. `constructor` is the
// only one: `({}).constructor` is the Object function, so a plain
// `!== undefined` test would call an absent member present. `({}).prototype` is
// undefined, and `__proto__` is dropped as a member outright.
func isInheritedPropertyName(name string) bool {
	return name == "constructor"
}

// propertyPresenceTest is the JS test for "this property is present on the
// value being walked": the plain `!== undefined` for an ordinary member, the
// own-enumerability check for a guarded one.
func propertyPresenceTest(rt *reflection.RunType, parent, accessor string) string {
	if isEnumerabilityGuarded(rt) {
		return propertyIsEnumerableGuard(parent, rt.Name)
	}
	return accessor + " !== undefined"
}

// propertyAbsenceTest is the negation of propertyPresenceTest, for the optional
// arms written as "absent OR valid".
func propertyAbsenceTest(rt *reflection.RunType, parent, accessor string) string {
	if isEnumerabilityGuarded(rt) {
		return "!" + propertyIsEnumerableGuard(parent, rt.Name)
	}
	return accessor + " === undefined"
}

// namedPropertyPresenceTest is propertyPresenceTest for the sites that carry a
// flattened slot (a compact slot, a merged union prop) rather than the RunType.
// Same rule, read off the name alone.
func namedPropertyPresenceTest(name, parent, accessor string) string {
	if isInheritedPropertyName(name) {
		return propertyIsEnumerableGuard(parent, name)
	}
	return accessor + " !== undefined"
}

// namedPropertyInTest is the JS test for "this key is declared on the value",
// used where a member imposes presence but no value check. `in` walks the
// prototype chain, so an inherited name needs the own-enumerability test
// instead: `'constructor' in {}` is true.
func namedPropertyInTest(name, parent string) string {
	if isInheritedPropertyName(name) {
		return propertyIsEnumerableGuard(parent, name)
	}
	return quoteJS(name) + " in " + parent
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
