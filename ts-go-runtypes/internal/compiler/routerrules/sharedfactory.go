package routerrules

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/routerinit"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

// sharedDataFactoryKey is the router option whose return type is `ctx.shared`.
const sharedDataFactoryKey = "sharedDataFactory"

// typedRouterFactoryName declares the factory `createMionRouter.withTypes<T>()` returns.
const typedRouterFactoryName = "TypedRouterFactory"

// checkSharedDataFactory is rpc-handler-shared-factory-untyped. A client types the router by inferring the whole
// options literal, so a factory with no written return type makes every client compute that return, however slim
// the routes are. The factory is read off the options' TYPE, so a spread, a variable, a quoted key or a factory
// built by a call all count, and a variable with a written function type counts as written.
func (scope *fileScope) checkSharedDataFactory() []diagnostics.Diagnostic {
	var found []diagnostics.Diagnostic
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		if node.Kind == ast.KindCallExpression && scope.isRouterFactoryCall(node) {
			if at := scope.untypedSharedDataFactory(node); at != nil {
				found = append(found, scope.diag(diagnostics.CodeRouteSharedFactoryUntyped, at))
			}
		}
		node.ForEachChild(visit)
		return false
	}
	scope.sourceFile.AsNode().ForEachChild(visit)
	return found
}

// isRouterFactoryCall is routerinit's factory match, or a call to the factory `withTypes` returns, declared by the
// router package.
func (scope *fileScope) isRouterFactoryCall(call *ast.Node) bool {
	if routerinit.IsFactoryCall(scope.typeChecker, scope.markerOpts, call) {
		return true
	}
	signature := checker.Checker_getResolvedSignature(scope.typeChecker, call, nil, 0)
	if signature == nil {
		return false
	}
	declaration := checker.Signature_declaration(signature)
	return declaration != nil && marker.DeclaringModuleOfNode(declaration, scope.markerOpts.FS) == RouterModule &&
		enclosingInterfaceName(declaration) == typedRouterFactoryName
}

// untypedSharedDataFactory returns the node to report when the options' `sharedDataFactory` is a function whose
// return type is not written: the property when this file declares it, else the options argument.
func (scope *fileScope) untypedSharedDataFactory(call *ast.Node) *ast.Node {
	callExpr := call.AsCallExpression()
	if callExpr == nil || len(callExpr.Arguments.Nodes) == 0 {
		return nil
	}
	options := callExpr.Arguments.Nodes[0]
	property := checker.Checker_getPropertyOfType(scope.typeChecker, scope.typeChecker.GetTypeAtLocation(options), sharedDataFactoryKey)
	if property == nil {
		return nil
	}
	factoryType := scope.typeChecker.GetTypeOfSymbol(property)
	signatures := checker.Checker_getSignaturesOfType(scope.typeChecker, factoryType, checker.SignatureKindCall)
	if len(signatures) != 1 {
		return nil
	}
	declaration := checker.Signature_declaration(signatures[0])
	if declaration == nil || declaration.FunctionLikeData() == nil || declaration.FunctionLikeData().Type != nil {
		return nil
	}
	if at := property.ValueDeclaration; at != nil && ast.GetSourceFileOfNode(at) == scope.sourceFile {
		if at.Kind == ast.KindPropertyAssignment {
			return at.AsPropertyAssignment().Initializer
		}
		return at
	}
	return options
}
