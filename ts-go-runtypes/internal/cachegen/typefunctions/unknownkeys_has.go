package typefunctions

import (
	"strconv"
	"strings"

	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// HasUnknownKeysEmitter implements the `hasUnknownKeys` rt function —
// a boolean predicate that returns true if the value (or any nested
// child) carries property keys not declared in the schema. Ported from
// the emitHasUnknownKeys methods on InterfaceRunType, MemberRunType,
// IterableRunType, etc.
//
// Arg shape mirrors the `rtArgsWithOptions` (constants.functions.ts:49):
// the function takes (v, opts) where opts is a runtime options bag
// carrying `checkNonRTProps` — when true, the keys-list against which
// unknown is decided expands from RT children to ALL children (including
// function-typed / static / non-serialisable ones that the schema lists
// but the RT skipped). Default false: any key not in the RT-children
// list is unknown.
type HasUnknownKeysEmitter struct{}

// Args mirrors rtArgsWithOptions = {vλl: 'v', θpts: 'opts'}.
// `opts` defaults to `{}` so callers can invoke `huk(v)` without
// explicitly passing the options bag.
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

// PropagatesVariant — `runsAfterValidation` is a claim about the VALUE, not
// about the root call: if `v` passed validate then so did `v.address`, at every
// depth. So the option rides the whole subtree (see VariantPropagator) and a
// NAMED nested type gets the same key-count compare an inline one does. Without
// it the named child dep-calls the plain entry and silently keeps the scan.
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

// ReturnName is `v` — does hasUnknownKeys return the value? No:
// `returnName: rtArgsWithOptions.vλl` (constants.functions.ts:153)
// means the SOURCE-LEVEL "what's returned by an empty body" is `v`,
// but the BODY itself returns booleans. The Finalize for this
// family rewrites an empty body to `return false` — and the noop
// fast path on the JS side is `() => false`. We honour ReturnName
// as `v` for the walker's statement-shape return wrap, then
// Finalize translates `return v` → `return false`.
func (HasUnknownKeysEmitter) ReturnName() string {
	return "v"
}

// Emit is the per-kind switch. Phase 0 returns empty body for every
// supported kind so the cache module renders end-to-end. Phase 1
// implements the object/interface logic.
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
	// All atomic / non-composite kinds — noop.
	return RTCode{Code: "", Type: CodeS}
}

// EmitDependencyCall — composite parents may need to invoke a child's
// hasUnknownKeys factory. The call shape mirrors the reference: pass v + opts
// through unchanged.
func (HasUnknownKeysEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	optsArg := ctx.ArgName("θpts")
	return ctx.emitDepCall(childID, ctx.Vλl+","+optsArg, "")
}

// Finalize matches the handleFunctionReturn for hasUnknownKeys:
// empty body → `return false`, noop=true. Other shapes wrap to
// `return <expr>` per the walker's CodeE → "return <expr>" handling.
func (HasUnknownKeysEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	trimmed := trimWhitespace(code)
	if trimmed == "" || trimmed == "return v" {
		return "return false", true
	}
	return code, false
}

// emitObjectHasUnknownKeys ports
// InterfaceRunType.emitHasUnknownKeys (interface.ts:147-156). Two
// pieces combined with `||`:
//
//  1. Parent check: callCheckUnknownProperties evaluates whether THIS
//     object has any unknown keys (returns a JS expression). Suppressed
//     when an index-signature child is present (any key matching the
//     index pattern is "known").
//  2. Children check: each non-skip property's own hasUnknownKeys
//     (recursed via CompileChild). Atomic-typed children contribute
//     nothing.
//
// Phase 1 placeholder — full implementation follows.
func emitObjectHasUnknownKeys(rt *reflection.RunType, ctx *EmitContext) RTCode {
	return emitInterfaceHasUnknownKeys(rt, ctx)
}

func emitInterfaceHasUnknownKeys(rt *reflection.RunType, ctx *EmitContext) RTCode {
	parts, hasIndex := collectObjectHasUnknownKeysChildren(rt, ctx)
	parentExpr := ""
	if !hasIndex {
		// runsAfterValidation variant: the caller asserts the value already
		// PASSED validate, so (a) every object position is a non-null object
		// (guards dropped) and (b) on an all-required shape every declared
		// prop is present — a key-count compare then exactly separates clean
		// from dirty, replacing the O(props x keys) hUKFA scan (measured 2.6x
		// on a 7-prop shape, 13x at 30 props, Node 26). Ineligible shapes
		// (optional props, index sigs, non-RT children) keep the scan,
		// guardless. The assertion is about the VALUE, so it reaches this node
		// at every depth: PropagatesVariant renders the whole subtree under the
		// variant, which is what puts a NAMED nested type on the same footing
		// as an inline one.
		if ctx.HasVariantOption("runsAfterValidation") {
			if n, ok := countFastPathN(rt, ctx); ok {
				parentExpr = emitCountKeysCheck(ctx, ctx.Vλl, n)
			} else {
				parentExpr = callCheckUnknownPropertiesForHas(rt, ctx, false, false)
			}
			// The ONE half of the shape guard the variant must keep: passing
			// validate does NOT prove the value is not an array, because an
			// array can satisfy an object shape (`[1, 2]` is a
			// `{length: number}`). See arraySkipsHasKeyCheck — the count
			// compare answers WRONG on one, since `length` is not enumerable.
			if parentExpr != "" {
				parentExpr = arraySkipsHasKeyCheck(ctx.Vλl, parentExpr)
			}
		} else {
			// The shape guard now sits around the WHOLE chain below, so the
			// parent scan no longer carries its own copy.
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
	// The `||` chain does NOT short-circuit away the child descent when the
	// parent scan says false, so `v.address` still gets read — against null
	// that throws. Under runsAfterValidation the caller has already promised
	// a validated value, so the `typeof` / `!== null` halves go; the array
	// half stays, on the parent check only (validate admits an array here).
	// The child descent still runs on an array and stays right: a value that
	// passed validate carries every declared property whatever its container
	// is, so `v.address` reads the object the child arm expects.
	if ctx.HasVariantOption("runsAfterValidation") {
		return RTCode{Code: chain, Type: CodeE}
	}
	return RTCode{Code: "(" + unknownKeysObjectGuard(ctx.Vλl) + " && " + chain + ")", Type: CodeE}
}

// emitPropertyHasUnknownKeys handles KindProperty / KindPropertySignature.
// Sets the child accessor (`v.<name>`) and recurses. Optional properties
// guard the descent with `<accessor> !== undefined ? <childCode> : false`.
func emitPropertyHasUnknownKeys(rt *reflection.RunType, ctx *EmitContext) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
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
		return RTCode{Code: "(" + accessor + " !== undefined && (" + childRT.Code + "))", Type: CodeE}
	}
	return RTCode{Code: childRT.Code, Type: CodeE}
}

// emitArrayHasUnknownKeys ports
// ArrayRunType.emitHasUnknownKeys (array.ts:94-114). Atomic element →
// noop. Otherwise iterate elements; if any reports true, return true.
//
// Returns CodeRB because the body is a `for + return false` block.
func emitArrayHasUnknownKeys(rt *reflection.RunType, ctx *EmitContext) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	// Reference: `if (this.getMemberType().getFamily() === 'A') return undefined`
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

// emitTupleHasUnknownKeys mirrors CollectionRunType.emitHasUnknownKeys
// for tuples — each member's own emit, OR-joined.
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
	// Member accessors are `v[0]`, `v[1]`, … — unreadable on null/undefined.
	return RTCode{Code: "(" + unknownKeysArrayGuard(ctx.Vλl) + " && " + joinOr(parts) + ")", Type: CodeE}
}

// emitTupleMemberHasUnknownKeys: descend into the wrapped child. Rest
// members iterate from the position; regular members use a single
// element accessor. Atomic-typed wrapped types contribute nothing.
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
		return RTCode{Code: "(" + accessor + " !== undefined && (" + childRT.Code + "))", Type: CodeE}
	}
	return RTCode{Code: childRT.Code, Type: CodeE}
}

// emitIndexSignatureHasUnknownKeys ports
// IndexSignatureRunType.emitHasUnknownKeys (indexProperty.ts:103-121).
// When the value type is atomic AND there's no key pattern, every key
// is "known" — emit nothing. Otherwise iterate `for (const k in v)`,
// checking the pattern (if any) and recursing into the value.
func emitIndexSignatureHasUnknownKeys(rt *reflection.RunType, ctx *EmitContext) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	// Symbol-keyed sigs are skipped from RT compilation per
	// IndexSignatureRunType.skipRT (indexProperty.ts:30-36). Empty
	// CodeE drops the sig from the parent's OR chain; if this is the
	// root, Finalize collapses the empty body to `return false`.
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
	// Atomic value + no key pattern → every key is "known" already.
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

// emitUnionHasUnknownKeys — walks the merged-allowlist via the shared
// helper. Returns CodeRB wrapping the loop in an IIFE that yields
// `true` on the first undeclared key, `false` otherwise. The legacy
// per-member dispatch (CompileChild + joinOr) silently mis-reported
// hits because each member's own emit ran against the entire value
// regardless of which union arm matched at runtime.
func emitUnionHasUnknownKeys(rt *reflection.RunType, ctx *EmitContext) RTCode {
	return emitUnionUnknownKeysMerged(rt, ctx, UnknownKeysOpts{
		Snippet: func(_ *EmitContext, _, _ string) string {
			return "return true"
		},
		CodeShape: CodeE,
	})
}

// emitNativeIterableHasUnknownKeys mirrors
// IterableRunType.emitHasUnknownKeys (nodes/native/Iterable.ts:86-103).
// For each entry in the Map/Set, runs the wrapped child's
// hasUnknownKeys expression; returns true on the first hit. When every
// wrapped child compiles to a noop (e.g. Set<string>, Map<string, number>
// where neither key nor value carries an object with extras), the entire
// iteration is elided — Finalize folds the empty body into `return false`.
//
// Accessors:
//   - Set: the loop binding `e0` IS the element (no array unwrap)
//   - Map: `e0` is the `[key, value]` tuple; `e0[0]` is key, `e0[1]` is
//     value — matches the prepare/restore-side accessor convention used
//     elsewhere (MapKeyRunType / MapValueRunType useArrayAccessor).
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
