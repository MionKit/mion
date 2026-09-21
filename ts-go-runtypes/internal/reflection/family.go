package reflection

// Family classifies a RunType into one of four buckets: Atomic (A), Collection (C), Member (M) or Function (F).
// The single-character values are the wire form, so JS-side consumers compare without translation.
//
// Drives the inline-vs-dependent predicate: a NAMED Collection is emitted as a dependency rather than inlined
// (cachegen/typefunctions/inlining.go), so its factory is reused across reference sites.
type Family string

const (
	// FamilyUnknown is the zero value, stripped from the JSON envelope by omitempty: refs (the KindRef
	// sentinel) and the reserved kinds (TypeParameter / Infer) have no family classification.
	FamilyUnknown Family = ""
	// FamilyAtomic is 'A': single-shape values with no children (string, number, null, literal, …) that inline cheaply.
	FamilyAtomic Family = "A"
	// FamilyCollection is 'C': its children compose into the parent's emitted code.
	FamilyCollection Family = "C"
	// FamilyMember is 'M': wraps a single child with a parent-relative accessor.
	FamilyMember Family = "M"
	// FamilyFunction is 'F': anything with parameters plus a return type.
	FamilyFunction Family = "F"
)

// FamilyOf returns the Family classification for a ReflectionKind, the single source of truth for the
// Kind→Family mapping. KindRef, KindTypeParameter and KindInfer answer FamilyUnknown, which omitempty strips.
func FamilyOf(kind ReflectionKind) Family {
	switch kind {
	case KindAny, KindUnknown, KindNever, KindVoid,
		KindNull, KindUndefined,
		KindString, KindNumber, KindBoolean, KindBigInt, KindSymbol,
		KindObject, KindRegexp, KindLiteral,
		KindEnum, KindEnumMember:
		return FamilyAtomic

	// templateLiteral is a Collection despite its atomic look: its emitted code composes a regex from child segments.
	case KindObjectLiteral, KindClass,
		KindUnion, KindIntersection,
		KindTuple, KindTemplateLiteral:
		return FamilyCollection

	// KindArray is a Member despite the name: the node wraps one element-type child via `Child`.
	case KindProperty, KindPropertySignature, KindParameter,
		KindArray, KindRest,
		KindIndexSignature, KindTupleMember,
		KindPromise:
		return FamilyMember

	case KindFunction, KindMethod, KindMethodSignature, KindCallSignature:
		return FamilyFunction
	}
	return FamilyUnknown
}

// IsNotSupportedKind reports whether a node's Kind (+ SubKind) is one the type-function emitters cannot
// faithfully validate or serialise: functions and their signature kinds (no value form), symbols (identity
// doesn't round-trip), RegExp values (a pattern is code the receiver would run, never data; only a `pattern`
// format carries one, fixed at build time), never (no inhabitants) and non-serialisable classes (WeakMap,
// typed arrays, …). KindPromise is deliberately absent: a thenable is a real runtime value, so it is data.
func IsNotSupportedKind(kind ReflectionKind, subKind ReflectionSubKind) bool {
	switch kind {
	case KindNever, KindSymbol, KindRegexp,
		KindFunction, KindMethod, KindMethodSignature, KindCallSignature:
		return true
	case KindClass:
		return subKind == SubKindNonSerializable
	}
	return false
}

// PopulateFamily sets Family and NotSupported on runType and every node reachable through its ref slots.
// Called at intern time (Cache.putNode), so a node carries both Kind-derived classifications before the JSON
// envelope is built. Idempotent. A ref sentinel carries no child slots, so it ends the recursion; its
// canonical node is populated separately when the same walk reaches it via cache.nodes.
func PopulateFamily(runType *RunType) {
	if runType == nil {
		return
	}
	runType.Family = FamilyOf(runType.Kind)
	runType.NotSupported = IsNotSupportedKind(runType.Kind, runType.SubKind)
	runType.EachRefSlot(PopulateFamily)
}
