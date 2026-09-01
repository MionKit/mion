package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// ClassSerializerRegEmitter implements the `classSerializerReg` (csr) cache
// family backing registerClassSerializer's trailing InjectTypeFnArgs<T, 'csr'>
// marker. The emitted entry is a NAME CARD, not a value walker: its tuple
// `typeName` slot carries the build-time class name the registry's name-fallback
// lane keys on (the same `rt.TypeName` the codec bodies bake into their
// `utl.getClassSerializer('<id>', '<className>')` lookups), and its fn returns
// that name (null for anonymous classes, which the registry never name-routes).
//
// This exists so a registration site demands ONE tiny entry instead of the
// type's whole reflection graph — before it, registerClassSerializer carried
// InjectRunTypeId<T> and read `node.typeName` off the runtype cache, forcing the
// class's full type graph into the bundle just to recover a string.
//
// Like JsonSchemaDocEmitter the whole entry renders inline at the root frame:
// no child walk, no cross-entry deps, total over every node kind (a non-class T
// yields a null card; registerClassSerializer's own cls-must-be-a-function check
// is the user-facing guard).
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

// Emit returns the class-name card body. userClassName filters anonymous /
// internal-symbol names to "", which renders as null — the registry then falls
// back to runtime cls.name exactly as the codec side skips its registry branch.
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

// Finalize — the body is always the single return statement; never a noop.
func (ClassSerializerRegEmitter) Finalize(rawCode string) (string, bool) {
	return rawCode, false
}

// ReturnName — unused (the body always returns explicitly).
func (ClassSerializerRegEmitter) ReturnName() string {
	return "v"
}
