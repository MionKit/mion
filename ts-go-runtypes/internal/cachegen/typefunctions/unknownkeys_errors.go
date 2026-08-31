package typefunctions

import (
	"strings"

	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// UnknownKeyErrorsEmitter implements the `unknownKeyErrors` rt
// function — accumulator that records one RTValidationError of expected
// `'never'` per unknown key. Ported from the reference emitUnknownKeyErrors.
//
// Arg shape mirrors validationErrors: (v, pth=[], er=[]). Returns `er`.
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

// callUnknownKeyErr builds the JS call to pf_newRunTypeErr that
// appends a 'never' error for an unknown key. `extra` is the key
// variable (since the key is a runtime value, not a static name).
func callUnknownKeyErr(ctx *EmitContext, extra string) string {
	key := ctx.UsePureFn(corePureFnNamespace, "newRunTypeErr", validationErrorsPureFnFilePath)
	pthArg := ctx.ArgName("pλth")
	errArg := ctx.ArgName("εrr")
	args := []string{pthArg, errArg, quoteJS("never")}
	if path := ctx.AccessPathLiteral(extra); path != "" {
		args = append(args, path)
	}
	return key + "(" + strings.Join(args, ",") + ")"
}

// emitParentUnknownKeyErrors emits the PARENT-level unknown-key reporting for an
// object node: collect the undeclared keys, then push one
// `{path, expected: 'never'}` per key. Returns "" when the node needs none — an
// index signature makes every matching key declared, and a shape with no declared
// names has nothing to compare against.
//
// Shared by the standalone `unknownKeyErrors` family and the FUSED
// `validationErrorsStrict` family, so the two report identical entries for the
// same value. Callers own the object guard: both invoke this only where the value
// is already known to be a non-null object, hence keepObjectCheck=false.
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

// emitObjectUnknownKeyErrors ports
// InterfaceRunType.emitUnknownKeyErrors (interface.ts:157-172).
func emitObjectUnknownKeyErrors(rt *reflection.RunType, ctx *EmitContext) RTCode {
	parentCode := emitParentUnknownKeyErrors(rt, ctx)
	childrenCode := unknownKeysChildrenCode(rt, ctx)
	combined := joinSemicolons(parentCode, childrenCode)
	if combined == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	// Nothing above this point asserts `v` is an object, and both halves of
	// the body assume it is: the parent scan walks `for (const k in v)` and
	// the child descent reads `v.address`. See unknownKeysObjectGuard.
	body := guardStatement(unknownKeysObjectGuard(ctx.Vλl), combined)
	return RTCode{Code: body, Type: CodeS}
}

// emitIndexSignatureUnknownKeyErrors ports
// IndexSignatureRunType.emitUnknownKeyErrors (indexProperty.ts:122-132).
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

// emitMapUnknownKeyErrors mirrors
// IterableRunType.emitUnknownKeyErrors (nodes/native/Iterable.ts:105-120).
// For each entry, sets the key/value accessor and a `{key, failed: 'mapKey'
// | 'mapValue'}` path segment (where `key` is the entry's iteration index)
// before recursing into the wrapped child's unknownKeyErrors emit. The
// child's emit (object/property/etc) emits its own per-error
// `pf_newRunTypeErr(pth, er, 'never', [...static path..., extra])`.
//
// When every wrapped child compiles to a noop (atomic Map<string,
// number>), the loop body is empty so we elide the iteration entirely.
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
	// A positive wrap, not `if (!(v instanceof Map)) return;`: this body is
	// inlined into the parent closure, so a bare return abandons the whole
	// walk and hands back `undefined` where the contract promises the errors
	// array.
	body := guardStatement(v+" instanceof Map", inner.String())
	return RTCode{Code: body, Type: CodeS}
}

// emitSetUnknownKeyErrors mirrors the same Iterable.ts emit on the Set
// side. Path segment is {key:i0, failed:'setKey'} — `key` is the loop
// index (the item value is data, not a serialisable address), so the
// failing item is still locatable for an unordered Set.
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
