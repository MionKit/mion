package typefunctions

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// Recursion arms of the unknownKeysToUndefined family and its wire twin: at a property, array, tupleMember or
// native-iterable position they only recurse into children, the per-key snippet being the index-signature arm's job.

func emitPropertyUnknownKeys(rt *reflection.RunType, ctx *EmitContext) RTCode {
	if rt.Child == nil {
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
	if resolved.IsStatic {
		return RTCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	accessor := propertyAccessor(v, rt.Name, rt.IsSafeName)
	ctx.SetChildAccessor(accessor)
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	if rt.Optional {
		return RTCode{Code: "if (" + propertyPresenceTest(rt, v, accessor) + ") {" + childRT.Code + "}", Type: CodeS}
	}
	return childRT
}

func emitArrayUnknownKeys(rt *reflection.RunType, ctx *EmitContext) RTCode {
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
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	// `v.length` throws on null/undefined and walks a string's characters, so the descent runs only over a real array.
	body := guardStatement(unknownKeysArrayGuard(v),
		"for (let "+iVar+" = 0; "+iVar+" < "+v+".length; "+iVar+"++) {"+childRT.Code+"}")
	return RTCode{Code: body, Type: CodeS}
}

func emitTupleMemberUnknownKeys(rt *reflection.RunType, ctx *EmitContext) RTCode {
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
		childRT := ctx.CompileChild(rt.Child, CodeS)
		ctx.SetChildAccessor("")
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
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	if rt.Optional {
		return RTCode{Code: "if (" + propertyPresenceTest(rt, v, accessor) + ") {" + childRT.Code + "}", Type: CodeS}
	}
	return childRT
}

// emitNativeIterableUnknownKeys applies the child sweep to each Map entry or Set item.
// `wire` selects the shape guard: a live instance, or the JSON wire form, where a Map is an array of `[key, value]`
// pairs and a Set an array of items, so the same `for…of` and `e[0]` / `e[1]` accessors read both.
func emitNativeIterableUnknownKeys(rt *reflection.RunType, ctx *EmitContext, v string, wire bool) RTCode {
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

	guard := "if (!(" + v + " instanceof " + ctorName + ")) return;"
	if wire {
		guard = "if (!Array.isArray(" + v + ")) return;"
	}
	body := guard +
		"for (const " + entryVar + " of " + v + ") {" +
		strings.Join(childCodes, ";") +
		"}"
	return RTCode{Code: body, Type: CodeS}
}
