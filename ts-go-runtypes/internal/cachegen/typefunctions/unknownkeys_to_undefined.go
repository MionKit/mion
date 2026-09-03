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

// IsNoopType — see isNoopForUnknownKeys (shared five-family mirror; uku
// additionally no-ops at tuples by design).
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
		return emitTupleUnknownKeysToUndefined(rt, ctx)
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
	return RTCode{Code: combined, Type: CodeS}
}

func emitTupleUnknownKeysToUndefined(rt *reflection.RunType, ctx *EmitContext) RTCode {
	// uku at a tuple node is a no-op. The per-position concat pattern
	// blindly recurses into every child slot, which breaks on circular
	// tuples (optional self-referential slot → unguarded `v[i].x` reads
	// against `undefined`/`null`) and is semantically suspect even
	// without recursion — for a tuple, "unknown key" would be an
	// element past the declared length, which the per-position emit
	// cannot detect. The safe encoder strips extras at encode time
	// (prepareForJsonSafe clones the declared shape only) so the safe
	// decode pipeline doesn't actually need this step to converge.
	_ = rt
	_ = ctx
	return RTCode{Code: "", Type: CodeS}
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
	keyRegexVar := ""
	if rt.Index != nil {
		indexResolved := ctx.ResolveRef(rt.Index)
		if indexResolved != nil && indexResolved.Kind == reflection.KindTemplateLiteral {
			if regex, ok := buildTemplateLiteralRegex(indexResolved); ok {
				keyRegexVar = ctx.NextLocalVar("reIdx")
				if !ctx.HasContextItem(keyRegexVar) {
					ctx.SetContextItem(keyRegexVar, "const "+keyRegexVar+" = new RegExp("+quoteJSDouble(regex)+")")
				}
			}
		}
	}
	if reflection.FamilyOf(resolved.Kind) == reflection.FamilyAtomic && keyRegexVar == "" {
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
	patternUndef := ""
	if keyRegexVar != "" {
		// Template-literal index keys also undefine keys that don't match the
		// key pattern (the sibling skip above already exempted named props).
		patternUndef = "if (!" + keyRegexVar + ".test(" + prop + ")) {" + v + "[" + prop + "] = undefined; continue;}"
	}
	if patternUndef == "" && childRT.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	body := "for (const " + prop + " in " + v + ") {" + siblingSkip + patternUndef + childRT.Code + "}"
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
