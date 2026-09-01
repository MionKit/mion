package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// isJsonCompatible reports whether values of type `rt` round-trip
// identically through native `JSON.parse(JSON.stringify(v))` AND would
// have no special encode/decode transform applied by any of the three
// JSON emit families (prepareForJson, stringifyJson, restoreFromJson).
//
// Both halves of that conjunction matter:
//
//   - "Round-trips natively" means JSON.stringify outputs a recoverable
//     form for every value of this type. Strings/numbers/booleans/null
//     and their composites do. Date/bigint/Symbol/RegExp don't (each
//     either loses info or throws).
//
//   - "No special transform" means the emitter doesn't need to mutate
//     the value (encode side) or rebuild it (decode side). Date is
//     read-only at the value level — its toJSON is enough on encode —
//     but the decode MUST call `new Date(...)` to restore the type,
//     so the round-trip is NOT identity-preserving and Date returns
//     false here.
//
// This predicate is the sole input to the union wrap-or-not decision
// (see unionNeedsTuple / atomicBranchNeedsTuple / mergedPropNeedsSubWrap).
// Either every member of a union is JSON-compatible — the whole union
// round-trips raw with no [memberIndex, value] envelope — or any
// member is non-compatible and EVERY member's encoded form wraps so
// the decoder can unconditionally unwrap. There is no runtime
// shape-sniff on the wire; the decoder knows at compile time which
// shape to expect.
//
// Cycles: object/class/union/array/tuple types can reach themselves via
// property chains. We pass a visited set keyed on `rt.ID` and treat a
// re-entry as compatible. Cycle-back doesn't disqualify the type — if
// any non-cycle leaf elsewhere in the graph is non-compatible the
// outer call returns false on that path anyway.
func isJsonCompatible(rt *reflection.RunType, ctx *EmitContext) bool {
	// Resolve a raw KindRef before doing anything else. jsonCompatRecursive has
	// no KindRef arm, so an unresolved ref would fall through to its default
	// `return false` AND get memoized under the ref's id (= the target type's
	// structural id) — poisoning that type's verdict for every later caller in
	// the same FactsTable. Map/Set inner types (mapKeyValueTypes / setItemType)
	// reach here as unresolved refs, so this guard is load-bearing.
	rt = ctx.ResolveRef(rt)
	if rt != nil && rt.ID != "" {
		if verdict, known := ctx.walker.factsLookup(factJsonCompat, rt.ID); known {
			return verdict
		}
	}
	result := jsonCompatRecursive(rt, ctx, make(map[string]struct{}))
	// Only COMPLETED top-level walks are stored: an intermediate node's
	// in-walk value can depend on the cycle-back assumption for an
	// ancestor still on the stack, so it is not context-free. The
	// top-level result is — "every leaf reachable from rt is JSON-safe"
	// names the same reachable set no matter which parent asked.
	if rt != nil && rt.ID != "" {
		ctx.walker.factsStore(factJsonCompat, rt.ID, result)
	}
	return result
}

func jsonCompatRecursive(rt *reflection.RunType, ctx *EmitContext, visited map[string]struct{}) bool {
	if rt == nil {
		return false
	}
	if rt.ID != "" {
		// A previously completed top-level verdict for this node is
		// context-free — reuse it at any depth.
		if verdict, known := ctx.walker.factsLookup(factJsonCompat, rt.ID); known {
			return verdict
		}
		if _, seen := visited[rt.ID]; seen {
			return true
		}
		visited[rt.ID] = struct{}{}
	}
	switch rt.Kind {

	case reflection.KindString,
		reflection.KindNumber,
		reflection.KindBoolean,
		reflection.KindNull,
		reflection.KindAny,
		reflection.KindUnknown,
		reflection.KindObject,
		reflection.KindEnum,
		reflection.KindTemplateLiteral:
		return true

	case reflection.KindLiteral:
		// bigint / symbol literals carry a flag and have a transform on
		// the encode side (toString / description / etc.); primitive
		// literals (string / number / boolean / null) are noop.
		for _, flag := range rt.Flags {
			if flag == "bigint" || flag == "symbol" {
				return false
			}
		}
		return true

	case reflection.KindBigInt,
		reflection.KindSymbol,
		reflection.KindUndefined,
		reflection.KindVoid,
		reflection.KindRegexp,
		reflection.KindNever,
		reflection.KindPromise,
		reflection.KindFunction,
		reflection.KindMethod,
		reflection.KindMethodSignature,
		reflection.KindCallSignature:
		return false

	case reflection.KindArray:
		if rt.Child == nil {
			return true
		}
		return jsonCompatRecursive(ctx.ResolveRef(rt.Child), ctx, visited)

	case reflection.KindTuple:
		for _, child := range rt.Children {
			if !jsonCompatRecursive(ctx.ResolveRef(child), ctx, visited) {
				return false
			}
		}
		return true

	case reflection.KindTupleMember:
		if rt.Child == nil {
			return true
		}
		return jsonCompatRecursive(ctx.ResolveRef(rt.Child), ctx, visited)

	case reflection.KindProperty, reflection.KindPropertySignature:
		if rt.Child == nil {
			return true
		}
		resolved := ctx.ResolveRef(rt.Child)
		// Function-typed properties are silently skipped by the per-prop
		// emit (see emitPropertyPrepareForJson) — they contribute no
		// transform code, so they're effectively JSON-compatible from
		// the wrap-decision perspective.
		if resolved != nil && isFunctionLikeKind(resolved.Kind) {
			return true
		}
		return jsonCompatRecursive(resolved, ctx, visited)

	case reflection.KindIndexSignature:
		if rt.Child == nil {
			return true
		}
		return jsonCompatRecursive(ctx.ResolveRef(rt.Child), ctx, visited)

	case reflection.KindObjectLiteral:
		return objectChildrenCompat(rt.Children, ctx, visited)

	case reflection.KindIntersection:
		// Defensive: the type checker usually pre-resolves intersections.
		// When one slips through, treat as compatible iff every part is.
		for _, child := range rt.Children {
			if !jsonCompatRecursive(ctx.ResolveRef(child), ctx, visited) {
				return false
			}
		}
		return true

	case reflection.KindUnion:
		children := rt.SafeUnionChildren
		if len(children) == 0 {
			children = rt.Children
		}
		for _, child := range children {
			resolved := ctx.ResolveRef(child)
			if !jsonCompatRecursive(resolved, ctx, visited) {
				return false
			}
			// A member that buckets into the flat-union merged-object branch
			// forces the `[-1, …]` envelope across the WHOLE union
			// (union_flat_layout.go: AtomicNeedsTuple). So the union does NOT
			// round-trip raw even when every member is individually JSON-
			// compatible — without this a Map/Set value-type (or any consumer
			// trusting "no transform") fast-paths past the envelope on encode
			// while the decoder still unwraps it (G5). Mirrors unionJsonNoop's
			// decode arm (noop_types.go).
			if unionMemberEnvelopes(resolved, ctx) {
				return false
			}
		}
		return true

	case reflection.KindClass:
		if reflection.IsTemporalSubKind(rt.SubKind) {
			// Temporal types serialize via toJSON() (a string), like Date —
			// not raw-JSON-compatible, so a union containing one wraps.
			return false
		}
		switch rt.SubKind {
		case reflection.SubKindDate,
			reflection.SubKindMap,
			reflection.SubKindSet,
			reflection.SubKindNonSerializable:
			return false
		case reflection.SubKindNone:
			return objectChildrenCompat(rt.Children, ctx, visited)
		}
		return false
	}
	return false
}

// unionMemberEnvelopes reports whether a resolved union member buckets into the
// flat-union merged-object branch (ObjectLiteral / plain Class without an index
// signature), which forces the `[-1, …]` envelope across the whole union.
// Mirrors buildFlatLayout's ObjectMembers bucketing (union_flat_layout.go) and
// unionJsonNoop's decode arm (noop_types.go). Object-like members carrying an
// index signature stay in the ATOMIC bucket (no forced envelope — they only
// envelope when non-JSON-compatible, already caught by the per-member compat
// check); class-with-non-default-SubKind members (Date / Map / Set / …) are
// non-JSON-compatible and caught there too.
func unionMemberEnvelopes(resolved *reflection.RunType, ctx *EmitContext) bool {
	if resolved == nil {
		return false
	}
	if isObjectLikeKind(resolved.Kind) && objectHasIndexSignatureChild(resolved, ctx) {
		return false
	}
	if resolved.Kind == reflection.KindObjectLiteral {
		return true
	}
	return resolved.Kind == reflection.KindClass && resolved.SubKind == reflection.SubKindNone
}

// objectChildrenCompat — shared body for ObjectLiteral and plain Class.
// Skips static and function-like members the same way the per-emitter
// per-kind dispatch does, then defers to every surviving property's
// child type.
func objectChildrenCompat(children []*reflection.RunType, ctx *EmitContext, visited map[string]struct{}) bool {
	for _, childRef := range children {
		resolved := ctx.ResolveRef(childRef)
		if resolved == nil {
			continue
		}
		if resolved.IsStatic {
			continue
		}
		if isFunctionLikeKind(resolved.Kind) {
			continue
		}
		if !jsonCompatRecursive(resolved, ctx, visited) {
			return false
		}
	}
	return true
}

// litFlavour classifies a KindLiteral's serialization flavour. The JSON
// emit families share this classification — bigint/symbol/regexp literals
// carry a value transform, primitive literals (string/number/boolean/null)
// are noop — and differ only in the per-family leaf op. Mirrors the
// flag/Literal inspection in jsonCompatRecursive's KindLiteral arm.
type litFlavour int

const (
	litPrimitive litFlavour = iota
	litBigInt
	litSymbol
)

// literalFlavour returns the litFlavour for a KindLiteral RunType. bigint
// takes priority over symbol (matching the set-membership order the emitters
// used), then a regexp-shaped Literal map, else primitive. Linear scan —
// Flags holds at most a couple of entries, a map per call was pure churn.
func literalFlavour(rt *reflection.RunType) litFlavour {
	hasSymbol := false
	for _, flag := range rt.Flags {
		if flag == "bigint" {
			return litBigInt
		}
		if flag == "symbol" {
			hasSymbol = true
		}
	}
	if hasSymbol {
		return litSymbol
	}
	return litPrimitive
}
