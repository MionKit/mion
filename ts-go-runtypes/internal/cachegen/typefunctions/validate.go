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

// numberBaseCheck returns the base `number` kind guard for the given numberMode
// (validateOptions.numberMode): isFinite (default) keeps Number.isFinite;
// typeof accepts NaN / Infinity; notNaN rejects NaN but keeps Infinity. The
// notNaN form is parenthesized so it composes safely when AND/OR-chained into
// object-property and union-member guards. Shared by every base-number emit
// site across validate.go and validationerrors.go so the two stay in lockstep.
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

// ValidateEmitter implements the `validate` rt function — produces a
// boolean validator per RunType. The factory shape it emits:
//
//	export function get_validate_<hash>(utl){
//	  'use strict';
//	  return function validate_<hash>(v){ <body> }
//	}
//
// One file owns every validate-specific concern: the args list, the
// per-kind switch in Emit, the noop detection in Finalize, and the
// per-emitter "is this kind supported yet?" predicate in Supports.
// Adding a new rt fn (validationErrors, prepareForJson, …) means one new
// file of this same shape — the Walker in walker.go stays untouched.
type ValidateEmitter struct{}

// Args returns the single `v` parameter the inner validate function
// takes. Mirrors `rtArgs.vλl = 'v'` + empty default in
// (ref: packages/run-types/src/constants.functions.ts:45).
func (ValidateEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// EmitCircularGuard renders the inline circular-reference guard for the armed
// validate variant: a detected cycle makes the total validator return false
// (matching the old runtime guard's `findCycle ? false : fn(value)`).
func (ValidateEmitter) EmitCircularGuard(fcpAlias, skeletonConst string) string {
	return "if(" + fcpAlias + "(v," + skeletonConst + "))return false;"
}

// Supports gates the renderer's top-level loop. Covers every atomic
// kind whose node ships an emitIsType, plus KindClass restricted
// to the Date subkind (the reference nodes/atomic/date.ts treats Date as
// atomic even though deepkit encodes it as a class).
//
// KindEnumMember is intentionally excluded: the reference enumMember.ts
// throws "Enum member operations are not supported" from emitIsType,
// so we never emit a factory for it. KindTemplateLiteral lives under
// nodes/collection/ in the reference and is out of scope for the atomic port.
//
// Keep this set in lockstep with the `switch` in Emit — drift would
// silently emit broken JS (renderer thinks it's supported, Emit
// panics) or skip a valid kind.
//
// validationSupports is shared by validate AND validationErrors — the
// two families must cover exactly the same kinds (every kind validate
// can check must be able to report errors, and vice versa).
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
		// Gate on a non-nil child — a malformed RunType with Kind=KindArray
		// and Child=nil would otherwise reach Emit and panic.
		return rt.Child != nil
	case reflection.KindObjectLiteral:
		return true
	case reflection.KindClass:
		// Date is treated as atomic (see KindClass arm in Emit); other
		// classes go through the same emit path as interfaces (Children
		// AND-chain) since ClassRunType extends InterfaceRunType.
		// Map / Set get their own arms that validate element types via
		// `.entries()` / `.values()` iteration. NonSerializable IS
		// supported here so the renderer emits a throw-factory for it
		// (NonSerializableRunType.emitIsType throws too — same
		// semantic via a runtime-throwing factory).
		switch rt.SubKind {
		case reflection.SubKindDate, reflection.SubKindNone, reflection.SubKindMap, reflection.SubKindSet,
			reflection.SubKindNonSerializable:
			return true
		}
		return reflection.IsTemporalSubKind(rt.SubKind)
	case reflection.KindPromise:
		// We treat Promise<T> as a thenable check at the validate
		// layer — the wrapped T isn't validated synchronously (the
		// promise hasn't resolved yet). Use `Awaited<P>` for the
		// resolved-value type.
		return true
	case reflection.KindProperty, reflection.KindPropertySignature:
		return true
	case reflection.KindIndexSignature:
		return true
	case reflection.KindFunction, reflection.KindMethod,
		reflection.KindMethodSignature, reflection.KindCallSignature:
		// Function-flavoured kinds emit `typeof v === 'function'` at
		// top level. As children of an object, they're skipped from
		// the parent's AND chain via the per-property skip rule (see
		// emitObjectValidate in this file).
		return true
	case reflection.KindTuple:
		return true
	case reflection.KindTupleMember:
		return true
	case reflection.KindUnion:
		// Children must be non-empty for a meaningful union check —
		// an empty union resolves to `never` per the reference semantics.
		return len(rt.Children) > 0
	case reflection.KindTemplateLiteral:
		// Gate on a populated Literal payload — the serializer fills
		// it with the texts + placeholder spans; without it we'd
		// generate `new RegExp('^$')` which only matches the empty
		// string.
		return rt.Literal != nil
	}
	return false
}

func (ValidateEmitter) Supports(rt *reflection.RunType) bool {
	return validationSupports(rt)
}

// IsRTInlined delegates to DefaultIsRTInlined. The reference
// (ref: packages/run-types/src/lib/baseRunTypes.ts:52) defines the predicate ONCE
// for every rt fn (no per-class overrides exist in the upstream
// runtype package), so the validate emitter inherits the shared
// behaviour: arrays and named collections become dependency calls,
// everything else inlines. Override here only if a concrete need
// surfaces — there isn't one today.
func (ValidateEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// IsNoopType — the val entry is `() => true` exactly for any/unknown roots
// (see isNoopForValidate).
func (ValidateEmitter) IsNoopType(rt *reflection.RunType, ctx *EmitContext) bool {
	return isNoopForValidate(rt, ctx)
}

// NoopChildComposesAround — a validate term that always passes contributes
// nothing to the parent's `&&` chain, so empty code composes correctly.
func (ValidateEmitter) NoopChildComposesAround() {}

// ReturnName is the JS identifier the walker appends after a
// statement-shaped body. For validate the validator's "result" is the
// boolean expression itself (CodeE / CodeRB shapes carry their own
// return); the statement-shape fallback returns the first arg (`v`)
// matching the baseline behaviour for non-error fns.
func (ValidateEmitter) ReturnName() string {
	return "v"
}

// Emit is the single big switch over ReflectionKind. Each arm mirrors
// the body of the corresponding `emitIsType` method under
// (ref: packages/run-types/src/nodes/atomic/<name>.ts) —
// same pattern used for stringifyJson in
// rtCompilers/json/stringifyJson.ts:37.
//
// Single-quoted JS string literals throughout to keep the JSON envelope's
// escape budget small (same rationale as the original KindString arm
// at line 95 and internal/emit/runtypes_module.go:quoteJS).
//
// Kinds NOT supported by ValidateEmitter.Supports must not reach this
// switch from the renderer's top-level loop, but a parent emitter
// recursing into a child can still hit an unsupported kind — the
// final panic surfaces that as a compile-time-loud failure (per the
// "child kinds the dispatch doesn't handle should panic loudly"
// contract in emitter.go).
func (e ValidateEmitter) Emit(rt *reflection.RunType, ctx *EmitContext, expectedCType CodeType) RTCode {
	base := e.emitKindDefault(rt, ctx, expectedCType)
	// Format annotations attach a format-specific predicate on top of
	// the kind-default validator, spliced when (a) a format emitter is
	// actually registered (Phase-0 graceful no-op) and (b) the emitter's
	// check is non-empty. The format predicate AND-chains after the base
	// check so `typeof v === 'string'` runs before the format-specific
	// regex / call. Structural formats (formattedArray / formattedObject) ride
	// statement-shaped bases — those hoist through the tier-3 ctxFn wrap
	// first, exactly like the negation splice below; skipping them would
	// silently drop a declared constraint.
	if base.Code != "" && rt != nil && rt.FormatAnnotation != nil {
		if emitter, ok := formats.LookupForRunType(rt); ok {
			// Build-time param validation (the validateParams check, run AOT).
			// Emitted from the validate walk since validate is rendered for every
			// format-bearing string; deduped per-code-per-walk by the walker.
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
	// Negations invert their CHILD's validate expression and AND-chain after
	// the base (and any format check): `base && !(child1) && !(child2)`.
	// Children compile through the same CompileChild path union arms use, so
	// heavy kinds arrive as opaque call expressions. A negation child that
	// cannot produce a boolean expression would DROP the constraint silently
	// — hard-fail instead (the loud-contract rule for unsupported child
	// kinds). The root `true` of an any/unknown base is elided so a bare
	// negation reads `!(child)`, not `(true && !(child))`. A statement-shaped
	// base (array / tuple / object bodies) hoists into a context fn first —
	// skipping it would silently drop the ¬, the one thing this block must
	// never do.
	// Contains assertions count the items matching their CHILD and gate on
	// the occurrence bounds — statement bases hoist exactly like the format
	// and negation splices. The child compiles against a fresh element
	// accessor; an empty child (any/unknown — `contains: true`) counts every
	// item, so the length itself is the count.
	if rt != nil && len(rt.Contains) > 0 {
		// An unvalidatable base (an unsupported member bubbled CodeNS up)
		// PROPAGATES: the walker escalates NS to the alwaysThrow lane, which
		// never silently weakens anything — the splice must not turn that
		// graceful degrade into a hard resolver error. (Found by the elision
		// fuzz lane: structural formats over the wide type space were the
		// first to compile validate across NS-bearing bases.)
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
			check := emitContainsCount(ctx, containsCheck)
			if code == "" || code == "true" {
				code = check
			} else {
				code = "(" + code + " && " + check + ")"
			}
		}
		base.Code = code
	}
	// patternProperties / propertyNames: per-key checks over the object's
	// own keys — same statement-base hoist discipline as every splice above.
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

// emitContainsCount builds the boolean expression for one ContainsCheck:
// count the items matching the child, assert Min ≤ count (≤ Max when
// bounded). The child compiles through CompileChild with an element
// accessor, so heavy children arrive as call expressions exactly like
// union arms and negation children.
func emitContainsCount(ctx *EmitContext, containsCheck *reflection.ContainsCheck) string {
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
	iVar := ctx.NextLocalVar("ci")
	ctx.SetChildAccessor(ctx.Vλl + "[" + iVar + "]")
	childRT := ctx.CompileChild(containsCheck.Child, CodeE)
	ctx.SetChildAccessor("")
	if childRT.Type != CodeE {
		panic("validate: contains child did not compile to a boolean expression — dropping it would silently weaken validation")
	}
	if childRT.Code == "" {
		return boundsOver(ctx.Vλl + ".length")
	}
	nVar := ctx.NextLocalVar("cn")
	return "((() => {let " + nVar + " = 0;for (let " + iVar + " = 0; " + iVar + " < " + ctx.Vλl + ".length; " + iVar + "++) {if (" +
		childRT.Code + ") " + nVar + "++;}return " + boundsOver(nVar) + ";})())"
}

// emitPatternPropCheck: keys matching the entry's source must have values
// validating against the entry's value child. The regex hoists into the
// factory prologue once per (source, factory); the value child compiles
// against a walker-allocated key accessor so a hoisted child still sees it.
func emitPatternPropCheck(ctx *EmitContext, patternProp *reflection.PatternPropCheck) string {
	if ctx.ResolveRef(patternProp.Value) == nil {
		panic("validate: unresolvable patternProperties value child — dropping it would silently weaken validation")
	}
	// Hoist the key regex into the factory prologue (the emitPatternTest
	// discipline — compiled once per factory, not per call).
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
	// `for…in` rather than `for…of Object.keys(v)`: same enumeration the index
	// signature loop and the closedness sweep use, without materialising a key
	// array on every call. The loop stays an IIFE (not a prologue function)
	// because the value child compiled against `v[<key>]` and closes over v.
	return "((() => {for (const " + kVar + " in " + ctx.Vλl + ") {if (" + reVar + ".test(" + kVar + ") && !(" +
		childRT.Code + ")) return false;}return true;})())"
}

// Mirrors identityChainMaxKeys in formats/structural/objectformat.go: at or
// below this many keys an `===` chain beats a Set (pointer compares against
// internalized strings, no hash, nothing hoisted).
const unevalIdentityChainMaxKeys = 8

// emitPropNamesCheck: every key validates (as a string) against the child.
// The child compiles against the KEY, never against `v[key]`, so the whole
// sweep hoists into the factory prologue — no key array, no per-key callback,
// and nothing allocated per call (the `Object.keys(v).every(cb)` form paid all
// three).
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
		// (ref: nodes/atomic/string.ts:14)
		return RTCode{Code: "typeof " + v + " === 'string'", Type: CodeE}

	case reflection.KindNumber:
		// (ref: nodes/atomic/number.ts:14). Default `Number.isFinite` rejects
		// Infinity / -Infinity / NaN and non-numbers without coercion; the
		// numberMode ValidateOption swaps in the looser typeof / notNaN checks
		// to align with other libraries.
		return RTCode{Code: numberBaseCheck(ctx.NumberMode(), v), Type: CodeE}

	case reflection.KindBoolean:
		// (ref: nodes/atomic/boolean.ts:14)
		return RTCode{Code: "typeof " + v + " === 'boolean'", Type: CodeE}

	case reflection.KindBigInt:
		// (ref: nodes/atomic/bigInt.ts:14). Infinity / -Infinity rejection
		// from bigInt.spec.ts falls out of `typeof` automatically.
		return RTCode{Code: "typeof " + v + " === 'bigint'", Type: CodeE}

	case reflection.KindSymbol:
		// Unsupported — `typeof v === 'symbol'` accepts ANY symbol,
		// giving the false impression that the user's specific symbol
		// value was validated. Symbol identity isn't comparable across
		// realms / round-trips, so the validator gives no useful
		// guarantee.
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindNull:
		// (ref: nodes/atomic/null.ts:14)
		return RTCode{Code: v + " === null", Type: CodeE}

	case reflection.KindUndefined:
		// (ref: nodes/atomic/undefined.ts:14). Note `typeof === 'undefined'`
		// is used here while void uses `=== undefined` directly —
		// different emit text, same accepted value set.
		return RTCode{Code: "typeof " + v + " === 'undefined'", Type: CodeE}

	case reflection.KindVoid:
		// (ref: nodes/atomic/void.ts:14). void accepts only undefined;
		// null is explicitly rejected (void.spec.ts).
		return RTCode{Code: v + " === undefined", Type: CodeE}

	case reflection.KindAny, reflection.KindUnknown:
		// (ref: nodes/atomic/any.ts:13-15) (UnknownRunType extends AnyRunType).
		// At root nest level the reference emits `undefined` (empty body); we emit
		// `true` and rely on Finalize to collapse the body to a noop. The
		// renderer then skips the factory entirely and consumers fall back
		// to a trivial `() => true`. Functionally equivalent.
		if ctx.IsRoot() {
			ctx.EmitDiagnosticSlot(SlotRootAnyUnknown)
		}
		return RTCode{Code: "true", Type: CodeE}

	case reflection.KindNever:
		// (ref: nodes/atomic/never.ts:13)
		return RTCode{Code: "false", Type: CodeE}

	case reflection.KindObject:
		// (ref: nodes/atomic/object.ts:13). Explicit null rejection despite
		// JS `typeof null === 'object'` — bug-flavor case from object.spec.ts.
		return RTCode{Code: objectGuard(v, ""), Type: CodeE}

	case reflection.KindRegexp:
		// (ref: nodes/atomic/regexp.ts:13)
		return RTCode{Code: "(" + v + " instanceof RegExp)", Type: CodeE}

	case reflection.KindClass:
		// KindClass branches on SubKind:
		//   - SubKindDate → atomic instanceof+validity check
		//   - SubKindMap  → emitMapValidate (instanceof + .entries())
		//   - SubKindSet  → emitSetValidate (instanceof + .values())
		//   - SubKindNone → plain user class; falls through to the
		//     shared object emit (ClassRunType inherits
		//     InterfaceRunType).
		//   - anything else (NonSerializable, future subkinds) →
		//     CodeNS sentinel so the renderer skips this entry's
		//     factory without panicking.
		if rt.SubKind == reflection.SubKindDate {
			// (ref: nodes/atomic/date.ts:13). Rejects Invalid Date
			// (`new Date('xx')` whose getTime() is NaN).
			//
			// Date is encoded as `KindClass + SubKindDate` (no
			// dedicated KindDate enum value). The cache entry carries
			// every Date prototype method as a Child because the
			// underlying TS shape is a class; this validate emit
			// IGNORES those children and produces a single
			// instanceof+validity check. Other rt fns
			// (validationErrors / prepareForJson / mock) follow the same
			// pattern — a SubKindDate branch inside their KindClass
			// arm — and the renderer's CodeNS-bubble-up never reaches
			// Date's prototype children (Date's emit is a leaf, no
			// CompileChild). Class-encoding, atomic semantics; the
			// per-fn arms are the seam.
			return RTCode{
				Code: "(" + v + " instanceof Date && !isNaN(" + v + ".getTime()))",
				Type: CodeE,
			}
		}
		if info, ok := reflection.TemporalInfoBySubKind(rt.SubKind); ok {
			// Temporal types are always-valid once constructed (no NaN-like
			// state — `from` throws instead), so a bare instanceof suffices.
			// Same atomic, class-encoded, leaf-emit pattern as Date.
			return RTCode{Code: "(" + v + " instanceof " + info.Builtin + ")", Type: CodeE}
		}
		if rt.SubKind == reflection.SubKindMap {
			return emitMapValidate(rt, ctx, v)
		}
		if rt.SubKind == reflection.SubKindSet {
			return emitSetValidate(rt, ctx, v)
		}
		if rt.SubKind == reflection.SubKindNonSerializable {
			// (ref: nodes/native/nonSerializable.ts:18-19) —
			// `emitIsType(): RTCode { throw new Error('RT
			// compilation disabled for Non Serializable types.'); }`.
			// We mirror via a throw-factory: the message lands on
			// Walker.ThrowMessage, the module renderer emits a
			// `createRTFn(utl){ throw new Error(<msg>) }` so the
			// throw surfaces at createValidateFn()-call time (the
			// createRTFunction()-call equivalent).
			return RTCode{Code: "", Type: CodeNS}
		}
		if rt.SubKind != reflection.SubKindNone {
			// Unknown future subkind — keep the silent-skip path.
			return RTCode{Code: "", Type: CodeNS}
		}
		// Plain user class — fall through to the shared object emit.
		return emitObjectValidate(rt, ctx, v)

	case reflection.KindPromise:
		// Promise validation can only check thenable-ness at
		// runtime — the wrapped T isn't validated synchronously
		// because the promise hasn't resolved. Callers who want to
		// validate the resolved value use `Awaited<P>` (tsgo
		// resolves it to T directly).
		return RTCode{
			Code: "typeof " + v + " === 'object' && " + v + " !== null && typeof " + v + ".then === 'function'",
			Type: CodeE,
		}

	case reflection.KindEnum:
		// (ref: nodes/atomic/enum.ts:14). Chain of `=== <value>` over
		// rt.Values — mixed enums carry mixed value types (numeric
		// reverse-mapped + string-enum values) so each entry is
		// formatted via jsLiteralFromAny.
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
		// (ref: nodes/atomic/literal.ts:70-71) (emitIsType) +
		// literal.ts:88-105 (compileIsLiteral). With the noLiterals
		// ValidateOption set, the literal degrades to its base-kind
		// check (`'a'` → `typeof v === 'string'`, etc.) so the user
		// can validate a wider runtime shape without changing the
		// type id — see `emitLiteralBaseKind`.
		if ctx.HasVariantOption("noLiterals") {
			return emitLiteralBaseKind(rt, v, ctx.NumberMode())
		}
		return emitLiteral(rt, v)

	case reflection.KindArray:
		// (ref: nodes/member/array.ts:emitIsType). Allocates an index
		// counter + a result local, sets the child accessor on the
		// current frame so the child's pushStack adopts `v[i0]` as its
		// Vλl, then composes the canonical block:
		//
		//   if (!Array.isArray(v)) return false;
		//   for (let i0 = 0; i0 < v.length; i0++) {
		//     const res0 = <childCode>;
		//     if (!(res0)) return false;
		//   }
		//   return true;
		//
		// Two collapse paths mirror emitIsType when the child
		// produces no validator code:
		//   - child empty + noIsArrayCheck → `""` (the whole check
		//     evaporates — `{code: undefined}`).
		//   - child empty + no noIsArrayCheck → bare `Array.isArray(v)`.
		// A non-serializable element type (Symbol, Function) propagates
		// CodeNS via the child compile below: the element's arm returns
		// CodeNS (latching the element as the unsupported leaf), and the
		// `childRT.Type == CodeNS` check propagates it upward. Array element
		// is a positional (non-property) position, so the CodeNS rises to
		// the root → alwaysThrow factory (throws at RT-compile,
		// nodes/member/array.ts:148; unified rule, T3), consistent with
		// tuple slots / union members. As a *property* child the parent
		// absorbs it (drops the property with a Warning).
		if rt.Child == nil {
			return RTCode{Code: "", Type: CodeE}
		}
		noIsArrayCheck := ctx.HasVariantOption("noIsArrayCheck")
		iVar := ctx.NextLocalVar("i")
		resVar := ctx.NextLocalVar("res")
		ctx.SetChildAccessor(v + "[" + iVar + "]")
		childRT := ctx.CompileChild(rt.Child, CodeE)
		// Reset the accessor so any later sibling-children pushes
		// (none today, but cheap to keep correct) start from the
		// parent's Vλl rather than the now-stale subscript.
		ctx.SetChildAccessor("")
		if childRT.Type == CodeNS {
			// Element type can't be validated → array can't be
			// validated → propagate upward.
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code == "" {
			if noIsArrayCheck {
				return RTCode{Code: "", Type: CodeE}
			}
			return RTCode{Code: "Array.isArray(" + v + ")", Type: CodeE}
		}
		var body strings.Builder
		if !noIsArrayCheck {
			body.WriteString("if (!Array.isArray(")
			body.WriteString(v)
			body.WriteString(")) return false;\n")
		}
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
		// (ref: nodes/collection/interface.ts:emitIsType). (KindClass
		// non-Date falls into the same function via the KindClass
		// arm above.)
		//
		// Shape:
		//   (typeof v === 'object' && v !== null
		//      && <child1Code> && <child2Code> && …)
		//
		// Children whose kind is method-shaped (MethodSignature /
		// Method / CallSignature) or whose IsStatic is true are
		// skipped — getRTChildren() filters the same way.
		// Property / PropertySignature children whose wrapped value is
		// function-flavoured ALSO collapse to empty code inside their
		// own emit and are filtered from the AND chain here.
		return emitObjectValidate(rt, ctx, v)

	case reflection.KindProperty, reflection.KindPropertySignature:
		// (ref: nodes/member/property.ts:emitIsType) (PropertySignature
		// shares the same shape via PropertyRunType). Skips entirely
		// when the wrapped child is function-flavoured (the
		// `getRTChild` returns undefined when member.skipRT() is
		// true; function kinds skipRT).
		return emitPropertyValidate(rt, ctx, v)

	case reflection.KindIndexSignature:
		// (ref: nodes/member/indexProperty.ts:emitIsType).
		return emitIndexSignatureValidate(rt, ctx, v)

	case reflection.KindFunction, reflection.KindMethod,
		reflection.KindMethodSignature, reflection.KindCallSignature:
		// (ref: nodes/function/function.ts:emitIsType). Method /
		// MethodSignature / CallSignature all inherit FunctionRunType,
		// so they share the same emit. Param-count arity guard
		// (`v.length >= minLength`) is intentionally omitted —
		// callers wanting per-arg validation use `Parameters<F>`
		// which routes through the tuple emit (see the
		// `call_signature_params` case in the OBJECT suite).
		return RTCode{Code: "typeof " + v + " === 'function'", Type: CodeE}

	case reflection.KindTuple:
		// (ref: nodes/collection/tuple.ts:emitIsType). Composes into a
		// return-block (CodeRB) for clean composition with rest
		// elements and arbitrary child code shapes. The reference emit
		// inlines as an expression and uses `(check1 && check2 && …)`
		// but mixing a for-loop (Rest) with an expression chain
		// produces invalid JS; CodeRB sidesteps the issue and lets
		// each member's emit stay in whatever shape is natural.
		return emitTupleValidate(rt, ctx, v)

	case reflection.KindTupleMember:
		// (ref: nodes/member/tupleMember.ts:emitIsType). Reads
		// rt.Position to set the element accessor `v[<i>]`, recurses
		// into Child, optionally wraps with the `undefined ||` guard.
		return emitTupleMemberValidate(rt, ctx, v)

	case reflection.KindUnion:
		// (ref: nodes/collection/union.ts:emitIsType). Walks the safe
		// children (SafeUnionChildren when present, else Children)
		// and OR-chains their checks. Objects share a single
		// `typeof === 'object' && !== null` guard so a null input
		// doesn't crash inside a property access.
		return emitUnionValidate(rt, ctx, v)

	case reflection.KindTemplateLiteral:
		// (ref: nodes/collection/templateLiteral.ts:emitIsType).
		// Compiles the template literal type to an anchored regex at
		// RT-build time, then runs `typeof v === 'string' &&
		// regex.test(v)` at validator-call time. The regex is hoisted
		// into the closure prologue as a context-item const so it's
		// built once per factory rather than per call.
		return emitTemplateLiteralValidate(rt, ctx, v)
	}
	// Unsupported kind. Return the CodeNS sentinel — the walker
	// latches IsUnsupported and the renderer skips this entry's
	// factory. Replaces the old hard panic: composite parents that
	// descend into this kind (Array.Child, Object.Children, etc.)
	// see CodeNS and propagate it up, so the whole top-level entry
	// gets silently skipped instead of crashing the renderer.
	return RTCode{Code: "", Type: CodeNS}
}

// emitTupleValidate handles KindTuple. Body shape (CodeRB):
//
//	if (!Array.isArray(v)) return false;
//	if (v.length > N) return false;   // only when no rest
//	const r0 = <member0Check>; if (!(r0)) return false;
//	for (let iK = K; iK < v.length; iK++) {  // rest member, if any
//	  const rK = <childCheck>; if (!(rK)) return false;
//	}
//	return true;
//
// Non-rest members emit as expressions (CodeE) and get wrapped in
// a result-var + bail-if-false pair. Rest members emit as
// statement blocks (CodeRB) that are embedded directly. Mirrors
// TupleMember.emitIsType `if (this.isRest()) return childRT`
// branch + RestParamsRunType's ArrayRunType-shaped for-loop, without
// the reference quirk of mixing expression chains with statements.
func emitTupleValidate(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if len(rt.Children) == 0 {
		// Empty tuple: `Array.isArray(v) && v.length === 0`. We
		// keep this as an expression since it's noop-free.
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
		// Rest members emit a CodeRB for-loop; request RB so the
		// walker doesn't IIFE-wrap it (which would discard the
		// inner `return false`).
		expectedType := CodeE
		if isRestTupleMember(resolved) {
			expectedType = CodeRB
		}
		childRT := ctx.CompileChild(child, expectedType)
		if childRT.Type == CodeNS {
			// Unsupported member — the whole tuple is unvalidatable.
			// Walker has already latched IsUnsupported via compileNode;
			// propagating here keeps the parent's chain consistent.
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code == "" {
			continue
		}
		if childRT.Type == CodeRB {
			// Rest member's for-loop. The trailing `return true` is
			// stripped so the block flows into the outer return rather
			// than short-circuiting the rest of the parent's checks.
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

// stripTrailingReturnTrue removes the closing `return true` line a
// CodeRB child emits when it stands alone (Array, IndexSignature,
// rest TupleMember). Embedded inside a parent block the inner
// `return true` would short-circuit the rest of the parent's
// checks — strip it so control falls through.
func stripTrailingReturnTrue(code string) string {
	const suffix = "return true"
	trimmed := strings.TrimRight(code, " \n\t;")
	if strings.HasSuffix(trimmed, suffix) {
		return trimmed[:len(trimmed)-len(suffix)]
	}
	return code
}

// tupleHasRest reports whether any tuple child is a rest element. Used
// to skip the upper-length-bound check (rest elements absorb extras).
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

// emitTupleMemberValidate handles KindTupleMember. Sets the element
// accessor `v[<Position>]` on the current frame so the wrapped child
// emit sees that as its Vλl, then applies the optional guard if the
// member is optional.
//
// Rest members (Flags contains "rest") emit a for-loop iterating
// from the member's position to v.length, validating each element
// against the wrapped type. Returns CodeRB; the parent tuple emit
// embeds the block directly.
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
		// Function-typed tuple elements: treated as non-
		// serializable and emit `=== undefined`. Mirror the runtime
		// behavior.
		return RTCode{Code: v + "[" + positionStr(rt) + "] === undefined", Type: CodeE}
	}
	if isRestTupleMember(rt) {
		// Rest member — emit for-loop from this position to v.length.
		// Mirrors RestParamsRunType (extends ArrayRunType with
		// startIndex(comp) override pointing at the parent tuple's
		// position).
		iVar := ctx.NextLocalVar("i")
		resVar := ctx.NextLocalVar("r")
		ctx.SetChildAccessor(v + "[" + iVar + "]")
		childRT := ctx.CompileChild(rt.Child, CodeE)
		ctx.SetChildAccessor("")
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code == "" {
			// Non-validatable element type — accept any length without
			// per-element checks (mirrors the empty-emit behavior).
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

// emitUnionValidate handles KindUnion. Walks the safe-ordered children
// (SafeUnionChildren when populated, otherwise Children) and emits an
// OR-chain. Object-type checks share a single `typeof === 'object' &&
// !== null` guard so a null input doesn't crash inside a property
// access — mirrors the
// `(typeof v === 'object' && v !== null && (objCheck1 || objCheck2))`
// shape.
//
// All-optional object members get the property-presence gate via
// looseCheckGate (see json_prepare.go) — mirrors
// getChildValidateWithLooseCheck (union.ts:56-78). Without this, an
// input like `{c: 'foo'}` would match `{a?: string; b?: string}`
// (no required props to fail on), which is incorrect per TS's
// weak-type rules.
func emitUnionValidate(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	// DataOnly-strip members (symbol / function-like / Promise /
	// non-serializable / never) so `Date | symbol` validates as `Date`,
	// matching DataOnly<T>. An all-stripped union keeps its members and falls
	// through to the CodeNS branch below (projection is `never`), rendering the
	// alwaysThrow factory. See union_strip.go.
	children := dataOnlyUnionMembers(rt, ctx)
	var simpleChecks []string
	var objectChecks []string
	for _, child := range children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		childRT := ctx.CompileChild(child, CodeE)
		if childRT.Type == CodeNS {
			// Only reachable when EVERY member is stripped (the union's
			// DataOnly projection is `never`): collapse the whole union to the
			// alwaysThrow factory.
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code == "" {
			continue
		}
		childCode := childRT.Code
		if gate := looseCheckGate(resolved, ctx, v); gate != "" {
			childCode = "(" + childCode + " && " + gate + ")"
		}
		if isObjectLikeKind(resolved.Kind) {
			objectChecks = append(objectChecks, childCode)
		} else {
			simpleChecks = append(simpleChecks, childCode)
		}
	}
	parts := simpleChecks
	if len(objectChecks) > 0 {
		// One shared object guard wraps the whole object OR-chain. The object
		// arms come back WITHOUT their own leading `typeof === 'object' && !== null`
		// term: emitObjectValidate drops it for direct object-literal / plain-class
		// union members (it checks ctx.ParentIsUnion()), since this shared guard
		// already establishes it and short-circuits null before any child runs.
		// Array / tuple / index-sig / Date / Map / Set arms are opaque calls with
		// no such prefix, so they are unaffected; the standalone (non-union) object
		// entry keeps its own guard.
		objGuard := "typeof " + v + " === 'object' && " + v + " !== null"
		objChain := strings.Join(objectChecks, " || ")
		parts = append(parts, "("+objGuard+" && ("+objChain+"))")
	}
	if len(parts) == 0 {
		return RTCode{Code: "false", Type: CodeE}
	}
	return RTCode{Code: "(" + strings.Join(parts, " || ") + ")", Type: CodeE}
}

// emitMapValidate handles `Map<K, V>` (KindClass + SubKindMap). The
// serializer projects the type args as two KindParameter wrappers
// (SubKindMapKey / SubKindMapValue) each carrying the K/V child
// type. The emit reaches through the wrappers, generates element
// checks against the wrapper's Child types, and iterates
// `v.entries()` so each key/value pair gets validated.
//
// Body shape (CodeRB):
//
//	if (!(v instanceof Map)) return false;
//	for (const entry0 of v.entries()) {
//	  const k0 = entry0[0]; const val0 = entry0[1];
//	  const rk0 = <keyCheck>;   if (!(rk0))  return false;
//	  const rv0 = <valueCheck>; if (!(rv0))  return false;
//	}
//	return true
//
// If a key/value type has no validator (e.g. KindAny), that arm of
// the check collapses and only the surviving side runs.
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

// emitSetValidate handles `Set<T>` (KindClass + SubKindSet). Same
// pattern as Map but with a single Argument wrapper (SubKindSetItem)
// and `.values()` iteration.
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

// mapKeyValueTypes reaches through the synthetic KindParameter
// wrappers the serializer puts in Map.Arguments — entry [0] is the
// key wrapper (SubKindMapKey), entry [1] is the value wrapper
// (SubKindMapValue) — and returns the wrapped child types. Returns
// nil for missing slots so the caller can collapse the matching arm
// of the emit.
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

// setItemType reaches through the synthetic KindParameter wrapper
// (SubKindSetItem) the serializer puts in Set.Arguments to return
// the wrapped element type.
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

// iterableInnerTypes returns the child RunType(s) to walk for a native
// iterable: [key, value] for a Map (SubKindMap), [item] for a Set.
func iterableInnerTypes(rt *reflection.RunType, ctx *EmitContext) []*reflection.RunType {
	if rt.SubKind == reflection.SubKindMap {
		keyType, valueType := mapKeyValueTypes(rt, ctx)
		return []*reflection.RunType{keyType, valueType}
	}
	return []*reflection.RunType{setItemType(rt, ctx)}
}

// emitTemplateLiteralValidate handles KindTemplateLiteral. Mirrors
// (ref: nodes/collection/templateLiteral.ts:emitIsType):
//
//	const reTL0 = new RegExp("^...$")  // context item, hoisted
//	return (typeof v === 'string' && reTL0.test(v))
//
// The regex source is built once at RT-build time from the template
// literal's text segments + placeholder kinds; spanToRegex mirrors
// the pattern table verbatim (number → `-?(?:\d+\.?\d*|\.\d+)`,
// string/any/infer → `[\s\S]*`, literal → escaped verbatim).
func emitTemplateLiteralValidate(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	regex, ok := buildTemplateLiteralRegex(rt)
	if !ok {
		// Malformed literal payload — fall back to a typeof-string
		// check so the validator is still useful (returns true for
		// any string). Better than panicking inside the renderer.
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

// buildTemplateLiteralRegex reconstructs the anchored regex source
// from the serializer's wire shape (rt.Literal carries
// `{templateLiteral: {texts: […], placeholders: [{kind, literal?}]}}`).
// Returns false when the payload is missing or malformed — the caller
// degrades gracefully to a plain typeof-string check.
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

// spanRegexPattern returns the regex source for one template-literal
// placeholder span. Mirrors spanToRegex (templateLiteral.ts):
//
//	literal  → escaped literal value verbatim
//	number   → -?(?:\d+\.?\d*|\.\d+)
//	bigint   → -?\d+
//	string / any / unknown / (default) → [\s\S]*
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

// stringifyLiteral converts a literal span value to its JS
// `String(v)` form for the regex literal embed. Numbers and booleans
// go through fmt; strings pass through verbatim.
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
// Mirrors escapeForRegex (templateLiteral.ts).
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

// emitObjectValidate emits the canonical object-shape AND-chain for
// KindObjectLiteral / KindClass. Mirrors
// nodes/collection/interface.ts:emitIsType including the
// `isCallable()` branch (CallSignature child swaps the typeof
// guard from 'object' to 'function') and `allOptionalCode` (empty
// or all-optional objects get an explicit Array.isArray + native-
// object rejection so `{}` doesn't accept arrays / Date / Map /
// Set). The `strictTypes` option — which would surface
// unknown-property rejection — is the one remaining knob not
// yet wired here; lands when a caller needs it.
//
// Children are filtered the same way getRTChildren filters:
// method-shaped kinds and static members are dropped, and a
// Property / PropertySignature whose wrapped child is function-
// flavoured returns empty from its own emit and is filtered out
// here too. A Property / PropertySignature returning CodeNS (its
// own non-function-typed wrapped child can't be validated)
// propagates CodeNS upward and the whole object factory is
// silently skipped.
func emitObjectValidate(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	// First-pass: detect a CallSignature child.
	// InterfaceRunType.emitIsType branches on `this.isCallable()` and
	// emits `(callSigCheck && propsCheck)` — a callable interface
	// requires the value to be a function (typeof === 'function')
	// with optional extra properties on top. Plain object check is
	// suppressed in that case (a function is typeof === 'function',
	// not 'object').
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
	// A callable interface at a NON-root position (property / element) is
	// function-like, exactly like a bare function: dropped at a property,
	// alwaysThrow at a propagating slot. Return CodeNS so the parent handles it
	// like any other function-valued child (matching the serializers, F2). At the
	// ROOT a function value is valid, so keep the typeof-function guard below.
	if callSigChild != nil && !ctx.IsRoot() {
		return RTCode{Code: "", Type: CodeNS}
	}
	var parts []string
	if callSigChild != nil {
		// Callable shape — use the call-sig's emit as the guard.
		// `typeof v === 'function'` plus property checks on the
		// function-as-object's extra props (functions can carry
		// properties in JS).
		parts = append(parts, "typeof "+v+" === 'function'")
	} else {
		parts = append(parts, "typeof "+v+" === 'object' && "+v+" !== null")
	}
	// Publish the sibling-named-props set for any index-signature child
	// so its emit can skip those keys via `if (sib === prop) continue;`
	// at the top of the for-in loop. Mirrors
	// IndexSignatureRunType.getSkipCode + InterfaceRunType.getNamedChildren.
	// No-op when the object has no index sig or no named props.
	publishSiblingNamedKeysForIndexSig(rt, ctx)
	publishSiblingPatternsForIndexSig(rt, ctx)
	allOptional := true
	hasContributingChild := false
	// Set by the loop below when a REQUIRED, CONTRIBUTING property has a name no
	// array can supply — see objectNeedsBrandGuard.
	hasArrayProofRequiredProp := false
	hasIndexSig := false
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if resolved.IsStatic {
			// Static members don't appear on instances — never
			// participate in validate validation.
			ctx.EmitDiagnosticSlot(SlotStaticDropped, memberLabel(resolved))
			continue
		}
		if resolved.Kind == reflection.KindIndexSignature {
			hasIndexSig = true
		}
		if isFunctionLikeKind(resolved.Kind) {
			// Method / MethodSignature / CallSignature directly on the
			// shape (not wrapped in a PropertySignature) —
			// getRTChildren skips them; we match. For the callable
			// case the CallSignature is already represented by the
			// `typeof === 'function'` guard above.
			ctx.EmitDiagnosticSlot(SlotMethodDropped, memberLabel(resolved))
			continue
		}
		childRT := ctx.CompileChild(child, CodeE)
		if childRT.Type == CodeNS {
			// A required (non-skippable) child can't be validated.
			// The whole object is unvalidatable — return CodeNS and
			// let the renderer skip this factory. Walker has already
			// latched IsUnsupported, so the remaining CompileChild
			// calls would short-circuit anyway; we exit early to skip
			// the unused work of iterating siblings.
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
	// All-optional / no-required-property objects pass the basic
	// `typeof === 'object' && !== null` for arrays too (arrays *are*
	// objects in JS), so we add the `allOptionalCode` guard to
	// explicitly reject arrays and other native objects (Date, Map,
	// Set, …). Mirrors interface.ts:allOptionalCode at
	// (ref: packages/run-types/src/nodes/collection/interface.ts).
	//
	// An index-signature-bearing object (a `Record<K, V>`, or a fixed
	// object with a catch-all signature) ALSO needs the brand guard: a
	// for-in over a Map / Set / Date / empty array enumerates no own
	// string keys, so the per-key value check is vacuously satisfied and
	// the bare `typeof === 'object'` lets those non-plain objects pass
	// (`isRecord(new Map())` would wrongly be true). That over-acceptance
	// corrupts a union's merged-prop dispatch — a Map value matches an
	// earlier `Record` candidate and is then encoded as `{}` on every
	// serialization lane. Gate the `[object Object]` brand on hasIndexSig
	// so a foreign non-plain object is rejected.
	//
	// Empty objects + all-optional shapes need the same guard for the
	// array-is-an-object reason (arrays *are* objects in JS).
	//
	// Suppressed for callable shapes (callSigChild != nil) — the
	// value is a Function, not an Object, and the
	// `Object.prototype.toString.call(v)` check returns
	// '[object Function]' rather than '[object Object]' in that case.
	if callSigChild == nil && objectNeedsBrandGuard(hasContributingChild, allOptional, hasIndexSig, hasArrayProofRequiredProp) {
		guard := "(!Array.isArray(" + v + ") && Object.prototype.toString.call(" + v + ") === '[object Object]')"
		// Insert AFTER the typeof guard so null/non-objects still
		// short-circuit first.
		parts = append(parts[:1], append([]string{guard}, parts[1:]...)...)
	}
	// Fused (`checkUnknowns`) families only: assert this object carries no
	// undeclared keys. WHETHER to emit it is emitsUnknownKeyCheck's call, shared
	// with emitObjectValidationErrors so the validator and its error twin can
	// never disagree about a node. Appended LAST on purpose — every property
	// check above it has already passed by the time it runs, which is exactly the
	// precondition that makes the O(1) key-count compare sound (see
	// strictObjectKeyAssertion).
	if emitsUnknownKeyCheck(rt, ctx, callSigChild) {
		parts = append(parts, strictObjectKeyAssertion(rt, ctx))
	}
	// Under a union, emitUnionValidate wraps every object arm in one shared
	// `typeof v === 'object' && v !== null` guard; re-emitting it in the arm
	// just bloats the OR-chain. Drop parts[0] (the typeof guard) — the
	// [object Object] brand guard (now the leading term of parts[1:], when
	// present) and every property check survive as the arm's own checks.
	// callSigChild == nil keeps callable shapes intact (their parts[0] is the
	// typeof-function guard); len(parts) > 1 is defensive against emitting "()".
	if callSigChild == nil && len(parts) > 1 && ctx.ParentIsUnion() {
		return RTCode{Code: "(" + joinAnd(parts[1:]) + ")", Type: CodeE}
	}
	return RTCode{Code: "(" + joinAnd(parts) + ")", Type: CodeE}
}

// memberIsOptional reports whether a child of an object literal /
// class is "optional" for the purposes of the
// `areAllChildrenOptional` check. PropertySignature / Property
// honor their Optional flag; IndexSignature counts as non-optional
// because an index sig validates value types on every own key (so
// an array-input would fail the per-key check anyway when the value
// type isn't satisfied).
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

// emitPropertyValidate handles KindProperty / KindPropertySignature.
// Sets the child accessor on the current frame so the wrapped type's
// pushStack adopts `v.<name>` (or `v["name"]` for unsafe names) as
// its Vλl, then composes the optional guard if the property is
// optional. Returns empty code when the wrapped child is function-
// flavoured so the parent's AND chain drops the slot.
func emitPropertyValidate(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	if strippedPropertyDrop(resolved, rt.Name, ctx) {
		// Directly DataOnly-stripped value (symbol / function / Promise / never /
		// non-serializable native) — drop the slot from the AND chain, matching
		// `DataOnly<{a: symbol}>` = `{}`.
		return RTCode{Code: "", Type: CodeE}
	}
	accessor := propertyAccessor(v, rt.Name, rt.IsSafeName)
	ctx.SetChildAccessor(accessor)
	childRT := ctx.CompileChild(rt.Child, CodeE)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		// The value is NOT directly stripped (caught above). A DataOnly-stripped
		// leaf reached through a propagating slot (symbol[], Map<string,symbol>)
		// fails the object; any other unsupported kind is absorbed (F3). See
		// propertyChildFailed.
		if propertyChildFailed(ctx) {
			return RTCode{Code: "", Type: CodeNS}
		}
		return RTCode{Code: "", Type: CodeE}
	}
	// A member whose type imposes NO value check (`unknown` / `any`, which emit
	// the bare `true`) still imposes PRESENCE when it is REQUIRED: `{}` is not
	// assignable to `{foo: unknown}`. Emitting the value check alone drops the
	// slot out of the AND chain entirely and the member silently becomes
	// optional — which also quietly breaks looseCheckGate's "one required prop
	// means the bare validate already enforces presence" shortcut. An OPTIONAL
	// noop member asserts nothing at all, so it leaves the chain as before.
	if childRT.Code == "" || isNoopForValidate(rt.Child, ctx) {
		if rt.Optional {
			return RTCode{Code: "", Type: CodeE}
		}
		return RTCode{Code: "(" + quoteJS(rt.Name) + " in " + v + ")", Type: CodeE}
	}
	if rt.Optional {
		return RTCode{
			Code: "(" + accessor + " === undefined || " + childRT.Code + ")",
			Type: CodeE,
		}
	}
	return childRT
}

// emitIndexSignatureValidate handles KindIndexSignature. Mirrors
// IndexSignatureRunType.emitIsType (indexProperty.ts). When the key
// type is a template literal (`{[key: `api/${string}`]: T}`), the
// emit also runs a per-key regex.test to enforce the key pattern,
// mirroring `getKeyPatternVar` + the early-return key check
// inside the for-in body.
//
// Sibling-named-prop skip: `getSkipCode` (indexProperty.ts:166)
// emits `if (sibA === prop || sibB === prop) continue;` at the top of
// the for-in body so an object mixing named props with an index
// signature doesn't double-check the named keys against the index's
// value type. We honour the same semantic via the shared
// publishSiblingNamedKeysForIndexSig (called from emitObjectValidate
// before recursing into children) + siblingNamedSkipCode helpers in
// unknownkeys_shared.go.
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
	// Optional key-pattern regex from a template-literal index key.
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
		// Value type can't be validated → index sig can't be
		// validated → propagate upward.
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

// EmitDependencyCall returns the JS expression that invokes a
// pre-rendered child RT entry from inside the parent's body, and
// registers the context-item declaration that resolves the child via
// the rtUtils singleton. Mirrors BaseFnCompiler.callDependency
// (rtFnCompiler.ts:326): cross-function calls go through
// `<hash>.fn(args)`, self-recursive calls drop the `.fn` indirection
// and call the inner function declaration directly (the `isSelf`
// branch — the inner function name IS the call target since the body
// is the enclosing closure).
//
// The context-item line is the canonical shape:
//
//	const <hash> = utl.getRT('<hash>')
//
// — registered once per hash thanks to the ordered-items set; sibling
// children in the same parent body see the same `const` declaration.
func (ValidateEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	return ctx.emitDepCall(childID, ctx.Vλl, "")
}

// emitLiteral mirrors compileIsLiteral (literal.ts:88-105).
// Branches on the runtime shape of rt.Literal as encoded by the Go-side
// serializer (see internal/cachegen/runtype/serialize.go:402-428):
//
//   - Flags=["bigint"], Literal=decimal string         → `v === 123n`
//   - Flags=["symbol"], Literal={"symbol": "name"}     → typeof + .description
//   - Literal={"regexp": {"source","flags"}}           → instanceof + source/flags
//   - Literal: bool / int64 / float64 / string         → `v === <literal>`
//
// The regex form compares `.source` and `.flags` directly rather than
// String(v) === String(<regex literal>) (the reference's exact phrasing), to
// avoid embedding a regex source literal in emitted JS. Same
// observable semantics — including the escaped-regex spec case
// /['"]\/ \\ \// which only differs in source-text, not in the
// compared .source/.flags strings.
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
		// (ref: literal.ts:103) — `typeof v === 'symbol' && v.description === <name>`
		entry, ok := literal.(map[string]any)
		if !ok {
			panic(fmt.Sprintf("typefns: symbol literal expected map encoding, got %T", literal))
		}
		name, _ := entry["symbol"].(string)
		return RTCode{
			Code: "typeof " + v + " === 'symbol' && " + v + ".description === " + quoteJS(name),
			Type: CodeE,
		}
	}

	lit, err := jsLiteralFromAny(literal)
	if err != nil {
		panic(fmt.Sprintf("typefns: validate literal emit: %v", err))
	}
	return RTCode{Code: v + " === " + lit, Type: CodeE}
}

// emitLiteralBaseKind emits the BASE-kind validator for a literal — the
// shape the `noLiterals` ValidateOptions variant produces. The variant
// pairs with the canonical literal type id (no swap on the resolver
// side), so the same `T = 'a'` can serve both:
//
//   - plain `val_<id>`     → `v === 'a'`        (literal-exact)
//   - variant `itNL_<id>` → `typeof v === 'string'` (base-kind)
//
// Base-kind picked from `rt.Flags` markers (`bigint`/`symbol`)
// or — when no marker is set — from the Go-side type of `rt.Literal`.
// Boolean → `typeof v === 'boolean'`; number → the numberMode-selected base
// check (mirrors the KindNumber arm); string → `typeof v === 'string'`.
func emitLiteralBaseKind(rt *reflection.RunType, v, numberMode string) RTCode {
	flagSet := make(map[string]bool, len(rt.Flags))
	for _, flag := range rt.Flags {
		flagSet[flag] = true
	}
	if flagSet["bigint"] {
		return RTCode{Code: "typeof " + v + " === 'bigint'", Type: CodeE}
	}
	if flagSet["symbol"] {
		// Mirrors the plain KindSymbol arm: bare `typeof v === 'symbol'`
		// is misleading (accepts every symbol regardless of identity),
		// so the unsupported sentinel propagates to an alwaysThrow
		// factory at the root. See the KindSymbol case above.
		return RTCode{Code: "", Type: CodeNS}
	}
	switch rt.Literal.(type) {
	case bool:
		return RTCode{Code: "typeof " + v + " === 'boolean'", Type: CodeE}
	case int64, float64:
		return RTCode{Code: numberBaseCheck(numberMode, v), Type: CodeE}
	case string:
		return RTCode{Code: "typeof " + v + " === 'string'", Type: CodeE}
	}
	// Unknown literal shape — fall back to the literal-exact check so
	// the variant body still validates something. The no-op diagnostic
	// (emitted at scan time when noLiterals lands on a non-literal
	// type) should catch this case; this branch is the defensive
	// fallback for an unforeseen literal encoding.
	return emitLiteral(rt, v)
}

// jsLiteralFromAny mirrors the primitive subset of
// (ref: packages/run-types/src/lib/utils.ts) toLiteral. BigInt / symbol / regexp
// literals are handled on their own paths in emitLiteral because
// their Go encoding carries extra envelope data (Flags markers or
// map shapes). Used by both KindLiteral and KindEnum.
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
		// Go's %v drops the ".0" suffix on whole-number floats, matching
		// the JSON Number → JS Number round-trip we get via stringify.
		return fmt.Sprintf("%v", lit), nil
	case string:
		return quoteJS(lit), nil
	}
	return "", fmt.Errorf("jsLiteralFromAny: unsupported value type %T", value)
}

// Finalize matches the per-fn noop detection in
// handleFunctionReturn (rtFnCompiler.ts:420–423 for the validate case).
// An validate body that's empty, the bare expression `true`, or already
// `return true` is replaced by `return true` and marked noop so the
// renderer can skip emitting a factory whose validator always
// returns true (consumer can default to `() => true` for free).
func (ValidateEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "true" || code == "return true" {
		return "return true", true
	}
	return code, false
}

// objectNeedsBrandGuard decides whether an object node must carry the
// `(!Array.isArray(v) && toString.call(v) === '[object Object]')` guard, and is
// shared by emitObjectValidate and emitObjectValidationErrors so the two cannot
// answer differently (fuzz oracle O4 pins that they agree).
//
// The guard is not free, so it is emitted only where something else is not
// already doing its job. A REQUIRED property normally is: an array has no `name`
// and a Date has no `name`, so `typeof v.name === 'string'` is false long before
// a brand check would run. Shapes with nothing required — all-optional, an index
// signature, no contributing child at all — have no such property, so `[]`,
// `new Date()` and `new Map()` would all pass the bare `typeof === 'object'`.
//
// # The case that was missed
//
// "A required property excludes an array" only holds when the property has a
// name an array cannot supply. Every array carries `length` and its numeric
// indices, so `{length: number}` and `{0: string}` are satisfied by `[1, 2]` and
// `['x']`: the required check passes, no guard is emitted, and the validator
// accepts an array as an object. hasArrayProofRequiredProp is what closes it.
//
// A type like that is close to unwritable in practice, but the fix costs one
// extra term on exactly those shapes and nothing anywhere else.
func objectNeedsBrandGuard(hasContributingChild, allOptional, hasIndexSig, hasArrayProofRequiredProp bool) bool {
	if !hasContributingChild || allOptional || hasIndexSig {
		return true
	}
	return !hasArrayProofRequiredProp
}

// arrayCarriesName reports whether an ARRAY has a property of this name, so a
// required property of that name cannot be relied on to exclude one. That is
// `length` plus every numeric index.
//
// Deliberately blind to the declared TYPE. `{length: string}` is already
// excluded by its own check (`[].length` is a number), so the guard it gets here
// is redundant — one wasted term on a shape nobody writes, in exchange for a
// rule that stays true if the type ever widens.
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
