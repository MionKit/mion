package typefunctions

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// CloneExactShapeEmitter — a PROPER deep clone of the DECLARED shape, and the
// clone-based replacement for the removed mutating strip family
// (stripUnknownKeys / unknownKeysToUndefined).
//
// Contract (isolation guarantee): the result is a fresh value of exactly the
// declared type shape — unknown/undeclared keys are dropped by construction
// (the clone is built from the type, never `{...v}`), the input is never
// mutated, and `clone(x) !== x` holds for EVERY object-typed position (test
// code relies on fresh identities). The only values passed through by
// reference are:
//
//   - PRIMITIVES: strings, numbers, booleans, bigints, enums, literals —
//     primitives compare by value, so a "fresh" primitive is meaningless.
//   - OPAQUE values the type system gives no shape for: `any` / `unknown` /
//     bare `object`, functions, symbols, promises, and non-serializable
//     natives (streams, ArrayBuffers, handles). Copying a resource handle is
//     usually WRONG, not just slow — these pass through, and
//     `overrideCloneExactShape<T>()` is the escape hatch for custom copying.
//
// Everything else is freshly allocated: objects and class instances rebuild
// (classes keep their prototype — see the object arm), arrays/tuples copy
// (`.slice()` when the element type is immutable, `.map(clone)` otherwise),
// Map/Set re-materialize (`new Map(v)` / per-entry clone), Dates re-wrap
// (`new Date(v.getTime())`), RegExps re-compile (flags + lastIndex kept),
// Temporal objects re-materialize via their static `from()` (immutable, but
// identity freshness wins over the saved allocation).
//
// Deliberately NO key-count gates and NO reuse shortcuts on the rebuild
// paths: measured on V8, checking `Object.keys(x).length === N` to skip a
// small-object rebuild costs MORE than the rebuild itself (1.6x slower for a
// 7+3-prop shape).
//
// Intended use is stripping validated parse output:
//
//	if (!validate(data)) throw ...;
//	return cloneExact(data);   // fresh value, exactly the declared shape
type CloneExactShapeEmitter struct{}

func (CloneExactShapeEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports mirrors the unknown-keys family gate — this IS an unknown-keys
// family member (the strip replacement), so functions / symbols / promises
// are supported-as-passthrough (opaque), NOT rejected like the JSON
// serializers reject them.
func (CloneExactShapeEmitter) Supports(rt *reflection.RunType) bool {
	return unknownKeysSupports(rt)
}

func (CloneExactShapeEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// IsNoopType — identity is sound exactly when the whole reachable subtree is
// immutable or opaque (see isNoopForCloneExactShape): sharing such values is
// observationally equivalent to copying them. Any mutable position anywhere
// (object, class, array, tuple, Map, Set, Date, RegExp, index signature)
// forces a live clone body.
func (CloneExactShapeEmitter) IsNoopType(rt *reflection.RunType, ctx *EmitContext) bool {
	return isNoopForCloneExactShape(rt, ctx)
}

// NoopChildComposesAround — an immutable/opaque child is shared by reference
// (the accessor IS its clone); empty code composes correctly.
func (CloneExactShapeEmitter) NoopChildComposesAround() {}

func (CloneExactShapeEmitter) ReturnName() string {
	return "v"
}

// EmitDependencyCall — expression shape (`<hash>.fn(v)`), never a mutation
// statement: the child factory RETURNS the cloned value and the parent
// composes it into an expression slot, mirroring PrepareForJsonSafeEmitter.
func (CloneExactShapeEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	return ctx.emitDepCall(childID, ctx.Vλl, "")
}

// Finalize: empty/identity bodies collapse to `return v` + isNoop so the
// JS-side noop fastpath short-circuits dispatch.
func (CloneExactShapeEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "return v" {
		return "return v", true
	}
	return code, false
}

// Emit dispatches the per-kind switch. Arms return CodeE (expression
// evaluating to the clone), CodeRB (self-returning block), or empty CodeS
// (immutable/opaque passthrough). Composition rule identical to
// prepareForJsonSafe: an empty child emit means the child's clone IS its
// input accessor.
func (CloneExactShapeEmitter) Emit(rt *reflection.RunType, ctx *EmitContext, _ CodeType) RTCode {
	if rt == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	switch rt.Kind {

	case reflection.KindObjectLiteral:
		return emitObjectCloneExactShape(rt, ctx, v, false)

	case reflection.KindClass:
		switch rt.SubKind {
		case reflection.SubKindNone:
			// Plain user class: prototype-preserving rebuild (see the object
			// arm) so `instanceof` survives. Custom serializer registrations
			// are a JSON-wire concern and don't apply to a value-level clone.
			return emitObjectCloneExactShape(rt, ctx, v, true)
		case reflection.SubKindMap, reflection.SubKindSet:
			return emitNativeIterableCloneExactShape(rt, ctx, v)
		case reflection.SubKindDate:
			// Dates are mutable (setTime & friends) — always re-wrap.
			return RTCode{Code: "new Date(" + v + ".getTime())", Type: CodeE}
		}
		if info, ok := reflection.TemporalInfoBySubKind(rt.SubKind); ok {
			// Temporal objects are immutable, but a clone hands back a fresh
			// instance anyway — `clone(x).field !== x.field` must hold for
			// every object-typed field (identity-based test assertions rely
			// on it). Every Temporal type re-materializes via its static
			// from().
			return RTCode{Code: "globalThis." + info.Builtin + ".from(" + v + ")", Type: CodeE}
		}
		// Non-serializable natives are opaque handles (copying is wrong).
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindRegexp:
		// Mutable via lastIndex (sticky/global iteration state) — re-compile
		// and carry the cursor so the clone is a faithful copy.
		return RTCode{Code: cloneRegExpCall(ctx, v), Type: CodeE}

	case reflection.KindArray:
		return emitArrayCloneExactShape(rt, ctx, v)

	case reflection.KindTuple:
		return emitTupleCloneExactShape(rt, ctx, v)

	case reflection.KindIndexSignature:
		// Bare index-signature dispatch (root reach-in); the object arm
		// normally consumes sigs via buildSafeIndexSignatureObject.
		return emitIndexSignatureCloneExactShape(rt, ctx, v)

	case reflection.KindUnion:
		return emitUnionCloneExactShape(rt, ctx)

	// Immutable kinds (primitives, enums, literals, template literals,
	// bigints — no `.toString()` here: this is a value-level clone, not a
	// JSON projection) and opaque kinds (any/unknown/object, symbols,
	// functions, promises) — shared by reference.
	default:
		return RTCode{Code: "", Type: CodeS}
	}
}

// cloneRegExpCall hoists a per-closure RegExp cloner (source + flags +
// lastIndex) and returns the call expression.
func cloneRegExpCall(ctx *EmitContext, v string) string {
	const fnVar = "cloneRE"
	if !ctx.HasContextItem(fnVar) {
		ctx.SetContextItem(fnVar, "const "+fnVar+" = function(r){const c = new RegExp(r.source, r.flags); c.lastIndex = r.lastIndex; return c}")
	}
	return fnVar + "(" + v + ")"
}

// emitObjectCloneExactShape builds the declared-shape clone of an object
// literal / plain class instance. Mirrors emitObjectPrepareForJsonSafe's
// property collection (static/method drops, DataOnly-stripped drops,
// enumerability guards) WITHOUT the Approach-3 fastpath — the clone is
// always built (measured cheaper than gating for small objects; see the
// emitter doc comment).
//
// asClass selects the prototype-preserving accumulator form:
//
//	const _r = Object.create(Object.getPrototypeOf(v)); _r.a = v.a; …
//
// so a class instance clone keeps its prototype chain (`instanceof` holds).
// Plain objects use the object-literal / accumulator forms from
// buildSafeObjectClone.
func emitObjectCloneExactShape(rt *reflection.RunType, ctx *EmitContext, v string, asClass bool) RTCode {
	// A callable interface is function-like (DataOnly = never); same NS
	// stance as the JSON families — the diag maps it to the function code.
	if objectHasCallSignature(rt, ctx) {
		return RTCode{Code: "", Type: CodeNS}
	}
	var props []safePropEmit
	var indexSigs []*reflection.RunType
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
			if asClass {
				// Class methods ride the SHARED PROTOTYPE — the clone keeps
				// them working without copying own props (copying would
				// shadow the prototype and change Object.keys). Advisory only.
				ctx.EmitDiagnosticSlot(SlotMethodDropped, memberLabel(resolved))
				continue
			}
			// Object-literal method member: an own function-valued prop.
			// Declared members are NEVER dropped — the clone keeps it,
			// shared by reference (functions cannot be rebuilt), and the
			// build says so.
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
			// EVERY index signature routes to the copy walk — its matching
			// keys are DECLARED shape and must be copied onto the fresh
			// object (symbol-keyed / function-valued sigs are skipped inside
			// buildSafeIndexSignatureObject, exactly like the JSON walks).
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
		// Declared members are NEVER dropped (only UNDECLARED keys are — that
		// is the strip guarantee). A declared value the emitter cannot rebuild
		// (function / symbol / Promise / non-serializable native) is kept and
		// shared by REFERENCE, with a build advisory naming the member — the
		// value-level analogue of the DataOnly drop the JSON families do.
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
		// The for-in copy walk (skip declared names, copy sig-matching keys
		// with the child clone applied, then the declared-prop assignments).
		// Shared with the safe-clone family — child compiles dispatch
		// through this walker, so copied values are exact-shape clones.
		return buildSafeIndexSignatureObject(v, props, collectSiblingNamedKeys(rt, ctx), indexSigs, ctx)
	}

	if len(props) == 0 {
		// No clonable declared properties — the exact shape is `{}`
		// regardless of v's content (strips ALL extras).
		return RTCode{Code: "return {}", Type: CodeRB}
	}

	if asClass {
		return buildClassCloneExactShape(v, props)
	}

	clone := buildSafeObjectClone(props, ctx)
	if clone.Type == CodeRB {
		// Mixed-optionality accumulator: the block self-returns; splice it
		// directly as the body (the walker hoists at expression slots).
		return clone
	}
	return RTCode{Code: "return " + clone.Code, Type: CodeRB}
}

// opaqueValueSlot classifies a resolved property-value type the clone cannot
// rebuild: function kinds → SlotFunctionPropDropped (CES010: kept, shared by
// reference), symbol / Promise / non-serializable natives →
// SlotNonSerializablePropDropped (CES015, same sharing). ok=false for every
// clonable kind — those flow through safeChildExpr as usual.
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

// buildClassCloneExactShape assembles the prototype-preserving accumulator
// for a plain class instance:
//
//	const _r = Object.create(Object.getPrototypeOf(v));
//	_r.a = <expr>; if (v.opt !== undefined) _r.opt = <expr>; …
//	return _r
//
// The fresh object shares the input's prototype (methods / instanceof keep
// working) while own enumerable data is rebuilt from the declared shape, so
// undeclared own keys are dropped. Prototype accessors are an accepted edge:
// assignment goes through a setter if one exists (classes-as-data carry
// plain fields).
func buildClassCloneExactShape(v string, props []safePropEmit) RTCode {
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

// emitArrayCloneExactShape — arrays are mutable containers, so the clone is
// ALWAYS a fresh array: `.slice()` when the element clones to itself
// (immutable/opaque elements — a slice IS a deep clone then), `.map(clone)`
// otherwise.
func emitArrayCloneExactShape(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
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

// emitTupleCloneExactShape — tuples ride arrays (mutable), so always fresh:
// `.slice()` when every slot clones to itself, positional rebuild otherwise.
// Optional members preserve `undefined` (a value-level clone has no JSON
// `null` placeholder concern).
func emitTupleCloneExactShape(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
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
		// Absent TRAILING optional slots (TS forbids required-after-optional)
		// must stay absent: the positional literal always materializes N
		// slots, which would grow `[4n]` into `[4n, undefined]` and change
		// `.length`. Truncate to the input's length — present-but-undefined
		// slots inside the input keep their position, extras beyond the
		// declared arity are still dropped (the literal caps at N).
		return RTCode{Code: literal + ".slice(0, " + v + ".length)", Type: CodeE}
	}
	return RTCode{Code: literal, Type: CodeE}
}

// emitIndexSignatureCloneExactShape — a bare index signature at a non-object
// position (root reach-in). Symbol-keyed / function-valued sigs are skipRT'd
// (nothing the RT tracks) and pass through; everything else does the fresh
// copy walk.
func emitIndexSignatureCloneExactShape(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil || isSymbolKeyedIndexSig(rt, ctx) {
		return RTCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil || isFunctionLikeKind(resolved.Kind) {
		return RTCode{Code: "", Type: CodeS}
	}
	return buildSafeIndexSignatureObject(v, nil, nil, []*reflection.RunType{rt}, ctx)
}

// emitUnionCloneExactShape — unions with OBJECT members stay unsupported
// (CodeNS → CES001 alwaysThrow + build diagnostic): without runtime arm
// discrimination the emitter cannot know WHICH declared shape to rebuild,
// and a clone that silently kept unknown keys would be a security bug.
//
// Atomic-member unions dispatch: members whose clone is non-identity (Date,
// RegExp, arrays, Map/Set, …) get an `if (<structural guard>) return
// <clone>;` arm; fully immutable/opaque members fall through to `return v`.
// A union of only-immutable members (string | number, Date-less enums, …)
// is a passthrough.
func emitUnionCloneExactShape(rt *reflection.RunType, ctx *EmitContext) RTCode {
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
			// Immutable/opaque member — the `return v` tail covers it.
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

// emitNativeIterableCloneExactShape — Map / Set are mutable containers:
// ALWAYS a fresh instance. When every inner type clones to itself the
// constructor copy suffices (`new Map(v)` — entries are immutable/opaque);
// otherwise entries rebuild with per-entry exact-shape clones.
func emitNativeIterableCloneExactShape(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
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

// isNoopForCloneExactShape — the family's dedicated noop predicate: identity
// is sound iff EVERY reachable position is immutable or opaque. Mirrors the
// Emit arms one-for-one (any mutable position — object, class, Date, RegExp,
// array, tuple, Map/Set, index signature — must produce a live body, or the
// runtime noop fastpath would hand back a shared mutable value). Memoized on
// the walker's facts table like the other family predicates.
func isNoopForCloneExactShape(rt *reflection.RunType, ctx *EmitContext) bool {
	rt = ctx.ResolveRef(rt)
	if rt == nil {
		return false
	}
	if rt.ID != "" {
		if verdict, known := ctx.walker.factsLookup(factNoopCloneExactShape, rt.ID); known {
			return verdict
		}
	}
	result := cloneExactShapeNoopRecursive(rt, ctx, make(map[string]struct{}))
	if rt.ID != "" {
		ctx.walker.factsStore(factNoopCloneExactShape, rt.ID, result)
	}
	return result
}

func cloneExactShapeNoopRecursive(rt *reflection.RunType, ctx *EmitContext, visited map[string]struct{}) bool {
	rt = ctx.ResolveRef(rt)
	if rt == nil {
		return true
	}
	if rt.ID != "" {
		if verdict, known := ctx.walker.factsLookup(factNoopCloneExactShape, rt.ID); known {
			return verdict
		}
		if _, seen := visited[rt.ID]; seen {
			// Cycle-back: a cycle necessarily passes through an object/class
			// node, whose arm below already returned false — unreachable in
			// practice, optimistic true keeps the walk total.
			return true
		}
		visited[rt.ID] = struct{}{}
	}
	switch rt.Kind {

	// Mutable positions — always a live clone body.
	case reflection.KindObjectLiteral, reflection.KindRegexp,
		reflection.KindArray, reflection.KindTuple, reflection.KindIndexSignature:
		return false

	case reflection.KindClass:
		switch rt.SubKind {
		case reflection.SubKindNone, reflection.SubKindMap, reflection.SubKindSet, reflection.SubKindDate:
			return false
		}
		if reflection.IsTemporalSubKind(rt.SubKind) {
			// Immutable, but re-materialized anyway — object identity must
			// be fresh on every object-typed position.
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
		return cloneExactShapeNoopRecursive(resolved, ctx, visited)

	case reflection.KindTupleMember:
		if rt.Child == nil {
			return true
		}
		return cloneExactShapeNoopRecursive(ctx.ResolveRef(rt.Child), ctx, visited)

	case reflection.KindUnion:
		// Object-bearing unions are unsupported (never noop — the entry is
		// an alwaysThrow); atomic unions are identity iff every member is.
		layout := buildFlatLayout(rt, ctx)
		if len(layout.ObjectMembers) > 0 {
			return false
		}
		for _, m := range layout.AtomicMembers {
			if m.Resolved == nil {
				continue
			}
			if !cloneExactShapeNoopRecursive(m.Resolved, ctx, visited) {
				return false
			}
		}
		return true
	}
	// Immutable (primitives, enums, literals, template literals, bigints,
	// never/void/null/undefined) and opaque (any/unknown/object, symbol,
	// function kinds, promise) — passthrough.
	return true
}
