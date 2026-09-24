package typefunctions

import (
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// UnknownKeysToUndefinedEmitter exists only as the delegate StripUnknownKeysWireEmitter wraps.
// It blanks unknown keys rather than deleting them, safe on a freshly parsed, exclusively owned wire value.
type UnknownKeysToUndefinedEmitter struct{}

func (UnknownKeysToUndefinedEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

func (UnknownKeysToUndefinedEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

func (UnknownKeysToUndefinedEmitter) ReturnName() string {
	return "v"
}

func (UnknownKeysToUndefinedEmitter) Emit(rt *reflection.RunType, ctx *EmitContext, _ CodeType) RTCode {
	if rt == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	switch rt.Kind {
	case reflection.KindObjectLiteral:
		return emitObjectUnknownKeysToUndefined(rt, ctx)
	case reflection.KindClass:
		switch rt.SubKind {
		case reflection.SubKindNone:
			return emitObjectUnknownKeysToUndefined(rt, ctx)
		case reflection.SubKindMap, reflection.SubKindSet:
			return emitNativeIterableUnknownKeys(rt, ctx, ctx.Vλl, false)
		}
		return RTCode{Code: "", Type: CodeS}
	case reflection.KindProperty, reflection.KindPropertySignature:
		return emitPropertyUnknownKeys(rt, ctx)
	case reflection.KindArray:
		return emitArrayUnknownKeys(rt, ctx)
	case reflection.KindTuple:
		// Runs on a caller's payload, not on our encoder's output, so a tuple slot is swept too.
		return emitTupleUnknownKeysRecurse(rt, ctx)
	case reflection.KindTupleMember:
		return emitTupleMemberUnknownKeys(rt, ctx)
	case reflection.KindIndexSignature:
		return emitIndexSignatureUnknownKeysToUndefined(rt, ctx)
	case reflection.KindUnion:
		return emitUnionUnknownKeysToUndefined(rt, ctx)
	}
	return RTCode{Code: "", Type: CodeS}
}

func (UnknownKeysToUndefinedEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	return ctx.emitDepCall(childID, ctx.Vλl, "")
}

func (UnknownKeysToUndefinedEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	trimmed := strings.TrimSpace(code)
	if trimmed == "" || trimmed == "return v" {
		return "return v", true
	}
	return code, false
}

// emitObjectUnknownKeysToUndefined is the strip emit with `v[key] = undefined` in place of `delete v[key]`.
func emitObjectUnknownKeysToUndefined(rt *reflection.RunType, ctx *EmitContext) RTCode {
	hasIndex := objectHasIndexSignatureChild(rt, ctx)
	v := ctx.Vλl
	var parentCode string
	if !hasIndex {
		unknownValue := callCheckUnknownPropertiesForHas(rt, ctx, true)
		if unknownValue != "" {
			unknownVar := ctx.NextLocalVar("unk")
			keyVar := ctx.NextLocalVar("ky")
			parentCode = "const " + unknownVar + " = " + unknownValue + ";" +
				"if (" + unknownVar + ") {for (const " + keyVar + " of " + unknownVar + ") {" + v + "[" + keyVar + "] = undefined}}"
		}
	}
	// With named props AND an index signature, the sibling-named-prop list keeps those keys out of the index sweep.
	if hasIndex {
		publishSiblingNamedKeysForIndexSig(rt, ctx)
	}
	childrenCode := unknownKeysChildrenCode(rt, ctx)
	combined := joinSemicolons(parentCode, childrenCode)
	if combined == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	// The shape guard every object-node unknown-keys emit runs under: an absent optional tuple slot hands this node a null.
	return RTCode{Code: guardStatement(unknownKeysObjectGuard(v), combined), Type: CodeS}
}

// emitIndexSignatureUnknownKeysToUndefined sweeps the index-matched values, skipping sibling named props.
func emitIndexSignatureUnknownKeysToUndefined(rt *reflection.RunType, ctx *EmitContext) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if isSymbolKeyedIndexSig(rt, ctx) {
		return RTCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if reflection.IsUnsafePropertyName(rt.Name) {
		return RTCode{Code: "", Type: CodeS}
	}
	if isFunctionLikeKind(resolved.Kind) {
		return RTCode{Code: "", Type: CodeS}
	}
	// The key pattern only selects the VALUE transform (validation is what refuses a non-matching key), so an atomic value
	// has nothing to sweep whatever the pattern.
	keyRegexVar := indexSignatureKeyRegexVar(rt, ctx)
	if reflection.FamilyOf(resolved.Kind) == reflection.FamilyAtomic {
		return RTCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	prop := ctx.NextLocalVar("k")
	ctx.SetChildAccessor(v + "[" + prop + "]")
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	// The for-in sweep MUST skip every key of the parent's published sibling-named-prop set: the parent already handles
	// each named prop, and the index-VALUE logic corrupts it (its keys get measured against the index value's allowlist),
	// or, on a primitive value, enumerates the string's character indices until the unknown-keys cap throws.
	// The skip is unconditional, never gated on the template-literal regex path.
	siblingSkip := ""
	siblingSet := siblingNamedKeysCtxKey(rt)
	if ctx.HasContextItem(siblingSet) {
		siblingSkip = "if (" + siblingSet + ".has(" + prop + ")) continue;"
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	patternSkip := ""
	if keyRegexVar != "" {
		patternSkip = "if (!" + keyRegexVar + ".test(" + prop + ")) continue;"
	}
	body := "for (const " + prop + " in " + v + ") {" + siblingSkip + patternSkip + childRT.Code + "}"
	return RTCode{Code: body, Type: CodeS}
}

// emitUnionUnknownKeysToUndefined walks the merged allowlist on RUNTIME-shape input.
// Running it straight on the user value is safe because the decoder's safe pipeline goes through ukuWire, which peels
// the wire-format wrapper itself, so uku never sees a wire-shape array.
func emitUnionUnknownKeysToUndefined(rt *reflection.RunType, ctx *EmitContext) RTCode {
	return emitUnionUnknownKeysMerged(rt, ctx, UnknownKeysOpts{
		Snippet: func(_ *EmitContext, accessor, keyVar string) string {
			return accessor + "[" + keyVar + "] = undefined"
		},
	})
}
