package typefunctions

import (
	"strconv"
	"strings"
)

// The compact strategy's positional merged object: a union's object members travel as ONE array over
// FlatLayout.MergedProps, each slot the prop's value or its Placeholder. No member is picked on encode, so nothing
// is lost; decode rebuilds the keyed merged object and validation picks the member, as for the keyed form.

// emitMergedObjectPositional is the encode: an array literal, one slot per merged prop.
func emitMergedObjectPositional(layout FlatLayout, v string, ctx *EmitContext) (string, bool) {
	discAccessor := layout.discAccessor(v)
	slots := make([]string, 0, len(layout.MergedProps))
	for _, mp := range layout.MergedProps {
		accessor := propertyAccessor(v, mp.Name, mp.IsSafeName)
		expr, ok := emitMergedPropPrepareSafe(mp, accessor, discAccessor, ctx)
		if !ok {
			return "", false
		}
		present := namedPropertyPresenceTest(mp.Name, v, accessor)
		switch {
		case mp.Required:
			slots = append(slots, expr)
		case mp.HasStrippedCandidate:
			// A value from the stripped member still carries the key with a foreign type: write the placeholder (G4).
			slots = append(slots, "(("+present+" && ("+mergedPropSurvivingGuard(mp, accessor, ctx)+")) ? "+expr+" : "+mp.Placeholder+")")
		default:
			slots = append(slots, "("+present+" ? "+expr+" : "+mp.Placeholder+")")
		}
	}
	return "[" + strings.Join(slots, ",") + "]", true
}

// emitMergedPropsPositionalRebuild is the decode, emitMergedPropsRebuild by position. The placeholder check runs
// before any child restore, so no constructor sees it; a short array reads absent, extra slots are ignored.
func emitMergedPropsPositionalRebuild(ctx *EmitContext, v string, layout FlatLayout) (string, bool) {
	rVar := ctx.NextLocalVar("r")
	var restore strings.Builder
	restore.WriteString("const " + rVar + " = {};")
	for i, mp := range layout.MergedProps {
		accessor := v + "[" + strconv.Itoa(i) + "]"
		propCode, ok := emitMergedPropRestore(mp, accessor, ctx)
		if !ok {
			return "", false
		}
		write := terminated(propCode) + propertyAccessor(rVar, mp.Name, mp.IsSafeName) + " = " + accessor + ";"
		if !mp.Required {
			write = "if (" + accessor + " !== undefined && " + accessor + " !== " + mp.Placeholder + ") {" + write + "}"
		}
		restore.WriteString(write)
	}
	restore.WriteString(v + " = " + rVar + ";")
	return restore.String(), true
}
