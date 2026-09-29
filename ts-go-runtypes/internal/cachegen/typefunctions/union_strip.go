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
func isStrippedUnionMember(resolved *reflection.RunType, ctx *EmitContext) bool {
	if resolved == nil {
		return false
	}
	if isCallableValue(resolved, ctx) {
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

// isCallableValue reports a function-like kind or an interface with a call signature, which DataOnly strips as a function.
func isCallableValue(resolved *reflection.RunType, ctx *EmitContext) bool {
	if isFunctionLikeKind(resolved.Kind) {
		return true
	}
	return resolved.Kind == reflection.KindObjectLiteral && ctx != nil && objectHasCallSignature(resolved, ctx)
}

// strippedPropertyDrop reports whether a property drops with a Warning while the object serializes (`{a: symbol}` -> `{}`).
// False for a value DataOnly keeps (`{a: symbol[]}`): the caller compiles it and the CodeNS makes the object alwaysThrow.
func strippedPropertyDrop(resolved *reflection.RunType, name string, ctx *EmitContext) bool {
	// A name that can never be a property drops whatever its value is (reflection.UnsafePropertyNames).
	if reflection.IsUnsafePropertyName(name) {
		ctx.EmitDiagnosticSlot(SlotUnsafeNamePropDropped, name)
		return true
	}
	if reflection.IsSymbolKeyedName(name) {
		ctx.EmitDiagnosticSlot(SlotSymbolKeyedDropped, reflection.SymbolKeyLabel(name))
		return true
	}
	return strippedValueDrop(resolved, name, ctx)
}

// strippedValueDrop is strippedPropertyDrop's VALUE half, for the union merge path, which checks names itself.
func strippedValueDrop(resolved *reflection.RunType, name string, ctx *EmitContext) bool {
	if !isStrippedUnionMember(resolved, ctx) {
		return false
	}
	if isCallableValue(resolved, ctx) {
		ctx.EmitDiagnosticSlot(SlotFunctionPropDropped, name)
	} else {
		ctx.EmitDiagnosticSlot(SlotNonSerializablePropDropped, name)
	}
	return true
}

// indexSignatureValueDrop reports whether an index signature's value is a function, dropped with the family's …010 note.
func indexSignatureValueDrop(signature, resolved *reflection.RunType, ctx *EmitContext) bool {
	if !isCallableValue(resolved, ctx) {
		return false
	}
	ctx.EmitDiagnosticSlot(SlotFunctionPropDropped, indexSignatureLabel(signature, ctx))
	return true
}

// indexSignatureLabel names an index signature the way the user wrote it, `[key: string]`.
func indexSignatureLabel(signature *reflection.RunType, ctx *EmitContext) string {
	if index := ctx.ResolveRef(signature.Index); index != nil {
		switch index.Kind {
		case reflection.KindString:
			return "[key: string]"
		case reflection.KindNumber:
			return "[key: number]"
		}
	}
	return "[key]"
}

// strippedMemberLabel returns the user-facing label a dropped union member's Warning substitutes for {0},
// in the user's own type vocabulary, never compiler-internal jargon.
func strippedMemberLabel(resolved *reflection.RunType, ctx *EmitContext) string {
	if resolved == nil {
		return "value"
	}
	if isCallableValue(resolved, ctx) {
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
		if isStrippedUnionMember(ctx.ResolveRef(ref), ctx) {
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
		if isStrippedUnionMember(resolved, ctx) {
			droppedLabels = append(droppedLabels, strippedMemberLabel(resolved, ctx))
			continue
		}
		survivors = append(survivors, ref)
	}
	ctx.EmitDiagnosticSlot(SlotUnionMemberDropped, strings.Join(droppedLabels, ", "))
	return survivors
}
