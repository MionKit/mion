// recognize.go classifies a file's top-level convertible declarations: type
// aliases, interfaces, and consts whose resolved type is the marker module's
// `RunType<T>` (detection is
// by RETURN TYPE, the same rule internal/compiler/builders applies, never by
// function name). An `InferType<typeof x>` alias is paired with its const so
// the two convert as one declaration.
package convert

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/compiler/builders"
	"github.com/mionkit/ts-runtypes/internal/compiler/marker"
)

// declaration is one recognized convertible declaration.
type declaration struct {
	// Name is the TYPE name: the alias/interface name, or the paired
	// InferType alias's name for a const form ("" when a const has no alias).
	Name string
	// ConstName is the runtype const's identifier for const forms, "" for
	// type-form declarations.
	ConstName string
	Form      Target
	// Exported is the recognized STATEMENT's export modifier (the const's,
	// for const forms); AliasExported is the TYPE name's — the paired
	// InferType alias for const forms, the statement itself otherwise. The
	// two can differ, and the printed type declaration follows the alias.
	Exported      bool
	AliasExported bool
	Generic       bool
	// Stmt is the statement the conversion replaces; NameNode the identifier
	// the checker resolves; AliasStmt the paired `type N = InferType<typeof c>`
	// statement for const forms (nil when absent).
	Stmt      *ast.Node
	NameNode  *ast.Node
	AliasStmt *ast.Node
}

// recognizeFile walks the file's top-level statements and returns the
// convertible declarations in source order. Class and enum declarations are
// runtime code and are never candidates.
func recognizeFile(sourceFile *ast.SourceFile, typeChecker *checker.Checker, markerOpts marker.Options) []*declaration {
	root := sourceFile.AsNode()
	if root == nil {
		return nil
	}
	var decls []*declaration
	aliasByConst := map[string]*ast.Node{}
	aliasNameByConst := map[string]string{}
	for _, statement := range root.Statements() {
		if statement == nil {
			continue
		}
		switch {
		case ast.IsTypeAliasDeclaration(statement):
			if constName, ok := inferTypeAliasTarget(statement); ok {
				aliasByConst[constName] = statement
				if nameNode := statement.Name(); nameNode != nil {
					aliasNameByConst[constName] = nameNode.Text()
				}
				continue
			}
			decls = append(decls, typeFormDeclaration(statement))
		case ast.IsInterfaceDeclaration(statement):
			decls = append(decls, typeFormDeclaration(statement))
		case ast.IsVariableStatement(statement):
			if decl := constFormDeclaration(statement, typeChecker, markerOpts, sourceFile); decl != nil {
				decls = append(decls, decl)
			}
		}
	}
	for _, decl := range decls {
		if decl.ConstName == "" {
			continue
		}
		if aliasStmt, ok := aliasByConst[decl.ConstName]; ok {
			decl.AliasStmt = aliasStmt
			decl.Name = aliasNameByConst[decl.ConstName]
			decl.AliasExported = isExported(aliasStmt)
		}
	}
	return decls
}

// typeFormDeclaration wraps a type alias / interface statement.
func typeFormDeclaration(statement *ast.Node) *declaration {
	exported := isExported(statement)
	decl := &declaration{
		Form:          TargetType,
		Exported:      exported,
		AliasExported: exported,
		Generic:       hasTypeParameters(statement),
		Stmt:          statement,
		NameNode:      statement.Name(),
	}
	if decl.NameNode != nil {
		decl.Name = decl.NameNode.Text()
	}
	return decl
}

// constFormDeclaration recognizes `const x = <expr>` whose declared type is
// the marker `RunType<T>`. Only single-declarator statements qualify — a
// multi-declarator statement mixing runtypes with other values has no clean
// replacement span.
func constFormDeclaration(statement *ast.Node, typeChecker *checker.Checker, markerOpts marker.Options, sourceFile *ast.SourceFile) *declaration {
	variableStatement := statement.AsVariableStatement()
	if variableStatement == nil || variableStatement.DeclarationList == nil {
		return nil
	}
	declarationList := variableStatement.DeclarationList.AsVariableDeclarationList()
	if declarationList == nil {
		return nil
	}
	declarators := declarationList.Declarations.Nodes
	if len(declarators) != 1 {
		return nil
	}
	declarator := declarators[0].AsVariableDeclaration()
	if declarator == nil || declarator.Initializer == nil {
		return nil
	}
	nameNode := declarators[0].Name()
	if nameNode == nil || !ast.IsIdentifier(nameNode) {
		return nil
	}
	symbol := typeChecker.GetSymbolAtLocation(nameNode)
	if symbol == nil {
		return nil
	}
	declaredType := typeChecker.GetTypeOfSymbol(symbol)
	if !builders.IsRunType(declaredType, markerOpts) {
		return nil
	}
	// …and the const must actually be BUILT by one of the two authoring forms.
	// A `RunType`-typed const whose initializer is a user function
	// (`const Model = objectOf([...])`, hand-assembled graphs in the mocking
	// suites) is not in any form the converter can round-trip: reprinting it
	// from its resolved type replaced the whole graph with the type argument's
	// spelling, and an untyped `RunType` reprinted as an EMPTY schema. Not a
	// conversion — data loss.
	if !isAuthoredRunTypeInitializer(declarator.Initializer, typeChecker, markerOpts) {
		return nil
	}
	return &declaration{
		ConstName: nameNode.Text(),
		Form:      TargetBuilders,
		Exported:  isExported(statement),
		Stmt:      statement,
		NameNode:  nameNode,
	}
}

// isAuthoredRunTypeInitializer reports whether the initializer is the
// spelling the converter round-trips: a builder / format call from the
// value-first surface.
//
// A RunType-typed const is NOT enough on its own. The mocking suites assemble
// RunType graphs by hand from local helpers (`const Model = objectOf([...])`,
// where objectOf returns a cast object literal), and reprinting one of those
// from its resolved type threw the graph away — an untyped `RunType` came back
// as an EMPTY schema. That is data loss, not conversion.
//
// The discriminator is that the callee comes from the PACKAGE: `RT.object(…)`
// is imported, a local helper is not. Module of
// origin cannot tell them apart here — the suites and src/ share one
// package.json, so a locally declared helper reports the marker module too.
func isAuthoredRunTypeInitializer(initializer *ast.Node, typeChecker *checker.Checker, markerOpts marker.Options) bool {
	if initializer == nil || initializer.Kind != ast.KindCallExpression {
		return false
	}
	if !builders.IsBuilderLeafCall(typeChecker, initializer, markerOpts) {
		return false
	}
	callee := initializer.AsCallExpression().Expression
	if callee == nil {
		return false
	}
	nameNode := callee
	if ast.IsPropertyAccessExpression(callee) {
		nameNode = callee.AsPropertyAccessExpression().Name()
	}
	return nameNode != nil && ast.IsIdentifier(nameNode) && referencedThroughPackageImport(typeChecker, nameNode)
}

// inferTypeAliasTarget reports whether a type alias is the paired
// `type N = InferType<typeof constName>` form, returning the const name.
func inferTypeAliasTarget(statement *ast.Node) (string, bool) {
	alias := statement.AsTypeAliasDeclaration()
	if alias == nil || alias.Type == nil || alias.Type.Kind != ast.KindTypeReference {
		return "", false
	}
	reference := alias.Type.AsTypeReferenceNode()
	// A qualified TypeName (`TF.String`) panics in Node.Text — only a bare
	// identifier can be the InferType alias head.
	if reference == nil || reference.TypeName == nil || !ast.IsIdentifier(reference.TypeName) || reference.TypeName.Text() != "InferType" {
		return "", false
	}
	if reference.TypeArguments == nil || len(reference.TypeArguments.Nodes) != 1 {
		return "", false
	}
	argument := reference.TypeArguments.Nodes[0]
	if argument.Kind != ast.KindTypeQuery {
		return "", false
	}
	queried := argument.AsTypeQueryNode().ExprName
	if queried == nil || !ast.IsIdentifier(queried) {
		return "", false
	}
	return queried.Text(), true
}

// isExported reports whether the statement carries an `export` modifier.
func isExported(statement *ast.Node) bool {
	return ast.GetCombinedModifierFlags(statement)&ast.ModifierFlagsExport != 0
}

// hasTypeParameters reports whether a type alias / interface declares type
// parameters (generic declarations have no conversion spelling).
func hasTypeParameters(statement *ast.Node) bool {
	switch {
	case ast.IsTypeAliasDeclaration(statement):
		alias := statement.AsTypeAliasDeclaration()
		return alias != nil && alias.TypeParameters != nil && len(alias.TypeParameters.Nodes) > 0
	case ast.IsInterfaceDeclaration(statement):
		declaration := statement.AsInterfaceDeclaration()
		return declaration != nil && declaration.TypeParameters != nil && len(declaration.TypeParameters.Nodes) > 0
	}
	return false
}

// isRunTypeValue reports whether a value's declared type is the marker
// module's `RunType<T>` — the by-return-type detection every recognition
// path shares.
func isRunTypeValue(tsType *checker.Type, markerOpts marker.Options) bool {
	return tsType != nil && builders.IsRunType(tsType, markerOpts)
}
