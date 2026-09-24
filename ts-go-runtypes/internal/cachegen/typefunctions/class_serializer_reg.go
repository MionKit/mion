package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// ClassSerializerRegEmitter implements the `classSerializerReg` (csr) family behind
// registerClassSerializer's trailing InjectTypeFnArgs<T, 'csr'> marker. The entry is a NAME CARD, not a
// value walker: its fn returns the build-time `rt.TypeName` the registry's name-fallback keys on (the same
// name the codec bodies bake into `utl.getClassSerializer('<id>', '<className>')`), null when anonymous.
// A registration site therefore demands ONE tiny entry instead of the class's whole reflection graph.
// It renders inline at the root frame: no child walk, no cross-entry deps, total over every node kind
// (a non-class T yields a null card; registerClassSerializer's cls-must-be-a-function check is the guard).
type ClassSerializerRegEmitter struct{}

// Args — single ignored value arg, the walker's minimal frame shape.
func (ClassSerializerRegEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports — every node gets a card (the renderer is total).
func (ClassSerializerRegEmitter) Supports(rt *reflection.RunType) bool {
	return rt != nil
}

// IsRTInlined — always: the card renders whole at the root.
func (ClassSerializerRegEmitter) IsRTInlined(ctx *InlineContext) bool {
	return true
}

// Emit returns the class-name card body; an anonymous name renders as null and the registry falls back
// to runtime cls.name, exactly as the codec side skips its registry branch.
func (ClassSerializerRegEmitter) Emit(rt *reflection.RunType, ctx *EmitContext, expectedCType CodeType) RTCode {
	name := userClassName(rt)
	if name == "" {
		return RTCode{Code: "return null;", Type: CodeRB}
	}
	return RTCode{Code: "return " + quoteJS(name) + ";", Type: CodeRB}
}

// EmitDependencyCall is unreachable (IsRTInlined is always true).
func (ClassSerializerRegEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	panic("typefns: the classSerializerReg emitter never dep-calls (the name card renders whole at the root)")
}

// IsNoopType — never a noop, the root always returns the rendered document.
func (ClassSerializerRegEmitter) IsNoopType(_ *reflection.RunType, _ *EmitContext) bool {
	return false
}

// Finalize — the body is always the single return statement; never a noop.
func (ClassSerializerRegEmitter) Finalize(rawCode string) (string, bool) {
	return rawCode, false
}

// ReturnName — unused (the body always returns explicitly).
func (ClassSerializerRegEmitter) ReturnName() string {
	return "v"
}
