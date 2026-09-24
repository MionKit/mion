package typefunctions

import (
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// FormatTransformEmitter implements the value-transform family behind createFormatTransformFn<T>: it applies
// a format's value mutation wherever a TypeFormat brand specifies one (trim / lowercase / uppercase /
// capitalize, domain / ip / url lowercasing), in place. IDENTITY is the default for every non-transforming
// kind, and there are no unsupported kinds, so a type with no transforming format compiles to `return v`.
// Scope: string-format transforms at any position, plus object / array / tuple recursion to reach them.
// A union arm, Map, Set or Date passes through unchanged.
type FormatTransformEmitter struct{}

// Args mirrors validate / prepareForJson: a single value arg, mutated and returned.
func (FormatTransformEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports is true for (almost) every kind, identity being a valid transform, so createFormatTransformFn<T>
// still resolves to a real fn and a parent dep-call still hits a live factory.
func (FormatTransformEmitter) Supports(rt *reflection.RunType) bool {
	if rt == nil {
		return false
	}
	if rt.Kind == reflection.KindArray {
		return rt.Child != nil
	}
	return true
}

func (FormatTransformEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// IsNoopType implements the walker's dispatch-time noop gate: identity being this family's default, without
// it every NAMED compound child was dep-called into an entry that itself rendered as the noop short-form,
// chaining `v.inner = <fmtHash>_<id>.fn(v.inner)` calls that do nothing. isNoopForFormatTransform proves no
// value-transforming format and no fmt override is reachable, so parents compose around such a child.
func (FormatTransformEmitter) IsNoopType(rt *reflection.RunType, ctx *EmitContext) bool {
	return isNoopForFormatTransform(rt, ctx)
}

// ReturnName is `v`: format mutates the input value, or rebinds it at a transforming leaf, and returns it.
func (FormatTransformEmitter) ReturnName() string {
	return "v"
}

// Emit — only format-branded strings transform, collections recurse to reach them, and everything else is
// identity (empty CodeS, collapsed to `return v` by Finalize).
func (FormatTransformEmitter) Emit(rt *reflection.RunType, ctx *EmitContext, _ CodeType) RTCode {
	if rt == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	switch rt.Kind {
	case reflection.KindString:
		if expr := nodeFormatTransform(rt, v); expr != "" {
			return RTCode{Code: v + " = " + expr, Type: CodeE}
		}
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindObjectLiteral:
		return emitObjectFormat(rt, ctx, v)

	case reflection.KindClass:
		// Date / Map / Set / native classes carry no string-format children to transform.
		if rt.SubKind == reflection.SubKindNone {
			return emitObjectFormat(rt, ctx, v)
		}
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindProperty, reflection.KindPropertySignature:
		return emitPropertyFormat(rt, ctx, v)

	case reflection.KindArray:
		return emitArrayFormat(rt, ctx, v)

	case reflection.KindTuple:
		return emitTupleFormat(rt, ctx, v)

	case reflection.KindTupleMember:
		return emitTupleMemberFormat(rt, ctx, v)
	}
	// Every other kind (number / boolean / union / intersection / Map / Set / Date / function / …) is identity.
	return RTCode{Code: "", Type: CodeS}
}

// nodeFormatTransform returns rt's transform expression applied to `v` (`v.trim().toLowerCase()`), through
// the optional formats.FormatTransformer capability, or "" when the format specifies no transform.
func nodeFormatTransform(rt *reflection.RunType, v string) string {
	if rt == nil || rt.FormatAnnotation == nil {
		return ""
	}
	emitter, ok := formats.LookupForRunType(rt)
	if !ok {
		return ""
	}
	transformer, ok := emitter.(formats.FormatTransformer)
	if !ok {
		return ""
	}
	// A nil ctx is safe: these transformers depend only on their params, never on the EmitContext.
	return transformer.EmitFormatTransform(rt.FormatAnnotation, v, nil)
}

// emitObjectFormat joins the transform statements of each non-function, non-static child property.
func emitObjectFormat(rt *reflection.RunType, ctx *EmitContext, _ string) RTCode {
	var parts []string
	for _, child := range objectMembers(rt) {
		resolved := ctx.ResolveRef(child)
		if resolved == nil || resolved.IsStatic || isFunctionLikeKind(resolved.Kind) {
			continue
		}
		childRT := ctx.CompileChild(child, CodeS)
		if childRT.Code != "" {
			parts = append(parts, childRT.Code)
		}
	}
	if len(parts) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	return RTCode{Code: strings.Join(parts, ";"), Type: CodeS}
}

// emitPropertyFormat sets the property accessor, recurses, and guards an optional property on undefined.
func emitPropertyFormat(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil || isFunctionLikeKind(resolved.Kind) {
		return RTCode{Code: "", Type: CodeS}
	}
	accessor := propertyAccessor(v, rt.Name, rt.IsSafeName)
	ctx.SetChildAccessor(accessor)
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	if rt.Optional {
		return RTCode{Code: "if (" + propertyPresenceTest(rt, v, accessor) + ") {" + childRT.Code + "}", Type: CodeS}
	}
	return childRT
}

// emitArrayFormat loops `v[i]` and applies the element transform; empty child code collapses the loop away.
func emitArrayFormat(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	iVar := ctx.NextLocalVar("i")
	ctx.SetChildAccessor(v + "[" + iVar + "]")
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	body := "for (let " + iVar + " = 0; " + iVar + " < " + v + ".length; " + iVar + "++) {" + childRT.Code + "}"
	return RTCode{Code: body, Type: CodeS}
}

// emitTupleFormat recurses each tuple member, joining the transforms.
func emitTupleFormat(rt *reflection.RunType, ctx *EmitContext, _ string) RTCode {
	var parts []string
	for _, child := range rt.Children {
		childRT := ctx.CompileChild(child, CodeS)
		if childRT.Code != "" {
			parts = append(parts, childRT.Code)
		}
	}
	if len(parts) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	return RTCode{Code: strings.Join(parts, ";"), Type: CodeS}
}

// emitTupleMemberFormat sets the positional accessor `v[i]`, or a rest loop, and applies the transform.
func emitTupleMemberFormat(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if resolved := ctx.ResolveRef(rt.Child); resolved == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if isRestTupleMember(rt) {
		iVar := ctx.NextLocalVar("i")
		ctx.SetChildAccessor(v + "[" + iVar + "]")
		childRT := ctx.CompileChild(rt.Child, CodeS)
		ctx.SetChildAccessor("")
		if childRT.Code == "" {
			return RTCode{Code: "", Type: CodeS}
		}
		body := "for (let " + iVar + " = " + positionStr(rt) + "; " + iVar + " < " + v + ".length; " + iVar + "++) {" + childRT.Code + "}"
		return RTCode{Code: body, Type: CodeS}
	}
	accessor := v + "[" + positionStr(rt) + "]"
	ctx.SetChildAccessor(accessor)
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	if rt.Optional {
		return RTCode{Code: "if (" + accessor + " !== undefined) {" + childRT.Code + "}", Type: CodeS}
	}
	return childRT
}

// EmitDependencyCall mirrors PrepareForJsonEmitter: the inner factory rebinds its local `v`, so the caller
// captures the return. Self-recursive calls drop `.fn`.
func (FormatTransformEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	return ctx.emitDepCall(childID, ctx.Vλl, ctx.Vλl)
}

// Finalize collapses an identity body to `return v` + isNoop, so the renderer emits the short-form noop init
// line whose JS-side identity fn is `(v) => v`.
func (FormatTransformEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "return v" {
		return "return v", true
	}
	return code, false
}
