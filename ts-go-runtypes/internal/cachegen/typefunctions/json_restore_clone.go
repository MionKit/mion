package typefunctions

import (
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// RestoreFromJsonCloneEmitter is the decode mirror of PrepareForJsonCloneEmitter. It reads the SAME keyed wire `rj`
// reads (the one `pjs` writes) but REBUILDS each object from the declared shape, which is what makes the `clone`
// strategy's "undeclared keys are dropped" promise hold for a payload mion did not write.
// Emit spells out the diverging arms; every other arm is restoreFromJsonMutate's, and recursion routes back through THIS
// emitter via ctx.CompileChild. The object arms REBIND the accessor (`v = _r`), which is why EmitDependencyCall captures
// the child's return.
type RestoreFromJsonCloneEmitter struct{}

func (RestoreFromJsonCloneEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports mirrors the restoreFromJsonMutate supported surface.
func (RestoreFromJsonCloneEmitter) Supports(rt *reflection.RunType) bool {
	return jsonWireSupports(rt)
}

func (RestoreFromJsonCloneEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// EmitDependencyCall captures the child's return into the accessor so a rebuilt object propagates.
func (RestoreFromJsonCloneEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	return ctx.emitDepCall(childID, ctx.Vλl, ctx.Vλl)
}

func (RestoreFromJsonCloneEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "return v" {
		return "return v", true
	}
	return code, false
}

func (RestoreFromJsonCloneEmitter) ReturnName() string { return "v" }

// IsNoopType is restoreFromJsonMutate's arms with every rebuilding arm forced false: delegating rj's predicate wholesale
// would skip the rebuild and undeclared keys would survive the decode.
func (RestoreFromJsonCloneEmitter) IsNoopType(rt *reflection.RunType, ctx *EmitContext) bool {
	return isNoopForRestoreJsonSafe(rt, ctx)
}

// Emit is RestoreFromJsonEmitter.Emit with the diverging arms in front; every
// other kind is delegated so the two cannot drift.
func (RestoreFromJsonCloneEmitter) Emit(rt *reflection.RunType, ctx *EmitContext, codeType CodeType) RTCode {
	if rt == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	switch rt.Kind {

	case reflection.KindObjectLiteral:
		return emitObjectRestoreFromJsonClone(rt, ctx, v)

	case reflection.KindClass:
		if rt.SubKind == reflection.SubKindNone {
			return wrapRestoreWithClassSerializer(rt, ctx, v, emitObjectRestoreFromJsonClone(rt, ctx, v))
		}

	case reflection.KindTuple:
		// Guarded, unlike rj's arm: rj is a noop for a tuple of plain objects, this one is live, so a non-array body would
		// reach `v[0]` and throw a raw TypeError instead of failing validation. Convert only the wire form.
		inner := emitTupleRestoreFromJson(rt, ctx, v)
		if inner.Code == "" || inner.Type == CodeNS {
			return inner
		}
		return RTCode{Code: "if (Array.isArray(" + v + ")) {" + inner.Code + "}", Type: CodeS}

	case reflection.KindUnion:
		return emitUnionRestoreFromJsonClone(rt, ctx, v)
	}
	return RestoreFromJsonEmitter{}.Emit(rt, ctx, codeType)
}

// terminated appends the `;` a statement needs before the next one.
func terminated(code string) string {
	if code == "" || strings.HasSuffix(code, "}") || strings.HasSuffix(code, ";") {
		return code
	}
	return code + ";"
}

// emitObjectRestoreFromJsonClone is the keyed declared-shape rebuild; an object that already admits every arriving key
// delegates to the in-place walk, which then removes nothing a rebuild would.
// Decided BEFORE the slots are collected so the drop diagnostics are emitted once (as in emitObjectCompactForJson).
func emitObjectRestoreFromJsonClone(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if objectHasCallSignature(rt, ctx) {
		return RTCode{Code: "", Type: CodeNS}
	}
	if indexSigAdmitsEveryKey(rt, ctx) {
		return emitObjectJsonChildren(rt, ctx)
	}
	return emitObjectRebuildFromJson(rt, ctx, v)
}

// emitObjectRebuildFromJson rebuilds v from its declared shape and rebinds the accessor; what the type does not declare
// is never copied. The index-signature sweep runs first and skips every declared name, so a declared slot wins its key.
// A declared key that arrived is copied even when its restore wrote `undefined`: leaving it out would DELETE it.
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
			// Absorbed (a future kind with no emit): not part of the declared shape, so it is not copied either.
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

// indexSigAdmitsEveryKey reports whether rt admits every arriving key, which is exactly when the in-place walk produces
// the same key set as a rebuild. An index signature is always open (a key its pattern misses is validation's to refuse,
// never the decoder's to drop), so a live signature admits every wire key; the one key that still has to go is a declared
// member the codec DROPS (a static, a method, a DataOnly-stripped value), which the in-place walk skips but never deletes
// (G6).
func indexSigAdmitsEveryKey(rt *reflection.RunType, ctx *EmitContext) bool {
	return len(liveIndexSignatures(rt, ctx)) > 0 && !objectDropsDeclaredMember(rt, ctx)
}

// liveIndexSignatures returns the index signatures a rebuild sweep runs an arm for; a symbol-keyed or function-valued
// signature contributes no arm, so it admits no wire key at all.
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

// objectDropsDeclaredMember reports whether any declared member is filtered out by the codec's structural drop rules.
// Uses the PURE isStrippedUnionMember, not strippedPropertyDrop, which emits a drop diagnostic the emitting walk emits.
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

// declaredNameSkipCode is the prologue a rebuild loop opens with so an index arm never touches a declared key.
// It takes the names (collectSiblingNamedKeys: the kept AND dropped set, per G6) rather than reading the sibling-keys
// context item, which only publishSiblingNamedKeysForIndexSig callers publish, so any loop can build its chain here.
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

// emitIndexSigRebuildLoop writes the `for (const k in v)` sweep of the object rebuild.
// Each arm ends in `continue`, so the first matching pattern wins and no key is transformed twice; a key matching no
// pattern is still copied, only its transform is skipped, since an index signature is always open and refusing is
// validation's job. The key variable comes from the caller so the declared-name skip is built against the same name.
func emitIndexSigRebuildLoop(signatures []*reflection.RunType, ctx *EmitContext, v, rVar, keyVar, skipCode string) (string, bool) {
	accessor := v + "[" + keyVar + "]"
	copyKey := rVar + "[" + keyVar + "] = " + accessor + ";"
	var body strings.Builder
	body.WriteString("for (const " + keyVar + " in " + v + ") {")
	// The decoder rule: a prototype-named wire key is refused, never skipped the way an encoder skips it (unsafe_keys.go).
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

// emitUnionRestoreFromJsonClone gates the union decode the way the CLONE ENCODER does, not the way the plain restore
// does: restoreFromJsonMutate is identity without an envelope, and a union of plain objects never envelopes, so identity
// would strip nothing in the commonest case. Mirroring prepareForJsonClone's atomicOnlyJsonIdentity() gate keeps the pair
// agreed on the wire and the key set.
// The layout is buildFlatLayout UNWIDENED: rjs reads exactly what pjs writes, so widening would make the decoder expect
// an envelope the encoder never wrote (compact widens because it changes the wire).
func emitUnionRestoreFromJsonClone(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	return emitUnionRestoreFromJsonCloneLayout(rt, ctx, v, buildFlatLayout(rt, ctx))
}

// emitUnionRestoreFromJsonCloneLayout is the twin of emitUnionPrepareForJsonCloneLayout: compact hands it the widened
// layout its safe encode already writes with.
// A member carrying an index signature declares every key from the union's point of view, so the object branch restores in place like rj instead of rebuilding and keeps every key.
func emitUnionRestoreFromJsonCloneLayout(rt *reflection.RunType, ctx *EmitContext, v string, layout FlatLayout) RTCode {
	if len(layout.AtomicMembers) == 0 && len(layout.ObjectMembers) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	// Every member is a JSON-identity atomic: nothing to unwrap and no declared object shape to rebuild.
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

// emitBareUnionRestoreSafe is the un-enveloped wire: every member round-trips raw, so the ENCODER's own guards in the
// encoder's own order pick the arm the encoder picked. An unmatched value is left for validate rather than thrown on,
// because unlike the enveloped wire a bare value IS a legal wire form here.
func emitBareUnionRestoreSafe(ctx *EmitContext, v string, layout FlatLayout, objectArm unionObjectArm) RTCode {
	prologue, dispatchArms := layout.atomicEncodeDispatch(v, ctx)
	var clauses []string

	for _, arm := range dispatchArms {
		restoreRT := ctx.CompileChild(arm.Member.Ref, CodeS)
		if restoreRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		// An empty arm still ships: it SHADOWS the object clause below, stopping a bare `object` member being rebuilt.
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

// emitMergedPropsRebuild restores each merged prop where it arrived and copies it onto a fresh object, interleaved like
// emitObjectRebuildFromJson so a declared key that arrived is never deleted (a noop restore included).
// mergedPropSurvivingGuard is NOT used: it tests a runtime-typed value, and on the wire a Date is a string, so it would
// drop a legitimately encoded key.
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
