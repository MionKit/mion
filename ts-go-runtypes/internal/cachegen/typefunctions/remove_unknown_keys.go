package typefunctions

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// RemoveUnknownKeysEmitter rebuilds the declared shape from the type, never `{...v}`: `clone(x) !== x` at every object.
// Primitives and opaque values (any, functions, symbols, RegExps, natives) are shared: copying a handle is wrong.
// `overrideRemoveUnknownKeys<T>()` is the escape hatch for custom copying.
// No key-count gate: on V8, `Object.keys(x).length === N` costs more than the rebuild (1.6x slower).
type RemoveUnknownKeysEmitter struct{}

func (RemoveUnknownKeysEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports mirrors the unknown-keys family gate, this being a member of it: functions / symbols /
// promises are supported as opaque passthrough, NOT rejected the way the JSON serializers reject them.
func (RemoveUnknownKeysEmitter) Supports(rt *reflection.RunType) bool {
	return unknownKeysSupports(rt)
}

func (RemoveUnknownKeysEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// IsNoopType: identity is sound exactly when the whole reachable subtree is immutable or opaque, where
// sharing is observationally equivalent to copying; any mutable position forces a live clone body.
func (RemoveUnknownKeysEmitter) IsNoopType(rt *reflection.RunType, ctx *EmitContext) bool {
	return isNoopForRemoveUnknownKeys(rt, ctx)
}

// NoopChildComposesAround: an immutable/opaque child is shared by reference, so the accessor IS its clone
// and empty code composes correctly.
func (RemoveUnknownKeysEmitter) NoopChildComposesAround() {}

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

// Emit arms return CodeE (an expression evaluating to the clone), CodeRB (a self-returning block) or empty
// CodeS (immutable/opaque passthrough).
// Composition rule as in prepareForJsonClone: an empty child emit means the child's clone IS its accessor.
func (RemoveUnknownKeysEmitter) Emit(rt *reflection.RunType, ctx *EmitContext, _ CodeType) RTCode {
	if rt == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	switch rt.Kind {

	case reflection.KindObjectLiteral:
		return emitObjectRemoveUnknownKeys(rt, ctx, v, false)

	case reflection.KindClass:
		switch rt.SubKind {
		case reflection.SubKindNone:
			// Prototype-preserving rebuild so `instanceof` survives; a custom serializer registration is a
			// JSON-wire concern and does not apply to a value-level clone.
			return emitObjectRemoveUnknownKeys(rt, ctx, v, true)
		case reflection.SubKindMap, reflection.SubKindSet:
			return emitNativeIterableRemoveUnknownKeys(rt, ctx, v)
		case reflection.SubKindDate:
			// Dates are mutable (setTime & friends), so always re-wrap.
			return RTCode{Code: "new Date(" + v + ".getTime())", Type: CodeE}
		}
		if info, ok := reflection.TemporalInfoBySubKind(rt.SubKind); ok {
			// Temporal objects are immutable, but a clone still hands back a fresh instance:
			// `clone(x).field !== x.field` must hold for every object-typed field.
			return RTCode{Code: "globalThis." + info.Builtin + ".from(" + v + ")", Type: CodeE}
		}
		// Non-serializable natives are opaque handles (copying is wrong).
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindRegexp:
		// A RegExp is not data (DataOnly strips it), so like a function it is shared rather than rebuilt.
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindArray:
		return emitArrayRemoveUnknownKeys(rt, ctx, v)

	case reflection.KindTuple:
		return emitTupleRemoveUnknownKeys(rt, ctx, v)

	case reflection.KindIndexSignature:
		// Bare index-signature dispatch (root reach-in); the object arm normally consumes sigs itself.
		return emitIndexSignatureRemoveUnknownKeys(rt, ctx, v)

	case reflection.KindUnion:
		return emitUnionRemoveUnknownKeys(rt, ctx)

	// Immutable kinds (primitives, enums, literals, template literals, bigints, with no `.toString()`:
	// this is a value-level clone, not a JSON projection) and opaque kinds are shared by reference.
	default:
		return RTCode{Code: "", Type: CodeS}
	}
}

// emitObjectRemoveUnknownKeys mirrors emitObjectPrepareForJsonClone's property collection, minus its fastpath.
func emitObjectRemoveUnknownKeys(rt *reflection.RunType, ctx *EmitContext, v string, asClass bool) RTCode {
	// A callable interface is function-like (DataOnly = never), the same NS stance as the JSON families,
	// whose diag maps it to the function code.
	if objectHasCallSignature(rt, ctx) {
		return RTCode{Code: "", Type: CodeNS}
	}
	var props []safePropEmit
	var indexSigs []*reflection.RunType
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
			if asClass {
				// Class methods live on the SHARED PROTOTYPE, so they keep working without an own prop;
				// copying one would shadow the prototype and change Object.keys. Advisory only.
				ctx.EmitDiagnosticSlot(SlotMethodDropped, memberLabel(resolved))
				continue
			}
			// An object-literal method is an own function-valued prop. Declared members are NEVER dropped:
			// the clone keeps it, shared by reference since functions cannot be rebuilt, and the build says so.
			ctx.EmitDiagnosticSlot(SlotFunctionPropDropped, memberLabel(resolved))
			accessor := propertyAccessor(v, resolved.Name, resolved.IsSafeName)
			props = append(props, safePropEmit{
				name:       resolved.Name,
				isSafeName: resolved.IsSafeName,
				optional:   resolved.Optional,
				accessor:   accessor,
				expr:       accessor,
			})
			continue
		}
		if resolved.Kind == reflection.KindIndexSignature {
			// Keys matching an index signature are DECLARED shape and must be copied onto the fresh object,
			// so EVERY signature routes to the copy walk (which skips symbol-keyed / function-valued ones).
			indexSigs = append(indexSigs, resolved)
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
		accessor := propertyAccessor(v, resolved.Name, resolved.IsSafeName)
		// Declared members are NEVER dropped, only UNDECLARED keys are: that is the strip guarantee.
		// A declared value the emitter cannot rebuild is kept and shared by REFERENCE, with a build
		// advisory naming the member, the value-level analogue of the JSON families' DataOnly drop.
		if slot, opaque := opaqueValueSlot(propResolved); opaque {
			ctx.EmitDiagnosticSlot(slot, memberLabel(resolved))
			props = append(props, safePropEmit{
				name:       resolved.Name,
				isSafeName: resolved.IsSafeName,
				optional:   resolved.Optional,
				accessor:   accessor,
				expr:       accessor,
			})
			continue
		}
		expr, ok := safeChildExpr(resolved.Child, accessor, ctx)
		if !ok {
			if propertyChildFailed(ctx) {
				return RTCode{Code: "", Type: CodeNS}
			}
			continue
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

	if len(indexSigs) > 0 {
		// The for-in copy walk is shared with the safe-clone family, and child compiles dispatch through
		// this walker, so copied values are exact-shape clones. A key matching no pattern is dropped: a
		// by-reference copy would break clone(x) !== x.
		return buildSafeIndexSignatureObject(v, props, collectSiblingNamedKeys(rt, ctx), indexSigs, false, ctx)
	}

	if len(props) == 0 {
		// No clonable declared property: the exact shape is `{}` whatever v holds, stripping ALL extras.
		return RTCode{Code: "return {}", Type: CodeRB}
	}

	if asClass {
		return buildClassRemoveUnknownKeys(v, props)
	}

	clone := buildSafeObjectClone(props, ctx)
	if clone.Type == CodeRB {
		// The mixed-optionality accumulator self-returns, so splice it directly as the body.
		return clone
	}
	return RTCode{Code: "return " + clone.Code, Type: CodeRB}
}

// opaqueValueSlot picks the warning (RUK010 / RUK015) for a value the clone cannot rebuild and so shares.
func opaqueValueSlot(resolved *reflection.RunType) (DiagSlot, bool) {
	if resolved == nil {
		return "", false
	}
	if isFunctionLikeKind(resolved.Kind) {
		return SlotFunctionPropDropped, true
	}
	switch resolved.Kind {
	case reflection.KindSymbol, reflection.KindPromise:
		return SlotNonSerializablePropDropped, true
	case reflection.KindClass:
		if resolved.SubKind == reflection.SubKindNonSerializable {
			return SlotNonSerializablePropDropped, true
		}
	case reflection.KindLiteral:
		for _, flag := range resolved.Flags {
			if flag == "symbol" {
				return SlotNonSerializablePropDropped, true
			}
		}
	}
	return "", false
}

// buildClassRemoveUnknownKeys keeps the input's prototype; accepted edge: a prototype setter runs on assignment.
func buildClassRemoveUnknownKeys(v string, props []safePropEmit) RTCode {
	var b strings.Builder
	b.WriteString("const _r = Object.create(Object.getPrototypeOf(")
	b.WriteString(v)
	b.WriteString("));")
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
			continue
		}
		b.WriteString("_r[")
		b.WriteString(quoteJS(p.name))
		b.WriteString("] = ")
		b.WriteString(p.expr)
		b.WriteString(";")
	}
	b.WriteString("return _r")
	return RTCode{Code: b.String(), Type: CodeRB}
}

// emitArrayRemoveUnknownKeys always returns a fresh array, even when elements clone to themselves: arrays are mutable.
func emitArrayRemoveUnknownKeys(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: v + ".slice()", Type: CodeE}
	}
	elemVar := ctx.NextLocalVar("e")
	expr, ok := safeChildExpr(rt.Child, elemVar, ctx)
	if !ok {
		return RTCode{Code: "", Type: CodeNS}
	}
	if expr == elemVar {
		return RTCode{Code: v + ".slice()", Type: CodeE}
	}
	return RTCode{Code: v + ".map(function(" + elemVar + "){return " + expr + "})", Type: CodeE}
}

// emitTupleRemoveUnknownKeys always returns a fresh array; optional slots keep `undefined`, no JSON `null` placeholder.
func emitTupleRemoveUnknownKeys(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
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
			expr, ok := safeChildExpr(resolved.Child, elemVar, ctx)
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
		expr, ok := safeChildExpr(resolved.Child, accessor, ctx)
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
		// Absent TRAILING optional slots must stay absent, but the positional literal always materializes N
		// slots, growing `[4n]` into `[4n, undefined]` and changing `.length`. Truncating to the input's
		// length keeps present-but-undefined slots in place; extras beyond the declared arity still drop.
		return RTCode{Code: literal + ".slice(0, " + v + ".length)", Type: CodeE}
	}
	return RTCode{Code: literal, Type: CodeE}
}

// emitIndexSignatureRemoveUnknownKeys covers a bare index signature outside an object (root reach-in).
func emitIndexSignatureRemoveUnknownKeys(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil || isSymbolKeyedIndexSig(rt, ctx) {
		return RTCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil || isFunctionLikeKind(resolved.Kind) {
		return RTCode{Code: "", Type: CodeS}
	}
	return buildSafeIndexSignatureObject(v, nil, nil, []*reflection.RunType{rt}, false, ctx)
}

// emitUnionRemoveUnknownKeys refuses object members (RUK001): with no arm discrimination it could keep unknown keys.
func emitUnionRemoveUnknownKeys(rt *reflection.RunType, ctx *EmitContext) RTCode {
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
		expr, ok := safeChildExpr(m.Ref, v, ctx)
		if !ok {
			return RTCode{Code: "", Type: CodeNS}
		}
		if expr == v {
			// An immutable/opaque member is covered by the `return v` tail.
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

// emitNativeIterableRemoveUnknownKeys always returns a fresh Map / Set: both are mutable.
func emitNativeIterableRemoveUnknownKeys(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	isMap := rt.SubKind == reflection.SubKindMap
	ctor := "Set"
	if isMap {
		ctor = "Map"
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
		expr, ok := safeChildExpr(innerType, accessor, ctx)
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
			// A cycle necessarily passes through an object/class node, whose arm already returned false, so
			// this is unreachable in practice: optimistic true keeps the walk total.
			return true
		}
		visited[rt.ID] = struct{}{}
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
		// Non-serializable (opaque) subkinds pass through.
		return true

	case reflection.KindProperty, reflection.KindPropertySignature:
		if rt.Child == nil {
			return true
		}
		resolved := ctx.ResolveRef(rt.Child)
		if resolved == nil || isFunctionLikeKind(resolved.Kind) || resolved.IsStatic {
			return true
		}
		return removeUnknownKeysNoopRecursive(resolved, ctx, visited)

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
	// Immutable (primitives, enums, literals, template literals, bigints, never/void/null/undefined) and
	// opaque (any/unknown/object, symbol, function kinds, promise) kinds are passthrough.
	return true
}
