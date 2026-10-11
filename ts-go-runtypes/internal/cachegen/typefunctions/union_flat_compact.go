package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// The compact strategy's union layout. A union with object members writes them as ONE positional array
// (buildCompactFlatLayout). A union keeping the keyed merged object, or with no object member, follows the
// keyed strategies' envelope rule widened for compact: they drop the envelope on a union that round-trips raw
// (FlatLayout.roundTripsRaw), but compact positionalizes every nested object literal / plain class, a transform
// isJsonCompatible cannot see, so compact keeps the envelope whenever a surviving member carries one.
// Read by BOTH compact emitters and by the cjr noop predicate (compactFromJsonNoopRecursive), so the three
// cannot drift.

// compactUnionNeedsEnvelope reports whether the compact pair must keep the flat-union envelope on rt
// because a member positionalizes something. Decides only unions with no positional merged object. Mirrors unionJsonNoop's member walk rather than calling
// buildFlatLayout, which emits drop diagnostics the predicate must not duplicate.
// visited threads the caller's cycle set: a self-referential member re-enters as identity (greatest
// fixpoint, the isJsonCompatible rule).
func compactUnionNeedsEnvelope(rt *reflection.RunType, ctx *EmitContext, visited map[string]struct{}) bool {
	children := rt.SafeUnionChildren
	if len(children) == 0 {
		children = rt.Children
	}
	for _, ref := range children {
		resolved := ctx.ResolveRef(ref)
		if resolved == nil || isStrippedUnionMember(resolved, ctx) {
			continue
		}
		if compactUnionMemberTransforms(resolved, ctx, visited) {
			return true
		}
	}
	return false
}

// compactUnionEnvelope is the emitter entry: a fresh cycle set seeded with the union itself, so a member
// pointing back at rt reads as identity exactly like the predicate's in-walk re-entry.
func compactUnionEnvelope(rt *reflection.RunType, ctx *EmitContext) bool {
	visited := make(map[string]struct{})
	if rt.ID != "" {
		visited[rt.ID] = struct{}{}
	}
	return compactUnionNeedsEnvelope(rt, ctx, visited)
}

// compactUnionMemberTransforms is one member's verdict. In a union this rule decides, an object literal or
// anonymous plain class stays KEYED on the wire whichever bucket it lands in (the merged object of a keyed
// union, or an index-signature shape routed to the keyed clone in emitObjectCompactForJson), so only its member
// VALUES can positionalize and the walk asks each property / index signature.
// Every other member compiles whole through the compact arms, so its own cjr verdict decides.
func compactUnionMemberTransforms(resolved *reflection.RunType, ctx *EmitContext, visited map[string]struct{}) bool {
	keyed := resolved.Kind == reflection.KindObjectLiteral ||
		(resolved.Kind == reflection.KindClass && resolved.SubKind == reflection.SubKindNone && userClassName(resolved) == "")
	if !keyed {
		return !compactFromJsonNoopRecursive(resolved, ctx, visited)
	}
	for _, childRef := range resolved.Children {
		member := ctx.ResolveRef(childRef)
		if member == nil || member.IsStatic || isMethodMember(member.Kind) {
			continue
		}
		switch member.Kind {
		case reflection.KindProperty, reflection.KindPropertySignature, reflection.KindIndexSignature:
			if !compactFromJsonNoopRecursive(member, ctx, visited) {
				return true
			}
		}
	}
	return false
}

// buildCompactFlatLayout is buildFlatLayout plus the compact rules, so both compact emitters read the same layout.
// A union with object members goes positional (PositionalMerged): the merged object travels as ONE array over
// MergedProps, a missing prop holding its slot's Placeholder, so no member is picked on encode. It wraps only when
// a non-object member is not always a plain JSON scalar. A union keeping the keyed merged object (an
// index-signature member, or a slot with no usable placeholder) or having no object member at all follows the
// envelope rule above.
func buildCompactFlatLayout(rt *reflection.RunType, ctx *EmitContext) FlatLayout {
	layout := buildFlatLayout(rt, ctx)
	layout.PositionalMerged = len(layout.ObjectMembers) > 0 && !layout.hasIndexSignatureMember(ctx)
	for i := 0; layout.PositionalMerged && i < len(layout.MergedProps); i++ {
		layout.MergedProps[i].Placeholder, layout.PositionalMerged = mergedSlotPlaceholder(layout.MergedProps[i], ctx)
	}
	if layout.PositionalMerged {
		layout.AtomicNeedsTuple = compactPositionalNeedsEnvelope(layout)
		return layout
	}
	for i := range layout.MergedProps {
		layout.MergedProps[i].Placeholder = ""
	}
	if !layout.AtomicNeedsTuple && compactUnionEnvelope(rt, ctx) {
		layout.AtomicNeedsTuple = true
	}
	return layout
}

// compactPositionalNeedsEnvelope reports whether a positional union must wrap. The merged object is an array on the
// wire, so a bare value is unambiguous only when every atomic member is always a plain JSON scalar: those are
// JSON-identity, never arrays, and their encode guards read the same on the wire. Anything else (an array member, a
// class, bigint, `undefined`, `any`) wraps, or `{a: string} | string[]` would decode
// `["x"]` as a `string[]`.
func compactPositionalNeedsEnvelope(layout FlatLayout) bool {
	for _, member := range layout.AtomicMembers {
		switch member.Resolved.Kind {
		case reflection.KindNull, reflection.KindString, reflection.KindNumber, reflection.KindBoolean,
			reflection.KindEnum, reflection.KindTemplateLiteral:
		case reflection.KindLiteral:
			if literalFlavour(member.Resolved) != litPrimitive {
				return true
			}
		default:
			return true
		}
	}
	return false
}
