package typefunctions

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// Recursion arms shared by the StripUnknownKeys and UnknownKeysToUndefined
// families. Their property / array / tupleMember / native-iterable handling is
// byte-identical: both just recurse into children and emit no per-key snippet
// at these positions (that's the index-signature arm's job). The
// UnknownKeyErrors family threads path-literals and keeps its own copies; the
// uku tuple arm is a documented no-op and stays in its own file.

func emitPropertyUnknownKeys(rt *reflection.RunType, ctx *EmitContext, trackPath bool) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if isFunctionLikeKind(resolved.Kind) {
		return RTCode{Code: "", Type: CodeS}
	}
	if resolved.IsStatic {
		return RTCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	accessor := propertyAccessor(v, rt.Name, rt.IsSafeName)
	ctx.SetChildAccessor(accessor)
	if trackPath {
		ctx.SetChildPathLiteral(quoteJS(rt.Name))
	}
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if trackPath {
		ctx.SetChildPathLiteral("")
	}
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	// Wrap optional properties in a defined-check so the recursion only
	// runs on present values (matches the per-property strip semantics).
	if rt.Optional {
		return RTCode{Code: "if (" + accessor + " !== undefined) {" + childRT.Code + "}", Type: CodeS}
	}
	return childRT
}

func emitArrayUnknownKeys(rt *reflection.RunType, ctx *EmitContext, trackPath bool) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if reflection.FamilyOf(resolved.Kind) == reflection.FamilyAtomic {
		return RTCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	iVar := ctx.NextLocalVar("i")
	ctx.SetChildAccessor(v + "[" + iVar + "]")
	if trackPath {
		ctx.SetChildPathLiteral(iVar)
	}
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if trackPath {
		ctx.SetChildPathLiteral("")
	}
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	// `v.length` throws on null/undefined and walks a string's characters,
	// so the element descent runs only over a real array.
	body := guardStatement(unknownKeysArrayGuard(v),
		"for (let "+iVar+" = 0; "+iVar+" < "+v+".length; "+iVar+"++) {"+childRT.Code+"}")
	return RTCode{Code: body, Type: CodeS}
}

func emitTupleMemberUnknownKeys(rt *reflection.RunType, ctx *EmitContext, trackPath bool) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if reflection.FamilyOf(resolved.Kind) == reflection.FamilyAtomic {
		return RTCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	if isRestTupleMember(rt) {
		iVar := ctx.NextLocalVar("i")
		ctx.SetChildAccessor(v + "[" + iVar + "]")
		if trackPath {
			ctx.SetChildPathLiteral(iVar)
		}
		childRT := ctx.CompileChild(rt.Child, CodeS)
		ctx.SetChildAccessor("")
		if trackPath {
			ctx.SetChildPathLiteral("")
		}
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code == "" {
			return RTCode{Code: "", Type: CodeS}
		}
		body := "for (let " + iVar + " = " + positionStr(rt) + "; " + iVar + " < " + v + ".length; " + iVar + "++) {" + childRT.Code + "}"
		return RTCode{Code: body, Type: CodeS}
	}
	idxLit := positionStr(rt)
	accessor := v + "[" + idxLit + "]"
	ctx.SetChildAccessor(accessor)
	if trackPath {
		ctx.SetChildPathLiteral(idxLit)
	}
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if trackPath {
		ctx.SetChildPathLiteral("")
	}
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	if rt.Optional {
		return RTCode{Code: "if (" + accessor + " !== undefined) {" + childRT.Code + "}", Type: CodeS}
	}
	return childRT
}

func emitNativeIterableUnknownKeys(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	isMap := rt.SubKind == reflection.SubKindMap
	ctorName := "Map"
	if !isMap {
		ctorName = "Set"
	}

	innerTypes := iterableInnerTypes(rt, ctx)

	entryVar := ctx.NextLocalVar("e")
	var childCodes []string
	for i, innerType := range innerTypes {
		if innerType == nil {
			continue
		}
		accessor := entryVar
		if isMap {
			accessor = entryVar + "[" + strconv.Itoa(i) + "]"
		}
		ctx.SetChildAccessor(accessor)
		childRT := ctx.CompileChild(innerType, CodeS)
		ctx.SetChildAccessor("")
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code != "" {
			childCodes = append(childCodes, childRT.Code)
		}
	}

	if len(childCodes) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}

	body := "if (!(" + v + " instanceof " + ctorName + ")) return;" +
		"for (const " + entryVar + " of " + v + ") {" +
		strings.Join(childCodes, ";") +
		"}"
	return RTCode{Code: body, Type: CodeS}
}
