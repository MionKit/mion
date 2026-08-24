package typefunctions

import "strings"

// WrapClosure produces the outer factory function that wraps a rt
// function's inner body with its context-item prologue. Returns both
// the full declaration (used as the live `createRTFn` arg in the
// rendered cache module) and the bare body (the contents between the
// `(utl){ … }` braces — what gets stored in `RTCompiledFnData.code`
// for `new Function('utl', body)` reconstruction on the consumer side).
//
// Shape (a hoisted-declaration variant of createRTFunction.ts:47 +
// printClosure, rtFnCompiler.ts:732):
//
//	function <factoryName>(utl){
//	  <contextItem1>;
//	  <contextItem2>;
//	  …
//	  function <innerFnName>(<args>){<body>}
//	  return <innerFnName>
//	}
//
// The inner fn is a DECLARATION (hoisted into factory scope), not a
// returned named function expression: context lines may include hoisted
// context fns (Walker.createFnInContext) whose bodies self-call the inner
// fn on circular types — a named function EXPRESSION binds its own name
// only inside itself, so the old `return function <name>(…){…}` form left
// `<name>` unreachable from the prologue (ReferenceError at runtime).
//
// `'use strict';` is NOT emitted per-factory — it lives at module top
// in the rendered virtual:runtypes-validate output (see module.go's
// validateFactoryPreambleLines). Strict mode propagates lexically into
// every nested closure, so the per-factory directive would be redundant
// and inflate the wire size of every entry.
//
// `factoryName` is the outer (exported) function name — e.g.
// "get_validate_<hash>". The caller owns the prefix convention ("get_"
// disambiguates the outer factory from the inner validator;
// the same name is shared on the validator itself).
//
// `innerFnName` is the inner fn's name — the same identifier the caller
// rendered into `innerFnDeclaration` (`function <name>(<args>){<body>}`,
// produced by Walker.Compile / jsonCompositeBody); it is passed explicitly
// rather than re-parsed out of the generated text. contextLines is the
// joined context-items prologue produced by Walker.ContextLines (empty when
// there are no context items, as in the v1 KindString path).
func WrapClosure(factoryName string, innerFnName string, innerFnDeclaration string, contextLines string) (decl, body string) {
	var b strings.Builder
	if contextLines != "" {
		b.WriteString(contextLines)
		b.WriteString(";")
	}
	b.WriteString(innerFnDeclaration)
	b.WriteString("return ")
	b.WriteString(innerFnName)
	body = b.String()
	decl = "function " + factoryName + "(utl){" + body + "}"
	return decl, body
}
