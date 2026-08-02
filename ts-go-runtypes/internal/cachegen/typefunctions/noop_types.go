package typefunctions

import "github.com/mionkit/ts-runtypes/internal/protocol"

// Semantic noop predicates — "would this family's entry for T be the family
// identity fn?" — decided over the TYPE GRAPH, not the emitted code shape.
//
// Finalize's shape check ("" / "return v") only sees what the walker INLINED;
// it cannot see through call boundaries. Three boundaries used to leak dead
// code: external dep-calls (every named type under the default name rule),
// circular types (always external, so a JSON-compatible circular type emitted
// a self-recursive traversal that walked the whole value doing nothing), and
// the JSON composites (bound their primitives unconditionally). The walker's
// dispatch gate consults these predicates before emitting a dep call, and the
// composite collector keys binding elision on the rendered entries' IsNoop
// flags — both collapse those boundaries.
//
// SOUNDNESS CONTRACT (one-directional): predicate true ⇒ the family's emitted
// body for T is the family identity. A false negative only costs bytes (the
// dep call stays); a false positive silently skips a real transform — data
// corruption. Every arm below therefore MIRRORS the corresponding emitter's
// per-kind dispatch (json_prepare.go / json_restore.go / json_prepare_safe.go
// / union_flat.go); when in doubt an arm returns false. The mirror is pinned
// mechanically by the resolver-level corpus test (noop_predicate_test.go),
// which asserts verdict=true ⇒ the gate-disabled fully-inlined compile
// collapses to a noop body, across every fixture type.
//
// Cycles: re-entry on an in-walk id is assumed noop (greatest fixpoint, the
// isJsonCompatible rule) — a cycle is identity unless some node on it (or off
// it) demands a transform, and any such node falsifies the walk on its own
// path. Memoization stores only COMPLETED top-level verdicts (an intermediate
// node's in-walk value can depend on the cycle-back assumption for an
// ancestor still on the stack), exactly like FactsTable's other predicates.

// NoopTypePredicate is the Emitter capability that decides "is this family's
// entry for T the family identity?" over the TYPE GRAPH. EVERY family
// implements it — the noop VERDICT on an emitted entry is decided by the
// predicate, never by inspecting the emitted text (Finalize's shape result
// survives only as the renderer's protective tripwire: a predicate that
// claims noop while the compiled body disagrees ships the live body and
// logs — see renderEntryWithDeps).
//
// Each predicate mirrors ITS OWN emitter arm-by-arm; where an emitter arm
// delegates to another family's helpers, the predicate arm delegates to that
// family's predicate the same way (compactForJson reuses prepareForJsonSafe's
// wholesale — their diverging object arms agree on never-noop; compactFromJson
// delegates restoreFromJson's shared arms but answers false at its own object
// arms, where restoreFromJson's raw round-trip does NOT hold for the
// positional rebuild). Where an emitter decides a slot through a helper
// (isStrippedUnionMember, objectHasIndexSignatureChild, iterableInnerTypes,
// literalFlavour, …), the predicate calls the SAME helper so that arm cannot
// drift.
type NoopTypePredicate interface {
	IsNoopType(rt *protocol.RunType, ctx *EmitContext) bool
}

// NoopComposeAround additionally marks the families whose predicate may feed
// the walker's dispatch-time noop gate: the gate replaces a noop child's dep
// call with EMPTY code, which is sound only for value-transform semantics
// ("noop child" = leave the value / error list / byte stream untouched, so
// emitting nothing composes correctly). Two families must stay OFF the gate:
// stringifyJson parents concatenate the child call's returned JSON FRAGMENT
// (composing around with empty code silently drops the property from the
// output — a substitution gate emitting `JSON.stringify(<accessor>)` would be
// needed instead), and fromBinary parents advance positionally through the
// byte stream (skipping a child decode desynchronizes every later read).
type NoopComposeAround interface {
	NoopTypePredicate
	// NoopChildComposesAround is a marker method (empty implementations):
	// asserting it is the family's claim that empty code is the correct
	// composition for a noop child.
	NoopChildComposesAround()
}

// jsonNoopMode selects between the encode (prepareForJson) and decode
// (restoreFromJson) arm tables of the shared JSON-transform predicate. The
// two sides diverge exactly where the emitters do: Date/Temporal are noop on
// encode (native toJSON covers them) but rebuild on decode; `undefined` is
// noop on encode but force-rebinds on decode; unions always emit the
// guard-chain + mismatch-throw on encode but ride raw on decode when nothing
// wraps.
type jsonNoopMode int

const (
	noopModePrepare jsonNoopMode = iota
	noopModeRestore
)

func (mode jsonNoopMode) factKind() factKind {
	if mode == noopModePrepare {
		return factNoopPrepareJson
	}
	return factNoopRestoreJson
}

/** isNoopForPrepareJson reports whether the pj (mutate-encode) entry for rt is the identity. **/
func isNoopForPrepareJson(rt *protocol.RunType, ctx *EmitContext) bool {
	return jsonNoopTopLevel(rt, ctx, noopModePrepare)
}

/** isNoopForRestoreJson reports whether the rj (decode) entry for rt is the identity. **/
func isNoopForRestoreJson(rt *protocol.RunType, ctx *EmitContext) bool {
	return jsonNoopTopLevel(rt, ctx, noopModeRestore)
}

// jsonNoopTopLevel is the memo wrapper — same store-completed-walks-only
// discipline as isJsonCompatible (see the cycle note there).
func jsonNoopTopLevel(rt *protocol.RunType, ctx *EmitContext, mode jsonNoopMode) bool {
	rt = ctx.ResolveRef(rt)
	if rt == nil {
		return false
	}
	if rt.ID != "" {
		if verdict, known := ctx.walker.factsLookup(mode.factKind(), rt.ID); known {
			return verdict
		}
	}
	result := jsonNoopRecursive(rt, ctx, mode, make(map[string]struct{}))
	if rt.ID != "" {
		ctx.walker.factsStore(mode.factKind(), rt.ID, result)
	}
	return result
}

func jsonNoopRecursive(rt *protocol.RunType, ctx *EmitContext, mode jsonNoopMode, visited map[string]struct{}) bool {
	rt = ctx.ResolveRef(rt)
	if rt == nil {
		// Mirrors the walker: nil / dangling children contribute no code.
		return true
	}
	if rt.ID != "" {
		if verdict, known := ctx.walker.factsLookup(mode.factKind(), rt.ID); known {
			return verdict
		}
		if _, seen := visited[rt.ID]; seen {
			return true
		}
		visited[rt.ID] = struct{}{}
	}
	switch rt.Kind {

	case protocol.KindAny, protocol.KindUnknown,
		protocol.KindNull,
		protocol.KindString, protocol.KindNumber, protocol.KindBoolean,
		protocol.KindObject, protocol.KindEnum:
		// Atomic JSON-compatible kinds — both emitters' "" arms.
		return true

	case protocol.KindTemplateLiteral, protocol.KindIntersection:
		// String-flavoured at runtime / defensive-noop arms in both emitters.
		return true

	case protocol.KindUndefined:
		// pj: "" (JSON.stringify drops it natively). rj: `v = undefined`
		// force-rebind — real code.
		return mode == noopModePrepare

	case protocol.KindLiteral:
		// Primitive literals are noop in both emitters; bigint / symbol
		// literals carry value transforms.
		return literalFlavour(rt) == litPrimitive

	case protocol.KindArray:
		if rt.Child == nil {
			return true
		}
		return jsonNoopRecursive(rt.Child, ctx, mode, visited)

	case protocol.KindTuple:
		for _, child := range rt.Children {
			if !jsonNoopRecursive(child, ctx, mode, visited) {
				return false
			}
		}
		return true

	case protocol.KindTupleMember:
		// Optional tuple slots are never identity: emitTupleMember{PrepareFor,RestoreFrom}Json
		// normalize a present-but-undefined slot to `null` (arrays serialize a present
		// hole as null) even when the child is noop — unlike object properties, whose
		// absent optional is dropped natively by JSON.stringify. Object properties can
		// stay noop (emitPropertyPrepareForJson returns "" for a noop child regardless of
		// optionality); tuple members cannot.
		if rt.Optional {
			return false
		}
		if rt.Child == nil {
			return true
		}
		return jsonNoopRecursive(rt.Child, ctx, mode, visited)

	case protocol.KindProperty, protocol.KindPropertySignature:
		if rt.Child == nil {
			return true
		}
		resolved := ctx.ResolveRef(rt.Child)
		if resolved == nil {
			return true
		}
		// Directly DataOnly-stripped values (function-like / symbol / never /
		// Promise / non-serializable natives) are dropped slots in both
		// emitters — the same isStrippedUnionMember test strippedPropertyDrop
		// keys the drop on (the diagnostic-emitting wrapper stays with the
		// emitters; the predicate shares the pure decision). ONE exception on
		// the prepare (mutate) side: a stripped value that JSON.stringify would
		// serialize AS DATA (a Promise / a non-serializable native like a typed
		// array) is `delete`d from the live object so the mutate output matches
		// the data-only projection (emitPropertyPrepareForJson → jsonStringifyLeaks).
		// That delete is real code, so the property is NOT identity on encode.
		// The restore/compact side reads from already-parsed JSON (the key is
		// gone) and drops it with empty code, staying noop there.
		if isStrippedUnionMember(resolved) {
			if mode == noopModePrepare && jsonStringifyLeaks(resolved) {
				return false
			}
			return true
		}
		return jsonNoopRecursive(resolved, ctx, mode, visited)

	case protocol.KindIndexSignature:
		if rt.Child == nil {
			return true
		}
		// Symbol-keyed index signatures are skipped slots (skipRT).
		if isSymbolKeyedIndexSig(rt, ctx) {
			return true
		}
		return jsonNoopRecursive(rt.Child, ctx, mode, visited)

	case protocol.KindObjectLiteral:
		return jsonNoopObjectChildren(rt.Children, ctx, mode, visited)

	case protocol.KindClass:
		if protocol.IsTemporalSubKind(rt.SubKind) {
			// Encode rides the builtin toJSON(); decode rebuilds via
			// Temporal.<T>.from(v).
			return mode == noopModePrepare
		}
		switch rt.SubKind {
		case protocol.SubKindDate:
			// Encode rides Date#toJSON; decode rebuilds via new Date(v).
			return mode == noopModePrepare
		case protocol.SubKindMap, protocol.SubKindSet:
			// Iterable ↔ array-of-entries transforms on both halves.
			return false
		case protocol.SubKindNone:
			// Named user classes always emit the runtime class-serializer
			// registry branch (wrapPrepareWithClassSerializer /
			// wrapRestoreWithClassSerializer) — never identity. Anonymous
			// classes fall through to the structural object emit.
			if userClassName(rt) != "" {
				return false
			}
			return jsonNoopObjectChildren(rt.Children, ctx, mode, visited)
		}
		// SubKindNonSerializable and any future subkind: CodeNS arms.
		return false

	case protocol.KindUnion:
		return unionJsonNoop(rt, ctx)
	}
	// Void (`v = undefined` on both halves), BigInt / Symbol / Regexp
	// (value transforms), Never / Promise / function kinds (CodeNS), and
	// any future kind: not noop.
	return false
}

// jsonNoopObjectChildren mirrors the object emits' member walk — static and
// function-like members are skipped slots; every surviving property must be
// noop. Same skip set as objectChildrenCompat (json_compat.go).
func jsonNoopObjectChildren(children []*protocol.RunType, ctx *EmitContext, mode jsonNoopMode, visited map[string]struct{}) bool {
	for _, childRef := range children {
		resolved := ctx.ResolveRef(childRef)
		if resolved == nil {
			continue
		}
		if resolved.IsStatic {
			continue
		}
		if isFunctionLikeKind(resolved.Kind) {
			continue
		}
		if !jsonNoopRecursive(resolved, ctx, mode, visited) {
			return false
		}
	}
	return true
}

// unionJsonNoop mirrors the flat-union emitters' shared "" gates
// (emitUnionPrepareForJsonFlat / emitUnionRestoreFromJsonFlat + the
// buildFlatLayout bucketing they share, union_flat_layout.go): BOTH halves
// are identity exactly when the union round-trips raw — after
// DataOnly-stripping, EVERY member (atomic AND object/record bucket) is
// JSON-compatible. Mutate then has no transform to apply and emits no
// envelope (a compatible object member passes through untouched — mutate
// never strips), and the decoder has nothing to unwrap. A member carrying a
// transform forces the `[idx, value]` / `[-1, merged]` envelope on encode
// and the unwrap on decode — real code on both halves. Mirrors
// union_flat_layout.go's AtomicNeedsTuple = !roundTripsRaw. The degenerate
// all-dangling / empty layout emits nothing on either half (noop below); the
// all-stripped case does NOT — see the guard.
func unionJsonNoop(rt *protocol.RunType, ctx *EmitContext) bool {
	children := rt.SafeUnionChildren
	if len(children) == 0 {
		children = rt.Children
	}
	// All-stripped fallback — mirror dataOnlyUnionMembers (union_strip.go):
	// when EVERY member projects to `never` (all stripped) the DataOnly union
	// is `never`, so the emitter KEEPS the original member list, reaches a
	// stripped member's CodeNS leaf, and renders an alwaysThrow — NOT the
	// identity (buildFlatLayout buckets the non-serializable members, so the
	// empty-layout noop arm never fires). An all-dangling / empty union has no
	// stripped member here (isStrippedUnionMember(nil) is false) and stays noop
	// via the loop: dangling refs contribute no code on either half.
	strippedCount := 0
	for _, ref := range children {
		if isStrippedUnionMember(ctx.ResolveRef(ref)) {
			strippedCount++
		}
	}
	if len(children) > 0 && strippedCount == len(children) {
		return false
	}
	for _, ref := range children {
		resolved := ctx.ResolveRef(ref)
		if resolved == nil || isStrippedUnionMember(resolved) {
			// dataOnlyUnionMembers drops stripped members before bucketing.
			continue
		}
		// buildFlatLayout bucketing: object-like members carrying an index
		// signature fall into the ATOMIC bucket (dynamic keys can't merge).
		if isObjectLikeKind(resolved.Kind) && objectHasIndexSignatureChild(resolved, ctx) {
			if !isJsonCompatible(resolved, ctx) {
				return false
			}
			continue
		}
		if resolved.Kind == protocol.KindObjectLiteral || resolved.Kind == protocol.KindClass {
			if resolved.Kind == protocol.KindClass && resolved.SubKind != protocol.SubKindNone {
				if !isJsonCompatible(resolved, ctx) {
					return false
				}
				continue
			}
			// A named plain user class routes as an atomic member that forces the
			// `[idx, value]` envelope (buildFlatLayout.hasClassAtomic ⇒
			// AtomicNeedsTuple) and reconstructs the instance on decode via the
			// class-serializer restore wrapper — real code on both halves, never
			// identity, even though its props are JSON-compatible.
			if resolved.Kind == protocol.KindClass && userClassName(resolved) != "" {
				return false
			}
			// Object bucket — merges into the [-1, merged] envelope ONLY when it
			// carries a transform. A fully JSON-compatible object/record member
			// round-trips raw (roundTripsRaw ⇒ AtomicNeedsTuple false ⇒ identity
			// on both halves), so it no longer forces non-noop.
			if !isJsonCompatible(resolved, ctx) {
				return false
			}
			continue
		}
		if !isJsonCompatible(resolved, ctx) {
			return false
		}
	}
	return true
}

/** isNoopForPrepareJsonSafe reports whether the pjs (clone-encode) entry for rt is the identity. **/
// Mirrors PrepareForJsonSafeEmitter.Emit's noop arms: atomic JSON kinds
// (incl. undefined — the clone feeds native JSON.stringify), primitive
// literals, the defensive intersection / template-literal arms, and the
// extra-proof pass-through gates on arrays and tuples
// (emitArrayPrepareForJsonSafe / emitTuplePrepareForJsonSafe — an
// extra-proof subtree is shared by reference, `return v`). Objects and
// classes ALWAYS clone (the clone is what strips undeclared keys), so they
// are never noop here even when JSON-compatible; unions keep their
// guard-chain + throw like pj. No memo: the arms are O(1) except the
// already-memoized isExtraProof.
func isNoopForPrepareJsonSafe(rt *protocol.RunType, ctx *EmitContext) bool {
	rt = ctx.ResolveRef(rt)
	if rt == nil {
		return false
	}
	switch rt.Kind {
	case protocol.KindAny, protocol.KindUnknown,
		protocol.KindNull, protocol.KindUndefined,
		protocol.KindString, protocol.KindNumber, protocol.KindBoolean,
		protocol.KindObject, protocol.KindEnum,
		protocol.KindTemplateLiteral, protocol.KindIntersection:
		return true
	case protocol.KindLiteral:
		return literalFlavour(rt) == litPrimitive
	case protocol.KindArray:
		if rt.Child == nil {
			return true
		}
		return isExtraProof(ctx.ResolveRef(rt.Child), ctx)
	case protocol.KindTuple:
		if len(rt.Children) == 0 {
			return true
		}
		return isExtraProof(rt, ctx)
	}
	return false
}

/** isNoopForFormatTransform reports whether the fmt entry for rt is the identity. **/
// Mirrors FormatTransformEmitter.Emit exactly: the ONLY non-identity leaf is a
// string whose FormatAnnotation carries a value transform (nodeFormatTransform
// != ""); objects / user classes / properties / arrays / tuples recurse to
// reach one; EVERY other kind — unions included — is the emitter's identity
// default arm (MVP: transforms inside union / Map / Set arms are a follow-up).
// Unlike the JSON predicates the default arm is therefore TRUE; when an emit
// arm learns a new transform position, add the mirror arm here — the corpus
// test (noop_predicate_test.go) pins the unsound direction.
//
// fmt is publicly overridable (overrideFormatTransform), so a node carrying
// Overrides["fmt"] is never identity — the walker dep-calls its cfn redirect.
// The dispatch gate never consults the predicate for the DIRECT override child
// (overrideChild skips it), but a deeper descendant's override must falsify
// the walk here or the gate would elide the subtree that reaches the redirect.
func isNoopForFormatTransform(rt *protocol.RunType, ctx *EmitContext) bool {
	rt = ctx.ResolveRef(rt)
	if rt == nil {
		return false
	}
	if rt.ID != "" {
		if verdict, known := ctx.walker.factsLookup(factNoopFormatTransform, rt.ID); known {
			return verdict
		}
	}
	result := formatNoopRecursive(rt, ctx, make(map[string]struct{}))
	if rt.ID != "" {
		ctx.walker.factsStore(factNoopFormatTransform, rt.ID, result)
	}
	return result
}

func formatNoopRecursive(rt *protocol.RunType, ctx *EmitContext, visited map[string]struct{}) bool {
	rt = ctx.ResolveRef(rt)
	if rt == nil {
		// Mirrors the walker: nil / dangling children contribute no code.
		return true
	}
	if rt.ID != "" {
		if verdict, known := ctx.walker.factsLookup(factNoopFormatTransform, rt.ID); known {
			return verdict
		}
		if _, seen := visited[rt.ID]; seen {
			return true
		}
		visited[rt.ID] = struct{}{}
	}
	// An fmt-overridden node redirects to the user's cfn — real code on any
	// path that reaches it (see the doc comment above).
	if overrideHashForTag(rt, "fmt") != "" {
		return false
	}
	switch rt.Kind {

	case protocol.KindString:
		return nodeFormatTransform(rt, "v") == ""

	case protocol.KindObjectLiteral:
		return formatNoopObjectChildren(rt.Children, ctx, visited)

	case protocol.KindClass:
		if rt.SubKind == protocol.SubKindNone {
			// User classes recurse like objects (emitObjectFormat).
			return formatNoopObjectChildren(rt.Children, ctx, visited)
		}
		// Date / Map / Set / Temporal / builtins: identity arm.
		return true

	case protocol.KindProperty, protocol.KindPropertySignature:
		if rt.Child == nil {
			return true
		}
		resolved := ctx.ResolveRef(rt.Child)
		if resolved == nil || isFunctionLikeKind(resolved.Kind) {
			// Skipped slots in emitPropertyFormat.
			return true
		}
		return formatNoopRecursive(resolved, ctx, visited)

	case protocol.KindArray:
		if rt.Child == nil {
			return true
		}
		return formatNoopRecursive(rt.Child, ctx, visited)

	case protocol.KindTuple:
		for _, child := range rt.Children {
			if !formatNoopRecursive(child, ctx, visited) {
				return false
			}
		}
		return true

	case protocol.KindTupleMember:
		if rt.Child == nil {
			return true
		}
		return formatNoopRecursive(rt.Child, ctx, visited)
	}
	// Everything else mirrors the emitter's identity default arm (number /
	// boolean / union / intersection / enum / literal / index signature /
	// function kinds / …): the MVP emits no transform there.
	return true
}

// formatNoopObjectChildren mirrors emitObjectFormat's member walk — static and
// function-like members are skipped slots; every surviving property must be
// noop.
func formatNoopObjectChildren(children []*protocol.RunType, ctx *EmitContext, visited map[string]struct{}) bool {
	for _, childRef := range children {
		resolved := ctx.ResolveRef(childRef)
		if resolved == nil {
			continue
		}
		if resolved.IsStatic {
			continue
		}
		if isFunctionLikeKind(resolved.Kind) {
			continue
		}
		if !formatNoopRecursive(resolved, ctx, visited) {
			return false
		}
	}
	return true
}

/** isNoopForValidate reports whether the val entry for rt is `() => true`. **/
// Mirrors ValidateEmitter.Emit: only root any/unknown emit the bare `true`
// (every other kind emits a load-bearing check, and validate variants only
// reshape bodies that already check something). Applies identically to every
// ValidateOptions variant — options cannot make any/unknown check more.
func isNoopForValidate(rt *protocol.RunType, ctx *EmitContext) bool {
	rt = ctx.ResolveRef(rt)
	if rt == nil {
		return false
	}
	// A negation- or contains-bearing unknown is a REAL check (`!(child)` /
	// the occurrence count) — never the trivial `() => true`.
	if len(rt.Negations) > 0 || len(rt.Contains) > 0 || len(rt.PatternProps) > 0 || rt.PropNames != nil || len(rt.OneOf) > 0 {
		return false
	}
	return rt.Kind == protocol.KindAny || rt.Kind == protocol.KindUnknown
}

/** isNoopForValidationErrors reports whether the verr entry for rt is the
 *  error-list passthrough. **/
// Mirrors ValidationErrorsEmitter.Emit: only root any/unknown emit nothing.
func isNoopForValidationErrors(rt *protocol.RunType, ctx *EmitContext) bool {
	rt = ctx.ResolveRef(rt)
	if rt == nil {
		return false
	}
	// Negation- and contains-bearing nodes push real errors.
	if len(rt.Negations) > 0 || len(rt.Contains) > 0 || len(rt.PatternProps) > 0 || rt.PropNames != nil || len(rt.OneOf) > 0 {
		return false
	}
	return rt.Kind == protocol.KindAny || rt.Kind == protocol.KindUnknown
}

/** isNoopForStringifyJson reports whether the sj entry for rt is native
 *  JSON.stringify. **/
// ROOT-ONLY mirror of StringifyJsonEmitter.Emit's delegation arms — the kinds
// whose whole body is `return JSON.stringify(v)`: any/unknown/object (no
// schema info), string/template-literal, string-indexed (or index-less)
// enums, and primitive literals. Number/null roots emit `return String(v)`
// (String(NaN) is "NaN", native JSON yields "null") and booleans emit the
// ternary — not the native call, so they stay live. No recursion: every
// compound sj body builds the JSON text itself (extras stripped, declaration
// order), which native stringify does not reproduce. sj deliberately does NOT
// implement NoopComposeAround — see that interface's doc.
func isNoopForStringifyJson(rt *protocol.RunType, ctx *EmitContext) bool {
	rt = ctx.ResolveRef(rt)
	if rt == nil {
		return false
	}
	switch rt.Kind {
	case protocol.KindAny, protocol.KindUnknown, protocol.KindObject,
		protocol.KindString, protocol.KindTemplateLiteral:
		return true
	case protocol.KindEnum:
		// Number-indexed enums emit the bare value; string enums (and enums
		// with no IndexT) delegate to JSON.stringify.
		if rt.IndexT != nil {
			indexResolved := ctx.ResolveRef(rt.IndexT)
			if indexResolved != nil && indexResolved.Kind == protocol.KindNumber {
				return false
			}
		}
		return true
	case protocol.KindLiteral:
		return literalFlavour(rt) == litPrimitive
	}
	return false
}

/** isNoopForCompactFromJson reports whether the cjr entry for rt is the
 *  identity. **/
// Mirrors CompactFromJsonEmitter.Emit, which reuses restoreFromJson's arms
// EXCEPT at object positions — the positional→keyed rebuild is real work for
// every object shape restoreFromJson would let round-trip raw. Atomic and
// literal arms match rj; undefined/void force-rebind; Date/Temporal/Map/Set/
// classes rebuild; the union arm IS emitUnionRestoreFromJsonFlat, so its
// noop condition delegates to the shared restore-side union rule.
func isNoopForCompactFromJson(rt *protocol.RunType, ctx *EmitContext) bool {
	rt = ctx.ResolveRef(rt)
	if rt == nil {
		return false
	}
	if rt.ID != "" {
		if verdict, known := ctx.walker.factsLookup(factNoopCompactFromJson, rt.ID); known {
			return verdict
		}
	}
	result := compactFromJsonNoopRecursive(rt, ctx, make(map[string]struct{}))
	if rt.ID != "" {
		ctx.walker.factsStore(factNoopCompactFromJson, rt.ID, result)
	}
	return result
}

func compactFromJsonNoopRecursive(rt *protocol.RunType, ctx *EmitContext, visited map[string]struct{}) bool {
	rt = ctx.ResolveRef(rt)
	if rt == nil {
		return true
	}
	if rt.ID != "" {
		if verdict, known := ctx.walker.factsLookup(factNoopCompactFromJson, rt.ID); known {
			return verdict
		}
		if _, seen := visited[rt.ID]; seen {
			return true
		}
		visited[rt.ID] = struct{}{}
	}
	switch rt.Kind {

	case protocol.KindAny, protocol.KindUnknown,
		protocol.KindNull,
		protocol.KindString, protocol.KindNumber, protocol.KindBoolean,
		protocol.KindObject, protocol.KindEnum:
		return true

	case protocol.KindIntersection, protocol.KindTemplateLiteral:
		return true

	case protocol.KindLiteral:
		return literalFlavour(rt) == litPrimitive

	case protocol.KindObjectLiteral, protocol.KindClass:
		// Every object shape (and every class subkind — Date/Temporal/Map/Set
		// rebuild, plain classes take the positional rebuild + serializer
		// wrap) does real decode work under compact.
		return false

	case protocol.KindProperty, protocol.KindPropertySignature:
		if rt.Child == nil {
			return true
		}
		resolved := ctx.ResolveRef(rt.Child)
		if resolved == nil || isStrippedUnionMember(resolved) {
			return true
		}
		return compactFromJsonNoopRecursive(resolved, ctx, visited)

	case protocol.KindArray:
		if rt.Child == nil {
			return true
		}
		return compactFromJsonNoopRecursive(rt.Child, ctx, visited)

	case protocol.KindTuple:
		for _, child := range rt.Children {
			if !compactFromJsonNoopRecursive(child, ctx, visited) {
				return false
			}
		}
		return true

	case protocol.KindTupleMember:
		// Same rule as restoreFromJson: optional slots normalize (never
		// identity), required slots follow their child.
		if rt.Optional {
			return false
		}
		if rt.Child == nil {
			return true
		}
		return compactFromJsonNoopRecursive(rt.Child, ctx, visited)

	case protocol.KindIndexSignature:
		if rt.Child == nil || isSymbolKeyedIndexSig(rt, ctx) {
			return true
		}
		return compactFromJsonNoopRecursive(rt.Child, ctx, visited)

	case protocol.KindUnion:
		// The compact union arm IS emitUnionRestoreFromJsonFlat — delegate
		// to the shared flat-union rule (roundTripsRaw ⇒ identity).
		return unionJsonNoop(rt, ctx)
	}
	// undefined/void (force-rebind), bigint/symbol/regexp (value
	// transforms), never/promise/function kinds (unsupported), and any
	// future kind: not noop.
	return false
}

/** isNoopForToBinary reports whether the tb entry for rt writes no bytes. **/
// Mirrors ToBinaryEmitter.Emit: literals write nothing (the value is restored
// from the RunType at decode — v1 has no noLiterals), dropped property slots
// write nothing, and objects/tuples of only such members write nothing —
// PROVIDED no optional member forces the presence bitmap and no member
// carries a format annotation (binaryToOverride may write) or an index
// signature / rest slot (dynamic counts always serialize). Everything else —
// atoms, arrays (varint length prefix), unions (discriminant), enums,
// Date/Map/Set/classes — writes bytes.
func isNoopForToBinary(rt *protocol.RunType, ctx *EmitContext) bool {
	rt = ctx.ResolveRef(rt)
	if rt == nil {
		return false
	}
	if rt.ID != "" {
		if verdict, known := ctx.walker.factsLookup(factNoopToBinary, rt.ID); known {
			return verdict
		}
	}
	result := toBinaryNoopRecursive(rt, ctx, make(map[string]struct{}))
	if rt.ID != "" {
		ctx.walker.factsStore(factNoopToBinary, rt.ID, result)
	}
	return result
}

func toBinaryNoopRecursive(rt *protocol.RunType, ctx *EmitContext, visited map[string]struct{}) bool {
	rt = ctx.ResolveRef(rt)
	if rt == nil {
		return true
	}
	if rt.ID != "" {
		if verdict, known := ctx.walker.factsLookup(factNoopToBinary, rt.ID); known {
			return verdict
		}
		if _, seen := visited[rt.ID]; seen {
			return true
		}
		visited[rt.ID] = struct{}{}
	}
	// A format annotation may carry its own binary encode (binaryToOverride).
	if rt.FormatAnnotation != nil {
		return false
	}
	switch rt.Kind {

	case protocol.KindLiteral:
		// emitLiteralToBinary writes nothing for every flavour in v1.
		return true

	case protocol.KindProperty, protocol.KindPropertySignature:
		if rt.Optional {
			// Presence rides the parent object's bitmap — real bytes.
			return false
		}
		if rt.Child == nil {
			return true
		}
		resolved := ctx.ResolveRef(rt.Child)
		if resolved == nil || isStrippedUnionMember(resolved) {
			return true
		}
		return toBinaryNoopRecursive(resolved, ctx, visited)

	case protocol.KindObjectLiteral:
		return toBinaryNoopObjectChildren(rt, ctx, visited)

	case protocol.KindClass:
		if rt.SubKind == protocol.SubKindNone {
			// Named user classes always emit the runtime class-serializer
			// registry branch (wrapToBinaryWithClassSerializer) — never
			// identity, even when every member is a dropped/no-write slot
			// (`declare class C {p: never}`). Same rule as jsonNoopRecursive's
			// SubKindNone arm; anonymous classes stay structural.
			if userClassName(rt) != "" {
				return false
			}
			return toBinaryNoopObjectChildren(rt, ctx, visited)
		}
		return false

	case protocol.KindTuple:
		for _, childRef := range rt.Children {
			resolved := ctx.ResolveRef(childRef)
			if resolved == nil {
				continue
			}
			if resolved.Optional || isRestTupleMember(resolved) {
				// Optional slots ride the bitmap; rest slots write a count.
				return false
			}
			if !toBinaryNoopRecursive(resolved, ctx, visited) {
				return false
			}
		}
		return true

	case protocol.KindTupleMember:
		if rt.Optional || isRestTupleMember(rt) {
			return false
		}
		if rt.Child == nil {
			return true
		}
		return toBinaryNoopRecursive(rt.Child, ctx, visited)
	}
	// Atoms (even undefined/void write a sentinel), any/unknown/object
	// (serString of the JSON form), arrays (length prefix), unions
	// (discriminant), enums, index signatures (key count), Date / Temporal /
	// Map / Set / builtins, and any future kind: bytes are written.
	return false
}

// toBinaryNoopObjectChildren mirrors emitObjectToBinary's member walk: a
// call-signature-carrying interface is function-like (never noop here — the
// emit is CodeNS), an index signature writes the dynamic key count, an
// optional member forces the presence bitmap, static and function-like slots
// are skipped, and every surviving member must itself write nothing.
func toBinaryNoopObjectChildren(rt *protocol.RunType, ctx *EmitContext, visited map[string]struct{}) bool {
	if objectHasCallSignature(rt, ctx) {
		return false
	}
	for _, childRef := range rt.Children {
		resolved := ctx.ResolveRef(childRef)
		if resolved == nil {
			continue
		}
		if resolved.IsStatic || isFunctionLikeKind(resolved.Kind) {
			continue
		}
		if resolved.Kind == protocol.KindIndexSignature {
			return false
		}
		if resolved.Optional {
			return false
		}
		if !toBinaryNoopRecursive(resolved, ctx, visited) {
			return false
		}
	}
	return true
}

// unknownKeysNoopSpec parameterises the shared unknown-keys predicate across
// the five family variants — the families differ in what they DO at a node,
// and (in exactly two spots) in WHETHER a node emits at all.
type unknownKeysNoopSpec struct {
	// fact is the family's own memo lane (verdicts differ per family).
	fact factKind
	// tupleAlwaysNoop — uku / ukuw no-op at tuples by design
	// (emitTupleUnknownKeysToUndefined); has / strip / errors recurse.
	tupleAlwaysNoop bool
	// mapSetAlwaysNoop — ukuw keeps the Map/Set arm noop on the wire side
	// (the instanceof check cannot match the still-parsed array); the other
	// four recurse into the iterable's inner types.
	mapSetAlwaysNoop bool
}

var (
	hasUnknownKeysNoopSpec         = unknownKeysNoopSpec{fact: factNoopHasUnknownKeys}
	unknownKeyErrorsNoopSpec       = unknownKeysNoopSpec{fact: factNoopUnknownKeyErrors}
	unknownKeysToUndefinedNoopSpec = unknownKeysNoopSpec{fact: factNoopUnknownKeysToUndefined, tupleAlwaysNoop: true}
	unknownKeysToUndefinedWireSpec = unknownKeysNoopSpec{fact: factNoopUnknownKeysToUndefinedWire, tupleAlwaysNoop: true, mapSetAlwaysNoop: true}
)

/** isNoopForUnknownKeys reports whether an unknown-keys family entry for rt
 *  is the family identity. **/
// Shared mirror of the five emitters' common arms (unknownkeys_arms.go /
// unknownkeys_shared.go): the only key-carrying position is an object with
// statically-declared names (the parent allowlist probe) or a
// template-literal-keyed index signature (the pattern sweep); everything
// else recurses or no-ops. Per-family divergences ride unknownKeysNoopSpec.
func isNoopForUnknownKeys(rt *protocol.RunType, ctx *EmitContext, spec unknownKeysNoopSpec) bool {
	rt = ctx.ResolveRef(rt)
	if rt == nil {
		return false
	}
	if rt.ID != "" {
		if verdict, known := ctx.walker.factsLookup(spec.fact, rt.ID); known {
			return verdict
		}
	}
	result := unknownKeysNoopRecursive(rt, ctx, spec, make(map[string]struct{}))
	if rt.ID != "" {
		ctx.walker.factsStore(spec.fact, rt.ID, result)
	}
	return result
}

func unknownKeysNoopRecursive(rt *protocol.RunType, ctx *EmitContext, spec unknownKeysNoopSpec, visited map[string]struct{}) bool {
	rt = ctx.ResolveRef(rt)
	if rt == nil {
		return true
	}
	if rt.ID != "" {
		if verdict, known := ctx.walker.factsLookup(spec.fact, rt.ID); known {
			return verdict
		}
		if _, seen := visited[rt.ID]; seen {
			return true
		}
		visited[rt.ID] = struct{}{}
	}
	switch rt.Kind {

	case protocol.KindObjectLiteral:
		return unknownKeysNoopObject(rt, ctx, spec, visited)

	case protocol.KindClass:
		switch rt.SubKind {
		case protocol.SubKindNone:
			return unknownKeysNoopObject(rt, ctx, spec, visited)
		case protocol.SubKindMap, protocol.SubKindSet:
			if spec.mapSetAlwaysNoop {
				return true
			}
			for _, innerType := range iterableInnerTypes(rt, ctx) {
				if innerType == nil {
					continue
				}
				if !unknownKeysNoopRecursive(innerType, ctx, spec, visited) {
					return false
				}
			}
			return true
		}
		// Date / Temporal / NonSerializable / future subkinds: no keys to
		// manage — every family's arm returns empty there.
		return true

	case protocol.KindProperty, protocol.KindPropertySignature:
		if rt.Child == nil {
			return true
		}
		resolved := ctx.ResolveRef(rt.Child)
		if resolved == nil || isFunctionLikeKind(resolved.Kind) || resolved.IsStatic {
			return true
		}
		return unknownKeysNoopRecursive(resolved, ctx, spec, visited)

	case protocol.KindArray:
		if rt.Child == nil {
			return true
		}
		resolved := ctx.ResolveRef(rt.Child)
		if resolved == nil || protocol.FamilyOf(resolved.Kind) == protocol.FamilyAtomic {
			return true
		}
		return unknownKeysNoopRecursive(resolved, ctx, spec, visited)

	case protocol.KindTuple:
		if spec.tupleAlwaysNoop {
			return true
		}
		for _, child := range rt.Children {
			if !unknownKeysNoopRecursive(child, ctx, spec, visited) {
				return false
			}
		}
		return true

	case protocol.KindTupleMember:
		if spec.tupleAlwaysNoop {
			return true
		}
		if rt.Child == nil {
			return true
		}
		resolved := ctx.ResolveRef(rt.Child)
		if resolved == nil || protocol.FamilyOf(resolved.Kind) == protocol.FamilyAtomic {
			return true
		}
		return unknownKeysNoopRecursive(resolved, ctx, spec, visited)

	case protocol.KindIndexSignature:
		return unknownKeysNoopIndexSignature(rt, ctx, spec, visited)

	case protocol.KindUnion:
		return unknownKeysNoopUnion(rt, ctx)
	}
	// Atoms, never, functions, promises, intersections, template literals:
	// no keys to manage.
	return true
}

// unknownKeysNoopObject mirrors the shared object arm: without an index
// signature ANY named child (function-typed and static names included — the
// allowlist covers them) triggers the parent probe; with one, the parent
// probe is suppressed and the children decide.
func unknownKeysNoopObject(rt *protocol.RunType, ctx *EmitContext, spec unknownKeysNoopSpec, visited map[string]struct{}) bool {
	hasIndex := objectHasIndexSignatureChild(rt, ctx)
	if !hasIndex {
		for _, childRef := range rt.Children {
			resolved := ctx.ResolveRef(childRef)
			if resolved == nil || resolved.Kind == protocol.KindIndexSignature {
				continue
			}
			if resolved.Name != "" {
				// callCheckUnknownPropertiesForHas emits the probe.
				return false
			}
		}
	}
	for _, childRef := range rt.Children {
		resolved := ctx.ResolveRef(childRef)
		if resolved == nil {
			continue
		}
		if resolved.IsStatic || isFunctionLikeKind(resolved.Kind) {
			continue
		}
		if !unknownKeysNoopRecursive(resolved, ctx, spec, visited) {
			return false
		}
	}
	return true
}

// unknownKeysNoopIndexSignature mirrors the shared index-signature arm: a
// template-literal key pattern always sweeps (real code); otherwise atomic
// values have nothing to recurse into and every key is "known".
func unknownKeysNoopIndexSignature(rt *protocol.RunType, ctx *EmitContext, spec unknownKeysNoopSpec, visited map[string]struct{}) bool {
	if rt.Child == nil || isSymbolKeyedIndexSig(rt, ctx) {
		return true
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil || isFunctionLikeKind(resolved.Kind) {
		return true
	}
	if rt.Index != nil {
		indexResolved := ctx.ResolveRef(rt.Index)
		if indexResolved != nil && indexResolved.Kind == protocol.KindTemplateLiteral {
			if _, ok := buildTemplateLiteralRegex(indexResolved); ok {
				return false
			}
		}
	}
	if protocol.FamilyOf(resolved.Kind) == protocol.FamilyAtomic {
		return true
	}
	return unknownKeysNoopRecursive(resolved, ctx, spec, visited)
}

// unknownKeysNoopUnion mirrors emitUnionUnknownKeysMerged's empty-emit
// conditions (identical across all five families — the wire flag changes
// only the body shape): any object-like member carrying an index signature
// kills the merged allowlist for the whole union; with no object members —
// or object members exposing no named properties to merge — there is
// nothing to sweep. Member stripping mirrors dataOnlyUnionMembers via the
// same isStrippedUnionMember helper.
func unknownKeysNoopUnion(rt *protocol.RunType, ctx *EmitContext) bool {
	children := rt.SafeUnionChildren
	if len(children) == 0 {
		children = rt.Children
	}
	anyObjectMember := false
	anyMergedProp := false
	for _, ref := range children {
		resolved := ctx.ResolveRef(ref)
		if resolved == nil || isStrippedUnionMember(resolved) {
			continue
		}
		if isObjectLikeKind(resolved.Kind) && objectHasIndexSignatureChild(resolved, ctx) {
			// buildFlatLayout's index-sig carve-out — the whole family no-ops.
			return true
		}
		if resolved.Kind != protocol.KindObjectLiteral && (resolved.Kind != protocol.KindClass || resolved.SubKind != protocol.SubKindNone) {
			continue
		}
		anyObjectMember = true
		for _, memberChild := range resolved.Children {
			prop := ctx.ResolveRef(memberChild)
			if prop == nil || prop.IsStatic || isFunctionLikeKind(prop.Kind) {
				continue
			}
			if (prop.Kind == protocol.KindProperty || prop.Kind == protocol.KindPropertySignature) && prop.Name != "" {
				anyMergedProp = true
			}
		}
	}
	return !anyObjectMember || !anyMergedProp
}

// NoopPredicateAgreement is the corpus-test surface: it returns the emitter
// predicate's verdict for rt alongside the GROUND-TRUTH noop flag obtained by
// compiling rt with the dispatch gate disabled and full inlining (allInternal
// — so nothing externalizes except true cycles, and Finalize's shape check
// sees the whole body). comparable=false when the emitter has no predicate or
// doesn't support rt. An unsupported compile reports groundTruth=false (an
// alwaysThrow entry is not the identity). Callers assert the soundness
// direction: verdict ⇒ groundTruth. Exported for internal/resolver's
// noop-predicate corpus test; not part of the render pipeline.
func NoopPredicateAgreement(emitter Emitter, rt *protocol.RunType, refTable map[string]*protocol.RunType, facts *FactsTable) (verdict bool, groundTruth bool, comparable bool) {
	predicate, hasPredicate := emitter.(NoopTypePredicate)
	if !hasPredicate || rt == nil || !emitter.Supports(rt) {
		return false, false, false
	}
	predicateWalker := NewWalker(rt, "agreement", emitter)
	predicateWalker.RefTable = refTable
	predicateWalker.facts = facts
	predicateCtx := predicateWalker.getEmitContext(predicateWalker.Vλl)
	verdict = predicate.IsNoopType(rt, predicateCtx)
	predicateWalker.putEmitContext(predicateCtx)

	groundTruthWalker := NewWalker(rt, "agreement", emitter)
	groundTruthWalker.RefTable = refTable
	groundTruthWalker.facts = facts
	groundTruthWalker.disableNoopElision = true
	groundTruthWalker.inlineCtx.InlineAllInternal = true
	_, groundTruth, isUnsupported := groundTruthWalker.Compile()
	if isUnsupported {
		groundTruth = false
	}
	return verdict, groundTruth, true
}
