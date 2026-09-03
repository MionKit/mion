package typefunctions

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// RestoreFromJsonEmitter implements the `restoreFromJson` rt function —
// reconstructs the runtime shape from a value produced by JSON.parse
// (Dates from ISO strings, BigInts from decimal strings, Symbols from
// "Symbol:<desc>" strings, RegExps from "/source/flags" strings).
//
// Paired with PrepareForJsonEmitter — round-trip
// `restoreFromJson(JSON.parse(JSON.stringify(prepareForJson(v))))`
// must deep-equal v for every valid sample.
//
// Mirrors the per-kind emitRestoreFromJson methods under
// (ref: packages/run-types/src/nodes/**).
type RestoreFromJsonEmitter struct{}

// Args mirrors `rtArgs.vλl = 'v'` — same single-arg shape as
// PrepareForJsonEmitter; restoreFromJson reassigns v to the
// reconstructed value.
func (RestoreFromJsonEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports — the shared JSON-wire kind set; every kind the prepare
// side handles has a corresponding restore arm.
func (RestoreFromJsonEmitter) Supports(rt *reflection.RunType) bool {
	return jsonWireSupports(rt)
}

// IsRTInlined delegates to DefaultIsRTInlined.
func (RestoreFromJsonEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// IsNoopType — the walker's dispatch-time noop gate: external children whose
// restore entry is the identity compose as empty code (no dep call, no
// import). See noop_types.go for the soundness contract.
func (RestoreFromJsonEmitter) IsNoopType(rt *reflection.RunType, ctx *EmitContext) bool {
	return isNoopForRestoreJson(rt, ctx)
}

// NoopChildComposesAround — a value slot that round-trips raw needs no rebuild; empty code composes correctly.
func (RestoreFromJsonEmitter) NoopChildComposesAround() {}

// ReturnName is `v` — restoreFromJson mutates / rebinds v and returns
// the reconstructed value.
func (RestoreFromJsonEmitter) ReturnName() string {
	return "v"
}

// Emit dispatches the per-kind switch. Each arm mirrors the
// emitRestoreFromJson method for the corresponding kind. Non-noop
// atomics:
//   - date:    `v = typeof v === 'string' ? new Date(v) : v` (rebuild from the ISO string; any other wire value is left for validate to refuse)
//   - bigint:  `v = typeof v === 'string' || typeof v === 'number' ? BigInt(v) : v` (the decimal string, or a whole number, the one lenient spelling parse promises; a boolean or null is left for validate)
//   - symbol:  `v = Symbol(v.substring(7))` (strip "Symbol:" prefix)
//   - regexp:  `v = <parsed regex>` (split on /.../flags and rebuild)
//   - void / undefined: `v = undefined`
//
// The bare expression form (e.g. `BigInt(v)`) becomes `v = BigInt(v)`
// on our side so the walker's expression-shape handling actually
// mutates v before the trailing `return v` lands.
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
		// (ref: nodes/atomic/never.ts:23-24) —
		// `emitRestoreFromJson(): RTCode { throw new Error('Never
		// type cannot be decoded from JSON.'); }`.
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindUndefined:
		// (ref: nodes/atomic/undefined.ts:20) — `undefined`.
		// JSON has no undefined, so the parsed input might be null or
		// missing; force-rebind to undefined.
		return RTCode{Code: v + " = undefined", Type: CodeE}

	case reflection.KindVoid:
		// (ref: nodes/atomic/void.ts:23) — `v = undefined`.
		return RTCode{Code: v + " = undefined", Type: CodeE}

	case reflection.KindBigInt:
		// (ref: nodes/atomic/bigInt.ts:23) — `BigInt(v)`.
		return RTCode{Code: v + " = typeof " + v + " === 'string' || typeof " + v + " === 'number' ? BigInt(" + v + ") : " + v, Type: CodeE}

	case reflection.KindSymbol:
		// Unsupported — symmetric with prepareForJson's symbol arm.
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindRegexp:
		// (ref: nodes/atomic/regexp.ts:23) — split the stringified form back
		// into source + flags. The parse block hoists to a context fn
		// (created once per materialization, not per call); the assignment
		// to the accessor stays at the call site.
		params := ctx.CtxFnParams(v)
		call := ctx.CreateFnInContext(
			"const parts = "+v+".match(/\\/(.*)\\/(.*)?/);return new RegExp(parts[1], parts[2] || '');",
			CodeRB, params, params)
		return RTCode{Code: v + " = " + call, Type: CodeE}

	case reflection.KindClass:
		// Date is reconstructed from its ISO string via `new Date(v)`.
		if info, ok := reflection.TemporalInfoBySubKind(rt.SubKind); ok {
			// Rebuild from the canonical string via Temporal.<T>.from(v).
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
			// (ref: nodes/native/nonSerializable.ts:27-28) —
			// `emitRestoreFromJson(): RTCode { throw new Error('RT
			// compilation disabled for Non Serializable types.'); }`.
			return RTCode{Code: "", Type: CodeNS}
		}
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindPromise:
		// (ref: nodes/native/promise.ts:26-27) — emitRestoreFromJson
		// throws "RT compilation disabled for Non Serializable
		// types.". Same throw-factory pattern as the prepare side.
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
		// (ref: nodes/function/function.ts:86-88) —
		// `emitRestoreFromJson(): RTCode { throw new Error('Compile
		// function RestoreFromJson not supported, call compileParams
		// or compileReturn instead.'); }`.
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindUnion:
		// Decodes the flat-union wire shape produced by
		// emitUnionPrepareForJsonFlat / emitUnionStringifyJsonFlat (see
		// union_flat.go). The non-flat decoder was retired with its
		// encoder.
		return emitUnionRestoreFromJsonFlat(rt, ctx, v)

	case reflection.KindIntersection:
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindTemplateLiteral:
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindLiteral:
		// (ref: nodes/atomic/literal.ts:80) — defers to the underlying
		// kind's emit.
		return emitLiteralRestoreFromJson(rt, v)

	case reflection.KindArray:
		// (ref: nodes/member/array.ts:emitRestoreFromJson) — same body
		// shape as emitPrepareForJson. Each element gets the child's
		// restoreFromJson applied in place. Empty child code collapses
		// the whole loop to a noop.
		if rt.Child == nil {
			return RTCode{Code: "", Type: CodeS}
		}
		return emitElementLoop(rt.Child, ctx, v, "0")
	}
	return RTCode{Code: "", Type: CodeNS}
}

// emitLiteralRestoreFromJson mirrors literal.ts:80 — defers to
// the base kind's emit. Same flag-based dispatch as
// emitLiteralPrepareForJson.
func emitLiteralRestoreFromJson(rt *reflection.RunType, v string) RTCode {
	switch literalFlavour(rt) {
	case litBigInt:
		return RTCode{Code: v + " = typeof " + v + " === 'string' || typeof " + v + " === 'number' ? BigInt(" + v + ") : " + v, Type: CodeE}
	case litSymbol:
		return RTCode{Code: v + " = Symbol(" + v + ".substring(7))", Type: CodeE}
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
		// Stripped leaf in a propagating slot (symbol[], …) fails the object;
		// any other unsupported kind is absorbed (F3). See propertyChildFailed.
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
			Code: "if (" + accessor + " !== undefined) {" + childRT.Code + "}",
			Type: CodeS,
		}
	}
	return childRT
}

// emitIndexSignatureRestoreFromJson — sibling of
// emitIndexSignaturePrepareForJson. Skips symbol-keyed sigs per
// the IndexSignatureRunType.skipRT contract (indexProperty.ts:30-36); see
// the prepareForJson mirror for the full rationale.
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
	keyRegexVar := ""
	if rt.Index != nil {
		indexResolved := ctx.ResolveRef(rt.Index)
		if indexResolved != nil && indexResolved.Kind == reflection.KindTemplateLiteral {
			if regex, ok := buildTemplateLiteralRegex(indexResolved); ok {
				keyRegexVar = ctx.NextLocalVar("reIdx")
				if !ctx.HasContextItem(keyRegexVar) {
					ctx.SetContextItem(keyRegexVar, "const "+keyRegexVar+" = new RegExp("+quoteJSDouble(regex)+")")
				}
			}
		}
	}
	keyVar := ctx.NextLocalVar("k")
	ctx.SetChildAccessor(v + "[" + keyVar + "]")
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	body := "for (const " + keyVar + " in " + v + ") {"
	// Skip declared sibling keys — they own their own decode (G1). Without this
	// a `number` prop decoded under a `[k: number]: bigint` index becomes a
	// bigint on the wire round-trip.
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

// emitTupleMemberRestoreFromJson — sibling of
// emitTupleMemberPrepareForJson. The inverse-of-pad-with-null logic
// restores `null` slots to `undefined` for optional members. Non-rest
// non-optional members pass child code through.
func emitTupleMemberRestoreFromJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if resolved := ctx.ResolveRef(rt.Child); resolved == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	// Function-typed tuple slots fall through to CompileChild — the
	// function arm returns CodeNS, the walker latches the leaf, and the
	// renderer surfaces an alwaysThrow. Restoring a function slot to
	// `undefined` (the previous silent behaviour) hid the unsupported
	// shape from the user.
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
		// Restore null sentinel back to undefined, then run the child
		// transform only when the slot has a present (non-undefined)
		// value.
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

// emitNativeIterableRestoreFromJson mirrors
// nodes/native/Iterable.ts:66-82 emitRestoreFromJson. Inverse of the
// prepare side: walk the array-form produced by JSON.parse, apply
// each wrapped child's restore code, then wrap the array back into
// a Map / Set via the constructor.
//
// Shape (with non-noop key, value, or element transforms):
//
//	for (let e0 = 0; e0 < v.length; e0++) {
//	  <key/element transform>; <value transform>;
//	}
//	v = new Map(v)        // or new Set(v) — pick by SubKind
//
// Note the loop counter (`e0`) is the INDEX here, not the entry — we
// use an index loop on restore because the array form has length-based
// access. Accessors:
//   - Set: v[e0] (the element)
//   - Map: v[e0][0] (key) and v[e0][1] (value)
//
// When every wrapped child compiles to empty, fall back to the no-loop
// `v = new Map(v)` / `v = new Set(v)` shape.
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

	// Array.isArray guard: see emitElementLoop (json_shared.go). The wire form
	// of a Map / Set is an array; anything else (a null, which `new Set(null)`
	// would silently turn into an EMPTY set) is left untouched for validate to
	// refuse.
	if len(childCodes) == 0 {
		return RTCode{Code: v + " = Array.isArray(" + v + ") ? new " + ctorName + "(" + v + ") : " + v, Type: CodeS}
	}
	body := "if (Array.isArray(" + v + ")) {for (let " + indexVar + " = 0; " + indexVar + " < " + v + ".length; " + indexVar + "++) {" +
		strings.Join(childCodes, ";") + "} " +
		v + " = new " + ctorName + "(" + v + ")}"
	return RTCode{Code: body, Type: CodeS}
}

// EmitDependencyCall mirrors PrepareForJsonEmitter's — the parent
// frame's `<vλl>` must capture the call's return so the
// `v = new Date(v)` style rebind inside the inner function propagates
// to the outer caller. See PrepareForJsonEmitter.EmitDependencyCall
// for the full rationale.
func (RestoreFromJsonEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	return ctx.emitDepCall(childID, ctx.Vλl, ctx.Vλl)
}

// Finalize — same shape as PrepareForJsonEmitter.Finalize. Mirrors
// the handleFunctionReturn for restoreFromJson: identity body for
// noops, factory still emitted so dep-call chains resolve. isNoop
// is set to true on identity bodies to match the
// `00JsonOnly.spec.ts` semantics (cache entry exists, but consumer
// knows it can short-circuit).
func (RestoreFromJsonEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "return v" {
		return "return v", true
	}
	return code, false
}
