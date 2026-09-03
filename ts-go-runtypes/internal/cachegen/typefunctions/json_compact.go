package typefunctions

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// CompactForJsonEmitter — the encode walk of the `compact` JSON strategy.
//
// Structurally a sibling of PrepareForJsonSafeEmitter (non-mutating, strips
// undeclared keys by construction), differing in ONE arm: an object literal /
// plain class instance is emitted as a POSITIONAL ARRAY of its declared
// properties (no key names on the wire) instead of a keyed object literal. Every
// other arm (atomics, bigint/Date/Temporal/RegExp, arrays, TS tuples, Map/Set,
// unions, pure index signatures) is reused verbatim from the prepareForJsonSafe
// helpers — recursion routes back through THIS emitter via ctx.CompileChild
// (the walker dispatches children against the active family's emitter), so a
// nested object inside an array / tuple / union member also becomes a positional
// array. Pairs with CompactFromJsonEmitter, which rebuilds the keyed object from
// positions.
//
// Wire shape of an object `{a, b?, c}` with declared canonical order a,b,c:
//
//	[v.a, (v.b === undefined ? null : v.b), v.c]
//
// Optionals ride a `null` placeholder (same convention TS tuple optionals
// already use — see emitTuplePrepareForJsonSafe); the decoder maps `null` back
// to absent.
//
// Any object carrying an index signature (a record, OR a fixed object that also
// has dynamic keys) is NOT tupled — it serializes as a keyed object via the
// shared clone emit. A record has no fixed positions to tuple, and a mixed
// declared-props-plus-index-signature object would only elide the declared-prop
// NAMES, a small and unpredictable fraction of a payload dominated by dynamic
// keys. So the positional form applies ONLY to fixed-shape objects with no index
// signature; a nested fixed object inside a record still goes positional.
type CompactForJsonEmitter struct{}

func (CompactForJsonEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports mirrors the prepareForJson supported surface — compact handles the
// same kinds, only the object wire shape differs.
func (CompactForJsonEmitter) Supports(rt *reflection.RunType) bool {
	return jsonWireSupports(rt)
}

func (CompactForJsonEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// EmitDependencyCall — same value-expression dep call as prepareForJsonSafe (the
// compact encode never mutates the input). The walker namespaces childID into
// the `cj` family, so a nested object's dep call resolves the child's compact
// entry, not its clone entry.
func (CompactForJsonEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	return ctx.emitDepCall(childID, ctx.Vλl, "")
}

// Finalize — identity bodies collapse to `return v` + isNoop=true, exactly like
// prepareForJsonSafe. For a primitive root (nothing to positionalize) the walk
// produces no code, so the compact composite elides to `JSON.stringify(v)`.
//
// Note: compact deliberately does NOT implement NoopTypePredicate (IsNoopType).
// prepareForJsonSafe is noop for an extra-proof `{a: string}`, but compact turns
// that into `[v.a]` — NOT identity — so reusing its predicate would be unsound.
// Leaving it unimplemented makes every object live (a false negative only costs
// bytes, never correctness), and the Finalize empty-body path still marks a
// truly identity (atomic-root) walk as noop.
func (CompactForJsonEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "return v" {
		return "return v", true
	}
	return code, false
}

func (CompactForJsonEmitter) ReturnName() string { return "v" }

// IsNoopType delegates to prepareForJsonSafe's predicate: cj reuses pjs's
// emit for every arm except objects, and BOTH treat objects as never-noop
// (pjs always clones, cj always builds the positional array) — so the
// delegation is exact.
func (CompactForJsonEmitter) IsNoopType(rt *reflection.RunType, ctx *EmitContext) bool {
	return isNoopForPrepareJsonSafe(rt, ctx)
}

// NoopChildComposesAround — cj shares pjs's composition rule (an elided
// child slot is shared by reference), so empty code composes correctly.
func (CompactForJsonEmitter) NoopChildComposesAround() {}

// Emit mirrors PrepareForJsonSafeEmitter.Emit; only the object-literal and
// plain-class (SubKindNone) arms diverge to the positional form. Everything else
// delegates to the shared prepareForJsonSafe helpers.
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
		// Unsupported — a RegExp is a pattern the receiver would run, not data;
		// it is dropped from the wire like a function (DataOnly strips it).
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
		return emitIndexSignaturePrepareForJsonSafe(rt, ctx, v)

	case reflection.KindTuple:
		return emitTuplePrepareForJsonSafe(rt, ctx, v)

	case reflection.KindFunction, reflection.KindMethod,
		reflection.KindMethodSignature, reflection.KindCallSignature:
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindUnion:
		// Reuse the keyed flat-union encode: atomic members ride
		// `[memberIndex, value]`, object members merge into `[-1, keyedObject]`.
		// The merged object stays keyed (a union has no single positional shape);
		// nested objects inside members still become positional via CompileChild.
		// The layout is compact-widened: a union the keyed strategies pass
		// through raw keeps the envelope when a member positionalizes, or the
		// identity decoder would hand those nested arrays back as-is
		// (union_flat_compact.go).
		return emitUnionPrepareForJsonSafeLayout(rt, ctx, v, buildCompactFlatLayout(rt, ctx))

	case reflection.KindIntersection:
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindTemplateLiteral:
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindLiteral:
		return emitLiteralPrepareForJsonSafe(rt, v)

	case reflection.KindArray:
		return emitArrayPrepareForJsonSafe(rt, ctx, v)

	case reflection.KindProperty, reflection.KindPropertySignature:
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindTupleMember:
		return RTCode{Code: "", Type: CodeS}
	}
	return RTCode{Code: "", Type: CodeNS}
}

// compactDeclaredSlot is one declared object property that occupies a positional
// slot in the compact wire (in canonical child order).
type compactDeclaredSlot struct {
	name          string
	isSafeName    bool
	optional      bool
	nonEnumerable bool                // guarded: null-placeholder driven by own-enumerability
	childRef      *reflection.RunType // the property's value-type ref (.Child)
}

// objectHasIndexSignature reports whether the object carries any index
// signature. Such objects serialize as a keyed object (not a positional array):
// a record has no fixed positions to tuple, and a mixed declared-props-plus-
// index-signature object would only save the declared-prop NAMES, a small and
// unpredictable fraction of a payload dominated by dynamic keys. So the
// positional form applies ONLY to fixed-shape objects with no index signature.
func objectHasIndexSignature(rt *reflection.RunType, ctx *EmitContext) bool {
	for _, child := range rt.Children {
		if resolved := ctx.ResolveRef(child); resolved != nil && resolved.Kind == reflection.KindIndexSignature {
			return true
		}
	}
	return false
}

// collectCompactDeclaredSlots applies the SAME structural drop filters as the
// keyed object emitters (static fields, methods/functions, directly-stripped
// values) and returns the surviving declared properties in canonical child
// order. Shared by the compact ENCODE and DECODE emitters so the positional
// index of each property is identical on both sides — the single source of slot
// order. Only ever called for objects WITHOUT an index signature (the caller
// pre-routes index-sig objects to the keyed path), so an index-signature child
// is skipped defensively. Emits the same drop diagnostics the keyed emitters do.
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

// emitObjectCompactForJson — the positional-array object encode. Declared
// properties occupy positions 0..N-1 in canonical order; an absent optional
// holds the `null` placeholder so later positions stay aligned. An object that
// carries ANY index signature (a record, or a declared-props-plus-extras shape)
// is NOT tupled — it serializes as a keyed object via the shared clone emit, so
// records and dynamic-key maps stay keyed exactly like every other strategy.
func emitObjectCompactForJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if objectHasCallSignature(rt, ctx) {
		return RTCode{Code: "", Type: CodeNS}
	}

	// Index signature present → keyed object (reuse clone's keyed emit). Checked
	// BEFORE slot collection so drop diagnostics aren't emitted twice.
	if objectHasIndexSignature(rt, ctx) {
		return emitObjectPrepareForJsonSafe(rt, ctx, v)
	}

	// Positional expressions for each declared property.
	slots := collectCompactDeclaredSlots(rt, ctx)
	parts := make([]string, 0, len(slots))
	for _, slot := range slots {
		accessor := propertyAccessor(v, slot.name, slot.isSafeName)
		expr, ok := safeChildExpr(slot.childRef, accessor, ctx)
		if !ok {
			if propertyChildFailed(ctx) {
				return RTCode{Code: "", Type: CodeNS}
			}
			// Absorbed (a future kind with no emit — never produced by a real
			// scan today). The decode side makes the identical decision, so the
			// remaining positions stay in lockstep.
			continue
		}
		if slot.nonEnumerable {
			// A guarded (lib-global-inherited / `@nonEnumerable`) property holds
			// its value only when it is an OWN-ENUMERABLE property of v
			// (`JSON.stringify` semantics); otherwise the null placeholder, which
			// the decoder maps back to absent — same positional alignment as an
			// absent optional.
			expr = "(!" + propertyIsEnumerableGuard(v, slot.name) + " ? null : " + expr + ")"
		} else if slot.optional {
			// Absent optional → null placeholder so later positions stay aligned;
			// the decoder maps null back to absent (compactFromJson).
			expr = "(" + accessor + " === undefined ? null : " + expr + ")"
		}
		parts = append(parts, expr)
	}

	return RTCode{Code: "[" + strings.Join(parts, ",") + "]", Type: CodeE}
}

// emitNativeIterableCompactForJson is the compact-strategy Map/Set encode. It
// mirrors emitNativeIterablePrepareForJsonSafe EXCEPT the JSON-compatible fast
// path: clone may shortcut to `Array.from(v)` when every inner type is
// JSON-compatible (keyed object elements survive unchanged, which the clone
// decoder expects), but compact POSITIONALIZES nested object elements, so it
// must run the per-element transform whenever it is not identity. The
// `allIdentity` gate keeps the cheap `Array.from(v)` only when compact changes
// nothing — symmetric with emitNativeIterableRestoreFromJson, which already
// gates its loop on the per-element restore code being non-empty.
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
