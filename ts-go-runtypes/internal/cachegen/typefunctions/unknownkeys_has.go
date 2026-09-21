package typefunctions

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// HasUnknownKeysEmitter implements `hasUnknownKeys`: true when the value or a nested child carries an undeclared key.
// The emitted fn takes (v, opts), where `opts.checkNonRTProps` widens the known-key list from the RT children to ALL
// children (the function-typed / static / non-serialisable ones the schema lists but the RT skipped). Default false.
type HasUnknownKeysEmitter struct{}

// Args gives `opts` a `{}` default so callers can invoke `huk(v)` without the options bag.
func (HasUnknownKeysEmitter) Args() []ArgSpec {
	return []ArgSpec{
		{Key: "vλl", Name: "v", Default: ""},
		{Key: "θpts", Name: "opts", Default: "{}"},
	}
}

func (HasUnknownKeysEmitter) Supports(rt *reflection.RunType) bool {
	return unknownKeysSupports(rt)
}

func (HasUnknownKeysEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// PropagatesVariant — `runsAfterValidation` is a claim about the VALUE, not the root call: if `v` passed validate so did
// `v.address`, at every depth. So it rides the whole subtree and a NAMED nested type gets the same key-count compare an
// inline one does; without it the named child dep-calls the plain entry and silently keeps the scan.
func (HasUnknownKeysEmitter) PropagatesVariant(options []string) bool {
	for _, name := range options {
		if name == "runsAfterValidation" {
			return true
		}
	}
	return false
}

// IsNoopType — see isNoopForUnknownKeys (shared five-family mirror).
func (HasUnknownKeysEmitter) IsNoopType(rt *reflection.RunType, ctx *EmitContext) bool {
	return isNoopForUnknownKeys(rt, ctx, hasUnknownKeysNoopSpec)
}

// NoopChildComposesAround — a child that can never report unknown keys
// contributes nothing to the parent's `||` chain.
func (HasUnknownKeysEmitter) NoopChildComposesAround() {}

// ReturnName is `v` only for the walker's statement-shape return wrap; the body returns booleans, and Finalize
// rewrites `return v` to `return false`, matching the `() => false` noop on the JS side.
func (HasUnknownKeysEmitter) ReturnName() string {
	return "v"
}

// Emit is the per-kind switch; a supported kind that is not listed emits an empty body Finalize folds to `return false`.
func (HasUnknownKeysEmitter) Emit(rt *reflection.RunType, ctx *EmitContext, _ CodeType) RTCode {
	if rt == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	_ = ctx
	switch rt.Kind {
	case reflection.KindObjectLiteral:
		return emitObjectHasUnknownKeys(rt, ctx)
	case reflection.KindClass:
		switch rt.SubKind {
		case reflection.SubKindNone:
			return emitObjectHasUnknownKeys(rt, ctx)
		case reflection.SubKindMap, reflection.SubKindSet:
			return emitNativeIterableHasUnknownKeys(rt, ctx, ctx.Vλl)
		}
		return RTCode{Code: "", Type: CodeS}
	case reflection.KindProperty, reflection.KindPropertySignature:
		return emitPropertyHasUnknownKeys(rt, ctx)
	case reflection.KindArray:
		return emitArrayHasUnknownKeys(rt, ctx)
	case reflection.KindTuple:
		return emitTupleHasUnknownKeys(rt, ctx)
	case reflection.KindTupleMember:
		return emitTupleMemberHasUnknownKeys(rt, ctx)
	case reflection.KindIndexSignature:
		return emitIndexSignatureHasUnknownKeys(rt, ctx)
	case reflection.KindUnion:
		return emitUnionHasUnknownKeys(rt, ctx)
	}
	// Atomic / non-composite kinds carry no keys.
	return RTCode{Code: "", Type: CodeS}
}

// EmitDependencyCall passes v and opts through to the child's factory unchanged.
func (HasUnknownKeysEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	optsArg := ctx.ArgName("θpts")
	return ctx.emitDepCall(childID, ctx.Vλl+","+optsArg, "")
}

// Finalize folds an empty body to `return false` and reports it as a noop.
func (HasUnknownKeysEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	trimmed := trimWhitespace(code)
	if trimmed == "" || trimmed == "return v" {
		return "return false", true
	}
	return code, false
}

// emitObjectHasUnknownKeys ORs this object's own key check (suppressed when an index-signature child is present) with
// each non-skipped property's own hasUnknownKeys.
func emitObjectHasUnknownKeys(rt *reflection.RunType, ctx *EmitContext) RTCode {
	return emitInterfaceHasUnknownKeys(rt, ctx)
}

func emitInterfaceHasUnknownKeys(rt *reflection.RunType, ctx *EmitContext) RTCode {
	parts, hasIndex := collectObjectHasUnknownKeysChildren(rt, ctx)
	parentExpr := ""
	if !hasIndex {
		// runsAfterValidation: the caller asserts the value PASSED validate, so every object position is a non-null object
		// (guards dropped) and on an all-required shape every declared prop is present, which is what makes the key-count
		// compare exact (2.6x on a 7-prop shape, 13x at 30 props, Node 26).
		// Ineligible shapes (optional props, index sigs, non-RT children) keep the scan, guardless.
		// The claim is about the VALUE, so PropagatesVariant renders the whole subtree under the variant, which puts a
		// NAMED nested type on the same footing as an inline one.
		if ctx.HasVariantOption("runsAfterValidation") {
			if n, ok := countFastPathN(rt, ctx); ok {
				parentExpr = emitCountKeys(ctx, ctx.Vλl, n, false)
			} else {
				parentExpr = callCheckUnknownPropertiesForHas(rt, ctx, false, false)
			}
		} else {
			// The shape guard sits around the WHOLE chain below, so the parent scan carries no copy of its own.
			parentExpr = callCheckUnknownPropertiesForHas(rt, ctx, false, false)
		}
	}
	expressions := []string{}
	if parentExpr != "" {
		expressions = append(expressions, parentExpr)
	}
	expressions = append(expressions, parts...)
	if len(expressions) == 0 {
		return RTCode{Code: "", Type: CodeE}
	}
	chain := joinOr(expressions)
	// The `||` chain still reads `v.address` when the parent scan says false, which throws against null.
	// Under runsAfterValidation the caller promised a validated value, and that variant is guardless by contract.
	if ctx.HasVariantOption("runsAfterValidation") {
		return RTCode{Code: chain, Type: CodeE}
	}
	return RTCode{Code: "(" + unknownKeysObjectGuard(ctx.Vλl) + " && " + chain + ")", Type: CodeE}
}

// emitPropertyHasUnknownKeys recurses under `v.<name>`, guarding the descent on presence for an optional property.
func emitPropertyHasUnknownKeys(rt *reflection.RunType, ctx *EmitContext) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	if reflection.IsUnsafePropertyName(rt.Name) {
		return RTCode{Code: "", Type: CodeE}
	}
	if isFunctionLikeKind(resolved.Kind) {
		return RTCode{Code: "", Type: CodeE}
	}
	if resolved.IsStatic {
		return RTCode{Code: "", Type: CodeE}
	}
	v := ctx.Vλl
	accessor := propertyAccessor(v, rt.Name, rt.IsSafeName)
	ctx.SetChildAccessor(accessor)
	childRT := ctx.CompileChild(rt.Child, CodeE)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeE}
	}
	if rt.Optional {
		return RTCode{Code: "(" + propertyPresenceTest(rt, v, accessor) + " && (" + childRT.Code + "))", Type: CodeE}
	}
	return RTCode{Code: childRT.Code, Type: CodeE}
}

// emitArrayHasUnknownKeys is a noop for an atomic element type; otherwise it returns CodeRB, a `for` + `return false` block.
func emitArrayHasUnknownKeys(rt *reflection.RunType, ctx *EmitContext) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	if reflection.FamilyOf(resolved.Kind) == reflection.FamilyAtomic {
		return RTCode{Code: "", Type: CodeE}
	}
	v := ctx.Vλl
	iVar := ctx.NextLocalVar("i")
	resVar := ctx.NextLocalVar("res")
	ctx.SetChildAccessor(v + "[" + iVar + "]")
	childRT := ctx.CompileChild(rt.Child, CodeE)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeE}
	}
	body := "if (!Array.isArray(" + v + ")) return false;" +
		"for (let " + iVar + " = 0; " + iVar + " < " + v + ".length; " + iVar + "++) {" +
		"const " + resVar + " = " + childRT.Code + ";" +
		"if (" + resVar + ") return true;" +
		"}" +
		"return false"
	return RTCode{Code: body, Type: CodeRB}
}

// emitTupleHasUnknownKeys OR-joins each member's own emit.
func emitTupleHasUnknownKeys(rt *reflection.RunType, ctx *EmitContext) RTCode {
	if len(rt.Children) == 0 {
		return RTCode{Code: "", Type: CodeE}
	}
	var parts []string
	for _, child := range rt.Children {
		childRT := ctx.CompileChild(child, CodeE)
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code != "" {
			parts = append(parts, childRT.Code)
		}
	}
	if len(parts) == 0 {
		return RTCode{Code: "", Type: CodeE}
	}
	// Member accessors `v[0]`, `v[1]`, … are unreadable on null/undefined.
	return RTCode{Code: "(" + unknownKeysArrayGuard(ctx.Vλl) + " && " + joinOr(parts) + ")", Type: CodeE}
}

// emitTupleMemberHasUnknownKeys descends into the wrapped child, iterating from the position for a rest member.
func emitTupleMemberHasUnknownKeys(rt *reflection.RunType, ctx *EmitContext) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	if reflection.FamilyOf(resolved.Kind) == reflection.FamilyAtomic {
		return RTCode{Code: "", Type: CodeE}
	}
	v := ctx.Vλl
	if isRestTupleMember(rt) {
		iVar := ctx.NextLocalVar("i")
		resVar := ctx.NextLocalVar("res")
		ctx.SetChildAccessor(v + "[" + iVar + "]")
		childRT := ctx.CompileChild(rt.Child, CodeE)
		ctx.SetChildAccessor("")
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code == "" {
			return RTCode{Code: "", Type: CodeE}
		}
		body := "for (let " + iVar + " = " + positionStr(rt) + "; " + iVar + " < " + v + ".length; " + iVar + "++) {" +
			"const " + resVar + " = " + childRT.Code + ";" +
			"if (" + resVar + ") return true;}return false"
		return RTCode{Code: body, Type: CodeRB}
	}
	idxLit := positionStr(rt)
	accessor := v + "[" + idxLit + "]"
	ctx.SetChildAccessor(accessor)
	childRT := ctx.CompileChild(rt.Child, CodeE)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeE}
	}
	if rt.Optional {
		return RTCode{Code: "(" + propertyPresenceTest(rt, v, accessor) + " && (" + childRT.Code + "))", Type: CodeE}
	}
	return RTCode{Code: childRT.Code, Type: CodeE}
}

// emitIndexSignatureHasUnknownKeys emits nothing when the value type is atomic AND there is no key pattern: every key is "known".
func emitIndexSignatureHasUnknownKeys(rt *reflection.RunType, ctx *EmitContext) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	// Symbol-keyed sigs are skipped from RT compilation; empty CodeE drops this sig from the parent's OR chain.
	if isSymbolKeyedIndexSig(rt, ctx) {
		return RTCode{Code: "", Type: CodeE}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	if isFunctionLikeKind(resolved.Kind) {
		return RTCode{Code: "", Type: CodeE}
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
	// Atomic value and no key pattern: every key is "known" already.
	if reflection.FamilyOf(resolved.Kind) == reflection.FamilyAtomic && keyRegexVar == "" {
		return RTCode{Code: "", Type: CodeE}
	}
	v := ctx.Vλl
	prop := ctx.NextLocalVar("k")
	ctx.SetChildAccessor(v + "[" + prop + "]")
	childRT := ctx.CompileChild(rt.Child, CodeE)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	patternCheck := ""
	if keyRegexVar != "" {
		patternCheck = "if (!" + keyRegexVar + ".test(" + prop + ")) return true;"
	}
	childCheck := ""
	if childRT.Code != "" {
		resVar := ctx.NextLocalVar("res")
		childCheck = "const " + resVar + " = " + childRT.Code + ";if (" + resVar + ") return true;"
	}
	if patternCheck == "" && childCheck == "" {
		return RTCode{Code: "", Type: CodeE}
	}
	body := "for (const " + prop + " in " + v + ") {" + patternCheck + childCheck + "}return false"
	return RTCode{Code: body, Type: CodeRB}
}

// emitUnionHasUnknownKeys walks the merged allowlist through the shared helper, yielding true on the first undeclared key.
// A per-member dispatch cannot do this: each member's own emit runs against the whole value whatever arm matched at runtime.
func emitUnionHasUnknownKeys(rt *reflection.RunType, ctx *EmitContext) RTCode {
	return emitUnionUnknownKeysMerged(rt, ctx, UnknownKeysOpts{
		Snippet: func(_ *EmitContext, _, _ string) string {
			return "return true"
		},
		CodeShape: CodeE,
	})
}

// emitNativeIterableHasUnknownKeys runs the wrapped child's check per Map/Set entry, returning true on the first hit.
// When every wrapped child is a noop (Set<string>, Map<string, number>) the whole iteration is elided.
// Accessors follow the prepare/restore convention: for a Set the loop binding IS the element, for a Map it is the
// `[key, value]` tuple, so `e0[0]` is the key and `e0[1]` the value.
func emitNativeIterableHasUnknownKeys(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	isMap := rt.SubKind == reflection.SubKindMap
	ctorName := "Map"
	if !isMap {
		ctorName = "Set"
	}

	var innerTypes []*reflection.RunType
	if isMap {
		keyType, valueType := mapKeyValueTypes(rt, ctx)
		innerTypes = []*reflection.RunType{keyType, valueType}
	} else {
		innerTypes = []*reflection.RunType{setItemType(rt, ctx)}
	}

	entryVar := ctx.NextLocalVar("e")
	var childChecks []string
	for i, innerType := range innerTypes {
		if innerType == nil {
			continue
		}
		accessor := entryVar
		if isMap {
			accessor = entryVar + "[" + strconv.Itoa(i) + "]"
		}
		ctx.SetChildAccessor(accessor)
		childRT := ctx.CompileChild(innerType, CodeE)
		ctx.SetChildAccessor("")
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code != "" {
			childChecks = append(childChecks, "if ("+childRT.Code+") return true;")
		}
	}

	if len(childChecks) == 0 {
		return RTCode{Code: "", Type: CodeE}
	}

	body := "if (!(" + v + " instanceof " + ctorName + ")) return false;" +
		"for (const " + entryVar + " of " + v + ") {" +
		strings.Join(childChecks, "") +
		"} return false"
	return RTCode{Code: body, Type: CodeRB}
}
