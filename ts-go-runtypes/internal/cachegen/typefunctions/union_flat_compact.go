package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// The compact strategy's union envelope rule.
//
// The keyed JSON strategies drop the `[idx, value]` / `[-1, merged]` envelope
// on a union that round-trips raw (FlatLayout.roundTripsRaw: every member is
// isJsonCompatible), and the decoder is identity: native JSON preserves every
// member's shape, so nothing needs undoing. Compact reuses the flat-union
// encode / decode (json_compact.go / json_compact_restore.go) but positionalizes
// every nested object literal / plain class, a transform isJsonCompatible
// cannot see. Under the shared rule `{kind: 'a'} | {kind: 'b'; f: {x: number}}`
// encoded `f` as `[1]` and the identity decoder handed it back as an array.
//
// compactUnionNeedsEnvelope closes that gap: when any surviving member carries
// a compact-only transform the compact pair keeps the envelope, so the encoder
// writes `[-1, merged]` / `[idx, value]` and the decoder unwraps and walks the
// arm — the same mixed-union path a `Date` member takes. Read by BOTH compact
// emitters and by the cjr noop predicate (compactFromJsonNoopRecursive), so the
// three cannot drift.

// compactUnionNeedsEnvelope reports whether the compact pair must keep the
// flat-union envelope on rt because a member positionalizes something. Mirrors
// unionJsonNoop's member walk (stripped members skipped) rather than calling
// buildFlatLayout, which emits drop diagnostics the predicate must not
// duplicate. visited threads the caller's cycle set: a self-referential member
// re-enters as identity (greatest fixpoint, the isJsonCompatible rule).
func compactUnionNeedsEnvelope(rt *reflection.RunType, ctx *EmitContext, visited map[string]struct{}) bool {
	children := rt.SafeUnionChildren
	if len(children) == 0 {
		children = rt.Children
	}
	for _, ref := range children {
		resolved := ctx.ResolveRef(ref)
		if resolved == nil || isStrippedUnionMember(resolved) {
			continue
		}
		if compactUnionMemberTransforms(resolved, ctx, visited) {
			return true
		}
	}
	return false
}

// compactUnionEnvelope is the emitter entry: a fresh cycle set seeded with the
// union itself, so a member that points back at rt reads as identity exactly
// like the predicate's in-walk re-entry.
func compactUnionEnvelope(rt *reflection.RunType, ctx *EmitContext) bool {
	visited := make(map[string]struct{})
	if rt.ID != "" {
		visited[rt.ID] = struct{}{}
	}
	return compactUnionNeedsEnvelope(rt, ctx, visited)
}

// compactUnionMemberTransforms is one member's verdict. An object literal or
// anonymous plain class stays KEYED on the union wire whichever bucket it lands
// in (the merged branch has no single positional shape; an index-signature
// shape in the atomic bucket routes to the keyed clone in
// emitObjectCompactForJson), so only its member VALUES can positionalize and
// the walk asks each property / index signature. Every other member compiles
// whole through the compact arms, so its own cjr verdict decides — a named user
// class, an array of objects, a Map with object values are all transforms.
func compactUnionMemberTransforms(resolved *reflection.RunType, ctx *EmitContext, visited map[string]struct{}) bool {
	keyed := resolved.Kind == reflection.KindObjectLiteral ||
		(resolved.Kind == reflection.KindClass && resolved.SubKind == reflection.SubKindNone && userClassName(resolved) == "")
	if !keyed {
		return !compactFromJsonNoopRecursive(resolved, ctx, visited)
	}
	for _, childRef := range resolved.Children {
		member := ctx.ResolveRef(childRef)
		if member == nil || member.IsStatic || isFunctionLikeKind(member.Kind) {
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

// buildCompactFlatLayout is buildFlatLayout plus the compact envelope rule: a
// union the keyed strategies pass through raw still wraps when a member
// positionalizes. Both compact emitters build their layout here so encode and
// decode read the same AtomicNeedsTuple.
func buildCompactFlatLayout(rt *reflection.RunType, ctx *EmitContext) FlatLayout {
	layout := buildFlatLayout(rt, ctx)
	if !layout.AtomicNeedsTuple && compactUnionEnvelope(rt, ctx) {
		layout.AtomicNeedsTuple = true
	}
	return layout
}
