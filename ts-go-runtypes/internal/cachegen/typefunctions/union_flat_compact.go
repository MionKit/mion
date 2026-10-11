package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// The compact strategy's union layout, read by BOTH compact emitters and the cjr noop predicate
// (compactFromJsonNoopRecursive) so the three cannot drift. A union with no positional merged object keeps the
// envelope whenever a member positionalizes a nested object, a transform isJsonCompatible (FlatLayout.roundTripsRaw)
// cannot see.

// compactUnionNeedsEnvelope decides only unions with no positional merged object, by the rule above.
// It mirrors unionJsonNoop's member walk: buildFlatLayout would emit drop diagnostics the predicate must not duplicate.
// visited is the caller's cycle set: a self-referential member re-enters as identity (greatest fixpoint).
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

// compactUnionMemberTransforms: in a union this rule decides, an object literal or anonymous plain class stays KEYED
// (keyed merged object, or emitObjectCompactForJson's index-signature clone), so only its VALUES can positionalize.
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
// The positional merged array spans every member's props, so encode never picks a member.
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

// compactPositionalNeedsEnvelope: beside the merged array, a bare value is unambiguous only when every atomic member
// is a plain JSON scalar, JSON-identity and never an array, whose encode guard reads the same on the wire.
// Anything else wraps, or `{a: string} | string[]` would decode `["x"]` as a `string[]`.
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
