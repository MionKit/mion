package typefunctions

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/jsquote"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// propertyAccessor builds `parent.name` for a safe identifier name and `parent["name"]` for anything else;
// safe is captured by protocol.IsSafeName at resolver time, so the emit does not repeat the regex.
func propertyAccessor(parent, name string, safe bool) string {
	if safe && name != "" {
		return parent + "." + name
	}
	return parent + "[" + quoteJS(name) + "]"
}

// isEnumerabilityGuarded reports whether a property member's presence test and by-name write need a runtime
// own-enumerability check; the one source of truth for BOTH the serializer emitters and the noop predicates
// (the noop-soundness anti-drift rule). rt.NonEnumerable covers a lib-global-inherited member (Error's
// name/message/stack) or a `@nonEnumerable`-tagged one, projected as optional upstream so the wire may omit
// it. isInheritedPropertyName covers a name the prototype answers, derived from the name rather than carried
// on the wire (the name is part of the member id, so the two cannot drift) and NOT making the member optional.
func isEnumerabilityGuarded(rt *reflection.RunType) bool {
	return rt != nil && (rt.NonEnumerable || isInheritedPropertyName(rt.Name))
}

// isInheritedPropertyName reports whether reading this name off a plain object answers something inherited
// when the own key is absent. `constructor` is the only one: `({}).constructor` is the Object function, so a
// plain `!== undefined` test would call an absent member present. `({}).prototype` is undefined, and
// `__proto__` is dropped as a member outright.
func isInheritedPropertyName(name string) bool {
	return name == "constructor"
}

// propertyPresenceTest is the JS test for "present on the value being walked": `!== undefined` for an
// ordinary member, the own-enumerability check for a guarded one.
func propertyPresenceTest(rt *reflection.RunType, parent, accessor string) string {
	if isEnumerabilityGuarded(rt) {
		return propertyIsEnumerableGuard(parent, rt.Name)
	}
	return accessor + " !== undefined"
}

// propertyAbsenceTest is the negation of propertyPresenceTest, for the optional arms written "absent OR valid".
func propertyAbsenceTest(rt *reflection.RunType, parent, accessor string) string {
	if isEnumerabilityGuarded(rt) {
		return "!" + propertyIsEnumerableGuard(parent, rt.Name)
	}
	return accessor + " === undefined"
}

// namedPropertyPresenceTest is propertyPresenceTest for a site carrying a flattened slot (a compact slot, a
// merged union prop) rather than the RunType: same rule, read off the name alone.
func namedPropertyPresenceTest(name, parent, accessor string) string {
	if isInheritedPropertyName(name) {
		return propertyIsEnumerableGuard(parent, name)
	}
	return accessor + " !== undefined"
}

// namedPropertyInTest is the JS test for "this key is declared on the value", where a member imposes presence
// but no value check. `in` walks the prototype chain, so an inherited name needs the own-enumerability test
// instead: `'constructor' in {}` is true.
func namedPropertyInTest(name, parent string) string {
	if isInheritedPropertyName(name) {
		return propertyIsEnumerableGuard(parent, name)
	}
	return quoteJS(name) + " in " + parent
}

// propertyIsEnumerableGuard builds the own-enumerability test, exactly `JSON.stringify`'s own-enumerable
// semantics: a value carrying the property non-enumerably (a vanilla error's name/message/stack) skips it.
func propertyIsEnumerableGuard(v, name string) string {
	return "Object.prototype.propertyIsEnumerable.call(" + v + ", " + quoteJS(name) + ")"
}

// quoteJSDouble is jsquote.Double: regex sources are dense with backslashes, double quotes keep them readable.
func quoteJSDouble(s string) string { return jsquote.Double(s) }

// positionStr returns the tuple element's index as a JS literal; a nil Position ("0") cannot happen for a
// well-formed cache entry.
func positionStr(rt *reflection.RunType) string {
	if rt.Position == nil {
		return "0"
	}
	return strconv.Itoa(*rt.Position)
}

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
