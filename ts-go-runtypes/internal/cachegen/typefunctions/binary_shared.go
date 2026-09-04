package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// partitionBinaryObjectProps splits an object's children into required
// and optional property sets and picks out the index-signature child —
// the ONE partition both binary sides consume. The encoder's optional
// bitmap and the decoder's reads depend on the two sides agreeing on
// exactly this split, so it lives here instead of being copied into
// each (the wire format is the contract; a one-sided change desyncs
// the bitmap).
//
//   - Static props are skipped with a SlotStaticDropped diagnostic.
//   - Non-property children and propertyless slots are skipped.
//   - A directly DataOnly-stripped value drops the property from both
//     sets (optional props compile their value at the partition's
//     consumers, bypassing emitPropertyToBinary). A structurally
//     unserializable value (symbol[], …) is NOT stripped here; it
//     stays and its CodeNS propagates from the compile at the call
//     site, failing the object (F3).
//   - The index signatures (declared ones and the patternProperties
//     entries objectMembers synthesizes) are returned separately, in
//     member order: each side emits them AFTER the named props (see the
//     per-side comments at the call sites for the F1 ordering rationale).
func partitionBinaryObjectProps(rt *reflection.RunType, ctx *EmitContext) (required, optional []*reflection.RunType, indexSigs []*reflection.RunType) {
	members := objectMembers(rt)
	// One block for the DECLARED index signatures (the first one: a split
	// `[k: string | number]: U` sweeps every own key already, and this is the
	// layout that has always been on the wire), then one block per
	// patternProperties entry, in member order.
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
