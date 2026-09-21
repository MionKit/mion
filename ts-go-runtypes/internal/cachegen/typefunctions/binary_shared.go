package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// partitionBinaryObjectProps is the ONE required/optional/index-signature split both binary sides consume:
// a one-sided change desyncs the optional bitmap.
//
//   - Static props are skipped with a SlotStaticDropped diagnostic.
//   - A directly DataOnly-stripped value drops the property from both sets; a structurally unserializable
//     value (symbol[], …) stays, and its CodeNS from the call site's compile fails the object (F3).
//   - Index signatures come back separately, in member order: each side emits them AFTER the named props.
func partitionBinaryObjectProps(rt *reflection.RunType, ctx *EmitContext) (required, optional []*reflection.RunType, indexSigs []*reflection.RunType) {
	members := objectMembers(rt)
	// Only the FIRST declared index signature gets a block (a split `[k: string | number]: U` already sweeps
	// every own key, and that is the layout on the wire), then one per patternProperties entry, in member order.
	seenDeclared := false
	for _, child := range members {
		resolved := ctx.ResolveRef(child)
		if resolved == nil || resolved.Kind != reflection.KindIndexSignature {
			continue
		}
		if !hasPatternKeyFlag(resolved) {
			if seenDeclared {
				continue
			}
			seenDeclared = true
		}
		indexSigs = append(indexSigs, resolved)
	}
	for _, child := range members {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if resolved.IsStatic {
			ctx.EmitDiagnosticSlot(SlotStaticDropped, memberLabel(resolved))
			continue
		}
		if resolved.Kind != reflection.KindProperty && resolved.Kind != reflection.KindPropertySignature {
			continue
		}
		if resolved.Child == nil {
			continue
		}
		childResolved := ctx.ResolveRef(resolved.Child)
		if childResolved == nil {
			continue
		}
		if strippedPropertyDrop(childResolved, resolved.Name, ctx) {
			continue
		}
		if resolved.Optional {
			optional = append(optional, child)
		} else {
			required = append(required, child)
		}
	}
	return required, optional, indexSigs
}
