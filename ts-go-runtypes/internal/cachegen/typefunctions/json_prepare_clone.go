package typefunctions

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// PrepareForJsonCloneEmitter is the non-mutating sibling of PrepareForJsonEmitter: it returns a NEW
// value holding only the declared keys and the transformed leaves, never touching the input.
// It pairs with RestoreFromJsonEmitter because the wire shape it writes is byte-for-byte the one
// `prepareForJson + JSON.stringify` writes, flat-union envelopes included.
// Cost model: one allocation per nested object / array node, with noop leaves (string, number, …)
// shared by reference, then native JSON.stringify does the serialising.
// Approach 3 fastpath: when the whole subtree is JSON-compatible (`isJsonCompatible` in
// json_compat.go) AND every property is required, the object emit gates a runtime
// `Object.keys(v).length === N` check that returns `v` unchanged. Mixed-optionality shapes always
// build the clone — the fastpath check would be too expensive to short-circuit safely.
type PrepareForJsonCloneEmitter struct{}

func (PrepareForJsonCloneEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports is the mutating sibling's set: the wire format is identical, so the two stay in lockstep.
func (PrepareForJsonCloneEmitter) Supports(rt *reflection.RunType) bool {
	return jsonWireSupports(rt)
}

func (PrepareForJsonCloneEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// IsNoopType — external children whose safe-clone entry is the identity compose as empty code, and
// the parent then uses the input accessor directly. See noop_types.go for the soundness contract.
func (PrepareForJsonCloneEmitter) IsNoopType(rt *reflection.RunType, ctx *EmitContext) bool {
	return isNoopForPrepareJsonSafe(rt, ctx)
}

// NoopChildComposesAround — an extra-proof child slot is shared by reference, so empty code composes.
func (PrepareForJsonCloneEmitter) NoopChildComposesAround() {}

// ReturnName is `v` for the walker's tail-wrap, but most clone emits return CodeE or CodeRB and
// never use it; a noop body takes Finalize's `return v` path instead.
func (PrepareForJsonCloneEmitter) ReturnName() string {
	return "v"
}

// EmitDependencyCall emits the bare `<hash>.fn(v)` expression, not the mutating sibling's
// `v = <hash>.fn(v)` statement: a clone emit MUST NEVER mutate the input, and the parent consumes
// the call as an expression slot (`{inner: <hash>.fn(v.inner)}`).
func (PrepareForJsonCloneEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	return ctx.emitDepCall(childID, ctx.Vλl, "")
}

// Finalize mirrors PrepareForJsonEmitter's: an empty / identity body becomes `return v` with
// isNoop true, so the JS-side noop fastpath short-circuits dispatch.
func (PrepareForJsonCloneEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "return v" {
		return "return v", true
	}
	return code, false
}

// Emit dispatches the per-kind switch, returning a CodeE expression for the clone of v, a
// self-returning CodeRB block when the body needs locals, or empty CodeS for a noop.
// Composition rule: an empty child Code means the parent uses the input accessor (`v.<name>`,
// `v[i]`, `_e`) directly — that expression IS the clone, since no transform is needed.
func (PrepareForJsonCloneEmitter) Emit(rt *reflection.RunType, ctx *EmitContext, _ CodeType) RTCode {
	if rt == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	switch rt.Kind {

	case reflection.KindAny, reflection.KindUnknown,
		reflection.KindNull, reflection.KindUndefined,
		reflection.KindString, reflection.KindNumber, reflection.KindBoolean,
		reflection.KindObject, reflection.KindEnum:
		// Atomic JSON-compatible kinds — Finalize collapses to noop.
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindNever:
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindBigInt:
		return RTCode{Code: v + ".toString()", Type: CodeE}

	case reflection.KindSymbol:
		// Unsupported — symbol identity does not round-trip.
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindRegexp:
		// Unsupported — a RegExp is a pattern the receiver would run, not data;
		// it is dropped from the wire like a function (DataOnly strips it).
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindVoid:
		return RTCode{Code: "undefined", Type: CodeE}

	case reflection.KindClass:
		if reflection.IsTemporalSubKind(rt.SubKind) {
			// Temporal's toJSON() is the analogue of Date's toISOString().
			return RTCode{Code: v + ".toJSON()", Type: CodeE}
		}
		switch rt.SubKind {
		case reflection.SubKindDate:
			return RTCode{Code: v + ".toISOString()", Type: CodeE}
		case reflection.SubKindNone:
			structural := emitObjectPrepareForJsonClone(rt, ctx, v)
			return wrapSafeWithClassSerializer(rt, ctx, v, structural)
		case reflection.SubKindMap, reflection.SubKindSet:
			return emitNativeIterablePrepareForJsonClone(rt, ctx, v)
		case reflection.SubKindNonSerializable:
			return RTCode{Code: "", Type: CodeNS}
		}
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindPromise:
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindObjectLiteral:
		return emitObjectPrepareForJsonClone(rt, ctx, v)

	case reflection.KindIndexSignature:
		return emitIndexSignaturePrepareForJsonClone(rt, ctx, v)

	case reflection.KindTuple:
		return emitTuplePrepareForJsonClone(rt, ctx, v)

	case reflection.KindFunction, reflection.KindMethod,
		reflection.KindMethodSignature, reflection.KindCallSignature:
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindUnion:
		return emitUnionPrepareForJsonClone(rt, ctx, v)

	case reflection.KindIntersection:
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindTemplateLiteral:
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindLiteral:
		return emitLiteralPrepareForJsonClone(rt, v)

	case reflection.KindArray:
		return emitArrayPrepareForJsonClone(rt, ctx, v)

	case reflection.KindProperty, reflection.KindPropertySignature:
		// A property is normally consumed inline by its parent object; this arm only catches one
		// reached at root, where the mutating sibling is a noop too.
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindTupleMember:
		// Same as Property: a tuple member is consumed inline by its parent tuple.
		return RTCode{Code: "", Type: CodeS}
	}
	return RTCode{Code: "", Type: CodeNS}
}

// emitLiteralPrepareForJsonClone encodes bigint and symbol literals; a primitive literal is a noop.
func emitLiteralPrepareForJsonClone(rt *reflection.RunType, v string) RTCode {
	switch literalFlavour(rt) {
	case litBigInt:
		return RTCode{Code: v + ".toString()", Type: CodeE}
	case litSymbol:
		// Unsupported — symmetric with emitLiteralPrepareForJson's symbol arm.
		return RTCode{Code: "", Type: CodeNS}
	}
	return RTCode{Code: "", Type: CodeS}
}

// safeChildExpr is the composition primitive: it returns a JS expression evaluating to the clone of
// `accessor`. Empty child code means the child is a noop, so the clone IS the accessor.
func safeChildExpr(childRef *reflection.RunType, accessor string, ctx *EmitContext) (string, bool) {
	ctx.SetChildAccessor(accessor)
	childRT := ctx.CompileChild(childRef, CodeE)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return "", false
	}
	if childRT.Code == "" {
		return accessor, true
	}
	// CodeRB / CodeS results hoist into a context fn to fit an expression slot. CompileChild
	// already does this when CodeE is expected; defensive catch for a child emit returning CodeRB
	// at an unexpected level.
	if childRT.Type == CodeS || childRT.Type == CodeRB {
		params := ctx.CtxFnParams(accessor)
		return ctx.CreateFnInContext(childRT.Code, childRT.Type, params, params), true
	}
	return childRT.Code, true
}

// safePropEmit is one declared property's compiled clone expression plus what the parent object
// emit needs to assemble the clone.
type safePropEmit struct {
	name       string
	isSafeName bool
	optional   bool
	accessor   string // input accessor `v.<name>` for the undefined check
	expr       string // clone expression evaluated against `accessor`
	// presenceGuard is ANDed into the `!== undefined` check so a merged-union prop with a stripped
	// sibling is emitted only for a surviving candidate's values; a value from the stripped member
	// (present but foreign-typed) omits the key (G4).
	presenceGuard string
}

// emitObjectPrepareForJsonClone builds a CodeRB block returning a new object of the declared keys
// only, with transformed leaves. The Approach 3 fastpath short-circuits to `return v` when
// `Object.keys(v).length === N`, and only when every prop is required and extra-proof.
func emitObjectPrepareForJsonClone(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	// A callable interface is function-like (DataOnly = never); treat it like a
	// bare function (alwaysThrow at root, dropped at a property), not an object.
	if objectHasCallSignature(rt, ctx) {
		return RTCode{Code: "", Type: CodeNS}
	}
	var props []safePropEmit
	var indexSigs []*reflection.RunType
	// `allExtraProof` is the stricter fastpath gate: a nested object child can be isJsonCompatible
	// per the TYPE and still carry extras at runtime, which the outer's `return v` would leak.
	allExtraProof := true
	allRequired := true
	for _, child := range objectMembers(rt) {
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
			// Deferred: the for-in tail below copies non-declared keys under the sig's transform.
			indexSigs = append(indexSigs, resolved)
			allExtraProof = false // index sig dynamic keys can't be passed through
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
			// Directly DataOnly-stripped value — drop the property so the clone omits it,
			// matching `DataOnly<{a: symbol}>` = `{}` (F3).
			continue
		}
		accessor := propertyAccessor(v, resolved.Name, resolved.IsSafeName)
		expr, ok := safeChildExpr(resolved.Child, accessor, ctx)
		if !ok {
			// A DataOnly-stripped leaf in a propagating slot (symbol[], Map<string,symbol>) is
			// KEPT by DataOnly, so fail the object; any other unsupported kind is absorbed (F3).
			if propertyChildFailed(ctx) {
				return RTCode{Code: "", Type: CodeNS}
			}
			continue
		}
		if !isExtraProof(propResolved, ctx) {
			allExtraProof = false
		}
		if resolved.Optional {
			allRequired = false
		}
		prop := safePropEmit{
			name:       resolved.Name,
			isSafeName: resolved.IsSafeName,
			optional:   resolved.Optional,
			accessor:   accessor,
			expr:       expr,
		}
		// A non-enumerable-guarded member (lib-global-inherited / `@nonEnumerable`) is projected
		// Optional, so it already takes the guarded-assignment path; the presenceGuard ANDs an
		// own-enumerability check into it, so a value carrying the prop non-enumerably omits the
		// key, as native `JSON.stringify` does.
		if isEnumerabilityGuarded(resolved) {
			prop.presenceGuard = propertyIsEnumerableGuard(v, resolved.Name)
		}
		props = append(props, prop)
	}

	// An index signature means walking every key on v at runtime, so the fastpath cannot apply. The
	// skip set is ALL declared named keys, not just the kept `props`: a DROPPED stripped prop
	// (`p0: ArrayBuffer`) must still be skipped so the for-in does not copy it back in (G6).
	if len(indexSigs) > 0 {
		return buildSafeIndexSignatureObject(v, props, collectSiblingNamedKeys(rt, ctx), indexSigs, true, ctx)
	}

	if len(props) == 0 {
		// No serializable declared properties — the clone is `{}` whatever v holds.
		return RTCode{Code: "return {}", Type: CodeRB}
	}

	clone := buildSafeObjectClone(props, ctx)
	if clone.Type == CodeRB {
		// Mixed-optionality: the accumulator block self-returns, so it IS the factory body. Splice
		// it directly instead of hoisting into a context fn, since the object emit sits in
		// statement position. The fastpath below cannot apply: a CodeRB clone means at least one
		// prop is optional.
		return clone
	}

	// With every prop required and extra-proof, the declared-key clone equals `v` whenever
	// `Object.keys(v).length === N`, so a clean input skips the allocation.
	fastpath := allExtraProof && allRequired
	if fastpath {
		body := "if (Object.keys(" + v + ").length === " + strconv.Itoa(len(props)) + ") return " + v + ";" +
			"return " + clone.Code
		return RTCode{Code: body, Type: CodeRB}
	}
	return RTCode{Code: "return " + clone.Code, Type: CodeRB}
}

// buildSafeIndexSignatureObject emits a CodeRB block building a new object from every declared
// property under its transform plus every OTHER key of v under the first matching index signature's
// transform. A key matching no pattern is copied as is when copyPatternMiss is set (the encoders:
// an index signature is open, a non-matching key is validation's to refuse) and dropped otherwise
// (removeUnknownKeys: a by-reference copy would break `clone(x) !== x`).
// The for-in loop skips declared keys, whose assignments come AFTER and would otherwise be
// overridden by raw index-sig values.
func buildSafeIndexSignatureObject(v string, props []safePropEmit, skipNames []string, indexSigs []*reflection.RunType, copyPatternMiss bool, ctx *EmitContext) RTCode {
	var b strings.Builder
	b.WriteString("const _r = {};")
	type sigArm struct {
		keyRegexVar string
		valueExpr   string
	}
	arms := make([]sigArm, 0, len(indexSigs))
	keyVar := ctx.NextLocalVar("k")
	for _, sig := range indexSigs {
		if isSymbolKeyedIndexSig(sig, ctx) {
			continue
		}
		resolved := ctx.ResolveRef(sig.Child)
		if resolved == nil || isFunctionLikeKind(resolved.Kind) {
			continue
		}
		keyRegexVar := indexSignatureKeyRegexVar(sig, ctx)
		accessor := v + "[" + keyVar + "]"
		expr, ok := safeChildExpr(sig.Child, accessor, ctx)
		if !ok {
			return RTCode{Code: "", Type: CodeNS}
		}
		arms = append(arms, sigArm{keyRegexVar: keyRegexVar, valueExpr: expr})
	}
	if len(arms) > 0 {
		b.WriteString("for (const ")
		b.WriteString(keyVar)
		b.WriteString(" in ")
		b.WriteString(v)
		b.WriteString(") {")
		// A prototype-named key is never written onto the fresh object.
		b.WriteString(unsafeKeySkip(keyVar))
		// Skip every declared key: the kept props' assignments below own their slot, and a DROPPED
		// prop must not be copied back in by the index arm (G6). skipNames is the full declared
		// name set (kept + dropped), a superset of `props`.
		if len(skipNames) > 0 {
			var declaredCheck strings.Builder
			declaredCheck.WriteString("if (")
			for i, name := range skipNames {
				if i > 0 {
					declaredCheck.WriteString(" || ")
				}
				declaredCheck.WriteString(keyVar)
				declaredCheck.WriteString(" === ")
				declaredCheck.WriteString(quoteJS(name))
			}
			declaredCheck.WriteString(") continue;")
			b.WriteString(declaredCheck.String())
		}
		// A key matching no pattern is copied untouched after the last patterned arm, when the
		// caller asked for it.
		open := copyPatternMiss
		for _, arm := range arms {
			if arm.keyRegexVar != "" {
				b.WriteString("if (")
				b.WriteString(arm.keyRegexVar)
				b.WriteString(".test(")
				b.WriteString(keyVar)
				b.WriteString(")) { _r[")
				b.WriteString(keyVar)
				b.WriteString("] = ")
				b.WriteString(arm.valueExpr)
				b.WriteString("; continue; }")
			} else {
				open = false
				b.WriteString("_r[")
				b.WriteString(keyVar)
				b.WriteString("] = ")
				b.WriteString(arm.valueExpr)
				b.WriteString(";")
			}
		}
		if open {
			b.WriteString("_r[" + keyVar + "] = " + v + "[" + keyVar + "];")
		}
		b.WriteString("}")
	}
	// Declared-property assignments come AFTER the for-in so they win any conflict, and they are
	// still needed when the arms list is empty.
	for _, p := range props {
		if p.optional {
			b.WriteString("if (")
			b.WriteString(p.accessor)
			b.WriteString(" !== undefined")
			if p.presenceGuard != "" {
				b.WriteString(" && (")
				b.WriteString(p.presenceGuard)
				b.WriteString(")")
			}
			b.WriteString(") _r[")
			b.WriteString(quoteJS(p.name))
			b.WriteString("] = ")
			b.WriteString(p.expr)
			b.WriteString(";")
		} else {
			b.WriteString("_r[")
			b.WriteString(quoteJS(p.name))
			b.WriteString("] = ")
			b.WriteString(p.expr)
			b.WriteString(";")
		}
	}
	b.WriteString("return _r")
	return RTCode{Code: b.String(), Type: CodeRB}
}

// buildSafeObjectClone assembles the clone of the declared keys, built purely from the declared
// type shape (never `{...sourceV}`), which is how this strategy strips undeclared keys for free.
// All-required props give a CodeE object literal; mixed optionality gives a self-returning CodeRB
// accumulator, so optional props need no per-prop object spread.
// The CodeRB block is NOT hoisted here, the caller decides: a caller in statement position splices
// it, one in expression position (a union member wrapped in `[-1, …]`) hoists it into a context fn.
// Assumes len(props) > 0; the parent emit gates the empty case.
func buildSafeObjectClone(props []safePropEmit, ctx *EmitContext) RTCode {
	hasOptional := false
	for _, p := range props {
		if p.optional {
			hasOptional = true
			break
		}
	}
	if !hasOptional {
		var b strings.Builder
		b.WriteString("{")
		for i, p := range props {
			if i > 0 {
				b.WriteString(",")
			}
			b.WriteString(jsonObjectKeyLiteral(p.name, p.isSafeName))
			b.WriteString(":")
			b.WriteString(p.expr)
		}
		b.WriteString("}")
		return RTCode{Code: b.String(), Type: CodeE}
	}
	var b strings.Builder
	b.WriteString("const _r={")
	first := true
	for _, p := range props {
		if p.optional {
			continue
		}
		if !first {
			b.WriteString(",")
		}
		first = false
		b.WriteString(jsonObjectKeyLiteral(p.name, p.isSafeName))
		b.WriteString(":")
		b.WriteString(p.expr)
	}
	b.WriteString("};")
	for _, p := range props {
		if !p.optional {
			continue
		}
		b.WriteString("if (")
		b.WriteString(p.accessor)
		b.WriteString(" !== undefined")
		if p.presenceGuard != "" {
			b.WriteString(" && (")
			b.WriteString(p.presenceGuard)
			b.WriteString(")")
		}
		b.WriteString(") _r[")
		b.WriteString(quoteJS(p.name))
		b.WriteString("]=")
		b.WriteString(p.expr)
		b.WriteString(";")
	}
	b.WriteString("return _r;")
	return RTCode{Code: b.String(), Type: CodeRB}
}

// jsonObjectKeyLiteral returns the JS object-literal key form for a property name, quoting anything
// that is not a safe identifier. Mirrors propertyAccessor's safe-vs-quoted decision.
func jsonObjectKeyLiteral(name string, isSafeName bool) string {
	if isSafeName {
		return name
	}
	return quoteJS(name)
}

// isExtraProof reports whether values of `rt` are guaranteed to carry NO extras under any input,
// which is what decides between passing a value through by reference (`string[]` → return v) and
// always cloning (`{a: string}[]` → v.map(…), each element could carry an extra).
// Stricter than `isJsonCompatible`, which describes the TYPE but not what a runtime value holds:
// an object or class is never extra-proof, and anything carrying a value transform (Date, bigint,
// a bigint / symbol literal) is not either, since sharing it by reference would skip the transform.
// Cycle-safe: re-entry on an in-progress ID answers false, and cloning is always the safe answer.
func isExtraProof(rt *reflection.RunType, ctx *EmitContext) bool {
	if rt != nil && rt.ID != "" {
		if verdict, known := ctx.walker.factsLookup(factExtraProof, rt.ID); known {
			return verdict
		}
	}
	result := extraProofRecursive(rt, ctx, make(map[string]struct{}))
	// Only completed top-level walks are stored (same note as isJsonCompatible): an intermediate
	// node's in-walk value may rest on a cycle-back assumption for an ancestor still on the stack.
	if rt != nil && rt.ID != "" {
		ctx.walker.factsStore(factExtraProof, rt.ID, result)
	}
	return result
}

func extraProofRecursive(rt *reflection.RunType, ctx *EmitContext, visited map[string]struct{}) bool {
	if rt == nil {
		return false
	}
	if rt.ID != "" {
		if verdict, known := ctx.walker.factsLookup(factExtraProof, rt.ID); known {
			return verdict
		}
		if _, seen := visited[rt.ID]; seen {
			return false
		}
		visited[rt.ID] = struct{}{}
	}
	switch rt.Kind {
	case reflection.KindString, reflection.KindNumber, reflection.KindBoolean,
		reflection.KindNull, reflection.KindEnum, reflection.KindTemplateLiteral:
		return true
	case reflection.KindLiteral:
		// A bigint / symbol literal carries a value transform (emitLiteralPrepareForJsonClone), so
		// answering true here handed `(1n|2n)[]` straight to JSON.stringify, which throws.
		return literalFlavour(rt) == litPrimitive
	case reflection.KindArray:
		if rt.Child == nil {
			return true
		}
		return extraProofRecursive(ctx.ResolveRef(rt.Child), ctx, visited)
	case reflection.KindTuple:
		for _, child := range rt.Children {
			if !extraProofRecursive(ctx.ResolveRef(child), ctx, visited) {
				return false
			}
		}
		return true
	case reflection.KindTupleMember:
		if rt.Child == nil {
			return true
		}
		return extraProofRecursive(ctx.ResolveRef(rt.Child), ctx, visited)
	case reflection.KindUnion:
		children := rt.SafeUnionChildren
		if len(children) == 0 {
			children = rt.Children
		}
		for _, child := range children {
			if !extraProofRecursive(ctx.ResolveRef(child), ctx, visited) {
				return false
			}
		}
		return true
	}
	return false
}

// emitArrayPrepareForJsonClone is a noop when the element type is extra-proof: the input array can
// be shared by reference, since JSON.stringify ignores an array's non-index properties and the
// elements carry no extras either.
func emitArrayPrepareForJsonClone(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	resolvedChild := ctx.ResolveRef(rt.Child)
	if isExtraProof(resolvedChild, ctx) {
		return RTCode{Code: "", Type: CodeS}
	}
	elemVar := ctx.NextLocalVar("e")
	expr, ok := safeChildExpr(rt.Child, elemVar, ctx)
	if !ok {
		return RTCode{Code: "", Type: CodeNS}
	}
	return RTCode{Code: v + ".map(function(" + elemVar + "){return " + expr + "})", Type: CodeE}
}

// emitTuplePrepareForJsonClone is a noop when every member is extra-proof; otherwise it emits a
// tuple literal of per-position clone expressions, with a rest member as a mapped tail spread.
func emitTuplePrepareForJsonClone(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if len(rt.Children) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	if isExtraProof(rt, ctx) {
		return RTCode{Code: "", Type: CodeS}
	}
	var parts []string
	restPart := ""
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if resolved.Kind != reflection.KindTupleMember {
			continue
		}
		if resolved.Child == nil {
			continue
		}
		if propResolved := ctx.ResolveRef(resolved.Child); propResolved == nil {
			parts = append(parts, "null")
			continue
		}
		// Function-typed slots fall through to safeChildExpr and latch as unsupported: a `null`
		// placeholder would produce a lossy clone for a structural position.
		if isRestTupleMember(resolved) {
			elemVar := ctx.NextLocalVar("e")
			expr, ok := safeChildExpr(resolved.Child, elemVar, ctx)
			if !ok {
				return RTCode{Code: "", Type: CodeNS}
			}
			start := positionStr(resolved)
			restPart = "..." + v + ".slice(" + start + ").map(function(" + elemVar + "){return " + expr + "})"
			break
		}
		idx := positionStr(resolved)
		accessor := v + "[" + idx + "]"
		expr, ok := safeChildExpr(resolved.Child, accessor, ctx)
		if !ok {
			return RTCode{Code: "", Type: CodeNS}
		}
		if resolved.Optional {
			// Replace an `undefined` slot with `null` so the JSON form keeps the slot, the tuple
			// semantic for an optional at a non-trailing position.
			expr = "(" + accessor + " === undefined ? null : " + expr + ")"
		}
		parts = append(parts, expr)
	}
	if restPart != "" {
		parts = append(parts, restPart)
	}
	if len(parts) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	return RTCode{Code: "[" + strings.Join(parts, ",") + "]", Type: CodeE}
}

// emitIndexSignaturePrepareForJsonClone produces a new object whose values are the child's
// transform over the original ones. Symbol-keyed sigs are skipped, as in every rt fn.
func emitIndexSignaturePrepareForJsonClone(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if isSymbolKeyedIndexSig(rt, ctx) {
		return RTCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil || isFunctionLikeKind(resolved.Kind) {
		return RTCode{Code: "", Type: CodeS}
	}
	keyRegexVar := indexSignatureKeyRegexVar(rt, ctx)
	keyVar := ctx.NextLocalVar("k")
	accessor := v + "[" + keyVar + "]"
	expr, ok := safeChildExpr(rt.Child, accessor, ctx)
	if !ok {
		return RTCode{Code: "", Type: CodeNS}
	}
	body := "const _r = {};for (const " + keyVar + " in " + v + ") {" + unsafeKeySkip(keyVar)
	if keyRegexVar != "" {
		// An index signature is open: a key the pattern does not match is copied as
		// is, only its value transform is skipped (validation is what refuses it).
		body += "if (!" + keyRegexVar + ".test(" + keyVar + ")) {_r[" + keyVar + "] = " + accessor + "; continue;}"
	}
	body += "_r[" + keyVar + "] = " + expr + ";}return _r"
	return RTCode{Code: body, Type: CodeRB}
}

// emitUnionPrepareForJsonClone is the non-mutating variant of emitUnionPrepareForJsonFlat: it
// produces the same flat-union wire shape, so the result decodes through the flat
// restoreFromJsonMutate, but every clause returns a NEW value and the input is never touched.
func emitUnionPrepareForJsonClone(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	return emitUnionPrepareForJsonCloneLayout(rt, ctx, v, buildFlatLayout(rt, ctx))
}

// emitUnionPrepareForJsonCloneLayout is the encode body over a caller-built
// layout — compact widens the envelope rule first (buildCompactFlatLayout).
func emitUnionPrepareForJsonCloneLayout(rt *reflection.RunType, ctx *EmitContext, v string, layout FlatLayout) RTCode {
	if len(layout.AtomicMembers) == 0 && len(layout.ObjectMembers) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	// All members JSON-identity — the value passes through unchanged; skip the
	// per-member validate-and-return dispatch (see atomicOnlyJsonIdentity).
	if layout.atomicOnlyJsonIdentity() {
		return RTCode{Code: "", Type: CodeS}
	}

	var clauses []string

	// Class members dispatch by instance identity first, then non-class atomics, then a class
	// structural fallback; each member's clone expression is reused across both its arms.
	prologue, arms := layout.atomicEncodeDispatch(v, ctx)
	exprByIndex := make(map[int]string, len(layout.AtomicMembers))
	for _, m := range layout.AtomicMembers {
		memberExpr, ok := safeChildExpr(m.Ref, v, ctx)
		if !ok {
			return RTCode{Code: "", Type: CodeNS}
		}
		resultExpr := memberExpr
		if layout.AtomicNeedsTuple {
			resultExpr = "[" + strconv.Itoa(m.OriginalIndex) + "," + memberExpr + "]"
		}
		exprByIndex[m.OriginalIndex] = resultExpr
	}
	for _, arm := range arms {
		clauses = append(clauses, "if ("+arm.Guard+") return "+exprByIndex[arm.Member.OriginalIndex]+";")
	}

	if len(layout.ObjectMembers) > 0 {
		discAccessor := layout.discAccessor(v)
		var props []safePropEmit
		for _, mp := range layout.MergedProps {
			accessor := propertyAccessor(v, mp.Name, mp.IsSafeName)
			propExpr, ok := emitMergedPropPrepareSafe(mp, accessor, discAccessor, ctx)
			if !ok {
				return RTCode{Code: "", Type: CodeNS}
			}
			// A stripped sibling forces the prop through the conditional-presence branch with the
			// surviving-candidate guard, so a foreign-typed value from the stripped member omits
			// the key instead of running the surviving codec (G4).
			presenceGuard := ""
			optional := !mp.Required
			if mp.HasStrippedCandidate {
				optional = true
				presenceGuard = mergedPropSurvivingGuard(mp, accessor, ctx)
			}
			props = append(props, safePropEmit{
				name:          mp.Name,
				isSafeName:    mp.IsSafeName,
				optional:      optional,
				accessor:      accessor,
				expr:          propExpr,
				presenceGuard: presenceGuard,
			})
		}
		var objLit string
		if layout.hasIndexSignatureMember(ctx) {
			objLit = emitMergedObjectOpenClone(layout, v, props, ctx)
		} else {
			clone := buildSafeObjectClone(props, ctx)
			objLit = clone.Code
			if clone.Type == CodeRB {
				// A union clause is an expression slot, so a mixed-optionality accumulator
				// block must hoist into a per-factory context fn to fit.
				params := ctx.CtxFnParams(v)
				objLit = ctx.CreateFnInContext(clone.Code, CodeRB, params, params)
			}
		}
		guard := objectGuard(v, "")
		// The clone always strips undeclared keys, so the `[-1, …]` envelope is needed only when
		// the union carries a transform somewhere; a round-trips-raw union returns the bare
		// stripped object and decodes as identity.
		result := objLit
		if layout.AtomicNeedsTuple {
			result = "[-1, " + objLit + "]"
		}
		clauses = append(clauses, "if ("+guard+") return "+result+";")
	}

	errVar := flatUnionEncodeErrorVar(ctx)
	body := prologue + strings.Join(clauses, " ") + " throw new Error(" + errVar + ")"
	return RTCode{Code: body, Type: CodeRB}
}

// emitMergedObjectOpenClone is the object clause of a carve-out union: a member carrying an index
// signature declares every key from the union's point of view, so the object member keeps every key
// exactly as the decoders keep it. A member whose props need no transform is returned untouched;
// otherwise a copy of every own key is built, with the prototype-name refusal the record arm uses,
// and only the declared props are rewritten. The copy skips every declared name so the writes own
// their slot, a dropped one included (G6).
func emitMergedObjectOpenClone(layout FlatLayout, v string, props []safePropEmit, ctx *EmitContext) string {
	identity := true
	for _, prop := range props {
		if prop.expr != prop.accessor || prop.presenceGuard != "" {
			identity = false
			break
		}
	}
	if identity {
		return v
	}
	var declared []string
	for _, member := range layout.ObjectMembers {
		declared = append(declared, collectSiblingNamedKeys(member.Resolved, ctx)...)
	}
	keyVar := ctx.NextLocalVar("k")
	var body strings.Builder
	body.WriteString("const _r = {};for (const " + keyVar + " in " + v + ") {" + unsafeKeySkip(keyVar))
	body.WriteString(declaredNameSkipCode(dedupSortStrings(declared), keyVar))
	body.WriteString("_r[" + keyVar + "] = " + v + "[" + keyVar + "];}")
	for _, prop := range props {
		write := "_r[" + quoteJS(prop.name) + "] = " + prop.expr + ";"
		if prop.optional {
			presence := prop.accessor + " !== undefined"
			if prop.presenceGuard != "" {
				presence += " && (" + prop.presenceGuard + ")"
			}
			write = "if (" + presence + ") " + write
		}
		body.WriteString(write)
	}
	body.WriteString("return _r")
	params := ctx.CtxFnParams(v)
	return ctx.CreateFnInContext(body.String(), CodeRB, params, params)
}

// emitMergedPropPrepareSafe returns the clone EXPRESSION for one merged property's value, the
// cloning analog of emitMergedPropPrepare. A multi-candidate prop needing a sub-wrap dispatches per
// candidate and returns `[subIdx, cloneExpr]`.
func emitMergedPropPrepareSafe(mp FlatMergedProp, accessor, discAccessor string, ctx *EmitContext) (string, bool) {
	if len(mp.Candidates) == 1 {
		return safeChildExpr(mp.Candidates[0].ChildRef, accessor, ctx)
	}
	if !mp.NeedsSubWrap {
		return accessor, true
	}
	// With a usable discriminant, gate each arm by the discriminant value
	// (stable across round-trip) instead of re-validating the prop value.
	useDisc := discAccessor != "" && mp.hasDiscDispatch()
	var arms []string
	for i, cand := range mp.Candidates {
		if cand.Resolved == nil {
			continue
		}
		candExpr, ok := safeChildExpr(cand.ChildRef, accessor, ctx)
		if !ok {
			return "", false
		}
		guard := ""
		if useDisc {
			guard = discCandidateGuard(discAccessor, cand)
		} else {
			validateExpr := unionMemberValidateCheck(cand.Resolved, ctx, accessor)
			guard = validateExpr
			if isObjectLikeKind(cand.Resolved.Kind) {
				guard = objectGuard(accessor, validateExpr)
			}
		}
		arms = append(arms, "if ("+guard+") return ["+strconv.Itoa(i)+", "+candExpr+"];")
	}
	if len(arms) == 0 {
		return accessor, true
	}
	// Dispatch arms hoist into a context fn; no candidate matching falls through to undefined.
	params := ctx.CtxFnParams(accessor)
	return ctx.CreateFnInContext(strings.Join(arms, " "), CodeRB, params, params), true
}

// emitNativeIterablePrepareForJsonClone returns a NEW array of Map / Set entries, never mutating v.
func emitNativeIterablePrepareForJsonClone(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	isMap := rt.SubKind == reflection.SubKindMap
	innerTypes := iterableInnerTypes(rt, ctx)
	// Fast path: every inner type JSON-compatible → just Array.from(v).
	allCompat := true
	for _, t := range innerTypes {
		if t == nil {
			continue
		}
		if !isJsonCompatible(t, ctx) {
			allCompat = false
			break
		}
	}
	if allCompat {
		return RTCode{Code: "Array.from(" + v + ")", Type: CodeE}
	}
	entryVar := ctx.NextLocalVar("e")
	var entryParts []string
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
		entryParts = append(entryParts, expr)
	}
	var perEntry string
	if isMap {
		perEntry = "[" + strings.Join(entryParts, ",") + "]"
	} else {
		perEntry = entryParts[0]
	}
	return RTCode{Code: "Array.from(" + v + ", function(" + entryVar + "){return " + perEntry + "})", Type: CodeE}
}
