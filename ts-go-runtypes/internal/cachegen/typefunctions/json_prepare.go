package typefunctions

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// PrepareForJsonEmitter implements the `prepareForJson` rt function —
// transforms a runtime value into a JSON-serializable form (BigInts
// become decimal strings, Symbols become "Symbol:<desc>" strings, RegExps
// become their toString() form, etc.). The downstream JSON.stringify
// handles Dates via their built-in toJSON() contract.
//
// Paired with RestoreFromJsonEmitter — round-trip
// `restoreFromJson(JSON.parse(JSON.stringify(prepareForJson(v))))`
// must deep-equal v for every valid sample.
//
// Mirrors the per-kind emitPrepareForJson methods under
// (ref: packages/run-types/src/nodes/**).
type PrepareForJsonEmitter struct{}

// Args mirrors the `rtArgs.vλl = 'v'` + empty default in
// run-types/src/constants.functions.ts:45. Same single-arg shape as
// validate — prepareForJson mutates v in place and returns it.
func (PrepareForJsonEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports gates the renderer's top-level loop on the shared JSON-wire
// kind set (jsonWireSupports in json_shared.go).
func (PrepareForJsonEmitter) Supports(rt *reflection.RunType) bool {
	return jsonWireSupports(rt)
}

// IsRTInlined delegates to DefaultIsRTInlined — same heuristics as
// validate / validationErrors. The reference shares the predicate across all rt fns
// via BaseRunType.isRTInlined.
func (PrepareForJsonEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// IsNoopType — the walker's dispatch-time noop gate: external children whose
// prepare entry is the identity compose as empty code (no dep call, no
// import). See noop_types.go for the soundness contract.
func (PrepareForJsonEmitter) IsNoopType(rt *reflection.RunType, ctx *EmitContext) bool {
	return isNoopForPrepareJson(rt, ctx)
}

// NoopChildComposesAround — a value slot the transform leaves alone contributes nothing to the mutate walk; empty code composes correctly.
func (PrepareForJsonEmitter) NoopChildComposesAround() {}

// ReturnName is `v` — prepareForJson mutates the input value (or
// rebinds via `v = …` for symbol/regexp/bigint), then returns it.
// Same as validate's return.
func (PrepareForJsonEmitter) ReturnName() string {
	return "v"
}

// Emit dispatches the per-kind switch. Each arm mirrors the body of
// the corresponding `emitPrepareForJson` method under
// (ref: packages/run-types/src/nodes/atomic/<name>.ts).
//
// Most atomic kinds are noops (return CodeS with empty code). The
// non-noop atomics:
//   - bigint:  `v = v.toString()` (BigInt is not JSON-encodable; serialize as decimal string)
//   - symbol:  `v = 'Symbol:' + (v.description || ”)` (preserve description tag)
//   - regexp:  `v = v.toString()` (serialize as /source/flags string)
//   - void:    `v = undefined` (force the output to undefined)
//
// All non-noop atomics return CodeE so the walker's
// expression-in-statement-context wrap appends `;` before the
// `return v` tail. The reference uses bare expression form for the same
// emits (e.g. `${comp.vλl}.toString()`); we adopt the
// `v = <expression>` form so the walker's expression-shape handling
// produces well-formed JS that actually mutates v before returning.
//
// Unsupported kinds emit CodeNS — the walker latches IsUnsupported
// and the renderer skips this entry's factory.
func (PrepareForJsonEmitter) Emit(rt *reflection.RunType, ctx *EmitContext, _ CodeType) RTCode {
	if rt == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	switch rt.Kind {

	case reflection.KindAny, reflection.KindUnknown,
		reflection.KindNull, reflection.KindUndefined,
		reflection.KindString, reflection.KindNumber, reflection.KindBoolean,
		reflection.KindObject, reflection.KindEnum:
		// AtomicRunType default `{code: undefined, type: 'S'}`.
		// Finalize collapses empty bodies to `return v` + noop flag.
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindNever:
		// Unsupported leaf — walker latches, renderer emits alwaysThrow
		// factory keyed by PJ001.
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindBigInt:
		// ref: nodes/atomic/bigInt.ts:20 — `v.toString()`.
		// Reassign so the mutated value is what gets returned.
		return RTCode{Code: v + " = " + v + ".toString()", Type: CodeE}

	case reflection.KindSymbol:
		// Unsupported — symbol identity does not survive a JSON
		// round-trip (Symbol("x") !== Symbol("x")), so the previous
		// "Symbol:" + description encoding was lossy by construction.
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindRegexp:
		// Unsupported — a RegExp is a pattern the receiver would run, not data;
		// it is dropped from the wire like a function (DataOnly strips it).
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindVoid:
		// ref: nodes/atomic/void.ts:20 — `v = undefined`.
		return RTCode{Code: v + " = undefined", Type: CodeE}

	case reflection.KindClass:
		// Date prepareForJson is a noop (Date has its own toJSON()).
		// User classes (SubKindNone) flow through the object emit —
		// class.ts extends InterfaceRunType, same emit body.
		// Map / Set materialise their iterable contents into an Array
		// so JSON.stringify has a serializable form. NonSerializable
		// (Int8Array, WeakMap, …) throws — the
		// NonSerializableRunType.emitPrepareForJson at
		// nodes/native/nonSerializable.ts:24 raises the same message.
		if reflection.IsTemporalSubKind(rt.SubKind) {
			// Like Date: no-op — JSON.stringify invokes the type's toJSON().
			return RTCode{Code: "", Type: CodeS}
		}
		switch rt.SubKind {
		case reflection.SubKindDate:
			return RTCode{Code: "", Type: CodeS}
		case reflection.SubKindNone:
			structural := emitObjectJsonChildren(rt, ctx)
			return wrapPrepareWithClassSerializer(rt, ctx, v, structural)
		case reflection.SubKindMap, reflection.SubKindSet:
			return emitNativeIterablePrepareForJson(rt, ctx, v)
		case reflection.SubKindNonSerializable:
			return RTCode{Code: "", Type: CodeNS}
		}
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindPromise:
		// Unsupported — async value, can't be sampled synchronously.
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindObjectLiteral:
		return emitObjectJsonChildren(rt, ctx)

	case reflection.KindProperty, reflection.KindPropertySignature:
		return emitPropertyPrepareForJson(rt, ctx, v)

	case reflection.KindIndexSignature:
		return emitIndexSignaturePrepareForJson(rt, ctx, v)

	case reflection.KindTuple:
		return emitTuplePrepareForJson(rt, ctx, v)

	case reflection.KindTupleMember:
		return emitTupleMemberPrepareForJson(rt, ctx, v)

	case reflection.KindFunction, reflection.KindMethod,
		reflection.KindMethodSignature, reflection.KindCallSignature:
		// ref: nodes/function/function.ts:83-85 —
		// `emitPrepareForJson(): RTCode { throw new Error('Compile
		// function PrepareForJson not supported, call compileParams
		// or compileReturn instead.'); }`. Functions as ROOT or as a
		// union member surface this throw; object/property children
		// of function type are filtered out by the parent emit (see
		// emitObjectPrepareForJson / emitPropertyPrepareForJson) and
		// never reach this arm. Tuple-member also filters via
		// isFunctionLikeKind.
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindUnion:
		// Unions encode via the flat-union wire shape (see union_flat.go) —
		// object members merge into a `[-1, mergedObject]` envelope so
		// encode skips the per-member validate walk; atomic members keep
		// the `[memberIndex, value]` shape under an all-or-nothing wrap
		// rule. The non-flat per-member envelope was retired after
		// benchmarks showed flat wins on every union with object
		// members and ties everywhere else.
		return emitUnionPrepareForJsonFlat(rt, ctx, v)

	case reflection.KindIntersection:
		// Defensive noop — intersections should be pre-resolved by the
		// type checker. See Supports's comment for details.
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindTemplateLiteral:
		// String-flavoured at runtime — noop.
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindLiteral:
		// ref: nodes/atomic/literal.ts:77 — defers to the underlying
		// kind's emit (`getRunTypeForLiteral(comp).emitPrepareForJson(comp)`).
		// Inline the dispatch here: bigint / symbol / regexp literals
		// behave like the bare kind; primitive literals are noops.
		return emitLiteralPrepareForJson(rt, v)

	case reflection.KindArray:
		// ref: nodes/member/array.ts:emitPrepareForJson. Allocates an
		// index counter, sets the child accessor (`v[i0]`) so the
		// element's CompileChild adopts the subscript, then composes:
		//
		//   for (let i0 = 0; i0 < v.length; i0++) {<childCode>}
		//
		// The child's emit is responsible for the per-element mutation
		// (e.g. bigint child returns `v[i0] = v[i0].toString()`). Empty
		// child code collapses the whole loop to a noop. Non-serializable
		// element kinds (Symbol[] / Function[]) return CodeNS from
		// their own Emit arm — that propagates up here and the walker
		// latches the child as UnsupportedLeaf, so the renderer emits
		// alwaysThrow keyed off the child's kind.
		if rt.Child == nil {
			return RTCode{Code: "", Type: CodeS}
		}
		return emitElementLoop(rt.Child, ctx, v, "0")
	}
	return RTCode{Code: "", Type: CodeNS}
}

// emitLiteralPrepareForJson mirrors literal.ts:77 — defers to
// the base kind. The Go side knows the literal's primitive flavour via
// Flags ("bigint", "symbol") and Literal shape (regexp envelope vs
// primitive).
func emitLiteralPrepareForJson(rt *reflection.RunType, v string) RTCode {
	switch literalFlavour(rt) {
	case litBigInt:
		return RTCode{Code: v + " = " + v + ".toString()", Type: CodeE}
	case litSymbol:
		return RTCode{Code: v + " = 'Symbol:' + (" + v + ".description || '')", Type: CodeE}
	}
	// Primitive literal (number / string / boolean / null) — noop.
	return RTCode{Code: "", Type: CodeS}
}

// emitObjectJsonChildren mirrors
// nodes/collection/interface.ts:emitPrepareForJson — iterate non-skip
// children, collect each child's emit, join with `;`. Children that
// are method-shaped or static are dropped (getRTChildren).
// A child returning CodeNS propagates upward (unsupported descendant
// short-circuits the whole entry). Shared verbatim by the restore side
// (emitRestoreFromJson is the same walk — the per-property
// encode/decode difference lives in the child emits).
func emitObjectJsonChildren(rt *reflection.RunType, ctx *EmitContext) RTCode {
	// A callable interface is function-like (DataOnly = never); treat it like a
	// bare function (alwaysThrow at root, dropped at a property), not an object.
	if objectHasCallSignature(rt, ctx) {
		return RTCode{Code: "", Type: CodeNS}
	}
	// Publish the named-property set so an index signature's for-in loop skips
	// declared keys — those are transformed by their OWN per-property emit (or
	// left as-is), never by the index value's transform. Without this the index
	// transform corrupts a named prop whose type differs from the index value
	// (e.g. a `number` prop under a `[k: number]: bigint` index — G1). The
	// prepareForJsonSafe (clone) path already does this via its declared-key
	// skip; this brings the mutate (prepareForJson) and restore (restoreFromJson)
	// walks into line. Shared by both, since they share this object walk.
	publishSiblingNamedKeysForIndexSig(rt, ctx)
	var parts []string
	seenIndexValueIDs := map[string]bool{}
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
		// Dedup split index signatures. A `[k: string|number|symbol]: U` key is
		// split by the resolver into one index sig per kind, all sharing value
		// type U. Each emits a `for…in` sweep, but for…in enumerates EVERY own
		// string key regardless of the declared key kind, so two sweeps over the
		// same value type would double-process each dynamic key — and these
		// codecs MUTATE in place, so the second pass re-reads an already-
		// transformed value (double-wrap on encode, "invalid union index" on
		// decode). One sweep per distinct value type is correct and sufficient.
		if resolved.Kind == reflection.KindIndexSignature {
			valueID := indexSigValueID(resolved, ctx)
			if valueID != "" {
				if seenIndexValueIDs[valueID] {
					continue
				}
				seenIndexValueIDs[valueID] = true
			}
		}
		childRT := ctx.CompileChild(child, CodeS)
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code == "" {
			continue
		}
		parts = append(parts, childRT.Code)
	}
	if len(parts) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	return RTCode{Code: strings.Join(parts, ";"), Type: CodeS}
}

// indexSigValueID returns the structural id of an index signature's VALUE type,
// used to dedup split index signatures (`[k: string|number|symbol]: U` → several
// sigs sharing value type U) so the codec emits one for-in sweep per value type.
func indexSigValueID(rt *reflection.RunType, ctx *EmitContext) string {
	if rt.Child == nil {
		return ""
	}
	value := ctx.ResolveRef(rt.Child)
	if value == nil {
		return ""
	}
	return value.ID
}

// jsonStringifyLeaks reports whether `JSON.stringify` serializes a dropped value
// AS DATA (a plain object) instead of omitting it — true for Promise and the
// non-serializable natives (typed arrays / ArrayBuffer / DataView, all
// SubKindNonSerializable), false for symbol / function / never (which
// JSON.stringify drops or which carry no runtime value). The mutate
// prepareForJson path serializes through the live object, so it must `delete`
// the leaking kinds to match the data-only projection that clone / direct /
// binary already produce.
func jsonStringifyLeaks(resolved *reflection.RunType) bool {
	if resolved == nil {
		return false
	}
	switch resolved.Kind {
	case reflection.KindPromise:
		return true
	case reflection.KindClass:
		return resolved.SubKind == reflection.SubKindNonSerializable
	}
	return false
}

// emitPropertyPrepareForJson mirrors
// nodes/member/property.ts:emitPrepareForJson. Sets the child
// accessor (`v.<name>` / `v["name"]`), recurses, optionally wraps
// with the undefined-guard for optional properties.
func emitPropertyPrepareForJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if strippedPropertyDrop(resolved, rt.Name, ctx) {
		// Directly DataOnly-stripped value (symbol / function / Promise / never /
		// non-serializable native) — drop the slot, matching
		// `DataOnly<{a: symbol}>` = `{}`. The mutate strategy serializes via the
		// live object with `JSON.stringify`, which DROPS symbol / function /
		// undefined values natively but SERIALIZES a Promise / typed array /
		// ArrayBuffer as a plain object — so those must be `delete`d to match the
		// data-only projection (and the clone / direct / binary output).
		if jsonStringifyLeaks(resolved) {
			return RTCode{Code: "delete " + propertyAccessor(v, rt.Name, rt.IsSafeName), Type: CodeS}
		}
		return RTCode{Code: "", Type: CodeS}
	}
	accessor := propertyAccessor(v, rt.Name, rt.IsSafeName)
	ctx.SetChildAccessor(accessor)
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		// The value is NOT directly stripped (caught above). A DataOnly-stripped
		// leaf reached through a propagating slot (symbol[], Map<string,symbol>)
		// fails the object; any other unsupported kind is absorbed (F3). See
		// propertyChildFailed.
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

// emitIndexSignaturePrepareForJson mirrors
// nodes/member/indexProperty.ts:emitPrepareForJson — for-in over keys
// invoking the child's emit on each. Template-literal key constraints
// add a per-key regex.test skip; without one, every key is processed.
func emitIndexSignaturePrepareForJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	// The IndexSignatureRunType.skipRT (indexProperty.ts:30-36)
	// drops symbol-keyed sigs from every RT fn except toJSCode.
	// for-in doesn't enumerate symbol keys anyway, so the loop body
	// would be dead, but matching the emit shape avoids
	// corrupting unrelated string/number keys when the symbol-keyed
	// value type is non-noop (e.g. `[k: symbol]: Date` running
	// `new Date(v[k])` over every enumerable key).
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
	// Skip declared sibling keys — they own their own transform (G1).
	body += siblingNamedSkipCode(rt, ctx, keyVar)
	if keyRegexVar != "" {
		body += "if (!" + keyRegexVar + ".test(" + keyVar + ")) continue;"
	}
	body += childRT.Code + "}"
	return RTCode{Code: body, Type: CodeS}
}

// emitTuplePrepareForJson mirrors
// nodes/collection/tuple.ts:emitPrepareForJson — iterate tuple members,
// emit each one's code, join with `;`. Empty tuple → noop.
func emitTuplePrepareForJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
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

// emitTupleMemberPrepareForJson mirrors
// nodes/member/tupleMember.ts:emitPrepareForJson. Sets the element
// accessor `v[<position>]`, then composes:
//
//   - non-rest, non-optional: pass child code through unchanged
//   - non-rest, optional:
//     `if (v[i] === undefined) { if (v.length > i) v[i] = null } else { <childCode> }`
//     (replace undefined slots with null so the array survives JSON
//     without losing length — JSON.stringify renders [, , 1] as [null,
//     null, 1] in some engines and the inverse round-trip diverges)
//   - rest: for-loop iterating from position to v.length, applying
//     child emit on each element
func emitTupleMemberPrepareForJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if resolved := ctx.ResolveRef(rt.Child); resolved == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	// Function-typed tuple slots fall through to CompileChild — the
	// function arm returns CodeNS, the walker latches the leaf, and the
	// renderer surfaces an alwaysThrow factory. Tuple slots are
	// positional (no absorb), so dropping silently would emit a lossy
	// validator.
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
		optionalCode := "if (" + accessor + " === undefined) {if (" + v + ".length > " + idxLit + ") " + accessor + " = null}"
		if childRT.Code == "" {
			return RTCode{Code: optionalCode, Type: CodeS}
		}
		return RTCode{Code: optionalCode + " else {" + childRT.Code + "}", Type: CodeS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	return childRT
}

// unionMemberValidateCheck returns a JS expression that checks whether
// the current value (`v`) satisfies `member`'s type. Mirrors the
// `getChildValidateWithLooseCheck` (union.ts:56) — the union's dispatch
// runs each member's validate in declaration order (or safe order),
// taking the first match.
//
// Uses a cross-fn lookup into the validate cache via context-item
// declaration. The `?.fn(v) ?? true` fallback handles noop kinds
// (any / unknown) whose validate factories don't exist — their runtime
// semantic is "always passes".
//
// For all-optional object members (weak types in TS), the bare validate
// would match ANY object (no required props to fail on), so an input
// like `{c: 1n}` against union `... | {d?: string}` would incorrectly
// dispatch to the {d?} arm. Mirror the getChildValidateWithLooseCheck
// (union.ts:56-78) by appending a property-presence gate from
// looseCheckGate — TypeScript's actual weak-type semantic requires
// at least one of the member's own props to be present, or the value
// to be an empty object.
func unionMemberValidateCheck(member *reflection.RunType, ctx *EmitContext, v string) string {
	// Fast path: inline the check for a SIMPLE leaf-atomic member
	// (`typeof v === 'string'`, `v === null`, `v instanceof Date`, a literal /
	// enum `===` chain, …) instead of importing and calling the cross-family
	// `val_<member>` cache entry. The inlined expression is byte-identical to
	// that entry's `fn` body — it comes from the same ValidateEmitter — so it
	// is semantically exact, but it costs no getRT lookup, no cross-family
	// SoftDep edge, and no `?.fn(v) ?? true` call, and lets the `val_<member>`
	// entry be elided entirely when nothing else demands it. Format-branded and
	// compound members (which hoist a context item or recurse through
	// CompileChild) fall through to the cache path below. Leaf kinds are never
	// object-like, so looseCheckGate never applies to them.
	if inlined, ok := tryInlineLeafValidateCheck(member, ctx, v); ok {
		return "(" + inlined + ")"
	}
	validateHash := operations.PlainHash("validate") + "_" + member.ID
	ctx.registerRTLookup(validateHash)
	base := "(" + validateHash + "?.fn(" + v + ") ?? true)"
	gate := looseCheckGate(member, ctx, v)
	if gate == "" {
		return base
	}
	return "(" + base + " && " + gate + ")"
}

// tryInlineLeafValidateCheck returns the inline isType expression for `member`
// against accessor `v` when `member` is a self-contained leaf whose validate
// emit is a single JS expression with NO context vars / helper functions and
// NO recursion into children — i.e. exactly the case that can be spliced into
// an `if (…)` guard. Returns ("", false) otherwise, so the caller keeps the
// cross-family cache reference.
//
// It reuses ValidateEmitter.emitKindDefault (the same code that builds the
// cached `val_<member>` body) under a throwaway EmitContext whose value var is
// `v`. That is safe ONLY because the gated leaf kinds read solely `ctx.Vλl`
// (plus the walker's read-only variant options for literals) and never mutate
// the walker — no NextLocalVar, no SetContextItem, no CompileChild,
// no registerRTLookup, no EmitDiagnostic. isInlinableLeafValidateKind enforces
// that set; anything outside it (objects, arrays, tuples, unions, Map/Set,
// template literals, format-branded leaves) keeps the cache path.
func tryInlineLeafValidateCheck(member *reflection.RunType, ctx *EmitContext, v string) (string, bool) {
	if !isInlinableLeafValidateKind(member) {
		return "", false
	}
	sub := &EmitContext{Vλl: v, walker: ctx.walker}
	rt := ValidateEmitter{}.emitKindDefault(member, sub, CodeE)
	// Only a real, single-expression check is inlinable. Empty / CodeNS means
	// unsupported (keep the cache path); a bare `true` / `false` carries no
	// discriminating power, so leave those to the cache path's `?? true`
	// noop semantics rather than baking a constant into the dispatch.
	if rt.Type != CodeE || rt.Code == "" || rt.Code == "true" || rt.Code == "false" {
		return "", false
	}
	return rt.Code, true
}

// isInlinableLeafValidateKind reports whether member's validate emit is a
// self-contained single-expression LEAF — safe to inline into a union
// dispatch guard (see tryInlineLeafValidateCheck). Excludes: format-branded
// members (their EmitValidateCheck hoists a regex / pure-fn context item);
// compound kinds that recurse through CompileChild (objectLiteral, plain
// class, array, tuple/tupleMember, union, property/index-signature); Map / Set
// (CompileChild over elements); NonSerializable (CodeNS); template literals
// (hoist a regex context item); and any / unknown / never / symbol (a constant
// or diagnostic-emitting arm, no discriminating value).
func isInlinableLeafValidateKind(member *reflection.RunType) bool {
	if member == nil || member.FormatAnnotation != nil {
		return false
	}
	switch member.Kind {
	case reflection.KindString, reflection.KindNumber, reflection.KindBoolean,
		reflection.KindBigInt, reflection.KindNull, reflection.KindUndefined,
		reflection.KindVoid, reflection.KindRegexp, reflection.KindObject,
		reflection.KindLiteral, reflection.KindEnum, reflection.KindPromise,
		reflection.KindFunction, reflection.KindMethod,
		reflection.KindMethodSignature, reflection.KindCallSignature:
		return true
	case reflection.KindClass:
		// Only the atomic, leaf-emit class subkinds: Date and the Temporal
		// builtins emit a bare `instanceof` with no CompileChild. Map / Set
		// iterate their elements (CompileChild); a plain user class emits the
		// object AND-chain (CompileChild); NonSerializable emits CodeNS.
		return member.SubKind == reflection.SubKindDate || reflection.IsTemporalSubKind(member.SubKind)
	}
	return false
}

// looseCheckGate mirrors the getChildValidateWithLooseCheck
// (union.ts:56-78). Returns the additional property-presence gate
// when a union member is an all-optional object-like type with no
// index signature; returns "" when no gate is needed (member is not
// object-like, has at least one required prop, or carries an index
// signature). The gate shape is:
//
//	(("p1" in v) || ("p2" in v) || ... || Object.keys(v).length === 0)
//
// which encodes TS's weak-type rule: a value matches an all-optional
// shape only if at least one of its declared props is present OR the
// value is the empty object.
func looseCheckGate(member *reflection.RunType, ctx *EmitContext, v string) string {
	if member.Kind != reflection.KindObjectLiteral && member.Kind != reflection.KindClass {
		return ""
	}
	var propNames []string
	for _, childRef := range member.Children {
		child := ctx.ResolveRef(childRef)
		if child == nil {
			continue
		}
		// Index signatures absorb arbitrary keys — TS doesn't require
		// any specific prop to be present, so the loose-check doesn't
		// apply.
		if child.Kind == reflection.KindIndexSignature {
			return ""
		}
		if child.Kind != reflection.KindProperty && child.Kind != reflection.KindPropertySignature {
			continue
		}
		// One required prop means the bare validate already enforces
		// presence — no extra gate needed.
		if !child.Optional {
			return ""
		}
		propNames = append(propNames, child.Name)
	}
	if len(propNames) == 0 {
		return ""
	}
	parts := make([]string, 0, len(propNames)+1)
	for _, name := range propNames {
		parts = append(parts, "("+quoteJS(name)+" in "+v+")")
	}
	parts = append(parts, "Object.keys("+v+").length === 0")
	return "(" + strings.Join(parts, " || ") + ")"
}

// emitNativeIterablePrepareForJson handles Map / Set — mirrors
// nodes/native/Iterable.ts:49-65 emitPrepareForJson. For each entry,
// the wrapped child types (KindParameter wrappers in rt.Arguments
// carrying SubKindMapKey / SubKindMapValue / SubKindSetItem) get
// their own transform applied. The collected per-entry result is
// staged into a fresh array and v is rebound at the end so
// JSON.stringify sees the array form.
//
// Shape (Map with non-noop value or key, or Set with non-noop element):
//
//	const ml0 = [];
//	for (let e0 of v) {
//	  <key/element transform>; <value transform>;
//	  ml0.push(e0);
//	}
//	v = ml0
//
// Accessors:
//   - Set: the loop binding e0 IS the element (the
//     SetKeyRunType.skipSettingAccessor() returns true)
//   - Map: e0 is the [k, v] tuple; accessors are e0[0] (key) and
//     e0[1] (value) — mirrors MapKeyRunType / MapValueRunType
//     useArrayAccessor with index 0 / 1
//
// When every wrapped child compiles to empty (atomic-noop elements
// like Set<string> / Map<string, number>), fall back to the original
// shape `v = Array.from(v)` so the no-loop fast path is preserved
// for already-passing tests.
func emitNativeIterablePrepareForJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	isMap := rt.SubKind == reflection.SubKindMap
	innerTypes := iterableInnerTypes(rt, ctx)

	entryVar := ctx.NextLocalVar("e")
	var childCodes []string
	for i, innerType := range innerTypes {
		if innerType == nil {
			continue
		}
		accessor := entryVar
		if isMap {
			accessor = entryVar + "[" + strconv.Itoa(i) + "]"
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

	if len(childCodes) == 0 {
		return RTCode{Code: v + " = Array.from(" + v + ")", Type: CodeS}
	}

	resVar := ctx.NextLocalVar("ml")
	body := "const " + resVar + " = []; for (let " + entryVar + " of " + v + ") {" +
		strings.Join(childCodes, ";") + ";" + resVar + ".push(" + entryVar + ")} " +
		v + " = " + resVar
	return RTCode{Code: body, Type: CodeS}
}

// EmitDependencyCall mirrors ValidateEmitter's, with one twist: a
// prepareForJson dependency call mutates v INSIDE the inner function
// (e.g. `return v = v.toString()`) so the outer caller must capture
// the return value to actually see the transformed shape — `v[i0]`
// in the parent's frame won't auto-update from the inner function's
// local rebind. We wrap the call site with the assignment:
//
//	<vλl> = <childHash>.fn(<vλl>)
//
// For nested compounds (Date[][] etc.) the inner function mutates its
// argument array in place AND returns the same reference, so the
// outer assignment is a same-ref no-op semantically — but it KEEPS
// the same shape as the atomic-leaf case (e.g. `v[i0] = childHash.fn(v[i0])`
// where the leaf emits `return v = new Date(v)`), which lets the
// array emit treat dependency-call children identically to inline
// atomic children. Self-recursive calls drop the `.fn` indirection.
func (PrepareForJsonEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	return ctx.emitDepCall(childID, ctx.Vλl, ctx.Vλl)
}

// Finalize matches the handleFunctionReturn for the
// prepareForJson / restoreFromJson family (rtFnCompiler.ts:435):
// empty / identity bodies are rewritten to `return v` and the
// isNoop flag is set to true, but the factory is STILL emitted
// (createRTFunction wraps the body unconditionally). The
// renderer keeps every supported entry as a live factory so
// dep-call chains from parents resolve cleanly — a parent's
// `<childHash>.fn(v[i])` must hit a real fn, even when that fn is
// the identity. Payload cost is ~30 bytes per noop factory.
//
// The `00JsonOnly.spec.ts` asserts `isNoop === true` for shapes
// where no JSON transformation is required (interfaces of primitive
// strings/numbers, tuples of the same, etc.). The flag is exposed
// to consumers on the RTCompiledFn entry so they can short-circuit
// dispatch when round-tripping a noop value.
func (PrepareForJsonEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "return v" {
		return "return v", true
	}
	return code, false
}
