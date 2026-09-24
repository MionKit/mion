package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// Semantic noop predicates, "would this family's entry for T be the family identity fn?", decided over the
// TYPE GRAPH rather than the emitted code shape: Finalize's shape check only sees what the walker INLINED,
// never through a call boundary (an external dep call, a circular type, a JSON composite binding its
// primitives). The walker's dispatch gate consults these predicates before emitting a dep call, and the
// composite collector keys binding elision on the rendered entries' IsNoop flags.
//
// SOUNDNESS CONTRACT, one-directional: predicate true ⇒ the family's emitted body for T is the family
// identity. A false negative only costs bytes, the dep call stays; a false positive silently skips a real
// transform, which is data corruption. Every arm below therefore MIRRORS its emitter's per-kind dispatch
// (json_prepare.go / json_restore.go / json_prepare_clone.go / union_flat.go), and answers false when in
// doubt. The mirror is pinned by the resolver's corpus test (noop_predicate_test.go), which asserts
// verdict=true ⇒ the gate-disabled fully-inlined compile collapses to a noop body, over every fixture type.
//
// Cycles: re-entry on an in-walk id is assumed noop (greatest fixpoint, the isJsonCompatible rule), a cycle
// being identity unless some node demands a transform, which falsifies the walk on its own path. Memoization
// stores only COMPLETED top-level verdicts, since an intermediate node's in-walk value can depend on the
// cycle-back assumption for an ancestor still on the stack.

// NoopTypePredicate is the Emitter capability deciding "is this family's entry for T the family identity?"
// over the TYPE GRAPH. EVERY family implements it: the noop VERDICT is the predicate's, never the emitted
// text's. Finalize's shape result survives only as the renderer's tripwire, a predicate claiming noop while
// the compiled body disagrees ships the live body and logs (renderEntryWithDeps).
//
// Each predicate mirrors ITS OWN emitter arm by arm, and where an emitter arm delegates to another family's
// helpers the predicate arm delegates to that family's predicate the same way (compactForJson reuses
// prepareForJsonClone's wholesale, their diverging object arms agreeing on never-noop; compactFromJson
// delegates restoreFromJsonMutate's shared arms but answers false at its own object arms, where the raw
// round-trip does NOT hold for the positional rebuild). Where an emitter decides a slot through a helper
// (isStrippedUnionMember, objectHasIndexSignatureChild, iterableInnerTypes, literalFlavour, …), the predicate
// calls the SAME helper so that arm cannot drift.
type NoopTypePredicate interface {
	IsNoopType(rt *reflection.RunType, ctx *EmitContext) bool
}

// NoopComposeAround marks the families whose predicate may feed the walker's dispatch-time noop gate, which
// replaces a noop child's dep call with EMPTY code: sound only where a noop child means leaving the value,
// error list or byte stream untouched. Two families must stay OFF the gate: a stringifyJson parent
// concatenates the child call's returned JSON FRAGMENT, so empty code silently drops the property from the
// output, and a fromBinary parent advances positionally, so a skipped child decode desynchronizes every
// later read.
type NoopComposeAround interface {
	NoopTypePredicate
	// NoopChildComposesAround is a marker method: implementing it claims empty code composes correctly here.
	NoopChildComposesAround()
}

// jsonNoopMode selects the encode (prepareForJson) or decode (restoreFromJsonMutate) arm table of the shared
// JSON-transform predicate. The two diverge exactly where the emitters do: Date / Temporal are noop on encode
// (native toJSON) but rebuild on decode, `undefined` is noop on encode but force-rebinds on decode, and a
// union always emits the guard chain + mismatch throw on encode but rides raw on decode when nothing wraps.
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
func isNoopForPrepareJson(rt *reflection.RunType, ctx *EmitContext) bool {
	return jsonNoopTopLevel(rt, ctx, noopModePrepare)
}

/** isNoopForRestoreJson reports whether the rj (decode) entry for rt is the identity. **/
// Two halves: the SHAPE half (does any value need rebuilding) and the KEY-GUARD half (does the decoder ship
// the prototype-name refusal loop). A decoder over `Record<string, string>` rebuilds nothing but still
// refuses `__proto__` as a wire key, and an entry claiming noop while carrying that guard would be elided by
// the composite and the guard lost. The shape half alone keeps deciding the flat-union envelope, so the wire
// format does not move.
func isNoopForRestoreJson(rt *reflection.RunType, ctx *EmitContext) bool {
	return jsonNoopTopLevel(rt, ctx, noopModeRestore) && !restoreKeyGuardReachable(rt, ctx)
}

// restoreKeyGuardReachable reports whether the decoders' key loop (the prototype-name refusal in
// emitIndexSignatureRestoreFromJson, shared by the compact road) is compiled somewhere under rt, mirroring
// the decoders' OWN descent to an index signature. It stops at a union: one that round-trips raw emits no
// member code at all (its keys reach validate, which refuses them), and one carrying an envelope is already
// non-noop through the shape half.
func restoreKeyGuardReachable(rt *reflection.RunType, ctx *EmitContext) bool {
	rt = ctx.ResolveRef(rt)
	if rt == nil {
		return false
	}
	if rt.ID != "" {
		if verdict, known := ctx.walker.factsLookup(factRestoreKeyGuard, rt.ID); known {
			return verdict
		}
	}
	result := restoreKeyGuardRecursive(rt, ctx, make(map[string]struct{}))
	if rt.ID != "" {
		ctx.walker.factsStore(factRestoreKeyGuard, rt.ID, result)
	}
	return result
}

func restoreKeyGuardRecursive(rt *reflection.RunType, ctx *EmitContext, visited map[string]struct{}) bool {
	rt = ctx.ResolveRef(rt)
	if rt == nil {
		return false
	}
	if rt.ID != "" {
		if verdict, known := ctx.walker.factsLookup(factRestoreKeyGuard, rt.ID); known {
			return verdict
		}
		if _, seen := visited[rt.ID]; seen {
			return false
		}
		visited[rt.ID] = struct{}{}
	}
	switch rt.Kind {
	case reflection.KindIndexSignature:
		if rt.Child == nil || isSymbolKeyedIndexSig(rt, ctx) {
			return false
		}
		child := ctx.ResolveRef(rt.Child)
		return child != nil && !isFunctionLikeKind(child.Kind)
	case reflection.KindObjectLiteral:
		return restoreKeyGuardInMembers(rt, ctx, visited)
	case reflection.KindClass:
		switch rt.SubKind {
		case reflection.SubKindNone:
			return restoreKeyGuardInMembers(rt, ctx, visited)
		case reflection.SubKindMap, reflection.SubKindSet:
			for _, argument := range rt.Arguments {
				if wrapper := ctx.ResolveRef(argument); wrapper != nil && restoreKeyGuardRecursive(wrapper.Child, ctx, visited) {
					return true
				}
			}
		}
		return false
	case reflection.KindProperty, reflection.KindPropertySignature:
		if child := ctx.ResolveRef(rt.Child); child == nil || strippedPropertyDrop(child, rt.Name, ctx) {
			return false
		}
		return restoreKeyGuardRecursive(rt.Child, ctx, visited)
	case reflection.KindTupleMember, reflection.KindRest, reflection.KindArray:
		return restoreKeyGuardRecursive(rt.Child, ctx, visited)
	case reflection.KindTuple:
		for _, child := range rt.Children {
			if restoreKeyGuardRecursive(child, ctx, visited) {
				return true
			}
		}
	}
	return false
}

// restoreKeyGuardInMembers is the object arm: a static or function-like member never compiles.
func restoreKeyGuardInMembers(rt *reflection.RunType, ctx *EmitContext, visited map[string]struct{}) bool {
	for _, childRef := range objectMembers(rt) {
		member := ctx.ResolveRef(childRef)
		if member == nil || member.IsStatic || isFunctionLikeKind(member.Kind) {
			continue
		}
		if restoreKeyGuardRecursive(member, ctx, visited) {
			return true
		}
	}
	return false
}

// jsonNoopTopLevel is the memo wrapper, storing completed walks only, like isJsonCompatible.
func jsonNoopTopLevel(rt *reflection.RunType, ctx *EmitContext, mode jsonNoopMode) bool {
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

func jsonNoopRecursive(rt *reflection.RunType, ctx *EmitContext, mode jsonNoopMode, visited map[string]struct{}) bool {
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

	case reflection.KindAny, reflection.KindUnknown,
		reflection.KindNull,
		reflection.KindString, reflection.KindNumber, reflection.KindBoolean,
		reflection.KindObject, reflection.KindEnum:
		// Atomic JSON-compatible kinds: both emitters' "" arms.
		return true

	case reflection.KindTemplateLiteral, reflection.KindIntersection:
		// String-flavoured at runtime, the defensive-noop arm in both emitters.
		return true

	case reflection.KindUndefined:
		// pj: "", JSON.stringify drops it natively. rj: a `v = undefined` force-rebind, real code.
		return mode == noopModePrepare

	case reflection.KindLiteral:
		// bigint / symbol literals carry value transforms, primitive ones do not.
		return literalFlavour(rt) == litPrimitive

	case reflection.KindArray:
		if rt.Child == nil {
			return true
		}
		return jsonNoopRecursive(rt.Child, ctx, mode, visited)

	case reflection.KindTuple:
		for _, child := range rt.Children {
			if !jsonNoopRecursive(child, ctx, mode, visited) {
				return false
			}
		}
		return true

	case reflection.KindTupleMember:
		// An optional tuple slot is never identity: the emitters normalize a present-but-undefined slot to
		// `null` even when the child is noop. An optional object property can stay noop instead, JSON.stringify
		// dropping an absent one natively.
		if rt.Optional {
			return false
		}
		if rt.Child == nil {
			return true
		}
		return jsonNoopRecursive(rt.Child, ctx, mode, visited)

	case reflection.KindProperty, reflection.KindPropertySignature:
		if rt.Child == nil {
			return true
		}
		resolved := ctx.ResolveRef(rt.Child)
		if resolved == nil {
			return true
		}
		// A DataOnly-stripped value (function-like / symbol / never / Promise / non-serializable native) is a
		// dropped slot in both emitters, keyed on the same isStrippedUnionMember test strippedPropertyDrop uses.
		// ONE exception on the prepare (mutate) side: a stripped value JSON.stringify would serialize AS DATA
		// (a Promise, a typed array) is `delete`d from the live object so the output matches the data-only
		// projection, and that delete is real code. The restore / compact side reads already-parsed JSON, where
		// the key is gone, and drops it with empty code.
		if isStrippedUnionMember(resolved) {
			if mode == noopModePrepare && jsonStringifyLeaks(resolved) {
				return false
			}
			return true
		}
		return jsonNoopRecursive(resolved, ctx, mode, visited)

	case reflection.KindIndexSignature:
		if rt.Child == nil {
			return true
		}
		// A symbol-keyed index signature is a skipped slot.
		if isSymbolKeyedIndexSig(rt, ctx) {
			return true
		}
		return jsonNoopRecursive(rt.Child, ctx, mode, visited)

	case reflection.KindObjectLiteral:
		return jsonNoopObjectChildren(objectMembers(rt), ctx, mode, visited)

	case reflection.KindClass:
		if reflection.IsTemporalSubKind(rt.SubKind) {
			// Encode uses the builtin toJSON(), decode rebuilds via Temporal.<T>.from(v).
			return mode == noopModePrepare
		}
		switch rt.SubKind {
		case reflection.SubKindDate:
			// Encode uses Date#toJSON, decode rebuilds via new Date(v).
			return mode == noopModePrepare
		case reflection.SubKindMap, reflection.SubKindSet:
			// Iterable ↔ array-of-entries transforms on both halves.
			return false
		case reflection.SubKindNone:
			// A named user class always emits the runtime class-serializer registry branch, never identity; an
			// anonymous one falls through to the structural object emit.
			if userClassName(rt) != "" {
				return false
			}
			return jsonNoopObjectChildren(objectMembers(rt), ctx, mode, visited)
		}
		// SubKindNonSerializable and any future subkind: CodeNS arms.
		return false

	case reflection.KindUnion:
		return unionJsonNoop(rt, ctx)
	}
	// Void (`v = undefined` on both halves), BigInt / Symbol / Regexp (value transforms), Never / Promise /
	// function kinds (CodeNS), and any future kind: not noop.
	return false
}

// jsonNoopObjectChildren mirrors the object emits' member walk: a static or function-like member is a
// skipped slot, every surviving property must be noop. Same skip set as objectChildrenCompat (json_compat.go).
func jsonNoopObjectChildren(children []*reflection.RunType, ctx *EmitContext, mode jsonNoopMode, visited map[string]struct{}) bool {
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

// unionJsonNoop mirrors the flat-union emitters' shared "" gates and the buildFlatLayout bucketing they
// share (union_flat_layout.go, AtomicNeedsTuple = !roundTripsRaw): BOTH halves are identity exactly when the
// union round-trips raw, every member JSON-compatible after DataOnly-stripping, so mutate has no transform to
// apply and no envelope to emit and the decoder nothing to unwrap. A member carrying a transform forces the
// `[idx, value]` / `[-1, merged]` envelope on encode and the unwrap on decode. The degenerate all-dangling /
// empty layout emits nothing on either half; the all-stripped case does NOT, see the guard.
func unionJsonNoop(rt *reflection.RunType, ctx *EmitContext) bool {
	children := rt.SafeUnionChildren
	if len(children) == 0 {
		children = rt.Children
	}
	// All-stripped fallback, mirroring dataOnlyUnionMembers (union_strip.go): when EVERY member projects to
	// `never` the DataOnly union is `never`, so the emitter KEEPS the original member list, reaches a stripped
	// member's CodeNS leaf and renders an alwaysThrow, not the identity. An all-dangling / empty union has no
	// stripped member here (isStrippedUnionMember(nil) is false) and stays noop via the loop.
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
		// buildFlatLayout bucketing: an object-like member with an index signature falls into the ATOMIC bucket,
		// dynamic keys being unmergeable.
		if isObjectLikeKind(resolved.Kind) && objectHasIndexSignatureChild(resolved, ctx) {
			if !isJsonCompatible(resolved, ctx) {
				return false
			}
			continue
		}
		if resolved.Kind == reflection.KindObjectLiteral || resolved.Kind == reflection.KindClass {
			if resolved.Kind == reflection.KindClass && resolved.SubKind != reflection.SubKindNone {
				if !isJsonCompatible(resolved, ctx) {
					return false
				}
				continue
			}
			// A named plain user class routes as an atomic member forcing the `[idx, value]` envelope
			// (buildFlatLayout.hasClassAtomic ⇒ AtomicNeedsTuple) and reconstructs the instance on decode, real
			// code on both halves even though its props are JSON-compatible.
			if resolved.Kind == reflection.KindClass && userClassName(resolved) != "" {
				return false
			}
			// Object bucket: merges into the [-1, merged] envelope ONLY when it carries a transform, a fully
			// JSON-compatible object / record member round-tripping raw instead.
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
// Mirrors PrepareForJsonCloneEmitter.Emit's noop arms: atomic JSON kinds (undefined included, the clone feeds
// native JSON.stringify), primitive literals, the defensive intersection / template-literal arms, and the
// extra-proof pass-through gates on arrays and tuples, an extra-proof subtree being shared by reference.
// An object or class ALWAYS clones, the clone being what strips undeclared keys, so it is never noop here
// even when JSON-compatible; a union keeps its guard chain + throw like pj. No memo: the arms are O(1) apart
// from the already-memoized isExtraProof.
func isNoopForPrepareJsonSafe(rt *reflection.RunType, ctx *EmitContext) bool {
	rt = ctx.ResolveRef(rt)
	if rt == nil {
		return false
	}
	switch rt.Kind {
	case reflection.KindAny, reflection.KindUnknown,
		reflection.KindNull, reflection.KindUndefined,
		reflection.KindString, reflection.KindNumber, reflection.KindBoolean,
		reflection.KindObject, reflection.KindEnum,
		reflection.KindTemplateLiteral, reflection.KindIntersection:
		return true
	case reflection.KindLiteral:
		return literalFlavour(rt) == litPrimitive
	case reflection.KindArray:
		if rt.Child == nil {
			return true
		}
		return isExtraProof(ctx.ResolveRef(rt.Child), ctx)
	case reflection.KindTuple:
		if len(rt.Children) == 0 {
			return true
		}
		return isExtraProof(rt, ctx)
	}
	return false
}

/** isNoopForFormatTransform reports whether the fmt entry for rt is the identity. **/
// Mirrors FormatTransformEmitter.Emit exactly: the ONLY non-identity leaf is a string whose FormatAnnotation
// carries a value transform, objects / user classes / properties / arrays / tuples recurse to reach one, and
// every other kind, unions included, is the emitter's identity default arm. Unlike the JSON predicates the
// default arm is therefore TRUE; when an emit arm learns a new transform position, add the mirror arm here.
// fmt is publicly overridable, so a node carrying Overrides["fmt"] is never identity, the walker dep-calling
// its cfn redirect. The dispatch gate skips the predicate for the DIRECT override child, but a deeper
// descendant's override must falsify the walk here, or the gate would elide the subtree reaching the redirect.
func isNoopForFormatTransform(rt *reflection.RunType, ctx *EmitContext) bool {
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

func formatNoopRecursive(rt *reflection.RunType, ctx *EmitContext, visited map[string]struct{}) bool {
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
	// An fmt-overridden node redirects to the user's cfn, real code on any path reaching it.
	if overrideHashForTag(rt, "fmt") != "" {
		return false
	}
	switch rt.Kind {

	case reflection.KindString:
		return nodeFormatTransform(rt, "v") == ""

	case reflection.KindObjectLiteral:
		return formatNoopObjectChildren(objectMembers(rt), ctx, visited)

	case reflection.KindClass:
		if rt.SubKind == reflection.SubKindNone {
			// User classes recurse like objects (emitObjectFormat).
			return formatNoopObjectChildren(objectMembers(rt), ctx, visited)
		}
		// Date / Map / Set / Temporal / builtins: identity arm.
		return true

	case reflection.KindProperty, reflection.KindPropertySignature:
		if rt.Child == nil {
			return true
		}
		resolved := ctx.ResolveRef(rt.Child)
		if resolved == nil || isFunctionLikeKind(resolved.Kind) {
			// Skipped slots in emitPropertyFormat.
			return true
		}
		return formatNoopRecursive(resolved, ctx, visited)

	case reflection.KindArray:
		if rt.Child == nil {
			return true
		}
		return formatNoopRecursive(rt.Child, ctx, visited)

	case reflection.KindTuple:
		for _, child := range rt.Children {
			if !formatNoopRecursive(child, ctx, visited) {
				return false
			}
		}
		return true

	case reflection.KindTupleMember:
		if rt.Child == nil {
			return true
		}
		return formatNoopRecursive(rt.Child, ctx, visited)
	}
	// Everything else mirrors the emitter's identity default arm (number / boolean / union / intersection /
	// enum / literal / index signature / function kinds / …), which emits no transform.
	return true
}

// formatNoopObjectChildren mirrors emitObjectFormat's member walk: a static or function-like member is a
// skipped slot, every surviving property must be noop.
func formatNoopObjectChildren(children []*reflection.RunType, ctx *EmitContext, visited map[string]struct{}) bool {
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
// Mirrors ValidateEmitter.Emit: only a root any / unknown emits the bare `true`, every other kind emitting a
// load-bearing check. Identical for every ValidateOptions variant: options cannot make any/unknown check more.
func isNoopForValidate(rt *reflection.RunType, ctx *EmitContext) bool {
	rt = ctx.ResolveRef(rt)
	if rt == nil {
		return false
	}
	// A contains-bearing unknown is a REAL check (the occurrence count), never the trivial `() => true`.
	if len(rt.Contains) > 0 || len(rt.PatternProps) > 0 || len(rt.PropNames) > 0 {
		return false
	}
	return rt.Kind == reflection.KindAny || rt.Kind == reflection.KindUnknown
}

/** isNoopForValidationErrors reports whether the verr entry for rt is the
 *  error-list passthrough. **/
// Mirrors ValidationErrorsEmitter.Emit: only root any/unknown emit nothing.
func isNoopForValidationErrors(rt *reflection.RunType, ctx *EmitContext) bool {
	rt = ctx.ResolveRef(rt)
	if rt == nil {
		return false
	}
	// Contains-bearing nodes push real errors.
	if len(rt.Contains) > 0 || len(rt.PatternProps) > 0 || len(rt.PropNames) > 0 {
		return false
	}
	return rt.Kind == reflection.KindAny || rt.Kind == reflection.KindUnknown
}

/** isNoopForStringifyJson reports whether the sj entry for rt is native
 *  JSON.stringify. **/
// ROOT-ONLY mirror of StringifyJsonEmitter.Emit's delegation arms, the kinds whose whole body is
// `return JSON.stringify(v)`. A number / null root emits `return String(v)` instead (String(NaN) is "NaN"
// where native JSON yields "null") and a boolean the ternary, so both stay live. No recursion: every compound
// sj body builds the JSON text itself, extras stripped and in declaration order, which native stringify does
// not reproduce. sj deliberately does NOT implement NoopComposeAround, see that interface's doc.
func isNoopForStringifyJson(rt *reflection.RunType, ctx *EmitContext) bool {
	rt = ctx.ResolveRef(rt)
	if rt == nil {
		return false
	}
	switch rt.Kind {
	case reflection.KindAny, reflection.KindUnknown, reflection.KindObject,
		reflection.KindString, reflection.KindTemplateLiteral:
		return true
	case reflection.KindEnum:
		// A number-indexed enum emits the bare value; a string enum, or one with no IndexT, delegates.
		if rt.IndexT != nil {
			indexResolved := ctx.ResolveRef(rt.IndexT)
			if indexResolved != nil && indexResolved.Kind == reflection.KindNumber {
				return false
			}
		}
		return true
	case reflection.KindLiteral:
		return literalFlavour(rt) == litPrimitive
	}
	return false
}

/** isNoopForCompactFromJson reports whether the cjr entry for rt is the
 *  identity. **/
// Mirrors CompactFromJsonEmitter.Emit, which reuses restoreFromJsonMutate's arms EXCEPT at object positions,
// where the positional-to-keyed rebuild is real work for every object shape rj would let round-trip raw. The
// union arm IS emitUnionRestoreFromJsonFlat, so its noop condition delegates to the shared restore-side rule.
func isNoopForCompactFromJson(rt *reflection.RunType, ctx *EmitContext) bool {
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
	// compactUnionMemberTransforms reads the shape verdict above for the envelope decision; the key guard only
	// decides whether THIS entry is a real function.
	return result && !restoreKeyGuardReachable(rt, ctx)
}

func compactFromJsonNoopRecursive(rt *reflection.RunType, ctx *EmitContext, visited map[string]struct{}) bool {
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

	case reflection.KindAny, reflection.KindUnknown,
		reflection.KindNull,
		reflection.KindString, reflection.KindNumber, reflection.KindBoolean,
		reflection.KindObject, reflection.KindEnum:
		return true

	case reflection.KindIntersection, reflection.KindTemplateLiteral:
		return true

	case reflection.KindLiteral:
		return literalFlavour(rt) == litPrimitive

	case reflection.KindObjectLiteral, reflection.KindClass:
		// Every object shape does real decode work under compact, every class subkind too: Date / Temporal /
		// Map / Set rebuild, a plain class takes the positional rebuild plus the serializer wrap.
		return false

	case reflection.KindProperty, reflection.KindPropertySignature:
		if rt.Child == nil {
			return true
		}
		resolved := ctx.ResolveRef(rt.Child)
		if resolved == nil || isStrippedUnionMember(resolved) {
			return true
		}
		return compactFromJsonNoopRecursive(resolved, ctx, visited)

	case reflection.KindArray:
		if rt.Child == nil {
			return true
		}
		return compactFromJsonNoopRecursive(rt.Child, ctx, visited)

	case reflection.KindTuple:
		for _, child := range rt.Children {
			if !compactFromJsonNoopRecursive(child, ctx, visited) {
				return false
			}
		}
		return true

	case reflection.KindTupleMember:
		// Same rule as restoreFromJsonMutate: an optional slot normalizes, a required one follows its child.
		if rt.Optional {
			return false
		}
		if rt.Child == nil {
			return true
		}
		return compactFromJsonNoopRecursive(rt.Child, ctx, visited)

	case reflection.KindIndexSignature:
		if rt.Child == nil || isSymbolKeyedIndexSig(rt, ctx) {
			return true
		}
		return compactFromJsonNoopRecursive(rt.Child, ctx, visited)

	case reflection.KindUnion:
		// The compact union arm is the SAFE restore over the compact-widened layout: the shared flat-union rule
		// (roundTripsRaw ⇒ identity), no member positionalizes (union_flat_compact.go), AND no member can hide
		// an undeclared key, the safe restore rebuilding each object from its declared shape.
		return unionJsonNoop(rt, ctx) && !compactUnionNeedsEnvelope(rt, ctx, visited) &&
			!anyUnionMember(rt, ctx, unionMemberHidesKey)
	}
	// undefined / void (force-rebind), bigint / symbol / regexp (value transforms), never / promise / function
	// kinds (unsupported), and any future kind: not noop.
	return false
}

/** isNoopForRestoreJsonSafe reports whether the rjs entry for rt is the
 *  identity. **/
// Mirrors RestoreFromJsonCloneEmitter.Emit, which reuses restoreFromJsonMutate's arms EXCEPT where it
// rebuilds, and a rebuild is real work at every object shape rj would let round-trip raw. Unlike cjr this
// returns ONE verdict with no separate key-guard conjunct, cjr's shape half feeding the compact envelope
// decision while rjs has no second reader. Never route this predicate into a wire-shape decision: the wire
// is pjs's, and this must not be able to move it.
func isNoopForRestoreJsonSafe(rt *reflection.RunType, ctx *EmitContext) bool {
	rt = ctx.ResolveRef(rt)
	if rt == nil {
		return false
	}
	if rt.ID != "" {
		if verdict, known := ctx.walker.factsLookup(factNoopRestoreJsonSafe, rt.ID); known {
			return verdict
		}
	}
	result := restoreJsonSafeNoopRecursive(rt, ctx, make(map[string]struct{}))
	if rt.ID != "" {
		ctx.walker.factsStore(factNoopRestoreJsonSafe, rt.ID, result)
	}
	return result
}

func restoreJsonSafeNoopRecursive(rt *reflection.RunType, ctx *EmitContext, visited map[string]struct{}) bool {
	rt = ctx.ResolveRef(rt)
	if rt == nil {
		return true
	}
	if rt.ID != "" {
		if verdict, known := ctx.walker.factsLookup(factNoopRestoreJsonSafe, rt.ID); known {
			return verdict
		}
		if _, seen := visited[rt.ID]; seen {
			return true
		}
		visited[rt.ID] = struct{}{}
	}
	switch rt.Kind {

	case reflection.KindAny, reflection.KindUnknown,
		reflection.KindNull,
		reflection.KindString, reflection.KindNumber, reflection.KindBoolean,
		reflection.KindObject, reflection.KindEnum:
		return true

	case reflection.KindIntersection, reflection.KindTemplateLiteral:
		return true

	case reflection.KindLiteral:
		return literalFlavour(rt) == litPrimitive

	case reflection.KindObjectLiteral, reflection.KindClass:
		// Every object shape rebuilds (a zero-prop object to `{}`, which is how it strips), every class subkind
		// rebuilds or is unsupported, and the delegated index-signature path still ships the key-refusal loop.
		return false

	case reflection.KindProperty, reflection.KindPropertySignature:
		if rt.Child == nil {
			return true
		}
		resolved := ctx.ResolveRef(rt.Child)
		if resolved == nil || isStrippedUnionMember(resolved) {
			return true
		}
		return restoreJsonSafeNoopRecursive(resolved, ctx, visited)

	case reflection.KindArray:
		if rt.Child == nil {
			return true
		}
		// Deliberately NOT isExtraProof, the shortcut prepareForJsonClone takes: extraProofRecursive answers true
		// for a bigint or symbol literal, both of which this emitter transforms, and that would be corruption.
		return restoreJsonSafeNoopRecursive(rt.Child, ctx, visited)

	case reflection.KindTuple:
		for _, child := range rt.Children {
			if !restoreJsonSafeNoopRecursive(child, ctx, visited) {
				return false
			}
		}
		return true

	case reflection.KindTupleMember:
		if rt.Optional {
			return false
		}
		if rt.Child == nil {
			return true
		}
		return restoreJsonSafeNoopRecursive(rt.Child, ctx, visited)

	case reflection.KindIndexSignature:
		// A symbol-keyed or child-less signature emits nothing; everything else ships the rebuild or rj's
		// key-refusal loop, both real code.
		if rt.Child == nil || isSymbolKeyedIndexSig(rt, ctx) {
			return true
		}
		if resolved := ctx.ResolveRef(rt.Child); resolved != nil && isFunctionLikeKind(resolved.Kind) {
			return true
		}
		return false

	case reflection.KindUnion:
		// Mirrors the emit's atomicOnlyJsonIdentity() gate: identity only when no member carries an object shape
		// to rebuild, none envelopes, and none can hide an undeclared key. Miss the last conjunct and the
		// dispatch gate replaces the child call with empty code, so the rebuild never runs, the false positive
		// the contract at the top of this file calls data corruption.
		return unionJsonNoop(rt, ctx) && !anyUnionMember(rt, ctx, unionMemberEnvelopes) && !anyUnionMember(rt, ctx, unionMemberHidesKey)
	}
	// undefined / void (force-rebind), bigint / symbol / regexp (value transforms), never / promise / function
	// kinds (unsupported): not noop.
	return false
}

// anyUnionMember reports whether pred holds for a surviving member. Hand-rolled rather than read off
// buildFlatLayout, which emits drop diagnostics a predicate must not duplicate (the reason
// compactUnionNeedsEnvelope avoids it too); stripping mirrors dataOnlyUnionMembers via isStrippedUnionMember.
func anyUnionMember(rt *reflection.RunType, ctx *EmitContext, pred func(*reflection.RunType, *EmitContext) bool) bool {
	children := rt.SafeUnionChildren
	if len(children) == 0 {
		children = rt.Children
	}
	for _, child := range children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil || isStrippedUnionMember(resolved) {
			continue
		}
		if pred(resolved, ctx) {
			return true
		}
	}
	return false
}

// unionMemberHidesKey negates the emit's AtomicsExtraProof conjunct, asked of EVERY member rather than the
// atomic bucket alone, so predicate-true still implies emit-noop, the safe direction.
func unionMemberHidesKey(resolved *reflection.RunType, ctx *EmitContext) bool {
	return !atomicMemberExtraProof(resolved, ctx)
}

/** isNoopForToBinary reports whether the tb entry for rt writes no bytes. **/
// Mirrors ToBinaryEmitter.Emit: a literal writes nothing (the value is restored from the RunType at decode),
// a dropped property slot writes nothing, and an object or tuple of only such members writes nothing, PROVIDED
// no optional member forces the presence bitmap and no member carries a format annotation (binaryToOverride
// may write) or an index signature / rest slot, whose dynamic counts always serialize. Everything else
// (atoms, arrays with their varint length prefix, unions, enums, Date / Map / Set / classes) writes bytes.
func isNoopForToBinary(rt *reflection.RunType, ctx *EmitContext) bool {
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

func toBinaryNoopRecursive(rt *reflection.RunType, ctx *EmitContext, visited map[string]struct{}) bool {
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

	case reflection.KindLiteral:
		// emitLiteralToBinary writes nothing for every flavour in v1; the symbol one is unsupported, not free.
		return literalFlavour(rt) != litSymbol

	case reflection.KindProperty, reflection.KindPropertySignature:
		if rt.Optional {
			// Presence goes in the parent object's bitmap, real bytes.
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

	case reflection.KindObjectLiteral:
		return toBinaryNoopObjectChildren(rt, ctx, visited)

	case reflection.KindClass:
		if rt.SubKind == reflection.SubKindNone {
			// A named user class always emits the runtime class-serializer registry branch, never identity, even
			// when every member is a no-write slot (`declare class C {p: never}`); an anonymous one stays
			// structural.
			if userClassName(rt) != "" {
				return false
			}
			return toBinaryNoopObjectChildren(rt, ctx, visited)
		}
		return false

	case reflection.KindTuple:
		for _, childRef := range rt.Children {
			resolved := ctx.ResolveRef(childRef)
			if resolved == nil {
				continue
			}
			if resolved.Optional || isRestTupleMember(resolved) {
				// An optional slot goes in the bitmap, a rest slot writes a count.
				return false
			}
			if !toBinaryNoopRecursive(resolved, ctx, visited) {
				return false
			}
		}
		return true

	case reflection.KindTupleMember:
		if rt.Optional || isRestTupleMember(rt) {
			return false
		}
		if rt.Child == nil {
			return true
		}
		return toBinaryNoopRecursive(rt.Child, ctx, visited)
	}
	// Atoms (undefined / void write a sentinel), any / unknown / object (serString of the JSON form), arrays
	// (length prefix), unions (discriminant), enums, index signatures (key count), Date / Temporal / Map / Set
	// / builtins, and any future kind: bytes are written.
	return false
}

// toBinaryNoopObjectChildren mirrors emitObjectToBinary's member walk: a call-signature-carrying interface is
// function-like and never noop (the emit is CodeNS), an index signature writes the dynamic key count, an
// optional member forces the presence bitmap, static and function-like slots are skipped, and every surviving
// member must itself write nothing.
func toBinaryNoopObjectChildren(rt *reflection.RunType, ctx *EmitContext, visited map[string]struct{}) bool {
	if objectHasCallSignature(rt, ctx) {
		return false
	}
	for _, childRef := range objectMembers(rt) {
		resolved := ctx.ResolveRef(childRef)
		if resolved == nil {
			continue
		}
		if resolved.IsStatic || isFunctionLikeKind(resolved.Kind) {
			continue
		}
		if resolved.Kind == reflection.KindIndexSignature {
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

// unknownKeysNoopSpec parameterises the shared unknown-keys predicate per family.
type unknownKeysNoopSpec struct {
	// fact is the family's own memo lane (verdicts differ per family).
	fact factKind
}

var (
	stripUnknownKeysWireSpec = unknownKeysNoopSpec{fact: factNoopStripUnknownKeysWire}
)

/** isNoopForUnknownKeys reports whether an unknown-keys family entry for rt
 *  is the family identity. **/
// Shared mirror of the emitters' common arms (unknownkeys_arms.go / unknownkeys_shared.go): the only
// key-carrying position is an object with statically-declared names (the parent allowlist probe) or a
// template-literal-keyed index signature (the pattern sweep), everything else recursing or no-opping.
// Per-family divergences travel on unknownKeysNoopSpec.
func isNoopForUnknownKeys(rt *reflection.RunType, ctx *EmitContext, spec unknownKeysNoopSpec) bool {
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

func unknownKeysNoopRecursive(rt *reflection.RunType, ctx *EmitContext, spec unknownKeysNoopSpec, visited map[string]struct{}) bool {
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

	case reflection.KindObjectLiteral:
		return unknownKeysNoopObject(rt, ctx, spec, visited)

	case reflection.KindClass:
		switch rt.SubKind {
		case reflection.SubKindNone:
			return unknownKeysNoopObject(rt, ctx, spec, visited)
		case reflection.SubKindMap, reflection.SubKindSet:
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
		// Date / Temporal / NonSerializable / future subkinds: no keys to manage, every family emits nothing.
		return true

	case reflection.KindProperty, reflection.KindPropertySignature:
		if rt.Child == nil {
			return true
		}
		resolved := ctx.ResolveRef(rt.Child)
		if resolved == nil || isFunctionLikeKind(resolved.Kind) || resolved.IsStatic {
			return true
		}
		return unknownKeysNoopRecursive(resolved, ctx, spec, visited)

	case reflection.KindArray:
		if rt.Child == nil {
			return true
		}
		resolved := ctx.ResolveRef(rt.Child)
		if resolved == nil || reflection.FamilyOf(resolved.Kind) == reflection.FamilyAtomic {
			return true
		}
		return unknownKeysNoopRecursive(resolved, ctx, spec, visited)

	case reflection.KindTuple:
		for _, child := range rt.Children {
			if !unknownKeysNoopRecursive(child, ctx, spec, visited) {
				return false
			}
		}
		return true

	case reflection.KindTupleMember:
		if rt.Child == nil {
			return true
		}
		resolved := ctx.ResolveRef(rt.Child)
		if resolved == nil || reflection.FamilyOf(resolved.Kind) == reflection.FamilyAtomic {
			return true
		}
		return unknownKeysNoopRecursive(resolved, ctx, spec, visited)

	case reflection.KindIndexSignature:
		return unknownKeysNoopIndexSignature(rt, ctx, spec, visited)

	case reflection.KindUnion:
		return unknownKeysNoopUnion(rt, ctx, spec, visited)
	}
	// Atoms, never, functions, promises, intersections, template literals: no keys to manage.
	return true
}

// unknownKeysNoopObject mirrors the shared object arm: without an index signature ANY named child triggers
// the parent probe, function-typed and static names included, the allowlist covering them; with one, the
// probe is suppressed and the children decide.
func unknownKeysNoopObject(rt *reflection.RunType, ctx *EmitContext, spec unknownKeysNoopSpec, visited map[string]struct{}) bool {
	hasIndex := objectHasIndexSignatureChild(rt, ctx)
	if !hasIndex {
		for _, childRef := range rt.Children {
			resolved := ctx.ResolveRef(childRef)
			if resolved == nil || resolved.Kind == reflection.KindIndexSignature {
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

// unknownKeysNoopIndexSignature mirrors the shared index-signature arm: an atomic value has nothing to recurse into
// and every key is known.
func unknownKeysNoopIndexSignature(rt *reflection.RunType, ctx *EmitContext, spec unknownKeysNoopSpec, visited map[string]struct{}) bool {
	if rt.Child == nil || isSymbolKeyedIndexSig(rt, ctx) {
		return true
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil || isFunctionLikeKind(resolved.Kind) {
		return true
	}
	if reflection.FamilyOf(resolved.Kind) == reflection.FamilyAtomic {
		return true
	}
	return unknownKeysNoopRecursive(resolved, ctx, spec, visited)
}

// unknownKeysNoopUnion mirrors emitUnionUnknownKeysMerged's empty-emit conditions, identical across the
// families since the wire flag changes only the body shape: an object-like member carrying an index signature
// kills the merged allowlist for the whole union, and otherwise the union is noop when no object member
// exposes a named property to merge AND no atomic member holds a keyed shape the descent walks. Member
// stripping mirrors dataOnlyUnionMembers via isStrippedUnionMember.
func unknownKeysNoopUnion(rt *reflection.RunType, ctx *EmitContext, spec unknownKeysNoopSpec, visited map[string]struct{}) bool {
	children := rt.SafeUnionChildren
	if len(children) == 0 {
		children = rt.Children
	}
	anyObjectMember := false
	anyMergedProp := false
	atomicsNoop := true
	for _, ref := range children {
		resolved := ctx.ResolveRef(ref)
		if resolved == nil || isStrippedUnionMember(resolved) {
			continue
		}
		if isObjectLikeKind(resolved.Kind) && objectHasIndexSignatureChild(resolved, ctx) {
			// buildFlatLayout's index-sig carve-out: the whole family no-ops.
			return true
		}
		if resolved.Kind != reflection.KindObjectLiteral && (resolved.Kind != reflection.KindClass || resolved.SubKind != reflection.SubKindNone) {
			// An ATOMIC member in the flat layout, which is not the same as key-free: an array or a tuple carries
			// whatever its element type declares, and unionAtomicMemberDescent walks exactly those. Miss this and
			// the dispatch gate replaces the child call with empty code while the emit walks.
			if !atomicMemberExtraProof(resolved, ctx) && !unknownKeysNoopRecursive(resolved, ctx, spec, visited) {
				atomicsNoop = false
			}
			continue
		}
		anyObjectMember = true
		for _, memberChild := range objectMembers(resolved) {
			prop := ctx.ResolveRef(memberChild)
			if prop == nil || prop.IsStatic || isFunctionLikeKind(prop.Kind) {
				continue
			}
			if (prop.Kind == reflection.KindProperty || prop.Kind == reflection.KindPropertySignature) && prop.Name != "" {
				anyMergedProp = true
			}
		}
	}
	return (!anyObjectMember || !anyMergedProp) && atomicsNoop
}

// NoopPredicateAgreement is the corpus-test surface, not part of the render pipeline: it returns the emitter
// predicate's verdict for rt beside the GROUND TRUTH from compiling rt with the dispatch gate disabled and
// allInternal inlining, so nothing externalizes but true cycles and Finalize's shape check sees the whole
// body. comparable is false when the emitter has no predicate or does not support rt, and an unsupported
// compile reports groundTruth=false, an alwaysThrow entry not being the identity. Callers assert the
// soundness direction: verdict ⇒ groundTruth.
func NoopPredicateAgreement(emitter Emitter, rt *reflection.RunType, refTable map[string]*reflection.RunType, facts *FactsTable) (verdict bool, groundTruth bool, comparable bool) {
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
