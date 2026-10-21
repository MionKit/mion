package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// A compact missing slot (absent optional, hidden `nonEnumerable` prop, merged union prop the member lacks) holds
// the first of `0`, `null`, `false` the slot's ENCODED value can never be, so the decoder can tell it from a value.

// wireClasses is a bitset over the three placeholder candidates a compact wire value can be.
type wireClasses uint8

const (
	wireNumber wireClasses = 1 << iota
	wireNull
	wireBoolean
	wireAll = wireNumber | wireNull | wireBoolean
)

// compactWireClasses reports which of number / null / boolean rt's compact encode can be; a revisit adds nothing.
// Unsure answers all three: a wrong "none" lets a real value read as absent, a wrong "all" only costs a byte.
func compactWireClasses(rt *reflection.RunType, ctx *EmitContext, visited map[string]struct{}) wireClasses {
	rt = ctx.ResolveRef(rt)
	if rt == nil {
		return 0
	}
	// Not data: never written.
	if isStrippedUnionMember(rt, ctx) {
		return 0
	}
	if rt.ID != "" {
		if _, seen := visited[rt.ID]; seen {
			return 0
		}
		visited[rt.ID] = struct{}{}
	}
	switch rt.Kind {
	case reflection.KindNumber:
		return wireNumber
	case reflection.KindBoolean:
		return wireBoolean
	case reflection.KindNull, reflection.KindUndefined, reflection.KindVoid:
		// JSON writes an `undefined` array slot as `null`.
		return wireNull
	case reflection.KindLiteral:
		return wireClassesOfLiteral(rt)
	case reflection.KindEnum:
		return wireClassesOfEnum(rt)
	case reflection.KindAny, reflection.KindUnknown, reflection.KindObject, reflection.KindIntersection,
		reflection.KindTypeParameter, reflection.KindInfer, reflection.KindParameter, reflection.KindEnumMember:
		return wireAll
	case reflection.KindString, reflection.KindTemplateLiteral, reflection.KindBigInt,
		reflection.KindArray, reflection.KindTuple, reflection.KindIndexSignature:
		return 0
	case reflection.KindObjectLiteral:
		return wireClassesOfObjectLiteral(rt, ctx)
	case reflection.KindClass:
		return wireClassesOfClass(rt)
	case reflection.KindUnion:
		return wireClassesOfUnion(rt, ctx, visited)
	case reflection.KindProperty, reflection.KindPropertySignature, reflection.KindTupleMember, reflection.KindRest:
		return compactWireClasses(rt.Child, ctx, visited)
	}
	return wireAll
}

// wireClassesOfLiteral: a bigint literal travels as a string, a symbol literal is never written.
func wireClassesOfLiteral(rt *reflection.RunType) wireClasses {
	if literalFlavour(rt) != litPrimitive {
		return 0
	}
	switch rt.Literal.(type) {
	case nil:
		return wireNull
	case bool:
		return wireBoolean
	case string:
		return 0
	}
	return wireNumber
}

// wireClassesOfEnum: a numeric or mixed enum can be a number, a string enum cannot.
func wireClassesOfEnum(rt *reflection.RunType) wireClasses {
	for _, value := range rt.Values {
		if _, isString := value.(string); !isString {
			return wireNumber
		}
	}
	if len(rt.Values) == 0 {
		return wireAll
	}
	return 0
}

// wireClassesOfObjectLiteral: a declared shape travels as an array or keyed object; `{}` admits any non-nullish value.
func wireClassesOfObjectLiteral(rt *reflection.RunType, ctx *EmitContext) wireClasses {
	for _, child := range objectMembers(rt) {
		if member := ctx.ResolveRef(child); member != nil && !member.IsStatic && !isMethodMember(member.Kind) {
			return 0
		}
	}
	return wireAll
}

// wireClassesOfClass: builtins and anonymous classes are strings or arrays; a named one may have a serializer.
func wireClassesOfClass(rt *reflection.RunType) wireClasses {
	if rt.SubKind == reflection.SubKindNone && userClassName(rt) != "" {
		return wireAll
	}
	return 0
}

// wireClassesOfUnion ORs the surviving members.
func wireClassesOfUnion(rt *reflection.RunType, ctx *EmitContext, visited map[string]struct{}) wireClasses {
	var classes wireClasses
	anyUnionMember(rt, ctx, func(member *reflection.RunType, ctx *EmitContext) bool {
		classes |= compactWireClasses(member, ctx, visited)
		return false
	})
	return classes
}

// firstFreePlaceholder with none free answers `null`, ok=false: a present `null` then reads as absent, by design.
func firstFreePlaceholder(classes wireClasses) (string, bool) {
	switch {
	case classes&wireNumber == 0:
		return "0", true
	case classes&wireNull == 0:
		return "null", true
	case classes&wireBoolean == 0:
		return "false", true
	}
	return "null", false
}

// mergedSlotPlaceholder answers `0` for a sub-wrapped slot, always a `[subIdx, value]` array.
// ok=false sends the union keyed: with no free value, a REQUIRED member's `null` would read absent and fail validation.
func mergedSlotPlaceholder(mp FlatMergedProp, ctx *EmitContext) (string, bool) {
	if mp.Required {
		return "", true
	}
	if mp.NeedsSubWrap && len(mp.Candidates) > 1 {
		return "0", true
	}
	var classes wireClasses
	for _, cand := range mp.Candidates {
		classes |= compactWireClasses(cand.ChildRef, ctx, make(map[string]struct{}))
	}
	placeholder, ok := firstFreePlaceholder(classes)
	if ok {
		return placeholder, true
	}
	for _, cand := range mp.Candidates {
		if !cand.Optional && compactWireClasses(cand.ChildRef, ctx, make(map[string]struct{}))&wireNull != 0 {
			return "", false
		}
	}
	return placeholder, true
}
