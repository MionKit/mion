package typefunctions

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/mionkit/ts-runtypes/internal/cachegen/operations"
	"github.com/mionkit/ts-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/ts-runtypes/internal/jsquote"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// ValidationErrorsEmitter implements the `validationErrors` rt function — produces
// a validator that accumulates RTValidationError entries into the third arg
// `er` instead of returning a boolean. The factory shape it emits:
//
//	export function g_verr_<hash>(utl){
//	  'use strict';
//	  const nRT = utl.getPureFn('rt::newRunTypeErr');
//	  return function verr_<hash>(v,pth=[],er=[]){ <body>; return er }
//	}
//
// Mirrors `ValidateEmitter` (istype.go) but with the three-arg shape and
// a finalize that always returns `er`. Each arm of the kind switch
// mirrors the corresponding `emitTypeErrors` method under
// (ref: packages/run-types/src/nodes/**).
type ValidationErrorsEmitter struct{}

// validationErrorsPureFnFilePath is the source path the resolver reports as the
// `pf_newRunTypeErr` pure-fn registration's expected home (the `{3}` arg in the
// PFE9012 message). The JS side registers the factory in pure-fns-utils.ts (the
// same file validate uses for its own pure-fn deps). It is a repo-relative hint
// only — the whole-program PFE9012 check matches by key, not by this path.
const validationErrorsPureFnFilePath = "packages/ts-runtypes/src/runtypes/pure-fns-utils.ts"

// Args returns the three parameters the inner validationErrors function takes.
// Mirrors `rtErrorArgs` (ref: packages/run-types/src/constants.functions.ts:47):
// vλl=v (current value), pλth=pth (path accumulator, default []),
// εrr=er (error accumulator, default []).
func (ValidationErrorsEmitter) Args() []ArgSpec {
	return []ArgSpec{
		{Key: "vλl", Name: "v", Default: ""},
		{Key: "pλth", Name: "pth", Default: "[]"},
		{Key: "εrr", Name: "er", Default: "[]"},
	}
}

// EmitCircularGuard renders the inline circular-reference guard for the armed
// validationErrors variant: a detected cycle records a `{expected:'circular'}`
// entry at the current path (prefixed by the incoming `pth`) and returns early —
// descending into the base body would recurse forever on the cyclic value.
// Mirrors the old runtime guard's short-circuit in entryTuple.ts.
func (ValidationErrorsEmitter) EmitCircularGuard(fcpAlias, skeletonConst string) string {
	return "const cyR=" + fcpAlias + "(v," + skeletonConst + ");" +
		"if(cyR){er.push({path:pth.length?pth.concat(cyR):cyR,expected:'circular'});return er;}"
}

// Supports — the shared validate/validationErrors kind set
// (validationSupports in validate.go).
func (ValidationErrorsEmitter) Supports(rt *protocol.RunType) bool {
	return validationSupports(rt)
}

// IsRTInlined delegates to DefaultIsRTInlined — same heuristics as
// validate (the predicate is shared across all rt fns via
// BaseRunType.isRTInlined).
func (ValidationErrorsEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// IsNoopType — the verr entry is the error-list passthrough exactly for
// any/unknown roots (see isNoopForValidationErrors).
func (ValidationErrorsEmitter) IsNoopType(rt *protocol.RunType, ctx *EmitContext) bool {
	return isNoopForValidationErrors(rt, ctx)
}

// NoopChildComposesAround — a child that never records an error contributes
// nothing; empty code composes correctly.
func (ValidationErrorsEmitter) NoopChildComposesAround() {}

// ReturnName is `er` — validationErrors accumulates errors into the third
// arg and returns it. Differs from validate which returns the first arg
// (`v`). See Walker.returnName for how this is consumed.
func (ValidationErrorsEmitter) ReturnName() string {
	return "er"
}

// Emit dispatches the per-kind switch. Each arm emits CodeS
// statements that either check the value and append errors via
// callRTErr on mismatch, or recurse into children with the path
// segment threaded through via SetChildPathLiteral. Mirrors the
// emitTypeErrors per-node implementations.
//
// Unsupported kinds emit CodeNS — the walker latches the signal and
// the renderer drops the factory entirely. Same contract as
// ValidateEmitter.
func (e ValidationErrorsEmitter) Emit(rt *protocol.RunType, ctx *EmitContext, expectedCType CodeType) RTCode {
	base := e.emitKindDefault(rt, ctx, expectedCType)
	// Format annotations append a format-specific error-push statement
	// after the base-kind check. Only spliced when (a) a format emitter
	// is registered, (b) the emitter's check returns a non-empty
	// statement, (c) the base output is a statement body (CodeS). The
	// format check runs only when the base predicate's type-mismatch
	// branch did NOT fire — we guard with the base's positive
	// predicate so format errors only surface for values of the right
	// underlying kind. `pth` is the runtime path argument the
	// validationErrors validator receives; format errors push relative to
	// that, mirroring the getCallJitFormatErr behaviour.
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
	// Negations: the value fails ¬child precisely when it PASSES the child,
	// i.e. when the child's own verr body pushes ZERO errors. The child's
	// statements are compiled with this walker and probed against a SCRATCH
	// error array (er/pth shadowed in an IIFE), so this works uniformly for
	// every child kind — leaf, format-branded, compound — with no
	// cross-family cache reference and no risk of polluting the real error
	// list with the child's (meaningless-under-negation) positive errors.
	// One canonical 'not' error per negation, matching how JSON Schema
	// validators report a single "must NOT be valid". Gated on the base-kind
	// guard so a type-mismatched value reports only the base error.
	// patternProperties / propertyNames: per-key probes with the scratch
	// error array; one canonical error per violated entry, gated on the
	// base-kind guard like every splice here.
	if base.Type == CodeS && rt != nil && (len(rt.PatternProps) > 0 || rt.PropNames != nil) {
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
			check := "let " + okVar + " = true;for (const " + kVar + " of Object.keys(" + ctx.Vλl + ")) {" +
				"if (!" + reVar + ".test(" + kVar + ")) continue;" +
				"const " + scratch + " = [];((er,pth)=>{" + childRT.Code + "})(" + scratch + ",[]);" +
				"if (" + scratch + ".length > 0) " + okVar + " = false;}" +
				"if (!" + okVar + ") " + formats.FormatErrCall("pth", "er", "object", "patternProperties", "pattern", jsquote.Single(patternProp.Source))
			appendCheck(check)
		}
		if rt.PropNames != nil {
			if ctx.ResolveRef(rt.PropNames) == nil {
				panic("validationErrors: unresolvable propertyNames child")
			}
			kVar := ctx.NextLocalVar("pk")
			ctx.SetChildAccessor(kVar)
			childRT := ctx.CompileChild(rt.PropNames, CodeS)
			ctx.SetChildAccessor("")
			if childRT.Type != CodeNS && childRT.Code != "" {
				okVar := ctx.NextLocalVar("pok")
				scratch := ctx.NextLocalVar("per")
				check := "let " + okVar + " = true;for (const " + kVar + " of Object.keys(" + ctx.Vλl + ")) {" +
					"const " + scratch + " = [];((er,pth)=>{" + childRT.Code + "})(" + scratch + ",[]);" +
					"if (" + scratch + ".length > 0) " + okVar + " = false;}" +
					"if (!" + okVar + ") " + formats.FormatErrCall("pth", "er", "object", "propertyNames", "propertyNames", "true")
				appendCheck(check)
			}
		}
	}
	// Contains: count the items whose child verr body pushes ZERO errors
	// (the same scratch-array probe the negation splice uses) and push one
	// canonical error per violated bound. Gated on the base-kind guard so a
	// non-array value reports only the base error.
	if base.Type == CodeS && rt != nil && len(rt.Contains) > 0 {
		for _, containsCheck := range rt.Contains {
			if ctx.ResolveRef(containsCheck.Child) == nil {
				panic("validationErrors: unresolvable contains child — dropping it would silently weaken validation")
			}
			iVar := ctx.NextLocalVar("ci")
			ctx.SetChildAccessor(ctx.Vλl + "[" + iVar + "]")
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
				count = "const " + nVar + " = " + ctx.Vλl + ".length;"
			default:
				scratch := ctx.NextLocalVar("cer")
				count = "let " + nVar + " = 0;for (let " + iVar + " = 0; " + iVar + " < " + ctx.Vλl + ".length; " + iVar + "++) {" +
					"const " + scratch + " = [];((er,pth)=>{" + childRT.Code + "})(" + scratch + ",[]);" +
					"if (" + scratch + ".length === 0) " + nVar + "++;}"
			}
			check := count +
				"if (" + nVar + " < " + formats.FormatNumber(containsCheck.Min) + ") " +
				formats.FormatErrCall("pth", "er", "array", "contains", "minContains", formats.FormatNumber(containsCheck.Min))
			if containsCheck.Max >= 0 {
				check += ";if (" + nVar + " > " + formats.FormatNumber(containsCheck.Max) + ") " +
					formats.FormatErrCall("pth", "er", "array", "contains", "maxContains", formats.FormatNumber(containsCheck.Max))
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
	if base.Type == CodeS && rt != nil && len(rt.Negations) > 0 {
		for _, negation := range rt.Negations {
			if ctx.ResolveRef(negation) == nil {
				panic("validationErrors: unresolvable negation child — dropping it would silently weaken validation")
			}
			childRT := ctx.CompileChild(negation, CodeS)
			if childRT.Type == CodeNS {
				// The child's validator always throws (never-ish): no value can
				// match it, so the negation can never fail — nothing to emit.
				continue
			}
			notErr := formats.FormatErrCall("pth", "er", "not", "not", "not", "true")
			var check string
			if childRT.Code == "" {
				// A noop child (any/unknown) matches EVERY value, so the
				// negation unconditionally fails.
				check = notErr
			} else {
				scratch := ctx.NextLocalVar("ner")
				check = "const " + scratch + "=[];((er,pth)=>{" + childRT.Code + "})(" + scratch + ",[]);" +
					"if (" + scratch + ".length===0) {" + notErr + "}"
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

// wrapFormatCheckPath wraps a format-error check so the runtime `pth` carries
// this node's static access-path segments while the check runs. Format errors
// snapshot the path as `[...pth]` (see formats.FormatErrCall), so without this
// a format failure at a property / array element / map-or-set entry would
// report `path: []` — the field is lost. Mirrors the push/splice envelope in
// EmitDependencyCall: push the segments before the check, splice them off
// after. An empty access-path (a root-position format, e.g. createValidateFn
// <TF.Email>()) leaves the check unchanged, so root format errors stay `[]`.
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

// baseKindGuard returns a JS expression that's true when vλl matches
// the base kind, used as the gate around format-specific error checks
// so they don't run on type-mismatched values. Returns "" when no
// guard applies (no format emitter should ever land on an unkinded
// node, but keep this defensive).
func baseKindGuard(rt *protocol.RunType, vλl, numberMode string) string {
	if rt == nil {
		return ""
	}
	switch rt.Kind {
	case protocol.KindString:
		return "typeof " + vλl + " === 'string'"
	case protocol.KindNumber:
		return numberBaseCheck(numberMode, vλl)
	case protocol.KindBigInt:
		return "typeof " + vλl + " === 'bigint'"
	case protocol.KindClass:
		if info, ok := protocol.TemporalInfoBySubKind(rt.SubKind); ok {
			// A Temporal compare() throws on a non-Temporal value — gate the
			// bound check on instanceof so a wrong-type value yields a clean
			// base-kind error instead of throwing.
			return vλl + " instanceof " + info.Builtin
		}
		// Native Date format (KindClass + SubKindDate): guard the min/max
		// bound check so it only runs on a valid Date — `.getTime()` on a
		// non-Date would throw instead of pushing a clean error.
		return vλl + " instanceof Date && !isNaN(" + vλl + ".getTime())"
	case protocol.KindArray, protocol.KindTuple:
		// Structural array formats read `.length` — guard so a wrong-kind
		// value (null!) reports only the base error instead of throwing.
		return "Array.isArray(" + vλl + ")"
	case protocol.KindObjectLiteral, protocol.KindObject:
		// Structural object formats read Object.keys — same throw guard.
		return "typeof " + vλl + " === 'object' && " + vλl + " !== null"
	}
	return ""
}

func (ValidationErrorsEmitter) emitKindDefault(rt *protocol.RunType, ctx *EmitContext, _ CodeType) RTCode {
	if rt == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	switch rt.Kind {

	case protocol.KindString:
		// (ref: nodes/atomic/string.ts:emitTypeErrors)
		return RTCode{
			Code: "if (typeof " + v + " !== 'string') " + callRTErr(ctx, "string", ""),
			Type: CodeS,
		}

	case protocol.KindNumber:
		// (ref: nodes/atomic/number.ts:emitTypeErrors). Default Number.isFinite
		// rejects NaN / Infinity / -Infinity along with non-numbers; the
		// numberMode ValidateOption swaps in the looser typeof / notNaN base
		// check (kept in lockstep with the validate emitter via numberBaseCheck).
		return RTCode{
			Code: "if (!(" + numberBaseCheck(ctx.NumberMode(), v) + ")) " + callRTErr(ctx, "number", ""),
			Type: CodeS,
		}

	case protocol.KindBoolean:
		// (ref: nodes/atomic/boolean.ts:emitTypeErrors)
		return RTCode{
			Code: "if (typeof " + v + " !== 'boolean') " + callRTErr(ctx, "boolean", ""),
			Type: CodeS,
		}

	case protocol.KindBigInt:
		// (ref: nodes/atomic/bigInt.ts:emitTypeErrors)
		return RTCode{
			Code: "if (typeof " + v + " !== 'bigint') " + callRTErr(ctx, "bigint", ""),
			Type: CodeS,
		}

	case protocol.KindSymbol:
		// Unsupported — symbol identity does not round-trip.
		return RTCode{Code: "", Type: CodeNS}

	case protocol.KindNull:
		// (ref: nodes/atomic/null.ts:emitTypeErrors)
		return RTCode{
			Code: "if (" + v + " !== null) " + callRTErr(ctx, "null", ""),
			Type: CodeS,
		}

	case protocol.KindUndefined:
		// (ref: nodes/atomic/undefined.ts:emitTypeErrors). Uses
		// typeof to allow `var v` references that haven't been
		// assigned yet (matches the `typeof === 'undefined'` text).
		return RTCode{
			Code: "if (typeof " + v + " !== 'undefined') " + callRTErr(ctx, "undefined", ""),
			Type: CodeS,
		}

	case protocol.KindVoid:
		// (ref: nodes/atomic/void.ts:emitTypeErrors) — void accepts
		// only undefined; null is rejected (matches validate).
		return RTCode{
			Code: "if (" + v + " !== undefined) " + callRTErr(ctx, "void", ""),
			Type: CodeS,
		}

	case protocol.KindAny, protocol.KindUnknown:
		// (ref: nodes/atomic/any.ts:emitTypeErrors) returns a noop.
		// Finalize collapses empty bodies to `return er` and flags
		// the factory as a noop so the renderer skips emitting it;
		// consumers fall through to `() => []` on the JS side.
		if ctx.IsRoot() {
			ctx.EmitDiagnosticSlot(SlotRootAnyUnknown)
		}
		return RTCode{Code: "", Type: CodeS}

	case protocol.KindNever:
		// (ref: nodes/atomic/never.ts:emitTypeErrors) — every value is
		// an error against `never`. No type check, just record the
		// error unconditionally.
		return RTCode{
			Code: callRTErr(ctx, "never", "") + ";",
			Type: CodeS,
		}

	case protocol.KindObject:
		// (ref: nodes/atomic/object.ts) — strict TS `object` type:
		// non-null and not a primitive. Same gate as validate.
		return RTCode{
			Code: "if (!(typeof " + v + " === 'object' && " + v + " !== null)) " + callRTErr(ctx, "objectLiteral", ""),
			Type: CodeS,
		}

	case protocol.KindRegexp:
		// (ref: nodes/atomic/regexp.ts:emitTypeErrors)
		return RTCode{
			Code: "if (!(" + v + " instanceof RegExp)) " + callRTErr(ctx, "regexp", ""),
			Type: CodeS,
		}

	case protocol.KindLiteral:
		return emitLiteralValidationErrors(rt, ctx)

	case protocol.KindEnum:
		// (ref: nodes/atomic/enum.ts:emitTypeErrors) — OR-chain of
		// `v === val` checks; record an error if NONE match.
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

	case protocol.KindClass:
		if rt.SubKind == protocol.SubKindDate {
			// (ref: nodes/atomic/date.ts:emitTypeErrors) — Date instance
			// AND a valid date (rejects `new Date('not a date')`).
			return RTCode{
				Code: "if (!(" + v + " instanceof Date) || isNaN(" + v + ".getTime())) " + callRTErr(ctx, "date", ""),
				Type: CodeS,
			}
		}
		if info, ok := protocol.TemporalInfoBySubKind(rt.SubKind); ok {
			// Temporal types: instanceof is sufficient (no invalid state).
			// The expected-name carries the qualified type for clear errors.
			return RTCode{
				Code: "if (!(" + v + " instanceof " + info.Builtin + ")) " + callRTErr(ctx, info.Builtin, ""),
				Type: CodeS,
			}
		}
		if rt.SubKind == protocol.SubKindNone {
			// Non-Date user classes — same emit as KindObjectLiteral
			// per the class.ts node (extends InterfaceRunType).
			return emitObjectValidationErrors(rt, ctx, v)
		}
		if rt.SubKind == protocol.SubKindMap {
			return emitMapValidationErrors(rt, ctx, v)
		}
		if rt.SubKind == protocol.SubKindSet {
			return emitSetValidationErrors(rt, ctx, v)
		}
		if rt.SubKind == protocol.SubKindNonSerializable {
			// (ref: nodes/native/nonSerializable.ts:21-22) —
			// `emitTypeErrors(): RTCode { throw new Error('RT
			// compilation disabled for Non Serializable types.'); }`.
			return RTCode{Code: "", Type: CodeNS}
		}
		// Future subkinds — silent skip.
		return RTCode{Code: "", Type: CodeNS}

	case protocol.KindPromise:
		// (ref: nodes/native/promise.ts) — thenable check, wrapped T
		// not validated synchronously.
		return RTCode{
			Code: "if (!(typeof " + v + " === 'object' && " + v + " !== null && typeof " + v + ".then === 'function')) " + callRTErr(ctx, "promise", ""),
			Type: CodeS,
		}

	case protocol.KindObjectLiteral:
		return emitObjectValidationErrors(rt, ctx, v)

	case protocol.KindProperty, protocol.KindPropertySignature:
		return emitPropertyValidationErrors(rt, ctx, v)

	case protocol.KindIndexSignature:
		return emitIndexSignatureValidationErrors(rt, ctx, v)

	case protocol.KindFunction, protocol.KindMethod,
		protocol.KindMethodSignature, protocol.KindCallSignature:
		// (ref: nodes/function/function.ts:emitTypeErrors) — `typeof v
		// === 'function'`. Children (params, return) aren't validated
		// here; treat the whole shape as opaque-callable.
		return RTCode{
			Code: "if (typeof " + v + " !== 'function') " + callRTErr(ctx, rtTypeNameForKind(rt.Kind), ""),
			Type: CodeS,
		}

	case protocol.KindTuple:
		return emitTupleValidationErrors(rt, ctx, v)

	case protocol.KindTupleMember:
		return emitTupleMemberValidationErrors(rt, ctx, v)

	case protocol.KindUnion:
		return emitUnionValidationErrors(rt, ctx, v)

	case protocol.KindTemplateLiteral:
		return emitTemplateLiteralValidationErrors(rt, ctx, v)

	case protocol.KindArray:
		// (ref: nodes/member/array.ts:emitTypeErrors). Allocates a loop
		// counter, sets the child accessor (`v[i0]`) so the element's
		// CompileChild adopts the subscript, sets the path literal (the
		// counter var name) so element errors carry [..., i0] in their
		// access-path, then composes:
		//
		//   if (!Array.isArray(v)) {
		//     <callRTErr 'array'>
		//   } else {
		//     for (let i0 = 0; i0 < v.length; i0++) {
		//       <childCode>
		//     }
		//   }
		//
		// Two collapse paths: child empty + noIsArrayCheck
		// → "" (whole check evaporates); child empty + no noIsArrayCheck
		// → bare `if (!Array.isArray(v)) <err>;` (array-only check).
		if rt.Child == nil {
			return RTCode{Code: "", Type: CodeS}
		}
		// Non-serializable element (symbol / function) → the child compile
		// below returns CodeNS (leaf = the element), propagated upward by the
		// `childRT.Type == CodeNS` check → alwaysThrow at root, absorb at a
		// property. (T3; matches istype.go's array arm.)
		noIsArrayCheck := ctx.HasVariantOption("noIsArrayCheck")
		iVar := ctx.NextLocalVar("i")
		ctx.SetChildAccessor(v + "[" + iVar + "]")
		ctx.SetChildPathLiteral(iVar)
		childRT := ctx.CompileChild(rt.Child, CodeS)
		ctx.SetChildAccessor("")
		ctx.SetChildPathLiteral("")
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		// If the child contributes no body (e.g. KindAny element),
		// reduce to the bare array guard or a noop.
		if childRT.Code == "" {
			if noIsArrayCheck {
				return RTCode{Code: "", Type: CodeS}
			}
			return RTCode{
				Code: "if (!Array.isArray(" + v + ")) " + callRTErr(ctx, "array", ""),
				Type: CodeS,
			}
		}
		itemsCode := "for (let " + iVar + " = 0; " + iVar + " < " + v + ".length; " + iVar + "++) {" + childRT.Code + "}"
		if noIsArrayCheck {
			return RTCode{Code: itemsCode, Type: CodeS}
		}
		return RTCode{
			Code: "if (!Array.isArray(" + v + ")) {" + callRTErr(ctx, "array", "") + "} else {" + itemsCode + "}",
			Type: CodeS,
		}
	}
	return RTCode{Code: "", Type: CodeNS}
}

// EmitDependencyCall returns the JS expression that invokes a
// pre-rendered child validationErrors entry. Wraps the call with a
// `pth.push(...) ; <call> ; pth.splice(-N)` envelope when the current
// static-path segments are non-empty so the child's errors carry the
// right access-path prefix. Mirrors the `BaseFnCompiler.callDependency`
// branch at rtFnCompiler.ts:388-397.
func (ValidationErrorsEmitter) EmitDependencyCall(rt *protocol.RunType, childID string, ctx *EmitContext) string {
	return ctx.emitPathTrackedDepCall(childID)
}

// Finalize wraps the raw body. Empty body → noop ("return er", true);
// otherwise the walker has already appended `return er` via the
// statement-shape handling in handleCodeInterpolation, so we just
// normalise whitespace and return.
func (ValidationErrorsEmitter) Finalize(rawCode string) (string, bool) {
	code := normaliseWhitespace(rawCode)
	trimmed := strings.TrimSpace(code)
	if trimmed == "" {
		return "return er", true
	}
	return code, false
}

// callRTErr builds the JS call to pf_newRunTypeErr that appends one
// RTValidationError entry to the `er` array. Mirrors
// RTErrorsFnCompiler.callRTErr / callRTErrWithPath
// (rtFnCompiler.ts:610-629).
//
// Args at the call site:
//   - pth (runtime path array)
//   - er  (error accumulator)
//   - expected (kindname string literal)
//   - accessPath? (static path segments collected from the walker stack)
//
// `extra` adds a trailing segment to the static path (used for
// "unknown key" / "map key" markers that aren't part of the runtime
// path but should appear in the error). Empty `extra` → no trailing
// segment, AccessPathLiteral handles the empty-array short-circuit.
func callRTErr(ctx *EmitContext, expected string, extra string) string {
	// UsePureFn records the dep, hoists the deduped
	// `const nRT = utl.getPureFn('rt::newRunTypeErr')` prologue line, and
	// returns the alias. rtUtils.getPureFn takes a single composite key
	// `<namespace>::<fnName>` (see pureFnKey helper in
	// packages/ts-runtypes/src/runtypes/rtUtils.ts:45); the literal is fully
	// spelled out because the body is also evaluated through
	// `new Function('utl', code)` where module-level consts are not in scope.
	key := ctx.UsePureFn(corePureFnNamespace, "newRunTypeErr", validationErrorsPureFnFilePath)
	pthArg := ctx.ArgName("pλth")
	errArg := ctx.ArgName("εrr")
	args := []string{pthArg, errArg, quoteJS(expected)}
	if path := ctx.AccessPathLiteral(extra); path != "" {
		args = append(args, path)
	}
	return key + "(" + strings.Join(args, ",") + ")"
}

// emitLiteralValidationErrors mirrors compileValidationErrorsLiteral
// (nodes/atomic/literal.ts:107). Reuses emitLiteral's branching for
// the bigint / symbol / regexp / primitive cases — emitLiteral returns
// a JS boolean expression (the validate check); we wrap it in
// `if (!(<expr>)) <error>`. With the noLiterals ValidateOptions variant,
// the predicate switches to the base-kind check (e.g. `typeof v ===
// 'string'`) and the error label downgrades to the base kind too —
// matches the `it` variant's behaviour so the user sees the same
// notion of "expected" between the two factories.
func emitLiteralValidationErrors(rt *protocol.RunType, ctx *EmitContext) RTCode {
	noLiterals := ctx.HasVariantOption("noLiterals")
	var validateExpr RTCode
	if noLiterals {
		validateExpr = emitLiteralBaseKind(rt, ctx.Vλl, ctx.NumberMode())
	} else {
		validateExpr = emitLiteral(rt, ctx.Vλl)
	}
	// Propagate CodeNS (unsupported leaf) — `emitLiteralBaseKind`
	// returns this for the symbol-literal arm so the renderer can
	// emit an alwaysThrow factory at the root, matching the plain
	// KindSymbol behaviour.
	if validateExpr.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if validateExpr.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	expectedLabel := "literal"
	if noLiterals {
		expectedLabel = literalBaseKindLabel(rt)
	}
	return RTCode{
		Code: "if (!(" + validateExpr.Code + ")) " + callRTErr(ctx, expectedLabel, ""),
		Type: CodeS,
	}
}

// literalBaseKindLabel returns the `expected` label that pairs with
// the `noLiterals` variant body for a literal RunType — picks the
// base atomic kind's name (`'string'`, `'number'`, …) so the
// validationErrors output reads consistently with the validated shape.
func literalBaseKindLabel(rt *protocol.RunType) string {
	flagSet := make(map[string]bool, len(rt.Flags))
	for _, flag := range rt.Flags {
		flagSet[flag] = true
	}
	if flagSet["bigint"] {
		return "bigint"
	}
	if flagSet["symbol"] {
		return "symbol"
	}
	switch rt.Literal.(type) {
	case bool:
		return "boolean"
	case int64, float64:
		return "number"
	case string:
		return "string"
	}
	return "literal"
}

// emitObjectValidationErrors mirrors
// nodes/collection/interface.ts:emitTypeErrors. Builds the canonical
// object-shape statement: a `typeof === 'object' && !== null` guard
// (or `typeof === 'function'` for callable interfaces) that emits an
// error on mismatch, otherwise runs each child's emitTypeErrors
// statement.
//
// Children are filtered the same way getRTChildren filters
// (matching emitObjectValidate in istype.go): static + method-shaped
// kinds dropped; PropertySignature wrapping a function-typed value
// also dropped via its own empty emit.
//
// When every contributing child is optional (or there are no
// contributing children), the object guard is augmented with the
// `allOptionalCode` clause — `(!Array.isArray(v) &&
// Object.prototype.toString.call(v) === '[object Object]')` — so
// arrays / Date / Map / Set are explicitly rejected at the top level
// rather than slipping through the bare `typeof === 'object'` check.
// Mirrors interface.ts:allOptionalCode. Suppressed for callable
// shapes (the value is a Function, not an Object).
func emitObjectValidationErrors(rt *protocol.RunType, ctx *EmitContext, v string) RTCode {
	// Detect a CallSignature child for the callable-interface case.
	var callSigChild *protocol.RunType
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if resolved.Kind == protocol.KindCallSignature {
			callSigChild = child
			break
		}
	}

	// A callable interface at a NON-root position is function-like (dropped at a
	// property, alwaysThrow at a propagating slot) — return CodeNS so the parent
	// handles it like any other function-valued child (matching validate +
	// serializers, F2). At the ROOT the typeof-function guard below applies.
	if callSigChild != nil && !ctx.IsRoot() {
		return RTCode{Code: "", Type: CodeNS}
	}

	// Publish sibling-named-prop set for any index-signature child
	// (see emitObjectValidate for the rationale).
	publishSiblingNamedKeysForIndexSig(rt, ctx)

	// Compile per-child error-accumulation code, filtering the same
	// way emitObjectValidate does, AND track whether all contributing
	// children are optional (or an index signature is present) so we can
	// add the allOptionalCode guard.
	var childrenParts []string
	allOptional := true
	hasContributingChild := false
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
		if resolved.Kind == protocol.KindIndexSignature {
			hasIndexSig = true
		}
		if isFunctionLikeKind(resolved.Kind) {
			// Method / MethodSignature / CallSignature on the shape —
			// skip from the children body (callable case is handled by
			// the typeof === 'function' guard below).
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
	// allOptionalCode guard — same shape (and same condition) as
	// emitObjectValidate. Without it, `{}` validators would accept `[]`,
	// `new Date()`, `new Map()`, etc. since those all pass `typeof ===
	// 'object' && !== null`. The `hasIndexSig` term is essential for
	// parity with validate: a `Record<K, V>` (or any index-signature
	// object) walks own keys with a for-in loop, which enumerates NOTHING
	// on an empty array / Map / Set / Date, so the per-key value check is
	// vacuously satisfied and the bare `typeof === 'object'` lets those
	// non-plain objects slip through with zero errors — while validate
	// (which carries the same guard) returns false. Dropping the term
	// breaks the createValidateFn/createGetValidationErrorsFn agreement
	// invariant (guarded by fuzz oracle O4).
	if callSigChild == nil && (!hasContributingChild || allOptional || hasIndexSig) {
		objectCheck = objectCheck + " && !Array.isArray(" + v + ") && Object.prototype.toString.call(" + v + ") === '[object Object]'"
	}

	expected := "objectLiteral"
	if rt.Kind == protocol.KindClass {
		expected = "class"
	}
	if callSigChild != nil {
		expected = "function"
	}

	if childrenCode == "" {
		// No contributing children — emit only the shape guard.
		return RTCode{
			Code: "if (!(" + objectCheck + ")) " + callRTErr(ctx, expected, ""),
			Type: CodeS,
		}
	}
	return RTCode{
		Code: "if (!(" + objectCheck + ")) {" + callRTErr(ctx, expected, "") + "} else {" + childrenCode + "}",
		Type: CodeS,
	}
}

// emitPropertyValidationErrors handles KindProperty / KindPropertySignature.
// Sets the child accessor + child path literal (the property name as a
// JS string literal) before recursing, then wraps the child code in
// an optional guard if the property is optional. Mirrors
// nodes/member/property.ts:emitTypeErrors.
func emitPropertyValidationErrors(rt *protocol.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if strippedPropertyDrop(resolved, rt.Name, ctx) {
		// Directly DataOnly-stripped value — drop the property, matching
		// `DataOnly<{a: symbol}>` = `{}`.
		return RTCode{Code: "", Type: CodeS}
	}
	accessor := propertyAccessor(v, rt.Name, rt.IsSafeName)
	ctx.SetChildAccessor(accessor)
	ctx.SetChildPathLiteral(quoteJS(rt.Name))
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	ctx.SetChildPathLiteral("")
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

// emitIndexSignatureValidationErrors handles KindIndexSignature. Loops
// `for (const k in v)` and runs each value's validationErrors with the key
// var as the path segment. Template-literal key constraints emit a
// per-key regex.test that records a 'never' error for keys that don't
// match the pattern. Mirrors
// nodes/member/indexProperty.ts:emitTypeErrors.
func emitIndexSignatureValidationErrors(rt *protocol.RunType, ctx *EmitContext, v string) RTCode {
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
	// Template-literal key regex (`{[k: `api/${string}`]: T}`) lifted
	// into the closure prologue, same shape as the validate emit.
	keyRegexVar := ""
	if rt.Index != nil {
		indexResolved := ctx.ResolveRef(rt.Index)
		if indexResolved != nil && indexResolved.Kind == protocol.KindTemplateLiteral {
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
	if skip := siblingNamedSkipCode(rt, ctx, keyVar); skip != "" {
		body.WriteString(skip)
		body.WriteString(" ")
	}
	if keyRegexVar != "" {
		// Template-literal key failure → 'never' error at path
		// [..., keyVar]. Mirrors callRTErrWithPath('never', keyVar).
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

// rtTypeNameForKind returns the kindname used for the
// `expected` field on a RTValidationError record. Mirrors module.go's
// rtTypeName function but for the no-RunType callers — function-
// flavoured kinds map to their concrete name (function / method /
// methodSignature / callSignature).
func rtTypeNameForKind(kind protocol.ReflectionKind) string {
	switch kind {
	case protocol.KindFunction:
		return "function"
	case protocol.KindMethod:
		return "method"
	case protocol.KindMethodSignature:
		return "methodSignature"
	case protocol.KindCallSignature:
		return "callSignature"
	}
	return ""
}

// emitTupleValidationErrors mirrors
// nodes/collection/tuple.ts:emitTypeErrors. Body shape (CodeS):
//
//	if (!Array.isArray(v) [|| v.length > N]) {
//	  <callRTErr 'tuple'>
//	} else {
//	  <member0Code>; <member1Code>; …
//	}
//
// Empty tuple gets the `Array.isArray && length === 0` shape (an
// empty array is the only valid value). Rest-bearing tuples skip the
// upper-length-bound check; rest-member emit handles the per-element
// loop and accumulates errors with the loop counter as the path.
func emitTupleValidationErrors(rt *protocol.RunType, ctx *EmitContext, v string) RTCode {
	if len(rt.Children) == 0 {
		// Empty tuple — only the empty array passes.
		return RTCode{
			Code: "if (!(Array.isArray(" + v + ") && " + v + ".length === 0)) " + callRTErr(ctx, "tuple", ""),
			Type: CodeS,
		}
	}
	// Build the per-member body.
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

// emitMapValidationErrors mirrors nodes/native/map emitTypeErrors.
// Body shape (CodeS):
//
//	if (!(v instanceof Map)) {
//	  <callRTErr 'map'>
//	} else {
//	  for (const entry0 of v.entries()) {
//	    const k0 = entry0[0]; const val0 = entry0[1];
//	    <keyCode using k0 as v, path += {key:i0, failed:'mapKey'}>
//	    <valCode using val0 as v, path += {key:i0, failed:'mapValue'}>
//	  }
//	}
//
// Path segments are JS object literals whose `key` is the entry's
// iteration index — the only pointer that survives non-PropertyKey Map
// keys (object/symbol/null), and the value Standard Schema's getDotPath
// can read — plus a `failed` marker for which side of the entry failed.
func emitMapValidationErrors(rt *protocol.RunType, ctx *EmitContext, v string) RTCode {
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
			// Dep-call envelope keys end with `(pth.push(...), <call>,
			// pth.splice(-1))` — a parenthesised comma expression with
			// no trailing semicolon. Without an explicit separator, the
			// next `const val0 = ...` lexes as `(expr)const` which is
			// a JS syntax error. Append `;` defensively for any non-
			// terminator-ending key code; identical to the
			// "emit each child on its own statement" convention.
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
			// Same statement-separator concern as the key half: keep a
			// trailing `;` between a `(...)` comma-expression and the
			// loop's `i0++`.
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

// emitTemplateLiteralValidationErrors mirrors
// nodes/collection/templateLiteral.ts:emitTypeErrors. Reuses
// emitTemplateLiteralValidate to get the boolean expression
// (`typeof v === 'string' && reTL.test(v)`), wraps in
// `if (!<expr>) callRTErr('templateLiteral')`.
func emitTemplateLiteralValidationErrors(rt *protocol.RunType, ctx *EmitContext, v string) RTCode {
	validateExpr := emitTemplateLiteralValidate(rt, ctx, v)
	if validateExpr.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	return RTCode{
		Code: "if (!(" + validateExpr.Code + ")) " + callRTErr(ctx, "templateLiteral", ""),
		Type: CodeS,
	}
}

// emitUnionValidationErrors mirrors
// nodes/collection/union.ts:emitTypeErrors. The validator delegates
// to the validate boolean check — `if (!val_<hash>.fn(v)) <err>`.
// Per-arm error breakdown is explicitly NOT a feature of
// validationErrors (a union failure is one error, not N).
//
// The cross-fn lookup happens at runtime via the shared rtUtils
// cache. We register a closure-prologue context item but DO NOT add
// the validate hash to walker.RTDependencies — the dangling-dep
// cascade in module.go operates per-fn (entries map only carries
// validationErrors entries), so a validationErrors entry can't satisfy an
// validate dep ref. The runtime load order (validate cache → validationErrors
// cache) means the entry is always populated by the time the
// validationErrors closure invokes `utl.getRT('val_<hash>')`.
func emitUnionValidationErrors(rt *protocol.RunType, ctx *EmitContext, v string) RTCode {
	validateHash := operations.PlainHash("validate") + "_" + rt.ID
	ctx.registerRTLookup(validateHash)
	// OneOf — the validate delegate already enforces exactly-one (its
	// boolean is the counting check), so detection is unchanged; inside the
	// failure block the branches are re-probed against scratch error arrays
	// (the negation-splice idiom) purely to tell the two failure stories
	// apart: matched none → the canonical union error, matched several →
	// one 'oneOf' error carrying the match count as its val.
	if len(rt.OneOf) > 0 {
		nVar := ctx.NextLocalVar("xn")
		var count strings.Builder
		count.WriteString("let " + nVar + " = 0;")
		for _, branch := range rt.OneOf {
			if ctx.ResolveRef(branch) == nil {
				panic("validationErrors: unresolvable oneOf branch — dropping it would silently weaken validation")
			}
			branchRT := ctx.CompileChild(branch, CodeS)
			if branchRT.Type == CodeNS {
				panic("validationErrors: non-serializable oneOf branch — dropping it would silently weaken validation")
			}
			if branchRT.Code == "" {
				// No-check branch (unknown / noop) matches unconditionally.
				count.WriteString(nVar + "++;")
				continue
			}
			scratch := ctx.NextLocalVar("xer")
			count.WriteString("const " + scratch + " = [];((er,pth)=>{" + branchRT.Code + "})(" + scratch + ",[]);" +
				"if (" + scratch + ".length === 0) " + nVar + "++;")
		}
		return RTCode{
			Code: "if (!" + validateHash + ".fn(" + v + ")) {" + count.String() +
				"if (" + nVar + " > 1) {" + formats.FormatErrCall("pth", "er", "union", "oneOf", "oneOf", nVar) +
				"} else {" + callRTErr(ctx, "union", "") + "}}",
			Type: CodeS,
		}
	}
	return RTCode{
		Code: "if (!" + validateHash + ".fn(" + v + ")) " + callRTErr(ctx, "union", ""),
		Type: CodeS,
	}
}

// emitSetValidationErrors mirrors nodes/native/set emitTypeErrors.
// Same pattern as Map but with a single item type and `.values()`
// iteration. Path segment for an item error: {key:i0, failed:'setKey'}
// — `key` is the iteration index (a Set item value is data, not an
// address); `failed:'setKey'` parallels Map's key/value markers.
func emitSetValidationErrors(rt *protocol.RunType, ctx *EmitContext, v string) RTCode {
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
		// {key:i0, failed:'setKey'} — the iteration index locates the
		// failing item; the value itself is data, not a serialisable
		// address (object/null items have no PropertyKey form).
		ctx.SetChildPathLiteral("{key:" + idxVar + ",failed:'setKey'}")
		itemRT := ctx.CompileChild(itemType, CodeS)
		ctx.SetChildAccessor("")
		ctx.SetChildPathLiteral("")
		if itemRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if itemRT.Code != "" {
			inner.WriteString(itemRT.Code)
			// Same statement-separator concern as the Map emitter: a
			// dep-call envelope `(pth.push(...), <call>, pth.splice(-1))`
			// has no trailing `;`, so the following `i0++` would lex as
			// `(expr)i0++` — a JS syntax error. Defensive semicolon.
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

// emitTupleMemberValidationErrors mirrors
// nodes/member/tupleMember.ts:emitTypeErrors. Sets the element
// accessor (`v[i]`) + path literal (the position index) before
// recursing into the wrapped child. Rest members produce a for-loop
// in their own emit; optional members get the undefined-guard wrap.
func emitTupleMemberValidationErrors(rt *protocol.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil || isFunctionLikeKind(resolved.Kind) {
		// Non-serializable element — `if (v[i] !== undefined)
		// callRTErrWithPath('undefined', i)`. The slot must be
		// undefined.
		idxLit := positionStr(rt)
		accessor := v + "[" + idxLit + "]"
		// Use the extra path literal to thread the index through the
		// access path (callRTErr second arg).
		return RTCode{
			Code: "if (" + accessor + " !== undefined) " + callRTErr(ctx, "undefined", idxLit),
			Type: CodeS,
		}
	}
	if isRestTupleMember(rt) {
		// Rest member — for-loop iterating from position to v.length.
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
	// Regular (possibly optional) member.
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
