package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// UnknownKeyErrorsEmitter implements `unknownKeyErrors`: one RTValidationError of expected `'never'` per unknown key.
// Arg shape mirrors validationErrors: (v, pth=[], er=[]), returning `er`.
type UnknownKeyErrorsEmitter struct{}

func (UnknownKeyErrorsEmitter) Args() []ArgSpec {
	return []ArgSpec{
		{Key: "vλl", Name: "v", Default: ""},
		{Key: "pλth", Name: "pth", Default: "[]"},
		{Key: "εrr", Name: "er", Default: "[]"},
	}
}

func (UnknownKeyErrorsEmitter) Supports(rt *reflection.RunType) bool {
	return unknownKeysSupports(rt)
}

func (UnknownKeyErrorsEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// IsNoopType — see isNoopForUnknownKeys (shared five-family mirror).
func (UnknownKeyErrorsEmitter) IsNoopType(rt *reflection.RunType, ctx *EmitContext) bool {
	return isNoopForUnknownKeys(rt, ctx, unknownKeyErrorsNoopSpec)
}

// NoopChildComposesAround — a child that never records an unknown-key error
// contributes nothing; empty code composes correctly.
func (UnknownKeyErrorsEmitter) NoopChildComposesAround() {}

func (UnknownKeyErrorsEmitter) ReturnName() string {
	return "er"
}

func (UnknownKeyErrorsEmitter) Emit(rt *reflection.RunType, ctx *EmitContext, _ CodeType) RTCode {
	if rt == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	switch rt.Kind {
	case reflection.KindObjectLiteral:
		return emitObjectUnknownKeyErrors(rt, ctx)
	case reflection.KindClass:
		switch rt.SubKind {
		case reflection.SubKindNone:
			return emitObjectUnknownKeyErrors(rt, ctx)
		case reflection.SubKindMap:
			return emitMapUnknownKeyErrors(rt, ctx, ctx.Vλl)
		case reflection.SubKindSet:
			return emitSetUnknownKeyErrors(rt, ctx, ctx.Vλl)
		}
		return RTCode{Code: "", Type: CodeS}
	case reflection.KindProperty, reflection.KindPropertySignature:
		return emitPropertyUnknownKeys(rt, ctx, true)
	case reflection.KindArray:
		return emitArrayUnknownKeys(rt, ctx, true)
	case reflection.KindTuple:
		return emitTupleUnknownKeysRecurse(rt, ctx)
	case reflection.KindTupleMember:
		return emitTupleMemberUnknownKeys(rt, ctx, true)
	case reflection.KindIndexSignature:
		return emitIndexSignatureUnknownKeyErrors(rt, ctx)
	case reflection.KindUnion:
		return emitUnionUnknownKeyErrors(rt, ctx)
	}
	return RTCode{Code: "", Type: CodeS}
}

func (UnknownKeyErrorsEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	return ctx.emitPathTrackedDepCall(childID)
}

func (UnknownKeyErrorsEmitter) Finalize(rawCode string) (string, bool) {
	code := normaliseWhitespace(rawCode)
	trimmed := strings.TrimSpace(code)
	if trimmed == "" {
		return "return er", true
	}
	return code, false
}

// callUnknownKeyErr appends a 'never' error for an unknown key; `extra` is the key VARIABLE, the key being a runtime value.
func callUnknownKeyErr(ctx *EmitContext, extra string) string {
	key := ctx.UsePureFn(purefnids.NewRunTypeErr)
	pthArg := ctx.ArgName("pλth")
	errArg := ctx.ArgName("εrr")
	args := []string{pthArg, errArg, quoteJS("never")}
	if path := ctx.AccessPathLiteral(extra); path != "" {
		args = append(args, path)
	}
	return key + "(" + strings.Join(args, ",") + ")"
}

// emitParentUnknownKeyErrors pushes one `{path, expected: 'never'}` per undeclared key of an object node.
// Returns "" when the node needs none: an index signature makes every matching key declared, and a shape with no
// declared names has nothing to compare against.
// Shared by the standalone `unknownKeyErrors` family and the FUSED `validationErrorsStrict` one, so the two report
// identical entries for the same value.
//
// ⚠️ CALLERS OWN THE OBJECT GUARD, for different reasons, so do not move it in here. The standalone family has nothing
// above it asserting shape, so emitObjectUnknownKeyErrors wraps this in unknownKeysObjectGuard; the fused family already
// sits inside emitObjectValidationErrors' own guard, and a second one would emit on every object node of every
// `{checkUnknowns: true}` validator. Same reasoning as `keepObjectCheck=false` on the validate side.
// Pinned by TestCheckUnknowns_DoesNotDoubleGuardObjects.
func emitParentUnknownKeyErrors(rt *reflection.RunType, ctx *EmitContext) string {
	if objectHasIndexSignatureChild(rt, ctx) {
		return ""
	}
	unknownValue := callCheckUnknownPropertiesForHas(rt, ctx, true, false)
	if unknownValue == "" {
		return ""
	}
	unknownVar := ctx.NextLocalVar("unk")
	keyVar := ctx.NextLocalVar("ky")
	return "const " + unknownVar + " = " + unknownValue + ";" +
		"if (" + unknownVar + ") {for (const " + keyVar + " of " + unknownVar + ") {" + callUnknownKeyErr(ctx, keyVar) + "}}"
}

// emitObjectUnknownKeyErrors joins this node's own key report with the descent into its children.
func emitObjectUnknownKeyErrors(rt *reflection.RunType, ctx *EmitContext) RTCode {
	parentCode := emitParentUnknownKeyErrors(rt, ctx)
	childrenCode := unknownKeysChildrenCode(rt, ctx)
	combined := joinSemicolons(parentCode, childrenCode)
	if combined == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	// Nothing above asserts `v` is an object, and both halves assume it: the scan does `for (const k in v)`, the descent reads `v.address`.
	body := guardStatement(unknownKeysObjectGuard(ctx.Vλl), combined)
	return RTCode{Code: body, Type: CodeS}
}

// emitIndexSignatureUnknownKeyErrors reports a key the index pattern rejects, then descends into the value.
func emitIndexSignatureUnknownKeyErrors(rt *reflection.RunType, ctx *EmitContext) RTCode {
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
	ctx.SetChildPathLiteral(prop)
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	ctx.SetChildPathLiteral("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	patternErr := ""
	if keyRegexVar != "" {
		patternErr = "if (!" + keyRegexVar + ".test(" + prop + ")) {" + callUnknownKeyErr(ctx, prop) + "; continue;}"
	}
	if patternErr == "" && childRT.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	body := "for (const " + prop + " in " + v + ") {" + patternErr + childRT.Code + "}"
	return RTCode{Code: body, Type: CodeS}
}

// emitMapUnknownKeyErrors recurses per entry under a `{key, failed: 'mapKey' | 'mapValue'}` path segment, where `key` is
// the entry's iteration index; each child emits its own error.
// When every wrapped child is a noop (Map<string, number>) the loop body is empty and the iteration is elided.
func emitMapUnknownKeyErrors(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	keyType, valueType := mapKeyValueTypes(rt, ctx)
	entryVar := ctx.NextLocalVar("entry")
	idxVar := ctx.NextLocalVar("i")
	var inner strings.Builder
	inner.WriteString("let ")
	inner.WriteString(idxVar)
	inner.WriteString(" = 0; for (const ")
	inner.WriteString(entryVar)
	inner.WriteString(" of ")
	inner.WriteString(v)
	inner.WriteString(") {")
	bodyHasContent := false
	if keyType != nil {
		ctx.SetChildAccessor(entryVar + "[0]")
		ctx.SetChildPathLiteral("{key:" + idxVar + ",failed:'mapKey'}")
		keyRT := ctx.CompileChild(keyType, CodeS)
		ctx.SetChildAccessor("")
		ctx.SetChildPathLiteral("")
		if keyRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if keyRT.Code != "" {
			inner.WriteString(keyRT.Code)
			if last := keyRT.Code[len(keyRT.Code)-1]; last != ';' && last != '}' {
				inner.WriteString(";")
			}
			bodyHasContent = true
		}
	}
	if valueType != nil {
		ctx.SetChildAccessor(entryVar + "[1]")
		ctx.SetChildPathLiteral("{key:" + idxVar + ",failed:'mapValue'}")
		valRT := ctx.CompileChild(valueType, CodeS)
		ctx.SetChildAccessor("")
		ctx.SetChildPathLiteral("")
		if valRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if valRT.Code != "" {
			inner.WriteString(valRT.Code)
			if last := valRT.Code[len(valRT.Code)-1]; last != ';' && last != '}' {
				inner.WriteString(";")
			}
			bodyHasContent = true
		}
	}
	if !bodyHasContent {
		return RTCode{Code: "", Type: CodeS}
	}
	inner.WriteString(idxVar)
	inner.WriteString("++;}")
	// A positive wrap, not an early return: this body is inlined into the parent closure, so a bare return abandons the
	// whole walk and hands back `undefined` where the contract promises the errors array.
	body := guardStatement(v+" instanceof Map", inner.String())
	return RTCode{Code: body, Type: CodeS}
}

// emitSetUnknownKeyErrors is the Set twin: the path segment keys on the loop INDEX, since the item value is data rather
// than an address, so a failing item stays locatable in an unordered Set.
func emitSetUnknownKeyErrors(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	itemType := setItemType(rt, ctx)
	if itemType == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	itemVar := ctx.NextLocalVar("item")
	idxVar := ctx.NextLocalVar("i")
	ctx.SetChildAccessor(itemVar)
	ctx.SetChildPathLiteral("{key:" + idxVar + ",failed:'setKey'}")
	itemRT := ctx.CompileChild(itemType, CodeS)
	ctx.SetChildAccessor("")
	ctx.SetChildPathLiteral("")
	if itemRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if itemRT.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	sep := ""
	if last := itemRT.Code[len(itemRT.Code)-1]; last != ';' && last != '}' {
		sep = ";"
	}
	// Positive wrap — see emitMapUnknownKeyErrors.
	body := guardStatement(v+" instanceof Set",
		"let "+idxVar+" = 0; for (const "+itemVar+" of "+v+") {"+
			itemRT.Code+sep+idxVar+"++;}")
	return RTCode{Code: body, Type: CodeS}
}

func emitUnionUnknownKeyErrors(rt *reflection.RunType, ctx *EmitContext) RTCode {
	return emitUnionUnknownKeysMerged(rt, ctx, UnknownKeysOpts{
		Snippet: func(emitCtx *EmitContext, _ string, keyVar string) string {
			return callUnknownKeyErr(emitCtx, keyVar)
		},
		CodeShape: CodeS,
	})
}
