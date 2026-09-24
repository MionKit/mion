package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
	"github.com/mionkit/mion/ts-go-runtypes/internal/schemadoc"
)

// JsonSchemaDocEmitter implements the `jsonSchema` (jsc) cache family: the per-type JSON Schema DOCUMENT, rendered at
// build time and shipped as a factory whose fn RETURNS the document object. Consumers call the fn once and post-process
// at runtime (portable strip, target check).
// Unlike every value-walking family the whole document renders INLINE at the root frame in one Emit call: the renderer's
// own walk handles children, cycles close via `$defs`, and no cross-entry deps are emitted.
// Degradation warnings the renderer collects (unspellable corners rendered as `{}`) are dropped here; the document stays
// under-constrained, never wrong. Surfacing them through the diagnostics catalog is a follow-up.
type JsonSchemaDocEmitter struct{}

// Args — single ignored value arg, the walker's minimal frame shape.
func (JsonSchemaDocEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports — every node has a document (the renderer is total).
func (JsonSchemaDocEmitter) Supports(rt *reflection.RunType) bool {
	return rt != nil
}

// IsRTInlined — always: the document renders whole at the root.
func (JsonSchemaDocEmitter) IsRTInlined(ctx *InlineContext) bool {
	return true
}

// Emit renders the complete document for the root frame; child frames are never entered.
// A union's wire layout comes from the REAL buildFlatLayout the JSON encoders compile from, so a wrapped union's
// document describes the `[index, value]` envelope the encoder writes and the two cannot disagree.
func (JsonSchemaDocEmitter) Emit(rt *reflection.RunType, ctx *EmitContext, expectedCType CodeType) RTCode {
	doc := schemadoc.RenderDocumentWire(rt, ctx.ResolveRef, func(union *reflection.RunType) *schemadoc.UnionWireLayout {
		return unionWireLayoutFor(union, ctx)
	})
	return RTCode{Code: "return (" + doc.Source + ");", Type: CodeRB}
}

// unionWireLayoutFor projects buildFlatLayout's structural half into the renderer's view. A pure field mapping: no wire
// decision is recomputed, so the document's envelope and the encoder's share one source.
func unionWireLayoutFor(union *reflection.RunType, ctx *EmitContext) *schemadoc.UnionWireLayout {
	layout := buildFlatLayout(union, ctx)
	wire := &schemadoc.UnionWireLayout{Wraps: layout.AtomicNeedsTuple, HasMergedObjects: len(layout.ObjectMembers) > 0}
	if !wire.Wraps {
		return wire
	}
	for _, member := range layout.AtomicMembers {
		wire.Atomics = append(wire.Atomics, schemadoc.UnionWireAtomic{Node: member.Resolved, Index: member.OriginalIndex})
	}
	for _, mergedProp := range layout.MergedProps {
		prop := schemadoc.UnionWireProp{
			Name:         mergedProp.Name,
			IsSafeName:   mergedProp.IsSafeName,
			Required:     mergedProp.Required,
			NeedsSubWrap: mergedProp.NeedsSubWrap,
		}
		for _, candidate := range mergedProp.Candidates {
			prop.Candidates = append(prop.Candidates, candidate.Resolved)
		}
		wire.MergedProps = append(wire.MergedProps, prop)
	}
	return wire
}

// EmitDependencyCall is unreachable (IsRTInlined is always true).
func (JsonSchemaDocEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	panic("typefns: the jsonSchema emitter never dep-calls (the document renders whole at the root)")
}

// IsNoopType — never a noop, the root always returns the rendered document.
func (JsonSchemaDocEmitter) IsNoopType(_ *reflection.RunType, _ *EmitContext) bool {
	return false
}

// Finalize — the body is always the single return statement; never a noop.
func (JsonSchemaDocEmitter) Finalize(rawCode string) (string, bool) {
	return rawCode, false
}

// ReturnName — unused (the body always returns explicitly).
func (JsonSchemaDocEmitter) ReturnName() string {
	return "v"
}
