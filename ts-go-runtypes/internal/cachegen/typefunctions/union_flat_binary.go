package typefunctions

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// union_flat_binary.go owns the toBinary / fromBinary emits for KindUnion.
// Mirrors union_flat.go's JSON-side wire shape, but writes / reads bytes
// instead of building a `[idx, value]` JS literal. The wire shape stays
// flat-prop:
//
//   - Atomic union members keep `[memberIndex, valueBytes]` — first the
//     discriminator byte (uint8, or uint16 when total members > 255),
//     then the member's serialized bytes.
//   - Object/class union members are MERGED into one envelope with
//     discriminator value `-1` (encoded as `0xFF` in uint8 mode, or
//     `0xFFFF` in uint16 mode). The merged object is encoded as a
//     bitmap of present merged-props + the values for present props.
//
// This file relies on the FlatLayout struct + buildFlatLayout helper
// in union_flat_layout.go (shared with the JSON family).

// discriminatorWidth returns "Uint8" or "Uint16" depending on the total
// number of members in the union. We use the same trick at
// binary/toBinary.ts:376-380 — uint8 when index fits, uint16 otherwise.
// The `-1` sentinel for the merged-object branch is encoded as the
// max value (0xFF / 0xFFFF) so the decoder special-cases it.
func discriminatorWidth(memberCount int) string {
	if memberCount > 255 {
		return "Uint16"
	}
	return "Uint8"
}

// sentinelLiteral returns the JS literal for the merged-object branch's
// discriminator value, given the width. uint8 → 0xFF, uint16 → 0xFFFF.
func sentinelLiteral(width string) string {
	if width == "Uint16" {
		return "65535"
	}
	return "255"
}

// writeDiscriminator returns the JS statement that writes `index` at
// the current serializer position and advances `index`. For uint8 we
// use `setUint8(index++, value)`; for uint16 we use
// `setUint16(index, value, 1, (index += 2))`.
func writeDiscriminator(ser, width string, value int) string {
	if width == "Uint16" {
		return reserveExpr(ser, "2", ser+".view.setUint16("+ser+".index, "+strconv.Itoa(value)+", 1, ("+ser+".index += 2))")
	}
	return reserveExpr(ser, "1", ser+".view.setUint8("+ser+".index++, "+strconv.Itoa(value)+")")
}

// readDiscriminator returns the JS expression that reads the next
// discriminator value. The advance is fused in via the `index +=` arg.
func readDiscriminator(des, width string) string {
	if width == "Uint16" {
		return "(" + des + ".view.getUint16(" + des + ".index, 1) + (" + des + ".index += 2, 0))"
	}
	return des + ".view.getUint8(" + des + ".index++)"
}

// emitUnionToBinaryFlat — encode-side of the flat-union binary wire
// shape. Mirrors emitUnionPrepareForJsonFlat in union_flat.go:74-143
// but writes bytes instead of building `[idx, v]` literals.
//
// The width of the discriminator is chosen by the TOTAL member count
// (atomic + object members), and the merged-object branch always uses
// the sentinel value (0xFF or 0xFFFF). Note: this means a union with
// >255 atomic members but no objects still encodes as uint16 if any
// originalIndex spills past 255 — handled identically here.
func emitUnionToBinaryFlat(rt *reflection.RunType, ctx *EmitContext, v, ser string) RTCode {
	layout := buildFlatLayout(rt, ctx)
	if len(layout.AtomicMembers) == 0 && len(layout.ObjectMembers) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}

	totalMembers := len(layout.AtomicMembers) + len(layout.ObjectMembers)
	width := discriminatorWidth(totalMembers)
	sentinel := sentinelLiteral(width)

	var clauses []string

	// Atomic members — `if (guard) { writeDiscriminator(idx); encode; }`. Class
	// members dispatch by instance identity first, then non-class atomics, then a
	// class structural fallback (atomicEncodeDispatch) — the same ordering the
	// JSON encoders use, so a value from one of two SAME-shape classes writes the
	// correct member index instead of the first structural match.
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

	// Object branch — write sentinel discriminator + merged bitmap +
	// merged prop values.
	if len(layout.ObjectMembers) > 0 {
		var sentinelWrite string
		if width == "Uint16" {
			sentinelWrite = reserveExpr(ser, "2", ser+".view.setUint16("+ser+".index, "+sentinel+", 1, ("+ser+".index += 2))")
		} else {
			sentinelWrite = reserveExpr(ser, "1", ser+".view.setUint8("+ser+".index++, "+sentinel+")")
		}

		// Separate required vs optional merged props. Required props skip
		// the bitmap entirely. Optional props share a bitmap (1 bit per
		// optional prop, 8 per byte).
		var requiredProps, optionalProps []FlatMergedProp
		for _, mp := range layout.MergedProps {
			if mp.Required {
				requiredProps = append(requiredProps, mp)
			} else {
				optionalProps = append(optionalProps, mp)
			}
		}

		parts := []string{sentinelWrite}

		// Required merged props.
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

		// Optional merged props with shared bitmap.
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
				// A stripped sibling means a value from the stripped member still
				// carries the key with a foreign type — guard the surviving codec
				// with a value check so such a value leaves the bit UNSET and
				// writes no bytes (decode skips it), instead of setting the bit
				// while the codec writes nothing / crashes (G3 / G4).
				presence := accessor + " !== undefined"
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

// emitMergedPropToBinary mirrors emitMergedPropPrepare for the binary
// wire shape. Single-candidate: delegate to the candidate's toBinary.
// Multi-candidate: write a sub-discriminator (always uint8 since per-
// prop candidate counts are small) + candidate bytes, gated by validate.
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
	// Multi-candidate — always wrap with sub-discriminator. Width is
	// uint8 (per-prop candidate counts effectively bounded by union
	// width, but practically <=255).
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

// emitUnionFromBinaryFlat — decode-side of the flat-union binary wire
// shape. Reads the discriminator, then either dispatches to the
// atomic-member's decode OR (when sentinel) reads the merged bitmap +
// merged prop values.
//
// Note vs the JSON sibling (emitUnionRestoreFromJsonFlat): binary unions
// ALWAYS write a discriminator regardless of layout.AtomicNeedsTuple.
// JSON can recover atomics from their natural form
// (`JSON.parse('42') === 42`); binary bytes are typeless so the decoder
// must know which arm produced them. We ignore AtomicNeedsTuple here.
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

	// Object branch — read merged bitmap + decode each merged prop.
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

		// Required merged props.
		for _, mp := range requiredProps {
			accessor := v + "." + mp.Name
			if !mp.IsSafeName {
				accessor = v + "[" + quoteJS(mp.Name) + "]"
			}
			propCode, ok := emitMergedPropFromBinary(mp, accessor, ctx, des)
			if !ok {
				return RTCode{Code: "", Type: CodeNS}
			}
			// Always initialize the prop slot then run the decode.
			initSlot := accessor + " = undefined"
			if propCode != "" {
				parts = append(parts, initSlot+";"+propCode)
			} else {
				parts = append(parts, initSlot)
			}
		}

		// Optional merged props — read bitmap, then decode set bits.
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

	// Atomic arms — read each member's bytes when discriminator matches
	// its originalIndex.
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

	errVar := flatUnionDecodeErrorVar(ctx)
	inner := strings.Join(arms, "") + " else { throw new Error(" + errVar + ") }"
	return RTCode{Code: readDec + ";" + inner, Type: CodeS}
}

// emitMergedPropFromBinary mirrors emitMergedPropRestore for the binary
// wire shape. Single-candidate: delegate. Multi-candidate: read the
// sub-discriminator, then dispatch.
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
	errVar := flatUnionDecodeErrorVar(ctx)
	return readSub + ";" + strings.Join(arms, "") + " else { throw new Error(" + errVar + ") }", true
}
