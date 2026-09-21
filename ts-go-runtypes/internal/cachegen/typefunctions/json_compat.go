package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// isJsonCompatible reports whether values of `rt` round-trip identically through native `JSON.parse(JSON.stringify(v))`
// AND get no encode/decode transform from any JSON emit family. Both halves matter: Date needs no encode work (toJSON is
// enough), but the decode MUST call `new Date(...)`, so the round-trip is not identity-preserving and Date is false.
// It is the sole input to the union wrap-or-not decision (unionNeedsTuple / atomicBranchNeedsTuple /
// mergedPropNeedsSubWrap): either every member is compatible and the union rides raw, or EVERY member's encoded form
// wraps so the decoder unwraps unconditionally. Nothing sniffs the shape at runtime.
// Cycles: a re-entry on a visited `rt.ID` counts as compatible; a non-cycle leaf that is not makes the outer call false.
func isJsonCompatible(rt *reflection.RunType, ctx *EmitContext) bool {
	// Resolve first: jsonCompatRecursive has no KindRef arm, so an unresolved ref would fall through to `return false` and
	// be memoized under the target type's structural id, poisoning its verdict for every later caller.
	// Map/Set inner types reach here as unresolved refs, so this guard is load-bearing.
	rt = ctx.ResolveRef(rt)
	if rt != nil && rt.ID != "" {
		if verdict, known := ctx.walker.factsLookup(factJsonCompat, rt.ID); known {
			return verdict
		}
	}
	result := jsonCompatRecursive(rt, ctx, make(map[string]struct{}))
	// Only COMPLETED top-level walks are stored: an intermediate node's in-walk value can depend on the cycle-back
	// assumption for an ancestor still on the stack, so it is not context-free. The top-level result is.
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
		// A completed top-level verdict is context-free, so it is reusable at any depth.
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
		// A bigint / symbol literal has an encode-side transform; a primitive literal is a noop.
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
		// The per-prop emit skips a function-typed property (emitPropertyPrepareForJson), so it contributes no transform
		// and counts as compatible for the wrap decision.
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
		return objectChildrenCompat(objectMembers(rt), ctx, visited)

	case reflection.KindIntersection:
		// Defensive: the checker usually pre-resolves intersections; one that slips through is compatible iff its parts are.
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
			// A member bucketing into the merged-object branch forces the `[-1, …]` envelope across the WHOLE union
			// (union_flat_layout.go: AtomicNeedsTuple), so the union does NOT ride raw even with every member compatible.
			// Without this a consumer trusting "no transform" fast-paths past the envelope on encode while the decoder still
			// unwraps it (G5). Mirrors unionJsonNoop's decode arm (noop_types.go).
			if unionMemberEnvelopes(resolved, ctx) {
				return false
			}
		}
		return true

	case reflection.KindClass:
		if reflection.IsTemporalSubKind(rt.SubKind) {
			// A Temporal serializes via toJSON() to a string, like Date, so a union containing one wraps.
			return false
		}
		switch rt.SubKind {
		case reflection.SubKindDate,
			reflection.SubKindMap,
			reflection.SubKindSet,
			reflection.SubKindNonSerializable:
			return false
		case reflection.SubKindNone:
			return objectChildrenCompat(objectMembers(rt), ctx, visited)
		}
		return false
	}
	return false
}

// unionMemberEnvelopes reports whether a resolved union member buckets into the flat-union merged-object branch, which
// forces the `[-1, …]` envelope across the whole union. Mirrors buildFlatLayout's ObjectMembers bucketing
// (union_flat_layout.go) and unionJsonNoop's decode arm (noop_types.go).
// An object-like member with an index signature stays in the ATOMIC bucket, and a Date / Map / Set member is
// non-JSON-compatible: both are caught by the per-member compat check instead.
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

// objectChildrenCompat is the shared body for ObjectLiteral and plain Class; it skips static and function-like members
// the same way the per-kind dispatch does.
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

// litFlavour classifies a KindLiteral's serialization flavour, shared by the JSON emit families, which differ only in
// the per-family leaf op: a bigint or symbol literal carries a value transform, a primitive literal is a noop.
type litFlavour int

const (
	litPrimitive litFlavour = iota
	litBigInt
	litSymbol
)

// literalFlavour returns the litFlavour for a KindLiteral RunType; bigint takes priority over symbol, matching the
// set-membership order the emitters used. Linear scan: Flags holds a couple of entries, a map per call was churn.
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
