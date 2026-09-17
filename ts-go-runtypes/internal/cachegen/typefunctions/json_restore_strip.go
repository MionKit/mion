package typefunctions

import (
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// RestoreFromJsonStripEmitter is the decode mirror of PrepareForJsonCloneEmitter,
// and structurally a sibling of RestoreFromJsonEmitter. It reads the SAME keyed
// wire `rj` reads (the one `pjs` writes) but REBUILDS each object from the
// declared shape instead of transforming it where it sits, so a key the type
// does not declare is gone from the decoded value rather than left in place.
// That is what makes the `clone` strategy's "undeclared keys are dropped"
// promise hold for a payload mion did not write.
//
// The arms that diverge from restoreFromJson are the ones Emit spells out;
// every other arm is restoreFromJson's own, and recursion routes back through
// THIS emitter via ctx.CompileChild:
//
//   - object literal / plain class instance: rebuilt from the declared slots.
//     One whose index signatures already admit every key delegates to the
//     in-place walk, which then removes nothing (see indexSigAdmitsEveryKey).
//   - tuple: rj's arm behind an Array.isArray guard, rj never runs on a tuple
//     of plain objects and this emitter does.
//   - union: rebuilt from the flat layout's merged props, under `pjs`'s envelope
//     gate rather than `rj`'s (see emitUnionRestoreFromJsonStrip).
//
// Like compactFromJson the object arms REBIND the value accessor to the rebuilt
// object (`v = _r`), which is why EmitDependencyCall captures the child's return.
type RestoreFromJsonStripEmitter struct{}

func (RestoreFromJsonStripEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports mirrors the restoreFromJson supported surface.
func (RestoreFromJsonStripEmitter) Supports(rt *reflection.RunType) bool {
	return jsonWireSupports(rt)
}

func (RestoreFromJsonStripEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// EmitDependencyCall captures the child's return into the accessor so a rebuilt
// object propagates, same as restoreFromJson and compactFromJson.
func (RestoreFromJsonStripEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	return ctx.emitDepCall(childID, ctx.Vλl, ctx.Vλl)
}

func (RestoreFromJsonStripEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "return v" {
		return "return v", true
	}
	return code, false
}

func (RestoreFromJsonStripEmitter) ReturnName() string { return "v" }

// IsNoopType is restoreFromJson's arms with every rebuilding arm forced false.
// Delegating rj's predicate wholesale would be UNSOUND: the gate would skip the
// rebuild and undeclared keys would survive the decode.
func (RestoreFromJsonStripEmitter) IsNoopType(rt *reflection.RunType, ctx *EmitContext) bool {
	return isNoopForRestoreJsonSafe(rt, ctx)
}

// NoopChildComposesAround: an identity child slot passes through unchanged; empty code composes correctly.
func (RestoreFromJsonStripEmitter) NoopChildComposesAround() {}

// Emit is RestoreFromJsonEmitter.Emit with the diverging arms in front; every
// other kind is delegated so the two cannot drift.
func (RestoreFromJsonStripEmitter) Emit(rt *reflection.RunType, ctx *EmitContext, codeType CodeType) RTCode {
	if rt == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	switch rt.Kind {

	case reflection.KindObjectLiteral:
		return emitObjectRestoreFromJsonStrip(rt, ctx, v)

	case reflection.KindClass:
		if rt.SubKind == reflection.SubKindNone {
			return wrapRestoreWithClassSerializer(rt, ctx, v, emitObjectRestoreFromJsonStrip(rt, ctx, v))
		}

	case reflection.KindTuple:
		// Guarded, unlike rj's arm. rj is a noop for a tuple of plain objects and
		// never runs on a malformed body; rjs is live for those same types (the
		// rebuild is the point), so an absent or non-array body would reach `v[0]`
		// and throw a raw TypeError where the request used to fail validation.
		// Same rule as the object arm: convert only the wire form, leave the rest.
		inner := emitTupleRestoreFromJson(rt, ctx, v)
		if inner.Code == "" || inner.Type == CodeNS {
			return inner
		}
		return RTCode{Code: "if (Array.isArray(" + v + ")) {" + inner.Code + "}", Type: CodeS}

	case reflection.KindUnion:
		return emitUnionRestoreFromJsonStrip(rt, ctx, v)
	}
	return RestoreFromJsonEmitter{}.Emit(rt, ctx, codeType)
}

// terminated appends the `;` a statement needs before the next one, unless
// code already ends a statement or a block.
func terminated(code string) string {
	if code == "" || strings.HasSuffix(code, "}") || strings.HasSuffix(code, ";") {
		return code
	}
	return code + ";"
}

// emitObjectRestoreFromJsonStrip is the keyed declared-shape rebuild. An object
// whose declaration already admits every key that can arrive delegates to the
// in-place walk, which then removes nothing a rebuild would remove. Decided
// BEFORE the slots are collected so the drop diagnostics are emitted exactly
// once (same ordering rule as emitObjectCompactForJson).
func emitObjectRestoreFromJsonStrip(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if objectHasCallSignature(rt, ctx) {
		return RTCode{Code: "", Type: CodeNS}
	}
	if indexSigAdmitsEveryKey(rt, ctx) {
		return emitObjectJsonChildren(rt, ctx)
	}
	return emitObjectRebuildFromJson(rt, ctx, v)
}

// emitObjectRebuildFromJson rebuilds v from its declared shape and rebinds the
// accessor. The index-signature sweep runs first and skips every declared name,
// then each declared slot is restored where it arrived and copied across, so a
// declared slot always wins its key. A declared key that arrived is copied even
// when its restore wrote `undefined`: a declared key left out of the rebuild is
// a declared key DELETED, which is the opposite of the bug. Anything the type
// does not declare is simply never copied.
func emitObjectRebuildFromJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	rVar := ctx.NextLocalVar("r")
	var restore strings.Builder
	restore.WriteString("if (" + unknownKeysObjectGuard(v) + ") {const " + rVar + " = {};")

	if signatures := liveIndexSignatures(rt, ctx); len(signatures) > 0 {
		keyVar := ctx.NextLocalVar("k")
		loop, ok := emitIndexSigRebuildLoop(signatures, ctx, v, rVar, keyVar, declaredNameSkipCode(collectSiblingNamedKeys(rt, ctx), keyVar))
		if !ok {
			return RTCode{Code: "", Type: CodeNS}
		}
		restore.WriteString(loop)
	}

	for _, slot := range collectCompactDeclaredSlots(rt, ctx) {
		accessor := propertyAccessor(v, slot.name, slot.isSafeName)
		ctx.SetChildAccessor(accessor)
		childRT := ctx.CompileChild(slot.childRef, CodeS)
		ctx.SetChildAccessor("")
		if childRT.Type == CodeNS {
			if propertyChildFailed(ctx) {
				return RTCode{Code: "", Type: CodeNS}
			}
			// Absorbed (a future kind with no emit): not part of the declared
			// shape, so it is not copied either.
			continue
		}
		write := terminated(childRT.Code) + propertyAccessor(rVar, slot.name, slot.isSafeName) + " = " + accessor + ";"
		if slot.optional {
			write = "if (" + namedPropertyPresenceTest(slot.name, v, accessor) + ") {" + write + "}"
		}
		restore.WriteString(write)
	}

	restore.WriteString(v + " = " + rVar + ";}")
	return RTCode{Code: restore.String(), Type: CodeS}
}

// indexSigAdmitsEveryKey reports whether rt's declaration admits every key that
// can arrive, which is exactly when the in-place restore walk produces the same
// key set as a rebuild and rjs can delegate to it. An index signature is always
// open (a key its pattern does not match is validation's to refuse, never the
// decoder's to drop), so a live signature admits every wire key; the one key
// that still has to go is a declared member the codec DROPS (a static, a
// method, a DataOnly-stripped value), which the in-place walk skips but never
// deletes (G6).
func indexSigAdmitsEveryKey(rt *reflection.RunType, ctx *EmitContext) bool {
	return len(liveIndexSignatures(rt, ctx)) > 0 && !objectDropsDeclaredMember(rt, ctx)
}

// liveIndexSignatures returns the index signatures a rebuild sweep runs an arm
// for. A symbol-keyed or function-valued signature contributes no arm, so it
// admits no wire key at all.
func liveIndexSignatures(rt *reflection.RunType, ctx *EmitContext) []*reflection.RunType {
	var live []*reflection.RunType
	for _, child := range objectMembers(rt) {
		resolved := ctx.ResolveRef(child)
		if resolved == nil || resolved.Kind != reflection.KindIndexSignature || resolved.Child == nil || isSymbolKeyedIndexSig(resolved, ctx) {
			continue
		}
		if value := ctx.ResolveRef(resolved.Child); value == nil || isFunctionLikeKind(value.Kind) {
			continue
		}
		live = append(live, resolved)
	}
	return live
}

// objectDropsDeclaredMember reports whether any declared member is filtered out
// by the codec's structural drop rules. Uses the PURE isStrippedUnionMember
// rather than strippedPropertyDrop: the latter emits a drop diagnostic, and the
// emitting walk does that once already.
func objectDropsDeclaredMember(rt *reflection.RunType, ctx *EmitContext) bool {
	for _, child := range objectMembers(rt) {
		resolved := ctx.ResolveRef(child)
		if resolved == nil || resolved.Kind == reflection.KindIndexSignature {
			continue
		}
		if resolved.IsStatic || isFunctionLikeKind(resolved.Kind) {
			return true
		}
		if resolved.Kind != reflection.KindProperty && resolved.Kind != reflection.KindPropertySignature {
			continue
		}
		if resolved.Child == nil {
			continue
		}
		if propResolved := ctx.ResolveRef(resolved.Child); propResolved != nil && isStrippedUnionMember(propResolved) {
			return true
		}
	}
	return false
}

// declaredNameSkipCode is the `if (k === 'a' || k === 'b') continue;` prologue a
// rebuild loop opens with so a declared key is never touched by an index arm.
// It takes the names (collectSiblingNamedKeys: the kept AND dropped set, per G6)
// rather than reading the sibling-keys context item, which only the emitters
// that call publishSiblingNamedKeysForIndexSig publish, so any loop that skips
// declared names can build its chain here.
func declaredNameSkipCode(names []string, keyVar string) string {
	if len(names) == 0 {
		return ""
	}
	checks := make([]string, 0, len(names))
	for _, name := range names {
		checks = append(checks, keyVar+" === "+quoteJS(name))
	}
	return "if (" + strings.Join(checks, " || ") + ") continue;"
}

// emitIndexSigRebuildLoop writes the `for (const k in v)` sweep of the object
// rebuild: refuse a prototype-named key, skip whatever the caller's prologue
// names, then per signature transform the value in place and copy it onto the
// fresh object. Each arm ends in `continue`, so the first matching pattern wins
// and no key is transformed twice; a key that matches no pattern is still
// copied, only its value transform is skipped, because an index signature is
// always open and a non-matching key is validation's to refuse. The key
// variable comes from the caller so the declared-name skip is built against
// the same name.
func emitIndexSigRebuildLoop(signatures []*reflection.RunType, ctx *EmitContext, v, rVar, keyVar, skipCode string) (string, bool) {
	accessor := v + "[" + keyVar + "]"
	copyKey := rVar + "[" + keyVar + "] = " + accessor + ";"
	var body strings.Builder
	body.WriteString("for (const " + keyVar + " in " + v + ") {")
	// The decoder rule: a prototype-named wire key is refused, never silently
	// skipped the way an encoder or a clone skips it (unsafe_keys.go).
	body.WriteString(unsafeKeyThrow(keyVar))
	body.WriteString(skipCode)
	fallback := copyKey
	for _, signature := range signatures {
		keyRegexVar := indexSignatureKeyRegexVar(signature, ctx)
		ctx.SetChildAccessor(accessor)
		childRT := ctx.CompileChild(signature.Child, CodeS)
		ctx.SetChildAccessor("")
		if childRT.Type == CodeNS {
			return "", false
		}
		arm := terminated(childRT.Code) + copyKey + " continue;"
		if keyRegexVar == "" {
			// An unpatterned signature admits every key, so nothing after its arm can run.
			body.WriteString(arm)
			fallback = ""
			break
		}
		body.WriteString("if (" + keyRegexVar + ".test(" + keyVar + ")) {" + arm + "}")
	}
	body.WriteString(fallback + "}")
	return body.String(), true
}

// emitUnionRestoreFromJsonStrip is the union decode, gated the way the CLONE
// ENCODER gates it rather than the way the plain restore does.
//
// restoreFromJson returns identity whenever the layout carries no envelope,
// which is right for a walk that changes nothing but wrong here: a union of
// plain objects is fully JSON-compatible, so it never envelopes, and identity
// would strip nothing in the commonest case. prepareForJsonClone gates on
// atomicOnlyJsonIdentity() instead and emits a bare stripped rebuild; this
// mirrors that, so the pair agree on both the wire and the key set.
//
// The layout itself is buildFlatLayout UNWIDENED. Compact has to widen because
// it changes the wire; rjs reads exactly what pjs writes, so widening here would
// make the decoder expect an envelope the encoder never wrote.
func emitUnionRestoreFromJsonStrip(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	return emitUnionRestoreFromJsonStripLayout(rt, ctx, v, buildFlatLayout(rt, ctx))
}

// emitUnionRestoreFromJsonStripLayout is the twin of emitUnionPrepareForJsonCloneLayout:
// compact hands it the widened layout its safe encode already writes with.
//
// A member carrying an index signature declares every key from the union's
// point of view, the carve-out the unknown-keys families answer clean with
// (unknownkeys_union.go), so the object branch then restores in place the way
// rj does instead of rebuilding: every key on the object member is kept.
func emitUnionRestoreFromJsonStripLayout(rt *reflection.RunType, ctx *EmitContext, v string, layout FlatLayout) RTCode {
	if len(layout.AtomicMembers) == 0 && len(layout.ObjectMembers) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	// Every member is a JSON-identity atomic: nothing to unwrap and no declared
	// object shape to rebuild.
	if layout.atomicOnlyJsonIdentity() {
		return RTCode{Code: "", Type: CodeS}
	}
	objectArm := emitMergedPropsRebuild
	if layout.hasIndexSignatureMember(ctx) {
		objectArm = emitMergedPropsInPlace
	}
	if layout.AtomicNeedsTuple {
		return emitEnvelopedUnionRestore(ctx, v, layout, objectArm)
	}
	return emitBareUnionRestoreSafe(ctx, v, layout, objectArm)
}

// emitBareUnionRestoreSafe is the un-enveloped wire. Every member round-trips
// raw, so the wire shape equals the runtime shape and the ENCODER's own guards,
// in the encoder's own order, pick the same arm the encoder picked. An unmatched
// value is left untouched for validate to refuse rather than thrown on: unlike
// the enveloped wire, a bare value IS a legal wire form here.
func emitBareUnionRestoreSafe(ctx *EmitContext, v string, layout FlatLayout, objectArm unionObjectArm) RTCode {
	prologue, dispatchArms := layout.atomicEncodeDispatch(v, ctx)
	var clauses []string

	for _, arm := range dispatchArms {
		restoreRT := ctx.CompileChild(arm.Member.Ref, CodeS)
		if restoreRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		// An empty arm still ships: it SHADOWS the object clause below, which is
		// what stops a bare `object` member being rebuilt into the merged shape.
		clauses = append(clauses, "if ("+arm.Guard+") {"+terminated(strings.TrimSpace(restoreRT.Code))+"}")
	}

	if len(layout.ObjectMembers) > 0 {
		body, ok := objectArm(ctx, v, layout)
		if !ok {
			return RTCode{Code: "", Type: CodeNS}
		}
		if body != "" {
			clauses = append(clauses, "if ("+unknownKeysObjectGuard(v)+") {"+body+"}")
		}
	}

	if len(clauses) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	return RTCode{Code: prologue + strings.Join(clauses, " else "), Type: CodeS}
}

// emitMergedPropsRebuild restores each merged prop where it arrived and copies
// it onto a fresh object, interleaved like emitObjectRebuildFromJson so a
// declared key that arrived is never deleted (a noop restore included).
// mergedPropSurvivingGuard is deliberately NOT used: it tests a runtime-typed
// value, and on the wire a Date candidate is a string, so it would drop a
// legitimately encoded key.
func emitMergedPropsRebuild(ctx *EmitContext, v string, layout FlatLayout) (string, bool) {
	rVar := ctx.NextLocalVar("r")
	var restore strings.Builder
	restore.WriteString("const " + rVar + " = {};")
	for _, mp := range layout.MergedProps {
		accessor := propertyAccessor(v, mp.Name, mp.IsSafeName)
		propCode, ok := emitMergedPropRestore(mp, accessor, ctx)
		if !ok {
			return "", false
		}
		write := terminated(propCode) + propertyAccessor(rVar, mp.Name, mp.IsSafeName) + " = " + accessor + ";"
		if !mp.Required {
			write = "if (" + namedPropertyPresenceTest(mp.Name, v, accessor) + ") {" + write + "}"
		}
		restore.WriteString(write)
	}
	restore.WriteString(v + " = " + rVar + ";")
	return restore.String(), true
}
