package typefunctions

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// union_flat.go holds the three KindUnion emits of the JSON-serialiser family; the layout they iterate is
// built by buildFlatLayout (union_flat_layout.go). Wire shape: atomic members keep `[memberIndex, value]`,
// object/class members are MERGED into one `[-1, mergedObject]` envelope carrying the union of their
// properties, each encoded when its key is defined. The merge avoids the per-object `validate` walk on
// encode for a discriminated bag of N large classes; the `-1` sentinel skips dispatch on decode. When two
// object members declare the same name with different child type IDs, that prop branches through a nested
// `[subIdx, value]` inline-union.

// flatUnionEncodeErrorVar registers the canonical encode-error context item once per emit pass, shared
// across all three emit families so the renderer collapses to a single declaration.
func flatUnionEncodeErrorVar(ctx *EmitContext) string {
	name := "fuEncErr"
	if !ctx.HasContextItem(name) {
		ctx.SetContextItem(name, "const "+name+" = '[mion] Can not json encode union: item does not belong to the union'")
	}
	return name
}

// flatUnionDecodeErrorVar is the JSON decode message; the throw site appends
// the received index (see unionDecodeThrow) so the report names what arrived.
func flatUnionDecodeErrorVar(ctx *EmitContext) string {
	name := "fuDecErr"
	if !ctx.HasContextItem(name) {
		ctx.SetContextItem(name, "const "+name+" = '[mion] Can not json decode union: invalid union index '")
	}
	return name
}

// flatUnionDecodeBinaryErrorVar is the binary-decode counterpart: the wire
// carries a discriminator, not a JSON index, so the message says so.
func flatUnionDecodeBinaryErrorVar(ctx *EmitContext) string {
	name := "fuDecBinErr"
	if !ctx.HasContextItem(name) {
		ctx.SetContextItem(name, "const "+name+" = '[mion] Can not binary decode union: invalid union discriminator '")
	}
	return name
}

// unionDecodeThrow is the cold-branch throw of a union decoder; the message and the index that matched no
// member are concatenated only when the throw fires.
func unionDecodeThrow(errVar, indexVar string) string {
	return " else { throw new Error(" + errVar + " + " + indexVar + ") }"
}

// flatUnionEncodeBinaryErrorVar is the binary-encode counterpart of
// flatUnionEncodeErrorVar — the binary encoder must not reuse the JSON message.
func flatUnionEncodeBinaryErrorVar(ctx *EmitContext) string {
	name := "fuEncBinErr"
	if !ctx.HasContextItem(name) {
		ctx.SetContextItem(name, "const "+name+" = '[mion] Can not binary encode union: item does not belong to the union'")
	}
	return name
}

// discCandidateGuard returns the JS boolean that selects `cand` by the union discriminant value.
// It replaces the per-value `validate` check when the layout has a usable discriminant (mp.hasDiscDispatch):
// the discriminant survives a round-trip, so the sub-index is byte-stable even for a value whose prop
// normalises to a shape that would re-classify under the validate path.
func discCandidateGuard(discAccessor string, cand FlatPropCandidate) string {
	if len(cand.DiscValues) == 0 {
		return ""
	}
	parts := make([]string, 0, len(cand.DiscValues))
	for _, value := range cand.DiscValues {
		parts = append(parts, discAccessor+" === "+value)
	}
	if len(parts) == 1 {
		return parts[0]
	}
	return "(" + strings.Join(parts, " || ") + ")"
}

// mergedPropSurvivingGuard returns a JS boolean true iff `accessor`'s value matches one of the merged
// prop's SURVIVING candidates, i.e. belongs to a member where this prop was NOT DataOnly-stripped.
// Used only when mp.HasStrippedCandidate: a value from a stripped member still carries the key with a
// foreign type, so the encode applies the surviving codec only under this guard and DROPS the key
// otherwise (G3 / G4).
func mergedPropSurvivingGuard(mp FlatMergedProp, accessor string, ctx *EmitContext) string {
	var checks []string
	for _, cand := range mp.Candidates {
		if cand.Resolved == nil {
			continue
		}
		validateExpr := unionMemberValidateCheck(cand.Resolved, ctx, accessor)
		guard := validateExpr
		if isObjectLikeKind(cand.Resolved.Kind) {
			guard = objectGuard(accessor, validateExpr)
		}
		checks = append(checks, "("+guard+")")
	}
	if len(checks) == 0 {
		return "false"
	}
	return strings.Join(checks, " || ")
}

// --- prepareForJson encode ---------------------------------------------------

// emitUnionPrepareForJsonFlat is the encode side of the flat-union wire shape, mutating v: object members
// get every defined property transformed then `v = [-1, v]`, atomic members run their prepare and wrap as
// `[memberIndex, v]` when layout.AtomicNeedsTuple.
// The wrap is all-or-nothing, so the decoder either unwraps unconditionally or is identity.
func emitUnionPrepareForJsonFlat(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	layout := buildFlatLayout(rt, ctx)
	if len(layout.AtomicMembers) == 0 && len(layout.ObjectMembers) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	// Round-trips raw: no transform to apply, no envelope, identity. Broader than atomicOnlyJsonIdentity,
	// since mutate never strips, so a JSON-compatible object member also passes through untouched.
	if !layout.AtomicNeedsTuple {
		return RTCode{Code: "", Type: CodeS}
	}

	var clauses []string

	// A class member's arm appears twice (identity + structural) selecting the same OriginalIndex, so
	// compile each member's body exactly once (atomicEncodeDispatch).
	prologue, arms := layout.atomicEncodeDispatch(v, ctx)
	bodyByIndex := make(map[int]string, len(layout.AtomicMembers))
	for _, m := range layout.AtomicMembers {
		prepareRT := ctx.CompileChild(m.Ref, CodeS)
		if prepareRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		body := strings.TrimSpace(prepareRT.Code)
		if body != "" && !strings.HasSuffix(body, ";") && !strings.HasSuffix(body, "}") {
			body += ";"
		}
		if layout.AtomicNeedsTuple {
			body += v + " = [" + strconv.Itoa(m.OriginalIndex) + ", " + v + "]"
		}
		bodyByIndex[m.OriginalIndex] = body
	}
	for _, arm := range arms {
		clause := "if (" + arm.Guard + ") {" + bodyByIndex[arm.Member.OriginalIndex] + "}"
		if len(clauses) > 0 {
			clause = " else " + clause
		}
		clauses = append(clauses, clause)
	}

	if len(layout.ObjectMembers) > 0 {
		discAccessor := layout.discAccessor(v)
		var propParts []string
		for _, mp := range layout.MergedProps {
			accessor := propertyAccessor(v, mp.Name, mp.IsSafeName)
			propCode, ok := emitMergedPropPrepare(mp, accessor, discAccessor, ctx)
			if !ok {
				return RTCode{Code: "", Type: CodeNS}
			}
			if propCode == "" {
				continue
			}
			// A Required prop is present once the outer object-type gate passes, so it skips the guard.
			if mp.Required {
				propParts = append(propParts, propCode)
			} else {
				propParts = append(propParts, "if ("+namedPropertyPresenceTest(mp.Name, v, accessor)+") {"+propCode+"}")
			}
		}
		body := strings.Join(propParts, ";")
		if body != "" {
			body += ";"
		}
		// Wrap only when the union carries a transform somewhere; a round-trips-raw union already returned
		// identity at the early-out above, so this branch only ever runs with the wrap.
		if layout.AtomicNeedsTuple {
			body += v + " = [-1, " + v + "]"
		}
		clause := "if (typeof " + v + " === 'object' && " + v + " !== null) {" + body + "}"
		if len(clauses) > 0 {
			clause = " else " + clause
		}
		clauses = append(clauses, clause)
	}

	errVar := flatUnionEncodeErrorVar(ctx)
	clauses = append(clauses, " else { throw new Error("+errVar+") }")
	return RTCode{Code: prologue + strings.Join(clauses, ""), Type: CodeS}
}

// emitMergedPropPrepare returns the inline JS body that transforms one merged property's value, or
// ("", true) when no transform is required.
// Multi-candidate props follow the all-or-nothing wrap rule (FlatMergedProp.NeedsSubWrap): either every
// candidate is noop on both halves and the value round-trips through JSON's natural typing, or every
// candidate emits its transform plus the `[subIdx, value]` wrap the decoder unconditionally unwraps.
// Under mp.HasStrippedCandidate the surviving codec runs only for a matching value; a value from a
// stripped member is `delete`d instead, matching its DataOnly projection (G3 / G4).
func emitMergedPropPrepare(mp FlatMergedProp, accessor, discAccessor string, ctx *EmitContext) (string, bool) {
	base, ok := mergedPropPrepareBody(mp, accessor, discAccessor, ctx)
	if !ok {
		return "", false
	}
	if mp.HasStrippedCandidate {
		guard := mergedPropSurvivingGuard(mp, accessor, ctx)
		return "if (" + guard + ") {" + base + "} else { delete " + accessor + " }", true
	}
	return base, true
}

func mergedPropPrepareBody(mp FlatMergedProp, accessor, discAccessor string, ctx *EmitContext) (string, bool) {
	if len(mp.Candidates) == 1 {
		ctx.SetChildAccessor(accessor)
		jc := ctx.CompileChild(mp.Candidates[0].ChildRef, CodeS)
		ctx.SetChildAccessor("")
		if jc.Type == CodeNS {
			return "", false
		}
		return strings.TrimSpace(jc.Code), true
	}
	if !mp.NeedsSubWrap {
		// Every candidate is noop on both halves: JSON round-trips the value, no dispatch and no wrap.
		return "", true
	}
	// With a usable discriminant, gate each arm by the discriminant value, stable across a round-trip,
	// instead of re-validating the prop value.
	useDisc := discAccessor != "" && mp.hasDiscDispatch()
	var arms []string
	for i, cand := range mp.Candidates {
		ctx.SetChildAccessor(accessor)
		jc := ctx.CompileChild(cand.ChildRef, CodeS)
		ctx.SetChildAccessor("")
		if jc.Type == CodeNS {
			return "", false
		}
		if cand.Resolved == nil {
			continue
		}
		guard := ""
		if useDisc {
			guard = discCandidateGuard(discAccessor, cand)
		} else {
			validateExpr := unionMemberValidateCheck(cand.Resolved, ctx, accessor)
			guard = validateExpr
			if isObjectLikeKind(cand.Resolved.Kind) {
				guard = objectGuard(accessor, validateExpr)
			}
		}
		body := strings.TrimSpace(jc.Code)
		if body != "" && !strings.HasSuffix(body, ";") && !strings.HasSuffix(body, "}") {
			body += ";"
		}
		body += accessor + " = [" + strconv.Itoa(i) + ", " + accessor + "]"
		arm := "if (" + guard + ") {" + body + "}"
		if len(arms) > 0 {
			arm = " else " + arm
		}
		arms = append(arms, arm)
	}
	if len(arms) == 0 {
		return "", true
	}
	return strings.Join(arms, ""), true
}

// --- restoreFromJsonMutate decode --------------------------------------------------

// emitUnionRestoreFromJsonFlat is the decode side of the flat-union wire shape. Under the all-or-nothing
// wrap rule (FlatLayout.AtomicNeedsTuple) either every encoded value is wrapped (`[-1, …]` object,
// `[idx, …]` atomic) or the whole union round-trips raw and the decoder is identity, so the compile-time
// decision alone tells the decoder which shape to expect.
func emitUnionRestoreFromJsonFlat(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	return emitUnionRestoreFromJsonFlatLayout(rt, ctx, v, buildFlatLayout(rt, ctx))
}

// emitUnionRestoreFromJsonFlatLayout is the decode body over a caller-built
// layout, compact widens the envelope rule first (buildCompactFlatLayout).
func emitUnionRestoreFromJsonFlatLayout(rt *reflection.RunType, ctx *EmitContext, v string, layout FlatLayout) RTCode {
	if len(layout.AtomicMembers) == 0 && len(layout.ObjectMembers) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	if !layout.AtomicNeedsTuple {
		// Nothing was enveloped on encode, so there is nothing to unwrap or reconstruct: identity.
		return RTCode{Code: "", Type: CodeS}
	}
	return emitEnvelopedUnionRestore(ctx, v, layout, emitMergedPropsInPlace)
}

// unionObjectArm builds the body of a union decoder's object branch: rj
// restores each merged prop in place (emitMergedPropsInPlace), rjs rebuilds
// the object from them (emitMergedPropsRebuild).
type unionObjectArm func(ctx *EmitContext, v string, layout FlatLayout) (string, bool)

// emitMergedPropsInPlace restores each defined merged prop where it sits; Required props skip the
// `=== undefined` guard, matching the encoder in emitUnionPrepareForJsonFlat.
func emitMergedPropsInPlace(ctx *EmitContext, v string, layout FlatLayout) (string, bool) {
	var propParts []string
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
			propParts = append(propParts, propCode)
		} else {
			propParts = append(propParts, "if ("+namedPropertyPresenceTest(mp.Name, v, accessor)+") {"+propCode+"}")
		}
	}
	return strings.Join(propParts, ";"), true
}

// emitEnvelopedUnionRestore decodes the `[idx, value]` wire: the object branch under idx -1, then one arm
// per atomic member. The wire is untrusted, so the shape is checked before the unwrap
// (reflection.MustValidateJson lists KindUnion for that reason) and `null[0]` never
// throws a raw TypeError out of the decoder. A value that is not a two-slot array is refused with the same
// typed `[mion]` error as an unknown index: leaving it in place would let validate accept it through a
// member it never encoded as.
func emitEnvelopedUnionRestore(ctx *EmitContext, v string, layout FlatLayout, objectArm unionObjectArm) RTCode {
	decVar := ctx.NextLocalVar("dec")
	var arms []string

	if len(layout.ObjectMembers) > 0 {
		body, ok := objectArm(ctx, v, layout)
		if !ok {
			return RTCode{Code: "", Type: CodeNS}
		}
		arms = append(arms, "if ("+decVar+" === -1) {"+body+"}")
	}

	for _, m := range layout.AtomicMembers {
		restoreRT := ctx.CompileChild(m.Ref, CodeS)
		if restoreRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		arm := "if (" + decVar + " === " + strconv.Itoa(m.OriginalIndex) + ") {" + terminated(strings.TrimSpace(restoreRT.Code)) + "}"
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

// emitMergedPropRestore is the decode-side mirror of emitMergedPropPrepare, under the same all-or-nothing
// rule (FlatMergedProp.NeedsSubWrap): either every candidate is noop and the value round-trips, or every
// candidate emits the `[subIdx, value]` decode dispatch.
func emitMergedPropRestore(mp FlatMergedProp, accessor string, ctx *EmitContext) (string, bool) {
	if len(mp.Candidates) == 1 {
		ctx.SetChildAccessor(accessor)
		jc := ctx.CompileChild(mp.Candidates[0].ChildRef, CodeS)
		ctx.SetChildAccessor("")
		if jc.Type == CodeNS {
			return "", false
		}
		return strings.TrimSpace(jc.Code), true
	}
	if !mp.NeedsSubWrap {
		// The encoder emitted no wrap (all candidates noop), so there is nothing to undo on decode.
		return "", true
	}
	subDecVar := ctx.NextLocalVar("sub")
	var arms []string
	for i, cand := range mp.Candidates {
		ctx.SetChildAccessor(accessor)
		jc := ctx.CompileChild(cand.ChildRef, CodeS)
		ctx.SetChildAccessor("")
		if jc.Type == CodeNS {
			return "", false
		}
		body := strings.TrimSpace(jc.Code)
		if body != "" && !strings.HasSuffix(body, ";") && !strings.HasSuffix(body, "}") {
			body += ";"
		}
		arm := "if (" + subDecVar + " === " + strconv.Itoa(i) + ") {" + body + "}"
		if len(arms) > 0 {
			arm = " else " + arm
		}
		arms = append(arms, arm)
	}
	if len(arms) == 0 {
		return "", true
	}
	body := "if (Array.isArray(" + accessor + ") && " + accessor + ".length === 2 && typeof " + accessor + "[0] === 'number') {" +
		"const " + subDecVar + " = " + accessor + "[0]; " + accessor + " = " + accessor + "[1];" +
		strings.Join(arms, "") + unionDecodeThrow(flatUnionDecodeErrorVar(ctx), subDecVar) +
		"}"
	return body, true
}

// --- stringifyJson encode (single-pass string) ------------------------------

// emitUnionStringifyJsonFlat is the single-pass stringification of the flat-union wire shape: mirrors
// emitUnionPrepareForJsonFlat structurally, but each branch BUILDS the JSON string for the envelope
// instead of mutating `v`. The wrap decision is all-or-nothing (FlatLayout.AtomicNeedsTuple), so the
// decoder always knows whether to unwrap.
func emitUnionStringifyJsonFlat(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	layout := buildFlatLayout(rt, ctx)
	if len(layout.AtomicMembers) == 0 && len(layout.ObjectMembers) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	// All members JSON-identity: stringify the value directly, no per-member dispatch.
	if layout.atomicOnlyJsonIdentity() {
		return RTCode{Code: "return JSON.stringify(" + v + ");", Type: CodeRB}
	}

	var clauses []string

	// Each member's JSON fragment is built once even though a class member takes two arms
	// (atomicEncodeDispatch); a member whose stringify is empty contributes no arm.
	prologue, arms := layout.atomicEncodeDispatch(v, ctx)
	emitByIndex := make(map[int]string, len(layout.AtomicMembers))
	for _, m := range layout.AtomicMembers {
		childRT := ctx.CompileChild(m.Ref, CodeE)
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code == "" {
			continue
		}
		emitted := childRT.Code
		if layout.AtomicNeedsTuple {
			emitted = "'[" + strconv.Itoa(m.OriginalIndex) + ",' + " + childRT.Code + " + ']'"
		}
		emitByIndex[m.OriginalIndex] = emitted
	}
	for _, arm := range arms {
		emitted, ok := emitByIndex[arm.Member.OriginalIndex]
		if !ok {
			continue
		}
		clause := "if (" + arm.Guard + ") { return " + emitted + ";}"
		if len(clauses) > 0 {
			clause = " else " + clause
		}
		clauses = append(clauses, clause)
	}

	if len(layout.ObjectMembers) > 0 {
		// The merged object is stringified with direct string concat, never `[parts].filter(Boolean).join(',')`,
		// which allocates two arrays and a string per call. Splitting required from optional props lets the
		// common discriminated union (every member sharing one property set) collapse to a flat concat.
		// The first required prop is the comma anchor and emits without a leading comma; every other
		// fragment leads with `,`. With no required prop at all, each branch prepends `,` and the
		// concatenated string drops it with slice(1).
		hasRequired := false
		for _, mp := range layout.MergedProps {
			if mp.Required {
				hasRequired = true
				break
			}
		}
		discAccessor := layout.discAccessor(v)
		var compiledProps []stringifyMergedProp
		for _, mp := range layout.MergedProps {
			accessor := propertyAccessor(v, mp.Name, mp.IsSafeName)
			propJson, ok := emitMergedPropStringify(mp, accessor, discAccessor, ctx)
			if !ok {
				return RTCode{Code: "", Type: CodeNS}
			}
			if propJson == "" {
				continue
			}
			dropCond := accessor + " === undefined"
			if mp.HasStrippedCandidate {
				dropCond += " || !(" + mergedPropSurvivingGuard(mp, accessor, ctx) + ")"
			}
			compiledProps = append(compiledProps, stringifyMergedProp{mp: mp, accessor: accessor, propJson: propJson, dropCond: dropCond})
		}
		var objExpr string
		if layout.hasIndexSignatureMember(ctx) {
			objExpr = emitMergedObjectOpenStringify(v, compiledProps, ctx)
		} else if len(compiledProps) == 0 {
			objExpr = "'{}'"
		} else if hasRequired {
			var parts []string
			firstRequiredSeen := false
			for _, cp := range compiledProps {
				prefix := "'" + jsonPropPrefix(cp.mp.Name, cp.mp.IsSafeName) + "'"
				if cp.mp.Required {
					if !firstRequiredSeen {
						parts = append(parts, prefix+"+"+cp.propJson)
						firstRequiredSeen = true
					} else {
						parts = append(parts, "','+"+prefix+"+"+cp.propJson)
					}
				} else {
					// dropCond folds in the stripped-sibling guard, so a foreign-typed value also emits ''.
					parts = append(parts, "("+cp.dropCond+" ? '' : ','+"+prefix+"+"+cp.propJson+")")
				}
			}
			objExpr = "'{'+" + strings.Join(parts, "+") + "+'}'"
		} else {
			// All optional: one string for the concat plus one for slice(1) (a V8 cons-string), no arrays.
			var parts []string
			for _, cp := range compiledProps {
				prefix := "'" + jsonPropPrefix(cp.mp.Name, cp.mp.IsSafeName) + "'"
				parts = append(parts, "("+cp.dropCond+" ? '' : ','+"+prefix+"+"+cp.propJson+")")
			}
			objExpr = "'{'+(" + strings.Join(parts, "+") + ").slice(1)+'}'"
		}
		// Wrap in `[-1, …]` only when the union carries a transform somewhere; a round-trips-raw union emits
		// the bare object JSON so it decodes identity. The per-prop stringify strips undeclared keys either way.
		result := objExpr
		if layout.AtomicNeedsTuple {
			result = "'[-1,' + " + objExpr + " + ']'"
		}
		clause := "if (typeof " + v + " === 'object' && " + v + " !== null) { return " + result + ";}"
		if len(clauses) > 0 {
			clause = " else " + clause
		}
		clauses = append(clauses, clause)
	}

	errVar := flatUnionEncodeErrorVar(ctx)
	clauses = append(clauses, " else { throw new Error("+errVar+") }")
	return RTCode{Code: prologue + strings.Join(clauses, ""), Type: CodeRB}
}

// stringifyMergedProp is one merged prop's compiled JSON fragment; dropCond is the `=== undefined` test,
// extended for a prop with a stripped sibling so a present but foreign-typed value also emits no fragment
// (the key is dropped, G3 / G4).
type stringifyMergedProp struct {
	mp       FlatMergedProp
	accessor string
	propJson string
	dropCond string
}

// emitMergedObjectOpenStringify is the object clause of a union with an index-signature member, which
// declares every key for the whole union (FlatLayout.hasIndexSignatureMember), so the object member keeps
// every key exactly as the decoders keep it. Props needing no transform are native JSON.stringify of the
// whole value; otherwise every own key is written in place and only a declared prop with a transform or a
// stripped sibling takes its own arm. A key native JSON would omit is omitted here too.
func emitMergedObjectOpenStringify(v string, props []stringifyMergedProp, ctx *EmitContext) string {
	var transformed []stringifyMergedProp
	for _, prop := range props {
		if prop.propJson != "JSON.stringify("+prop.accessor+")" || prop.mp.HasStrippedCandidate {
			transformed = append(transformed, prop)
		}
	}
	if len(transformed) == 0 {
		return "JSON.stringify(" + v + ")"
	}
	keyVar := ctx.NextLocalVar("k")
	arr := ctx.NextLocalVar("ls")
	text := ctx.NextLocalVar("s")
	var body strings.Builder
	body.WriteString("const " + arr + " = []; for (const " + keyVar + " in " + v + ") {")
	for _, prop := range transformed {
		prefix := "'" + jsonPropPrefix(prop.mp.Name, prop.mp.IsSafeName) + "'"
		body.WriteString("if (" + keyVar + " === " + quoteJS(prop.mp.Name) + ") {if (" + prop.dropCond + ") continue; " + arr + ".push(" + prefix + "+" + prop.propJson + "); continue;}")
	}
	body.WriteString("const " + text + " = JSON.stringify(" + v + "[" + keyVar + "]); if (" + text + " === undefined) continue; " +
		arr + ".push(JSON.stringify(" + keyVar + ") + ':' + " + text + ");} return '{' + " + arr + ".join(',') + '}'")
	params := ctx.CtxFnParams(v)
	return ctx.CreateFnInContext(body.String(), CodeRB, params, params)
}

// emitMergedPropStringify returns the JS expression evaluating to the JSON fragment for a merged prop's
// value. Multi-candidate props follow the same all-or-nothing rule as the outer union
// (FlatMergedProp.NeedsSubWrap): every candidate noop means no `[subIdx, value]` wrap, since
// emitMergedPropRestore emits no transform either and JSON's natural typing recovers the value; one
// non-noop candidate means every candidate wraps so the decoder can unwrap unconditionally.
func emitMergedPropStringify(mp FlatMergedProp, accessor, discAccessor string, ctx *EmitContext) (string, bool) {
	if len(mp.Candidates) == 1 {
		ctx.SetChildAccessor(accessor)
		jc := ctx.CompileChild(mp.Candidates[0].ChildRef, CodeE)
		ctx.SetChildAccessor("")
		if jc.Type == CodeNS {
			return "", false
		}
		if jc.Code == "" {
			return "JSON.stringify(" + accessor + ")", true
		}
		return jc.Code, true
	}
	type compiled struct {
		code       string
		resolved   *reflection.RunType
		discValues []string
	}
	candidates := make([]compiled, 0, len(mp.Candidates))
	for _, cand := range mp.Candidates {
		ctx.SetChildAccessor(accessor)
		jc := ctx.CompileChild(cand.ChildRef, CodeE)
		ctx.SetChildAccessor("")
		if jc.Type == CodeNS {
			return "", false
		}
		if cand.Resolved == nil {
			continue
		}
		childCode := jc.Code
		if childCode == "" {
			childCode = "JSON.stringify(" + accessor + ")"
		}
		candidates = append(candidates, compiled{code: childCode, resolved: cand.Resolved, discValues: cand.DiscValues})
	}
	if len(candidates) == 0 {
		return "", true
	}
	if !mp.NeedsSubWrap {
		// The decoder emits no sub-dispatch, so return one of the candidate codes without the
		// `[subIdx, value]` wrap; the validate arms remain, but every arm is JSON.parse-recoverable.
		errVar := flatUnionEncodeErrorVar(ctx)
		arms := make([]string, 0, len(candidates))
		for _, cand := range candidates {
			validateExpr := unionMemberValidateCheck(cand.resolved, ctx, accessor)
			guard := validateExpr
			if isObjectLikeKind(cand.resolved.Kind) {
				guard = objectGuard(accessor, validateExpr)
			}
			arms = append(arms, "if ("+guard+") return "+cand.code+";")
		}
		// Every candidate emitting the SAME code (e.g. `'a' | 'b' | 'c'`) makes every arm return the same
		// thing, so collapse to that shared code.
		allSame := true
		for i := 1; i < len(candidates); i++ {
			if candidates[i].code != candidates[0].code {
				allSame = false
				break
			}
		}
		if allSame {
			return candidates[0].code, true
		}
		// Dispatch arms hoist into a context fn, created once per materialization; errVar resolves through
		// the closure, being itself a context line.
		params := ctx.CtxFnParams(accessor)
		call := ctx.CreateFnInContext(strings.Join(arms, " ")+" throw new Error("+errVar+");", CodeRB, params, params)
		return call, true
	}
	// With a usable discriminant, gate each wrapped arm by the discriminant value, stable across a
	// round-trip, instead of re-validating the prop value.
	useDisc := discAccessor != "" && mp.hasDiscDispatch()
	errVar := flatUnionEncodeErrorVar(ctx)
	arms := make([]string, 0, len(candidates))
	for i, cand := range candidates {
		guard := ""
		if useDisc {
			guard = discCandidateGuard(discAccessor, FlatPropCandidate{DiscValues: cand.discValues})
		} else {
			validateExpr := unionMemberValidateCheck(cand.resolved, ctx, accessor)
			guard = validateExpr
			if isObjectLikeKind(cand.resolved.Kind) {
				guard = objectGuard(accessor, validateExpr)
			}
		}
		arm := "if (" + guard + ") return '[" + strconv.Itoa(i) + ",' + " + cand.code + " + ']';"
		arms = append(arms, arm)
	}
	params := ctx.CtxFnParams(accessor)
	call := ctx.CreateFnInContext(strings.Join(arms, " ")+" throw new Error("+errVar+");", CodeRB, params, params)
	return call, true
}
