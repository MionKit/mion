package typefunctions

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// RestoreFromJsonSafeEmitter — the decode mirror of PrepareForJsonSafeEmitter,
// and structurally a sibling of RestoreFromJsonEmitter. It reads the SAME keyed
// wire `rj` reads (the one `pjs` writes) but REBUILDS each object from the
// declared shape instead of transforming it where it sits, so a key the type
// does not declare is gone from the decoded value rather than left in place.
// That is what makes the `clone` strategy's "undeclared keys are dropped"
// promise hold for a payload mion did not write.
//
// Four arms diverge from restoreFromJson; every other arm (atomics, arrays, TS
// tuples, Map/Set, literals) is reused verbatim and recursion routes back
// through THIS emitter via ctx.CompileChild:
//
//   - object literal / plain class instance: rebuilt from the declared slots.
//   - index signature: rebuilt ONLY when the declaration does not already admit
//     every key (see indexSigAdmitsEveryKey); otherwise the in-place walk is
//     byte-equivalent and is delegated to.
//   - union: rebuilt from the flat layout's merged props, under `pjs`'s envelope
//     gate rather than `rj`'s (see emitUnionRestoreFromJsonSafe).
//
// Like compactFromJson the object arms REBIND the value accessor to the rebuilt
// object (`v = _r`), which is why EmitDependencyCall captures the child's return.
type RestoreFromJsonSafeEmitter struct{}

func (RestoreFromJsonSafeEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports mirrors the restoreFromJson supported surface.
func (RestoreFromJsonSafeEmitter) Supports(rt *reflection.RunType) bool {
	return jsonWireSupports(rt)
}

func (RestoreFromJsonSafeEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// EmitDependencyCall captures the child's return into the accessor so a rebuilt
// object propagates — same as restoreFromJson and compactFromJson.
func (RestoreFromJsonSafeEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	return ctx.emitDepCall(childID, ctx.Vλl, ctx.Vλl)
}

func (RestoreFromJsonSafeEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "return v" {
		return "return v", true
	}
	return code, false
}

func (RestoreFromJsonSafeEmitter) ReturnName() string { return "v" }

// IsNoopType — restoreFromJson's arms with every rebuilding arm forced false.
// Delegating rj's predicate wholesale would be UNSOUND: the gate would skip the
// rebuild and undeclared keys would survive the decode.
func (RestoreFromJsonSafeEmitter) IsNoopType(rt *reflection.RunType, ctx *EmitContext) bool {
	return isNoopForRestoreJsonSafe(rt, ctx)
}

// NoopChildComposesAround — an identity child slot passes through unchanged.
func (RestoreFromJsonSafeEmitter) NoopChildComposesAround() {}

// Emit mirrors RestoreFromJsonEmitter.Emit; only the object, index-signature and
// union arms diverge to a declared-shape rebuild.
func (RestoreFromJsonSafeEmitter) Emit(rt *reflection.RunType, ctx *EmitContext, _ CodeType) RTCode {
	if rt == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	switch rt.Kind {

	case reflection.KindAny, reflection.KindUnknown,
		reflection.KindNull,
		reflection.KindString, reflection.KindNumber, reflection.KindBoolean,
		reflection.KindObject, reflection.KindEnum:
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindNever:
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindUndefined, reflection.KindVoid:
		return RTCode{Code: v + " = undefined", Type: CodeE}

	case reflection.KindBigInt:
		return RTCode{Code: bigintRestoreCode(v, ctx), Type: CodeE}

	case reflection.KindSymbol:
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindRegexp:
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindClass:
		if info, ok := reflection.TemporalInfoBySubKind(rt.SubKind); ok {
			return RTCode{Code: v + " = typeof " + v + " === 'string' ? " + info.Builtin + ".from(" + v + ") : " + v, Type: CodeE}
		}
		switch rt.SubKind {
		case reflection.SubKindDate:
			return RTCode{Code: v + " = typeof " + v + " === 'string' ? new Date(" + v + ") : " + v, Type: CodeE}
		case reflection.SubKindNone:
			structural := emitObjectRestoreFromJsonSafe(rt, ctx, v)
			return wrapRestoreWithClassSerializer(rt, ctx, v, structural)
		case reflection.SubKindMap, reflection.SubKindSet:
			return emitNativeIterableRestoreFromJson(rt, ctx, v)
		case reflection.SubKindNonSerializable:
			return RTCode{Code: "", Type: CodeNS}
		}
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindPromise:
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindObjectLiteral:
		return emitObjectRestoreFromJsonSafe(rt, ctx, v)

	case reflection.KindProperty, reflection.KindPropertySignature:
		return emitPropertyRestoreFromJson(rt, ctx, v)

	case reflection.KindIndexSignature:
		// A bare `Record<K, V>` root. Its VALUES still strip (CompileChild routes
		// them back here), so the only reason to rebuild is a key pattern that
		// leaves some arriving keys undeclared.
		if _, hasRegex := indexSignatureKeyRegex(rt, ctx); !hasRegex {
			return emitIndexSignatureRestoreFromJson(rt, ctx, v)
		}
		return emitRootIndexSigRebuildFromJson(rt, ctx, v)

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

	case reflection.KindTupleMember:
		return emitTupleMemberRestoreFromJson(rt, ctx, v)

	case reflection.KindFunction, reflection.KindMethod,
		reflection.KindMethodSignature, reflection.KindCallSignature:
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindUnion:
		return emitUnionRestoreFromJsonSafe(rt, ctx, v)

	case reflection.KindIntersection:
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindTemplateLiteral:
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindLiteral:
		return emitLiteralRestoreFromJson(rt, ctx, v)

	case reflection.KindArray:
		if rt.Child == nil {
			return RTCode{Code: "", Type: CodeS}
		}
		return emitElementLoop(rt.Child, ctx, v, "0")
	}
	return RTCode{Code: "", Type: CodeNS}
}

// objectShapeGuard — the keyed analogue of compactFromJson's `Array.isArray`
// check. Rebuilding from the properties of a number, a string or an array would
// launder junk into an empty object, which a type whose props are all optional
// then accepts; anything that is not a plain object is left for validate.
func objectShapeGuard(v string) string {
	return objectGuard(v, "!Array.isArray("+v+")")
}

// emitObjectRestoreFromJsonSafe — the keyed declared-shape rebuild. Routes an
// object carrying an index signature to its own arm BEFORE collecting slots, so
// the drop diagnostics are emitted exactly once (same ordering rule as
// emitObjectCompactForJson).
func emitObjectRestoreFromJsonSafe(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if objectHasCallSignature(rt, ctx) {
		return RTCode{Code: "", Type: CodeNS}
	}
	if objectHasIndexSignature(rt, ctx) {
		// The declaration already admits every key that can arrive, so the
		// in-place walk removes nothing a rebuild would remove: delegate, and
		// keep rj's key-refusal loop as-is.
		if indexSigAdmitsEveryKey(rt, ctx) {
			return emitObjectJsonChildren(rt, ctx)
		}
		return emitIndexSigObjectRebuildFromJson(rt, ctx, v)
	}
	return emitDeclaredObjectRebuildFromJson(rt, ctx, v)
}

// emitDeclaredObjectRebuildFromJson restores each declared property at its own
// key, then rebuilds the object from those keys alone and rebinds the accessor.
// Anything the type does not declare is simply never copied across.
func emitDeclaredObjectRebuildFromJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	slots := collectCompactDeclaredSlots(rt, ctx)
	rVar := ctx.NextLocalVar("r")
	var restore strings.Builder
	restore.WriteString("if (" + objectShapeGuard(v) + ") {")

	type writeSlot struct {
		name       string
		isSafeName bool
		optional   bool
	}
	var writes []writeSlot
	for _, slot := range slots {
		accessor := propertyAccessor(v, slot.name, slot.isSafeName)
		ctx.SetChildAccessor(accessor)
		childRT := ctx.CompileChild(slot.childRef, CodeS)
		ctx.SetChildAccessor("")
		if childRT.Type == CodeNS {
			if propertyChildFailed(ctx) {
				return RTCode{Code: "", Type: CodeNS}
			}
			// Absorbed (a future kind with no emit) — the property is not part of
			// the declared shape, so it is not copied either.
			continue
		}
		if childRT.Code != "" {
			if slot.optional {
				restore.WriteString("if (" + accessor + " !== undefined) {" + childRT.Code + "}")
			} else {
				restore.WriteString(childRT.Code)
				if !strings.HasSuffix(childRT.Code, "}") && !strings.HasSuffix(childRT.Code, ";") {
					restore.WriteString(";")
				}
			}
		}
		// Recorded even when the child needed no transform: a declared key that is
		// not copied is a declared key DELETED, which is the opposite of the bug.
		writes = append(writes, writeSlot{name: slot.name, isSafeName: slot.isSafeName, optional: slot.optional})
	}

	restore.WriteString("const " + rVar + " = {};")
	for _, w := range writes {
		source := propertyAccessor(v, w.name, w.isSafeName)
		target := propertyAccessor(rVar, w.name, w.isSafeName)
		if w.optional {
			restore.WriteString("if (" + source + " !== undefined) {" + target + " = " + source + ";}")
		} else {
			restore.WriteString(target + " = " + source + ";")
		}
	}

	restore.WriteString(v + " = " + rVar + ";}")
	return RTCode{Code: restore.String(), Type: CodeS}
}

// indexSigAdmitsEveryKey reports whether rt's declaration admits every key that
// can arrive, which is exactly when the in-place restore walk produces the same
// key set as a rebuild and rjs can delegate to it. False is always the safe
// answer (a needless rebuild costs an allocation; a wrong delegation leaks keys),
// so anything unclear answers false.
func indexSigAdmitsEveryKey(rt *reflection.RunType, ctx *EmitContext) bool {
	admits := false
	for _, child := range objectMembers(rt) {
		resolved := ctx.ResolveRef(child)
		if resolved == nil || resolved.Kind != reflection.KindIndexSignature {
			continue
		}
		// A symbol-keyed or function-valued signature contributes no arm to the
		// clone, so it admits no wire key at all.
		if isSymbolKeyedIndexSig(resolved, ctx) || resolved.Child == nil {
			continue
		}
		valueResolved := ctx.ResolveRef(resolved.Child)
		if valueResolved == nil || isFunctionLikeKind(valueResolved.Kind) {
			continue
		}
		// A pattern key admits only the keys it matches; the rest are undeclared.
		if _, hasRegex := indexSignatureKeyRegex(resolved, ctx); hasRegex {
			return false
		}
		admits = true
	}
	// A declared member the codec DROPS (a static, a method, a DataOnly-stripped
	// value) is not on the clone either, so its wire key has to go too (G6).
	return admits && !objectDropsDeclaredMember(rt, ctx)
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

// declaredNameSkipCode — the `if (k === 'a' || k === 'b') continue;` prologue a
// rebuild loop needs so a declared key is never touched by an index arm. Built
// from collectSiblingNamedKeys directly (the kept AND dropped set, per G6)
// rather than siblingNamedSkipCode, which reads a context item only
// emitObjectJsonChildren publishes and returns "" in silence otherwise.
func declaredNameSkipCode(rt *reflection.RunType, ctx *EmitContext, keyVar string) string {
	names := collectSiblingNamedKeys(rt, ctx)
	if len(names) == 0 {
		return ""
	}
	var check strings.Builder
	check.WriteString("if (")
	for i, name := range names {
		if i > 0 {
			check.WriteString(" || ")
		}
		check.WriteString(keyVar + " === " + quoteJS(name))
	}
	check.WriteString(") continue;")
	return check.String()
}

// indexSigArm is one index signature's contribution to a rebuild loop.
type indexSigArm struct {
	sig         *reflection.RunType
	keyRegexVar string
}

// collectIndexSigArms returns the signatures a rebuild loop must sweep, deduped
// by VALUE TYPE. The dedup is what pjs can skip and rjs cannot: its per-key child
// code MUTATES the arriving value, so two sweeps over the same value type would
// transform each dynamic key twice.
func collectIndexSigArms(rt *reflection.RunType, ctx *EmitContext) []indexSigArm {
	var arms []indexSigArm
	seen := make(map[string]struct{})
	for _, child := range objectMembers(rt) {
		resolved := ctx.ResolveRef(child)
		if resolved == nil || resolved.Kind != reflection.KindIndexSignature {
			continue
		}
		if isSymbolKeyedIndexSig(resolved, ctx) || resolved.Child == nil {
			continue
		}
		valueResolved := ctx.ResolveRef(resolved.Child)
		if valueResolved == nil || isFunctionLikeKind(valueResolved.Kind) {
			continue
		}
		id := indexSigValueID(resolved, ctx)
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		arms = append(arms, indexSigArm{sig: resolved, keyRegexVar: indexSignatureKeyRegexVar(resolved, ctx)})
	}
	return arms
}

// emitRootIndexSigRebuildFromJson — a bare pattern-keyed `Record` at the root. A
// key the pattern does not match is undeclared, so it is never copied onto the
// rebuilt object.
func emitRootIndexSigRebuildFromJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	arms := collectIndexSigArms(rt, ctx)
	if len(arms) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	rVar := ctx.NextLocalVar("r")
	loop, ok := emitIndexSigRebuildLoop(arms, ctx, v, rVar, ctx.NextLocalVar("k"), "")
	if !ok {
		return RTCode{Code: "", Type: CodeNS}
	}
	body := "if (" + objectShapeGuard(v) + ") {const " + rVar + " = {};" + loop + v + " = " + rVar + ";}"
	return RTCode{Code: body, Type: CodeS}
}

// emitIndexSigObjectRebuildFromJson — an object carrying both declared props and
// an index signature, where something on the wire can still be undeclared. The
// dynamic sweep runs first and skips every declared name, then the declared
// props are restored and copied, so a declared slot always wins its key.
func emitIndexSigObjectRebuildFromJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	rVar := ctx.NextLocalVar("r")
	var restore strings.Builder
	restore.WriteString("if (" + objectShapeGuard(v) + ") {const " + rVar + " = {};")

	arms := collectIndexSigArms(rt, ctx)
	if len(arms) > 0 {
		keyVar := ctx.NextLocalVar("k")
		skip := declaredNameSkipCode(rt, ctx, keyVar)
		loop, ok := emitIndexSigRebuildLoop(arms, ctx, v, rVar, keyVar, skip)
		if !ok {
			return RTCode{Code: "", Type: CodeNS}
		}
		restore.WriteString(loop)
	}

	for _, slot := range collectCompactDeclaredSlots(rt, ctx) {
		accessor := propertyAccessor(v, slot.name, slot.isSafeName)
		target := propertyAccessor(rVar, slot.name, slot.isSafeName)
		ctx.SetChildAccessor(accessor)
		childRT := ctx.CompileChild(slot.childRef, CodeS)
		ctx.SetChildAccessor("")
		if childRT.Type == CodeNS {
			if propertyChildFailed(ctx) {
				return RTCode{Code: "", Type: CodeNS}
			}
			continue
		}
		var write strings.Builder
		if childRT.Code != "" {
			write.WriteString(childRT.Code)
			if !strings.HasSuffix(childRT.Code, "}") && !strings.HasSuffix(childRT.Code, ";") {
				write.WriteString(";")
			}
		}
		write.WriteString(target + " = " + accessor + ";")
		if slot.optional {
			restore.WriteString("if (" + accessor + " !== undefined) {" + write.String() + "}")
			continue
		}
		restore.WriteString(write.String())
	}

	restore.WriteString(v + " = " + rVar + ";}")
	return RTCode{Code: restore.String(), Type: CodeS}
}

// emitIndexSigRebuildLoop writes the `for (const k in v)` sweep both
// index-signature rebuilds use: refuse a prototype-named key, skip whatever the
// caller's prologue names, then per arm transform the value in place and copy it
// onto the fresh object. Each arm ends in `continue` so the first match wins.
// The key variable comes from the caller so the declared-name skip can be built
// against the same name before the loop is written.
func emitIndexSigRebuildLoop(arms []indexSigArm, ctx *EmitContext, v, rVar, keyVar, skipCode string) (string, bool) {
	accessor := v + "[" + keyVar + "]"
	var body strings.Builder
	body.WriteString("for (const " + keyVar + " in " + v + ") {")
	// The decoder rule: a prototype-named wire key is refused, never silently
	// skipped the way an encoder or a clone skips it (unsafe_keys.go).
	body.WriteString(unsafeKeyThrow(keyVar))
	body.WriteString(skipCode)
	for _, arm := range arms {
		ctx.SetChildAccessor(accessor)
		childRT := ctx.CompileChild(arm.sig.Child, CodeS)
		ctx.SetChildAccessor("")
		if childRT.Type == CodeNS {
			return "", false
		}
		var write strings.Builder
		if childRT.Code != "" {
			write.WriteString(childRT.Code)
			if !strings.HasSuffix(childRT.Code, "}") && !strings.HasSuffix(childRT.Code, ";") {
				write.WriteString(";")
			}
		}
		write.WriteString(rVar + "[" + keyVar + "] = " + accessor + "; continue;")
		if arm.keyRegexVar != "" {
			body.WriteString("if (" + arm.keyRegexVar + ".test(" + keyVar + ")) {" + write.String() + "}")
			continue
		}
		body.WriteString(write.String())
	}
	body.WriteString("}")
	return body.String(), true
}

// emitUnionRestoreFromJsonSafe — the union decode, gated the way the CLONE
// ENCODER gates it rather than the way the plain restore does.
//
// restoreFromJson returns identity whenever the layout carries no envelope,
// which is right for a walk that changes nothing but wrong here: a union of
// plain objects is fully JSON-compatible, so it never envelopes, and identity
// would strip nothing in the commonest case. prepareForJsonSafe gates on
// atomicOnlyJsonIdentity() instead and emits a bare stripped rebuild; this
// mirrors that, so the pair agree on both the wire and the key set.
//
// The layout itself is buildFlatLayout UNWIDENED. Compact has to widen because
// it changes the wire; rjs reads exactly what pjs writes, so widening here would
// make the decoder expect an envelope the encoder never wrote.
func emitUnionRestoreFromJsonSafe(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	return emitUnionRestoreFromJsonSafeLayout(rt, ctx, v, buildFlatLayout(rt, ctx))
}

// emitUnionRestoreFromJsonSafeLayout is the same decode over a caller-built layout, the twin of
// emitUnionPrepareForJsonSafeLayout on the encode side. Compact needs it: compact ENCODE already
// goes through the safe (stripping) encoder over its widened layout, and its decode used the
// MUTATE restore, which keeps extras. That asymmetry let a compact route accept undeclared keys on
// every union carrying an object member.
func emitUnionRestoreFromJsonSafeLayout(rt *reflection.RunType, ctx *EmitContext, v string, layout FlatLayout) RTCode {
	if len(layout.AtomicMembers) == 0 && len(layout.ObjectMembers) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	// Every member is a JSON-identity atomic: nothing to unwrap and no declared
	// object shape to rebuild.
	if layout.atomicOnlyJsonIdentity() {
		return RTCode{Code: "", Type: CodeS}
	}
	if layout.AtomicNeedsTuple {
		return emitEnvelopedUnionRestoreSafe(rt, ctx, v, layout)
	}
	return emitBareUnionRestoreSafe(ctx, v, layout)
}

// emitEnvelopedUnionRestoreSafe — the `[index, value]` wire. Identical to
// emitUnionRestoreFromJsonFlatLayout including its wire-shape guard (the union is
// in reflection.MustValidateJson, so the array check before `v = v[1]` is not
// optional); only the object branch is swapped for a rebuild.
func emitEnvelopedUnionRestoreSafe(rt *reflection.RunType, ctx *EmitContext, v string, layout FlatLayout) RTCode {
	decVar := ctx.NextLocalVar("dec")
	var arms []string

	if len(layout.ObjectMembers) > 0 {
		rebuild, ok := emitMergedPropsRebuild(ctx, v, layout)
		if !ok {
			return RTCode{Code: "", Type: CodeNS}
		}
		arms = append(arms, "if ("+decVar+" === -1) {"+rebuild+"}")
	}

	for _, member := range layout.AtomicMembers {
		restoreRT := ctx.CompileChild(member.Ref, CodeS)
		if restoreRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		body := strings.TrimSpace(restoreRT.Code)
		if body != "" && !strings.HasSuffix(body, ";") && !strings.HasSuffix(body, "}") {
			body += ";"
		}
		arm := "if (" + decVar + " === " + strconv.Itoa(member.OriginalIndex) + ") {" + body + "}"
		if len(arms) > 0 {
			arm = " else " + arm
		}
		arms = append(arms, arm)
	}

	if len(arms) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	errVar := flatUnionDecodeErrorVar(ctx)
	inner := strings.Join(arms, "") + unionDecodeThrow(errVar, decVar)
	body := "if (Array.isArray(" + v + ") && " + v + ".length === 2) {" +
		"const " + decVar + " = " + v + "[0]; " + v + " = " + v + "[1];" + inner + "}" +
		unionDecodeThrow(errVar, v)
	return RTCode{Code: body, Type: CodeS}
}

// emitBareUnionRestoreSafe — the un-enveloped wire. Every member round-trips
// raw, so the wire shape equals the runtime shape and the ENCODER's own guards,
// in the encoder's own order, pick the same arm the encoder picked. An unmatched
// value is left untouched for validate to refuse rather than thrown on: unlike
// the enveloped wire, a bare value IS a legal wire form here.
func emitBareUnionRestoreSafe(ctx *EmitContext, v string, layout FlatLayout) RTCode {
	prologue, dispatchArms := layout.atomicEncodeDispatch(v, ctx)
	var clauses []string

	for _, arm := range dispatchArms {
		restoreRT := ctx.CompileChild(arm.Member.Ref, CodeS)
		if restoreRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		body := strings.TrimSpace(restoreRT.Code)
		if body != "" && !strings.HasSuffix(body, ";") && !strings.HasSuffix(body, "}") {
			body += ";"
		}
		// An empty arm still ships: it SHADOWS the object clause below, which is
		// what stops a bare `object` member being rebuilt into the merged shape.
		clauses = append(clauses, "if ("+arm.Guard+") {"+body+"}")
	}

	if len(layout.ObjectMembers) > 0 {
		rebuild, ok := emitMergedPropsRebuild(ctx, v, layout)
		if !ok {
			return RTCode{Code: "", Type: CodeNS}
		}
		clauses = append(clauses, "if ("+objectShapeGuard(v)+") {"+rebuild+"}")
	}

	if len(clauses) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	return RTCode{Code: prologue + strings.Join(clauses, " else "), Type: CodeS}
}

// emitMergedPropsRebuild restores each merged prop where it arrived, then builds
// a fresh object from those props alone. mergedPropSurvivingGuard is deliberately
// NOT used: it tests a runtime-typed value, and on the wire a Date candidate is a
// string, so it would drop a legitimately encoded key.
func emitMergedPropsRebuild(ctx *EmitContext, v string, layout FlatLayout) (string, bool) {
	rVar := ctx.NextLocalVar("r")
	var restore strings.Builder
	for _, mp := range layout.MergedProps {
		accessor := propertyAccessor(v, mp.Name, mp.IsSafeName)
		propCode, ok := emitMergedPropRestore(mp, accessor, ctx)
		if !ok {
			return "", false
		}
		if propCode == "" {
			continue
		}
		if mp.Required {
			restore.WriteString(propCode)
			if !strings.HasSuffix(propCode, "}") && !strings.HasSuffix(propCode, ";") {
				restore.WriteString(";")
			}
			continue
		}
		restore.WriteString("if (" + accessor + " !== undefined) {" + propCode + "}")
	}

	restore.WriteString("const " + rVar + " = {};")
	for _, mp := range layout.MergedProps {
		source := propertyAccessor(v, mp.Name, mp.IsSafeName)
		target := propertyAccessor(rVar, mp.Name, mp.IsSafeName)
		// Every merged prop is copied, including one whose restore was a noop: a
		// declared key left out of the rebuild is a declared key deleted.
		if mp.Required {
			restore.WriteString(target + " = " + source + ";")
			continue
		}
		restore.WriteString("if (" + source + " !== undefined) {" + target + " = " + source + ";}")
	}
	restore.WriteString(v + " = " + rVar + ";")
	return restore.String(), true
}
