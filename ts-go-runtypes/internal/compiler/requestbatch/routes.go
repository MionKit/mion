package requestbatch

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/comptimeargs"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
)

// Element / root rejection reasons, surfaced as BAT001's `{0}` argument.
const (
	reasonSpread         = "spread element"
	reasonNotRouteCall   = "not a route call"
	reasonNotRoutesProxy = "root is not the client routes proxy"
	reasonNotBound       = "binding is not a const/let with a route-call initializer"
	reasonDepthCap       = "depth cap"
)

// routeSubRequestName is the interface every route call returns, declared by
// ClientModule: the gate that tells a route call from any other call whose
// callee happens to hang off a property chain.
const routeSubRequestName = "RouteSubRequest"

// initClientName is the factory that produces the client object whose
// RoutesProperty is the routes proxy.
const initClientName = "initClient"

// resolveRouteRef resolves a batch element (or an `inputFrom()` source) to the
// route call it names and that call's route id: a call written inline, or an
// identifier bound (const / let, this file or an imported binding) to one,
// through `as` / parentheses / `satisfies` wrappers. A non-empty reason is the
// BAT001 argument for the rejected node.
func (scope *fileScope) resolveRouteRef(node *ast.Node, depth int) (routeCall *ast.Node, routeId string, reason string) {
	if depth > comptimeargs.DepthCap {
		return nil, "", reasonDepthCap
	}
	unwrapped := unwrap(node)
	if unwrapped == nil {
		return nil, "", reasonNotRouteCall
	}
	switch unwrapped.Kind {
	case ast.KindSpreadElement:
		return nil, "", reasonSpread
	case ast.KindCallExpression:
		routeId, reason = scope.resolveRouteCall(unwrapped, depth)
		return unwrapped, routeId, reason
	case ast.KindIdentifier:
		initializer, ok := scope.bindingInitializer(unwrapped)
		if !ok {
			return nil, "", reasonNotBound
		}
		return scope.resolveRouteRef(initializer, depth+1)
	}
	return nil, "", reasonNotRouteCall
}

// resolveRouteCall reads a route call into its id. Gate 1: the call returns
// the client package's RouteSubRequest. Gate 2: its callee is a property chain
// whose root resolves to the client routes proxy. The id is the chain after
// the proxy joined by `/` (`routes.users.getById(...)` → `users/getById`).
func (scope *fileScope) resolveRouteCall(call *ast.Node, depth int) (routeId string, reason string) {
	if !scope.returnsRouteSubRequest(call) {
		return "", reasonNotRouteCall
	}
	segments, root := accessChain(call.AsCallExpression().Expression)
	if root == nil {
		return "", reasonNotRouteCall
	}
	prefix, rootReason := scope.resolveRootPath(root, depth)
	if rootReason != "" {
		return "", rootReason
	}
	full := append(append([]string(nil), prefix...), segments...)
	if len(full) < 2 || full[0] != RoutesProperty {
		return "", reasonNotRoutesProxy
	}
	return strings.Join(full[1:], "/"), ""
}

// returnsRouteSubRequest reports whether the call's resolved return type is
// the client package's RouteSubRequest interface (any instantiation).
func (scope *fileScope) returnsRouteSubRequest(call *ast.Node) bool {
	signature := checker.Checker_getResolvedSignature(scope.typeChecker, call, nil, 0)
	if signature == nil {
		return false
	}
	returnType := checker.Checker_getReturnTypeOfSignature(scope.typeChecker, signature)
	if returnType == nil {
		return false
	}
	symbol := checker.Type_symbol(returnType)
	if symbol == nil {
		if alias := checker.Type_alias(returnType); alias != nil {
			symbol = alias.Symbol()
		}
	}
	return symbol != nil && symbol.Name == routeSubRequestName && marker.DeclaredInModule(symbol, ClientModule, scope.markerOpts.FS)
}

// accessChain splits a property / element access chain into its segments
// (outermost last) and the identifier at its root: `a.b['c'].d` → ([b c d],
// a). Any other shape (a computed element access, a call in the chain) yields
// a nil root.
func accessChain(expr *ast.Node) (segments []string, root *ast.Node) {
	for {
		expr = unwrap(expr)
		if expr == nil {
			return nil, nil
		}
		switch expr.Kind {
		case ast.KindPropertyAccessExpression:
			access := expr.AsPropertyAccessExpression()
			name := access.Name()
			if name == nil {
				return nil, nil
			}
			segments = append(segments, name.Text())
			expr = access.Expression
		case ast.KindElementAccessExpression:
			access := expr.AsElementAccessExpression()
			key, ok := comptimeargs.StringLiteralValue(access.ArgumentExpression)
			if !ok {
				return nil, nil
			}
			segments = append(segments, key)
			expr = access.Expression
		case ast.KindIdentifier:
			for i, j := 0, len(segments)-1; i < j; i, j = i+1, j-1 {
				segments[i], segments[j] = segments[j], segments[i]
			}
			return segments, expr
		default:
			return nil, nil
		}
	}
}

// resolveRootPath resolves the identifier at the root of an access chain to
// its path from the client object (`initClient()`'s result): the destructured
// `const {routes} = initClient()` gives [routes], the whole `const client =
// initClient()` gives [], and `const users = routes.users` recurses into its
// own chain. A non-empty reason is the BAT001 argument.
func (scope *fileScope) resolveRootPath(identifier *ast.Node, depth int) (path []string, reason string) {
	if depth > comptimeargs.DepthCap {
		return nil, reasonDepthCap
	}
	symbol := scope.typeChecker.GetSymbolAtLocation(identifier)
	symbol = comptimeargs.ResolveImportAlias(scope.typeChecker, symbol)
	if symbol == nil {
		return nil, reasonNotRoutesProxy
	}
	for _, declaration := range symbol.Declarations {
		if declaration == nil {
			continue
		}
		switch declaration.Kind {
		case ast.KindBindingElement:
			if bindingPath, ok := scope.bindingElementPath(declaration); ok {
				return bindingPath, ""
			}
		case ast.KindVariableDeclaration:
			initializer := blockScopedInitializer(declaration)
			if initializer == nil {
				continue
			}
			if scope.isInitClientCall(initializer) {
				return []string{}, ""
			}
			segments, root := accessChain(initializer)
			if root == nil {
				continue
			}
			prefix, rootReason := scope.resolveRootPath(root, depth+1)
			if rootReason != "" {
				return nil, rootReason
			}
			return append(append([]string(nil), prefix...), segments...), ""
		}
	}
	return nil, reasonNotRoutesProxy
}

// bindingElementPath walks a destructuring element up to its declaration and
// returns the property path it binds (`const {routes: {users}} = initClient()`
// → [routes users]) when that declaration is a const / let initialised by
// initClient(). Rest elements and array patterns are not paths.
func (scope *fileScope) bindingElementPath(declaration *ast.Node) ([]string, bool) {
	var path []string
	node := declaration
	for node != nil && node.Kind == ast.KindBindingElement {
		element := node.AsBindingElement()
		if element.DotDotDotToken != nil {
			return nil, false
		}
		nameNode := element.PropertyName
		if nameNode == nil {
			nameNode = element.Name()
		}
		if nameNode == nil {
			return nil, false
		}
		switch nameNode.Kind {
		case ast.KindIdentifier, ast.KindStringLiteral, ast.KindNoSubstitutionTemplateLiteral:
			path = append(path, nameNode.Text())
		default:
			return nil, false
		}
		pattern := node.Parent
		if pattern == nil || pattern.Kind != ast.KindObjectBindingPattern {
			return nil, false
		}
		node = pattern.Parent
	}
	if node == nil || node.Kind != ast.KindVariableDeclaration {
		return nil, false
	}
	initializer := blockScopedInitializer(node)
	if initializer == nil || !scope.isInitClientCall(initializer) {
		return nil, false
	}
	for i, j := 0, len(path)-1; i < j; i, j = i+1, j-1 {
		path[i], path[j] = path[j], path[i]
	}
	return path, true
}

// blockScopedInitializer returns the unwrapped initializer of a `const` / `let`
// VariableDeclaration node, nil for `var`, a missing initializer, or any
// other node.
func blockScopedInitializer(declaration *ast.Node) *ast.Node {
	if declaration == nil || declaration.Kind != ast.KindVariableDeclaration {
		return nil
	}
	parent := declaration.Parent
	if parent == nil || parent.Flags&(ast.NodeFlagsConst|ast.NodeFlagsLet) == 0 {
		return nil
	}
	variableDecl := declaration.AsVariableDeclaration()
	if variableDecl == nil || variableDecl.Initializer == nil {
		return nil
	}
	return unwrap(variableDecl.Initializer)
}

// bindingInitializer resolves an identifier to the initializer of the const /
// let binding it names (following import aliases), the road both a batch
// element and an `inputFrom()` reference take when written as a name.
func (scope *fileScope) bindingInitializer(identifier *ast.Node) (*ast.Node, bool) {
	symbol := scope.typeChecker.GetSymbolAtLocation(identifier)
	symbol = comptimeargs.ResolveImportAlias(scope.typeChecker, symbol)
	if symbol == nil {
		return nil, false
	}
	for _, declaration := range symbol.Declarations {
		if initializer := blockScopedInitializer(declaration); initializer != nil {
			return initializer, true
		}
	}
	return nil, false
}

// isInitClientCall reports whether node is a call to the client package's
// initClient (directly, through a renamed import, or as `ns.initClient`).
func (scope *fileScope) isInitClientCall(node *ast.Node) bool {
	if node == nil || node.Kind != ast.KindCallExpression {
		return false
	}
	symbol := scope.calleeSymbol(node.AsCallExpression().Expression)
	return symbol != nil && symbol.Name == initClientName && marker.DeclaredInModule(symbol, ClientModule, scope.markerOpts.FS)
}

// calleeSymbol resolves a callee expression (`f` or `ns.f`) to the symbol it
// ultimately names, import aliases skipped. nil for any other callee shape.
func (scope *fileScope) calleeSymbol(callee *ast.Node) *ast.Symbol {
	callee = unwrap(callee)
	if callee == nil {
		return nil
	}
	if callee.Kind == ast.KindPropertyAccessExpression {
		callee = callee.AsPropertyAccessExpression().Name()
	}
	if callee == nil {
		return nil
	}
	symbol := scope.typeChecker.GetSymbolAtLocation(callee)
	if symbol == nil {
		return nil
	}
	if resolved := checker.SkipAlias(symbol, scope.typeChecker); resolved != nil {
		return resolved
	}
	return symbol
}
