package typefunctions

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// PrepareForJsonEmitter implements the `prepareForJson` rt function: it transforms a runtime value
// in place into a JSON-serializable form (a BigInt becomes a decimal string, …); the downstream
// JSON.stringify handles Dates via their built-in toJSON() contract.
// Paired with RestoreFromJsonEmitter — the round-trip
// `restoreFromJsonMutate(JSON.parse(JSON.stringify(prepareForJson(v))))` must deep-equal v.
type PrepareForJsonEmitter struct{}

func (PrepareForJsonEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

func (PrepareForJsonEmitter) Supports(rt *reflection.RunType) bool {
	return jsonWireSupports(rt)
}

func (PrepareForJsonEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// IsNoopType — external children whose prepare entry is the identity compose as empty code (no dep
// call, no import). See noop_types.go for the soundness contract.
func (PrepareForJsonEmitter) IsNoopType(rt *reflection.RunType, ctx *EmitContext) bool {
	return isNoopForPrepareJson(rt, ctx)
}

// NoopChildComposesAround — a slot the transform leaves alone adds nothing to the mutate walk.
func (PrepareForJsonEmitter) NoopChildComposesAround() {}

// ReturnName is `v`: prepareForJson mutates or rebinds the input value, then returns it.
func (PrepareForJsonEmitter) ReturnName() string {
	return "v"
}

// Emit dispatches the per-kind switch; most atomic kinds are noops.
// A non-noop atomic returns CodeE in the `v = <expression>` form rather than a bare expression, so
// the walker's expression-in-statement wrap appends `;` and v is really mutated before `return v`.
// Unsupported kinds emit CodeNS — the walker latches IsUnsupported and skips this entry's factory.
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
		// Finalize collapses these empty bodies to `return v` + the noop flag.
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindNever:
		// Unsupported leaf — the walker latches, the renderer emits alwaysThrow keyed by PJ001.
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindBigInt:
		// Reassign so the mutated value is what gets returned.
		return RTCode{Code: v + " = " + v + ".toString()", Type: CodeE}

	case reflection.KindSymbol:
		// Unsupported — symbol identity does not survive a JSON round-trip
		// (Symbol("x") !== Symbol("x")), so a description-only encoding is lossy by construction.
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindRegexp:
		// Unsupported — a RegExp is a pattern the receiver would run, not data;
		// it is dropped from the wire like a function (DataOnly strips it).
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindVoid:
		return RTCode{Code: v + " = undefined", Type: CodeE}

	case reflection.KindClass:
		// Date needs no transform (it has its own toJSON()); Map / Set materialise their iterable
		// contents into an Array so JSON.stringify has a serializable form.
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
		// Unsupported: the value is not available synchronously, so there is nothing to write.
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
		// Only a ROOT or union-member function reaches this arm: object / property children of
		// function type are filtered out by the parent emit, tuple members by isFunctionLikeKind.
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindUnion:
		// Flat-union wire shape (union_flat.go): object members merge into a `[-1, mergedObject]`
		// envelope so encode skips the per-member validate walk; atomic members keep the
		// `[memberIndex, value]` shape under an all-or-nothing wrap rule. The non-flat per-member
		// envelope was retired after benchmarks showed flat wins or ties everywhere.
		return emitUnionPrepareForJsonFlat(rt, ctx, v)

	case reflection.KindIntersection:
		// Defensive noop — intersections are pre-resolved by the checker (see jsonWireSupports).
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindTemplateLiteral:
		// String-flavoured at runtime — noop.
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindLiteral:
		// A literal defers to its underlying kind's transform; primitive literals are noops.
		return emitLiteralPrepareForJson(rt, v)

	case reflection.KindArray:
		// The child's emit owns the per-element mutation (a bigint child returns
		// `v[i0] = v[i0].toString()`); see emitElementLoop for the empty / CodeNS child rules.
		if rt.Child == nil {
			return RTCode{Code: "", Type: CodeS}
		}
		return emitElementLoop(rt.Child, ctx, v, "0")
	}
	return RTCode{Code: "", Type: CodeNS}
}

// emitLiteralPrepareForJson encodes bigint and symbol literals; a primitive literal is a noop.
func emitLiteralPrepareForJson(rt *reflection.RunType, v string) RTCode {
	switch literalFlavour(rt) {
	case litBigInt:
		return RTCode{Code: v + " = " + v + ".toString()", Type: CodeE}
	case litSymbol:
		// A rebuilt Symbol() is never the symbol the literal type names, so it is unsupported like the bare kind.
		return RTCode{Code: "", Type: CodeNS}
	}
	return RTCode{Code: "", Type: CodeS}
}

// emitObjectJsonChildren is the object walk the restore side shares verbatim — the per-property
// encode / decode difference lives in the child emits. A child returning CodeNS short-circuits the
// whole entry.
func emitObjectJsonChildren(rt *reflection.RunType, ctx *EmitContext) RTCode {
	// A callable interface is function-like (DataOnly = never); treat it like a
	// bare function (alwaysThrow at root, dropped at a property), not an object.
	if objectHasCallSignature(rt, ctx) {
		return RTCode{Code: "", Type: CodeNS}
	}
	// Publish the named-property set so an index signature's for-in loop skips declared keys: they
	// are transformed by their OWN per-property emit, never by the index value's transform, which
	// would corrupt a named prop whose type differs from the index value (a `number` prop under a
	// `[k: number]: bigint` index — G1). The clone path already skips declared keys; this brings
	// the mutate and restore walks into line, since they share this object walk.
	publishSiblingNamedKeysForIndexSig(rt, ctx)
	var parts []string
	seenIndexValueIDs := map[string]bool{}
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
		// Dedup split index signatures: the resolver splits `[k: string|number|symbol]: U` into one
		// sig per key kind, but a `for…in` sweep enumerates EVERY own string key whatever the
		// declared key kind, so two sweeps over the same value type double-process each dynamic key
		// — and these codecs MUTATE in place (double-wrap on encode, "invalid union index" on
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

// indexSigValueID returns the structural id of an index signature's VALUE type, the key the object
// walk dedups split index signatures by.
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

// jsonStringifyLeaks reports whether `JSON.stringify` serializes a dropped value AS DATA (a plain
// object) instead of omitting it: true for Promise and the non-serializable natives, false for
// symbol / function / never. The mutate prepareForJson path serializes through the live object, so
// it must `delete` the leaking kinds to match the data-only projection clone / direct / binary
// already produce.
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

func emitPropertyPrepareForJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if strippedPropertyDrop(resolved, rt.Name, ctx) {
		// Directly DataOnly-stripped value — drop the slot, matching `DataOnly<{a: symbol}>` = `{}`.
		// `JSON.stringify` drops symbol / function / undefined natively but SERIALIZES a Promise /
		// typed array / ArrayBuffer as a plain object, so those must be `delete`d instead.
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
		// A DataOnly-stripped leaf reached through a propagating slot (symbol[],
		// Map<string,symbol>) fails the object; any other unsupported kind is absorbed (F3).
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

func emitIndexSignaturePrepareForJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	// Symbol-keyed sigs are skipped by every rt fn but toJSCode. for-in does not enumerate symbol
	// keys anyway, so the loop body would be dead, and emitting it would corrupt unrelated string /
	// number keys when the value type is non-noop (`[k: symbol]: Date` running `new Date(v[k])`
	// over every enumerable key).
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

// emitTupleMemberPrepareForJson replaces an undefined optional slot with null so the array survives
// JSON without losing length: a hole renders as null anyway and the inverse round-trip diverges.
func emitTupleMemberPrepareForJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if resolved := ctx.ResolveRef(rt.Child); resolved == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	// Function-typed tuple slots fall through to CompileChild and latch as unsupported: tuple slots
	// are positional (no absorb), so dropping one silently would emit a lossy codec.
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

// unionMemberValidateCheck returns a JS expression testing whether `v` satisfies `member`'s type,
// through a cross-fn lookup into the validate cache; the `?.fn(v) ?? true` fallback covers noop
// kinds (any / unknown) whose validate factory does not exist and which always pass.
// An all-optional object member (a TS weak type) has no required prop to fail on, so its bare
// validate would match ANY object (`{c: 1n}` dispatching to the `{d?: string}` arm); looseCheckGate
// adds the property-presence gate TypeScript's weak-type rule actually requires.
func unionMemberValidateCheck(member *reflection.RunType, ctx *EmitContext, v string) string {
	// Fast path: a SIMPLE leaf-atomic member inlines its check instead of calling the cross-family
	// `val_<member>` cache entry. The inlined expression comes from the same ValidateEmitter, so it
	// is byte-identical to that entry's `fn` body, but it costs no getRT lookup, no cross-family
	// SoftDep edge and no `?.fn(v) ?? true` call, and lets `val_<member>` be elided when nothing
	// else demands it. Leaf kinds are never object-like, so looseCheckGate never applies to them.
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

// tryInlineLeafValidateCheck returns the inline isType expression for `member` against accessor `v`
// when member is a self-contained leaf whose validate emit is a single expression with no context
// vars and no recursion — the only case that can be spliced into an `if (…)` guard.
// It reuses ValidateEmitter.emitKindDefault under a throwaway EmitContext, which is safe ONLY
// because the gated leaf kinds read solely `ctx.Vλl` and never mutate the walker (no NextLocalVar,
// SetContextItem, CompileChild, registerRTLookup or EmitDiagnostic).
func tryInlineLeafValidateCheck(member *reflection.RunType, ctx *EmitContext, v string) (string, bool) {
	if !isInlinableLeafValidateKind(member) {
		return "", false
	}
	sub := &EmitContext{Vλl: v, walker: ctx.walker}
	rt := ValidateEmitter{}.emitKindDefault(member, sub, CodeE)
	// Empty / CodeNS means unsupported, and a bare `true` / `false` carries no discriminating
	// power: leave both to the cache path's `?? true` noop rather than baking in a constant.
	if rt.Type != CodeE || rt.Code == "" || rt.Code == "true" || rt.Code == "false" {
		return "", false
	}
	return rt.Code, true
}

// isInlinableLeafValidateKind reports whether member's validate emit is a self-contained
// single-expression LEAF, safe to inline into a union dispatch guard (tryInlineLeafValidateCheck).
// Excluded: format-branded members and template literals (they hoist a context item), compound
// kinds and Map / Set (they recurse through CompileChild), NonSerializable (CodeNS), and
// any / unknown / never / symbol (a constant or diagnostic arm, no discriminating value).
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
		// Date and the Temporal builtins emit a bare `instanceof` with no CompileChild; Map / Set
		// and a plain user class recurse through CompileChild, NonSerializable emits CodeNS.
		return member.SubKind == reflection.SubKindDate || reflection.IsTemporalSubKind(member.SubKind)
	}
	return false
}

// looseCheckGate returns the extra property-presence gate for an all-optional object-like union
// member, "" when none is needed. It encodes TS's weak-type rule: a value matches an all-optional
// shape only if one of its declared props is present OR the value is the empty object.
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
		// Index signatures absorb arbitrary keys — TS requires no specific prop to be present.
		if child.Kind == reflection.KindIndexSignature {
			return ""
		}
		if child.Kind != reflection.KindProperty && child.Kind != reflection.KindPropertySignature {
			continue
		}
		// One required prop means the bare validate already enforces presence.
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
		parts = append(parts, "("+namedPropertyInTest(name, v)+")")
	}
	parts = append(parts, "Object.keys("+v+").length === 0")
	return "(" + strings.Join(parts, " || ") + ")"
}

// emitNativeIterablePrepareForJson stages transformed Map / Set entries into a fresh array and
// rebinds v to it, so JSON.stringify sees an array form. Accessors: a Set's loop binding IS the
// element, a Map's is the [key, value] tuple, so its wrapped children read e0[0] and e0[1].
// When every wrapped child compiles to empty (Set<string>, Map<string, number>) the whole body
// collapses to `v = Array.from(v)`, keeping the no-loop fast path.
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

// EmitDependencyCall wraps the call as `<vλl> = <childHash>.fn(<vλl>)`: the child rebinds its own
// local, so the caller must capture the return to see the transform (`v[i0]` in the parent's frame
// does not auto-update). For a nested compound the child mutates in place and returns the same
// reference, making the assignment a same-ref no-op, but keeping ONE shape lets the array emit
// treat dep-call children exactly like inline atomic ones. Self-recursive calls drop the `.fn`.
func (PrepareForJsonEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	return ctx.emitDepCall(childID, ctx.Vλl, ctx.Vλl)
}

// Finalize rewrites an empty / identity body to `return v` with isNoop true, but the factory is
// STILL emitted: a parent's `<childHash>.fn(v[i])` must hit a real fn even when that fn is the
// identity, at ~30 bytes per noop factory. The flag reaches consumers on the RTCompiledFn entry so
// they can short-circuit dispatch when round-tripping a noop value.
func (PrepareForJsonEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "return v" {
		return "return v", true
	}
	return code, false
}
