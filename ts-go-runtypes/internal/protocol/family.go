package protocol

// Family classifies a RunType into one of four buckets: Atomic (A),
// Collection (C), Member (M), or Function (F). Mirrors the
// `RunTypeFamily` (ref: packages/run-types/src/types.ts:41) and the per-class
// `getFamily()` overrides in BaseRunType / AtomicRunType /
// CollectionRunType / MemberRunType / FunctionRunType.
//
// Used by the RT compiler's inline-vs-dependent predicate
// (BaseRunType.isRTInlined treats named Collections as dependencies
// so their factories can be reused across reference sites — see
// ref: packages/run-types/src/lib/baseRunTypes.ts:52).
//
// Single-character string values match the wire form so JS-side
// consumers can compare without translation.
type Family string

const (
	// FamilyUnknown is the zero value — emitted as the empty string,
	// which `omitempty` strips from the JSON envelope. Refs
	// (KindRef sentinel) and reserved kinds (TypeParameter / Infer)
	// have no family classification.
	FamilyUnknown Family = ""
	// FamilyAtomic is 'A'. Single-shape values that have no
	// children (string, number, null, literal, …) and inline cheaply.
	FamilyAtomic Family = "A"
	// FamilyCollection is 'C'. Has children that compose into
	// the parent's emitted code (objectLiteral, class, union,
	// intersection, tuple, templateLiteral).
	FamilyCollection Family = "C"
	// FamilyMember is 'M'. Wraps a single child with a parent-
	// relative accessor (property, parameter, array, rest,
	// indexSignature, tupleMember, promise).
	FamilyMember Family = "M"
	// FamilyFunction is 'F'. Functions / methods /
	// call-signatures — anything with parameters + a return type.
	FamilyFunction Family = "F"
)

// FamilyOf returns the Family classification for a ReflectionKind.
// Single source of truth for the Kind→Family mapping; both the RT
// compiler's inlining predicate and the wire-field populator route
// through here.
//
// Kinds with no family classification (KindRef, KindTypeParameter,
// KindInfer) return FamilyUnknown so the wire field stays empty and
// `omitempty` strips them.
//
// Stays in lockstep with the family-per-class declarations in
// packages/run-types/src/nodes/*/*.ts — see the spec files for which
// node class each ReflectionKind maps to.
func FamilyOf(kind ReflectionKind) Family {
	switch kind {
	// Atomic — packages/run-types/src/nodes/atomic/*.ts.
	case KindAny, KindUnknown, KindNever, KindVoid,
		KindNull, KindUndefined,
		KindString, KindNumber, KindBoolean, KindBigInt, KindSymbol,
		KindObject, KindRegexp, KindLiteral,
		KindEnum, KindEnumMember:
		return FamilyAtomic

	// Collection — packages/run-types/src/nodes/collection/*.ts. Note:
	// templateLiteral lives under collection/ despite
	// "atomic" connotations — its emitted code composes a regex from
	// child segments, so it's a Collection family-wise.
	case KindObjectLiteral, KindClass,
		KindUnion, KindIntersection,
		KindTuple, KindTemplateLiteral:
		return FamilyCollection

	// Member — packages/run-types/src/nodes/member/*.ts + native/promise.ts.
	// Each wraps a single child accessor. KindArray is a Member
	// (member/array.ts) even though we name it "Array" — the
	// node wraps one element-type child via `Child`.
	case KindProperty, KindPropertySignature, KindParameter,
		KindArray, KindRest,
		KindIndexSignature, KindTupleMember,
		KindPromise:
		return FamilyMember

	// Function — packages/run-types/src/nodes/function/function.ts +
	// member/method.ts + member/methodSignature.ts +
	// member/callSignature.ts. Despite living under member/ in
	// the directory layout, method / methodSignature /
	// callSignature all extend FunctionRunType and getFamily()
	// returns 'F'.
	case KindFunction, KindMethod, KindMethodSignature, KindCallSignature:
		return FamilyFunction
	}
	return FamilyUnknown
}

// IsNotSupportedKind reports whether a node's Kind (+ SubKind) is one the
// type-function emitters cannot faithfully validate or serialise — the
// "non-data" set: functions, methods, method-signatures and call-signatures
// (no value form), symbols
// (identity doesn't round-trip), never (no inhabitants), and non-
// serialisable classes (WeakMap, typed arrays, …). KindPromise is
// deliberately absent: it is validation-supported (a real thenable runtime
// value), so it counts as data.
func IsNotSupportedKind(kind ReflectionKind, subKind ReflectionSubKind) bool {
	switch kind {
	case KindNever, KindSymbol,
		KindFunction, KindMethod, KindMethodSignature, KindCallSignature:
		return true
	case KindClass:
		return subKind == SubKindNonSerializable
	}
	return false
}

// PopulateFamily recursively walks a RunType and sets `Family` AND
// `NotSupported` on every concrete node it visits. Called at cache-exit
// time (Cache.Dump and friends) so every wire-bound node carries both
// Kind-derived classifications before the JSON envelope is built.
//
// Idempotent — re-running on an already-populated tree is a no-op
// modulo the function-call overhead. Refs (KindRef) terminate the
// recursion because they're just pointers; their canonical node is
// populated separately when the same walk reaches it via cache.nodes.
func PopulateFamily(runType *RunType) {
	if runType == nil {
		return
	}
	runType.Family = FamilyOf(runType.Kind)
	runType.NotSupported = IsNotSupportedKind(runType.Kind, runType.SubKind)
	runType.EachRefSlot(PopulateFamily)
}
