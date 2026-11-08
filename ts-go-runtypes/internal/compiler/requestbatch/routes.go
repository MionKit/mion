package requestbatch

import (
	"sort"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/comptimeargs"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
)

// Rejection reasons: rpc-batch-element-unreadable's `{0}` argument, and, prefixed, rpc-batch-mapper-unreadable's.
const (
	reasonSpread       = "spread element"
	reasonNotRoute     = "its type is not the `RouteSubRequest` a route call returns"
	reasonAnyType      = "its type is `any` (a bare `let x;` is `any` when `noImplicitAny` is off)"
	reasonIdNotLiteral = "its route id type is not a string literal (`string`, `any`, or an annotation that dropped it)"
	reasonNotBound     = "binding is not a const/let with an initializer"
	reasonReassigned   = "binding is reassigned after its initializer"
)

// routeSubRequestName is the interface every route call returns; its Id type argument is the route id.
const routeSubRequestName = "RouteSubRequest"

// routeIdTypeArgument is the `Id` slot of `RouteSubRequest<PH, Id, RA>`.
const routeIdTypeArgument = 1

// itemRouteIds reads the routes a batch item may run from its type, sorted: one id, or one per union member.
// The type is read at the item as written, so a cast is trusted: the server only runs the batches it compiled.
func (scope *fileScope) itemRouteIds(node *ast.Node) ([]string, string) {
	if node == nil {
		return nil, reasonNotRoute
	}
	if node.Kind == ast.KindSpreadElement {
		return nil, reasonSpread
	}
	itemType := scope.typeChecker.GetTypeAtLocation(node)
	if itemType == nil {
		return nil, reasonNotRoute
	}
	members := []*checker.Type{itemType}
	if checker.Type_flags(itemType)&checker.TypeFlagsUnion != 0 {
		members = itemType.Types()
	}
	seen := map[string]bool{}
	var ids []string
	for _, member := range members {
		memberIds, reason := scope.routeSubRequestIds(member)
		if reason != "" {
			return nil, reason
		}
		for _, id := range memberIds {
			if !seen[id] {
				seen[id] = true
				ids = append(ids, id)
			}
		}
	}
	sort.Strings(ids)
	return ids, ""
}

// routeSubRequestIds reads the Id type argument of the client package's RouteSubRequest: a literal or a union of them.
func (scope *fileScope) routeSubRequestIds(routeType *checker.Type) ([]string, string) {
	if checker.Type_flags(routeType)&checker.TypeFlagsAny != 0 {
		return nil, reasonAnyType
	}
	if routeType.ObjectFlags()&checker.ObjectFlagsReference == 0 {
		return nil, reasonNotRoute
	}
	symbol := routeType.Symbol()
	if symbol == nil || symbol.Name != routeSubRequestName || !marker.DeclaredInModule(symbol, ClientModule, scope.markerOpts.FS) {
		return nil, reasonNotRoute
	}
	arguments := scope.typeChecker.GetTypeArguments(routeType)
	if len(arguments) <= routeIdTypeArgument {
		return nil, reasonIdNotLiteral
	}
	idType := arguments[routeIdTypeArgument]
	idTypes := []*checker.Type{idType}
	if checker.Type_flags(idType)&checker.TypeFlagsUnion != 0 {
		idTypes = idType.Types()
	}
	ids := make([]string, 0, len(idTypes))
	for _, member := range idTypes {
		if checker.Type_flags(member)&checker.TypeFlagsStringLiteral == 0 {
			return nil, reasonIdNotLiteral
		}
		id, ok := member.AsLiteralType().Value().(string)
		if !ok {
			return nil, reasonIdNotLiteral
		}
		ids = append(ids, id)
	}
	return ids, ""
}

// isRouteCall tells a route call from a helper returning one: only the routes proxy's signature is declared by the client package.
func (scope *fileScope) isRouteCall(call *ast.Node) bool {
	if call == nil || call.Kind != ast.KindCallExpression {
		return false
	}
	signature := checker.Checker_getResolvedSignature(scope.typeChecker, call, nil, 0)
	if signature == nil {
		return false
	}
	return marker.DeclaringModuleOfNode(checker.Signature_declaration(signature), scope.markerOpts.FS) == ClientModule
}

// mappingCall finds the route call whose arguments hold a batch item's `inputFrom()` mappings: the item itself or
// the const / let it names. A non-empty reason marks a mapping the build would otherwise drop (in a helper's
// arguments, a ternary arm, a later assignment), the rpc-batch-mapper-unreadable argument.
func (scope *fileScope) mappingCall(item *ast.Node) (*ast.Node, string) {
	unwrapped := unwrap(item)
	if unwrapped == nil {
		return nil, ""
	}
	if scope.isRouteCall(unwrapped) {
		return unwrapped, ""
	}
	if unwrapped.Kind == ast.KindIdentifier {
		return scope.boundMappingCall(unwrapped)
	}
	if scope.containsMapperCall(unwrapped) {
		return nil, reasonMapperOutsideRouteCall
	}
	return nil, ""
}

// boundMappingCall is mappingCall for an item written as a name. A value the file cannot see (a parameter,
// a destructured binding) carries no mappings the build can read; a reassigned variable is checked at every write.
func (scope *fileScope) boundMappingCall(identifier *ast.Node) (*ast.Node, string) {
	symbol := comptimeargs.ResolveImportAlias(scope.typeChecker, scope.typeChecker.GetSymbolAtLocation(identifier))
	if symbol == nil {
		return nil, ""
	}
	for _, declaration := range symbol.Declarations {
		if declaration == nil || declaration.Kind != ast.KindVariableDeclaration {
			continue
		}
		var initializer *ast.Node
		if variableDecl := declaration.AsVariableDeclaration(); variableDecl != nil && variableDecl.Initializer != nil {
			initializer = unwrap(variableDecl.Initializer)
		}
		if scope.isAssigned(symbol, declaration) {
			if (initializer != nil && scope.containsMapperCall(initializer)) || scope.assignsMapper(symbol, ast.GetSourceFileOfNode(declaration)) {
				return nil, reasonMappedRouteReassigned
			}
			return nil, ""
		}
		if initializer == nil {
			return nil, ""
		}
		if scope.isRouteCall(initializer) {
			return initializer, ""
		}
		if scope.containsMapperCall(initializer) {
			return nil, reasonMapperOutsideRouteCall
		}
		return nil, ""
	}
	return nil, ""
}

// containsMapperCall reports whether a branded mapper-factory call sits anywhere under node.
func (scope *fileScope) containsMapperCall(node *ast.Node) bool {
	found := false
	var visit ast.Visitor
	visit = func(child *ast.Node) bool {
		if found || child == nil {
			return found
		}
		if child.Kind == ast.KindCallExpression && scope.isMapperFactoryCall(child) {
			found = true
			return true
		}
		child.ForEachChild(visit)
		return found
	}
	visit(node)
	return found
}

// assignsMapper reports whether any assignment to symbol in its declaring file writes a mapper-factory call.
func (scope *fileScope) assignsMapper(symbol *ast.Symbol, declaringFile *ast.SourceFile) bool {
	if declaringFile == nil {
		return false
	}
	found := false
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if found || node == nil {
			return found
		}
		if ast.IsAssignmentExpression(node, false) {
			binary := node.AsBinaryExpression()
			if scope.namesSymbol(binary.Left, symbol) && scope.containsMapperCall(binary.Right) {
				found = true
				return true
			}
		}
		node.ForEachChild(visit)
		return found
	}
	declaringFile.AsNode().ForEachChild(visit)
	return found
}

// namesSymbol reports whether an assignment target (a name or a destructuring pattern) writes symbol.
func (scope *fileScope) namesSymbol(target *ast.Node, symbol *ast.Symbol) bool {
	found := false
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if found || node == nil {
			return found
		}
		if node.Kind == ast.KindIdentifier && scope.typeChecker.GetSymbolAtLocation(node) == symbol {
			found = true
			return true
		}
		node.ForEachChild(visit)
		return found
	}
	visit(target)
	return found
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

// bindingInitializer resolves an identifier to the initializer of the const / let binding it names, the road an
// `inputFrom()` mapper written as a name takes. A non-empty reason says why it cannot be read: no const / let
// initializer, or a later-reassigned `let`, whose initializer is not what runs.
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
		if scope.isAssigned(symbol, declaration) {
			return nil, reasonReassigned
		}
		return initializer, ""
	}
	return nil, reasonNotBound
}

// isAssigned guards a silent misread: the extractor only ever reads the initializer. A `const` cannot be
// reassigned and a variable can only be written by its own module, so the declaring file is the whole search
// space, and its target set is collected once and memoised for the scope's lifetime.
func (scope *fileScope) isAssigned(symbol *ast.Symbol, declaration *ast.Node) bool {
	if declaration.Parent != nil && declaration.Parent.Flags&ast.NodeFlagsConst != 0 {
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
