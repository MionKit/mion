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

// unionDecodeThrow is the cold-branch throw of a union decoder; the message and the index that matched no
// member are concatenated only when the throw fires.
func unionDecodeThrow(errVar, indexVar string) string {
	return " else { throw new Error(" + errVar + " + " + indexVar + ") }"
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
