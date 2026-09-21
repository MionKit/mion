package typefunctions

import (
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// union_strip.go projects a union's member list to its DataOnly view for the emit layer, so `Date | symbol`
// serializes and validates as `Date`. The drop is emit-time only: the union RunType, and reflection via
// getRunType, keeps every member, so the side-channel still describes the real source type. When EVERY
// member is stripped the projection is `never`, and dataOnlyUnionMembers returns the ORIGINAL list so the
// emitter still reaches a CodeNS leaf and renders the alwaysThrow factory: one fallback, no per-emitter change.

// isStrippedUnionMember reports whether a resolved union member is one DataOnly projects to `never`.
// Mirrors the DataOnlyStripped set in packages/run-types/src/runtypes/dataOnly.ts.
func isStrippedUnionMember(resolved *reflection.RunType) bool {
	if resolved == nil {
		return false
	}
	if isFunctionLikeKind(resolved.Kind) {
		return true
	}
	switch resolved.Kind {
	case reflection.KindSymbol, reflection.KindNever, reflection.KindPromise, reflection.KindRegexp:
		return true
	case reflection.KindLiteral:
		// A unique symbol is assignable to `symbol`, so DataOnly strips it like the bare kind.
		return literalFlavour(resolved) == litSymbol
	case reflection.KindClass:
		return resolved.SubKind == reflection.SubKindNonSerializable
	}
	return false
}

// strippedPropertyDrop reports whether a property must be dropped at a property position, emitting the
// matching per-family child-position Warning. Two reasons, both leaving the surrounding object
// serializing: the NAME can never be a property (`__proto__`, UPN001), or the VALUE is directly
// DataOnly-stripped. Function-valued props use SlotFunctionPropDropped (…010), the other stripped kinds
// SlotNonSerializablePropDropped (…015). Mirrors the DataOnly object rule: a property the projection
// removes is gone and the object still serializes (`DataOnly<{a: symbol}>` = `{}`).
// False for a value that is only STRUCTURALLY unserializable (symbol[], Map<string, symbol>, a tuple with
// a stripped slot), which DataOnly KEEPS (`{a: symbol[]}` projects to `{a: never[]}`): the caller must
// compile the value and propagate the CodeNS, so the object alwaysThrows, the "can't be safely dropped" contract.
func strippedPropertyDrop(resolved *reflection.RunType, name string, ctx *EmitContext) bool {
	// A name that can never be a property drops whatever its value is (reflection.UnsafePropertyNames).
	if reflection.IsUnsafePropertyName(name) {
		ctx.EmitDiagnosticSlot(SlotUnsafeNamePropDropped, name)
		return true
	}
	if !isStrippedUnionMember(resolved) {
		return false
	}
	if isFunctionLikeKind(resolved.Kind) {
		ctx.EmitDiagnosticSlot(SlotFunctionPropDropped, name)
	} else {
		ctx.EmitDiagnosticSlot(SlotNonSerializablePropDropped, name)
	}
	return true
}

// propertyChildFailed decides what a property does when its compiled VALUE returned CodeNS and was NOT
// directly stripped (strippedPropertyDrop handles that case before the compile), keying on the leaf that
// produced the CodeNS:
//
//   - A DataOnly-stripped leaf reached through a propagating slot (symbol[], Map<string,symbol>, a tuple
//     with a stripped slot) is one DataOnly KEEPS as an unrepresentable type, so the failure PROPAGATES
//     and the object alwaysThrows, the "can't be safely dropped" case. Returns true.
//   - Any OTHER unsupported leaf (a future kind with no emit, never produced by a real scan today) is
//     ABSORBED: the property drops with no diagnostic and the rest of the object still renders, the
//     pre-DataOnly "property absorbs unsupported" contract. Returns false.
func propertyChildFailed(ctx *EmitContext) (propagate bool) {
	if isStrippedUnionMember(ctx.walker.UnsupportedLeaf) {
		return true
	}
	ctx.walker.AbsorbUnsupported()
	return false
}

// strippedMemberLabel returns the user-facing label a dropped union member's Warning substitutes for {0},
// in the user's own type vocabulary, never compiler-internal jargon.
func strippedMemberLabel(resolved *reflection.RunType) string {
	if resolved == nil {
		return "value"
	}
	if isFunctionLikeKind(resolved.Kind) {
		return "function"
	}
	switch resolved.Kind {
	case reflection.KindSymbol:
		return "symbol"
	case reflection.KindLiteral:
		if literalFlavour(resolved) == litSymbol {
			return "symbol"
		}
		return "value"
	case reflection.KindNever:
		return "never"
	case reflection.KindPromise:
		return "Promise"
	case reflection.KindRegexp:
		return "RegExp"
	case reflection.KindClass:
		if resolved.Name != "" {
			return resolved.Name
		}
		return "non-serializable value"
	}
	return "value"
}

// dataOnlyUnionMembers returns the union's member refs with DataOnly-stripped members removed.
// Refs are kept as-is, so the surviving slice keeps a gap-free order that doubles as the `[idx, value]`
// wire index on both encode and decode. Removing every member means the projection is `never`, so the
// ORIGINAL list is returned to preserve the alwaysThrow path (see the file header).
// A genuine drop raises a build-time Warning via SlotUnionMemberDropped, mirroring the property-drop
// warnings (VL010 etc.) so the silent projection is visible. The walker's dedup-by-code collapses it to
// one diagnostic per family per walk; unknown-keys emitters register no code, so the slot is a no-op there.
func dataOnlyUnionMembers(rt *reflection.RunType, ctx *EmitContext) []*reflection.RunType {
	children := rt.SafeUnionChildren
	if len(children) == 0 {
		children = rt.Children
	}
	strippedCount := 0
	for _, ref := range children {
		if isStrippedUnionMember(ctx.ResolveRef(ref)) {
			strippedCount++
		}
	}
	// Nothing stripped: return the ORIGINAL slice, byte-identical to the pre-DataOnly behaviour.
	// All stripped (DataOnly = never): also the original, so the emitter reaches a CodeNS leaf and
	// renders the alwaysThrow factory.
	if strippedCount == 0 || strippedCount == len(children) {
		return children
	}
	survivors := make([]*reflection.RunType, 0, len(children)-strippedCount)
	droppedLabels := make([]string, 0, strippedCount)
	for _, ref := range children {
		resolved := ctx.ResolveRef(ref)
		if isStrippedUnionMember(resolved) {
			droppedLabels = append(droppedLabels, strippedMemberLabel(resolved))
			continue
		}
		survivors = append(survivors, ref)
	}
	ctx.EmitDiagnosticSlot(SlotUnionMemberDropped, strings.Join(droppedLabels, ", "))
	return survivors
}
