package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// UnknownKeysToUndefinedWireEmitter — decoder-internal sibling of
// UnknownKeysToUndefinedEmitter. Identical for every kind EXCEPT
// KindUnion, where it emits the wire-format-aware merged-allowlist
// strip: detect `Array.isArray(v) && v[0] === -1` at runtime, reach
// into `v[1]` and apply the merged-allowlist strip there.
//
// This family is NOT exposed via the public createUnknownKeysToUndefined
// API. The decoder's safe pipeline at
// packages/run-types/src/createRTFunctions.ts composes:
//
//	restore(ukuWire(JSON.parse(s)))
//
// The wire-format-aware emit lets the safe decoder strip undeclared
// keys inside the merged-object branch of unsafe-encoded wire payloads,
// closing the decoder-safety hole at union nodes that the legacy
// uku-no-op-on-union created.
type UnknownKeysToUndefinedWireEmitter struct{}

func (UnknownKeysToUndefinedWireEmitter) Args() []ArgSpec {
	return UnknownKeysToUndefinedEmitter{}.Args()
}

func (UnknownKeysToUndefinedWireEmitter) Supports(rt *reflection.RunType) bool {
	return unknownKeysSupports(rt)
}

func (UnknownKeysToUndefinedWireEmitter) IsRTInlined(ctx *InlineContext) bool {
	return UnknownKeysToUndefinedEmitter{}.IsRTInlined(ctx)
}

func (UnknownKeysToUndefinedWireEmitter) ReturnName() string {
	return UnknownKeysToUndefinedEmitter{}.ReturnName()
}

func (UnknownKeysToUndefinedWireEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	return UnknownKeysToUndefinedEmitter{}.EmitDependencyCall(rt, childID, ctx)
}

func (UnknownKeysToUndefinedWireEmitter) Finalize(raw string) (string, bool) {
	return UnknownKeysToUndefinedEmitter{}.Finalize(raw)
}

// Emit — only KindUnion differs from the base emitter. For all other
// kinds the wire-format wrapper isn't present (the wrapper exists
// ONLY at union nodes per the flat-encoder design), so the base
// emitter's per-kind helpers are correct.
//
// EXCEPTION: KindClass+SubKindMap/SubKindSet. The public uku family's
// iterable arm checks `v instanceof Map/Set` before iterating — correct
// for the user-facing entrypoint where `v` is already a constructed
// instance, but wrong for the safe decoder's pipeline which composes
// `restore(ukuWire(JSON.parse(s)))` — at the ukuWire stage `v` is still
// the JSON.parse-output array, so the `instanceof` check fails and the
// body falls through with no return (the bare `return;` returns
// undefined), which would crash the downstream restore on `v.length`.
//
// The safe encoder (`prepareForJsonSafe`) already strips extras at
// encode time before the wire shape is produced, so the wire pipeline
// has no inner-object extras left to strip post-parse — keeping the
// Map/Set arm noop on the wire side mirrors the pre-fix behaviour
// (before iterable unknown-keys support landed on the public uku).
func (UnknownKeysToUndefinedWireEmitter) Emit(rt *reflection.RunType, ctx *EmitContext, ct CodeType) RTCode {
	if rt != nil && rt.Kind == reflection.KindUnion {
		return emitUnionUnknownKeysMerged(rt, ctx, UnknownKeysOpts{
			Snippet: func(_ *EmitContext, accessor, keyVar string) string {
				return accessor + "[" + keyVar + "] = undefined"
			},
			CodeShape:      CodeS,
			JsonWireFormat: true,
		})
	}
	if rt != nil && rt.Kind == reflection.KindClass {
		switch rt.SubKind {
		case reflection.SubKindMap, reflection.SubKindSet:
			return RTCode{Code: "", Type: CodeS}
		}
	}
	return UnknownKeysToUndefinedEmitter{}.Emit(rt, ctx, ct)
}
