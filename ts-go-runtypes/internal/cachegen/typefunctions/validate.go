package typefunctions

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsquote"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// numberBaseCheck returns the base `number` guard for a numberMode: isFinite (default), typeof (accepts NaN / Infinity), notNaN.
// The notNaN form is parenthesized so it composes when AND/OR-chained; shared with validationerrors.go so the two stay in lockstep.
func numberBaseCheck(numberMode, v string) string {
	switch numberMode {
	case constants.NumberModeTypeof:
		return "typeof " + v + " === 'number'"
	case constants.NumberModeNotNaN:
		return "(typeof " + v + " === 'number' && !Number.isNaN(" + v + "))"
	default:
		return "Number.isFinite(" + v + ")"
	}
}

// ValidateEmitter implements the `validate` rt function: a boolean validator per RunType.
// One file per rt fn owns its args, kind switch, noop detection and Supports predicate; the Walker in walker.go stays untouched.
type ValidateEmitter struct{}

// Args returns the single `v` parameter the inner validate function takes.
func (ValidateEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// EmitCircularGuard renders the inline cycle guard: a detected cycle makes the whole validator return false.
func (ValidateEmitter) EmitCircularGuard(fcpAlias, skeletonConst string) string {
	return "if(" + fcpAlias + "(v," + skeletonConst + "))return false;"
}

// validationSupports is the kind set shared by validate AND validationErrors: both families must cover exactly the same kinds.
// Keep it in lockstep with the `switch` in Emit — drift would silently emit broken JS or skip a valid kind.
// KindEnumMember is excluded on purpose: the reference throws "Enum member operations are not supported" from emitIsType.
func validationSupports(rt *reflection.RunType) bool {
	if rt == nil {
		return false
	}
	switch rt.Kind {
	case reflection.KindAny, reflection.KindUnknown,
		reflection.KindNever, reflection.KindVoid,
		reflection.KindNull, reflection.KindUndefined,
		reflection.KindString, reflection.KindNumber, reflection.KindBoolean,
		reflection.KindBigInt, reflection.KindSymbol,
		reflection.KindObject, reflection.KindRegexp,
		reflection.KindLiteral, reflection.KindEnum:
		return true
	case reflection.KindArray:
		// A malformed KindArray with Child=nil would otherwise reach Emit and panic.
		return rt.Child != nil
	case reflection.KindObjectLiteral:
		return true
	case reflection.KindClass:
		// Date is atomic, a plain class shares the interface emit, and Map / Set get their own arms.
		// NonSerializable IS supported so the renderer emits a throw-factory for it, mirroring the reference's throwing emitIsType.
		switch rt.SubKind {
		case reflection.SubKindDate, reflection.SubKindNone, reflection.SubKindMap, reflection.SubKindSet,
			reflection.SubKindNonSerializable:
			return true
		}
		return reflection.IsTemporalSubKind(rt.SubKind)
	case reflection.KindPromise:
		// Promise<T> is only a thenable check here: the wrapped T cannot be validated synchronously (use `Awaited<P>`).
		return true
	case reflection.KindProperty, reflection.KindPropertySignature:
		return true
	case reflection.KindIndexSignature:
		return true
	case reflection.KindFunction, reflection.KindMethod,
		reflection.KindMethodSignature, reflection.KindCallSignature:
		// At top level these emit `typeof v === 'function'`; as an object child the parent skips the slot (see emitObjectValidate).
		return true
	case reflection.KindTuple:
		return true
	case reflection.KindTupleMember:
		return true
	case reflection.KindUnion:
		// An empty union resolves to `never` per the reference semantics.
		return len(rt.Children) > 0
	case reflection.KindTemplateLiteral:
		// Without a populated Literal payload the regex would be `^$`, matching only the empty string.
		return rt.Literal != nil
	}
	return false
}

func (ValidateEmitter) Supports(rt *reflection.RunType) bool {
	return validationSupports(rt)
}

// IsRTInlined delegates to DefaultIsRTInlined: the reference defines the predicate once for every rt fn, with no per-class override.
func (ValidateEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// IsNoopType — the val entry is `() => true` exactly for any/unknown roots.
func (ValidateEmitter) IsNoopType(rt *reflection.RunType, ctx *EmitContext) bool {
	return isNoopForValidate(rt, ctx)
}

// ReturnName is `v`: CodeE / CodeRB bodies carry their own return, so this is only the statement-shape fallback.
func (ValidateEmitter) ReturnName() string {
	return "v"
}

// Emit is the single big switch over ReflectionKind; each arm mirrors the reference's `emitIsType` for that node.
// Single-quoted JS string literals throughout, to keep the JSON envelope's escape budget small.
// A kind Supports rejects can still arrive from a parent recursing into a child; it falls through to the CodeNS sentinel below.
func (e ValidateEmitter) Emit(rt *reflection.RunType, ctx *EmitContext, expectedCType CodeType) RTCode {
	base := e.emitKindDefault(rt, ctx, expectedCType)
	// A format predicate AND-chains AFTER the kind check, so `typeof v === 'string'` runs before the format regex / call.
	// Structural formats ride statement-shaped bases: they must hoist through the tier-3 ctxFn wrap or the constraint is silently dropped.
	if base.Code != "" && rt != nil && rt.FormatAnnotation != nil {
		if emitter, ok := formats.LookupForRunType(rt); ok {
			// Build-time param validation, run from the validate walk because validate is rendered for every format-bearing string.
			// The walker dedupes it per code per walk.
			if validator, ok := emitter.(formats.ParamValidator); ok {
				for _, msg := range validator.ValidateParams(rt.FormatAnnotation) {
					ctx.EmitDiagnostic(diagnostics.CodeFMTInvalidParams, msg)
				}
			}
			check := emitter.EmitValidateCheck(rt.FormatAnnotation, ctx.Vλl, ctx)
			if check != "" {
				if base.Type != CodeE {
					base = ctx.AsExpression(base)
				}
				if base.Type != CodeE {
					panic("validate: format check on a base that did not reduce to a boolean expression (kind " +
						strconv.Itoa(int(rt.Kind)) + ") — dropping it would silently weaken validation")
				}
				base.Code = "(" + base.Code + " && (" + check + "))"
			}
		}
	}
	// Contains assertions count the items matching their CHILD and gate on the occurrence bounds.
	// A statement-shaped base (array / tuple / object body) hoists into a context fn first, exactly like the format splice above.
	// The child compiles against a fresh element accessor; an empty child (any/unknown) counts every item, so the length is the count.
	if rt != nil && len(rt.Contains) > 0 {
		// Build-time contradiction check, here rather than in a format emitter's ValidateParams: the bounds ride the `__rtContains`
		// sentinel, not the brand params, and a contains-ONLY node carries no FormatAnnotation at all.
		for _, msg := range containsContradictions(rt) {
			ctx.EmitDiagnostic(diagnostics.CodeFMTInvalidParams, msg)
		}
		// An unvalidatable base (CodeNS bubbled up from an unsupported member) PROPAGATES: the walker escalates it to the alwaysThrow
		// lane, so the splice must not turn that graceful degrade into a hard resolver error.
		if base.Type == CodeNS {
			return base
		}
		if base.Type != CodeE {
			base = ctx.AsExpression(base)
		}
		if base.Type != CodeE {
			panic("validate: contains on a base that did not reduce to a boolean expression (kind " +
				strconv.Itoa(int(rt.Kind)) + ") — dropping it would silently weaken validation")
		}
		code := base.Code
		for _, containsCheck := range rt.Contains {
			check := emitContainsCount(ctx, rt, containsCheck)
			if code == "" || code == "true" {
				code = check
			} else {
				code = "(" + code + " && " + check + ")"
			}
		}
		base.Code = code
	}
	// patternProperties / propertyNames: per-key checks over the object's own keys, same statement-base hoist as every splice above.
	if rt != nil && (len(rt.PatternProps) > 0 || len(rt.PropNames) > 0) {
		// Same NS-propagation rule as the contains splice above.
		if base.Type == CodeNS {
			return base
		}
		if base.Type != CodeE {
			base = ctx.AsExpression(base)
		}
		if base.Type != CodeE {
			panic("validate: patternProperties/propertyNames on a base that did not reduce to a boolean expression (kind " +
				strconv.Itoa(int(rt.Kind)) + ") — dropping them would silently weaken validation")
		}
		code := base.Code
		for _, patternProp := range rt.PatternProps {
			check := emitPatternPropCheck(ctx, patternProp)
			if code == "" || code == "true" {
				code = check
			} else {
				code = "(" + code + " && " + check + ")"
			}
		}
		for _, propNames := range rt.PropNames {
			check := emitPropNamesCheck(ctx, propNames)
			if check != "" {
				if code == "" || code == "true" {
					code = check
				} else {
					code = "(" + code + " && " + check + ")"
				}
			}
		}
		base.Code = code
	}
	return base
}

// emitContainsCount counts the items matching one ContainsCheck's child and asserts Min ≤ count (≤ Max when bounded).
// The child compiles through CompileChild with an element accessor, so a heavy child arrives as a call expression.
func emitContainsCount(ctx *EmitContext, rt *reflection.RunType, containsCheck *reflection.ContainsCheck) string {
	boundsOver := func(countExpr string) string {
		conditions := []string{countExpr + " >= " + formats.FormatNumber(containsCheck.Min)}
		if containsCheck.Max >= 0 {
			conditions = append(conditions, countExpr+" <= "+formats.FormatNumber(containsCheck.Max))
		}
		return "(" + strings.Join(conditions, " && ") + ")"
	}
	if ctx.ResolveRef(containsCheck.Child) == nil {
		panic("validate: unresolvable contains child — dropping it would silently weaken validation")
	}
	loop := containsLoop(ctx, rt)
	ctx.SetChildAccessor(loop.itemExpr)
	childRT := ctx.CompileChild(containsCheck.Child, CodeE)
	ctx.SetChildAccessor("")
	if childRT.Type != CodeE {
		panic("validate: contains child did not compile to a boolean expression — dropping it would silently weaken validation")
	}
	if childRT.Code == "" {
		return boundsOver(loop.countExpr)
	}
	nVar := ctx.NextLocalVar("cn")
	return "((() => {let " + nVar + " = 0;" + loop.head + "{if (" +
		childRT.Code + ") " + nVar + "++;}return " + boundsOver(nVar) + ";})())"
}

// containsContradictions reports the `contains` param combinations that are PROVABLY EMPTY, under the same FMT002 code the
// scalar families use for `gt >= lt`. Deliberately only provable emptiness, never suspicion: `minContains: 0` is legal 2020-12,
// and a child the entry type happens to reject is a satisfiability question this layer cannot answer.
func containsContradictions(rt *reflection.RunType) []string {
	label := structuralWrapperName(rt)
	var errs []string
	for _, containsCheck := range rt.Contains {
		if containsCheck.Max >= 0 && containsCheck.Min > containsCheck.Max {
			errs = append(errs, label+": `minContains` cannot be greater than `maxContains`")
		}
		// A collection of at most N entries cannot hold more than N matching ones, so a larger minContains can never be met.
		if rt.FormatAnnotation == nil {
			continue
		}
		if maxItems, ok := formats.ReadNumberParam(rt.FormatAnnotation.Params, "maxItems"); ok && containsCheck.Min > maxItems {
			errs = append(errs, label+": `minContains` cannot be greater than `maxItems`")
		}
	}
	return errs
}

// structuralWrapperName is the wrapper a diagnostic names, picked from the node's own base so the message points at the
// spelling the author wrote. A contains-only node has no annotation, so the base kind decides.
func structuralWrapperName(rt *reflection.RunType) string {
	if rt.Kind == reflection.KindClass {
		switch rt.SubKind {
		case reflection.SubKindSet:
			return "FormattedSet"
		case reflection.SubKindMap:
			return "FormattedMap"
		}
	}
	return "FormattedArray"
}

// containsIteration is how a contains check walks its base: an index loop over an array / tuple, `for…of` over a Set or Map.
// A Map needs no separate head: its default iterator yields `[key, value]`, which IS its entry, so a Map's contains child
// is a TUPLE compiled against the same loop variable.
type containsIteration struct {
	head, itemExpr, countExpr, expected string
}

func containsLoop(ctx *EmitContext, rt *reflection.RunType) containsIteration {
	iVar := ctx.NextLocalVar("ci")
	if rt != nil && rt.Kind == reflection.KindClass &&
		(rt.SubKind == reflection.SubKindSet || rt.SubKind == reflection.SubKindMap) {
		expected := "set"
		if rt.SubKind == reflection.SubKindMap {
			expected = "map"
		}
		return containsIteration{
			head:      "for (const " + iVar + " of " + ctx.Vλl + ") ",
			itemExpr:  iVar,
			countExpr: ctx.Vλl + ".size",
			expected:  expected,
		}
	}
	return containsIteration{
		head:      "for (let " + iVar + " = 0; " + iVar + " < " + ctx.Vλl + ".length; " + iVar + "++) ",
		itemExpr:  ctx.Vλl + "[" + iVar + "]",
		countExpr: ctx.Vλl + ".length",
		expected:  "array",
	}
}

// emitPatternPropCheck: keys matching the entry's source must have values validating against the entry's value child.
// The value child compiles against a walker-allocated key accessor, so a hoisted child still sees it.
func emitPatternPropCheck(ctx *EmitContext, patternProp *reflection.PatternPropCheck) string {
	if ctx.ResolveRef(patternProp.Value) == nil {
		panic("validate: unresolvable patternProperties value child — dropping it would silently weaken validation")
	}
	// Hoist the key regex into the factory prologue — compiled once per factory, not per call.
	reVar := ctx.NextLocalVar("reKey")
	if !ctx.HasContextItem(reVar) {
		ctx.SetContextItem(reVar, "const "+reVar+" = new RegExp("+jsquote.Double(patternProp.Source)+")")
	}
	kVar := ctx.NextLocalVar("pk")
	ctx.SetChildAccessor(ctx.Vλl + "[" + kVar + "]")
	childRT := ctx.CompileChild(patternProp.Value, CodeE)
	ctx.SetChildAccessor("")
	if childRT.Type != CodeE {
		panic("validate: patternProperties value child did not compile to a boolean expression")
	}
	if childRT.Code == "" {
		return "true"
	}
	// `for…in` rather than `for…of Object.keys(v)`: the same enumeration the index-signature loop uses, with no key array per call.
	// The loop stays an IIFE rather than a prologue function because the value child compiled against `v[<key>]` and closes over v.
	return "((() => {for (const " + kVar + " in " + ctx.Vλl + ") {if (" + reVar + ".test(" + kVar + ") && !(" +
		childRT.Code + ")) return false;}return true;})())"
}

// emitPropNamesCheck: every key validates (as a string) against the child.
// The child compiles against the KEY, never `v[key]`, so the whole sweep hoists into the factory prologue and allocates nothing per call.
func emitPropNamesCheck(ctx *EmitContext, propNames *reflection.RunType) string {
	if ctx.ResolveRef(propNames) == nil {
		panic("validate: unresolvable propertyNames child — dropping it would silently weaken validation")
	}
	kVar := ctx.NextLocalVar("pk")
	ctx.SetChildAccessor(kVar)
	childRT := ctx.CompileChild(propNames, CodeE)
	ctx.SetChildAccessor("")
	if childRT.Type != CodeE {
		panic("validate: propertyNames child did not compile to a boolean expression")
	}
	if childRT.Code == "" {
		return ""
	}
	fnVar := ctx.NextLocalVar("pnFn")
	if !ctx.HasContextItem(fnVar) {
		ctx.SetContextItem(fnVar, "const "+fnVar+" = function(o){for (const "+kVar+" in o) {if (!("+
			childRT.Code+")) return false;}return true}")
	}
	return fnVar + "(" + ctx.Vλl + ")"
}

func (ValidateEmitter) emitKindDefault(rt *reflection.RunType, ctx *EmitContext, _ CodeType) RTCode {
	if rt == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	v := ctx.Vλl
	switch rt.Kind {
	case reflection.KindString:
		return RTCode{Code: "typeof " + v + " === 'string'", Type: CodeE}

	case reflection.KindNumber:
		// Default `Number.isFinite` rejects Infinity / -Infinity / NaN and non-numbers without coercion; the numberMode
		// ValidateOption swaps in the looser typeof / notNaN checks to align with other libraries.
		return RTCode{Code: numberBaseCheck(ctx.NumberMode(), v), Type: CodeE}

	case reflection.KindBoolean:
		return RTCode{Code: "typeof " + v + " === 'boolean'", Type: CodeE}

	case reflection.KindBigInt:
		// Infinity / -Infinity rejection falls out of `typeof` automatically.
		return RTCode{Code: "typeof " + v + " === 'bigint'", Type: CodeE}

	case reflection.KindSymbol:
		// Unsupported — `typeof v === 'symbol'` accepts ANY symbol, and symbol identity is not comparable across realms or
		// round-trips, so the validator would give no useful guarantee.
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindNull:
		return RTCode{Code: v + " === null", Type: CodeE}

	case reflection.KindUndefined:
		// `typeof === 'undefined'` here while void uses `=== undefined`: different emit text, same accepted value set.
		return RTCode{Code: "typeof " + v + " === 'undefined'", Type: CodeE}

	case reflection.KindVoid:
		// void accepts only undefined; null is explicitly rejected.
		return RTCode{Code: v + " === undefined", Type: CodeE}

	case reflection.KindAny, reflection.KindUnknown:
		// The reference emits an empty body at root nest level; `true` plus Finalize's noop collapse is equivalent — the renderer
		// skips the factory and consumers fall back to a trivial `() => true`.
		if ctx.IsRoot() {
			ctx.EmitDiagnosticSlot(SlotRootAnyUnknown)
		}
		return RTCode{Code: "true", Type: CodeE}

	case reflection.KindNever:
		return RTCode{Code: "false", Type: CodeE}

	case reflection.KindObject:
		// Explicit null rejection despite JS `typeof null === 'object'`.
		return RTCode{Code: objectGuard(v, ""), Type: CodeE}

	case reflection.KindRegexp:
		// DataOnly strips RegExp, so it is refused wherever it would collapse the value to never.
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindClass:
		if rt.SubKind == reflection.SubKindDate {
			// Rejects Invalid Date (`new Date('xx')`, whose getTime() is NaN).
			// Date is encoded as KindClass + SubKindDate, so the entry carries every Date prototype method as a Child; this leaf emit
			// IGNORES them, and every other rt fn has the same SubKindDate branch inside its KindClass arm.
			return RTCode{
				Code: "(" + v + " instanceof Date && !isNaN(" + v + ".getTime()))",
				Type: CodeE,
			}
		}
		if info, ok := reflection.TemporalInfoBySubKind(rt.SubKind); ok {
			// Temporal types are always valid once constructed (`from` throws instead), so a bare instanceof suffices.
			return RTCode{Code: "(" + v + " instanceof " + info.Builtin + ")", Type: CodeE}
		}
		if rt.SubKind == reflection.SubKindMap {
			return emitMapValidate(rt, ctx, v)
		}
		if rt.SubKind == reflection.SubKindSet {
			return emitSetValidate(rt, ctx, v)
		}
		if rt.SubKind == reflection.SubKindNonSerializable {
			// The reference throws from emitIsType; the CodeNS sentinel makes the renderer emit a throw-factory instead, so the throw
			// surfaces at createValidateFn()-call time.
			return RTCode{Code: "", Type: CodeNS}
		}
		if rt.SubKind != reflection.SubKindNone {
			// Unknown future subkind — keep the silent-skip path.
			return RTCode{Code: "", Type: CodeNS}
		}
		// Plain user class — fall through to the shared object emit.
		return emitObjectValidate(rt, ctx, v)

	case reflection.KindPromise:
		// DataOnly strips a thenable; validate the resolved value with `Awaited<P>` instead.
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindEnum:
		// Mixed enums carry mixed value types (numeric reverse-mapped plus string-enum values), so each entry goes through jsLiteralFromAny.
		if len(rt.Values) == 0 {
			return RTCode{Code: "false", Type: CodeE}
		}
		parts := make([]string, 0, len(rt.Values))
		for _, item := range rt.Values {
			lit, err := jsLiteralFromAny(item)
			if err != nil {
				panic(fmt.Sprintf("typefns: validate emit for KindEnum: %v", err))
			}
			parts = append(parts, v+" === "+lit)
		}
		return RTCode{Code: "(" + strings.Join(parts, " || ") + ")", Type: CodeE}

	case reflection.KindLiteral:
		return emitLiteral(rt, v)

	case reflection.KindArray:
		// A CodeNS element is a positional slot, so it makes the root alwaysThrow (T3), like tuple slots and union members.
		// A CodeNS property child is absorbed instead, the parent dropping it with a Warning.
		if rt.Child == nil {
			return RTCode{Code: "", Type: CodeE}
		}
		iVar := ctx.NextLocalVar("i")
		resVar := ctx.NextLocalVar("res")
		ctx.SetChildAccessor(v + "[" + iVar + "]")
		childRT := ctx.CompileChild(rt.Child, CodeE)
		// Reset the accessor so a later sibling push starts from the parent's Vλl rather than the stale subscript.
		ctx.SetChildAccessor("")
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code == "" {
			return RTCode{Code: "Array.isArray(" + v + ")", Type: CodeE}
		}
		var body strings.Builder
		body.WriteString("if (!Array.isArray(")
		body.WriteString(v)
		body.WriteString(")) return false;\n")
		body.WriteString("for (let ")
		body.WriteString(iVar)
		body.WriteString(" = 0; ")
		body.WriteString(iVar)
		body.WriteString(" < ")
		body.WriteString(v)
		body.WriteString(".length; ")
		body.WriteString(iVar)
		body.WriteString("++) {\nconst ")
		body.WriteString(resVar)
		body.WriteString(" = ")
		body.WriteString(childRT.Code)
		body.WriteString(";\nif (!(")
		body.WriteString(resVar)
		body.WriteString(")) return false;\n}\nreturn true")
		return RTCode{Code: body.String(), Type: CodeRB}

	case reflection.KindObjectLiteral:
		// KindClass non-Date lands in the same function via the arm above.
		// Method-shaped and static children are dropped, as is a Property whose wrapped value is function-flavoured.
		return emitObjectValidate(rt, ctx, v)

	case reflection.KindProperty, reflection.KindPropertySignature:
		// Skips entirely when the wrapped child is function-flavoured (the reference's member.skipRT()).
		return emitPropertyValidate(rt, ctx, v)

	case reflection.KindIndexSignature:
		return emitIndexSignatureValidate(rt, ctx, v)

	case reflection.KindFunction, reflection.KindMethod,
		reflection.KindMethodSignature, reflection.KindCallSignature:
		// DataOnly strips every callable; per-arg validation goes through `Parameters<F>`, which routes into the tuple emit.
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindTuple:
		// CodeRB rather than the reference's expression chain: a rest member's for-loop mixed into `a && b` is invalid JS, and RB
		// lets each member's emit stay in whatever shape is natural.
		return emitTupleValidate(rt, ctx, v)

	case reflection.KindTupleMember:
		return emitTupleMemberValidate(rt, ctx, v)

	case reflection.KindUnion:
		// Object arms share a single `typeof === 'object' && !== null` guard so a null input cannot crash inside a property access.
		return emitUnionValidate(rt, ctx, v)

	case reflection.KindTemplateLiteral:
		// The template literal compiles to an anchored regex at RT-build time, hoisted into the closure prologue so it is built
		// once per factory rather than per call.
		return emitTemplateLiteralValidate(rt, ctx, v)
	}
	// Unsupported kind: the CodeNS sentinel makes the walker latch IsUnsupported and composite parents propagate it up, so the
	// whole top-level entry is skipped instead of crashing the renderer.
	return RTCode{Code: "", Type: CodeNS}
}

// emitTupleValidate handles KindTuple, composing a CodeRB body.
// Non-rest members arrive as expressions and get a result-var + bail-if-false pair; a rest member's for-loop is embedded directly.
func emitTupleValidate(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if len(rt.Children) == 0 {
		// Empty tuple: kept as an expression since it is noop-free.
		return RTCode{
			Code: "Array.isArray(" + v + ") && " + v + ".length === 0",
			Type: CodeE,
		}
	}
	var body strings.Builder
	body.WriteString("if (!Array.isArray(")
	body.WriteString(v)
	body.WriteString(")) return false;\n")
	if !tupleHasRest(rt, ctx) {
		body.WriteString("if (")
		body.WriteString(v)
		body.WriteString(".length > ")
		body.WriteString(strconv.Itoa(len(rt.Children)))
		body.WriteString(") return false;\n")
	}
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		// Request RB for a rest member so the walker doesn't IIFE-wrap it, which would discard the inner `return false`.
		expectedType := CodeE
		if isRestTupleMember(resolved) {
			expectedType = CodeRB
		}
		childRT := ctx.CompileChild(child, expectedType)
		if childRT.Type == CodeNS {
			// The whole tuple is unvalidatable. Walker already latched IsUnsupported; propagating keeps the parent's chain consistent.
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code == "" {
			continue
		}
		if childRT.Type == CodeRB {
			// The rest loop's trailing `return true` is stripped so the block flows into the outer return instead of short-circuiting.
			body.WriteString(stripTrailingReturnTrue(childRT.Code))
			body.WriteByte('\n')
			continue
		}
		resVar := ctx.NextLocalVar("r")
		body.WriteString("const ")
		body.WriteString(resVar)
		body.WriteString(" = ")
		body.WriteString(childRT.Code)
		body.WriteString(";\nif (!(")
		body.WriteString(resVar)
		body.WriteString(")) return false;\n")
	}
	body.WriteString("return true")
	return RTCode{Code: body.String(), Type: CodeRB}
}

// stripTrailingReturnTrue removes the closing `return true` a standalone CodeRB child emits: embedded in a parent block it
// would short-circuit the rest of the parent's checks.
func stripTrailingReturnTrue(code string) string {
	const suffix = "return true"
	trimmed := strings.TrimRight(code, " \n\t;")
	if strings.HasSuffix(trimmed, suffix) {
		return trimmed[:len(trimmed)-len(suffix)]
	}
	return code
}

// tupleHasRest reports whether any tuple child is a rest element, which absorbs extras and so skips the upper-length bound.
func tupleHasRest(rt *reflection.RunType, ctx *EmitContext) bool {
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if isRestTupleMember(resolved) {
			return true
		}
	}
	return false
}

// emitTupleMemberValidate handles KindTupleMember, setting the element accessor `v[<Position>]` for the wrapped child.
// A rest member returns a CodeRB for-loop from its position to v.length, which the parent tuple embeds directly.
func emitTupleMemberValidate(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		// Non-serializable child — emit `v[i] === undefined`.
		return RTCode{Code: v + "[" + positionStr(rt) + "] === undefined", Type: CodeE}
	}
	if isFunctionLikeKind(resolved.Kind) {
		// Function-typed tuple elements are non-serializable: the slot must be undefined.
		return RTCode{Code: v + "[" + positionStr(rt) + "] === undefined", Type: CodeE}
	}
	if isRestTupleMember(rt) {
		// Mirrors RestParamsRunType: an array loop whose start index is the parent tuple's position.
		iVar := ctx.NextLocalVar("i")
		resVar := ctx.NextLocalVar("r")
		ctx.SetChildAccessor(v + "[" + iVar + "]")
		childRT := ctx.CompileChild(rt.Child, CodeE)
		ctx.SetChildAccessor("")
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code == "" {
			// Non-validatable element type — accept any length without per-element checks.
			return RTCode{Code: "", Type: CodeE}
		}
		var body strings.Builder
		body.WriteString("for (let ")
		body.WriteString(iVar)
		body.WriteString(" = ")
		body.WriteString(positionStr(rt))
		body.WriteString("; ")
		body.WriteString(iVar)
		body.WriteString(" < ")
		body.WriteString(v)
		body.WriteString(".length; ")
		body.WriteString(iVar)
		body.WriteString("++) {\nconst ")
		body.WriteString(resVar)
		body.WriteString(" = ")
		body.WriteString(childRT.Code)
		body.WriteString(";\nif (!(")
		body.WriteString(resVar)
		body.WriteString(")) return false;\n}\nreturn true")
		return RTCode{Code: body.String(), Type: CodeRB}
	}
	accessor := v + "[" + positionStr(rt) + "]"
	ctx.SetChildAccessor(accessor)
	childRT := ctx.CompileChild(rt.Child, CodeE)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeE}
	}
	if rt.Optional {
		return RTCode{
			Code: "(" + accessor + " === undefined || (" + childRT.Code + "))",
			Type: CodeE,
		}
	}
	return RTCode{Code: "(" + childRT.Code + ")", Type: CodeE}
}

// emitUnionValidate OR-chains the safe-ordered children (SafeUnionChildren when populated, else Children), with the object
// arms behind one shared `typeof === 'object' && !== null` guard so a null input cannot crash inside a property access.
// All-optional object members get the property-presence gate from looseCheckGate (json_prepare.go); without it `{c: 'foo'}`
// would match `{a?: string; b?: string}`, which TS's weak-type rules reject.
func emitUnionValidate(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	// Strip the DataOnly members (symbol / function-like / Promise / non-serializable / never) so `Date | symbol` validates as
	// `Date`. An all-stripped union keeps its members and falls through to CodeNS below, rendering the alwaysThrow factory.
	children := dataOnlyUnionMembers(rt, ctx)
	// The validateUnionKeys families only; see validate_union_keys.go for why the splice lands here and not on the object arm.
	checkMemberKeys := ctx.ChecksUnionMemberKeys() && unionChecksMemberKeys(children, ctx)
	var simpleChecks []string
	var objectChecks []string
	for _, child := range children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		childRT := ctx.CompileChild(child, CodeE)
		if childRT.Type == CodeNS {
			// Only reachable when EVERY member is stripped (the union's DataOnly projection is `never`).
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code == "" {
			continue
		}
		childCode := childRT.Code
		if gate := looseCheckGate(resolved, ctx, v); gate != "" {
			childCode = "(" + childCode + " && " + gate + ")"
		}
		// LAST in the arm: the key-count compare is only sound once every declared property was verified present, which the
		// expression to its left just did. The arm may be an inline body or a dep call; the assertion works on either.
		if checkMemberKeys {
			if assertion := unionMemberKeyAssertion(resolved, ctx); assertion != "" {
				childCode = "(" + childCode + " && " + assertion + ")"
			}
		}
		if isObjectLikeKind(resolved.Kind) {
			objectChecks = append(objectChecks, childCode)
		} else {
			simpleChecks = append(simpleChecks, childCode)
		}
	}
	parts := simpleChecks
	if len(objectChecks) > 0 {
		// The object arms come back WITHOUT their own leading `typeof === 'object' && !== null` term: emitObjectValidate drops it
		// under a union, since this shared guard already short-circuits null before any child runs.
		// Array / tuple / index-sig / Date / Map / Set arms are opaque calls with no such prefix, so they are unaffected.
		objGuard := "typeof " + v + " === 'object' && " + v + " !== null"
		objChain := strings.Join(objectChecks, " || ")
		parts = append(parts, "("+objGuard+" && ("+objChain+"))")
	}
	if len(parts) == 0 {
		return RTCode{Code: "false", Type: CodeE}
	}
	return RTCode{Code: "(" + strings.Join(parts, " || ") + ")", Type: CodeE}
}

// emitMapValidate handles `Map<K, V>` (KindClass + SubKindMap): it reaches through the serializer's KindParameter wrappers
// (SubKindMapKey / SubKindMapValue) to the K/V types and validates each pair over `v.entries()`.
// A key or value type with no validator (KindAny) collapses its own arm and only the surviving side runs.
func emitMapValidate(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	keyType, valueType := mapKeyValueTypes(rt, ctx)
	entryVar := ctx.NextLocalVar("entry")
	var body strings.Builder
	body.WriteString("if (!(")
	body.WriteString(v)
	body.WriteString(" instanceof Map)) return false;\n")
	body.WriteString("for (const ")
	body.WriteString(entryVar)
	body.WriteString(" of ")
	body.WriteString(v)
	body.WriteString(".entries()) {\n")
	if keyType != nil {
		keyVar := ctx.NextLocalVar("k")
		body.WriteString("const ")
		body.WriteString(keyVar)
		body.WriteString(" = ")
		body.WriteString(entryVar)
		body.WriteString("[0];\n")
		ctx.SetChildAccessor(keyVar)
		keyRT := ctx.CompileChild(keyType, CodeE)
		ctx.SetChildAccessor("")
		if keyRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if keyRT.Code != "" {
			resVar := ctx.NextLocalVar("rk")
			body.WriteString("const ")
			body.WriteString(resVar)
			body.WriteString(" = ")
			body.WriteString(keyRT.Code)
			body.WriteString(";\nif (!(")
			body.WriteString(resVar)
			body.WriteString(")) return false;\n")
		}
	}
	if valueType != nil {
		valVar := ctx.NextLocalVar("val")
		body.WriteString("const ")
		body.WriteString(valVar)
		body.WriteString(" = ")
		body.WriteString(entryVar)
		body.WriteString("[1];\n")
		ctx.SetChildAccessor(valVar)
		valRT := ctx.CompileChild(valueType, CodeE)
		ctx.SetChildAccessor("")
		if valRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if valRT.Code != "" {
			resVar := ctx.NextLocalVar("rv")
			body.WriteString("const ")
			body.WriteString(resVar)
			body.WriteString(" = ")
			body.WriteString(valRT.Code)
			body.WriteString(";\nif (!(")
			body.WriteString(resVar)
			body.WriteString(")) return false;\n")
		}
	}
	body.WriteString("}\nreturn true")
	return RTCode{Code: body.String(), Type: CodeRB}
}

// emitSetValidate handles `Set<T>` (KindClass + SubKindSet): same pattern as Map with one wrapper (SubKindSetItem) and `.values()`.
func emitSetValidate(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	itemType := setItemType(rt, ctx)
	itemVar := ctx.NextLocalVar("item")
	var body strings.Builder
	body.WriteString("if (!(")
	body.WriteString(v)
	body.WriteString(" instanceof Set)) return false;\n")
	body.WriteString("for (const ")
	body.WriteString(itemVar)
	body.WriteString(" of ")
	body.WriteString(v)
	body.WriteString(".values()) {\n")
	if itemType != nil {
		ctx.SetChildAccessor(itemVar)
		itemRT := ctx.CompileChild(itemType, CodeE)
		ctx.SetChildAccessor("")
		if itemRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if itemRT.Code != "" {
			resVar := ctx.NextLocalVar("ri")
			body.WriteString("const ")
			body.WriteString(resVar)
			body.WriteString(" = ")
			body.WriteString(itemRT.Code)
			body.WriteString(";\nif (!(")
			body.WriteString(resVar)
			body.WriteString(")) return false;\n")
		}
	}
	body.WriteString("}\nreturn true")
	return RTCode{Code: body.String(), Type: CodeRB}
}

// mapKeyValueTypes reaches through the synthetic KindParameter wrappers in Map.Arguments — [0] the key (SubKindMapKey),
// [1] the value (SubKindMapValue) — and returns nil for a missing slot so the caller can collapse that arm.
func mapKeyValueTypes(rt *reflection.RunType, ctx *EmitContext) (key, value *reflection.RunType) {
	if len(rt.Arguments) >= 1 {
		wrapper := ctx.ResolveRef(rt.Arguments[0])
		if wrapper != nil {
			key = wrapper.Child
		}
	}
	if len(rt.Arguments) >= 2 {
		wrapper := ctx.ResolveRef(rt.Arguments[1])
		if wrapper != nil {
			value = wrapper.Child
		}
	}
	return key, value
}

// setItemType reaches through the synthetic KindParameter wrapper (SubKindSetItem) in Set.Arguments to the element type.
func setItemType(rt *reflection.RunType, ctx *EmitContext) *reflection.RunType {
	if len(rt.Arguments) == 0 {
		return nil
	}
	wrapper := ctx.ResolveRef(rt.Arguments[0])
	if wrapper == nil {
		return nil
	}
	return wrapper.Child
}

// iterableInnerTypes returns the children to walk for a native iterable: [key, value] for a Map, [item] for a Set.
func iterableInnerTypes(rt *reflection.RunType, ctx *EmitContext) []*reflection.RunType {
	if rt.SubKind == reflection.SubKindMap {
		keyType, valueType := mapKeyValueTypes(rt, ctx)
		return []*reflection.RunType{keyType, valueType}
	}
	return []*reflection.RunType{setItemType(rt, ctx)}
}

// emitTemplateLiteralValidate compiles the template literal type to an anchored regex from its text segments and
// placeholder kinds, hoisted as a context item so it is built once per factory rather than per call.
func emitTemplateLiteralValidate(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	regex, ok := buildTemplateLiteralRegex(rt)
	if !ok {
		// Malformed literal payload — degrade to a typeof-string check rather than panicking inside the renderer.
		return RTCode{Code: "typeof " + v + " === 'string'", Type: CodeE}
	}
	reVar := ctx.NextLocalVar("reTL")
	if !ctx.HasContextItem(reVar) {
		ctx.SetContextItem(reVar, "const "+reVar+" = new RegExp("+quoteJSDouble(regex)+")")
	}
	return RTCode{
		Code: "(typeof " + v + " === 'string' && " + reVar + ".test(" + v + "))",
		Type: CodeE,
	}
}

// buildTemplateLiteralRegex rebuilds the anchored regex from rt.Literal's `{templateLiteral: {texts, placeholders}}` wire shape.
// Returns false when the payload is missing or malformed, and the caller degrades to a plain typeof-string check.
func buildTemplateLiteralRegex(rt *reflection.RunType) (string, bool) {
	if rt.Literal == nil {
		return "", false
	}
	envelope, ok := rt.Literal.(map[string]any)
	if !ok {
		return "", false
	}
	inner, ok := envelope["templateLiteral"].(map[string]any)
	if !ok {
		return "", false
	}
	textsAny, _ := inner["texts"].([]any)
	placeholdersAny, _ := inner["placeholders"].([]any)
	if len(textsAny) == 0 {
		return "", false
	}
	var body strings.Builder
	body.WriteByte('^')
	for i, textAny := range textsAny {
		text, _ := textAny.(string)
		body.WriteString(escapeRegex(text))
		if i < len(placeholdersAny) {
			placeholder, _ := placeholdersAny[i].(map[string]any)
			body.WriteString(spanRegexPattern(placeholder))
		}
	}
	body.WriteByte('$')
	return body.String(), true
}

// spanRegexPattern returns the regex source for one template-literal placeholder span.
func spanRegexPattern(span map[string]any) string {
	if span == nil {
		return `[\s\S]*`
	}
	var kind int
	switch v := span["kind"].(type) {
	case int:
		kind = v
	case float64:
		kind = int(v)
	case int64:
		kind = int(v)
	}
	switch reflection.ReflectionKind(kind) {
	case reflection.KindLiteral:
		if lit, ok := span["literal"]; ok {
			return escapeRegex(stringifyLiteral(lit))
		}
		return `[\s\S]*`
	case reflection.KindNumber:
		return `-?(?:\d+\.?\d*|\.\d+)`
	case reflection.KindBigInt:
		return `-?\d+`
	case reflection.KindString, reflection.KindAny, reflection.KindUnknown:
		return `[\s\S]*`
	}
	return `[\s\S]*`
}

// stringifyLiteral converts a literal span value to its JS `String(v)` form for the regex literal embed.
func stringifyLiteral(value any) string {
	switch lit := value.(type) {
	case string:
		return lit
	case bool:
		if lit {
			return "true"
		}
		return "false"
	case int:
		return strconv.Itoa(lit)
	case int64:
		return strconv.FormatInt(lit, 10)
	case float64:
		return strconv.FormatFloat(lit, 'g', -1, 64)
	}
	return ""
}

// escapeRegex escapes regex metacharacters in a literal substring.
func escapeRegex(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		switch r {
		case '.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|',
			'[', ']', '\\', '/':
			b.WriteByte('\\')
		}
		b.WriteRune(r)
	}
	return b.String()
}

// emitObjectValidate emits the object-shape AND-chain for KindObjectLiteral / KindClass, including the callable branch (a
// CallSignature child swaps the typeof guard from 'object' to 'function') and the all-optional array / native-object rejection.
// Method-shaped and static children are dropped; a child that returns CodeNS propagates it and the whole factory is skipped.
func emitObjectValidate(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	// A callable interface is function-like, which DataOnly strips at every position, the root included.
	if objectCallSignatureChild(rt, ctx) != nil {
		return RTCode{Code: "", Type: CodeNS}
	}
	parts := []string{"typeof " + v + " === 'object' && " + v + " !== null"}
	// Publish the sibling-named-props set so an index-signature child can skip those keys at the top of its for-in loop.
	// No-op when the object has no index sig or no named props.
	publishSiblingNamedKeysForIndexSig(rt, ctx)
	publishSiblingPatternsForIndexSig(rt, ctx)
	allOptional := true
	hasContributingChild := false
	// Set by the loop below when a REQUIRED, CONTRIBUTING property has a name no array can supply — see objectNeedsBrandGuard.
	hasArrayProofRequiredProp := false
	hasIndexSig := false
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if resolved.IsStatic {
			// Static members don't appear on instances.
			ctx.EmitDiagnosticSlot(SlotStaticDropped, memberLabel(resolved))
			continue
		}
		if resolved.Kind == reflection.KindIndexSignature {
			hasIndexSig = true
		}
		if isFunctionLikeKind(resolved.Kind) {
			// Method-shaped members directly on the shape are skipped.
			ctx.EmitDiagnosticSlot(SlotMethodDropped, memberLabel(resolved))
			continue
		}
		childRT := ctx.CompileChild(child, CodeE)
		if childRT.Type == CodeNS {
			// A required child that can't be validated makes the whole object unvalidatable. Walker already latched IsUnsupported, so
			// the remaining CompileChild calls would short-circuit anyway; exit early to skip the unused sibling work.
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
		parts = append(parts, childRT.Code)
	}
	// Arrays *are* objects in JS, so a shape with nothing required — all-optional, empty, index-signature-only — passes the bare
	// `typeof === 'object' && !== null` and needs the explicit brand guard to reject arrays, Date, Map, Set.
	// An index-signature object needs it too: a for-in over a Map / Set / Date / empty array enumerates no own string keys, so
	// the per-key value check is vacuously satisfied. That over-acceptance corrupts a union's merged-prop dispatch — a Map value
	// matches an earlier `Record` candidate and is then encoded as `{}` on every serialization lane.
	if objectNeedsBrandGuard(hasContributingChild, allOptional, hasIndexSig, hasArrayProofRequiredProp) {
		guard := "(!Array.isArray(" + v + ") && Object.prototype.toString.call(" + v + ") === '[object Object]')"
		// Insert AFTER the typeof guard so null / non-objects still short-circuit first.
		parts = append(parts[:1], append([]string{guard}, parts[1:]...)...)
	}
	// Fused (`checkUnknowns`) families only. WHETHER to emit it is emitsUnknownKeyCheck's call, shared with
	// emitObjectValidationErrors so the validator and its error twin can never disagree about a node.
	// Appended LAST on purpose: the O(1) key-count compare is only sound once every property check above it has passed.
	if emitsUnknownKeyCheck(rt, ctx, nil) {
		parts = append(parts, strictObjectKeyAssertion(rt, ctx))
	}
	// Under a union, emitUnionValidate emits one shared `typeof v === 'object' && v !== null` guard, so dropping parts[0] here
	// just trims the OR-chain; the brand guard and every property check survive as the arm's own checks.
	// len(parts) > 1 is defensive against emitting "()".
	if len(parts) > 1 && ctx.ParentIsUnion() {
		return RTCode{Code: "(" + joinAnd(parts[1:]) + ")", Type: CodeE}
	}
	return RTCode{Code: "(" + joinAnd(parts) + ")", Type: CodeE}
}

// memberIsOptional answers the `areAllChildrenOptional` question for a child of an object literal / class.
// An IndexSignature counts as NON-optional: it validates values on every own key, so a wrong input already fails there.
func memberIsOptional(rt *reflection.RunType) bool {
	if rt == nil {
		return false
	}
	switch rt.Kind {
	case reflection.KindProperty, reflection.KindPropertySignature:
		return rt.Optional
	case reflection.KindIndexSignature:
		return false
	}
	return rt.Optional
}

// emitPropertyValidate handles KindProperty / KindPropertySignature, setting the accessor (`v.<name>`, or `v["name"]` for
// unsafe names) for the wrapped child. Returns empty code for a function-flavoured child so the parent's AND chain drops the slot.
func emitPropertyValidate(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	if strippedPropertyDrop(resolved, rt.Name, ctx) {
		// Directly DataOnly-stripped value — drop the slot from the AND chain, matching `DataOnly<{a: symbol}>` = `{}`.
		return RTCode{Code: "", Type: CodeE}
	}
	accessor := propertyAccessor(v, rt.Name, rt.IsSafeName)
	ctx.SetChildAccessor(accessor)
	childRT := ctx.CompileChild(rt.Child, CodeE)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		// The value is NOT directly stripped (caught above). A DataOnly-stripped leaf reached through a propagating slot (symbol[],
		// Map<string,symbol>) fails the object; any other unsupported kind is absorbed (F3). See propertyChildFailed.
		if propertyChildFailed(ctx) {
			return RTCode{Code: "", Type: CodeNS}
		}
		return RTCode{Code: "", Type: CodeE}
	}
	// A REQUIRED member whose type imposes NO value check (`unknown` / `any`) still imposes PRESENCE: `{}` is not assignable to
	// `{foo: unknown}`. Dropping the slot would silently make the member optional and break looseCheckGate's "one required prop
	// already enforces presence" shortcut. An OPTIONAL noop member asserts nothing, so it leaves the chain as before.
	if childRT.Code == "" || isNoopForValidate(rt.Child, ctx) {
		if rt.Optional {
			return RTCode{Code: "", Type: CodeE}
		}
		return RTCode{Code: "(" + namedPropertyInTest(rt.Name, v) + ")", Type: CodeE}
	}
	if rt.Optional {
		return RTCode{
			Code: "(" + propertyAbsenceTest(rt, v, accessor) + " || " + childRT.Code + ")",
			Type: CodeE,
		}
	}
	return childRT
}

// emitIndexSignatureValidate handles KindIndexSignature; a template-literal key type also emits a per-key regex.test so the
// key pattern is enforced. Named sibling keys are skipped inside the for-in loop (publishSiblingNamedKeysForIndexSig, called
// from emitObjectValidate, plus siblingNamedSkipCode in unknownkeys_shared.go) so they are not double-checked against the
// index's value type.
func emitIndexSignatureValidate(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	if isSymbolKeyedIndexSig(rt, ctx) {
		return RTCode{Code: "", Type: CodeE}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	if isFunctionLikeKind(resolved.Kind) {
		return RTCode{Code: "", Type: CodeE}
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
	childRT := ctx.CompileChild(rt.Child, CodeE)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		// Value type can't be validated → index sig can't be validated → propagate upward.
		return RTCode{Code: "", Type: CodeNS}
	}
	if childRT.Code == "" && keyRegexVar == "" {
		return RTCode{Code: "", Type: CodeE}
	}
	var body strings.Builder
	body.WriteString("for (const ")
	body.WriteString(keyVar)
	body.WriteString(" in ")
	body.WriteString(v)
	body.WriteString(") { ")
	// An own prototype-named key is never data (see reflection.UnsafePropertyNames).
	body.WriteString("if (" + unsafeKeyCheck(keyVar) + ") return false; ")
	if skip := siblingNamedSkipCode(rt, ctx, keyVar); skip != "" {
		body.WriteString(skip)
		body.WriteString(" ")
	}
	if skip := siblingPatternSkipCode(rt, ctx, keyVar); skip != "" {
		body.WriteString(skip)
		body.WriteString(" ")
	}
	if keyRegexVar != "" {
		body.WriteString("if (!")
		body.WriteString(keyRegexVar)
		body.WriteString(".test(")
		body.WriteString(keyVar)
		body.WriteString(")) return false; ")
	}
	if childRT.Code != "" {
		body.WriteString("if (!(")
		body.WriteString(childRT.Code)
		body.WriteString(")) return false; ")
	}
	body.WriteString("} return true")
	return RTCode{Code: body.String(), Type: CodeRB}
}

// EmitDependencyCall returns the call into a pre-rendered child RT entry and registers its `const <hash> = utl.getRT('<hash>')`
// context-item line, once per hash. A self-recursive call drops the `.fn` indirection and calls the inner function directly.
func (ValidateEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	return ctx.emitDepCall(childID, ctx.Vλl, "")
}

// emitLiteral branches on the runtime shape of rt.Literal as the Go serializer encodes it (internal/cachegen/runtype/serialize.go):
// Flags=["bigint"] with a decimal string, Flags=["symbol"] with {"symbol": name}, or a plain bool / int64 / float64 / string.
func emitLiteral(rt *reflection.RunType, v string) RTCode {
	flagSet := make(map[string]bool, len(rt.Flags))
	for _, flag := range rt.Flags {
		flagSet[flag] = true
	}
	literal := rt.Literal

	if flagSet["bigint"] {
		decimal, ok := literal.(string)
		if !ok {
			panic(fmt.Sprintf("typefns: bigint literal expected decimal string, got %T", literal))
		}
		if !IsDecimalInteger(decimal) {
			// The one type-derived value emitted unquoted: never trust its shape.
			panic(fmt.Sprintf("typefns: bigint literal %q is not a decimal integer", decimal))
		}
		return RTCode{Code: v + " === " + decimal + "n", Type: CodeE}
	}

	if flagSet["symbol"] {
		// A unique symbol is still a symbol, which DataOnly strips.
		return RTCode{Code: "", Type: CodeNS}
	}

	lit, err := jsLiteralFromAny(literal)
	if err != nil {
		panic(fmt.Sprintf("typefns: validate literal emit: %v", err))
	}
	return RTCode{Code: v + " === " + lit, Type: CodeE}
}

// jsLiteralFromAny renders a primitive literal. BigInt and symbol literals have their own paths in emitLiteral because their
// Go encoding carries extra envelope data. Used by both KindLiteral and KindEnum.
func jsLiteralFromAny(value any) (string, error) {
	switch lit := value.(type) {
	case nil:
		return "null", nil
	case bool:
		if lit {
			return "true", nil
		}
		return "false", nil
	case int:
		return fmt.Sprintf("%d", lit), nil
	case int64:
		return fmt.Sprintf("%d", lit), nil
	case float64:
		// Go's %v drops the ".0" suffix on whole-number floats, matching the JSON Number → JS Number round-trip.
		return fmt.Sprintf("%v", lit), nil
	case string:
		return quoteJS(lit), nil
	}
	return "", fmt.Errorf("jsLiteralFromAny: unsupported value type %T", value)
}

// Finalize marks a body that is empty, bare `true`, or `return true` as a noop, so the renderer can skip the factory.
// Consumers then default to `() => true` for free.
func (ValidateEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "true" || code == "return true" {
		return "return true", true
	}
	return code, false
}

// objectNeedsBrandGuard decides whether an object must carry the `(!Array.isArray(v) && toString.call(v) === '[object Object]')`
// guard, and is shared by emitObjectValidate and emitObjectValidationErrors so the two cannot answer differently (fuzz oracle O4).
// The guard is not free, so it is emitted only where nothing else does its job: a REQUIRED property normally excludes an array
// and a Date long before a brand check would run, while an all-optional / index-signature / childless shape has no such property.
// But a required property only helps when an array cannot supply its NAME: `[1, 2]` satisfies `{length: number}` and `['x']`
// satisfies `{0: string}`. hasArrayProofRequiredProp is what closes that hole.
func objectNeedsBrandGuard(hasContributingChild, allOptional, hasIndexSig, hasArrayProofRequiredProp bool) bool {
	if !hasContributingChild || allOptional || hasIndexSig {
		return true
	}
	return !hasArrayProofRequiredProp
}

// arrayCarriesName reports whether an ARRAY has a property of this name (`length` plus every numeric index), so a required
// property of that name cannot be relied on to exclude one.
// Deliberately blind to the declared TYPE: `{length: string}` is already excluded by its own check, and the rule stays true
// if the type ever widens.
func arrayCarriesName(name string) bool {
	if name == "length" {
		return true
	}
	if name == "" {
		return false
	}
	for i := 0; i < len(name); i++ {
		if name[i] < '0' || name[i] > '9' {
			return false
		}
	}
	return true
}
