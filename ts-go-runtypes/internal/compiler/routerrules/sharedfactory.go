package routerrules

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

// SharedDataFactoryKey is the router option whose return type is `ctx.shared`.
const SharedDataFactoryKey = "sharedDataFactory"

// routerFactoryName and typedRouterFactoryName are the two declarations a router is created through:
// `createMionRouter(...)`, and the factory `createMionRouter.withTypes<T>()` returns.
const (
	routerFactoryName      = "createMionRouter"
	typedRouterFactoryName = "TypedRouterFactory"
)

// checkSharedDataFactory is rpc-handler-shared-factory-untyped. A client types the router by inferring the whole
// options literal, so a factory with no written return type makes every client compute that return, however slim
// the routes are. A variable with a written function type counts as written.
func (scope *fileScope) checkSharedDataFactory() []diagnostics.Diagnostic {
	var found []diagnostics.Diagnostic
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		if node.Kind == ast.KindCallExpression && scope.isRouterFactoryCall(node) {
			if value := sharedDataFactoryValue(node); value != nil && scope.hasInferredReturn(value) {
				found = append(found, scope.diag(diagnostics.CodeRouteSharedFactoryUntyped, value))
			}
		}
		node.ForEachChild(visit)
		return false
	}
	scope.sourceFile.AsNode().ForEachChild(visit)
	return found
}

// isRouterFactoryCall requires the RESOLVED signature to be the router package's own, so a same-named local never
// matches and an alias or a namespace import does.
func (scope *fileScope) isRouterFactoryCall(call *ast.Node) bool {
	signature := checker.Checker_getResolvedSignature(scope.typeChecker, call, nil, 0)
	if signature == nil {
		return false
	}
	declaration := checker.Signature_declaration(signature)
	if declaration == nil || marker.DeclaringModuleOfNode(declaration, scope.markerOpts.FS) != RouterModule {
		return false
	}
	if declaration.Kind == ast.KindFunctionDeclaration {
		name := declaration.Name()
		return name != nil && name.Text() == routerFactoryName
	}
	return enclosingInterfaceName(declaration) == typedRouterFactoryName
}

// sharedDataFactoryValue is the value of the `sharedDataFactory` property of the call's options literal.
func sharedDataFactoryValue(call *ast.Node) *ast.Node {
	callExpr := call.AsCallExpression()
	if callExpr == nil || len(callExpr.Arguments.Nodes) == 0 {
		return nil
	}
	options := unwrap(callExpr.Arguments.Nodes[0])
	if options == nil || options.Kind != ast.KindObjectLiteralExpression {
		return nil
	}
	for _, property := range options.AsObjectLiteralExpression().Properties.Nodes {
		name := property.Name()
		if name == nil || name.Kind != ast.KindIdentifier || name.Text() != SharedDataFactoryKey {
			continue
		}
		switch property.Kind {
		case ast.KindPropertyAssignment:
			return property.AsPropertyAssignment().Initializer
		case ast.KindShorthandPropertyAssignment, ast.KindMethodDeclaration:
			return property
		}
	}
	return nil
}

// hasInferredReturn reports a function literal, or a variable or function declaration behind a name, whose return
// type is not written; anything it cannot follow is left alone.
func (scope *fileScope) hasInferredReturn(value *ast.Node) bool {
	var fn *ast.Node
	switch value.Kind {
	case ast.KindMethodDeclaration:
		fn = value
	case ast.KindShorthandPropertyAssignment:
		fn = scope.functionOfSymbol(checker.Checker_GetShorthandAssignmentValueSymbol(scope.typeChecker, value))
	default:
		if name := unwrap(value); name != nil && name.Kind == ast.KindIdentifier {
			fn = scope.functionOfSymbol(scope.typeChecker.GetSymbolAtLocation(name))
		} else {
			fn = scope.resolveFunction(value, 0)
		}
	}
	if fn == nil {
		return false
	}
	fnLike := fn.FunctionLikeData()
	return fnLike != nil && fnLike.Type == nil
}

// functionOfSymbol is the function a name declares, nil when its variable carries a written type.
func (scope *fileScope) functionOfSymbol(symbol *ast.Symbol) *ast.Node {
	if symbol != nil && symbol.Flags&ast.SymbolFlagsAlias != 0 {
		symbol = scope.typeChecker.GetAliasedSymbol(symbol)
	}
	if symbol == nil || symbol.ValueDeclaration == nil {
		return nil
	}
	declaration := symbol.ValueDeclaration
	if declaration.Kind == ast.KindVariableDeclaration && declaration.AsVariableDeclaration().Type != nil {
		return nil
	}
	if declaration.Kind == ast.KindFunctionDeclaration {
		return declaration
	}
	return scope.resolveFunction(declarationInitializer(declaration), 0)
}
