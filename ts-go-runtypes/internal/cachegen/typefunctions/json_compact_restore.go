package typefunctions

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// CompactFromJsonEmitter — the decode walk of the `compact` JSON strategy, the
// inverse of CompactForJsonEmitter. Structurally a sibling of
// RestoreFromJsonEmitter, differing in ONE arm: an object literal / plain class
// instance arrives as a POSITIONAL ARRAY (declared props by position, no key
// names) and is rebuilt into a keyed object, applying each property's restore
// transform by position. Every other arm (atomics, arrays, TS tuples, Map/Set,
// unions, pure index signatures) is reused verbatim from the restoreFromJson
// helpers — recursion routes back through THIS emitter via ctx.CompileChild.
//
// The object arm REBINDS its value accessor to the rebuilt object (`v = _r`),
// so it works both inlined (the parent reads the rebound accessor) and as a
// dependency call (the child fn returns the rebuilt object, the parent assigns
// `accessor = fn(accessor)`). Optional slots map the `null` placeholder back to
// absent; a trailing slot (when the type carries an index signature) holds the
// undeclared keys and is merged back into the rebuilt object.
type CompactFromJsonEmitter struct{}

func (CompactFromJsonEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports mirrors the restoreFromJson supported surface.
func (CompactFromJsonEmitter) Supports(rt *reflection.RunType) bool {
	return jsonWireSupports(rt)
}

func (CompactFromJsonEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// EmitDependencyCall captures the child's return into the accessor (`v = <hash>.fn(v)`)
// so a rebound object propagates — same as restoreFromJson.
func (CompactFromJsonEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	return ctx.emitDepCall(childID, ctx.Vλl, ctx.Vλl)
}

func (CompactFromJsonEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "return v" {
		return "return v", true
	}
	return code, false
}

func (CompactFromJsonEmitter) ReturnName() string { return "v" }

// IsNoopType — restoreFromJson's arms with the object arms forced false (the
// positional rebuild is real work where rj would round-trip raw); see
// isNoopForCompactFromJson. Delegating rj's predicate wholesale would be
// UNSOUND — the gate would skip the rebuild and decoded objects would stay
// positional arrays.
func (CompactFromJsonEmitter) IsNoopType(rt *reflection.RunType, ctx *EmitContext) bool {
	return isNoopForCompactFromJson(rt, ctx)
}

// NoopChildComposesAround — an identity child slot passes through unchanged
// (same composition rule as restoreFromJson); empty code composes correctly.
func (CompactFromJsonEmitter) NoopChildComposesAround() {}

// Emit mirrors RestoreFromJsonEmitter.Emit; only the object-literal and
// plain-class (SubKindNone) arms diverge to the positional rebuild.
func (CompactFromJsonEmitter) Emit(rt *reflection.RunType, ctx *EmitContext, _ CodeType) RTCode {
	if rt == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	switch rt.Kind {

	case reflection.KindAny, reflection.KindUnknown,
		reflection.KindNull,
		reflection.KindString, reflection.KindNumber, reflection.KindBoolean,
		reflection.KindObject, reflection.KindEnum:
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindNever:
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindUndefined:
		return RTCode{Code: v + " = undefined", Type: CodeE}

	case reflection.KindVoid:
		return RTCode{Code: v + " = undefined", Type: CodeE}

	case reflection.KindBigInt:
		return RTCode{Code: v + " = typeof " + v + " === 'string' || typeof " + v + " === 'number' ? BigInt(" + v + ") : " + v, Type: CodeE}

	case reflection.KindSymbol:
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindRegexp:
		// Unsupported — a RegExp is a pattern the receiver would run, not data;
		// it is dropped from the wire like a function (DataOnly strips it).
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindClass:
		if info, ok := reflection.TemporalInfoBySubKind(rt.SubKind); ok {
			return RTCode{Code: v + " = typeof " + v + " === 'string' ? " + info.Builtin + ".from(" + v + ") : " + v, Type: CodeE}
		}
		switch rt.SubKind {
		case reflection.SubKindDate:
			return RTCode{Code: v + " = typeof " + v + " === 'string' ? new Date(" + v + ") : " + v, Type: CodeE}
		case reflection.SubKindNone:
			structural := emitObjectCompactFromJson(rt, ctx, v)
			return wrapRestoreWithClassSerializer(rt, ctx, v, structural)
		case reflection.SubKindMap, reflection.SubKindSet:
			return emitNativeIterableRestoreFromJson(rt, ctx, v)
		case reflection.SubKindNonSerializable:
			return RTCode{Code: "", Type: CodeNS}
		}
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindPromise:
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindObjectLiteral:
		return emitObjectCompactFromJson(rt, ctx, v)

	case reflection.KindProperty, reflection.KindPropertySignature:
		return emitPropertyRestoreFromJson(rt, ctx, v)

	case reflection.KindIndexSignature:
		return emitIndexSignatureRestoreFromJson(rt, ctx, v)

	case reflection.KindTuple:
		return emitTupleRestoreFromJson(rt, ctx, v)

	case reflection.KindTupleMember:
		return emitTupleMemberRestoreFromJson(rt, ctx, v)

	case reflection.KindFunction, reflection.KindMethod,
		reflection.KindMethodSignature, reflection.KindCallSignature:
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindUnion:
		// Reuse the keyed flat-union decode — symmetric with the compact encode,
		// which reuses the keyed flat-union encode (object members merge into a
		// keyed `[-1, object]` envelope; only nested objects go positional). Same
		// compact-widened layout as the encode, so both sides agree on whether
		// the envelope is on the wire (union_flat_compact.go).
		return emitUnionRestoreFromJsonFlatLayout(rt, ctx, v, buildCompactFlatLayout(rt, ctx))

	case reflection.KindIntersection:
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindTemplateLiteral:
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindLiteral:
		return emitLiteralRestoreFromJson(rt, v)

	case reflection.KindArray:
		if rt.Child == nil {
			return RTCode{Code: "", Type: CodeS}
		}
		return emitElementLoop(rt.Child, ctx, v, "0")
	}
	return RTCode{Code: "", Type: CodeNS}
}

// emitObjectCompactFromJson — the positional-array object decode. Restores each
// declared property's value by position (the SAME canonical order the encoder
// used, via the shared collectCompactDeclaredSlots), then rebuilds the keyed
// object and REBINDS the value accessor to it. An object carrying an index
// signature arrived keyed (the encode kept it keyed), so it restores in place
// via the shared keyed restore walk — symmetric with emitObjectCompactForJson.
func emitObjectCompactFromJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if objectHasCallSignature(rt, ctx) {
		return RTCode{Code: "", Type: CodeNS}
	}

	// Index signature present → keyed object on the wire, keyed restore in place
	// (mirrors emitObjectCompactForJson's keyed encode for these shapes).
	if objectHasIndexSignature(rt, ctx) {
		return emitObjectJsonChildren(rt, ctx)
	}

	slots := collectCompactDeclaredSlots(rt, ctx)
	rVar := ctx.NextLocalVar("r")
	var restore strings.Builder
	// The positional wire of an object is an array. Anything else is left
	// untouched for validate to refuse: rebuilding from `v[0]`, `v[1]` of a
	// number or a boolean would otherwise launder junk into an empty object,
	// which a type whose props are all optional accepts.
	restore.WriteString("if (Array.isArray(" + v + ")) {")

	// writeSlot records a kept property's position + key so the rebuild reads the
	// restored slot back into the keyed object.
	type writeSlot struct {
		pos        int
		name       string
		isSafeName bool
		optional   bool
	}
	var writes []writeSlot
	pos := 0
	for _, slot := range slots {
		accessor := v + "[" + strconv.Itoa(pos) + "]"
		ctx.SetChildAccessor(accessor)
		childRT := ctx.CompileChild(slot.childRef, CodeS)
		ctx.SetChildAccessor("")
		if childRT.Type == CodeNS {
			if propertyChildFailed(ctx) {
				return RTCode{Code: "", Type: CodeNS}
			}
			// Absorbed (a future kind with no emit) — no position, identical to
			// the encode side, so the remaining positions stay in lockstep.
			continue
		}
		if slot.optional {
			// Map the null placeholder back to absent, then run the child
			// transform only on a present (non-undefined) value. Mirrors
			// emitTupleMemberRestoreFromJson.
			restore.WriteString("if (" + accessor + " === null) {" + accessor + " = undefined}")
			if childRT.Code != "" {
				restore.WriteString(" else if (" + accessor + " !== undefined) {" + childRT.Code + "}")
			}
		} else if childRT.Code != "" {
			restore.WriteString(childRT.Code)
			if !strings.HasSuffix(childRT.Code, "}") && !strings.HasSuffix(childRT.Code, ";") {
				restore.WriteString(";")
			}
		}
		writes = append(writes, writeSlot{pos: pos, name: slot.name, isSafeName: slot.isSafeName, optional: slot.optional})
		pos++
	}

	// Rebuild the keyed object from the restored positions.
	restore.WriteString("const " + rVar + " = {};")
	for _, w := range writes {
		accessor := v + "[" + strconv.Itoa(w.pos) + "]"
		target := propertyAccessor(rVar, w.name, w.isSafeName)
		if w.optional {
			restore.WriteString("if (" + accessor + " !== undefined) {" + target + " = " + accessor + ";}")
		} else {
			restore.WriteString(target + " = " + accessor + ";")
		}
	}

	restore.WriteString(v + " = " + rVar + ";}")
	return RTCode{Code: restore.String(), Type: CodeS}
}
