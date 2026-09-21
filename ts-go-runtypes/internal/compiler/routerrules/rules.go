package routerrules

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// RpcErrorName is the class every declared handler error must derive from, carrying the mion brand the
// dispatcher routes on. Its base TypedError carries the brand too but has no publicMessage, no errorData
// and no status code, so it is not an answer a client can use.
const RpcErrorName = "RpcError"

// errorBaseName is the global class an arm must derive from for the rule to say anything about it.
const errorBaseName = "Error"

// checkAnnotations is `strong-typed-routes`: mion compiles the handler's DECLARED types, so an inferred
// return type leaves the build nothing to compile. It reads the AST, never inference: what matters is
// whether the annotation was WRITTEN.
func (scope *fileScope) checkAnnotations(discovered handler) []diagnostics.Diagnostic {
	fnLike := discovered.fn.FunctionLikeData()
	if fnLike == nil {
		return nil
	}
	var found []diagnostics.Diagnostic
	if fnLike.Type == nil {
		found = append(found, scope.diag(diagnostics.CodeRouteMissingReturnType, discovered.at(returnTypeSite(discovered.fn)), discovered.label))
	}
	if fnLike.Parameters == nil {
		return found
	}
	for index, paramNode := range fnLike.Parameters.Nodes {
		if index < discovered.ctxParams {
			continue // the call context never crosses the wire
		}
		if ast.GetTypeAnnotationNode(paramNode) != nil {
			continue
		}
		found = append(found, scope.diag(diagnostics.CodeRouteMissingParamType, discovered.at(paramNode), parameterName(paramNode), discovered.label))
	}
	return found
}

// returnTypeSite puts the squiggle next to the gap: the parameter list closes right where the annotation
// belongs.
func returnTypeSite(fn *ast.Node) *ast.Node {
	fnLike := fn.FunctionLikeData()
	if fnLike != nil && fnLike.Parameters != nil && len(fnLike.Parameters.Nodes) > 0 {
		return fnLike.Parameters.Nodes[len(fnLike.Parameters.Nodes)-1]
	}
	return fn
}

func parameterName(paramNode *ast.Node) string {
	if name := paramNode.Name(); name != nil {
		if text := name.Text(); text != "" {
			return text
		}
	}
	return "<destructured>"
}

// checkThrows is `no-throw-in-handlers`: a thrown error leaves the handler's signature for the undeclared
// `@thrownErrors` slot, where the client sees only its public message, while a returned one reaches the
// client typed. The walk mirrors purity.go: it descends into nested callbacks, a throw inside a `.map()`
// still escaping, and never classifies what is thrown, a class, a bare string and a rethrown `unknown`
// being the same mistake.
func (scope *fileScope) checkThrows(discovered handler) []diagnostics.Diagnostic {
	body := discovered.fn.Body()
	if body == nil {
		return nil
	}
	var found []diagnostics.Diagnostic
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		switch node.Kind {
		case ast.KindThrowStatement:
			found = append(found, scope.diag(diagnostics.CodeRouteThrowInHandler, discovered.at(node), discovered.label))
			return false
		case ast.KindTryStatement:
			// A caught throw never leaves the handler, so a try with a catch is walked through those clauses only.
			tryStatement := node.AsTryStatement()
			if tryStatement.CatchClause != nil {
				tryStatement.CatchClause.ForEachChild(visit)
				if tryStatement.FinallyBlock != nil {
					tryStatement.FinallyBlock.ForEachChild(visit)
				}
				return false
			}
		case ast.KindClassDeclaration, ast.KindClassExpression:
			// A throw in a class method declared here escapes that method, not this handler.
			return false
		}
		node.ForEachChild(visit)
		return false
	}
	body.ForEachChild(visit)
	return found
}

// checkReturnedErrorType is `returned-error-type`: the dispatcher routes a returned error by its mion
// brand, so an RpcError or a subclass lands in its own typed slot while any other error is dropped into the
// undeclared `@thrownErrors` slot and the declared return type stops being true. Only a WRITTEN return type
// is read: without one MRT001 already fires, and an inferred type would report the same handler twice.
func (scope *fileScope) checkReturnedErrorType(discovered handler) []diagnostics.Diagnostic {
	fnLike := discovered.fn.FunctionLikeData()
	if fnLike == nil || fnLike.Type == nil {
		return nil
	}
	returnType := checker.Checker_getTypeFromTypeNode(scope.typeChecker, fnLike.Type)
	if returnType == nil {
		return nil
	}
	// A handler may answer asynchronously; the awaited type is the answer.
	if awaited := checker.Checker_getAwaitedType(scope.typeChecker, returnType); awaited != nil {
		returnType = awaited
	}
	var found []diagnostics.Diagnostic
	reported := map[string]bool{}
	for _, arm := range unionArms(returnType) {
		symbol := checker.Type_symbol(arm)
		if symbol == nil || !scope.derivesFromError(arm) || scope.derivesFromRpcError(arm) {
			continue
		}
		if reported[symbol.Name] {
			continue
		}
		reported[symbol.Name] = true
		found = append(found, scope.diag(diagnostics.CodeRouteReturnedErrorType, discovered.at(fnLike.Type), symbol.Name, discovered.label))
	}
	return found
}

// unionArms flattens a union into its members; a non-union is its own only arm.
func unionArms(tsType *checker.Type) []*checker.Type {
	if checker.Type_flags(tsType)&checker.TypeFlagsUnion == 0 {
		return []*checker.Type{tsType}
	}
	return tsType.Types()
}

// derivesFromError walks the base-class chain looking for the global Error.
func (scope *fileScope) derivesFromError(arm *checker.Type) bool {
	return scope.derivesFrom(arm, func(symbol *ast.Symbol) bool { return symbol.Name == errorBaseName })
}

// derivesFromRpcError requires RpcError declared by `@mionjs/core`, so a same-named user class never passes.
func (scope *fileScope) derivesFromRpcError(arm *checker.Type) bool {
	return scope.derivesFrom(arm, func(symbol *ast.Symbol) bool {
		return symbol.Name == RpcErrorName && marker.DeclaredInModule(symbol, CoreModule, scope.markerOpts.FS)
	})
}

// derivesFrom walks over SYMBOLS rather than types, the arm's own class counting first: a symbol's DECLARED
// type is what carries the base list, so a generic class reached as `RpcError<'not-found'>` walks the same
// chain as a plain one, where asking a type reference for its base types answers nothing. Depth is bounded.
func (scope *fileScope) derivesFrom(arm *checker.Type, match func(*ast.Symbol) bool) bool {
	seen := map[*ast.Symbol]bool{}
	var walk func(symbol *ast.Symbol, depth int) bool
	walk = func(symbol *ast.Symbol, depth int) bool {
		if symbol == nil || depth > 16 || seen[symbol] {
			return false
		}
		seen[symbol] = true
		if match(symbol) {
			return true
		}
		declared := checker.Checker_getDeclaredTypeOfSymbol(scope.typeChecker, symbol)
		if declared == nil {
			return false
		}
		for _, base := range checker.Checker_getBaseTypes(scope.typeChecker, declared) {
			if walk(checker.Type_symbol(base), depth+1) {
				return true
			}
		}
		return false
	}
	return walk(checker.Type_symbol(arm), 0)
}

// checkUnsafePropertyNames is `no-unsafe-property-names`: writing `__proto__` on a plain object swaps its
// prototype instead of adding a key, so the member is dropped from every compiled function, and TypeScript
// ACCEPTS the declaration. UPN001 reports the drop only while RENDERING a type function, so only for a type
// a marker reaches; this reports the DECLARATION anywhere in the file, for types no route reaches yet.
func (scope *fileScope) checkUnsafePropertyNames() []diagnostics.Diagnostic {
	var found []diagnostics.Diagnostic
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		switch node.Kind {
		case ast.KindPropertySignature, ast.KindMethodSignature,
			ast.KindPropertyDeclaration, ast.KindMethodDeclaration:
			if name := declaredMemberName(node); reflection.IsUnsafePropertyName(name) {
				found = append(found, scope.diag(diagnostics.CodeRouteUnsafePropertyName, node, name))
			}
		}
		node.ForEachChild(visit)
		return false
	}
	scope.sourceFile.AsNode().ForEachChild(visit)
	return found
}

// declaredMemberName is the WRITTEN name of a member, empty for a computed one no static rule can read.
func declaredMemberName(node *ast.Node) string {
	name := node.Name()
	if name == nil {
		return ""
	}
	switch name.Kind {
	case ast.KindIdentifier, ast.KindStringLiteral, ast.KindNoSubstitutionTemplateLiteral:
		return name.Text()
	}
	return ""
}
