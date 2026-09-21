package typefunctions

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// CompactFromJsonEmitter is the decode walk of the `compact` JSON strategy, the inverse of CompactForJsonEmitter and a
// sibling of RestoreFromJsonEmitter differing in ONE arm: an object arrives as a POSITIONAL ARRAY and is rebuilt into a
// keyed object, each property's restore applied by position. Every other arm is reused from the restoreFromJsonMutate
// helpers, and recursion routes back through THIS emitter via ctx.CompileChild.
// The object arm REBINDS its accessor to the rebuilt object (`v = _r`), so it works inlined and as a dependency call.
// An optional slot maps the `null` placeholder back to absent.
type CompactFromJsonEmitter struct{}

func (CompactFromJsonEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports mirrors the restoreFromJsonMutate supported surface.
func (CompactFromJsonEmitter) Supports(rt *reflection.RunType) bool {
	return jsonWireSupports(rt)
}

func (CompactFromJsonEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// EmitDependencyCall captures the child's return into the accessor so a rebound object propagates.
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

// IsNoopType is restoreFromJsonMutate's arms with the object arms forced false: delegating rj's predicate wholesale
// would skip the rebuild and decoded objects would stay positional arrays.
func (CompactFromJsonEmitter) IsNoopType(rt *reflection.RunType, ctx *EmitContext) bool {
	return isNoopForCompactFromJson(rt, ctx)
}

// NoopChildComposesAround — an identity child slot passes through unchanged, as in restoreFromJsonMutate.
func (CompactFromJsonEmitter) NoopChildComposesAround() {}

// Emit mirrors RestoreFromJsonEmitter.Emit; only the object-literal and plain-class arms do the positional rebuild.
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
		return RTCode{Code: bigintRestoreCode(v, ctx), Type: CodeE}

	case reflection.KindSymbol:
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindRegexp:
		// Unsupported: a RegExp is a pattern the receiver would run, not data, so it is dropped like a function.
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
		// The SAFE restore over the same compact-widened layout the compact encode writes with (union_flat_compact.go), so
		// both sides agree on whether the envelope is on the wire.
		// The merged object stays KEYED even under compact, so it has room for an undeclared key and the positional
		// argument for skipping the rebuild does not apply.
		return emitUnionRestoreFromJsonCloneLayout(rt, ctx, v, buildCompactFlatLayout(rt, ctx))

	case reflection.KindIntersection:
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindTemplateLiteral:
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindLiteral:
		return emitLiteralRestoreFromJson(rt, ctx, v)

	case reflection.KindArray:
		if rt.Child == nil {
			return RTCode{Code: "", Type: CodeS}
		}
		return emitElementLoop(rt.Child, ctx, v, "0")
	}
	return RTCode{Code: "", Type: CodeNS}
}

// emitObjectCompactFromJson is the positional-array object decode: it restores each declared property by position, in
// the SAME canonical order the encoder used (shared collectCompactDeclaredSlots), then rebuilds the keyed object and
// REBINDS the accessor to it. An object carrying an index signature arrived keyed, so it restores in place instead.
func emitObjectCompactFromJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if objectHasCallSignature(rt, ctx) {
		return RTCode{Code: "", Type: CodeNS}
	}

	// Keyed on the wire, so restore in place, mirroring emitObjectCompactForJson's keyed encode for these shapes.
	if objectHasIndexSignature(rt, ctx) {
		return emitObjectJsonChildren(rt, ctx)
	}

	slots := collectCompactDeclaredSlots(rt, ctx)
	rVar := ctx.NextLocalVar("r")
	var restore strings.Builder
	// The positional wire of an object is an array; anything else is left untouched for validate to refuse, since
	// rebuilding from `v[0]` of a number or boolean would launder junk into an empty object an all-optional type accepts.
	restore.WriteString("if (Array.isArray(" + v + ")) {")

	// writeSlot records a kept property's position and key so the rebuild reads the restored slot into the keyed object.
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
			// Absorbed (a future kind with no emit): no position, identical to the encode side, so positions stay in lockstep.
			continue
		}
		if slot.optional {
			// The null placeholder maps back to absent, then the child transform runs only on a present value, as in
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
