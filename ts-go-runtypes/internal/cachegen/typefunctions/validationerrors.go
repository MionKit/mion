package typefunctions

import (
	"fmt"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsquote"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// ValidationErrorsEmitter implements the `validationErrors` rt function: it accumulates RTValidationError entries into the
// third arg `er` instead of returning a boolean, and finalizes by returning `er`.
// Mirrors ValidateEmitter in validate.go; each arm of the kind switch mirrors the reference's `emitTypeErrors` for that node.
type ValidationErrorsEmitter struct{}

// Args returns the three parameters: v (current value), pth (path accumulator, default []), er (error accumulator, default []).
func (ValidationErrorsEmitter) Args() []ArgSpec {
	return []ArgSpec{
		{Key: "vλl", Name: "v", Default: ""},
		{Key: "pλth", Name: "pth", Default: "[]"},
		{Key: "εrr", Name: "er", Default: "[]"},
	}
}

// EmitCircularGuard renders the inline cycle guard: a detected cycle records a `{expected:'circular'}` entry at the current
// path (prefixed by the incoming `pth`) and returns early, since descending would recurse forever on the cyclic value.
func (ValidationErrorsEmitter) EmitCircularGuard(fcpAlias, skeletonConst string) string {
	return "const cyR=" + fcpAlias + "(v," + skeletonConst + ");" +
		"if(cyR){er.push({path:pth.length?pth.concat(cyR):cyR,expected:'circular'});return er;}"
}

// Supports — the shared validate / validationErrors kind set (validationSupports in validate.go).
func (ValidationErrorsEmitter) Supports(rt *reflection.RunType) bool {
	return validationSupports(rt)
}

// IsRTInlined delegates to DefaultIsRTInlined: the reference shares the predicate across every rt fn.
func (ValidationErrorsEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// IsNoopType — the verr entry is the error-list passthrough exactly for any/unknown roots.
func (ValidationErrorsEmitter) IsNoopType(rt *reflection.RunType, ctx *EmitContext) bool {
	return isNoopForValidationErrors(rt, ctx)
}

// NoopChildComposesAround — a child that never records an error contributes nothing, so empty code composes correctly.
func (ValidationErrorsEmitter) NoopChildComposesAround() {}

// ReturnName is `er`: this family accumulates into the third arg and returns it, where validate returns the first arg (`v`).
func (ValidationErrorsEmitter) ReturnName() string {
	return "er"
}

// Emit dispatches the per-kind switch; each arm emits CodeS statements that append errors via callRTErr or recurse into
// children with the path segment threaded through SetChildPathLiteral.
// An unsupported kind emits CodeNS, the walker latches the signal and the renderer drops the factory, as in ValidateEmitter.
func (e ValidationErrorsEmitter) Emit(rt *reflection.RunType, ctx *EmitContext, expectedCType CodeType) RTCode {
	base := e.emitKindDefault(rt, ctx, expectedCType)
	// A format check is appended after the base-kind check and runs only behind the base's POSITIVE predicate, so format errors
	// surface only for values of the right underlying kind.
	// `pth` is the runtime path argument this validator receives; format errors push relative to it.
	if base.Type == CodeS && rt != nil && rt.FormatAnnotation != nil {
		if emitter, ok := formats.LookupForRunType(rt); ok {
			check := emitter.EmitValidationErrorsCheck(rt.FormatAnnotation, ctx.Vλl, "pth", "er", ctx)
			if check != "" {
				check = wrapFormatCheckPath(ctx, check)
				guard := baseKindGuard(rt, ctx.Vλl, ctx.NumberMode())
				if guard == "" {
					base.Code = base.Code + ";" + check
				} else {
					base.Code = base.Code + ";if (" + guard + ") {" + check + "}"
				}
			}
		}
	}
	// patternProperties / propertyNames: per-key probes with a scratch error array (er / pth shadowed in an IIFE), one canonical
	// error per violated entry, gated on the base-kind guard like every splice here.
	if base.Type == CodeS && rt != nil && (len(rt.PatternProps) > 0 || len(rt.PropNames) > 0) {
		appendCheck := func(check string) {
			check = wrapFormatCheckPath(ctx, check)
			guard := baseKindGuard(rt, ctx.Vλl, ctx.NumberMode())
			switch {
			case base.Code == "":
				base.Code = check
			case guard == "":
				base.Code = base.Code + ";" + check
			default:
				base.Code = base.Code + ";if (" + guard + ") {" + check + "}"
			}
		}
		for _, patternProp := range rt.PatternProps {
			if ctx.ResolveRef(patternProp.Value) == nil {
				panic("validationErrors: unresolvable patternProperties value child")
			}
			reVar := ctx.NextLocalVar("reKey")
			if !ctx.HasContextItem(reVar) {
				ctx.SetContextItem(reVar, "const "+reVar+" = new RegExp("+jsquote.Double(patternProp.Source)+")")
			}
			kVar := ctx.NextLocalVar("pk")
			ctx.SetChildAccessor(ctx.Vλl + "[" + kVar + "]")
			childRT := ctx.CompileChild(patternProp.Value, CodeS)
			ctx.SetChildAccessor("")
			if childRT.Type == CodeNS || childRT.Code == "" {
				continue
			}
			okVar := ctx.NextLocalVar("pok")
			scratch := ctx.NextLocalVar("per")
			check := "let " + okVar + " = true;for (const " + kVar + " in " + ctx.Vλl + ") {" +
				"if (!" + reVar + ".test(" + kVar + ")) continue;" +
				"const " + scratch + " = [];((er,pth)=>{" + childRT.Code + "})(" + scratch + ",[]);" +
				"if (" + scratch + ".length > 0) " + okVar + " = false;}" +
				"if (!" + okVar + ") " + formats.FormatErrCall("pth", "er", "object", "patternProperties", "pattern", jsquote.Single(patternProp.Source))
			appendCheck(check)
		}
		for _, propNames := range rt.PropNames {
			if ctx.ResolveRef(propNames) == nil {
				panic("validationErrors: unresolvable propertyNames child")
			}
			kVar := ctx.NextLocalVar("pk")
			ctx.SetChildAccessor(kVar)
			childRT := ctx.CompileChild(propNames, CodeS)
			ctx.SetChildAccessor("")
			if childRT.Type != CodeNS && childRT.Code != "" {
				okVar := ctx.NextLocalVar("pok")
				scratch := ctx.NextLocalVar("per")
				check := "let " + okVar + " = true;for (const " + kVar + " in " + ctx.Vλl + ") {" +
					"const " + scratch + " = [];((er,pth)=>{" + childRT.Code + "})(" + scratch + ",[]);" +
					"if (" + scratch + ".length > 0) " + okVar + " = false;}" +
					"if (!" + okVar + ") " + formats.FormatErrCall("pth", "er", "object", "propertyNames", "propertyNames", "true")
				appendCheck(check)
			}
		}
	}
	// Contains: count the items whose child verr body pushes ZERO errors and push one canonical error per violated bound.
	// Gated on the base-kind guard so a non-array value reports only the base error.
	if base.Type == CodeS && rt != nil && len(rt.Contains) > 0 {
		for _, containsCheck := range rt.Contains {
			if ctx.ResolveRef(containsCheck.Child) == nil {
				panic("validationErrors: unresolvable contains child — dropping it would silently weaken validation")
			}
			loop := containsLoop(ctx, rt)
			ctx.SetChildAccessor(loop.itemExpr)
			childRT := ctx.CompileChild(containsCheck.Child, CodeS)
			ctx.SetChildAccessor("")
			nVar := ctx.NextLocalVar("cn")
			var count string
			switch {
			case childRT.Type == CodeNS:
				// A never-ish child matches nothing — the count is zero.
				count = "const " + nVar + " = 0;"
			case childRT.Code == "":
				// any/unknown child matches every item.
				count = "const " + nVar + " = " + loop.countExpr + ";"
			default:
				scratch := ctx.NextLocalVar("cer")
				count = "let " + nVar + " = 0;" + loop.head + "{" +
					"const " + scratch + " = [];((er,pth)=>{" + childRT.Code + "})(" + scratch + ",[]);" +
					"if (" + scratch + ".length === 0) " + nVar + "++;}"
			}
			check := count +
				"if (" + nVar + " < " + formats.FormatNumber(containsCheck.Min) + ") " +
				formats.FormatErrCall("pth", "er", loop.expected, "contains", "minContains", formats.FormatNumber(containsCheck.Min))
			if containsCheck.Max >= 0 {
				check += ";if (" + nVar + " > " + formats.FormatNumber(containsCheck.Max) + ") " +
					formats.FormatErrCall("pth", "er", loop.expected, "contains", "maxContains", formats.FormatNumber(containsCheck.Max))
			}
			check = wrapFormatCheckPath(ctx, check)
			guard := baseKindGuard(rt, ctx.Vλl, ctx.NumberMode())
			switch {
			case base.Code == "":
				base.Code = check
			case guard == "":
				base.Code = base.Code + ";" + check
			default:
				base.Code = base.Code + ";if (" + guard + ") {" + check + "}"
			}
		}
	}
	return base
}

// wrapFormatCheckPath pushes this node's static access-path segments onto the runtime `pth` around the check, then splices
// them off. Format errors snapshot the path as `[...pth]` (formats.FormatErrCall), so without this a failure at a property,
// array element or map entry would report `path: []`. An empty access path (a root-position format) is left unchanged.
func wrapFormatCheckPath(ctx *EmitContext, check string) string {
	pathLen := ctx.AccessPathLength("")
	if pathLen == 0 {
		return check
	}
	pathLit := ctx.AccessPathLiteral("")
	pthArg := ctx.ArgName("pλth")
	pushArgs := pathLit[1 : len(pathLit)-1] // strip the surrounding `[` … `]`
	return pthArg + ".push(" + pushArgs + ");" + check + ";" + pthArg + ".splice(-" + strconv.Itoa(pathLen) + ")"
}

// baseKindGuard returns an expression that is true when vλl matches the base kind, gating format-specific error checks so
// they don't run on type-mismatched values. Returns "" when no guard applies, which no format emitter should ever hit.
func baseKindGuard(rt *reflection.RunType, vλl, numberMode string) string {
	if rt == nil {
		return ""
	}
	switch rt.Kind {
	case reflection.KindString:
		return "typeof " + vλl + " === 'string'"
	case reflection.KindNumber:
		return numberBaseCheck(numberMode, vλl)
	case reflection.KindBigInt:
		return "typeof " + vλl + " === 'bigint'"
	case reflection.KindClass:
		if info, ok := reflection.TemporalInfoBySubKind(rt.SubKind); ok {
			// A Temporal compare() throws on a non-Temporal value: gate on instanceof so a wrong-type value yields a clean base-kind error.
			return vλl + " instanceof " + info.Builtin
		}
		// The Map / Set structural formats read `.size`: guard on the collection
		// class so a wrong-kind value reports only the base error.
		if rt.SubKind == reflection.SubKindMap {
			return vλl + " instanceof Map"
		}
		if rt.SubKind == reflection.SubKindSet {
			return vλl + " instanceof Set"
		}
		// Native Date format: guard the min/max bound check so it runs only on a valid Date — `.getTime()` on a non-Date would throw.
		return vλl + " instanceof Date && !isNaN(" + vλl + ".getTime())"
	case reflection.KindArray, reflection.KindTuple:
		// Structural array formats read `.length` — guard so a wrong-kind value (null!) reports only the base error instead of throwing.
		return "Array.isArray(" + vλl + ")"
	case reflection.KindObjectLiteral, reflection.KindObject:
		// Structural object formats read Object.keys — same throw guard.
		return "typeof " + vλl + " === 'object' && " + vλl + " !== null"
	}
	return ""
}

func (ValidationErrorsEmitter) emitKindDefault(rt *reflection.RunType, ctx *EmitContext, _ CodeType) RTCode {
	if rt == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	switch rt.Kind {

	case reflection.KindString:
		return RTCode{
			Code: "if (typeof " + v + " !== 'string') " + callRTErr(ctx, "string", ""),
			Type: CodeS,
		}

	case reflection.KindNumber:
		// Default Number.isFinite rejects NaN / Infinity / -Infinity along with non-numbers; the numberMode ValidateOption swaps in
		// the looser typeof / notNaN base check, kept in lockstep with the validate emitter via numberBaseCheck.
		return RTCode{
			Code: "if (!(" + numberBaseCheck(ctx.NumberMode(), v) + ")) " + callRTErr(ctx, "number", ""),
			Type: CodeS,
		}

	case reflection.KindBoolean:
		return RTCode{
			Code: "if (typeof " + v + " !== 'boolean') " + callRTErr(ctx, "boolean", ""),
			Type: CodeS,
		}

	case reflection.KindBigInt:
		return RTCode{
			Code: "if (typeof " + v + " !== 'bigint') " + callRTErr(ctx, "bigint", ""),
			Type: CodeS,
		}

	case reflection.KindSymbol:
		// Unsupported — symbol identity does not round-trip.
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindNull:
		return RTCode{
			Code: "if (" + v + " !== null) " + callRTErr(ctx, "null", ""),
			Type: CodeS,
		}

	case reflection.KindUndefined:
		// `typeof` so a `var v` reference that has not been assigned yet still passes.
		return RTCode{
			Code: "if (typeof " + v + " !== 'undefined') " + callRTErr(ctx, "undefined", ""),
			Type: CodeS,
		}

	case reflection.KindVoid:
		// void accepts only undefined; null is rejected (matches validate).
		return RTCode{
			Code: "if (" + v + " !== undefined) " + callRTErr(ctx, "void", ""),
			Type: CodeS,
		}

	case reflection.KindAny, reflection.KindUnknown:
		// The reference returns a noop here: Finalize collapses the empty body to `return er` and flags the factory as a noop, so
		// the renderer skips it and consumers fall through to `() => []`.
		if ctx.IsRoot() {
			ctx.EmitDiagnosticSlot(SlotRootAnyUnknown)
		}
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindNever:
		// Every value is an error against `never`: no type check, just record unconditionally.
		return RTCode{
			Code: callRTErr(ctx, "never", "") + ";",
			Type: CodeS,
		}

	case reflection.KindObject:
		// Strict TS `object` type: non-null and not a primitive. Same gate as validate.
		return RTCode{
			Code: "if (!(typeof " + v + " === 'object' && " + v + " !== null)) " + callRTErr(ctx, "objectLiteral", ""),
			Type: CodeS,
		}

	case reflection.KindRegexp:
		return RTCode{
			Code: "if (!(" + v + " instanceof RegExp)) " + callRTErr(ctx, "regexp", ""),
			Type: CodeS,
		}

	case reflection.KindLiteral:
		return emitLiteralValidationErrors(rt, ctx)

	case reflection.KindEnum:
		if len(rt.Values) == 0 {
			return RTCode{
				Code: callRTErr(ctx, "enum", "") + ";",
				Type: CodeS,
			}
		}
		parts := make([]string, 0, len(rt.Values))
		for _, item := range rt.Values {
			lit, err := jsLiteralFromAny(item)
			if err != nil {
				panic(fmt.Sprintf("typefns: validationErrors emit for KindEnum: %v", err))
			}
			parts = append(parts, v+" === "+lit)
		}
		return RTCode{
			Code: "if (!(" + strings.Join(parts, " || ") + ")) " + callRTErr(ctx, "enum", ""),
			Type: CodeS,
		}

	case reflection.KindClass:
		if rt.SubKind == reflection.SubKindDate {
			// Date instance AND a valid date (rejects `new Date('not a date')`).
			return RTCode{
				Code: "if (!(" + v + " instanceof Date) || isNaN(" + v + ".getTime())) " + callRTErr(ctx, "date", ""),
				Type: CodeS,
			}
		}
		if info, ok := reflection.TemporalInfoBySubKind(rt.SubKind); ok {
			// Temporal types have no invalid state, so instanceof suffices; the expected-name carries the qualified type.
			return RTCode{
				Code: "if (!(" + v + " instanceof " + info.Builtin + ")) " + callRTErr(ctx, info.Builtin, ""),
				Type: CodeS,
			}
		}
		if rt.SubKind == reflection.SubKindNone {
			// Non-Date user classes share the KindObjectLiteral emit (class extends interface in the reference).
			return emitObjectValidationErrors(rt, ctx, v)
		}
		if rt.SubKind == reflection.SubKindMap {
			return emitMapValidationErrors(rt, ctx, v)
		}
		if rt.SubKind == reflection.SubKindSet {
			return emitSetValidationErrors(rt, ctx, v)
		}
		if rt.SubKind == reflection.SubKindNonSerializable {
			// The reference throws from emitTypeErrors; CodeNS makes the renderer emit a throw-factory instead.
			return RTCode{Code: "", Type: CodeNS}
		}
		// Future subkinds — silent skip.
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindPromise:
		// Thenable check; the wrapped T is not validated synchronously.
		return RTCode{
			Code: "if (!(typeof " + v + " === 'object' && " + v + " !== null && typeof " + v + ".then === 'function')) " + callRTErr(ctx, "promise", ""),
			Type: CodeS,
		}

	case reflection.KindObjectLiteral:
		return emitObjectValidationErrors(rt, ctx, v)

	case reflection.KindProperty, reflection.KindPropertySignature:
		return emitPropertyValidationErrors(rt, ctx, v)

	case reflection.KindIndexSignature:
		return emitIndexSignatureValidationErrors(rt, ctx, v)

	case reflection.KindFunction, reflection.KindMethod,
		reflection.KindMethodSignature, reflection.KindCallSignature:
		// Children (params, return) aren't validated here; the whole shape is treated as opaque-callable.
		return RTCode{
			Code: "if (typeof " + v + " !== 'function') " + callRTErr(ctx, rtTypeNameForKind(rt.Kind), ""),
			Type: CodeS,
		}

	case reflection.KindTuple:
		return emitTupleValidationErrors(rt, ctx, v)

	case reflection.KindTupleMember:
		return emitTupleMemberValidationErrors(rt, ctx, v)

	case reflection.KindUnion:
		return emitUnionValidationErrors(rt, ctx, v)

	case reflection.KindTemplateLiteral:
		return emitTemplateLiteralValidationErrors(rt, ctx, v)

	case reflection.KindArray:
		// The child path literal is the loop counter var, so element errors carry [..., i0] in their access path.
		if rt.Child == nil {
			return RTCode{Code: "", Type: CodeS}
		}
		// A non-serializable element (symbol / function) comes back CodeNS with the element as the leaf: alwaysThrow at the root,
		// absorbed at a property (T3, matching validate.go's array arm).
		iVar := ctx.NextLocalVar("i")
		ctx.SetChildAccessor(v + "[" + iVar + "]")
		ctx.SetChildPathLiteral(iVar)
		childRT := ctx.CompileChild(rt.Child, CodeS)
		ctx.SetChildAccessor("")
		ctx.SetChildPathLiteral("")
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		// A child with no body (a KindAny element) reduces to the bare array guard or a noop.
		if childRT.Code == "" {
			return RTCode{
				Code: "if (!Array.isArray(" + v + ")) " + callRTErr(ctx, "array", ""),
				Type: CodeS,
			}
		}
		itemsCode := "for (let " + iVar + " = 0; " + iVar + " < " + v + ".length; " + iVar + "++) {" + childRT.Code + "}"
		return RTCode{
			Code: "if (!Array.isArray(" + v + ")) {" + callRTErr(ctx, "array", "") + "} else {" + itemsCode + "}",
			Type: CodeS,
		}
	}
	return RTCode{Code: "", Type: CodeNS}
}

// EmitDependencyCall returns the call into a pre-rendered child validationErrors entry, wrapped in a
// `pth.push(...) ; <call> ; pth.splice(-N)` envelope so the child's errors carry the right access-path prefix.
func (ValidationErrorsEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	return ctx.emitPathTrackedDepCall(childID)
}

// Finalize marks an empty body as the noop `return er`; otherwise the walker has already appended `return er`.
func (ValidationErrorsEmitter) Finalize(rawCode string) (string, bool) {
	code := normaliseWhitespace(rawCode)
	trimmed := strings.TrimSpace(code)
	if trimmed == "" {
		return "return er", true
	}
	return code, false
}

// callRTErr builds the newRunTypeErr call that appends one RTValidationError entry to the `er` array.
// Args: pth (runtime path), er (accumulator), expected (kindname literal), and the static access path when non-empty.
// `extra` adds a trailing segment to the static path, for "unknown key" / "map key" markers that are not part of the runtime path.
func callRTErr(ctx *EmitContext, expected string, extra string) string {
	// UsePureFn records the dep, hoists the deduped `const nRT = utl.getPureFn('<id>')` prologue line and returns the alias.
	// The id literal is fully spelled out because the body is also evaluated through `new Function('utl', code)`, where
	// module-level consts are not in scope.
	key := ctx.UsePureFn(purefnids.NewRunTypeErr)
	pthArg := ctx.ArgName("pλth")
	errArg := ctx.ArgName("εrr")
	args := []string{pthArg, errArg, quoteJS(expected)}
	if path := ctx.AccessPathLiteral(extra); path != "" {
		args = append(args, path)
	}
	return key + "(" + strings.Join(args, ",") + ")"
}

// emitLiteralValidationErrors wraps emitLiteral's boolean expression in `if (!(<expr>)) <error>`.
func emitLiteralValidationErrors(rt *reflection.RunType, ctx *EmitContext) RTCode {
	validateExpr := emitLiteral(rt, ctx.Vλl)
	if validateExpr.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if validateExpr.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	return RTCode{
		Code: "if (!(" + validateExpr.Code + ")) " + callRTErr(ctx, "literal", ""),
		Type: CodeS,
	}
}

// emitObjectValidationErrors builds the object-shape statement: a `typeof === 'object' && !== null` guard (or
// `typeof === 'function'` for a callable interface) that records one error on mismatch, else each child's own error statements.
// Children are filtered as in emitObjectValidate: static and method-shaped kinds dropped, a function-typed property dropped
// through its own empty emit.
// When nothing contributing is required, the guard gains the `[object Object]` brand clause so arrays / Date / Map / Set are
// rejected rather than slipping through the bare `typeof === 'object'`. Suppressed for callable shapes (a Function, not an Object).
func emitObjectValidationErrors(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	var callSigChild *reflection.RunType
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if resolved.Kind == reflection.KindCallSignature {
			callSigChild = child
			break
		}
	}

	// A callable interface at a NON-root position is function-like: CodeNS lets the parent handle it like any other
	// function-valued child (matching validate and the serializers, F2). At the ROOT the typeof-function guard below applies.
	if callSigChild != nil && !ctx.IsRoot() {
		return RTCode{Code: "", Type: CodeNS}
	}

	// Publish the sibling-named-prop set for any index-signature child (see emitObjectValidate).
	publishSiblingNamedKeysForIndexSig(rt, ctx)
	publishSiblingPatternsForIndexSig(rt, ctx)

	var childrenParts []string
	allOptional := true
	hasContributingChild := false
	// See objectNeedsBrandGuard in validate.go.
	hasArrayProofRequiredProp := false
	hasIndexSig := false
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if resolved.IsStatic {
			ctx.EmitDiagnosticSlot(SlotStaticDropped, memberLabel(resolved))
			continue
		}
		if resolved.Kind == reflection.KindIndexSignature {
			hasIndexSig = true
		}
		if isFunctionLikeKind(resolved.Kind) {
			// Method-shaped members on the shape are skipped; the callable case is covered by the typeof guard below.
			ctx.EmitDiagnosticSlot(SlotMethodDropped, memberLabel(resolved))
			continue
		}
		childRT := ctx.CompileChild(child, CodeS)
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code == "" {
			continue
		}
		hasContributingChild = true
		if !memberIsOptional(resolved) {
			allOptional = false
			if !arrayCarriesName(resolved.Name) {
				hasArrayProofRequiredProp = true
			}
		}
		childrenParts = append(childrenParts, childRT.Code)
	}
	childrenCode := strings.Join(childrenParts, ";")

	var objectCheck string
	if callSigChild != nil {
		objectCheck = "typeof " + v + " === 'function'"
	} else {
		objectCheck = "typeof " + v + " === 'object' && " + v + " !== null"
	}
	// Same guard, same condition as emitObjectValidate: without it a `{}` validator accepts `[]`, `new Date()` or `new Map()`,
	// and an index-signature object accepts them too (a for-in enumerates nothing, so the per-key check is vacuous).
	// The two families must answer alike or the createValidateFn / createGetValidationErrorsFn agreement breaks (fuzz oracle O4).
	if callSigChild == nil && objectNeedsBrandGuard(hasContributingChild, allOptional, hasIndexSig, hasArrayProofRequiredProp) {
		objectCheck = objectCheck + " && !Array.isArray(" + v + ") && Object.prototype.toString.call(" + v + ") === '[object Object]'"
	}

	expected := "objectLiteral"
	if rt.Kind == reflection.KindClass {
		expected = "class"
	}
	if callSigChild != nil {
		expected = "function"
	}

	// Fused (`checkUnknowns`) family only: undeclared keys reported as `{path, expected: 'never'}` from the SAME helper the
	// standalone unknownKeyErrors family uses, so both produce identical entries. It runs AFTER the per-property errors, inside
	// the `else`, where the value is known to be a non-null object.
	// This is where the fused error ORDER diverges from `verr(v).concat(uke(v))`: one walk interleaves the entries per node,
	// matching every other error family. WHETHER to emit is emitsUnknownKeyCheck's call, the same one emitObjectValidate makes.
	unknownKeyErrors := ""
	if emitsUnknownKeyCheck(rt, ctx, callSigChild) {
		// Arrays excluded HERE and nowhere else in this family. emitObjectValidate's `&&` chain short-circuits on a failed property
		// check, so it never reaches the key scan on an array; this family reports everything instead of stopping at the first
		// failure, and would list an array's indices as undeclared keys.
		// The shapes where no property check stops an array carry the `[object Object]` brand guard in objectCheck above.
		if keyErrors := emitParentUnknownKeyErrors(rt, ctx); keyErrors != "" {
			unknownKeyErrors = guardStatement("!Array.isArray("+v+")", keyErrors)
		}
	}
	bodyCode := joinSemicolons(childrenCode, unknownKeyErrors)

	if bodyCode == "" {
		// No contributing children — emit only the shape guard.
		return RTCode{
			Code: "if (!(" + objectCheck + ")) " + callRTErr(ctx, expected, ""),
			Type: CodeS,
		}
	}
	return RTCode{
		Code: "if (!(" + objectCheck + ")) {" + callRTErr(ctx, expected, "") + "} else {" + bodyCode + "}",
		Type: CodeS,
	}
}

// emitPropertyValidationErrors handles KindProperty / KindPropertySignature, setting the accessor and the property name as
// the child path literal before recursing, then wrapping an optional property in a presence guard.
func emitPropertyValidationErrors(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if strippedPropertyDrop(resolved, rt.Name, ctx) {
		// Directly DataOnly-stripped value — drop the property, matching `DataOnly<{a: symbol}>` = `{}`.
		return RTCode{Code: "", Type: CodeS}
	}
	accessor := propertyAccessor(v, rt.Name, rt.IsSafeName)
	ctx.SetChildAccessor(accessor)
	ctx.SetChildPathLiteral(quoteJS(rt.Name))
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	ctx.SetChildPathLiteral("")
	if childRT.Type == CodeNS {
		// A stripped leaf in a propagating slot (symbol[], …) fails the object; any other unsupported kind is absorbed (F3).
		if propertyChildFailed(ctx) {
			return RTCode{Code: "", Type: CodeNS}
		}
		return RTCode{Code: "", Type: CodeS}
	}
	// Presence twin of emitPropertyValidate's: a REQUIRED member whose type imposes no VALUE check (`unknown` / `any`) must
	// still REPORT a missing key, or validate rejects `{}` against `{foo: unknown}` while this family returns no errors.
	// The label is the child's own kind, and the property name rides the trailing path segment, since the child frame that
	// would carry it is never pushed.
	if childRT.Code == "" || isNoopForValidationErrors(rt.Child, ctx) {
		if rt.Optional {
			return RTCode{Code: "", Type: CodeS}
		}
		expected := "unknown"
		if resolved.Kind == reflection.KindAny {
			expected = "any"
		}
		return RTCode{
			Code: "if (!(" + namedPropertyInTest(rt.Name, v) + ")) " + callRTErr(ctx, expected, quoteJS(rt.Name)) + ";",
			Type: CodeS,
		}
	}
	if rt.Optional {
		return RTCode{
			Code: "if (" + propertyPresenceTest(rt, v, accessor) + ") {" + childRT.Code + "}",
			Type: CodeS,
		}
	}
	return childRT
}

// emitIndexSignatureValidationErrors runs each value's errors inside `for (const k in v)` with the key var as the path
// segment. A template-literal key constraint emits a per-key regex.test that records a 'never' error for a non-matching key.
func emitIndexSignatureValidationErrors(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
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
	// Template-literal key regex lifted into the closure prologue, same shape as the validate emit.
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
	ctx.SetChildPathLiteral(keyVar)
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	ctx.SetChildPathLiteral("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if childRT.Code == "" && keyRegexVar == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	var body strings.Builder
	body.WriteString("for (const ")
	body.WriteString(keyVar)
	body.WriteString(" in ")
	body.WriteString(v)
	body.WriteString(") {")
	// An own prototype-named key is never data: report it at its own path.
	body.WriteString("if (" + unsafeKeyCheck(keyVar) + ") { " + callRTErr(ctx, "safe property name", keyVar) + "; continue; } ")
	if skip := siblingNamedSkipCode(rt, ctx, keyVar); skip != "" {
		body.WriteString(skip)
		body.WriteString(" ")
	}
	if skip := siblingPatternSkipCode(rt, ctx, keyVar); skip != "" {
		body.WriteString(skip)
		body.WriteString(" ")
	}
	if keyRegexVar != "" {
		// `extra=keyVar` appends the key as the trailing path segment.
		body.WriteString("if (!")
		body.WriteString(keyRegexVar)
		body.WriteString(".test(")
		body.WriteString(keyVar)
		body.WriteString(")) ")
		body.WriteString(callRTErr(ctx, "never", keyVar))
		body.WriteString("; else ")
	}
	if childRT.Code != "" {
		body.WriteString("{")
		body.WriteString(childRT.Code)
		body.WriteString("}")
	}
	body.WriteString("}")
	return RTCode{Code: body.String(), Type: CodeS}
}

// rtTypeNameForKind returns the kindname used for the `expected` field of an RTValidationError, for the callers that hold
// no RunType: a function-flavoured kind maps to its concrete name.
func rtTypeNameForKind(kind reflection.ReflectionKind) string {
	switch kind {
	case reflection.KindFunction:
		return "function"
	case reflection.KindMethod:
		return "method"
	case reflection.KindMethodSignature:
		return "methodSignature"
	case reflection.KindCallSignature:
		return "callSignature"
	}
	return ""
}

// emitTupleValidationErrors records one 'tuple' error on a shape mismatch, else runs each member's own error code.
// An empty tuple accepts only the empty array; a rest-bearing tuple skips the upper-length bound, and the rest member's own
// emit loops the elements with the loop counter as the path.
func emitTupleValidationErrors(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if len(rt.Children) == 0 {
		// Empty tuple — only the empty array passes.
		return RTCode{
			Code: "if (!(Array.isArray(" + v + ") && " + v + ".length === 0)) " + callRTErr(ctx, "tuple", ""),
			Type: CodeS,
		}
	}
	var bodyParts []string
	for _, child := range rt.Children {
		childRT := ctx.CompileChild(child, CodeS)
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code != "" {
			bodyParts = append(bodyParts, childRT.Code)
		}
	}
	body := strings.Join(bodyParts, ";")

	lengthCheck := ""
	if !tupleHasRest(rt, ctx) {
		lengthCheck = " || " + v + ".length > " + strconv.Itoa(len(rt.Children))
	}
	if body == "" {
		return RTCode{
			Code: "if (!Array.isArray(" + v + ")" + lengthCheck + ") " + callRTErr(ctx, "tuple", ""),
			Type: CodeS,
		}
	}
	return RTCode{
		Code: "if (!Array.isArray(" + v + ")" + lengthCheck + ") {" + callRTErr(ctx, "tuple", "") + "} else {" + body + "}",
		Type: CodeS,
	}
}

// emitMapValidationErrors records one 'map' error on a mismatch, else walks `v.entries()` checking each key and value.
// A path segment is `{key: <iteration index>, failed: 'mapKey'|'mapValue'}`: the index is the only pointer that survives a
// non-PropertyKey Map key (object / symbol / null) and the one value Standard Schema's getDotPath can read.
func emitMapValidationErrors(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	keyType, valueType := mapKeyValueTypes(rt, ctx)
	entryVar := ctx.NextLocalVar("entry")
	idxVar := ctx.NextLocalVar("i")
	var inner strings.Builder
	inner.WriteString("let ")
	inner.WriteString(idxVar)
	inner.WriteString(" = 0; for (const ")
	inner.WriteString(entryVar)
	inner.WriteString(" of ")
	inner.WriteString(v)
	inner.WriteString(".entries()) {")
	if keyType != nil {
		keyVar := ctx.NextLocalVar("k")
		inner.WriteString("const ")
		inner.WriteString(keyVar)
		inner.WriteString(" = ")
		inner.WriteString(entryVar)
		inner.WriteString("[0];")
		ctx.SetChildAccessor(keyVar)
		ctx.SetChildPathLiteral("{key:" + idxVar + ",failed:'mapKey'}")
		keyRT := ctx.CompileChild(keyType, CodeS)
		ctx.SetChildAccessor("")
		ctx.SetChildPathLiteral("")
		if keyRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if keyRT.Code != "" {
			inner.WriteString(keyRT.Code)
			// A dep-call envelope ends in `(pth.push(...), <call>, pth.splice(-1))`, a parenthesised comma expression with no trailing
			// semicolon, so the next `const val0 = …` would lex as `(expr)const`. Append `;` for any non-terminator-ending key code.
			if last := keyRT.Code[len(keyRT.Code)-1]; last != ';' && last != '}' {
				inner.WriteString(";")
			}
		}
	}
	if valueType != nil {
		valVar := ctx.NextLocalVar("val")
		inner.WriteString("const ")
		inner.WriteString(valVar)
		inner.WriteString(" = ")
		inner.WriteString(entryVar)
		inner.WriteString("[1];")
		ctx.SetChildAccessor(valVar)
		ctx.SetChildPathLiteral("{key:" + idxVar + ",failed:'mapValue'}")
		valRT := ctx.CompileChild(valueType, CodeS)
		ctx.SetChildAccessor("")
		ctx.SetChildPathLiteral("")
		if valRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if valRT.Code != "" {
			inner.WriteString(valRT.Code)
			// Same statement-separator concern as the key half, this time before the loop's `i0++`.
			if last := valRT.Code[len(valRT.Code)-1]; last != ';' && last != '}' {
				inner.WriteString(";")
			}
		}
	}
	inner.WriteString(idxVar)
	inner.WriteString("++;}")
	body := inner.String()
	return RTCode{
		Code: "if (!(" + v + " instanceof Map)) {" + callRTErr(ctx, "map", "") + "} else {" + body + "}",
		Type: CodeS,
	}
}

// emitTemplateLiteralValidationErrors wraps emitTemplateLiteralValidate's boolean expression in an error push.
func emitTemplateLiteralValidationErrors(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	validateExpr := emitTemplateLiteralValidate(rt, ctx, v)
	if validateExpr.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	return RTCode{
		Code: "if (!(" + validateExpr.Code + ")) " + callRTErr(ctx, "templateLiteral", ""),
		Type: CodeS,
	}
}

// emitUnionValidationErrors delegates to the union's boolean validator: a union failure is ONE error, never a per-arm breakdown.
// The delegate is resolved under THIS WALKER'S VARIANT, not the plain one: a `{numberMode}` error function
// must ask the validator the caller actually holds, or it reports `{expected:'union'}` for a value its own createValidateFn
// accepts. Walker-scoped is the right scope; a union the walker does NOT inline is dep-called and resolves the plain hash.
// registerRTLookup records a CROSS-family edge rather than a walker.RTDependencies entry, because the dangling-dep cascade
// in module.go is per-fn and a validationErrors entry cannot satisfy a validate dep ref. The resolver's cross-family fixpoint
// (dispatch.go) renders the named entry, variant included, so a variant delegate needs no demand plumbing here.
func emitUnionValidationErrors(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	// Under {checkUnknowns: true} the plain validator accepts a value carrying an undeclared key, so delegating to it made the
	// strict error function report NOTHING for a value its own validator rejects. Pointing at validateStrict makes the two agree
	// by construction. CrossFamilyVariantHash then keys the operation under the walker's own variant, so a strict site carrying
	// `numberMode` reaches the validateStrict entry compiled with `numberMode`, not either default.
	checkOp := "validate"
	switch {
	case ctx.ChecksUnknownKeys():
		checkOp = "validateStrict"
	case ctx.ChecksUnionMemberKeys():
		// Same reason as the strict case: the plain validator accepts a value this family's own validator rejects.
		checkOp = "validateUnionKeys"
	}
	validateHash := ctx.CrossFamilyVariantHash(checkOp) + "_" + rt.ID
	ctx.registerRTLookup(validateHash)
	return RTCode{
		Code: "if (!" + validateHash + ".fn(" + v + ")) " + callRTErr(ctx, "union", ""),
		Type: CodeS,
	}
}

// emitSetValidationErrors mirrors the Map emit with a single item type and `.values()` iteration.
// An item's path segment is {key: <iteration index>, failed: 'setKey'}: a Set item is data, not an address, and the marker
// parallels Map's key/value ones.
func emitSetValidationErrors(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	itemType := setItemType(rt, ctx)
	itemVar := ctx.NextLocalVar("item")
	idxVar := ctx.NextLocalVar("i")
	var inner strings.Builder
	inner.WriteString("let ")
	inner.WriteString(idxVar)
	inner.WriteString(" = 0; for (const ")
	inner.WriteString(itemVar)
	inner.WriteString(" of ")
	inner.WriteString(v)
	inner.WriteString(".values()) {")
	if itemType != nil {
		ctx.SetChildAccessor(itemVar)
		ctx.SetChildPathLiteral("{key:" + idxVar + ",failed:'setKey'}")
		itemRT := ctx.CompileChild(itemType, CodeS)
		ctx.SetChildAccessor("")
		ctx.SetChildPathLiteral("")
		if itemRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if itemRT.Code != "" {
			inner.WriteString(itemRT.Code)
			// Same statement-separator concern as the Map emitter: a dep-call envelope has no trailing `;`, so the following `i0++`
			// would lex as `(expr)i0++`.
			if last := itemRT.Code[len(itemRT.Code)-1]; last != ';' && last != '}' {
				inner.WriteString(";")
			}
		}
	}
	inner.WriteString(idxVar)
	inner.WriteString("++;}")
	body := inner.String()
	return RTCode{
		Code: "if (!(" + v + " instanceof Set)) {" + callRTErr(ctx, "set", "") + "} else {" + body + "}",
		Type: CodeS,
	}
}

// emitTupleMemberValidationErrors sets the element accessor (`v[i]`) and the position as the path literal before recursing.
// A rest member produces a for-loop in its own emit; an optional member gets the undefined-guard wrap.
func emitTupleMemberValidationErrors(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil || isFunctionLikeKind(resolved.Kind) {
		// Non-serializable element — the slot must be undefined.
		idxLit := positionStr(rt)
		accessor := v + "[" + idxLit + "]"
		// The extra path literal threads the index through the access path.
		return RTCode{
			Code: "if (" + accessor + " !== undefined) " + callRTErr(ctx, "undefined", idxLit),
			Type: CodeS,
		}
	}
	if isRestTupleMember(rt) {
		iVar := ctx.NextLocalVar("i")
		ctx.SetChildAccessor(v + "[" + iVar + "]")
		ctx.SetChildPathLiteral(iVar)
		childRT := ctx.CompileChild(rt.Child, CodeS)
		ctx.SetChildAccessor("")
		ctx.SetChildPathLiteral("")
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code == "" {
			return RTCode{Code: "", Type: CodeS}
		}
		return RTCode{
			Code: "for (let " + iVar + " = " + positionStr(rt) + "; " + iVar + " < " + v + ".length; " + iVar + "++) {" + childRT.Code + "}",
			Type: CodeS,
		}
	}
	idxLit := positionStr(rt)
	accessor := v + "[" + idxLit + "]"
	ctx.SetChildAccessor(accessor)
	ctx.SetChildPathLiteral(idxLit)
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	ctx.SetChildPathLiteral("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
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
