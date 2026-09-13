package routerrules

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/scanner"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
)

// discoverHandlers walks the file once and returns every handler the rules
// apply to, deduped by function node: a `Handler`-typed const passed straight
// into `mion.route()` is one handler found down two roads, not two.
//
// The three roads, in the order they claim a function:
//
//	mion.route(handler)          argument 0 of a call whose resolved signature
//	                             is one of RouterModule's helper interfaces
//	const h: Handler = …         a declaration annotated with a handler type
//	                             declared by RouterModule
//	/** @mion:route */           a function carrying the JSDoc tag
//
// The helper call wins when two roads reach the same function, because its
// label names the helper the user actually wrote.
func (scope *fileScope) discoverHandlers() []handler {
	var found []handler
	claimed := map[*ast.Node]bool{}
	// origin is the node in this file that declared the handler; a handler
	// resolved to another module is reported there instead of at its own body.
	claim := func(fn *ast.Node, origin *ast.Node, call *ast.Node, label string, ctxParams int) {
		if fn == nil || claimed[fn] {
			return
		}
		claimed[fn] = true
		found = append(found, handler{
			fn:        fn,
			origin:    origin,
			external:  ast.GetSourceFileOfNode(fn) != scope.sourceFile,
			call:      call,
			label:     label,
			ctxParams: ctxParams,
		})
	}

	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		switch node.Kind {
		case ast.KindCallExpression:
			if label, ctxParams, ok := scope.helperCall(node); ok {
				// The handler argument, not the whole call: a handler written
				// inline is reported on itself, and one that came from another
				// module is reported on the name this call passes.
				claim(scope.handlerArgument(node), callee(node), node, label, ctxParams)
			}
		case ast.KindVariableDeclaration, ast.KindPropertyDeclaration, ast.KindPropertySignature:
			if ctxParams, label, ok := scope.annotatedHandler(node); ok {
				claim(functionOfDeclaration(node), node, nil, label, ctxParams)
			}
		case ast.KindFunctionDeclaration, ast.KindVariableStatement:
			if tag, ok := scope.jsdocHandlerTag(node); ok {
				if node.Kind == ast.KindFunctionDeclaration {
					claim(node, node, nil, tag.label, tag.ctxParams)
				} else {
					for _, declaration := range variableStatementDeclarations(node) {
						claim(functionOfDeclaration(declaration), declaration, nil, tag.label, tag.ctxParams)
					}
				}
			}
		}
		node.ForEachChild(visit)
		return false
	}
	scope.sourceFile.AsNode().ForEachChild(visit)
	return found
}

// helperCall reports whether a call declares a route, and with which helper.
// Two layers, like routerinit.isFactoryCall: the callee gives the label the
// message shows, and the RESOLVED signature must be declared by one of
// RouterModule's helper interfaces — which is what makes an alias, a namespace
// import, a destructured helper and a local barrel all match while a same-named
// call from another package does not.
func (scope *fileScope) helperCall(call *ast.Node) (label string, ctxParams int, ok bool) {
	callExpr := call.AsCallExpression()
	if callExpr == nil || len(callExpr.Arguments.Nodes) == 0 {
		return "", 0, false
	}
	signature := checker.Checker_getResolvedSignature(scope.typeChecker, call, nil, 0)
	if signature == nil {
		return "", 0, false
	}
	declaration := checker.Signature_declaration(signature)
	if declaration == nil {
		return "", 0, false
	}
	interfaceName := enclosingInterfaceName(declaration)
	ctxParams, isHelper := helperInterfaces[interfaceName]
	if !isHelper {
		return "", 0, false
	}
	if marker.DeclaringModuleOfNode(declaration, scope.markerOpts.FS) != RouterModule {
		return "", 0, false
	}
	return calleeLabel(callExpr, interfaceName), ctxParams, true
}

// callee is the first argument of a helper call, the node that names the handler
// in this file, falling back to the call itself for a shape with no arguments.
func callee(call *ast.Node) *ast.Node {
	if callExpr := call.AsCallExpression(); callExpr != nil && len(callExpr.Arguments.Nodes) > 0 {
		return callExpr.Arguments.Nodes[0]
	}
	return call
}

// calleeLabel is the name the user wrote the call through — `route`, `query`
// and `mutation` share one interface, so only the call site tells them apart.
// The interface name is the fallback for a callee shape with no identifier.
func calleeLabel(callExpr *ast.CallExpression, interfaceName string) string {
	if nameNode := calleeNameNode(callExpr); nameNode != nil {
		if name := nameNode.Text(); name != "" {
			return name
		}
	}
	return strings.TrimSuffix(interfaceName, "Helper")
}

// calleeNameNode returns the identifier a call is made through: the callee
// itself for `f(...)`, the member name for `ns.f(...)`.
func calleeNameNode(callExpr *ast.CallExpression) *ast.Node {
	if callExpr == nil || callExpr.Expression == nil {
		return nil
	}
	switch callExpr.Expression.Kind {
	case ast.KindIdentifier:
		return callExpr.Expression
	case ast.KindPropertyAccessExpression:
		return callExpr.Expression.AsPropertyAccessExpression().Name()
	}
	return nil
}

// enclosingInterfaceName is the name of the interface (or type alias) a call
// signature declaration sits in. `RouteHelper` for the `mion.route` signature,
// empty for a plain function declaration.
func enclosingInterfaceName(declaration *ast.Node) string {
	for node := declaration.Parent; node != nil; node = node.Parent {
		switch node.Kind {
		case ast.KindInterfaceDeclaration, ast.KindTypeAliasDeclaration:
			if name := node.Name(); name != nil {
				return name.Text()
			}
			return ""
		case ast.KindSourceFile:
			return ""
		}
	}
	return ""
}

// handlerArgument resolves argument 0 of a helper call to the function the
// rules walk. It follows the shapes the syntactic rules could not: a named
// reference, a `satisfies` / `as` wrapper, and a const bound to a function.
func (scope *fileScope) handlerArgument(call *ast.Node) *ast.Node {
	callExpr := call.AsCallExpression()
	if callExpr == nil || len(callExpr.Arguments.Nodes) == 0 {
		return nil
	}
	return scope.resolveFunction(callExpr.Arguments.Nodes[0], 0)
}

// resolveFunction unwraps an expression to the function literal behind it, or
// nil when there is none in this program. depth bounds the identifier chain so
// a cycle (`const a = b; const b = a;`) cannot spin.
func (scope *fileScope) resolveFunction(expr *ast.Node, depth int) *ast.Node {
	if expr == nil || depth > 4 {
		return nil
	}
	expr = unwrap(expr)
	if isFunctionLike(expr) {
		return expr
	}
	if expr.Kind != ast.KindIdentifier {
		return nil
	}
	symbol := scope.typeChecker.GetSymbolAtLocation(expr)
	if symbol != nil && symbol.Flags&ast.SymbolFlagsAlias != 0 {
		symbol = scope.typeChecker.GetAliasedSymbol(symbol)
	}
	if symbol == nil || symbol.ValueDeclaration == nil {
		return nil
	}
	declaration := symbol.ValueDeclaration
	if declaration.Kind == ast.KindFunctionDeclaration {
		return declaration
	}
	if initializer := declarationInitializer(declaration); initializer != nil {
		return scope.resolveFunction(initializer, depth+1)
	}
	return nil
}

// unwrap strips the wrappers that never change which function is being passed:
// parentheses, `as T`, `satisfies T` and the non-null assertion.
func unwrap(node *ast.Node) *ast.Node {
	for node != nil {
		switch node.Kind {
		case ast.KindParenthesizedExpression, ast.KindAsExpression,
			ast.KindSatisfiesExpression, ast.KindNonNullExpression:
			node = node.Expression()
		default:
			return node
		}
	}
	return nil
}

func isFunctionLike(node *ast.Node) bool {
	if node == nil {
		return false
	}
	switch node.Kind {
	case ast.KindArrowFunction, ast.KindFunctionExpression, ast.KindFunctionDeclaration:
		return true
	}
	return false
}

// declarationInitializer is the initializer of a variable declaration or a
// property declaration, nil for anything else.
func declarationInitializer(declaration *ast.Node) *ast.Node {
	switch declaration.Kind {
	case ast.KindVariableDeclaration:
		return declaration.AsVariableDeclaration().Initializer
	case ast.KindPropertyDeclaration:
		return declaration.AsPropertyDeclaration().Initializer
	}
	return nil
}

// functionOfDeclaration is the function a declaration is initialized with.
func functionOfDeclaration(declaration *ast.Node) *ast.Node {
	initializer := declarationInitializer(declaration)
	if initializer == nil {
		return nil
	}
	initializer = unwrap(initializer)
	if isFunctionLike(initializer) {
		return initializer
	}
	return nil
}

// annotatedHandler reports whether a declaration carries a `Handler` /
// `HeaderHandler` annotation declared by RouterModule. The annotation is read
// through the checker, so a local alias of the handler type still matches.
func (scope *fileScope) annotatedHandler(declaration *ast.Node) (ctxParams int, label string, ok bool) {
	typeNode := ast.GetTypeAnnotationNode(declaration)
	if typeNode == nil {
		return 0, "", false
	}
	symbol := scope.typeSymbolOf(typeNode)
	if symbol == nil {
		return 0, "", false
	}
	ctxParams, isHandler := handlerTypes[symbol.Name]
	if !isHandler || !marker.DeclaredInModule(symbol, RouterModule, scope.markerOpts.FS) {
		return 0, "", false
	}
	return ctxParams, symbol.Name, true
}

// typeSymbolOf resolves a type reference node to the symbol it names, following
// an alias chain so a re-exported or renamed `Handler` still resolves.
func (scope *fileScope) typeSymbolOf(typeNode *ast.Node) *ast.Symbol {
	if typeNode == nil || typeNode.Kind != ast.KindTypeReference {
		return nil
	}
	nameNode := typeNode.AsTypeReferenceNode().TypeName
	if nameNode == nil {
		return nil
	}
	// A qualified name (`router.Handler`) carries the identifier on its right.
	if nameNode.Kind == ast.KindQualifiedName {
		nameNode = nameNode.AsQualifiedName().Right
	}
	symbol := scope.typeChecker.GetSymbolAtLocation(nameNode)
	if symbol != nil && symbol.Flags&ast.SymbolFlagsAlias != 0 {
		symbol = scope.typeChecker.GetAliasedSymbol(symbol)
	}
	return symbol
}

// jsdocHandlerTag reads the leading trivia of a statement for one of the
// `@mion:` tags. tsgo parses those as plain comment text rather than as known
// JSDoc tags, so the trivia is read directly — the same thing the ESLint rule
// did against the comment attached to the node.
func (scope *fileScope) jsdocHandlerTag(node *ast.Node) (tag struct {
	label     string
	ctxParams int
}, ok bool) {
	tokenStart := scanner.GetTokenPosOfNode(node, scope.sourceFile, false)
	start := node.Pos()
	text := scope.sourceFile.Text()
	if start < 0 || tokenStart > len(text) || start >= tokenStart {
		return tag, false
	}
	trivia := text[start:tokenStart]
	if !strings.Contains(trivia, "@mion:") {
		return tag, false
	}
	for name, candidate := range jsdocTags {
		if strings.Contains(trivia, name) {
			return candidate, true
		}
	}
	return tag, false
}

// variableStatementDeclarations lists the declarations of a variable statement.
func variableStatementDeclarations(statement *ast.Node) []*ast.Node {
	if statement.Kind != ast.KindVariableStatement {
		return nil
	}
	list := statement.AsVariableStatement().DeclarationList
	if list == nil {
		return nil
	}
	return list.AsVariableDeclarationList().Declarations.Nodes
}
