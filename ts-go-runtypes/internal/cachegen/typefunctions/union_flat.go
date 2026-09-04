package typefunctions

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// union_flat.go owns the three KindUnion emits used by the JSON-
// serialiser family. The wire shape differs from the legacy non-flat
// family only at unions:
//
//   - Atomic union members keep the original `[memberIndex, value]`
//     envelope. Wrap-or-not is all-or-nothing across the atomic branch
//     (see FlatLayout.AtomicNeedsTuple) so the decoder always knows
//     the wire shape at compile time.
//   - Object/class union members are MERGED into one envelope:
//     `[-1, mergedObject]`. The merged object carries the union of
//     every object member's properties; each property is encoded if
//     its key is defined on `v` at encode time. Decode mirrors the
//     encode: walk the merged set, decode every defined key.
//
// The optimisation avoids the per-object `validate` walk on encode for
// the common "discriminated bag of N large classes" shape — instead of
// running N property-set checks to pick a member index, the emitter
// runs the per-property transforms directly and uses the `-1` sentinel
// at decode time to skip dispatch entirely.
//
// Conflict resolution: when two object members carry a property with
// the same name but different child type IDs, the merged prop's value
// branches at runtime via a nested `[subIdx, value]` inline-union —
// same shape as the regular non-flat union, but scoped to that one
// property.
//
// Object members that carry an index signature can't be safely merged
// (dynamic keys would collide with the merged-set discriminator), so
// they fall back into the atomic bucket and get their original
// per-member `[memberIndex, value]` dispatch.
//
// Structural decisions (bucketing, merged-prop list, wrap flags) live
// in buildFlatLayout (union_flat_layout.go); this file holds the
// codegen for the three encode/decode families.

// flatUnionEncodeErrorVar registers the canonical encode-error context
// item once per emit pass and returns its name. Shared across all
// three emit families so the renderer collapses to a single
// declaration.
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

// unionDecodeThrow is the cold-branch throw of a union decoder: the hoisted
// message plus the index / discriminator that matched no member, concatenated
// only when the throw fires.
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

// discCandidateGuard returns the JS boolean expression that selects `cand` by
// the union discriminant value — e.g. `d === "t3"` or `(d === "ta" || d ===
// "tb")` when two members fold into one candidate. Used by the merged-prop
// sub-dispatch in place of the per-value `validate` check when the layout has a
// usable discriminant (mp.hasDiscDispatch): the discriminant survives a
// round-trip, so the chosen sub-index is byte-stable even for a value whose
// prop normalises to a shape that would re-classify under the validate path.
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

// mergedPropSurvivingGuard returns a JS boolean expression true iff
// `accessor`'s value matches one of the merged prop's SURVIVING
// candidates — i.e. the value belongs to a union member where this prop
// was NOT DataOnly-stripped. Used only when mp.HasStrippedCandidate: a
// value from a stripped member still carries the key with a foreign type
// (e.g. `Uint8Array` where a sibling member declares `Date`), so the
// encode applies the surviving codec ONLY when this guard holds and DROPS
// the key otherwise (G3 / G4). Mirrors the per-candidate validate the
// multi-candidate dispatch already uses.
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

// emitUnionPrepareForJsonFlat — the encode-side of the flat-union wire
// shape. Mutates v: object members get every defined property
// transformed and then v = [-1, v]; atomic members run their original
// prepare and (when layout.AtomicNeedsTuple) wrap as [memberIndex, v].
// Wrap is all-or-nothing across atomic members AND mandatory when an
// object branch exists (the [-1, …] envelope coexists with the atomic
// envelope, so the decoder must unconditionally unwrap).
func emitUnionPrepareForJsonFlat(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	layout := buildFlatLayout(rt, ctx)
	if len(layout.AtomicMembers) == 0 && len(layout.ObjectMembers) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	// Round-trips raw — every member is JSON-compatible, so mutate has no
	// transform to apply and needs no envelope: identity. Broader than
	// atomicOnlyJsonIdentity (covers object/record members too — mutate never
	// strips, so a compatible object member also passes through untouched).
	if !layout.AtomicNeedsTuple {
		return RTCode{Code: "", Type: CodeS}
	}

	var clauses []string

	// Atomic clauses. Class members dispatch by instance identity first, then
	// non-class atomics, then a class structural fallback (atomicEncodeDispatch).
	// A class member's arm appears twice (identity + structural) selecting the
	// same OriginalIndex, so compile each member's body exactly once.
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

	// Object branch — merged-property encode wrapped in `[-1, v]`.
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
			// Required props (every member declares them non-optionally)
			// skip the `=== undefined` guard since the value is known to
			// be present once the outer object-type gate passes.
			if mp.Required {
				propParts = append(propParts, propCode)
			} else {
				propParts = append(propParts, "if ("+accessor+" !== undefined) {"+propCode+"}")
			}
		}
		body := strings.Join(propParts, ";")
		if body != "" {
			body += ";"
		}
		// Wrap only when the union carries a transform somewhere. When it
		// round-trips raw (AtomicNeedsTuple false) the mutate early-out above
		// already returned identity, so this branch runs only with the wrap.
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

// emitMergedPropPrepare returns the inline JS body that transforms a
// single merged property's value. Single-candidate props delegate to
// the candidate's prepareForJson; multi-candidate props use the
// all-or-nothing wrap rule (FlatMergedProp.NeedsSubWrap) — either
// every candidate is noop on both halves (collapse to no transform;
// the value round-trips identity-style via JSON's natural typing) or
// every candidate emits its transform + `[subIdx, value]` wrap so the
// decoder can unconditionally unwrap.
// Returns ("", true) when no transform is required.
//
// When mp.HasStrippedCandidate, the transform is wrapped so the surviving
// codec runs only for values matching a surviving candidate; a value from
// a stripped member (carrying the key with a foreign type) is `delete`d
// instead, matching its DataOnly projection (G3 / G4).
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
		// Every candidate is noop on both halves — JSON round-trips the
		// value identity-style, no per-property dispatch or wrap needed.
		return "", true
	}
	// Multi-candidate with at least one non-noop — wrap every candidate.
	// With a usable discriminant, gate each arm by the discriminant value
	// (stable across round-trip) instead of re-validating the prop value.
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

// --- restoreFromJson decode --------------------------------------------------

// emitUnionRestoreFromJsonFlat — the decode-side of the flat-union wire
// shape. Under the all-or-nothing wrap rule
// (FlatLayout.AtomicNeedsTuple): either every encoded value is wrapped
// (`[-1, …]` for object branch, `[idx, …]` for atomic) or the whole
// union round-trips raw and the decoder is identity. No shape gate —
// the compile-time decision tells the decoder exactly which shape to
// expect.
func emitUnionRestoreFromJsonFlat(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	return emitUnionRestoreFromJsonFlatLayout(rt, ctx, v, buildFlatLayout(rt, ctx))
}

// emitUnionRestoreFromJsonFlatLayout is the decode body over a caller-built
// layout — compact widens the envelope rule first (buildCompactFlatLayout).
func emitUnionRestoreFromJsonFlatLayout(rt *reflection.RunType, ctx *EmitContext, v string, layout FlatLayout) RTCode {
	if len(layout.AtomicMembers) == 0 && len(layout.ObjectMembers) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}

	hasObjectBranch := len(layout.ObjectMembers) > 0
	if !layout.AtomicNeedsTuple {
		// Whole union round-trips raw (roundTripsRaw): every member — atomic
		// AND object/record — is JSON-compatible, so nothing was enveloped on
		// encode and there is nothing to unwrap or reconstruct: identity.
		return RTCode{Code: "", Type: CodeS}
	}

	decVar := ctx.NextLocalVar("dec")
	var arms []string

	// Object branch (idx === -1) — walk merged props, restore each
	// defined key. Required props (every member declares them
	// non-optionally) skip the `=== undefined` guard, matching the
	// encoder's symmetric optimisation in emitUnionPrepareForJsonFlat.
	if hasObjectBranch {
		var propParts []string
		for _, mp := range layout.MergedProps {
			accessor := propertyAccessor(v, mp.Name, mp.IsSafeName)
			propCode, ok := emitMergedPropRestore(mp, accessor, ctx)
			if !ok {
				return RTCode{Code: "", Type: CodeNS}
			}
			if propCode == "" {
				continue
			}
			if mp.Required {
				propParts = append(propParts, propCode)
			} else {
				propParts = append(propParts, "if ("+accessor+" !== undefined) {"+propCode+"}")
			}
		}
		body := strings.Join(propParts, ";")
		arm := "if (" + decVar + " === -1) {" + body + "}"
		arms = append(arms, arm)
	}

	// Atomic arms — every atomic member gets a decode clause because
	// every encoded value is wrapped under the all-or-nothing rule.
	for _, m := range layout.AtomicMembers {
		restoreRT := ctx.CompileChild(m.Ref, CodeS)
		if restoreRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		body := strings.TrimSpace(restoreRT.Code)
		if body != "" && !strings.HasSuffix(body, ";") && !strings.HasSuffix(body, "}") {
			body += ";"
		}
		arm := "if (" + decVar + " === " + strconv.Itoa(m.OriginalIndex) + ") {" + body + "}"
		if len(arms) > 0 {
			arm = " else " + arm
		}
		arms = append(arms, arm)
	}

	if len(arms) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}

	inner := strings.Join(arms, "") + unionDecodeThrow(flatUnionDecodeErrorVar(ctx), decVar)

	// Every encoded value is a [idx, value] envelope under the all-or-nothing
	// wrap rule, but the wire is untrusted: the shape is checked before the
	// unwrap (reflection.MustValidateJson), so `null[0]` never throws a raw
	// TypeError out of the decoder. A value that is not a two-slot array is
	// refused with the same typed `[mion]` error as an index that names no
	// member: a bare value is never this union's wire form, and leaving it in
	// place would let validate accept it through a member it never encoded as.
	errVar := flatUnionDecodeErrorVar(ctx)
	body := "if (Array.isArray(" + v + ") && " + v + ".length === 2) {" +
		"const " + decVar + " = " + v + "[0]; " + v + " = " + v + "[1];" + inner + "}" +
		unionDecodeThrow(errVar, v)
	return RTCode{Code: body, Type: CodeS}
}

// emitMergedPropRestore — decode-side mirror of emitMergedPropPrepare.
// Same all-or-nothing rule via FlatMergedProp.NeedsSubWrap: either
// every candidate is noop (no transform on decode, the value round-
// trips identity) or every candidate emits the `[subIdx, value]`
// decode dispatch. Single-candidate props delegate directly.
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
		// Encoder didn't emit a wrap (all candidates noop) — nothing to
		// undo on decode.
		return "", true
	}
	// Multi-candidate — decode the per-prop `[subIdx, value]` envelope.
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

// emitUnionStringifyJsonFlat — single-pass stringification of the
// flat-union wire shape. Mirrors emitUnionPrepareForJsonFlat structurally,
// but each branch BUILDS the JSON string for the envelope rather than
// mutating `v`. The wrap-or-not decision is all-or-nothing across the
// atomic branch (see FlatLayout.AtomicNeedsTuple) so the decoder always
// knows whether to unwrap.
func emitUnionStringifyJsonFlat(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	layout := buildFlatLayout(rt, ctx)
	if len(layout.AtomicMembers) == 0 && len(layout.ObjectMembers) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	// All members JSON-identity — stringify the value directly, no per-member
	// dispatch (see atomicOnlyJsonIdentity).
	if layout.atomicOnlyJsonIdentity() {
		return RTCode{Code: "return JSON.stringify(" + v + ");", Type: CodeRB}
	}

	var clauses []string

	// Class members dispatch by instance identity first, then non-class atomics,
	// then a class structural fallback (atomicEncodeDispatch); each member's
	// JSON fragment is built once. A member whose stringify is empty contributes
	// no arm (skipped), same as before.
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
		// Build the merged-object stringify with direct string concat
		// instead of `[parts].filter(Boolean).join(',')` — the filter
		// approach allocates two arrays + a string per call. With Fix 3
		// (required vs optional split) the common discriminated-union
		// case where every member shares the same property set collapses
		// to flat concat, matching the shape the non-flat per-member
		// factory produces.
		//
		// Strategy:
		//   - Required props (every member has them, none declared
		//     optional) emit `,"name":<propJson>` unconditionally. The
		//     first required prop becomes the comma anchor; subsequent
		//     required props always lead with `,`.
		//   - Optional props (any member missing the prop, or any
		//     declaration is `?:`) emit
		//     `(accessor === undefined ? '' : ',"name":<propJson>')` —
		//     always with a leading comma in the populated branch.
		//   - When there is at least one required prop, the leading `,`
		//     from the FIRST emitted fragment is harmless: the first
		//     fragment was emitted without a leading comma so the
		//     concat is `'{' + '"r1":...' + ',"r2":...' + ...`.
		//   - When there are NO required props (all optional), fall
		//     back to a slice(1) trick — prepend `,` unconditionally
		//     in every conditional branch and strip the leading comma
		//     from the resulting string. Still avoids the filter+join
		//     allocations.
		hasRequired := false
		for _, mp := range layout.MergedProps {
			if mp.Required {
				hasRequired = true
				break
			}
		}
		// Collect propJson per merged prop. Skipping empty noop props.
		// dropCond is the `=== undefined` test extended (for a prop with a
		// stripped sibling) so a value from the stripped member — present but
		// of a foreign type — also emits '' (the key is dropped, G3 / G4).
		type compiledProp struct {
			mp       FlatMergedProp
			accessor string
			propJson string
			dropCond string
		}
		discAccessor := layout.discAccessor(v)
		var compiledProps []compiledProp
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
			compiledProps = append(compiledProps, compiledProp{mp: mp, accessor: accessor, propJson: propJson, dropCond: dropCond})
		}
		var objExpr string
		if len(compiledProps) == 0 {
			objExpr = "'{}'"
		} else if hasRequired {
			// At least one required → flat concat anchored by the first
			// required prop's unconditional emit.
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
					// Optional prop — conditional with leading comma. The
					// populated branch always leads with `,`, valid whether or
					// not a required prop has anchored the concat yet (a leading
					// `,` from the first fragment is harmless once a required
					// prop emits without one). dropCond folds in the stripped-
					// sibling guard so a foreign-typed value also emits ''.
					parts = append(parts, "("+cp.dropCond+" ? '' : ','+"+prefix+"+"+cp.propJson+")")
				}
			}
			objExpr = "'{'+" + strings.Join(parts, "+") + "+'}'"
		} else {
			// All optional — use the slice trick. Each part either emits
			// `,"name":<propJson>` or `''`. Final concat strips the
			// leading comma via slice(1). Allocates one string for the
			// concat + one for slice(1) (V8 cons-string). No arrays.
			var parts []string
			for _, cp := range compiledProps {
				prefix := "'" + jsonPropPrefix(cp.mp.Name, cp.mp.IsSafeName) + "'"
				parts = append(parts, "("+cp.dropCond+" ? '' : ','+"+prefix+"+"+cp.propJson+")")
			}
			objExpr = "'{'+(" + strings.Join(parts, "+") + ").slice(1)+'}'"
		}
		// Wrap in the `[-1, …]` envelope only when the union carries a
		// transform somewhere; a round-trips-raw union (AtomicNeedsTuple false)
		// emits the bare object JSON so it decodes identity. The per-prop
		// stringify still strips undeclared keys either way.
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

// emitMergedPropStringify returns a JS expression that evaluates to the
// JSON fragment for the merged prop's value. Single-candidate uses the
// candidate's stringifyJson directly. Multi-candidate follows the same
// all-or-nothing rule as the outer union (FlatMergedProp.NeedsSubWrap):
//
//   - If every candidate is noop on both halves of the round-trip, the
//     decoder's matching emitMergedPropRestore emits no transform, so
//     this side emits the shared candidate code directly — no
//     `[subIdx, value]` wrap. JSON's natural typing recovers the value.
//   - If any candidate is non-noop, every candidate emits its transform
//     wrapped with `[subIdx, value]` so the decoder can unconditionally
//     unwrap.
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
	// Compile every candidate up front.
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
		// Decoder won't emit any sub-dispatch (all candidates noop on
		// both halves) — emit a single dispatch that returns one of the
		// candidate codes without the [subIdx, value] wrap. Multiple
		// candidates means multiple validate arms still, but they all
		// resolve to JSON.parse-recoverable forms.
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
		// Optimisation: when every candidate emits the SAME childCode
		// (e.g. literal `'a' | 'b' | 'c'` where every candidate is
		// `JSON.stringify(accessor)`) the dispatch arms all return the
		// same thing — collapse to that shared code.
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
		// Dispatch arms hoist into a context fn (created once per
		// materialization); errVar resolves through the closure — it is
		// itself a context line.
		params := ctx.CtxFnParams(accessor)
		call := ctx.CreateFnInContext(strings.Join(arms, " ")+" throw new Error("+errVar+");", CodeRB, params, params)
		return call, true
	}
	// Multi-candidate with at least one non-noop — wrap every arm. With a
	// usable discriminant, gate each arm by the discriminant value (stable
	// across round-trip) instead of re-validating the prop value.
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
