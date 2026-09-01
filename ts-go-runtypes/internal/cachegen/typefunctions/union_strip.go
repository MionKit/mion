package typefunctions

import (
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// union_strip.go projects a union's member list to its DataOnly view for the
// emit layer. Members whose kind DataOnly strips to `never` (symbol /
// function-like / Promise / non-serializable built-in / never) are dropped so a
// union like `Date | symbol` serializes and validates as `Date`, matching
// `DataOnly<Date | symbol>` = `Date`.
//
// The drop is emit-time only: the union RunType (and reflection via
// getRunType) keeps every member, so the side-channel still describes the real
// source type.
//
// When EVERY member is stripped the union's DataOnly projection is `never`, an
// uninhabitable type. In that case dataOnlyUnionMembers returns the ORIGINAL
// member list unchanged, so the emitter still reaches an unsupported (CodeNS)
// leaf and renders the existing alwaysThrow factory. That single fallback keeps
// the "all stripped => throw" contract with no per-emitter change.

// isStrippedUnionMember reports whether a resolved union member is one DataOnly
// projects to `never` (so the serializer / validator cannot represent it as
// data). Mirrors the DataOnlyStripped set in
// packages/run-types/src/runtypes/dataOnly.ts.
func isStrippedUnionMember(resolved *reflection.RunType) bool {
	if resolved == nil {
		return false
	}
	if isFunctionLikeKind(resolved.Kind) {
		return true
	}
	switch resolved.Kind {
	case reflection.KindSymbol, reflection.KindNever, reflection.KindPromise:
		return true
	case reflection.KindClass:
		return resolved.SubKind == reflection.SubKindNonSerializable
	}
	return false
}

// strippedPropertyDrop reports whether a property whose resolved VALUE is
// directly DataOnly-stripped (symbol / function-like / Promise / never /
// non-serializable native) must be dropped at a property position, emitting the
// matching per-family child-position Warning. Function-valued props keep the
// existing SlotFunctionPropDropped (…010) code; the other directly-stripped
// kinds use SlotNonSerializablePropDropped (…015). Mirrors the DataOnly object
// rule: a property whose value projects to `never` is removed and the
// surrounding object still serializes (`DataOnly<{a: symbol}>` = `{}`).
//
// Returns false for a value that is NOT directly stripped — including one that
// is only STRUCTURALLY unserializable (symbol[], Map<string, symbol>, a tuple
// with a stripped slot). DataOnly KEEPS those (`{a: symbol[]}` projects to
// `{a: never[]}`), so the caller must compile the value, observe the CodeNS it
// returns from the propagating slot, and propagate that failure — the object
// then alwaysThrows, which is the "can't be safely dropped" contract.
func strippedPropertyDrop(resolved *reflection.RunType, name string, ctx *EmitContext) bool {
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

// propertyChildFailed resolves what a property does when its compiled VALUE
// returned CodeNS and the value was NOT directly stripped (the directly-stripped
// case is handled by strippedPropertyDrop before the compile). The decision keys
// on the leaf that produced the CodeNS:
//
//   - A DataOnly-stripped leaf reached through a propagating slot (symbol[],
//     Map<string,symbol>, a tuple with a stripped slot) means DataOnly KEEPS the
//     property as an unrepresentable type (`{a: symbol[]}` projects to
//     `{a: never[]}`), so the failure PROPAGATES and the object alwaysThrows —
//     the oracle's "can't be safely dropped" case. Returns true; the caller
//     returns CodeNS.
//   - Any OTHER unsupported leaf (a future kind with no emit — never produced by
//     a real scan today, since tsgo collapses intersections etc.) is ABSORBED:
//     the walker latch is cleared and the property drops with no diagnostic, the
//     rest of the object still renders — the pre-DataOnly "property absorbs
//     unsupported" contract. Returns false.
func propertyChildFailed(ctx *EmitContext) (propagate bool) {
	if isStrippedUnionMember(ctx.walker.UnsupportedLeaf) {
		return true
	}
	ctx.walker.AbsorbUnsupported()
	return false
}

// strippedMemberLabel returns a short, user-facing label for a dropped union
// member — the value the build-time Warning substitutes for {0}. Uses the
// user's own type vocabulary (the class name for a built-in, the lowercase
// kind otherwise), never compiler-internal jargon.
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
	case reflection.KindNever:
		return "never"
	case reflection.KindPromise:
		return "Promise"
	case reflection.KindClass:
		if resolved.Name != "" {
			return resolved.Name
		}
		return "non-serializable value"
	}
	return "value"
}

// dataOnlyUnionMembers returns the union's member refs with DataOnly-stripped
// members removed. Refs are kept as-is (the caller resolves them lazily, as
// before), so the surviving slice keeps a gap-free order that doubles as the
// `[idx, value]` wire index on both encode and decode.
//
// When the filter would remove every member the projection is `never`, so the
// ORIGINAL list is returned unchanged to preserve the alwaysThrow path (see the
// file header).
//
// A genuine drop (some, not all, stripped) raises a build-time Warning via the
// active emitter's SlotUnionMemberDropped code — mirroring the property-drop
// warnings (VL010 etc.) so the silent projection is visible. Dedup-by-code in
// the walker collapses it to one diagnostic per family per walk; unknown-keys
// emitters register no code, so the slot is a no-op there.
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
	// Fast path: nothing stripped — return the ORIGINAL slice untouched so
	// callers see byte-identical behavior to the pre-DataOnly code (the common
	// case). All members stripped (DataOnly = never) — also return the original
	// so the emitter still reaches a CodeNS leaf and renders the alwaysThrow
	// factory.
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
