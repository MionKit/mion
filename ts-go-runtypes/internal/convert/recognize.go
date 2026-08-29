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
	"github.com/mionkit/ts-runtypes/internal/tsimports"
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
	// EscapePair marks the LAZY PAIR spelling: a real type declaration plus a
	// `const xRT = getRunType<Name>()` handle. The type stays real so a
	// recursive knot closes lazily (escape type text cannot hold `RT.self()`,
	// and an `InferType<typeof constRT>` chain would collapse it to `any`).
	// Stmt is the TYPE statement (NameNode its name — resolution goes through
	// the declared type), AliasStmt the const statement, ConstNameNode the
	// const's identifier (the symbol the still-used guard checks).
	EscapePair    bool
	ConstNameNode *ast.Node
	// Drizzle marks a mion drizzle TABLE declaration (either road), which
	// converts through the dedicated arm in drizzle.go — never the generic
	// printers, and never the id oracle (a table's declared-type id moves with
	// the road by design; the model ids are the invariant, pinned JS-side).
	Drizzle bool
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
	typeofAliases := map[string]*ast.Node{}
	typeofDecls := map[string]*declaration{}
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
			var declForStatement *declaration
			if drizzleDecl := drizzleTypeAlias(statement, typeChecker); drizzleDecl != nil {
				declForStatement = drizzleDecl
			} else {
				declForStatement = typeFormDeclaration(statement)
			}
			decls = append(decls, declForStatement)
			// A `typeof c` alias may be a drizzle pair's name half; recorded so
			// pairDrizzleDecls can claim (and consume) it when c is a drizzle
			// const; otherwise it stays the candidate created above.
			if constName, ok := typeofAliasTarget(statement); ok {
				typeofAliases[constName] = statement
				typeofDecls[constName] = declForStatement
			}
		case ast.IsInterfaceDeclaration(statement):
			decls = append(decls, typeFormDeclaration(statement))
		case ast.IsVariableStatement(statement):
			if drizzleDecl := drizzleConstForm(statement, typeChecker); drizzleDecl != nil {
				decls = append(decls, drizzleDecl)
				continue
			}
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
	decls = pairDrizzleDecls(typeChecker, decls, typeofAliases, typeofDecls)
	return pairEscapeConsts(decls, typeChecker, markerOpts)
}

// pairEscapeConsts merges `const xRT = getRunType<Name>()` with the same-file
// type declaration `Name` into ONE builders-form declaration (see EscapePair).
// The pair IS the builders spelling of that type: a builders run leaves it
// alone (fixpoint) and a type run collapses it back to the type declaration,
// through the same alias-drop and const-still-used machinery the
// `InferType<typeof c>` pairing rides.
func pairEscapeConsts(decls []*declaration, typeChecker *checker.Checker, markerOpts marker.Options) []*declaration {
	typeDeclByName := map[string]*declaration{}
	for _, decl := range decls {
		if decl.Form == TargetType && decl.Name != "" {
			typeDeclByName[decl.Name] = decl
		}
	}
	if len(typeDeclByName) == 0 {
		return decls
	}
	consumed := map[*declaration]bool{}
	for _, decl := range decls {
		// Only an alias-less builders const can be the handle half.
		if decl.ConstName == "" || decl.AliasStmt != nil || decl.Form != TargetBuilders {
			continue
		}
		targetName, ok := getRunTypeEscapeTarget(constInitializer(decl.Stmt), typeChecker, markerOpts)
		if !ok {
			continue
		}
		typeDecl := typeDeclByName[targetName]
		if typeDecl == nil || typeDecl.Generic || typeDecl.EscapePair {
			continue
		}
		typeDecl.Form = TargetBuilders
		typeDecl.EscapePair = true
		typeDecl.ConstName = decl.ConstName
		typeDecl.ConstNameNode = decl.NameNode
		typeDecl.AliasStmt = decl.Stmt
		consumed[decl] = true
	}
	if len(consumed) == 0 {
		return decls
	}
	kept := decls[:0]
	for _, decl := range decls {
		if !consumed[decl] {
			kept = append(kept, decl)
		}
	}
	return kept
}

// constNameNode returns the identifier the CONST symbol resolves through: a
// lazy pair's NameNode is the TYPE's name, so the const identifier rides
// ConstNameNode; every other const form keeps NameNode.
func constNameNode(decl *declaration) *ast.Node {
	if decl.ConstNameNode != nil {
		return decl.ConstNameNode
	}
	return decl.NameNode
}

// constInitializer extracts the single declarator's initializer from a
// recognized const statement.
func constInitializer(statement *ast.Node) *ast.Node {
	variableStatement := statement.AsVariableStatement()
	if variableStatement == nil || variableStatement.DeclarationList == nil {
		return nil
	}
	declarationList := variableStatement.DeclarationList.AsVariableDeclarationList()
	if declarationList == nil || len(declarationList.Declarations.Nodes) != 1 {
		return nil
	}
	declarator := declarationList.Declarations.Nodes[0].AsVariableDeclaration()
	if declarator == nil {
		return nil
	}
	return declarator.Initializer
}

// getRunTypeEscapeTarget reports whether the initializer is exactly the lazy
// pair's handle call — the package's `getRunType` with ONE bare-identifier
// type argument and no value arguments — returning the named type. Any other
// shape (a value-form call, an inline type argument, a local helper) is not
// the pair spelling.
func getRunTypeEscapeTarget(initializer *ast.Node, typeChecker *checker.Checker, markerOpts marker.Options) (string, bool) {
	if initializer == nil || initializer.Kind != ast.KindCallExpression {
		return "", false
	}
	call := initializer.AsCallExpression()
	if call.Arguments != nil && len(call.Arguments.Nodes) > 0 {
		return "", false
	}
	if call.TypeArguments == nil || len(call.TypeArguments.Nodes) != 1 {
		return "", false
	}
	argument := call.TypeArguments.Nodes[0]
	if argument.Kind != ast.KindTypeReference {
		return "", false
	}
	typeRef := argument.AsTypeReferenceNode()
	if typeRef == nil || typeRef.TypeArguments != nil || typeRef.TypeName == nil || !ast.IsIdentifier(typeRef.TypeName) {
		return "", false
	}
	if !builders.IsBuilderLeafCall(typeChecker, initializer, markerOpts) {
		return "", false
	}
	callee := call.Expression
	if callee == nil {
		return "", false
	}
	nameNode := callee
	if ast.IsPropertyAccessExpression(callee) {
		nameNode = callee.AsPropertyAccessExpression().Name()
	}
	if nameNode == nil || !ast.IsIdentifier(nameNode) || !referencedThroughPackageImport(typeChecker, nameNode) {
		return "", false
	}
	if importedNameOf(typeChecker, nameNode) != "getRunType" {
		return "", false
	}
	return typeRef.TypeName.Text(), true
}

// importedNameOf resolves an identifier to the name it was IMPORTED under,
// seeing through a local alias. Shared with the drizzle-migrate arm.
func importedNameOf(typeChecker *checker.Checker, nameNode *ast.Node) string {
	return tsimports.ImportedNameOf(typeChecker, nameNode)
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
