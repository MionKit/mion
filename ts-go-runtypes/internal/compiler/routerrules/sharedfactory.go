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

// checkSharedDataFactory: every client infers the whole options literal, so an unwritten factory return costs each.
// Read off the options' TYPE: spreads, variables, quoted keys, built factories count; a typed variable is written.
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

// isRouterFactoryCall is routerinit's factory match, or a call of the router package's factory `withTypes` returns.
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

// untypedSharedDataFactory returns where to report an unwritten return: the property if declared here, else the options.
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
