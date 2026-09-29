package typefunctions

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// RemoveUnknownKeysEmitter rebuilds the declared shape, never `{...v}`, so `clone(x) !== x` at every object. The
// result is typed `T`: each declared member is copied, shared per `sharedValues`, or the factory always throws. A
// class copy keeps the prototype but never runs the constructor, so `#private` fields refuse (RUK005). A symbol-keyed
// property refuses (RUK004): the code cannot name the symbol, and copying every own symbol would keep undeclared
// ones; a `[k: symbol]: V` signature declares them all. `overrideRemoveUnknownKeys<T>()` is the escape hatch.
// No key-count gate: on V8, `Object.keys(x).length === N` costs more than the rebuild (1.6x slower).
type RemoveUnknownKeysEmitter struct {
	shared sharedValuesMode
}

// sharedValuesMode is the `sharedValues` option; each mode is its own family, so nested entries follow it too.
type sharedValuesMode int

const (
	sharedValuesWarn   sharedValuesMode = iota // option absent: shared, RUK010 / RUK015 Warning
	sharedValuesShare                          // 'share': shared, RUK016 Info
	sharedValuesRefuse                         // 'refuse': the factory always throws, RUK006
)

func (RemoveUnknownKeysEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports mirrors the unknown-keys family gate: functions and promises reach Emit, which shares or refuses them per `sharedValues`.
func (RemoveUnknownKeysEmitter) Supports(rt *reflection.RunType) bool {
	return unknownKeysSupports(rt)
}

func (RemoveUnknownKeysEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// IsNoopType: identity is sound only when the reachable subtree is immutable; a mutable or shared one needs a body.
func (RemoveUnknownKeysEmitter) IsNoopType(rt *reflection.RunType, ctx *EmitContext) bool {
	return isNoopForRemoveUnknownKeys(rt, ctx)
}

func (RemoveUnknownKeysEmitter) ReturnName() string {
	return "v"
}

// EmitDependencyCall is an expression, never a mutation statement: the child factory RETURNS the cloned
// value and the parent composes it into an expression slot, mirroring PrepareForJsonCloneEmitter.
func (RemoveUnknownKeysEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	return ctx.emitDepCall(childID, ctx.Vλl, "")
}

// Finalize collapses an empty or identity body to `return v` plus isNoop, so the JS-side noop fastpath
// short-circuits dispatch.
func (RemoveUnknownKeysEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "return v" {
		return "return v", true
	}
	return code, false
}

// Emit returns CodeE, a self-returning CodeRB, or empty CodeS, meaning the child's clone IS its accessor.
// Parents share or refuse a child that can only be shared before compiling it, so the shared arm is reached at the root.
func (emitter RemoveUnknownKeysEmitter) Emit(rt *reflection.RunType, ctx *EmitContext, _ CodeType) RTCode {
	if rt == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	if slot, shared := sharedValueSlot(rt, ctx); shared {
		if !emitter.shareOrRefuse(slot, "the value", rt, ctx) {
			return RTCode{Code: "", Type: CodeNS}
		}
		return RTCode{Code: "", Type: CodeS}
	}
	switch rt.Kind {

	case reflection.KindObjectLiteral:
		return emitter.emitObject(rt, ctx, v, false)

	case reflection.KindClass:
		switch rt.SubKind {
		case reflection.SubKindNone:
			// Keeps the prototype so `instanceof` survives; a custom serializer registration is JSON-only and does not apply.
			return emitter.emitObject(rt, ctx, v, true)
		case reflection.SubKindMap, reflection.SubKindSet:
			return emitter.emitNativeIterable(rt, ctx, v)
		case reflection.SubKindDate:
			// Dates are mutable (setTime & friends), so always re-wrap.
			return RTCode{Code: "new Date(" + v + ".getTime())", Type: CodeE}
		}
		if info, ok := reflection.TemporalInfoBySubKind(rt.SubKind); ok {
			// Immutable, but still a fresh instance: `clone(x).field !== x.field` must hold for every object-typed field.
			return RTCode{Code: "globalThis." + info.Builtin + ".from(" + v + ")", Type: CodeE}
		}
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindArray:
		return emitter.emitArray(rt, ctx, v)

	case reflection.KindTuple:
		return emitter.emitTuple(rt, ctx, v)

	case reflection.KindIndexSignature:
		// Bare index-signature dispatch (root reach-in); the object arm normally consumes sigs itself.
		return emitter.buildIndexObject(v, "{}", nil, nil, []*reflection.RunType{rt}, ctx)

	case reflection.KindUnion:
		return emitter.emitUnion(rt, ctx)

	// Immutable kinds (a bigint is not `.toString()`ed: no JSON projection here) and any / unknown / object are shared.
	default:
		return RTCode{Code: "", Type: CodeS}
	}
}

// sharedValueSlot reports a value the copy can only share, and its warning; a symbol is a primitive, so it is not here.
func sharedValueSlot(rt *reflection.RunType, ctx *EmitContext) (DiagSlot, bool) {
	if rt == nil {
		return "", false
	}
	if isFunctionLikeKind(rt.Kind) {
		return SlotFunctionPropDropped, true
	}
	switch rt.Kind {
	case reflection.KindPromise, reflection.KindRegexp:
		return SlotNonSerializablePropDropped, true
	case reflection.KindClass:
		if rt.SubKind == reflection.SubKindNonSerializable {
			return SlotNonSerializablePropDropped, true
		}
	case reflection.KindObjectLiteral:
		// A callable interface is a function with properties bolted on.
		if objectHasCallSignature(rt, ctx) {
			return SlotFunctionPropDropped, true
		}
	}
	return "", false
}

// shareOrRefuse returns false to refuse, with leaf latched so DiagCodeForLeaf names RUK006 and where.
func (emitter RemoveUnknownKeysEmitter) shareOrRefuse(slot DiagSlot, where string, leaf *reflection.RunType, ctx *EmitContext) bool {
	if emitter.shared == sharedValuesRefuse {
		refuseWith(leaf, ctx)
		return false
	}
	ctx.EmitDiagnosticSlot(slot, where)
	return true
}

// refuseWith latches leaf as the reason this entry always throws; the caller returns CodeNS.
func refuseWith(leaf *reflection.RunType, ctx *EmitContext) {
	if ctx.walker.UnsupportedLeaf == nil {
		ctx.walker.UnsupportedLeaf = leaf
	}
}

// propertyWhere names a member in a warning, in the user's words.
func propertyWhere(member *reflection.RunType) string {
	return "property `" + memberLabel(member) + "`"
}

// isPrototypeMember reports a class member the copy inherits from the prototype: a method or an accessor.
func isPrototypeMember(member *reflection.RunType) bool {
	if hasFlag(member.Flags, reflection.FlagAccessor) {
		return true
	}
	return member.Kind == reflection.KindMethod && !hasFlag(member.Flags, reflection.FlagField)
}

// coveredBySymbolSig reports a symbol-keyed property whose value type is exactly the symbol signature's.
func coveredBySymbolSig(member, symbolSig *reflection.RunType, ctx *EmitContext) bool {
	if symbolSig == nil || member.Child == nil || symbolSig.Child == nil {
		return false
	}
	if member.Kind != reflection.KindProperty && member.Kind != reflection.KindPropertySignature {
		return false
	}
	memberType, sigType := ctx.ResolveRef(member.Child), ctx.ResolveRef(symbolSig.Child)
	return memberType != nil && sigType != nil && memberType.ID == sigType.ID
}

// emitObject rebuilds an object literal or a class instance from its declared members.
func (emitter RemoveUnknownKeysEmitter) emitObject(rt *reflection.RunType, ctx *EmitContext, v string, asClass bool) RTCode {
	if asClass && hasFlag(rt.Flags, reflection.FlagPrivateFields) {
		refuseWith(rt, ctx)
		return RTCode{Code: "", Type: CodeNS}
	}
	var props []safePropEmit
	var indexSigs []*reflection.RunType
	var symbolSig *reflection.RunType
	for _, child := range objectMembers(rt) {
		if resolved := ctx.ResolveRef(child); resolved != nil && resolved.Kind == reflection.KindIndexSignature {
			indexSigs = append(indexSigs, resolved)
			if symbolSig == nil && isSymbolKeyedIndexSig(resolved, ctx) {
				symbolSig = resolved
			}
		}
	}
	for _, child := range objectMembers(rt) {
		resolved := ctx.ResolveRef(child)
		if resolved == nil || resolved.Kind == reflection.KindIndexSignature {
			continue
		}
		if resolved.IsStatic {
			ctx.EmitDiagnosticSlot(SlotStaticDropped, memberLabel(resolved))
			continue
		}
		// Writing `__proto__` into the clone's literal would set its prototype from the input.
		if reflection.IsUnsafePropertyName(resolved.Name) {
			ctx.EmitDiagnosticSlot(SlotUnsafeNamePropDropped, resolved.Name)
			continue
		}
		if asClass && isPrototypeMember(resolved) {
			// The copy inherits it; an own copy would shadow the prototype and change Object.keys. Advisory only.
			ctx.EmitDiagnosticSlot(SlotMethodDropped, memberLabel(resolved))
			continue
		}
		if reflection.IsSymbolKeyedName(resolved.Name) {
			// The symbol-signature walk copies it with the signature's value type, so only an identical type is safe.
			if coveredBySymbolSig(resolved, symbolSig, ctx) {
				continue
			}
			refuseWith(resolved, ctx)
			return RTCode{Code: "", Type: CodeNS}
		}
		accessor := propertyAccessor(v, resolved.Name, resolved.IsSafeName)
		shared := safePropEmit{
			name:       resolved.Name,
			isSafeName: resolved.IsSafeName,
			optional:   resolved.Optional,
			accessor:   accessor,
			expr:       accessor,
		}
		if isFunctionLikeKind(resolved.Kind) {
			// An object-literal method or a class function field is an own value: the copy shares it.
			if !emitter.shareOrRefuse(SlotFunctionPropDropped, propertyWhere(resolved), resolved, ctx) {
				return RTCode{Code: "", Type: CodeNS}
			}
			props = append(props, shared)
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
		if slot, opaque := sharedValueSlot(propResolved, ctx); opaque {
			if !emitter.shareOrRefuse(slot, propertyWhere(resolved), resolved, ctx) {
				return RTCode{Code: "", Type: CodeNS}
			}
			props = append(props, shared)
			continue
		}
		expr, ok := safeChildExpr(resolved.Child, accessor, ctx)
		if !ok {
			// Never absorbed: dropping the property would hand back a copy missing a declared member.
			return RTCode{Code: "", Type: CodeNS}
		}
		prop := safePropEmit{
			name:       resolved.Name,
			isSafeName: resolved.IsSafeName,
			optional:   resolved.Optional,
			accessor:   accessor,
			expr:       expr,
		}
		if isEnumerabilityGuarded(resolved) {
			prop.presenceGuard = propertyIsEnumerableGuard(v, resolved.Name)
		}
		props = append(props, prop)
	}

	newObject := "{}"
	if asClass {
		newObject = "Object.create(Object.getPrototypeOf(" + v + "))"
	}
	if len(indexSigs) > 0 || asClass {
		// A key matching no signature is dropped: sharing it would break clone(x) !== x.
		return emitter.buildIndexObject(v, newObject, props, collectSiblingNamedKeys(rt, ctx), indexSigs, ctx)
	}
	if len(props) == 0 {
		// No declared property: the exact shape is `{}` whatever v holds, stripping ALL extras.
		return RTCode{Code: "return {}", Type: CodeRB}
	}
	clone := buildSafeObjectClone(props, ctx)
	if clone.Type == CodeRB {
		// The mixed-optionality accumulator self-returns, so splice it directly as the body.
		return clone
	}
	return RTCode{Code: "return " + clone.Code, Type: CodeRB}
}

// buildIndexObject copies the index-signature keys onto newObject, then the declared props, which win any clash.
// Pattern arms take a matching key first, then the FIRST plain signature takes the rest: a later plain signature is
// a narrower key set (number under string) whose value type the first already covers.
func (emitter RemoveUnknownKeysEmitter) buildIndexObject(v, newObject string, props []safePropEmit, skipNames []string, indexSigs []*reflection.RunType, ctx *EmitContext) RTCode {
	var arms []indexArm
	symbolExpr := ""
	keyVar := ctx.NextLocalVar("k")
	symbolVar := ctx.NextLocalVar("s")
	for _, sig := range indexSigs {
		if sig.Child == nil {
			continue
		}
		isSymbolSig := isSymbolKeyedIndexSig(sig, ctx)
		if isSymbolSig && symbolExpr != "" {
			continue
		}
		accessor := v + "[" + keyVar + "]"
		if isSymbolSig {
			accessor = v + "[" + symbolVar + "]"
		}
		expr := accessor
		if slot, opaque := sharedValueSlot(ctx.ResolveRef(sig.Child), ctx); opaque {
			if !emitter.shareOrRefuse(slot, "index signature values", sig, ctx) {
				return RTCode{Code: "", Type: CodeNS}
			}
		} else {
			childExpr, ok := safeChildExpr(sig.Child, accessor, ctx)
			if !ok {
				return RTCode{Code: "", Type: CodeNS}
			}
			expr = childExpr
		}
		if isSymbolSig {
			symbolExpr = expr
			continue
		}
		arms = append(arms, indexArm{keyRegexVar: indexSignatureKeyRegexVar(sig, ctx), valueExpr: expr})
	}
	var builder strings.Builder
	builder.WriteString("const _r = " + newObject + ";")
	if len(arms) > 0 {
		writeIndexWalkOpen(&builder, v, keyVar, skipNames)
		for _, arm := range arms {
			if arm.keyRegexVar != "" {
				writePatternArm(&builder, keyVar, arm)
			}
		}
		for _, arm := range arms {
			if arm.keyRegexVar == "" {
				builder.WriteString("_r[" + keyVar + "] = " + arm.valueExpr + ";")
				break
			}
		}
		builder.WriteString("}")
	}
	if symbolExpr != "" {
		builder.WriteString("for (const " + symbolVar + " of Object.getOwnPropertySymbols(" + v + ")) {")
		builder.WriteString("if (Object.prototype.propertyIsEnumerable.call(" + v + ", " + symbolVar + ")) _r[" + symbolVar + "] = " + symbolExpr + ";")
		builder.WriteString("}")
	}
	writePropAssignments(&builder, props)
	builder.WriteString("return _r")
	return RTCode{Code: builder.String(), Type: CodeRB}
}

// elementExpr compiles one element slot, sharing (or refusing) a value the copy cannot rebuild.
func (emitter RemoveUnknownKeysEmitter) elementExpr(child *reflection.RunType, accessor, where string, ctx *EmitContext) (string, bool) {
	if resolved := ctx.ResolveRef(child); resolved != nil {
		if slot, opaque := sharedValueSlot(resolved, ctx); opaque {
			return accessor, emitter.shareOrRefuse(slot, where, resolved, ctx)
		}
	}
	return safeChildExpr(child, accessor, ctx)
}

// emitArray always returns a fresh array, even when elements clone to themselves: arrays are mutable.
func (emitter RemoveUnknownKeysEmitter) emitArray(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: v + ".slice()", Type: CodeE}
	}
	elemVar := ctx.NextLocalVar("e")
	expr, ok := emitter.elementExpr(rt.Child, elemVar, "array elements", ctx)
	if !ok {
		return RTCode{Code: "", Type: CodeNS}
	}
	if expr == elemVar {
		return RTCode{Code: v + ".slice()", Type: CodeE}
	}
	return RTCode{Code: v + ".map(function(" + elemVar + "){return " + expr + "})", Type: CodeE}
}

// emitTuple always returns a fresh array; optional slots keep `undefined`, no JSON `null` placeholder.
func (emitter RemoveUnknownKeysEmitter) emitTuple(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if len(rt.Children) == 0 {
		return RTCode{Code: v + ".slice()", Type: CodeE}
	}
	var parts []string
	restPart := ""
	anyTransform := false
	hasOptional := false
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil || resolved.Kind != reflection.KindTupleMember || resolved.Child == nil {
			continue
		}
		if isRestTupleMember(resolved) {
			elemVar := ctx.NextLocalVar("e")
			expr, ok := emitter.elementExpr(resolved.Child, elemVar, "tuple elements", ctx)
			if !ok {
				return RTCode{Code: "", Type: CodeNS}
			}
			if expr != elemVar {
				anyTransform = true
			}
			start := positionStr(resolved)
			restPart = "..." + v + ".slice(" + start + ").map(function(" + elemVar + "){return " + expr + "})"
			break
		}
		idx := positionStr(resolved)
		accessor := v + "[" + idx + "]"
		expr, ok := emitter.elementExpr(resolved.Child, accessor, "tuple element "+idx, ctx)
		if !ok {
			return RTCode{Code: "", Type: CodeNS}
		}
		if expr != accessor {
			anyTransform = true
			if resolved.Optional {
				expr = "(" + accessor + " === undefined ? undefined : " + expr + ")"
			}
		}
		if resolved.Optional {
			hasOptional = true
		}
		parts = append(parts, expr)
	}
	if !anyTransform {
		return RTCode{Code: v + ".slice()", Type: CodeE}
	}
	if restPart != "" {
		parts = append(parts, restPart)
	}
	if len(parts) == 0 {
		return RTCode{Code: v + ".slice()", Type: CodeE}
	}
	literal := "[" + strings.Join(parts, ",") + "]"
	if hasOptional && restPart == "" {
		// The literal always has N slots, turning `[4n]` into `[4n, undefined]`: absent trailing optionals must stay absent.
		return RTCode{Code: literal + ".slice(0, " + v + ".length)", Type: CodeE}
	}
	return RTCode{Code: literal, Type: CodeE}
}

// emitUnion refuses object members (RUK001): with no arm discrimination it could keep unknown keys.
func (emitter RemoveUnknownKeysEmitter) emitUnion(rt *reflection.RunType, ctx *EmitContext) RTCode {
	layout := buildFlatLayout(rt, ctx)
	if len(layout.ObjectMembers) > 0 {
		return RTCode{Code: "", Type: CodeNS}
	}
	v := ctx.Vλl
	var clauses []string
	for _, m := range layout.AtomicMembers {
		if m.Resolved == nil {
			continue
		}
		expr, ok := emitter.elementExpr(m.Ref, v, "union member `"+strippedMemberLabel(m.Resolved)+"`", ctx)
		if !ok {
			return RTCode{Code: "", Type: CodeNS}
		}
		if expr == v {
			// An immutable or shared member is covered by the `return v` tail.
			continue
		}
		guard := atomicStructuralGuard(m.Resolved, ctx, v)
		if guard == "" {
			return RTCode{Code: "", Type: CodeNS}
		}
		clauses = append(clauses, "if ("+guard+") return "+expr+";")
	}
	if len(clauses) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	return RTCode{Code: strings.Join(clauses, " ") + " return " + v, Type: CodeRB}
}

// emitNativeIterable always returns a fresh Map / Set: both are mutable.
func (emitter RemoveUnknownKeysEmitter) emitNativeIterable(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	isMap := rt.SubKind == reflection.SubKindMap
	ctor := "Set"
	where := []string{"Set values"}
	if isMap {
		ctor = "Map"
		where = []string{"Map keys", "Map values"}
	}
	innerTypes := iterableInnerTypes(rt, ctx)
	entryVar := ctx.NextLocalVar("e")
	var entryParts []string
	anyTransform := false
	for i, innerType := range innerTypes {
		if innerType == nil {
			continue
		}
		accessor := entryVar
		if isMap {
			accessor = entryVar + "[" + strconv.Itoa(i) + "]"
		}
		expr, ok := emitter.elementExpr(innerType, accessor, where[i%len(where)], ctx)
		if !ok {
			return RTCode{Code: "", Type: CodeNS}
		}
		if expr != accessor {
			anyTransform = true
		}
		entryParts = append(entryParts, expr)
	}
	if !anyTransform || len(entryParts) == 0 {
		return RTCode{Code: "new " + ctor + "(" + v + ")", Type: CodeE}
	}
	perEntry := entryParts[0]
	if isMap {
		perEntry = "[" + strings.Join(entryParts, ",") + "]"
	}
	return RTCode{
		Code: "new " + ctor + "(Array.from(" + v + ", function(" + entryVar + "){return " + perEntry + "}))",
		Type: CodeE,
	}
}

// isNoopForRemoveUnknownKeys must mirror the Emit arms, or the noop fastpath shares a mutable position.
func isNoopForRemoveUnknownKeys(rt *reflection.RunType, ctx *EmitContext) bool {
	rt = ctx.ResolveRef(rt)
	if rt == nil {
		return false
	}
	if rt.ID != "" {
		if verdict, known := ctx.walker.factsLookup(factNoopRemoveUnknownKeys, rt.ID); known {
			return verdict
		}
	}
	result := removeUnknownKeysNoopRecursive(rt, ctx, make(map[string]struct{}))
	if rt.ID != "" {
		ctx.walker.factsStore(factNoopRemoveUnknownKeys, rt.ID, result)
	}
	return result
}

func removeUnknownKeysNoopRecursive(rt *reflection.RunType, ctx *EmitContext, visited map[string]struct{}) bool {
	rt = ctx.ResolveRef(rt)
	if rt == nil {
		return true
	}
	if rt.ID != "" {
		if verdict, known := ctx.walker.factsLookup(factNoopRemoveUnknownKeys, rt.ID); known {
			return verdict
		}
		if _, seen := visited[rt.ID]; seen {
			// Unreachable: a cycle passes an object/class node, which returned false; true keeps the walk total.
			return true
		}
		visited[rt.ID] = struct{}{}
	}
	if _, shared := sharedValueSlot(rt, ctx); shared {
		// The entry must compile so the warning fires, or the refusal throws.
		return false
	}
	switch rt.Kind {

	// Mutable positions always need a live clone body.
	case reflection.KindObjectLiteral,
		reflection.KindArray, reflection.KindTuple, reflection.KindIndexSignature:
		return false

	case reflection.KindClass:
		switch rt.SubKind {
		case reflection.SubKindNone, reflection.SubKindMap, reflection.SubKindSet, reflection.SubKindDate:
			return false
		}
		if reflection.IsTemporalSubKind(rt.SubKind) {
			// Immutable, but re-materialized anyway: object identity must be fresh at every object position.
			return false
		}
		return true

	case reflection.KindProperty, reflection.KindPropertySignature:
		if rt.Child == nil {
			return true
		}
		return removeUnknownKeysNoopRecursive(ctx.ResolveRef(rt.Child), ctx, visited)

	case reflection.KindTupleMember:
		if rt.Child == nil {
			return true
		}
		return removeUnknownKeysNoopRecursive(ctx.ResolveRef(rt.Child), ctx, visited)

	case reflection.KindUnion:
		// An object-bearing union is unsupported, so never noop; an atomic union is identity iff every member is.
		layout := buildFlatLayout(rt, ctx)
		if len(layout.ObjectMembers) > 0 {
			return false
		}
		for _, m := range layout.AtomicMembers {
			if m.Resolved == nil {
				continue
			}
			if !removeUnknownKeysNoopRecursive(m.Resolved, ctx, visited) {
				return false
			}
		}
		return true
	}
	// Immutable kinds (primitives, symbols, enums, literals, bigints, void/null/undefined/never) and any/unknown/object.
	return true
}
