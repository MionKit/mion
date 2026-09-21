package requestbatch

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/comptimeargs"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
)

// Element / root rejection reasons, surfaced as BAT001's `{0}` argument (and, prefixed, as BAT004's).
const (
	reasonSpread         = "spread element"
	reasonNotRouteCall   = "not a route call"
	reasonNotRoutesProxy = "root is not the client routes proxy"
	reasonNotBound       = "binding is not a const/let with a route-call initializer"
	reasonReassigned     = "binding is reassigned after its initializer"
	reasonChainRoot      = "route path does not start at an identifier (`this`, a call result, …)"
	reasonComputedMember = "computed member in the route path"
	reasonOptionalChain  = "optional chaining in the route path"
	reasonDepthCap       = "depth cap"
)

// routeSubRequestName is the interface every route call returns, the gate that tells a route call from any
// other call whose callee hangs off a property chain.
const routeSubRequestName = "RouteSubRequest"

// initClientName produces the client object whose RoutesProperty is the routes proxy.
const initClientName = "initClient"

// resolveRouteRef resolves a batch element (or an `inputFrom()` source) to the route call it names and that
// call's route id, through const / let bindings, imports and wrappers. A non-empty reason is BAT001's argument.
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
		initializer, bindReason := scope.bindingInitializer(unwrapped)
		if bindReason != "" {
			return nil, "", bindReason
		}
		return scope.resolveRouteRef(initializer, depth+1)
	}
	return nil, "", reasonNotRouteCall
}

// resolveRouteCall reads a route call into its id, the `/`-joined chain after the routes proxy. Two gates:
// the call returns the client package's RouteSubRequest, and its callee chain roots at that proxy.
func (scope *fileScope) resolveRouteCall(call *ast.Node, depth int) (routeId string, reason string) {
	if !scope.returnsRouteSubRequest(call) {
		return "", reasonNotRouteCall
	}
	segments, root, chainReason := accessChain(call.AsCallExpression().Expression)
	if chainReason != "" {
		return "", chainReason
	}
	full, rootReason := scope.resolveRootPath(root, segments, depth)
	if rootReason != "" {
		return "", rootReason
	}
	if len(full) < 2 || full[0] != RoutesProperty {
		return "", reasonNotRoutesProxy
	}
	return strings.Join(full[1:], "/"), ""
}

// returnsRouteSubRequest accepts any instantiation of the client package's RouteSubRequest; the `undefined`
// arm an optional-chained call adds is dropped here so the chain walk can name the `?.` as the reason.
func (scope *fileScope) returnsRouteSubRequest(call *ast.Node) bool {
	signature := checker.Checker_getResolvedSignature(scope.typeChecker, call, nil, 0)
	if signature == nil {
		return false
	}
	returnType := checker.Checker_getReturnTypeOfSignature(scope.typeChecker, signature)
	if returnType == nil {
		return false
	}
	returnType = scope.typeChecker.GetNonNullableType(returnType)
	symbol := checker.Type_symbol(returnType)
	if symbol == nil {
		if alias := checker.Type_alias(returnType); alias != nil {
			symbol = alias.Symbol()
		}
	}
	return symbol != nil && symbol.Name == routeSubRequestName && marker.DeclaredInModule(symbol, ClientModule, scope.markerOpts.FS)
}

// accessChain splits an access chain into its segments (outermost last) and the identifier at its root:
// `a.b['c'].d` gives ([b c d], a). Any other shape yields a non-empty reason.
func accessChain(expr *ast.Node) (segments []string, root *ast.Node, reason string) {
	for {
		expr = unwrap(expr)
		if expr == nil {
			return nil, nil, reasonChainRoot
		}
		if expr.Kind == ast.KindPropertyAccessExpression || expr.Kind == ast.KindElementAccessExpression {
			if expr.QuestionDotToken() != nil {
				return nil, nil, reasonOptionalChain
			}
		}
		switch expr.Kind {
		case ast.KindPropertyAccessExpression:
			access := expr.AsPropertyAccessExpression()
			name := access.Name()
			if name == nil {
				return nil, nil, reasonChainRoot
			}
			segments = append(segments, name.Text())
			expr = access.Expression
		case ast.KindElementAccessExpression:
			access := expr.AsElementAccessExpression()
			key, ok := comptimeargs.StringLiteralValue(access.ArgumentExpression)
			if !ok {
				return nil, nil, reasonComputedMember
			}
			segments = append(segments, key)
			expr = access.Expression
		case ast.KindIdentifier:
			for i, j := 0, len(segments)-1; i < j; i, j = i+1, j-1 {
				segments[i], segments[j] = segments[j], segments[i]
			}
			return segments, expr, ""
		default:
			return nil, nil, reasonChainRoot
		}
	}
}

// resolveRootPath resolves the root identifier of an access chain, plus the chain's segments, to the full
// path from the client object (`initClient()`'s result). A non-empty reason is the BAT001 argument.
func (scope *fileScope) resolveRootPath(identifier *ast.Node, segments []string, depth int) (path []string, reason string) {
	symbol := scope.typeChecker.GetSymbolAtLocation(identifier)
	return scope.resolveSymbolPath(symbol, segments, depth)
}

// resolveSymbolPath is resolveRootPath over an already-looked-up symbol; a module symbol consumes the first
// segment as an export name.
func (scope *fileScope) resolveSymbolPath(symbol *ast.Symbol, segments []string, depth int) (path []string, reason string) {
	if depth > comptimeargs.DepthCap {
		return nil, reasonDepthCap
	}
	symbol = comptimeargs.ResolveImportAlias(scope.typeChecker, symbol)
	if symbol == nil {
		return nil, reasonNotRoutesProxy
	}
	if symbol.Flags&ast.SymbolFlagsModule != 0 {
		if len(segments) == 0 {
			return nil, reasonNotRoutesProxy
		}
		export := scope.moduleExport(symbol, segments[0])
		if export == nil {
			return nil, reasonNotRoutesProxy
		}
		return scope.resolveSymbolPath(export, segments[1:], depth+1)
	}
	for _, declaration := range symbol.Declarations {
		if declaration == nil {
			continue
		}
		switch declaration.Kind {
		case ast.KindBindingElement:
			if bindingPath, ok := scope.bindingElementPath(declaration); ok {
				if scope.isReassigned(symbol, declaration) {
					return nil, reasonReassigned
				}
				return append(bindingPath, segments...), ""
			}
		case ast.KindVariableDeclaration:
			initializer := blockScopedInitializer(declaration)
			if initializer == nil {
				continue
			}
			if scope.isReassigned(symbol, declaration) {
				return nil, reasonReassigned
			}
			if scope.isInitClientCall(initializer) {
				return append([]string(nil), segments...), ""
			}
			initSegments, root, chainReason := accessChain(initializer)
			if chainReason != "" {
				continue
			}
			prefix, rootReason := scope.resolveRootPath(root, initSegments, depth+1)
			if rootReason != "" {
				return nil, rootReason
			}
			return append(prefix, segments...), ""
		}
	}
	return nil, reasonNotRoutesProxy
}

// moduleExport looks an export up by name on a module symbol, including the ones `export * from` forwards.
func (scope *fileScope) moduleExport(moduleSymbol *ast.Symbol, name string) *ast.Symbol {
	for _, export := range scope.typeChecker.GetExportsOfModule(moduleSymbol) {
		if export != nil && export.Name == name {
			return export
		}
	}
	return nil
}

// bindingElementPath returns the property path a destructuring element binds, only when its declaration is
// a const / let initialised by initClient(). Rest elements and array patterns are not paths.
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

// blockScopedInitializer returns the unwrapped initializer of a `const` / `let` declaration, nil for `var`.
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

// bindingInitializer resolves an identifier to the initializer of the const / let binding it names, the road
// a batch element or an `inputFrom()` reference written as a name takes. A non-empty reason says why it
// cannot be read: no const / let initializer, or a later-reassigned `let`, whose initializer is not what runs.
func (scope *fileScope) bindingInitializer(identifier *ast.Node) (*ast.Node, string) {
	symbol := scope.typeChecker.GetSymbolAtLocation(identifier)
	symbol = comptimeargs.ResolveImportAlias(scope.typeChecker, symbol)
	if symbol == nil {
		return nil, reasonNotBound
	}
	for _, declaration := range symbol.Declarations {
		initializer := blockScopedInitializer(declaration)
		if initializer == nil {
			continue
		}
		if scope.isReassigned(symbol, declaration) {
			return nil, reasonReassigned
		}
		return initializer, ""
	}
	return nil, reasonNotBound
}

// isReassigned guards a silent misread: the extractor only ever reads the initializer. A `const` cannot be
// reassigned and an exported `let` can only be written by its own module, so the declaring file is the whole
// search space, and its target set is collected once and memoised for the scope's lifetime.
func (scope *fileScope) isReassigned(symbol *ast.Symbol, declaration *ast.Node) bool {
	if !isLetDeclaration(declaration) {
		return false
	}
	declaringFile := ast.GetSourceFileOfNode(declaration)
	if declaringFile == nil {
		return false
	}
	targets, ok := scope.assignedSymbols[declaringFile]
	if !ok {
		targets = scope.collectAssignedSymbols(declaringFile)
		scope.assignedSymbols[declaringFile] = targets
	}
	return targets[symbol]
}

// isLetDeclaration reports whether a declaration or a nested BindingElement belongs to a `let` list.
func isLetDeclaration(declaration *ast.Node) bool {
	node := declaration
	for node != nil && node.Kind != ast.KindVariableDeclaration {
		switch node.Kind {
		case ast.KindBindingElement, ast.KindObjectBindingPattern, ast.KindArrayBindingPattern:
			node = node.Parent
		default:
			return false
		}
	}
	return node != nil && node.Parent != nil && node.Parent.Flags&ast.NodeFlagsLet != 0
}

// collectAssignedSymbols returns every symbol a file assigns, increments, or heads a for-in / for-of with.
func (scope *fileScope) collectAssignedSymbols(sourceFile *ast.SourceFile) map[*ast.Symbol]bool {
	targets := map[*ast.Symbol]bool{}
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		if node.Kind == ast.KindIdentifier && node.Parent != nil && ast.IsAssignmentTarget(node) {
			var symbol *ast.Symbol
			if node.Parent.Kind == ast.KindShorthandPropertyAssignment {
				symbol = checker.Checker_GetShorthandAssignmentValueSymbol(scope.typeChecker, node.Parent)
			} else {
				symbol = scope.typeChecker.GetSymbolAtLocation(node)
			}
			if symbol != nil {
				targets[symbol] = true
			}
		}
		node.ForEachChild(visit)
		return false
	}
	sourceFile.AsNode().ForEachChild(visit)
	return targets
}

// isInitClientCall accepts the client package's initClient directly, renamed, or as `ns.initClient`.
func (scope *fileScope) isInitClientCall(node *ast.Node) bool {
	if node == nil || node.Kind != ast.KindCallExpression {
		return false
	}
	symbol := scope.calleeSymbol(node.AsCallExpression().Expression)
	return symbol != nil && symbol.Name == initClientName && marker.DeclaredInModule(symbol, ClientModule, scope.markerOpts.FS)
}

// calleeSymbol resolves `f` or `ns.f` to the symbol it ultimately names, import aliases skipped.
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
