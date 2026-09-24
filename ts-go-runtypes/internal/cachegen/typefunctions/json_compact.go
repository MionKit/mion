package typefunctions

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// CompactForJsonEmitter is the encode walk of the `compact` JSON strategy, a sibling of PrepareForJsonCloneEmitter that
// differs in ONE arm: an object literal or plain class instance becomes a POSITIONAL ARRAY of its declared properties,
// no key names on the wire. Every other arm is reused from the prepareForJsonClone helpers, and recursion routes back
// through THIS emitter via ctx.CompileChild, so a nested object inside an array, tuple or union member goes positional
// too. Pairs with CompactFromJsonEmitter, which rebuilds the keyed object from positions.
// Wire shape of `{a, b?, c}` in canonical order: `[v.a, (v.b === undefined ? null : v.b), v.c]`, the same `null`
// placeholder TS tuple optionals already use (emitTuplePrepareForJsonClone); the decoder maps `null` back to absent.
type CompactForJsonEmitter struct{}

func (CompactForJsonEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports mirrors the prepareForJson surface: compact handles the same kinds, only the object wire shape differs.
func (CompactForJsonEmitter) Supports(rt *reflection.RunType) bool {
	return jsonWireSupports(rt)
}

func (CompactForJsonEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// EmitDependencyCall is prepareForJsonClone's value-expression dep call, the compact encode never mutating its input.
// The walker namespaces childID into the `cj` family, so a nested dep call resolves the child's compact entry.
func (CompactForJsonEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	return ctx.emitDepCall(childID, ctx.Vλl, "")
}

// Finalize collapses an identity body to `return v` + isNoop=true, like prepareForJsonClone.
// A primitive root has nothing to positionalize, so the walk produces no code and the composite elides to
// `JSON.stringify(v)`.
func (CompactForJsonEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "return v" {
		return "return v", true
	}
	return code, false
}

func (CompactForJsonEmitter) ReturnName() string { return "v" }

// IsNoopType delegates to prepareForJsonClone's predicate: cj reuses pjs's emit for every arm except objects, and BOTH
// treat objects as never-noop, so the delegation is exact.
func (CompactForJsonEmitter) IsNoopType(rt *reflection.RunType, ctx *EmitContext) bool {
	return isNoopForPrepareJsonSafe(rt, ctx)
}

// Emit mirrors PrepareForJsonCloneEmitter.Emit; only the object-literal and plain-class arms go positional.
func (CompactForJsonEmitter) Emit(rt *reflection.RunType, ctx *EmitContext, _ CodeType) RTCode {
	if rt == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	switch rt.Kind {

	case reflection.KindAny, reflection.KindUnknown,
		reflection.KindNull, reflection.KindUndefined,
		reflection.KindString, reflection.KindNumber, reflection.KindBoolean,
		reflection.KindObject, reflection.KindEnum:
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindNever:
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindBigInt:
		return RTCode{Code: v + ".toString()", Type: CodeE}

	case reflection.KindSymbol:
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindRegexp:
		// Unsupported: a RegExp is a pattern the receiver would run, not data, so it is dropped like a function.
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindVoid:
		return RTCode{Code: "undefined", Type: CodeE}

	case reflection.KindClass:
		if reflection.IsTemporalSubKind(rt.SubKind) {
			return RTCode{Code: v + ".toJSON()", Type: CodeE}
		}
		switch rt.SubKind {
		case reflection.SubKindDate:
			return RTCode{Code: v + ".toISOString()", Type: CodeE}
		case reflection.SubKindNone:
			structural := emitObjectCompactForJson(rt, ctx, v)
			return wrapSafeWithClassSerializer(rt, ctx, v, structural)
		case reflection.SubKindMap, reflection.SubKindSet:
			return emitNativeIterableCompactForJson(rt, ctx, v)
		case reflection.SubKindNonSerializable:
			return RTCode{Code: "", Type: CodeNS}
		}
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindPromise:
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindObjectLiteral:
		return emitObjectCompactForJson(rt, ctx, v)

	case reflection.KindIndexSignature:
		return emitIndexSignaturePrepareForJsonClone(rt, ctx, v)

	case reflection.KindTuple:
		return emitTuplePrepareForJsonClone(rt, ctx, v)

	case reflection.KindFunction, reflection.KindMethod,
		reflection.KindMethodSignature, reflection.KindCallSignature:
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindUnion:
		// Reuse the keyed flat-union encode (atomics ride `[memberIndex, value]`, objects merge into `[-1, keyedObject]`):
		// the merged object stays keyed, a union having no single positional shape, while
		// nested objects inside members still go positional via CompileChild.
		// The layout is compact-widened so a union the keyed strategies pass through raw keeps its envelope once a member
		// positionalizes; without it the identity decoder would hand those nested arrays back as-is (union_flat_compact.go).
		return emitUnionPrepareForJsonCloneLayout(rt, ctx, v, buildCompactFlatLayout(rt, ctx))

	case reflection.KindIntersection:
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindTemplateLiteral:
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindLiteral:
		return emitLiteralPrepareForJsonClone(rt, v)

	case reflection.KindArray:
		return emitArrayPrepareForJsonClone(rt, ctx, v)

	case reflection.KindProperty, reflection.KindPropertySignature:
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindTupleMember:
		return RTCode{Code: "", Type: CodeS}
	}
	return RTCode{Code: "", Type: CodeNS}
}

// compactDeclaredSlot is one declared object property occupying a positional slot, in canonical child order.
type compactDeclaredSlot struct {
	name          string
	isSafeName    bool
	optional      bool
	nonEnumerable bool                // guarded: null-placeholder driven by own-enumerability
	childRef      *reflection.RunType // the property's value-type ref (.Child)
}

// objectHasIndexSignature reports whether the object carries any index signature, in which case it stays KEYED: a record
// has no fixed positions to tuple, and a mixed declared-props-plus-index-signature object would only save the declared
// NAMES, an unpredictable fraction of a payload dominated by dynamic keys. Positional is for fixed-shape objects only.
func objectHasIndexSignature(rt *reflection.RunType, ctx *EmitContext) bool {
	for _, child := range objectMembers(rt) {
		if resolved := ctx.ResolveRef(child); resolved != nil && resolved.Kind == reflection.KindIndexSignature {
			return true
		}
	}
	return false
}

// collectCompactDeclaredSlots applies the SAME structural drop filters and drop diagnostics as the keyed object
// emitters and returns the survivors in canonical child order. It is THE source of slot order, shared by the compact
// ENCODE and DECODE emitters so each property's position is identical on both sides.
// Callers pre-route index-signature objects to the keyed path, so such a child is skipped defensively.
func collectCompactDeclaredSlots(rt *reflection.RunType, ctx *EmitContext) []compactDeclaredSlot {
	var slots []compactDeclaredSlot
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if resolved.IsStatic {
			ctx.EmitDiagnosticSlot(SlotStaticDropped, memberLabel(resolved))
			continue
		}
		if isFunctionLikeKind(resolved.Kind) {
			ctx.EmitDiagnosticSlot(SlotMethodDropped, memberLabel(resolved))
			continue
		}
		if resolved.Kind == reflection.KindIndexSignature {
			continue
		}
		if resolved.Kind != reflection.KindProperty && resolved.Kind != reflection.KindPropertySignature {
			continue
		}
		if resolved.Child == nil {
			continue
		}
		propResolved := ctx.ResolveRef(resolved.Child)
		if propResolved == nil {
			continue
		}
		if strippedPropertyDrop(propResolved, resolved.Name, ctx) {
			continue
		}
		slots = append(slots, compactDeclaredSlot{
			name:          resolved.Name,
			isSafeName:    resolved.IsSafeName,
			optional:      resolved.Optional,
			nonEnumerable: isEnumerabilityGuarded(resolved),
			childRef:      resolved.Child,
		})
	}
	return slots
}

// emitObjectCompactForJson is the positional-array object encode: declared properties take positions 0..N-1 in canonical
// order and an absent optional holds the `null` placeholder, so later positions stay aligned.
func emitObjectCompactForJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if objectHasCallSignature(rt, ctx) {
		return RTCode{Code: "", Type: CodeNS}
	}

	// Checked BEFORE slot collection so drop diagnostics are not emitted twice.
	if objectHasIndexSignature(rt, ctx) {
		return emitObjectPrepareForJsonClone(rt, ctx, v)
	}

	slots := collectCompactDeclaredSlots(rt, ctx)
	parts := make([]string, 0, len(slots))
	for _, slot := range slots {
		accessor := propertyAccessor(v, slot.name, slot.isSafeName)
		expr, ok := safeChildExpr(slot.childRef, accessor, ctx)
		if !ok {
			if propertyChildFailed(ctx) {
				return RTCode{Code: "", Type: CodeNS}
			}
			// Absorbed (a future kind with no emit): the decode side decides identically, so positions stay in lockstep.
			continue
		}
		if slot.nonEnumerable {
			// A guarded (lib-global-inherited / `@nonEnumerable`) property holds its value only when it is own-enumerable on
			// v (`JSON.stringify` semantics), else the null placeholder the decoder maps back to absent.
			expr = "(!" + propertyIsEnumerableGuard(v, slot.name) + " ? null : " + expr + ")"
		} else if slot.optional {
			// Absent optional takes the null placeholder compactFromJson maps back to absent, keeping positions aligned.
			expr = "(" + accessor + " === undefined ? null : " + expr + ")"
		}
		parts = append(parts, expr)
	}

	return RTCode{Code: "[" + strings.Join(parts, ",") + "]", Type: CodeE}
}

// emitNativeIterableCompactForJson mirrors emitNativeIterablePrepareForJsonClone EXCEPT its JSON-compatible fast path:
// clone may shortcut to `Array.from(v)` on JSON-compatible inner types, but compact POSITIONALIZES nested object
// elements, so the `allIdentity` gate keeps that shortcut only when compact changes nothing.
func emitNativeIterableCompactForJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	isMap := rt.SubKind == reflection.SubKindMap
	innerTypes := iterableInnerTypes(rt, ctx)
	entryVar := ctx.NextLocalVar("e")
	entryParts := make([]string, 0, len(innerTypes))
	allIdentity := true
	for i, innerType := range innerTypes {
		if innerType == nil {
			continue
		}
		accessor := entryVar
		if isMap {
			accessor = entryVar + "[" + strconv.Itoa(i) + "]"
		}
		expr, ok := safeChildExpr(innerType, accessor, ctx)
		if !ok {
			return RTCode{Code: "", Type: CodeNS}
		}
		if expr != accessor {
			allIdentity = false
		}
		entryParts = append(entryParts, expr)
	}
	if allIdentity {
		return RTCode{Code: "Array.from(" + v + ")", Type: CodeE}
	}
	var perEntry string
	if isMap {
		perEntry = "[" + strings.Join(entryParts, ",") + "]"
	} else {
		perEntry = entryParts[0]
	}
	return RTCode{Code: "Array.from(" + v + ", function(" + entryVar + "){return " + perEntry + "})", Type: CodeE}
}
