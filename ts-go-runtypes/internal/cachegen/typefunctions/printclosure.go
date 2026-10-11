package typefunctions

import "strings"

// WrapClosure produces the outer factory declaration wrapping a rt function's inner body with its
// context-item prologue, plus the bare body, which is what `RTCompiledFnData.code` stores for the consumer's
// `new Function('utl', body)` reconstruction.
// The inner fn is a hoisted DECLARATION, not a returned named function expression: context lines may include
// hoisted context fns (Walker.createFnInContext) that self-call the inner fn on circular types, and a named
// function expression binds its name only inside itself (ReferenceError at runtime).
// `'use strict';` is NOT emitted per factory: it lives at module top (module.go's
// validateFactoryPreambleLines) and propagates lexically, so a per-factory copy would inflate every entry.
// factoryName and innerFnName are the caller's, which owns the naming convention; innerFnName is passed in
// rather than re-parsed out of innerFnDeclaration. contextLines is Walker.ContextLines, empty when none.
func WrapClosure(factoryName string, innerFnName string, innerFnDeclaration string, contextLines string, types ClosureTypes) (decl, body string) {
	var b strings.Builder
	if contextLines != "" {
		b.WriteString(contextLines)
		b.WriteString(";")
	}
	b.WriteString(innerFnDeclaration)
	b.WriteString("return ")
	b.WriteString(innerFnName)
	b.WriteString(types.ReturnCast)
	body = b.String()
	decl = "function " + factoryName + "(utl" + types.Utl + ")" + types.Result + "{" + body + "}"
	return decl, body
}

// ClosureTypes are the factory's TS-only annotations, tsMark spans: the `utl` parameter type and the returned fn type.
type ClosureTypes struct {
	Utl        string
	Result     string
	ReturnCast string
}
