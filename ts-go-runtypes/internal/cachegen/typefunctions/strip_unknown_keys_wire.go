package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// StripUnknownKeysWireEmitter is the decoder-internal sibling of UnknownKeysToUndefinedEmitter, NOT exposed
// through the public createUnknownKeysToUndefined API. It is identical for every kind except KindUnion, where
// the wire-format-aware emit reaches into the merged-object branch (`Array.isArray(v) && v[0] === -1`, then
// `v[1]`) so the safe pipeline of packages/run-types/src/createRTFunctions.ts, `restore(ukuWire(JSON.parse(s)))`,
// strips undeclared keys at a union node too.
type StripUnknownKeysWireEmitter struct{}

func (StripUnknownKeysWireEmitter) Args() []ArgSpec {
	return UnknownKeysToUndefinedEmitter{}.Args()
}

func (StripUnknownKeysWireEmitter) Supports(rt *reflection.RunType) bool {
	return unknownKeysSupports(rt)
}

func (StripUnknownKeysWireEmitter) IsRTInlined(ctx *InlineContext) bool {
	return UnknownKeysToUndefinedEmitter{}.IsRTInlined(ctx)
}

func (StripUnknownKeysWireEmitter) IsNoopType(rt *reflection.RunType, ctx *EmitContext) bool {
	return isNoopForUnknownKeys(rt, ctx, stripUnknownKeysWireSpec)
}

// NoopChildComposesAround: a child with nothing to undefine mutates nothing.
func (StripUnknownKeysWireEmitter) NoopChildComposesAround() {}

func (StripUnknownKeysWireEmitter) ReturnName() string {
	return UnknownKeysToUndefinedEmitter{}.ReturnName()
}

func (StripUnknownKeysWireEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	return UnknownKeysToUndefinedEmitter{}.EmitDependencyCall(rt, childID, ctx)
}

func (StripUnknownKeysWireEmitter) Finalize(raw string) (string, bool) {
	return UnknownKeysToUndefinedEmitter{}.Finalize(raw)
}

// Emit — the base emitter is correct for every kind but two, the wire-format wrapper existing ONLY at union
// nodes per the flat-encoder design. KindUnion is one. The other is KindClass + SubKindMap / SubKindSet: the
// public uku family checks `v instanceof Map/Set` before iterating, right for the user-facing entrypoint but
// wrong here, where `v` is still the JSON.parse-output array. The wire arm guards on `Array.isArray` and walks
// the array form (a Map is `[key, value]` pairs, a Set is items), so an object inside a Map value or a Set
// member is swept like any other (an own `__proto__` key on a Set member used to pass through untouched).
func (StripUnknownKeysWireEmitter) Emit(rt *reflection.RunType, ctx *EmitContext, ct CodeType) RTCode {
	if rt != nil && rt.Kind == reflection.KindUnion {
		return emitUnionUnknownKeysMerged(rt, ctx, UnknownKeysOpts{
			Snippet: func(_ *EmitContext, accessor, keyVar string) string {
				return accessor + "[" + keyVar + "] = undefined"
			},
			JsonWireFormat: true,
		})
	}
	if rt != nil && rt.Kind == reflection.KindClass {
		switch rt.SubKind {
		case reflection.SubKindMap, reflection.SubKindSet:
			return emitNativeIterableUnknownKeys(rt, ctx, ctx.Vλl, true)
		}
	}
	return UnknownKeysToUndefinedEmitter{}.Emit(rt, ctx, ct)
}
