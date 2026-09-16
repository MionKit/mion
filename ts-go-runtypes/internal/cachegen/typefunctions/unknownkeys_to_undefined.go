package typefunctions

import (
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// UnknownKeysToUndefinedEmitter — INTERNAL-ONLY since the public
// unknownKeysToUndefined factory/family was removed in favor of
// cloneExactShape: this emitter now exists solely as the delegate backing
// UnknownKeysToUndefinedWireEmitter (the JSON `strip` decode strategy's
// pre-pass), which wraps every method below. It mutates the input value by
// setting every unknown property to undefined (instead of removing it) —
// the right call on a freshly-parsed, exclusively-owned wire value.
type UnknownKeysToUndefinedEmitter struct{}

func (UnknownKeysToUndefinedEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

func (UnknownKeysToUndefinedEmitter) Supports(rt *reflection.RunType) bool {
	return unknownKeysSupports(rt)
}

func (UnknownKeysToUndefinedEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// IsNoopType: see isNoopForUnknownKeys, the shared five-family mirror.
func (UnknownKeysToUndefinedEmitter) IsNoopType(rt *reflection.RunType, ctx *EmitContext) bool {
	return isNoopForUnknownKeys(rt, ctx, unknownKeysToUndefinedNoopSpec)
}

// NoopChildComposesAround — a child with nothing to undefine mutates
// nothing; empty code composes correctly.
func (UnknownKeysToUndefinedEmitter) NoopChildComposesAround() {}

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
		return emitPropertyUnknownKeys(rt, ctx, false)
	case reflection.KindArray:
		return emitArrayUnknownKeys(rt, ctx, false)
	case reflection.KindTuple:
		// Runs on a caller's payload, not on our encoder's output, so a tuple slot is swept too.
		return emitTupleUnknownKeysRecurse(rt, ctx)
	case reflection.KindTupleMember:
		return emitTupleMemberUnknownKeys(rt, ctx, false)
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

// emitObjectUnknownKeysToUndefined ports
// InterfaceRunType.emitUnknownKeysToUndefined (interface.ts:188-202).
// Identical to strip except `v[key] = undefined` instead of
// `delete v[key]`.
func emitObjectUnknownKeysToUndefined(rt *reflection.RunType, ctx *EmitContext) RTCode {
	hasIndex := objectHasIndexSignatureChild(rt, ctx)
	v := ctx.Vλl
	var parentCode string
	if !hasIndex {
		unknownValue := callCheckUnknownPropertiesForHas(rt, ctx, true, false)
		if unknownValue != "" {
			unknownVar := ctx.NextLocalVar("unk")
			keyVar := ctx.NextLocalVar("ky")
			parentCode = "const " + unknownVar + " = " + unknownValue + ";" +
				"if (" + unknownVar + ") {for (const " + keyVar + " of " + unknownVar + ") {" + v + "[" + keyVar + "] = undefined}}"
		}
	}
	// When the object has both named props AND an index signature,
	// publish the sibling-named-prop name list against each index
	// signature child's ID so the index-sig emit can keep those keys
	// out of the regex-undefine sweep. The context key is derived from
	// the index sig's own ID — it's the only canonical handle the
	// index-sig emit has on itself. (We can't store parent-relative
	// state on the index-sig RunType itself; see CLAUDE.md.)
	if hasIndex {
		publishSiblingNamedKeysForIndexSig(rt, ctx)
	}
	childrenCode := unknownKeysChildrenCode(rt, ctx)
	combined := joinSemicolons(parentCode, childrenCode)
	if combined == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	// The shape guard every object-node unknown-keys emit runs under: an absent optional tuple slot
	// (`{list: [string, Self?]}`) hands this node a null, and the key scan would read `v.list` off it.
	return RTCode{Code: guardStatement(unknownKeysObjectGuard(v), combined), Type: CodeS}
}

// emitIndexSignatureUnknownKeysToUndefined ports
// IndexSignatureRunType.emitUnknownKeysToUndefined (indexProperty.ts:144-154).
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
	if isFunctionLikeKind(resolved.Kind) {
		return RTCode{Code: "", Type: CodeS}
	}
	// The key pattern only selects the VALUE transform: a key it does not match
	// is left as is (validation is what refuses it), so an atomic value has
	// nothing to sweep whatever the key pattern.
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
	// When the index sig's parent published a sibling-named-prop set (see
	// publishSiblingNamedKeysForIndexSig in emitObjectUnknownKeysToUndefined),
	// the for-in sweep MUST skip those named keys entirely: the parent already
	// processes each named prop separately, and running the index-VALUE logic on
	// a named prop both corrupts it (its keys get measured against the index
	// value's allowlist) and, when the named value is a primitive/string, makes
	// the inner `for…in` enumerate the string's character indices — which on a
	// long value overflows the unknown-keys cap and throws. Skip is unconditional
	// (not gated on the template-literal regex path).
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

// emitUnionUnknownKeysToUndefined — public uku family's union arm.
// Operates on runtime-shape input (raw object the user passed to
// createUnknownKeysToUndefined or to the mutate+strip encoder
// composition); walks the merged-allowlist via the shared helper.
//
// Safe to run the merged-allowlist strip directly on the user value
// now that the decoder's safe pipeline uses ukuWire (which handles
// the wire-format wrapper-peel separately) — uku no longer sees
// wire-shape arrays.
func emitUnionUnknownKeysToUndefined(rt *reflection.RunType, ctx *EmitContext) RTCode {
	return emitUnionUnknownKeysMerged(rt, ctx, UnknownKeysOpts{
		Snippet: func(_ *EmitContext, accessor, keyVar string) string {
			return accessor + "[" + keyVar + "] = undefined"
		},
		CodeShape: CodeS,
	})
}
