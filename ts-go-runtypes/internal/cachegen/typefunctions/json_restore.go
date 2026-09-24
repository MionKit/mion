package typefunctions

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// RestoreFromJsonEmitter implements `restoreFromJsonMutate`, rebuilding the runtime shape from a JSON.parse value.
// Paired with PrepareForJsonEmitter: `restoreFromJsonMutate(JSON.parse(JSON.stringify(prepareForJson(v))))` must deep-equal v.
// Mirrors the per-kind emitRestoreFromJson methods (ref: packages/run-types/src/nodes/**).
type RestoreFromJsonEmitter struct{}

// Args mirrors `rtArgs.vλl = 'v'`, the same single-arg shape as PrepareForJsonEmitter.
func (RestoreFromJsonEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports is the shared JSON-wire kind set: every kind the prepare side handles has a restore arm.
func (RestoreFromJsonEmitter) Supports(rt *reflection.RunType) bool {
	return jsonWireSupports(rt)
}

func (RestoreFromJsonEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// IsNoopType gates dispatch: an external child whose restore is the identity composes as empty code, no dep call or
// import. Soundness contract in noop_types.go.
func (RestoreFromJsonEmitter) IsNoopType(rt *reflection.RunType, ctx *EmitContext) bool {
	return isNoopForRestoreJson(rt, ctx)
}

// NoopChildComposesAround — a value slot that round-trips raw needs no rebuild; empty code composes correctly.
func (RestoreFromJsonEmitter) NoopChildComposesAround() {}

// ReturnName is `v`: restoreFromJsonMutate rebinds v and returns the reconstructed value.
func (RestoreFromJsonEmitter) ReturnName() string {
	return "v"
}

// Emit dispatches the per-kind switch, each arm mirroring that kind's emitRestoreFromJson.
// A converting arm rebuilds only from the exact wire form and leaves any other value for validate to refuse.
// The JS bare-expression form (`BigInt(v)`) is emitted as `v = BigInt(v)`, so v is mutated before the trailing `return v`.
func (RestoreFromJsonEmitter) Emit(rt *reflection.RunType, ctx *EmitContext, _ CodeType) RTCode {
	if rt == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	switch rt.Kind {

	case reflection.KindAny, reflection.KindUnknown,
		reflection.KindNull,
		reflection.KindString, reflection.KindNumber, reflection.KindBoolean,
		reflection.KindObject, reflection.KindEnum:
		// AtomicRunType default — noop.
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindNever:
		// (ref: nodes/atomic/never.ts) — a never type cannot be decoded from JSON.
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindUndefined:
		// JSON has no undefined, so the parsed input may be null or missing; force-rebind (ref: nodes/atomic/undefined.ts).
		return RTCode{Code: v + " = undefined", Type: CodeE}

	case reflection.KindVoid:
		return RTCode{Code: v + " = undefined", Type: CodeE}

	case reflection.KindBigInt:
		return RTCode{Code: bigintRestoreCode(v, ctx), Type: CodeE}

	case reflection.KindSymbol:
		// Unsupported — symmetric with prepareForJson's symbol arm.
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
			structural := emitObjectJsonChildren(rt, ctx)
			return wrapRestoreWithClassSerializer(rt, ctx, v, structural)
		case reflection.SubKindMap, reflection.SubKindSet:
			return emitNativeIterableRestoreFromJson(rt, ctx, v)
		case reflection.SubKindNonSerializable:
			// (ref: nodes/native/nonSerializable.ts) — RT compilation is disabled for non-serializable types.
			return RTCode{Code: "", Type: CodeNS}
		}
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindPromise:
		// (ref: nodes/native/promise.ts) — a Promise is non-serializable, same as on the prepare side.
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindObjectLiteral:
		return emitObjectJsonChildren(rt, ctx)

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
		// (ref: nodes/function/function.ts) — a function has no restore; params and return are compiled separately.
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindUnion:
		// Decodes the flat-union wire shape of emitUnionPrepareForJsonFlat (union_flat.go).
		return emitUnionRestoreFromJsonFlat(rt, ctx, v)

	case reflection.KindIntersection:
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindTemplateLiteral:
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindLiteral:
		return emitLiteralRestoreFromJson(rt, ctx, v)

	case reflection.KindArray:
		// Each element gets the child's restore applied in place; empty child code collapses the loop to a noop.
		if rt.Child == nil {
			return RTCode{Code: "", Type: CodeS}
		}
		return emitElementLoop(rt.Child, ctx, v, "0")
	}
	return RTCode{Code: "", Type: CodeNS}
}

// emitLiteralRestoreFromJson defers to the base kind, with the same flag dispatch as emitLiteralPrepareForJson.
func emitLiteralRestoreFromJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	switch literalFlavour(rt) {
	case litBigInt:
		return RTCode{Code: bigintRestoreCode(v, ctx), Type: CodeE}
	case litSymbol:
		// Nothing is encoded, so there is no wire form to restore.
		return RTCode{Code: "", Type: CodeNS}
	}
	// Primitive literal — noop.
	return RTCode{Code: "", Type: CodeS}
}

// emitPropertyRestoreFromJson — sibling of emitPropertyPrepareForJson.
func emitPropertyRestoreFromJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if strippedPropertyDrop(resolved, rt.Name, ctx) {
		// Directly DataOnly-stripped value — drop the property.
		return RTCode{Code: "", Type: CodeS}
	}
	accessor := propertyAccessor(v, rt.Name, rt.IsSafeName)
	ctx.SetChildAccessor(accessor)
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		// A stripped leaf in a propagating slot (symbol[], …) fails the object; any other unsupported kind is absorbed (F3).
		if propertyChildFailed(ctx) {
			return RTCode{Code: "", Type: CodeNS}
		}
		return RTCode{Code: "", Type: CodeS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	if rt.Optional {
		return RTCode{
			Code: "if (" + propertyPresenceTest(rt, v, accessor) + ") {" + childRT.Code + "}",
			Type: CodeS,
		}
	}
	return childRT
}

// emitIndexSignatureRestoreFromJson is the sibling of emitIndexSignaturePrepareForJson, which holds the full rationale.
// Symbol-keyed signatures are skipped per the IndexSignatureRunType.skipRT contract (ref: indexProperty.ts).
func emitIndexSignatureRestoreFromJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if isSymbolKeyedIndexSig(rt, ctx) {
		return RTCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if isFunctionLikeKind(resolved.Kind) {
		return RTCode{Code: "", Type: CodeS}
	}
	keyRegexVar := indexSignatureKeyRegexVar(rt, ctx)
	keyVar := ctx.NextLocalVar("k")
	ctx.SetChildAccessor(v + "[" + keyVar + "]")
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	// The key loop ships even when the child needs no rebuild: the prototype-name refusal is the decoder's own rule, not
	// the child's, so a `Record<string, string>` decoder is a real function, never the JSON.parse identity.
	// noop_types.go (KindIndexSignature in restore mode) says the same, so the composite binds this body instead of eliding
	// it; a noop entry carrying security code would lie about being a noop.
	body := "for (const " + keyVar + " in " + v + ") {"
	// A prototype-named wire key is refused at decode time, on both roads.
	body += unsafeKeyThrow(keyVar)
	// Skip declared sibling keys, they own their own decode (G1): else a `number` prop under `[k: number]: bigint` decodes
	// to a bigint.
	body += siblingNamedSkipCode(rt, ctx, keyVar)
	if keyRegexVar != "" {
		body += "if (!" + keyRegexVar + ".test(" + keyVar + ")) continue;"
	}
	body += childRT.Code + "}"
	return RTCode{Code: body, Type: CodeS}
}

// emitTupleRestoreFromJson — sibling of emitTuplePrepareForJson.
func emitTupleRestoreFromJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if len(rt.Children) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	var parts []string
	for _, child := range rt.Children {
		childRT := ctx.CompileChild(child, CodeS)
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code != "" {
			parts = append(parts, childRT.Code)
		}
	}
	if len(parts) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	return RTCode{Code: strings.Join(parts, ";"), Type: CodeS}
}

// emitTupleMemberRestoreFromJson inverts emitTupleMemberPrepareForJson's pad-with-null: an optional `null` slot becomes
// `undefined`.
func emitTupleMemberRestoreFromJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if resolved := ctx.ResolveRef(rt.Child); resolved == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	// A function-typed slot falls through to CompileChild so its CodeNS reaches the renderer as an alwaysThrow; restoring
	// it to `undefined` would hide the unsupported shape.
	if isRestTupleMember(rt) {
		return emitElementLoop(rt.Child, ctx, v, positionStr(rt))
	}
	idxLit := positionStr(rt)
	accessor := v + "[" + idxLit + "]"
	ctx.SetChildAccessor(accessor)
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if rt.Optional {
		// The null sentinel becomes undefined; the child transform runs only on a present value.
		optionalCode := "if (" + accessor + " === null) {" + accessor + " = undefined}"
		if childRT.Code == "" {
			return RTCode{Code: optionalCode, Type: CodeS}
		}
		return RTCode{Code: optionalCode + " else if (" + accessor + " !== undefined) {" + childRT.Code + "}", Type: CodeS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	return childRT
}

// emitNativeIterableRestoreFromJson walks the array wire form, applies each child's restore, then rebuilds the Map / Set.
// The loop counter is an INDEX, not an entry: the array form is accessed by length (Set: v[e0], Map: v[e0][0] and [1]).
func emitNativeIterableRestoreFromJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	isMap := rt.SubKind == reflection.SubKindMap
	ctorName := "Map"
	if !isMap {
		ctorName = "Set"
	}

	innerTypes := iterableInnerTypes(rt, ctx)

	indexVar := ctx.NextLocalVar("e")
	var childCodes []string
	for i, innerType := range innerTypes {
		if innerType == nil {
			continue
		}
		accessor := v + "[" + indexVar + "]"
		if isMap {
			accessor = v + "[" + indexVar + "][" + strconv.Itoa(i) + "]"
		}
		ctx.SetChildAccessor(accessor)
		childRT := ctx.CompileChild(innerType, CodeS)
		ctx.SetChildAccessor("")
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code != "" {
			childCodes = append(childCodes, childRT.Code)
		}
	}

	// The wire form of a Map / Set is an array; anything else (a null, which `new Set(null)` turns into an EMPTY set) is
	// left untouched for validate to refuse. Guard mirrors emitElementLoop (json_shared.go).
	if len(childCodes) == 0 {
		return RTCode{Code: v + " = Array.isArray(" + v + ") ? new " + ctorName + "(" + v + ") : " + v, Type: CodeS}
	}
	body := "if (Array.isArray(" + v + ")) {for (let " + indexVar + " = 0; " + indexVar + " < " + v + ".length; " + indexVar + "++) {" +
		strings.Join(childCodes, ";") + "} " +
		v + " = new " + ctorName + "(" + v + ")}"
	return RTCode{Code: body, Type: CodeS}
}

// EmitDependencyCall has the parent frame capture the call's return, so a `v = new Date(v)` rebind inside the inner
// function reaches the caller. Full rationale on PrepareForJsonEmitter.EmitDependencyCall.
func (RestoreFromJsonEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	return ctx.emitDepCall(childID, ctx.Vλl, ctx.Vλl)
}

// Finalize gives a noop the identity body but still emits the factory, so dep-call chains resolve.
// isNoop on an identity body lets the consumer short-circuit while the cache entry still exists.
func (RestoreFromJsonEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "return v" {
		return "return v", true
	}
	return code, false
}
