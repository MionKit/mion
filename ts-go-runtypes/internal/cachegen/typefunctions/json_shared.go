package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// jsonWireSupports is the ONE supported-kind set for every JSON-wire
// family — prepareForJson, restoreFromJson, stringifyJson, and the
// compact / prepare-safe / compact-restore variants that already
// delegated. The families share the set by definition (they are stages
// of the same wire format), so a kind gaining JSON support lands here
// once and covers all of them.
//
// Per-kind notes (family-specific behavior lives in each family's Emit):
//   - KindNever / KindPromise / SubKindNonSerializable are SUPPORTED so
//     the renderer compiles the entry and each family's Emit surfaces
//     its own runtime-throwing factory (ref: nodes/atomic/never.ts,
//     nodes/native/promise.ts).
//   - KindArray gates on a non-nil child — a malformed KindArray with
//     Child=nil would reach Emit and panic.
//   - KindUnion gates on members; the families encode/decode the
//     `[memberIndex, transformedValue]` envelope per-member (see
//     json_prepare.go / json_restore.go union arms).
//   - KindIntersection is resolved by tsgo at the checker layer
//     (`A & B` → merged object literal); supported as a defensive noop
//     in case a resolution path produces an unresolved intersection.
//   - KindTemplateLiteral is string-flavoured at runtime — noop.
//   - Function-ish kinds emit a noop body at top level; object-property
//     children of these kinds are filtered out by the object emits.
//   - KindClass: Date is atomic (its own toJSON); user classes
//     (SubKindNone) use the object emit; Map/Set materialise into
//     JSON-encodable arrays; Temporal types are atomic leaves.
func jsonWireSupports(rt *reflection.RunType) bool {
	if rt == nil {
		return false
	}
	switch rt.Kind {
	case reflection.KindAny, reflection.KindUnknown,
		reflection.KindVoid,
		reflection.KindNull, reflection.KindUndefined,
		reflection.KindString, reflection.KindNumber, reflection.KindBoolean,
		reflection.KindBigInt, reflection.KindSymbol,
		reflection.KindObject, reflection.KindRegexp,
		reflection.KindLiteral, reflection.KindEnum:
		return true
	case reflection.KindNever:
		return true
	case reflection.KindArray:
		return rt.Child != nil
	case reflection.KindObjectLiteral:
		return true
	case reflection.KindProperty, reflection.KindPropertySignature:
		return true
	case reflection.KindIndexSignature:
		return true
	case reflection.KindTuple:
		return true
	case reflection.KindTupleMember:
		return true
	case reflection.KindUnion:
		return len(rt.Children) > 0
	case reflection.KindIntersection:
		return true
	case reflection.KindTemplateLiteral:
		return true
	case reflection.KindFunction, reflection.KindMethod,
		reflection.KindMethodSignature, reflection.KindCallSignature:
		return true
	case reflection.KindClass:
		switch rt.SubKind {
		case reflection.SubKindDate, reflection.SubKindNone,
			reflection.SubKindMap, reflection.SubKindSet,
			reflection.SubKindNonSerializable:
			return true
		}
		return reflection.IsTemporalSubKind(rt.SubKind)
	case reflection.KindPromise:
		return true
	}
	return false
}

// emitElementLoop compiles child under the subscript accessor `v[i]`
// and wraps its statement-shaped code in a `for` loop from start to
// v.length — the shared in-place traversal the mutating JSON families
// (prepare / restore / compact-restore) use for arrays and rest tuple
// tails. Empty child code collapses the loop to a noop; a CodeNS child
// propagates so the walker latches the unsupported leaf and the
// renderer emits alwaysThrow keyed off the child's kind.
func emitElementLoop(child *reflection.RunType, ctx *EmitContext, v, start string) RTCode {
	iVar := ctx.NextLocalVar("i")
	ctx.SetChildAccessor(v + "[" + iVar + "]")
	childRT := ctx.CompileChild(child, CodeS)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	// Guarded by Array.isArray: the loop bound is the VALUE's own `.length`, so
	// a wire object such as `{"length": 1e9}` at an array position would
	// otherwise drive a billion iterations (and, on the restoring families,
	// a billion property writes) before validate ever saw it. A non-array is
	// left untouched for the check that follows to refuse.
	body := "if (Array.isArray(" + v + ")) {for (let " + iVar + " = " + start + "; " + iVar + " < " + v + ".length; " + iVar + "++) {" + childRT.Code + "}}"
	return RTCode{Code: body, Type: CodeS}
}
