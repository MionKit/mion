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

// isRouteCall tells a route call from a helper returning one: the routes proxy types each route as a function type
// the client package declares (a helper is a function, and inside the client package's own files it is declared there too).
func (scope *fileScope) isRouteCall(call *ast.Node) bool {
	if call == nil || call.Kind != ast.KindCallExpression {
		return false
	}
	signature := checker.Checker_getResolvedSignature(scope.typeChecker, call, nil, 0)
	if signature == nil {
		return false
	}
	declaration := checker.Signature_declaration(signature)
	return declaration != nil && declaration.Kind == ast.KindFunctionType && marker.DeclaringModuleOfNode(declaration, scope.markerOpts.FS) == ClientModule
}

// mappingCall finds the route call whose arguments hold a batch item's `inputFrom()` mappings: the item itself or
// the variable it names. opaque marks an item whose route call the build cannot see (a helper's result, a
// property, a parameter, a reassigned variable): its mappings are checked at runtime instead (batchIdLiteral).
// A non-empty reason marks a mapping the build can see but not read, the rpc-batch-mapper-unreadable argument.
func (scope *fileScope) mappingCall(item *ast.Node) (call *ast.Node, opaque bool, reason string) {
	unwrapped := unwrap(item)
	if unwrapped == nil {
		return nil, true, ""
	}
	if scope.isRouteCall(unwrapped) {
		return unwrapped, false, ""
	}
	if unwrapped.Kind == ast.KindIdentifier {
		return scope.boundMappingCall(unwrapped)
	}
	if scope.containsMapperCall(unwrapped) {
		return nil, true, reasonMapperOutsideRouteCall
	}
	return nil, true, ""
}

// boundMappingCall is mappingCall for an item written as a name.
func (scope *fileScope) boundMappingCall(identifier *ast.Node) (*ast.Node, bool, string) {
	symbol := comptimeargs.ResolveImportAlias(scope.typeChecker, scope.typeChecker.GetSymbolAtLocation(identifier))
	if symbol == nil {
		return nil, true, ""
	}
	for _, declaration := range symbol.Declarations {
		variable := declaration
		for variable != nil && (variable.Kind == ast.KindBindingElement || variable.Kind == ast.KindObjectBindingPattern || variable.Kind == ast.KindArrayBindingPattern) {
			variable = variable.Parent
		}
		if variable == nil || variable.Kind != ast.KindVariableDeclaration {
			continue
		}
		var initializer *ast.Node
		if variableDecl := variable.AsVariableDeclaration(); variableDecl.Initializer != nil {
			initializer = unwrap(variableDecl.Initializer)
		}
		if writes := scope.assignedValues(symbol, variable); len(writes) > 0 {
			for _, value := range append(writes, initializer) {
				if value != nil && scope.containsMapperCall(value) {
					return nil, true, reasonMappedRouteReassigned
				}
			}
			return nil, true, ""
		}
		if initializer == nil {
			return nil, true, ""
		}
		if variable == declaration && scope.isRouteCall(initializer) {
			return initializer, false, ""
		}
		if scope.containsMapperCall(initializer) {
			return nil, true, reasonMapperOutsideRouteCall
		}
		return nil, true, ""
	}
	return nil, true, ""
}

// containsMapperCall reports whether a branded mapper-factory call sits anywhere under node.
func (scope *fileScope) containsMapperCall(node *ast.Node) bool {
	finder := &mapperCallFinder{scope: scope}
	finder.visit(node)
	return finder.found
}

// mapperCallFinder is containsMapperCall's walk.
type mapperCallFinder struct {
	scope *fileScope
	found bool
}

func (finder *mapperCallFinder) visit(node *ast.Node) bool {
	if finder.found || node == nil {
		return finder.found
	}
	switch node.Kind {
	case ast.KindCallExpression:
		if finder.scope.isMapperFactoryCall(node) {
			finder.found = true
			return true
		}
	}
	node.ForEachChild(finder.visit)
	return finder.found
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
// `inputFrom()` mapper written as a name takes. reassigned marks a binding written after its initializer, whose
// initializer is not what runs; a nil initializer with reassigned false is a name the build cannot read.
func (scope *fileScope) bindingInitializer(identifier *ast.Node) (initializer *ast.Node, reassigned bool) {
	symbol := comptimeargs.ResolveImportAlias(scope.typeChecker, scope.typeChecker.GetSymbolAtLocation(identifier))
	if symbol == nil {
		return nil, false
	}
	for _, declaration := range symbol.Declarations {
		initializer := blockScopedInitializer(declaration)
		if initializer == nil {
			continue
		}
		if len(scope.assignedValues(symbol, declaration)) > 0 {
			return nil, true
		}
		return initializer, false
	}
	return nil, false
}

// assignedValues guards a silent misread: the extractor only ever reads the initializer. It lists every write to a
// non-const variable after its declaration (an increment or a destructuring write lists the expression it is
// part of). A variable can only be written by its own module, so the declaring file is the whole search space,
// collected once and memoised for the scope's lifetime.
func (scope *fileScope) assignedValues(symbol *ast.Symbol, declaration *ast.Node) []*ast.Node {
	if declaration.Parent != nil && declaration.Parent.Flags&ast.NodeFlagsConst != 0 {
		return nil
	}
	declaringFile := ast.GetSourceFileOfNode(declaration)
	if declaringFile == nil {
		return nil
	}
	writes, ok := scope.assignedSymbols[declaringFile]
	if !ok {
		writes = scope.collectAssignments(declaringFile)
		scope.assignedSymbols[declaringFile] = writes
	}
	return writes[symbol]
}

// collectAssignments maps every symbol a file assigns, increments, or heads a for-in / for-of with to the written values.
func (scope *fileScope) collectAssignments(sourceFile *ast.SourceFile) map[*ast.Symbol][]*ast.Node {
	writes := map[*ast.Symbol][]*ast.Node{}
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
				writes[symbol] = append(writes[symbol], writtenValue(node))
			}
		}
		node.ForEachChild(visit)
		return false
	}
	sourceFile.AsNode().ForEachChild(visit)
	return writes
}

// writtenValue is the expression a write to target stores: an assignment's right side, a for-in / for-of's
// iterated expression, or the increment itself.
func writtenValue(target *ast.Node) *ast.Node {
	write := ast.GetAssignmentTarget(target)
	if write == nil {
		return target
	}
	switch write.Kind {
	case ast.KindBinaryExpression:
		return write.AsBinaryExpression().Right
	case ast.KindForInStatement:
		return write.AsForInOrOfStatement().Expression
	case ast.KindForOfStatement:
		return write.AsForInOrOfStatement().Expression
	}
	return write
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
