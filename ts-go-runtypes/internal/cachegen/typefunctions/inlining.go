package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// InlineContext is the input to an Emitter.IsRTInlined call. Mirrors
// the surface the `BaseRunType.isRTInlined` reads from `this`
// (ref: run-types/src/lib/baseRunTypes.ts:52) plus the env / depth flags
// that live caller-side in the RTFnCompiler. Keeping the fields
// explicit makes the predicate easy to override per-fn (the user's
// stated reason for moving inlining decisions onto Emitters) without
// forcing every implementation to reach back into the Walker.
//
// "More context = better" was an explicit design goal — when adding
// fields, prefer surfacing them on InlineContext over having the
// predicate poke at walker internals through method calls.
type InlineContext struct {
	// RT is the RunType under consideration. The predicate inspects
	// Kind, TypeName, and FamilyOf(Kind) — same triplet the reference uses.
	RT *reflection.RunType
	// InlineAllInternal is RenderOpts.InlineMode == allInternal: EVERY
	// non-circular node inlines into its parent, names ignored (supersedes
	// the old DEBUG_RT=INLINED env override). Default mode applies the
	// per-kind name rules below instead. Set at walker construction.
	InlineAllInternal bool
	walker            *Walker
}

// StackDepth reports how deep the walker currently is in the
// traversal. Used by predicates that want to differentiate between
// "this is the root node" and "this is nested" — though the Walker
// applies its own `depth > 1` gate at the dispatch site, so most
// predicates don't need to check this themselves. Exposed for
// future emitters that want richer context-aware decisions.
func (ctx *InlineContext) StackDepth() int {
	if ctx.walker == nil {
		return 0
	}
	return len(ctx.walker.Stack)
}

// CurrentVλl returns the walker's current value-accessor expression
// at the point of the predicate call. Symmetric with EmitContext.Vλl
// but exposed on the inlining context too in case future fns base
// inlining heuristics on the accessor shape (e.g. estimated emitted
// code size).
func (ctx *InlineContext) CurrentVλl() string {
	if ctx.walker == nil {
		return ""
	}
	return ctx.walker.Vλl
}

// DefaultIsRTInlined is the shared default predicate every Emitter can
// delegate to. Externality is purely a DEDUPE decision now that statement
// blocks hoist to per-factory context fns (createFnInContext) instead of
// per-call IIFEs — nothing NEEDS to be external for code-shape reasons.
//
// Decision matrix (in order):
//  1. IsCircular → external, both modes. Circular types must self-invoke;
//     the parent issues a dependency call. dispatch's walk-stack guard
//     (inlineWouldCycle) additionally catches cycle re-entries the
//     serializer's flag misses (anonymous wrapper unions).
//  2. allInternal mode → inline everything else, names ignored.
//  3. Default mode — the name rule: UNNAMED arrays / object literals /
//     tuples / unions / classes inline (declared inline at a use site,
//     unlikely to be reused — per the design discussion); NAMED types
//     (alias or interface) stay external as dedupe-worthy shared entries.
//     Date / Temporal builtins are the carve-out: named, but their emits
//     are atomic single expressions (instanceof / toISOString), so they
//     always inline — externalizing them would cost an entry per family
//     for the most common leaf types. Map/Set recurse into element types
//     and follow the name rule (always named → external, as before).
//  4. Remaining named collections (e.g. template literals) → external.
//  5. Otherwise → inline.
func DefaultIsRTInlined(ctx *InlineContext) bool {
	if ctx == nil || ctx.RT == nil {
		return true
	}
	if ctx.RT.IsCircular {
		return false
	}
	if ctx.InlineAllInternal {
		return true
	}
	switch ctx.RT.Kind {
	case reflection.KindClass:
		if ctx.RT.SubKind == reflection.SubKindDate || reflection.IsTemporalSubKind(ctx.RT.SubKind) {
			return true
		}
		return ctx.RT.TypeName == ""
	case reflection.KindArray, reflection.KindObjectLiteral, reflection.KindTuple, reflection.KindUnion:
		// Keyed on TypeName directly — not the FamilyOf guard below —
		// because KindArray is FamilyMember and would slip past it.
		return ctx.RT.TypeName == ""
	}
	if ctx.RT.TypeName != "" && reflection.FamilyOf(ctx.RT.Kind) == reflection.FamilyCollection {
		return false
	}
	return true
}
