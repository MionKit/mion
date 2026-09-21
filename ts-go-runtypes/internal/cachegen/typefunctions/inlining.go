package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// InlineContext is the input to an Emitter.IsRTInlined call. The fields stay explicit so a per-fn predicate
// never reaches back into the Walker; when adding one, prefer a field here over poking at walker internals.
type InlineContext struct {
	RT *reflection.RunType
	// InlineAllInternal is RenderOpts.InlineMode == allInternal: EVERY non-circular node inlines into its
	// parent, names ignored. Default mode applies the per-kind name rules of DefaultIsRTInlined instead.
	InlineAllInternal bool
	walker            *Walker
}

// StackDepth reports how deep the walker is in the traversal. The Walker applies its own `depth > 1` gate
// at the dispatch site, so most predicates never need it.
func (ctx *InlineContext) StackDepth() int {
	if ctx.walker == nil {
		return 0
	}
	return len(ctx.walker.Stack)
}

// CurrentVλl returns the walker's value-accessor expression at the point of the predicate call.
func (ctx *InlineContext) CurrentVλl() string {
	if ctx.walker == nil {
		return ""
	}
	return ctx.walker.Vλl
}

// DefaultIsRTInlined is the shared default predicate every Emitter can delegate to. Externality is purely a
// DEDUPE decision, now that statement blocks hoist to per-factory context fns (createFnInContext).
// Circular types are external in both modes: they must self-invoke, so the parent issues a dependency call
// (dispatch's walk-stack guard inlineWouldCycle catches the cycle re-entries the flag misses, as in an
// anonymous wrapper union). Otherwise the name rule: an UNNAMED type is declared at a use site and unlikely
// to be reused, a NAMED one is a dedupe-worthy shared entry. Date / Temporal are the carve-out, named but
// emitting a single expression, so inlining them saves one entry per family on the commonest leaf types.
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
		// Keyed on TypeName directly: KindArray is FamilyMember and would slip past the FamilyOf guard below.
		return ctx.RT.TypeName == ""
	}
	if ctx.RT.TypeName != "" && reflection.FamilyOf(ctx.RT.Kind) == reflection.FamilyCollection {
		return false
	}
	return true
}
