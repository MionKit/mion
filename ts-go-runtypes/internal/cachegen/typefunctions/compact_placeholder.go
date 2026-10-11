package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// The compact strategy writes a missing slot (an absent optional, a hidden `nonEnumerable` prop, a merged union prop
// the value's member does not carry) as a placeholder: the first of `0`, `null`, `false` the slot's ENCODED value can
// never be, so the decoder can tell "absent" from every value the slot can hold. compactWireClasses answers which of
// the three a slot's wire value can be; a slot that can be all three has no free placeholder.

// wireClasses is a bitset over the three placeholder candidates a compact wire value can be.
type wireClasses uint8

const (
	wireNumber wireClasses = 1 << iota
	wireNull
	wireBoolean
	wireAll = wireNumber | wireNull | wireBoolean
)

// compactWireClasses reports which of number / null / boolean the compact encode of a value of rt can produce.
// Unsure answers all three: a wrong "none" would let a real value read as absent, a wrong "all" only costs a byte.
// visited is the cycle set: a revisit adds nothing (least fixpoint).
func compactWireClasses(rt *reflection.RunType, ctx *EmitContext, visited map[string]struct{}) wireClasses {
	rt = ctx.ResolveRef(rt)
	if rt == nil {
		return 0
	}
	if rt.ID != "" {
		if _, seen := visited[rt.ID]; seen {
			return 0
		}
		visited[rt.ID] = struct{}{}
	}
	// A user compactForJson override owns the wire shape.
	if overrideHashForTag(rt, "cj") != "" {
		return wireAll
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
	case reflection.KindNever, reflection.KindSymbol, reflection.KindRegexp, reflection.KindPromise,
		reflection.KindFunction, reflection.KindMethod, reflection.KindMethodSignature, reflection.KindCallSignature:
		// Not data: never written.
		return 0
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

// wireClassesOfObjectLiteral: a declared shape travels as an array or a keyed object. `{}` admits any non-nullish
// value, so it answers all three.
func wireClassesOfObjectLiteral(rt *reflection.RunType, ctx *EmitContext) wireClasses {
	for _, child := range rt.Children {
		if member := ctx.ResolveRef(child); member != nil && !member.IsStatic && !isMethodMember(member.Kind) {
			return 0
		}
	}
	return wireAll
}

// wireClassesOfClass: builtins travel as strings or arrays, an anonymous class as an array; a named user class may
// carry a registered serializer that writes anything.
func wireClassesOfClass(rt *reflection.RunType) wireClasses {
	if rt.SubKind == reflection.SubKindNone && userClassName(rt) != "" {
		return wireAll
	}
	return 0
}

// wireClassesOfUnion ORs the surviving members: a member stripped by DataOnly is never written.
func wireClassesOfUnion(rt *reflection.RunType, ctx *EmitContext, visited map[string]struct{}) wireClasses {
	children := rt.SafeUnionChildren
	if len(children) == 0 {
		children = rt.Children
	}
	var classes wireClasses
	for _, ref := range children {
		resolved := ctx.ResolveRef(ref)
		if resolved == nil || isStrippedUnionMember(resolved, ctx) {
			continue
		}
		classes |= compactWireClasses(resolved, ctx, visited)
	}
	return classes
}

// firstFreePlaceholder picks the first of `0`, `null`, `false` outside classes.
func firstFreePlaceholder(classes wireClasses) (string, bool) {
	switch {
	case classes&wireNumber == 0:
		return "0", true
	case classes&wireNull == 0:
		return "null", true
	case classes&wireBoolean == 0:
		return "false", true
	}
	return "", false
}

// compactSlotPlaceholder is a plain compact object slot's placeholder. With no free value it falls back to `null`:
// a present `null` then reads as absent, the documented collapse of an `any` / `unknown` optional.
func compactSlotPlaceholder(childRef *reflection.RunType, ctx *EmitContext) string {
	if placeholder, ok := firstFreePlaceholder(compactWireClasses(childRef, ctx, make(map[string]struct{}))); ok {
		return placeholder
	}
	return "null"
}

// mergedSlotPlaceholder is a positional merged union slot's placeholder, empty for a Required slot.
// A sub-wrapped slot is always a `[subIdx, value]` array. With no free value `null` still works unless a member
// declaring the prop REQUIRED can hold `null`: that `null` would read as absent and fail validation, so ok=false
// sends the whole union back to the keyed form.
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
	if placeholder, ok := firstFreePlaceholder(classes); ok {
		return placeholder, true
	}
	for _, cand := range mp.Candidates {
		if cand.RequiredSomewhere && compactWireClasses(cand.ChildRef, ctx, make(map[string]struct{}))&wireNull != 0 {
			return "", false
		}
	}
	return "null", true
}
