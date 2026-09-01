package typefunctions

import (
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// FormatTransformEmitter implements the `format` rt function — the value-transform
// family behind createFormatTransformFn<T>. It walks the type and applies a
// format's value mutation wherever a TypeFormat brand specifies one
// (string transforms like trim / lowercase / uppercase / capitalize;
// domain / ip / url lowercasing), rebuilding the surrounding value in
// place. IDENTITY is the default for every non-transforming kind, so a
// type with no transforming format compiles to a noop (`return v`).
//
// Structurally a sibling of PrepareForJsonEmitter (single `v` arg,
// identity noop, collection recursion) but much simpler: the only
// non-identity leaf is a format-branded string, and there are no
// unsupported kinds — a value the transform doesn't touch passes through.
//
// MVP scope: string-format transforms at any position + object / array /
// tuple recursion to reach them. Union / Map / Set / Date / etc. pass
// through unchanged (transforms inside a union arm are a follow-up).
type FormatTransformEmitter struct{}

// Args mirrors validate / prepareForJson — single value arg, mutated and
// returned.
func (FormatTransformEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports is true for (almost) every kind: identity is always a valid
// transform, so the renderer emits a — usually noop — entry per runtype.
// That keeps createFormatTransformFn<T> resolving to a real fn and parent dep-calls
// hitting a live factory, exactly like the JSON-transform families.
func (FormatTransformEmitter) Supports(rt *reflection.RunType) bool {
	if rt == nil {
		return false
	}
	if rt.Kind == reflection.KindArray {
		return rt.Child != nil
	}
	return true
}

// AnyFormatTransformSupported reports whether at least one runtype in the slice
// carries a VALUE-TRANSFORMING format. Unlike Supports (true for
// everything, since identity is valid), this gates the resolver's
// AddedFormatTransform HMR signal so the format cache is only invalidated for
// schemas that actually use a transform.
func AnyFormatTransformSupported(runTypes []*reflection.RunType) bool {
	for _, rt := range runTypes {
		if nodeFormatTransform(rt, "v") != "" {
			return true
		}
	}
	return false
}

// IsRTInlined delegates to the shared heuristic — same as every other
// rt fn.
func (FormatTransformEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// IsNoopType implements the walker's dispatch-time noop gate: identity is
// this family's default, so without it every NAMED compound child was
// dep-called into an entry that itself rendered as the noop short-form —
// `v.inner = <fmtHash>_<id>.fn(v.inner)` chains doing nothing. The predicate
// (noop_types.go isNoopForFormatTransform) proves "no value-transforming
// format and no fmt override reachable", letting parents compose around such
// children and collapse to the short form themselves.
func (FormatTransformEmitter) IsNoopType(rt *reflection.RunType, ctx *EmitContext) bool {
	return isNoopForFormatTransform(rt, ctx)
}

// NoopChildComposesAround — a subtree with no transform mutates nothing; empty code composes correctly.
func (FormatTransformEmitter) NoopChildComposesAround() {}

// ReturnName is `v` — format mutates the input value (or rebinds via
// `v = …` at a transforming leaf) and returns it.
func (FormatTransformEmitter) ReturnName() string {
	return "v"
}

// Emit dispatches the per-kind switch. Only format-branded strings
// transform; collections recurse to reach them; everything else is
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
		// User classes recurse like objects; Date / Map / Set / native
		// classes carry no string-format children to transform.
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
	// Every other kind (number / boolean / union / intersection / Map /
	// Set / Date / function / …) is identity for the MVP.
	return RTCode{Code: "", Type: CodeS}
}

// nodeFormatTransform returns the JS transform expression for rt's
// format applied to `v` (e.g. `v.trim().toLowerCase()`), or "" when rt
// carries no format or its format specifies no transform (uuid / date /
// length-only stringFormat / …). Dispatches through the optional
// formats.FormatTransformer capability.
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
	// The string-format / domain / ip / url transformers don't read the
	// EmitContext (their transform depends only on params), so a nil ctx
	// is safe here and at the AnyFormatTransformSupported scan site.
	return transformer.EmitFormatTransform(rt.FormatAnnotation, v, nil)
}

// emitObjectFormat recurses each non-function, non-static child property
// and joins the transform statements. Empty when nothing transforms.
func emitObjectFormat(rt *reflection.RunType, ctx *EmitContext, _ string) RTCode {
	var parts []string
	for _, child := range rt.Children {
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

// emitPropertyFormat sets the property accessor, recurses, and wraps the
// undefined-guard for optional properties.
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
		return RTCode{Code: "if (" + accessor + " !== undefined) {" + childRT.Code + "}", Type: CodeS}
	}
	return childRT
}

// emitArrayFormat loops the element accessor `v[i]` and applies the
// element transform. Empty child code collapses the loop to a noop.
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

// emitTupleMemberFormat sets the positional accessor `v[i]` (or a rest
// loop) and applies the member transform.
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

// EmitDependencyCall mirrors PrepareForJsonEmitter — the inner factory
// mutates / rebinds its local `v`, so the caller captures the return:
// `<vλl> = <childHash>.fn(<vλl>)`. Self-recursive calls drop `.fn`.
func (FormatTransformEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	return ctx.emitDepCall(childID, ctx.Vλl, ctx.Vλl)
}

// Finalize collapses an empty / identity body to `return v` + isNoop —
// the renderer then emits the short-form noop init line whose JS-side
// identity fn is `(v) => v`.
func (FormatTransformEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "return v" {
		return "return v", true
	}
	return code, false
}
