package routerrules

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/bundled"
	"github.com/microsoft/typescript-go/shim/tspath"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

// CheckDrizzleSourceFile also runs during builds. Query bodies are allowed to use
// Drizzle; only written public types and locally authored slim schemas are checked.
func CheckDrizzleSourceFile(tc *checker.Checker, opts marker.Options, sf *ast.SourceFile, path string) []diagnostics.Diagnostic {
	if sf == nil || sf.IsDeclarationFile {
		return nil
	}
	scope := &fileScope{typeChecker: tc, markerOpts: opts, sourceFile: sf, filePath: path}
	var found []diagnostics.Diagnostic
	for _, h := range scope.discoverHandlers() {
		fn := h.fn.FunctionLikeData()
		if fn == nil {
			continue
		}
		if fn.Type != nil && scope.drizzleOrigin(fn.Type) {
			found = append(found, scope.diag(diagnostics.CodeRouteDrizzleType, h.at(fn.Type), "return type"))
		}
		if fn.Parameters != nil {
			for i, p := range fn.Parameters.Nodes {
				if i >= h.ctxParams {
					if annotation := ast.GetTypeAnnotationNode(p); annotation != nil && scope.drizzleOrigin(annotation) {
						found = append(found, scope.diag(diagnostics.CodeRouteDrizzleType, h.at(annotation), "parameter `"+parameterName(p)+"`"))
					}
				}
			}
		}
	}
	found = append(found, scope.checkSlimSchemaDependencies()...)
	sortDiagnostics(found)
	return found
}

func (scope *fileScope) resolveSymbol(node *ast.Node) *ast.Symbol {
	symbol := scope.typeChecker.GetSymbolAtLocation(node)
	if symbol != nil && symbol.Flags&ast.SymbolFlagsAlias != 0 {
		symbol = scope.typeChecker.GetAliasedSymbol(symbol)
	}
	return symbol
}

func (scope *fileScope) drizzleSymbol(symbol *ast.Symbol) bool {
	if symbol == nil {
		return false
	}
	for _, decl := range symbol.Declarations {
		module := marker.DeclaringModuleOfNode(decl, scope.markerOpts.FS)
		if module == "drizzle-orm" || strings.HasPrefix(module, "drizzle-orm/") {
			return true
		}
	}
	return false
}

// Written syntax preserves provenance that the checker erases when a mapped model
// or an indexed access simplifies to a plain object or primitive.
func (scope *fileScope) drizzleOrigin(root *ast.Node) bool {
	walk := &drizzleProvenance{scope: scope, nodes: map[*ast.Node]uint8{}, types: map[*checker.Type]uint8{}, activeTargets: map[*checker.Type]bool{}}
	return walk.visit(root)
}

const (
	drizzleFullSignature uint8 = iota
	drizzleReturnSignature
	drizzleParameterSignature
)

type drizzleProvenance struct {
	scope         *fileScope
	nodes         map[*ast.Node]uint8
	types         map[*checker.Type]uint8
	activeTargets map[*checker.Type]bool
	syntaxOnly    bool
	signaturePart uint8
}

func (walk *drizzleProvenance) visit(node *ast.Node) bool {
	mode := uint8(1) << walk.signaturePart
	if node == nil || walk.nodes[node]&mode != 0 {
		return false
	}
	walk.nodes[node] |= mode
	switch node.Kind {
	case ast.KindTypeReference:
		return walk.visitTypeReference(node)
	case ast.KindTypeQuery:
		return walk.visitTypeQuery(node)
	case ast.KindImportType:
		return walk.visitImportType(node)
	case ast.KindIdentifier:
		return walk.visitIdentifier(node)
	case ast.KindQualifiedName:
		return walk.visitQualifiedName(node)
	case ast.KindPropertyAccessExpression:
		return walk.visitPropertyAccessExpression(node)
	case ast.KindElementAccessExpression:
		return walk.visitElementAccessExpression(node)
	case ast.KindVariableDeclaration:
		return walk.visitVariableDeclaration(node)
	case ast.KindPropertyDeclaration:
		return walk.visitPropertyDeclaration(node)
	case ast.KindPropertySignature:
		return walk.visitPropertySignature(node)
	case ast.KindParameter:
		return walk.visitParameter(node)
	case ast.KindFunctionDeclaration:
		return walk.visitFunctionDeclaration(node)
	case ast.KindFunctionExpression:
		return walk.visitFunctionExpression(node)
	case ast.KindArrowFunction:
		return walk.visitArrowFunction(node)
	case ast.KindMethodDeclaration:
		return walk.visitMethodDeclaration(node)
	case ast.KindMethodSignature:
		return walk.visitMethodSignature(node)
	case ast.KindGetAccessor:
		return walk.visitGetAccessor(node)
	case ast.KindSetAccessor:
		return walk.visitSetAccessor(node)
	case ast.KindFunctionType:
		return walk.visitFunctionType(node)
	case ast.KindConstructorType:
		return walk.visitConstructorType(node)
	case ast.KindCallSignature:
		return walk.visitCallSignature(node)
	case ast.KindConstructSignature:
		return walk.visitConstructSignature(node)
	case ast.KindCallExpression:
		return walk.visitCall(node)
	case ast.KindObjectLiteralExpression:
		// A reconstructed object has its own structural type, not the origin of each expression.
		return walk.visitObjectLiteral(node)
	case ast.KindClassDeclaration:
		return walk.visitClassDeclaration(node)
	case ast.KindClassExpression:
		return walk.visitClassExpression(node)
	default:
		return node.ForEachChild(walk.visit)
	}
}

func (walk *drizzleProvenance) visitClassDeclaration(node *ast.Node) bool {
	return node.ForEachChild(func(child *ast.Node) bool {
		return child != node.Name() && walk.visitClassMember(child)
	})
}
func (walk *drizzleProvenance) visitClassExpression(node *ast.Node) bool {
	return node.ForEachChild(func(child *ast.Node) bool {
		return child != node.Name() && walk.visitClassMember(child)
	})
}
func (walk *drizzleProvenance) visitClassMember(node *ast.Node) bool {
	switch node.Kind {
	case ast.KindConstructor:
		return walk.visitConstructor(node)
	case ast.KindClassStaticBlockDeclaration:
		return false
	default:
		if ast.GetCombinedModifierFlags(node)&(ast.ModifierFlagsStatic|ast.ModifierFlagsPrivate|ast.ModifierFlagsProtected) != 0 {
			return false
		}
		return walk.visit(node)
	}
}
func (walk *drizzleProvenance) visitConstructor(node *ast.Node) bool {
	return node.ForEachChild(func(child *ast.Node) bool {
		return ast.GetCombinedModifierFlags(child)&ast.ModifierFlagsParameterPropertyModifier != 0 &&
			ast.GetCombinedModifierFlags(child)&(ast.ModifierFlagsPrivate|ast.ModifierFlagsProtected) == 0 && walk.visit(child)
	})
}

func (walk *drizzleProvenance) visitIdentifier(node *ast.Node) bool {
	return walk.visitName(node)
}
func (walk *drizzleProvenance) visitQualifiedName(node *ast.Node) bool {
	return walk.visitName(node)
}
func (walk *drizzleProvenance) visitPropertyAccessExpression(node *ast.Node) bool {
	return walk.visitName(node)
}
func (walk *drizzleProvenance) visitElementAccessExpression(node *ast.Node) bool {
	return walk.visitName(node)
}
func (walk *drizzleProvenance) visitVariableDeclaration(node *ast.Node) bool {
	return walk.visitValueDeclaration(node)
}
func (walk *drizzleProvenance) visitPropertyDeclaration(node *ast.Node) bool {
	return walk.visitValueDeclaration(node)
}
func (walk *drizzleProvenance) visitPropertySignature(node *ast.Node) bool {
	return walk.visitValueDeclaration(node)
}
func (walk *drizzleProvenance) visitParameter(node *ast.Node) bool {
	return walk.visitValueDeclaration(node)
}
func (walk *drizzleProvenance) visitFunctionDeclaration(node *ast.Node) bool {
	return walk.visitFunction(node)
}
func (walk *drizzleProvenance) visitFunctionExpression(node *ast.Node) bool {
	return walk.visitFunction(node)
}
func (walk *drizzleProvenance) visitArrowFunction(node *ast.Node) bool {
	return walk.visitFunction(node)
}
func (walk *drizzleProvenance) visitMethodDeclaration(node *ast.Node) bool {
	return walk.visitFunction(node)
}
func (walk *drizzleProvenance) visitMethodSignature(node *ast.Node) bool {
	return walk.visitFunction(node)
}
func (walk *drizzleProvenance) visitGetAccessor(node *ast.Node) bool {
	return walk.visitFunction(node)
}
func (walk *drizzleProvenance) visitSetAccessor(node *ast.Node) bool {
	return walk.visitFunction(node)
}
func (walk *drizzleProvenance) visitFunctionType(node *ast.Node) bool {
	return walk.visitFunction(node)
}
func (walk *drizzleProvenance) visitConstructorType(node *ast.Node) bool {
	return walk.visitFunction(node)
}
func (walk *drizzleProvenance) visitCallSignature(node *ast.Node) bool {
	return walk.visitFunction(node)
}
func (walk *drizzleProvenance) visitConstructSignature(node *ast.Node) bool {
	return walk.visitFunction(node)
}

func (walk *drizzleProvenance) visitObjectLiteral(node *ast.Node) bool {
	if walk.syntaxOnly {
		return node.ForEachChild(walk.visit)
	}
	return walk.visitType(walk.scope.typeChecker.GetTypeAtLocation(node))
}
func (walk *drizzleProvenance) visitTypeReference(node *ast.Node) bool {
	previous := walk.signaturePart
	defer func() { walk.signaturePart = previous }()
	if symbol := walk.scope.resolveSymbol(node.AsTypeReferenceNode().TypeName); symbol != nil {
		for _, declaration := range symbol.Declarations {
			if bundledDeclaration(declaration) {
				if symbol.Name == "ReturnType" {
					walk.signaturePart = drizzleReturnSignature
				} else if symbol.Name == "Parameters" || symbol.Name == "ConstructorParameters" {
					walk.signaturePart = drizzleParameterSignature
				}
			}
		}
	}
	if walk.visitName(node.AsTypeReferenceNode().TypeName) {
		return true
	}
	return node.ForEachChild(walk.visit)
}
func (walk *drizzleProvenance) visitImportType(node *ast.Node) bool {
	imported := node.AsImportTypeNode()
	if walk.scope.drizzleSymbol(walk.scope.typeChecker.GetSymbolAtLocation(imported.Argument.AsLiteralTypeNode().Literal)) {
		return true
	}
	return (imported.Qualifier != nil && walk.visitName(imported.Qualifier)) || node.ForEachChild(walk.visit)
}
func (walk *drizzleProvenance) visitTypeQuery(node *ast.Node) bool {
	return walk.visitName(node.AsTypeQueryNode().ExprName) || node.ForEachChild(walk.visit)
}
func (walk *drizzleProvenance) visitName(node *ast.Node) bool {
	symbol := walk.scope.resolveSymbol(node)
	if walk.scope.drizzleSymbol(symbol) {
		return true
	}
	if symbol != nil {
		for _, decl := range symbol.Declarations {
			if !bundledDeclaration(decl) && walk.visit(decl) {
				return true
			}
		}
	}
	return !walk.syntaxOnly && walk.visitType(walk.scope.typeChecker.GetTypeAtLocation(node))
}
func (walk *drizzleProvenance) visitValueDeclaration(node *ast.Node) bool {
	if annotation := ast.GetTypeAnnotationNode(node); annotation != nil {
		return walk.visit(annotation)
	}
	return (!walk.syntaxOnly && walk.visitType(walk.scope.typeChecker.GetTypeAtLocation(node))) || walk.visit(node.Initializer())
}
func (walk *drizzleProvenance) visitFunction(node *ast.Node) bool {
	fn := node.FunctionLikeData()
	if fn == nil {
		return false
	}
	if walk.signaturePart != drizzleReturnSignature && fn.Parameters != nil {
		for _, parameter := range fn.Parameters.Nodes {
			if walk.visit(parameter) {
				return true
			}
		}
	}
	if walk.signaturePart == drizzleParameterSignature {
		return false
	}
	if fn.Type != nil {
		return walk.visit(fn.Type)
	}
	if !walk.syntaxOnly && walk.visitType(walk.scope.typeChecker.GetTypeAtLocation(node)) {
		return true
	}
	body := node.Body()
	if body == nil {
		return false
	}
	if body.Kind != ast.KindBlock {
		return walk.visit(body)
	}
	return walk.visitReturns(body)
}
func (walk *drizzleProvenance) visitReturns(node *ast.Node) bool {
	switch node.Kind {
	case ast.KindReturnStatement:
		return walk.visit(node.AsReturnStatement().Expression)
	case ast.KindFunctionDeclaration:
		return false
	case ast.KindFunctionExpression:
		return false
	case ast.KindArrowFunction:
		return false
	case ast.KindMethodDeclaration:
		return false
	case ast.KindClassDeclaration:
		return false
	case ast.KindClassExpression:
		return false
	default:
		return node.ForEachChild(walk.visitReturns)
	}
}
func (walk *drizzleProvenance) visitCall(node *ast.Node) bool {
	signature := walk.scope.typeChecker.GetResolvedSignature(node)
	if signature != nil {
		if decl := signature.Declaration(); decl != nil {
			module := marker.DeclaringModuleOfNode(decl, walk.scope.markerOpts.FS)
			if module == "drizzle-orm" || strings.HasPrefix(module, "drizzle-orm/") {
				return true
			}
			if walk.visitReturnDeclaration(decl) {
				return true
			}
		}
		return !walk.syntaxOnly && walk.visitType(walk.scope.typeChecker.GetReturnTypeOfSignature(signature))
	}
	return !walk.syntaxOnly && walk.visitType(walk.scope.typeChecker.GetTypeAtLocation(node))
}
func (walk *drizzleProvenance) visitReturnDeclaration(node *ast.Node) bool {
	previous := walk.signaturePart
	walk.signaturePart = drizzleReturnSignature
	defer func() { walk.signaturePart = previous }()
	return walk.visit(node)
}
func (walk *drizzleProvenance) visitType(t *checker.Type) bool {
	mode := uint8(1) << walk.signaturePart
	if t == nil || walk.types[t]&mode != 0 {
		return false
	}
	walk.types[t] |= mode
	if walk.scope.drizzleSymbol(t.Symbol()) {
		return true
	}
	if alias := checker.Type_alias(t); alias != nil {
		if walk.scope.drizzleSymbol(alias.Symbol()) {
			return true
		}
	}
	flags := checker.Type_flags(t)
	switch {
	case flags&checker.TypeFlagsUnion != 0:
		return walk.visitUnionType(t)
	case flags&checker.TypeFlagsIntersection != 0:
		return walk.visitIntersectionType(t)
	case flags&checker.TypeFlagsObject != 0:
		return walk.visitObjectType(t)
	}
	return false
}
func (walk *drizzleProvenance) visitUnionType(t *checker.Type) bool { return walk.visitCompoundType(t) }
func (walk *drizzleProvenance) visitIntersectionType(t *checker.Type) bool {
	return walk.visitCompoundType(t)
}
func (walk *drizzleProvenance) visitCompoundType(t *checker.Type) bool {
	for _, arm := range t.Types() {
		if walk.visitType(arm) {
			return true
		}
	}
	return false
}
func (walk *drizzleProvenance) visitObjectType(t *checker.Type) bool {
	if t.ObjectFlags()&checker.ObjectFlagsReference != 0 {
		for _, arg := range walk.scope.typeChecker.GetTypeArguments(t) {
			if walk.visitType(arg) {
				return true
			}
		}
	}
	if t.ObjectFlags()&checker.ObjectFlagsReference != 0 {
		target := t.Target()
		if walk.activeTargets[target] {
			return false
		}
		walk.activeTargets[target] = true
		defer delete(walk.activeTargets, target)
	}
	if symbol := t.Symbol(); symbol != nil {
		for _, decl := range symbol.Declarations {
			if bundledDeclaration(decl) {
				return false
			}
		}
	}
	for _, sig := range walk.scope.typeChecker.GetSignaturesOfType(t, checker.SignatureKindCall) {
		if walk.signaturePart != drizzleReturnSignature {
			for _, parameter := range sig.Parameters() {
				for _, declaration := range parameter.Declarations {
					if walk.visit(declaration) {
						return true
					}
				}
				if walk.visitType(walk.scope.typeChecker.GetTypeOfSymbol(parameter)) {
					return true
				}
			}
		}
		if walk.signaturePart != drizzleParameterSignature && (walk.visitReturnDeclaration(sig.Declaration()) || walk.visitType(walk.scope.typeChecker.GetReturnTypeOfSignature(sig))) {
			return true
		}
	}
	for _, prop := range walk.scope.typeChecker.GetPropertiesOfType(t) {
		if walk.visitType(walk.scope.typeChecker.GetTypeOfSymbol(prop)) {
			return true
		}
	}
	for _, info := range walk.scope.typeChecker.GetIndexInfosOfType(t) {
		if walk.visitType(info.KeyType()) || walk.visitType(info.ValueType()) {
			return true
		}
	}
	return false
}

func slimModule(module string) bool {
	return module == "@mionjs/drizzle-orm" || module == "@mionjs/drizzle-orm-pg-core" || module == "@mionjs/drizzle-orm-mysql-core" || module == "@mionjs/drizzle-orm-sqlite-core"
}

// Names select the schema/model surface only after resolving package ownership.
func (scope *fileScope) slimSchemaSymbol(symbol *ast.Symbol) bool {
	if symbol == nil {
		return false
	}
	switch symbol.Name {
	case "PgTable", "PgTableWithRLS", "RtViewBuilder", "MysqlTable", "SqliteTable", "PgView", "PgMaterializedView", "MysqlView", "SqliteView", "PgSchema", "PgEnum", "PgEnumObject", "PgSequence", "InferSelectModel", "InferInsertModel", "InferSelectViewModel", "SelectModelOf", "InsertModelOf", "$inferSelect", "$inferInsert":
		for _, decl := range symbol.Declarations {
			if slimModule(marker.DeclaringModuleOfNode(decl, scope.markerOpts.FS)) {
				return true
			}
		}
	}
	return false
}

func (scope *fileScope) checkSlimSchemaDependencies() []diagnostics.Diagnostic {
	walk := &slimSchemaVisitor{scope: scope}
	scope.sourceFile.AsNode().ForEachChild(walk.visit)
	if !walk.authored {
		return nil
	}
	var found []diagnostics.Diagnostic
	for _, dependency := range walk.dependencies {
		if walk.heavyDependency(dependency) {
			found = append(found, scope.diag(diagnostics.CodeDrizzleSchemaDependency, dependency))
		}
	}
	return found
}

type slimSchemaVisitor struct {
	scope        *fileScope
	authored     bool
	dependencies []*ast.Node
}

func (walk *slimSchemaVisitor) visit(node *ast.Node) bool {
	switch node.Kind {
	case ast.KindImportDeclaration:
		return walk.visitImportDeclaration(node)
	case ast.KindExportDeclaration:
		return walk.visitExportDeclaration(node)
	case ast.KindImportType:
		return walk.visitImportType(node)
	case ast.KindCallExpression:
		walk.visitCall(node)
	case ast.KindTypeAliasDeclaration:
		walk.visitTypeAliasDeclaration(node)
	case ast.KindInterfaceDeclaration:
		walk.visitInterfaceDeclaration(node)
	}
	node.ForEachChild(walk.visit)
	return false
}
func (walk *slimSchemaVisitor) visitImportDeclaration(node *ast.Node) bool {
	walk.dependencies = append(walk.dependencies, node)
	return false
}
func (walk *slimSchemaVisitor) visitExportDeclaration(node *ast.Node) bool {
	walk.dependencies = append(walk.dependencies, node)
	return false
}
func (walk *slimSchemaVisitor) visitImportType(node *ast.Node) bool {
	walk.dependencies = append(walk.dependencies, node)
	return false
}

func (walk *slimSchemaVisitor) visitCall(node *ast.Node) {
	sig := walk.scope.typeChecker.GetResolvedSignature(node)
	if sig == nil || sig.Declaration() == nil || !slimModule(marker.DeclaringModuleOfNode(sig.Declaration(), walk.scope.markerOpts.FS)) {
		return
	}
	t := walk.scope.typeChecker.GetReturnTypeOfSignature(sig)
	if t != nil && walk.scope.slimSchemaSymbol(t.Symbol()) {
		walk.authored = true
	}
}
func (walk *slimSchemaVisitor) visitTypeAliasDeclaration(node *ast.Node) {
	// Follow children, not imported declarations: consuming an existing model is allowed.
	node.ForEachChild(walk.visitAuthoredType)
}
func (walk *slimSchemaVisitor) visitInterfaceDeclaration(node *ast.Node) {
	node.ForEachChild(walk.visitAuthoredType)
}
func (walk *slimSchemaVisitor) visitAuthoredType(node *ast.Node) bool {
	switch node.Kind {
	case ast.KindTypeReference:
		walk.visitAuthoredTypeReference(node)
	case ast.KindImportType:
		walk.visitAuthoredImportType(node)
	case ast.KindTypeQuery:
		walk.visitAuthoredTypeQuery(node)
	case ast.KindExpressionWithTypeArguments:
		walk.visitExpressionWithTypeArguments(node)
	}
	return node.ForEachChild(walk.visitAuthoredType)
}
func (walk *slimSchemaVisitor) visitAuthoredTypeReference(node *ast.Node) {
	if walk.scope.slimSchemaSymbol(walk.scope.resolveSymbol(node.AsTypeReferenceNode().TypeName)) {
		walk.authored = true
	}
}
func (walk *slimSchemaVisitor) visitAuthoredImportType(node *ast.Node) {
	if qualifier := node.AsImportTypeNode().Qualifier; qualifier != nil && walk.scope.slimSchemaSymbol(walk.scope.resolveSymbol(qualifier)) {
		walk.authored = true
	}
}
func (walk *slimSchemaVisitor) visitAuthoredTypeQuery(node *ast.Node) {
	if walk.scope.slimSchemaSymbol(walk.scope.resolveSymbol(node.AsTypeQueryNode().ExprName)) {
		walk.authored = true
	}
}
func (walk *slimSchemaVisitor) visitExpressionWithTypeArguments(node *ast.Node) {
	if walk.scope.slimSchemaSymbol(walk.scope.resolveSymbol(node.AsExpressionWithTypeArguments().Expression)) {
		walk.authored = true
	}
}
func (walk *slimSchemaVisitor) heavyDependency(node *ast.Node) bool {
	switch node.Kind {
	case ast.KindImportDeclaration:
		declaration := node.AsImportDeclaration()
		return walk.moduleDependency(declaration.ModuleSpecifier) || walk.dependencyOrigin(declaration.ImportClause)
	case ast.KindExportDeclaration:
		declaration := node.AsExportDeclaration()
		if declaration.ModuleSpecifier == nil {
			return false
		}
		return walk.moduleDependency(declaration.ModuleSpecifier) || walk.dependencyOrigin(declaration.ExportClause)
	case ast.KindImportType:
		return walk.dependencyOrigin(node)
	}
	return false
}

func (walk *slimSchemaVisitor) moduleDependency(node *ast.Node) bool {
	dependency := &slimModuleVisitor{scope: walk.scope, seen: map[*ast.Symbol]bool{}}
	return dependency.visitModule(walk.scope.typeChecker.GetSymbolAtLocation(node))
}

// Dependency declarations retain written provenance. Expanding third-party
// callable types here can instantiate unrelated recursive test/framework types.
func (walk *slimSchemaVisitor) dependencyOrigin(node *ast.Node) bool {
	dependency := &drizzleProvenance{scope: walk.scope, nodes: map[*ast.Node]uint8{}, types: map[*checker.Type]uint8{}, activeTargets: map[*checker.Type]bool{}, syntaxOnly: true}
	return dependency.visit(node)
}

func bundledDeclaration(node *ast.Node) bool {
	sf := ast.GetSourceFileOfNode(node)
	return sf != nil && strings.HasPrefix(tspath.NormalizePath(sf.FileName()), tspath.NormalizePath(bundled.LibPath()))
}

// Slim entry points have a large generic surface. Follow their resolved module
// dependencies without instantiating every exported column and builder type.
type slimModuleVisitor struct {
	scope *fileScope
	seen  map[*ast.Symbol]bool
}

func (walk *slimModuleVisitor) visitModule(symbol *ast.Symbol) bool {
	if symbol == nil || walk.seen[symbol] {
		return false
	}
	if walk.scope.drizzleSymbol(symbol) {
		return true
	}
	walk.seen[symbol] = true
	for _, decl := range symbol.Declarations {
		module := marker.DeclaringModuleOfNode(decl, walk.scope.markerOpts.FS)
		local := module == marker.DeclaringModuleOfNode(walk.scope.sourceFile.AsNode(), walk.scope.markerOpts.FS)
		if (slimModule(module) || local) && decl.ForEachChild(walk.visit) {
			return true
		}
	}
	return false
}
func (walk *slimModuleVisitor) visit(node *ast.Node) bool {
	switch node.Kind {
	case ast.KindImportDeclaration:
		return walk.visitImport(node)
	case ast.KindExportDeclaration:
		return walk.visitExport(node)
	case ast.KindTypeReference:
		return walk.visitReference(node)
	}
	return node.ForEachChild(walk.visit)
}
func (walk *slimModuleVisitor) visitImport(node *ast.Node) bool {
	return walk.visitModule(walk.scope.typeChecker.GetSymbolAtLocation(node.AsImportDeclaration().ModuleSpecifier))
}
func (walk *slimModuleVisitor) visitExport(node *ast.Node) bool {
	module := node.AsExportDeclaration().ModuleSpecifier
	return module != nil && walk.visitModule(walk.scope.typeChecker.GetSymbolAtLocation(module))
}
func (walk *slimModuleVisitor) visitReference(node *ast.Node) bool {
	return walk.scope.drizzleSymbol(walk.scope.resolveSymbol(node.AsTypeReferenceNode().TypeName)) || node.ForEachChild(walk.visit)
}
