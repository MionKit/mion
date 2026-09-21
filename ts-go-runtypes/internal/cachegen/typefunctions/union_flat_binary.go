package typefunctions

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// union_flat_binary.go holds the toBinary / fromBinary emits for KindUnion, over the layout
// union_flat_layout.go builds. Same flat-prop wire shape as the JSON family, in bytes: an atomic member
// writes its discriminator (uint8, or uint16 when the union has more than 255 members) then its own bytes,
// and the merged object/class envelope takes discriminator `-1` (0xFF / 0xFFFF) followed by a bitmap of
// the present merged props and their values.

// discriminatorWidth returns "Uint8" or "Uint16" from the union's total member count; the `-1` sentinel of
// the merged-object branch is the max value of that width, which the decoder special-cases.
func discriminatorWidth(memberCount int) string {
	if memberCount > 255 {
		return "Uint16"
	}
	return "Uint8"
}

// sentinelLiteral returns the JS literal for the merged-object branch's discriminator at a given width.
func sentinelLiteral(width string) string {
	if width == "Uint16" {
		return "65535"
	}
	return "255"
}

// writeDiscriminator returns the JS statement that writes `value` at the current serializer position and
// advances the index, the advance fused into the write.
func writeDiscriminator(ser, width string, value int) string {
	if width == "Uint16" {
		return reserveExpr(ser, "2", ser+".view.setUint16("+ser+".index, "+strconv.Itoa(value)+", 1, ("+ser+".index += 2))")
	}
	return reserveExpr(ser, "1", ser+".view.setUint8("+ser+".index++, "+strconv.Itoa(value)+")")
}

// readDiscriminator returns the JS expression reading the next discriminator, the advance fused into it.
func readDiscriminator(des, width string) string {
	if width == "Uint16" {
		return "(" + des + ".view.getUint16(" + des + ".index, 1) + (" + des + ".index += 2, 0))"
	}
	return des + ".view.getUint8(" + des + ".index++)"
}

// emitUnionToBinaryFlat is the encode side of the flat-union binary wire shape, mirroring
// emitUnionPrepareForJsonFlat but writing bytes instead of building `[idx, v]` literals.
// The discriminator width comes from the TOTAL member count, atomic plus object, and the merged-object
// branch always uses the sentinel value.
func emitUnionToBinaryFlat(rt *reflection.RunType, ctx *EmitContext, v, ser string) RTCode {
	layout := buildFlatLayout(rt, ctx)
	if len(layout.AtomicMembers) == 0 && len(layout.ObjectMembers) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}

	totalMembers := len(layout.AtomicMembers) + len(layout.ObjectMembers)
	width := discriminatorWidth(totalMembers)
	sentinel := sentinelLiteral(width)

	var clauses []string

	// Arm order is the JSON encoders' (atomicEncodeDispatch), so a value from one of two SAME-shape classes
	// writes the correct member index instead of the first structural match.
	prologue, arms := layout.atomicEncodeDispatch(v, ctx)
	bodyByIndex := make(map[int]string, len(layout.AtomicMembers))
	for _, m := range layout.AtomicMembers {
		childRT := ctx.CompileChild(m.Ref, CodeS)
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		body := writeDiscriminator(ser, width, m.OriginalIndex)
		if childRT.Code != "" {
			body += ";" + strings.TrimSpace(childRT.Code)
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
		var sentinelWrite string
		if width == "Uint16" {
			sentinelWrite = reserveExpr(ser, "2", ser+".view.setUint16("+ser+".index, "+sentinel+", 1, ("+ser+".index += 2))")
		} else {
			sentinelWrite = reserveExpr(ser, "1", ser+".view.setUint8("+ser+".index++, "+sentinel+")")
		}

		// Required props skip the bitmap entirely; optional props share one, 1 bit each, 8 per byte.
		var requiredProps, optionalProps []FlatMergedProp
		for _, mp := range layout.MergedProps {
			if mp.Required {
				requiredProps = append(requiredProps, mp)
			} else {
				optionalProps = append(optionalProps, mp)
			}
		}

		parts := []string{sentinelWrite}

		for _, mp := range requiredProps {
			accessor := propertyAccessor(v, mp.Name, mp.IsSafeName)
			propCode, ok := emitMergedPropToBinary(mp, accessor, ctx, ser)
			if !ok {
				return RTCode{Code: "", Type: CodeNS}
			}
			if propCode != "" {
				parts = append(parts, propCode)
			}
		}

		if len(optionalProps) > 0 {
			bitmapInit, bitmapVar := emitOptionalBitmapInit(ctx, ser, len(optionalProps), false)
			parts = append(parts, bitmapInit)
			for i, mp := range optionalProps {
				accessor := propertyAccessor(v, mp.Name, mp.IsSafeName)
				propCode, ok := emitMergedPropToBinary(mp, accessor, ctx, ser)
				if !ok {
					return RTCode{Code: "", Type: CodeNS}
				}
				bitIdx := strconv.Itoa(i & 7)
				setMask := ser + ".setBitMask(" + bitmapVar + ", " + bitIdx + ")"
				body := setMask
				if propCode != "" {
					body = propCode + ";" + setMask
				}
				// A value from a stripped sibling still carries the key with a foreign type: guard the
				// surviving codec so such a value leaves the bit UNSET and writes no bytes, instead of
				// setting the bit while the codec writes nothing or crashes (G3 / G4).
				presence := namedPropertyPresenceTest(mp.Name, v, accessor)
				if mp.HasStrippedCandidate {
					presence += " && (" + mergedPropSurvivingGuard(mp, accessor, ctx) + ")"
				}
				guarded := "if (" + presence + ") {" + body + "}"
				modIndex := i + 1
				if modIndex%8 == 0 && modIndex < len(optionalProps) {
					guarded += ";" + bitmapVar + "++"
				}
				parts = append(parts, guarded)
			}
		}

		objClause := "if (typeof " + v + " === 'object' && " + v + " !== null) {" + strings.Join(parts, ";") + "}"
		if len(clauses) > 0 {
			objClause = " else " + objClause
		}
		clauses = append(clauses, objClause)
	}

	errVar := flatUnionEncodeBinaryErrorVar(ctx)
	clauses = append(clauses, " else { throw new Error("+errVar+") }")
	return RTCode{Code: prologue + strings.Join(clauses, ""), Type: CodeS}
}

// emitMergedPropToBinary mirrors emitMergedPropPrepare for the binary wire shape: a multi-candidate prop
// writes a uint8 sub-discriminator plus the candidate bytes, gated by validate.
func emitMergedPropToBinary(mp FlatMergedProp, accessor string, ctx *EmitContext, ser string) (string, bool) {
	if len(mp.Candidates) == 1 {
		ctx.SetChildAccessor(accessor)
		jc := ctx.CompileChild(mp.Candidates[0].ChildRef, CodeS)
		ctx.SetChildAccessor("")
		if jc.Type == CodeNS {
			return "", false
		}
		return strings.TrimSpace(jc.Code), true
	}
	// The sub-discriminator is always uint8: per-prop candidate counts are practically under 255.
	var arms []string
	for i, cand := range mp.Candidates {
		if cand.Resolved == nil {
			continue
		}
		ctx.SetChildAccessor(accessor)
		jc := ctx.CompileChild(cand.ChildRef, CodeS)
		ctx.SetChildAccessor("")
		if jc.Type == CodeNS {
			return "", false
		}
		validateExpr := unionMemberValidateCheck(cand.Resolved, ctx, accessor)
		guard := validateExpr
		if isObjectLikeKind(cand.Resolved.Kind) {
			guard = objectGuard(accessor, validateExpr)
		}
		body := reserveExpr(ser, "1", ser+".view.setUint8("+ser+".index++, "+strconv.Itoa(i)+")")
		if jc.Code != "" {
			body += ";" + strings.TrimSpace(jc.Code)
		}
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

// emitUnionFromBinaryFlat is the decode side of the flat-union binary wire shape.
// Unlike the JSON sibling (emitUnionRestoreFromJsonFlat), binary unions ALWAYS write a discriminator and
// AtomicNeedsTuple is ignored here: JSON recovers atomics from their natural form, binary bytes are
// typeless, so the decoder must be told which arm produced them.
func emitUnionFromBinaryFlat(rt *reflection.RunType, ctx *EmitContext, v, des string) RTCode {
	layout := buildFlatLayout(rt, ctx)
	if len(layout.AtomicMembers) == 0 && len(layout.ObjectMembers) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	totalMembers := len(layout.AtomicMembers) + len(layout.ObjectMembers)
	width := discriminatorWidth(totalMembers)
	sentinel := sentinelLiteral(width)

	decVar := ctx.NextLocalVar("dec")
	readDec := "const " + decVar + " = " + readDiscriminator(des, width)
	var arms []string

	if len(layout.ObjectMembers) > 0 {
		var requiredProps, optionalProps []FlatMergedProp
		for _, mp := range layout.MergedProps {
			if mp.Required {
				requiredProps = append(requiredProps, mp)
			} else {
				optionalProps = append(optionalProps, mp)
			}
		}

		parts := []string{v + " = {}"}

		for _, mp := range requiredProps {
			accessor := v + "." + mp.Name
			if !mp.IsSafeName {
				accessor = v + "[" + quoteJS(mp.Name) + "]"
			}
			propCode, ok := emitMergedPropFromBinary(mp, accessor, ctx, des)
			if !ok {
				return RTCode{Code: "", Type: CodeNS}
			}
			initSlot := accessor + " = undefined"
			if propCode != "" {
				parts = append(parts, initSlot+";"+propCode)
			} else {
				parts = append(parts, initSlot)
			}
		}

		if len(optionalProps) > 0 {
			bitmapInit, bitmapVar := readOptionalBitmapInit(ctx, des, len(optionalProps), false)
			parts = append(parts, bitmapInit)
			for i, mp := range optionalProps {
				accessor := v + "." + mp.Name
				if !mp.IsSafeName {
					accessor = v + "[" + quoteJS(mp.Name) + "]"
				}
				bitCheck := bitCheckExpr(des, bitmapVar, i)
				propCode, ok := emitMergedPropFromBinary(mp, accessor, ctx, des)
				if !ok {
					return RTCode{Code: "", Type: CodeNS}
				}
				body := accessor + " = undefined"
				if propCode != "" {
					body = body + ";" + propCode
				}
				parts = append(parts, "if ("+bitCheck+") {"+body+"}")
			}
		}

		arm := "if (" + decVar + " === " + sentinel + ") {" + strings.Join(parts, ";") + "}"
		arms = append(arms, arm)
	}

	for _, m := range layout.AtomicMembers {
		childRT := ctx.CompileChild(m.Ref, CodeS)
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		body := strings.TrimSpace(childRT.Code)
		arm := "if (" + decVar + " === " + strconv.Itoa(m.OriginalIndex) + ") {" + body + "}"
		if len(arms) > 0 {
			arm = " else " + arm
		}
		arms = append(arms, arm)
	}

	if len(arms) == 0 {
		return RTCode{Code: readDec, Type: CodeS}
	}

	inner := strings.Join(arms, "") + unionDecodeThrow(flatUnionDecodeBinaryErrorVar(ctx), decVar)
	return RTCode{Code: readDec + ";" + inner, Type: CodeS}
}

// emitMergedPropFromBinary mirrors emitMergedPropRestore for the binary wire shape: a multi-candidate
// prop reads the sub-discriminator, then dispatches.
func emitMergedPropFromBinary(mp FlatMergedProp, accessor string, ctx *EmitContext, des string) (string, bool) {
	if len(mp.Candidates) == 1 {
		ctx.SetChildAccessor(accessor)
		jc := ctx.CompileChild(mp.Candidates[0].ChildRef, CodeS)
		ctx.SetChildAccessor("")
		if jc.Type == CodeNS {
			return "", false
		}
		return strings.TrimSpace(jc.Code), true
	}
	subDecVar := ctx.NextLocalVar("sub")
	readSub := "const " + subDecVar + " = " + des + ".view.getUint8(" + des + ".index++)"
	var arms []string
	for i, cand := range mp.Candidates {
		if cand.Resolved == nil {
			continue
		}
		ctx.SetChildAccessor(accessor)
		jc := ctx.CompileChild(cand.ChildRef, CodeS)
		ctx.SetChildAccessor("")
		if jc.Type == CodeNS {
			return "", false
		}
		arm := "if (" + subDecVar + " === " + strconv.Itoa(i) + ") {" + strings.TrimSpace(jc.Code) + "}"
		if len(arms) > 0 {
			arm = " else " + arm
		}
		arms = append(arms, arm)
	}
	if len(arms) == 0 {
		return "", true
	}
	return readSub + ";" + strings.Join(arms, "") + unionDecodeThrow(flatUnionDecodeBinaryErrorVar(ctx), subDecVar), true
}
