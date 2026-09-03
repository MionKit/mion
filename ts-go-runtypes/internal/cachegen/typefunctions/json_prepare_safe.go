package typefunctions

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// PrepareForJsonSafeEmitter — non-mutating sibling of
// PrepareForJsonEmitter. Returns a NEW value containing only the
// declared keys and the transformed leaves; the original input is
// never touched. Pairs with the existing RestoreFromJsonEmitter
// because the wire shape (Date→ISO string, bigint→decimal string,
// flat-union object branch `[-1, merged]`, atomic branch
// `[memberIndex, value]` or untagged per atomicBranchNeedsTuple) is
// byte-for-byte identical to `prepareForJson + JSON.stringify`.
//
// Cost model: one object/array allocation per nested object literal
// in the input. Sub-values for noop leaves (string, number, …) are
// shared by reference between input and output, so the allocation
// footprint is the schema's node count, not the input's value size.
// Compare to the existing `stringifyJson` family which handcrafts
// the JSON string in JS and is ~10× slower than native JSON.stringify;
// this emitter builds a new value and lets native JSON.stringify
// serialise it.
//
// Approach 3 fastpath: when the whole subtree is JSON-compatible
// (`isJsonCompatible` in json_compat.go) AND every property is required
// (no `?:` declarations), the object emit gates a runtime
// `Object.keys(v).length === N` check that returns `v` unchanged when
// the input has exactly the declared key count. Mixed-optionality
// shapes always build the clone — the fastpath check would be too
// expensive to short-circuit safely.
type PrepareForJsonSafeEmitter struct{}

func (PrepareForJsonSafeEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports mirrors PrepareForJsonEmitter.Supports — same set of kinds
// the non-safe sibling handles. The wire format is identical so the
// supported surface stays in lockstep.
func (PrepareForJsonSafeEmitter) Supports(rt *reflection.RunType) bool {
	return jsonWireSupports(rt)
}

func (PrepareForJsonSafeEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// IsNoopType — the walker's dispatch-time noop gate: external children whose
// safe-clone entry is the identity compose as empty code (the parent uses
// the input accessor directly, matching the inline empty-child rule). See
// noop_types.go for the soundness contract.
func (PrepareForJsonSafeEmitter) IsNoopType(rt *reflection.RunType, ctx *EmitContext) bool {
	return isNoopForPrepareJsonSafe(rt, ctx)
}

// NoopChildComposesAround — an extra-proof child slot is shared by reference (the clone helpers' composition rule); empty code composes correctly.
func (PrepareForJsonSafeEmitter) NoopChildComposesAround() {}

// ReturnName is `v` for compatibility with the walker's tail-wrap, but
// most Safe emits return CodeE or CodeRB (their own `return ...`) so
// the walker doesn't actually use this. Noop bodies fall through
// Finalize's `return v` path.
func (PrepareForJsonSafeEmitter) ReturnName() string {
	return "v"
}

// EmitDependencyCall returns a CodeE-style expression invoking the
// child's precompiled safe-form factory. Differs from
// PrepareForJsonEmitter's version which emits a MUTATION statement
// (`v = <hash>.fn(v)`): Safe emits MUST NEVER mutate the input, so
// the dep-call returns just the value-producing expression
// (`<hash>.fn(v)`). The parent's safe-form composition consumes it
// as an expression slot (e.g. `{inner: <hash>.fn(v.inner)}`).
func (PrepareForJsonSafeEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	return ctx.emitDepCall(childID, ctx.Vλl, "")
}

// Finalize mirrors PrepareForJsonEmitter's: empty/identity bodies are
// rewritten to `return v` + isNoop=true so the JS-side noop fastpath
// short-circuits dispatch.
func (PrepareForJsonSafeEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "return v" {
		return "return v", true
	}
	return code, false
}

// Emit dispatches the per-kind switch. Each arm returns either:
//
//   - CodeE: a pure JS expression that evaluates to the safe-form of v.
//     The walker wraps with `return <expr>` at root.
//   - CodeRB: a self-returning block (handles its own `return`) used
//     for object literals / arrays / unions whose body needs locals
//     or conditional logic.
//   - Empty CodeS: noop. Finalize collapses to `return v` + isNoop.
//
// Composition rule: when a child emit returns empty Code, the parent
// uses the input accessor (`v.<name>` / `v[i]` / `_e`) directly — that
// expression IS the safe-form because no transform is needed. When the
// child returns CodeE, the parent uses that expression.
func (PrepareForJsonSafeEmitter) Emit(rt *reflection.RunType, ctx *EmitContext, _ CodeType) RTCode {
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
			// Safe (non-mutating) projection: emit the canonical string via
			// toJSON() — Temporal's analogue of Date's toISOString().
			return RTCode{Code: v + ".toJSON()", Type: CodeE}
		}
		switch rt.SubKind {
		case reflection.SubKindDate:
			return RTCode{Code: v + ".toISOString()", Type: CodeE}
		case reflection.SubKindNone:
			structural := emitObjectPrepareForJsonSafe(rt, ctx, v)
			return wrapSafeWithClassSerializer(rt, ctx, v, structural)
		case reflection.SubKindMap, reflection.SubKindSet:
			return emitNativeIterablePrepareForJsonSafe(rt, ctx, v)
		case reflection.SubKindNonSerializable:
			return RTCode{Code: "", Type: CodeNS}
		}
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindPromise:
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindObjectLiteral:
		return emitObjectPrepareForJsonSafe(rt, ctx, v)

	case reflection.KindIndexSignature:
		return emitIndexSignaturePrepareForJsonSafe(rt, ctx, v)

	case reflection.KindTuple:
		return emitTuplePrepareForJsonSafe(rt, ctx, v)

	case reflection.KindFunction, reflection.KindMethod,
		reflection.KindMethodSignature, reflection.KindCallSignature:
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindUnion:
		return emitUnionPrepareForJsonSafe(rt, ctx, v)

	case reflection.KindIntersection:
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindTemplateLiteral:
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindLiteral:
		return emitLiteralPrepareForJsonSafe(rt, v)

	case reflection.KindArray:
		return emitArrayPrepareForJsonSafe(rt, ctx, v)

	case reflection.KindProperty, reflection.KindPropertySignature:
		// Properties are normally consumed inline by their parent object
		// (emitObjectPrepareForJsonSafe iterates rt.Children and compiles
		// each property's .Child directly). This arm catches the rare case
		// of a Property reached at root — same noop emit as the non-safe
		// sibling.
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindTupleMember:
		// Same as Property — tuple members are consumed inline by their
		// parent tuple (emitTuplePrepareForJsonSafe iterates and dispatches
		// per-member directly).
		return RTCode{Code: "", Type: CodeS}
	}
	return RTCode{Code: "", Type: CodeNS}
}

// emitLiteralPrepareForJsonSafe — literal-flavoured atomic kinds:
// bigint / symbol / regexp literals carry a Flags marker and use the
// same transform as the bare kind. Primitive literals are noops.
func emitLiteralPrepareForJsonSafe(rt *reflection.RunType, v string) RTCode {
	switch literalFlavour(rt) {
	case litBigInt:
		return RTCode{Code: v + ".toString()", Type: CodeE}
	case litSymbol:
		return RTCode{Code: "'Symbol:' + (" + v + ".description || '')", Type: CodeE}
	}
	return RTCode{Code: "", Type: CodeS}
}

// safeChildExpr is the composition primitive: returns a JS expression
// that evaluates to the safe-form of `accessor`, by compiling the
// child ref with `accessor` set as the input. Empty child code means
// the child is noop — the safe-form IS the accessor.
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
	// CodeRB / CodeS results hoist into a context fn to fit an expression
	// slot. CompileChild already handles this via the walker's
	// handleCodeInterpolation when called with CodeE expected; defensive
	// catch here in case a child emit returns CodeRB at a level we don't
	// expect. (Also fixes the old defensive IIFE, which omitted the
	// `return ` a bare-CodeS block needs to yield a value.)
	if childRT.Type == CodeS || childRT.Type == CodeRB {
		params := ctx.CtxFnParams(accessor)
		return ctx.CreateFnInContext(childRT.Code, childRT.Type, params, params), true
	}
	return childRT.Code, true
}

// safePropEmit captures one declared property's compiled safe-form
// expression plus the metadata the parent object emit needs to assemble
// the final clone (key name, isSafeName for bracket-vs-dot, optional
// flag, the input accessor for the undefined check).
type safePropEmit struct {
	name       string
	isSafeName bool
	optional   bool
	accessor   string // input accessor `v.<name>` for the undefined check
	expr       string // safe-form expression evaluated against `accessor`
	// presenceGuard, when non-empty, is ANDed into the `!== undefined`
	// presence check so a merged-union prop with a stripped sibling is
	// emitted only for values matching a surviving candidate; a value from
	// the stripped member (present but foreign-typed) omits the key (G4).
	presenceGuard string
}

// emitObjectPrepareForJsonSafe — Approach 1 + 3 implementation for
// ObjectLiteral / Class<None>. Builds a CodeRB block that returns a
// new object containing only declared keys with transformed leaves.
//
// Approach 3 fastpath: if every property is required AND every prop's
// child type is JSON-compatible, the body short-circuits to `return v`
// when `Object.keys(v).length === N`. Mixed-optionality / has-transform
// shapes always clone.
func emitObjectPrepareForJsonSafe(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	// A callable interface is function-like (DataOnly = never); treat it like a
	// bare function (alwaysThrow at root, dropped at a property), not an object.
	if objectHasCallSignature(rt, ctx) {
		return RTCode{Code: "", Type: CodeNS}
	}
	var props []safePropEmit
	var indexSigs []*reflection.RunType
	// `allExtraProof` is the stricter Approach-3 fastpath gate — a
	// nested object child might be `isJsonCompatible` per the TYPE but
	// could carry extras at runtime, so the outer's `return v` shortcut
	// would leak those nested extras. Restricting the fastpath to
	// extra-proof children (primitives, enums, arrays-of-primitives, …)
	// keeps the optimisation safe.
	allExtraProof := true
	allRequired := true
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
			// Defer; emit a for-in tail below to copy non-declared keys
			// with the index sig's child transform applied.
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
			// Directly DataOnly-stripped value (symbol / function / Promise /
			// never / non-serializable native) — drop the property so the clone
			// omits it, matching `DataOnly<{a: symbol}>` = `{}`. Before, only
			// function-valued props were dropped here; symbol/Promise/native fell
			// through to safeChildExpr's CodeNS and wrongly failed the whole
			// object (F3 — the default clone encoder diverged from the others).
			continue
		}
		accessor := propertyAccessor(v, resolved.Name, resolved.IsSafeName)
		expr, ok := safeChildExpr(resolved.Child, accessor, ctx)
		if !ok {
			// Not directly stripped. A DataOnly-stripped leaf in a propagating
			// slot (symbol[], Map<string,symbol>) is KEPT by DataOnly, so fail the
			// object; any other unsupported kind is absorbed (drop the prop). (F3)
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
		// A non-enumerable-guarded member (lib-global-inherited / `@nonEnumerable`)
		// is projected Optional, so it already takes the guarded-assignment path;
		// the presenceGuard ANDs a runtime own-enumerability check into the
		// `!== undefined` presence test, so a value carrying the prop
		// non-enumerably omits the key (native `JSON.stringify` semantics). Same
		// mechanism the union stripped-candidate path uses.
		if isEnumerabilityGuarded(resolved) {
			prop.presenceGuard = propertyIsEnumerableGuard(v, resolved.Name)
		}
		props = append(props, prop)
	}

	// When there's an index signature, we must walk every key on v at
	// runtime — the fastpath / accumulator-only path doesn't apply. The skip
	// set is ALL declared named keys (not just the kept `props`): a DROPPED
	// stripped prop (`p0: ArrayBuffer`) must still be skipped so the for-in
	// doesn't copy it back into the clone (G6).
	if len(indexSigs) > 0 {
		return buildSafeIndexSignatureObject(v, props, collectSiblingNamedKeys(rt, ctx), indexSigs, ctx)
	}

	if len(props) == 0 {
		// No serializable declared properties — the safe-form is `{}`
		// regardless of v's content (strips ALL extras).
		return RTCode{Code: "return {}", Type: CodeRB}
	}

	clone := buildSafeObjectClone(props, ctx)
	if clone.Type == CodeRB {
		// Mixed-optionality: the accumulator block already self-returns, so
		// it IS the factory body. Splice it directly rather than hoisting into
		// a context fn and returning `return ctxFn0(v)` — the object emit sits
		// in statement position (root, or the walker hoists a nested CodeRB
		// exactly once). The fastpath below can't apply here: it requires every
		// prop be required, and a CodeRB clone means at least one is optional.
		return clone
	}

	// Approach 3 fastpath: only applies when EVERY prop is required AND
	// every prop's value type is extra-proof (primitive or composite of
	// primitives — nested objects could carry runtime extras even
	// when their type says otherwise). In that case the declared-key
	// clone equals `v` whenever `Object.keys(v).length === N`, so we
	// skip the allocation on clean inputs.
	fastpath := allExtraProof && allRequired
	if fastpath {
		body := "if (Object.keys(" + v + ").length === " + strconv.Itoa(len(props)) + ") return " + v + ";" +
			"return " + clone.Code
		return RTCode{Code: body, Type: CodeRB}
	}
	return RTCode{Code: "return " + clone.Code, Type: CodeRB}
}

// buildSafeIndexSignatureObject — emits a CodeRB block that builds a
// new object whose keys are: (a) every declared property the parent
// resolved, with its safe-form transform; (b) every OTHER key of v that
// matches at least one of the index signatures, with the matching index
// sig's child transform applied. Declared keys are NOT walked by the
// for-in loop (their assignments come AFTER and would otherwise be
// overridden by raw index-sig values).
func buildSafeIndexSignatureObject(v string, props []safePropEmit, skipNames []string, indexSigs []*reflection.RunType, ctx *EmitContext) RTCode {
	var b strings.Builder
	b.WriteString("const _r = {};")
	// Build the per-index-sig arms inside one for-in over v.
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
		keyRegexVar := ""
		if sig.Index != nil {
			indexResolved := ctx.ResolveRef(sig.Index)
			if indexResolved != nil && indexResolved.Kind == reflection.KindTemplateLiteral {
				if regex, ok := buildTemplateLiteralRegex(indexResolved); ok {
					keyRegexVar = ctx.NextLocalVar("reIdx")
					if !ctx.HasContextItem(keyRegexVar) {
						ctx.SetContextItem(keyRegexVar, "const "+keyRegexVar+" = new RegExp("+quoteJSDouble(regex)+")")
					}
				}
			}
		}
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
		// Skip every declared key — the kept props' explicit assignments
		// below own their slot (transformed value wins), and a DROPPED prop
		// must not be copied back in by the index arm (G6). skipNames is the
		// full declared-name set (kept + dropped), a superset of `props`.
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
		// Emit each sig's value assignment, gated by its key regex if any.
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
				b.WriteString("_r[")
				b.WriteString(keyVar)
				b.WriteString("] = ")
				b.WriteString(arm.valueExpr)
				b.WriteString(";")
			}
		}
		b.WriteString("}")
	}
	// Emit declared-property assignments AFTER the for-in so they win
	// any conflict (the for-in already skips declared names via the
	// `if (k === 'a' || …) continue;` guard, but in case of an empty
	// arms list we still need the declared writes).
	for _, p := range props {
		if p.optional {
			b.WriteString("if (")
			b.WriteString(p.accessor)
			b.WriteString(" !== undefined) _r[")
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

// buildSafeObjectClone assembles the safe-form clone of the declared keys.
// The clone is built purely from the declared type shape (never
// `{...sourceV}`), so undeclared keys are dropped by construction — this is
// why the shape-derived clone strategy strips for free.
//
// Return shape depends on optionality:
//   - all-required → a CodeE object-literal expression `{a: <expr>, b: <expr>}`.
//   - mixed-optionality → a self-returning CodeRB accumulator block
//     (`const _r={…};if(…)…;return _r;`) so optional props can be
//     conditionally included without per-optional object spreads.
//
// The CodeRB block is NOT hoisted here — the caller decides. A caller in
// STATEMENT position (the object emit at a return slot) splices the block
// body directly; a caller in EXPRESSION position (a union member wrapped in
// `[-1, …]`) hoists it into a per-factory context fn via CreateFnInContext.
// Hoisting here unconditionally added a redundant `return ctxFn0(v)` layer
// for the common object-at-root case.
//
// Note: this helper assumes len(props) > 0; the parent emit gates
// the empty case separately.
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
	// Mixed-optionality — self-returning accumulator block.
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

// jsonObjectKeyLiteral returns the JS object-literal key form for a
// property name. Safe identifiers (matching /^[a-zA-Z_$][\w$]*$/ per
// IsSafeName) emit as bare identifiers; everything else gets a quoted
// string. Mirrors propertyAccessor's safe-vs-quoted decision.
func jsonObjectKeyLiteral(name string, isSafeName bool) string {
	if isSafeName {
		return name
	}
	return quoteJS(name)
}

// isExtraProof reports whether values of `rt` are guaranteed to carry
// NO extras under any input — stricter than `isJsonCompatible`, which
// describes the TYPE's compatibility but not whether runtime values
// might have undeclared keys. Object literals and classes are never
// extra-proof (any JS object can carry extras at runtime). Arrays /
// tuples / unions are extra-proof iff their leaves are. Primitives,
// enums, literals, Date / bigint after transform, etc — extra-proof.
//
// Used by the Safe emitter to decide when a value can be passed through
// by reference (e.g. `string[]` → return v) vs always cloned
// (`{a: string}[]` → v.map(...) because each object element might
// carry an extra).
//
// Cycle-safe: re-entry on an in-progress ID returns false (a cycle
// always involves an object/class node so the conservative answer is
// "not extra-proof" — we'll clone, which is correct).
func isExtraProof(rt *reflection.RunType, ctx *EmitContext) bool {
	if rt != nil && rt.ID != "" {
		if verdict, known := ctx.walker.factsLookup(factExtraProof, rt.ID); known {
			return verdict
		}
	}
	result := extraProofRecursive(rt, ctx, make(map[string]struct{}))
	// Only completed top-level walks are stored — see the matching note
	// on isJsonCompatible; the in-walk value of an intermediate node may
	// depend on a cycle-back assumption for an ancestor still on the
	// stack.
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
		reflection.KindNull, reflection.KindEnum, reflection.KindTemplateLiteral,
		reflection.KindLiteral:
		return true
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

// emitArrayPrepareForJsonSafe — when the element type is extra-proof
// the whole array is noop: the input array can be shared by reference
// because JSON.stringify ignores non-index properties on arrays so
// there are no extras to strip at the array level itself, AND the
// elements are guaranteed not to carry extras either. Otherwise emit
// `v.map(function(_e){return <safeExpr>})`.
func emitArrayPrepareForJsonSafe(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
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

// emitTuplePrepareForJsonSafe — fast noop when every member is
// extra-proof; otherwise emit a tuple literal with per-position safe
// expressions. Rest members emit a tail spread of mapped elements.
func emitTuplePrepareForJsonSafe(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
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
		// Function-typed slots fall through to safeChildExpr below —
		// the function arm returns CodeNS, ok=false, and the renderer
		// surfaces an alwaysThrow factory. The previous `null`
		// placeholder produced a lossy clone for a structural position.
		if isRestTupleMember(resolved) {
			// Rest tail: spread a mapped slice over the remaining elements.
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
			// Replace `undefined` slots with `null` so the JSON form
			// preserves the slot, matching the tuple semantic for
			// optionals at non-trailing positions.
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

// emitIndexSignaturePrepareForJsonSafe — produces a new object whose
// keys are filtered by the (optional) template-literal key regex and
// whose values are the child's safe transform applied to the original
// value. Symbol-keyed sigs are dropped per the skipRT rule.
func emitIndexSignaturePrepareForJsonSafe(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
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
	accessor := v + "[" + keyVar + "]"
	expr, ok := safeChildExpr(rt.Child, accessor, ctx)
	if !ok {
		return RTCode{Code: "", Type: CodeNS}
	}
	body := "const _r = {};for (const " + keyVar + " in " + v + ") {"
	if keyRegexVar != "" {
		body += "if (!" + keyRegexVar + ".test(" + keyVar + ")) continue;"
	}
	body += "_r[" + keyVar + "] = " + expr + ";}return _r"
	return RTCode{Code: body, Type: CodeRB}
}

// emitUnionPrepareForJsonSafe — cloning, non-mutating variant of
// emitUnionPrepareForJsonFlat. Produces the flat-union wire shape
// (object branch wraps as `[-1, mergedObject]`; atomic branch wraps
// as `[memberIndex, value]` when layout.AtomicNeedsTuple, raw
// otherwise) so the result decodes through the existing flat
// restoreFromJson. Each clause returns a NEW value built from
// safeChildExpr / buildSafeObjectClone; the input is never touched.
func emitUnionPrepareForJsonSafe(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	return emitUnionPrepareForJsonSafeLayout(rt, ctx, v, buildFlatLayout(rt, ctx))
}

// emitUnionPrepareForJsonSafeLayout is the encode body over a caller-built
// layout — compact widens the envelope rule first (buildCompactFlatLayout).
func emitUnionPrepareForJsonSafeLayout(rt *reflection.RunType, ctx *EmitContext, v string, layout FlatLayout) RTCode {
	if len(layout.AtomicMembers) == 0 && len(layout.ObjectMembers) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	// All members JSON-identity — the value passes through unchanged; skip the
	// per-member validate-and-return dispatch (see atomicOnlyJsonIdentity).
	if layout.atomicOnlyJsonIdentity() {
		return RTCode{Code: "", Type: CodeS}
	}

	var clauses []string

	// Class members dispatch by instance identity first, then non-class atomics,
	// then a class structural fallback (atomicEncodeDispatch); each member's
	// clone expression is built once and reused across its identity + structural
	// arms.
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
			// A stripped sibling forces the prop through the conditional-presence
			// branch with the surviving-candidate guard, so a foreign-typed value
			// from the stripped member omits the key instead of running the
			// surviving codec on it (G4).
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
		clone := buildSafeObjectClone(props, ctx)
		objLit := clone.Code
		if clone.Type == CodeRB {
			// Union clause is an expression slot (`[-1, …]` / `return …` within a
			// clause chain), so a mixed-optionality accumulator block must hoist
			// into a per-factory context fn to fit.
			params := ctx.CtxFnParams(v)
			objLit = ctx.CreateFnInContext(clone.Code, CodeRB, params, params)
		}
		guard := objectGuard(v, "")
		// The clone always strips undeclared keys (buildSafeObjectClone); the
		// `[-1, …]` envelope is only needed when the union carries a transform
		// somewhere. A round-trips-raw union (AtomicNeedsTuple false) returns the
		// bare stripped object so it decodes identity.
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

// emitMergedPropPrepareSafe returns the safe-form EXPRESSION for one
// merged property's value (cloning analog of emitMergedPropPrepare).
// Single-candidate → safeChildExpr. Multi-candidate no-sub-wrap →
// identity (accessor). Multi-candidate with sub-wrap → IIFE that
// dispatches per candidate and returns `[subIdx, safeExpr]`.
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
	// Dispatch arms hoist into a context fn; fallthrough (no candidate
	// matched) returns undefined, exactly as the old IIFE did.
	params := ctx.CtxFnParams(accessor)
	return ctx.CreateFnInContext(strings.Join(arms, " "), CodeRB, params, params), true
}

// emitNativeIterablePrepareForJsonSafe handles Map / Set safely:
// returns a NEW array of safe-form entries (no mutation of v).
func emitNativeIterablePrepareForJsonSafe(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
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
