package resolver

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/comptimeargs"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/textpos"
)

// missingtypeargs.go — the SYNTACTIC half of the unresolved-generics model
// (MKR011). A generic type written WITHOUT its required type arguments
// (`getRunTypeId<A2>()` over `interface A2<S> {…}` with no default) is a tsc
// error (TS2314), but the vite dev lane doesn't typecheck, and the checker
// hands the scan the error type — plain `any`, indistinguishable from a legal
// `getRunTypeId<any>()` on the type side (empirically pinned in
// missing_typeargs_test.go). So this walk inspects the WRITTEN type-argument
// nodes instead: it finds a reference to a generic declaration whose written
// argument count is below the count of parameters WITHOUT defaults, descending
// through nested written arguments and through the bodies of the declarations
// it names (type-alias right-hand sides, interface and class members, their
// extends and implements clauses: the "generics chain"), and reports the first
// offender with Related sites at the default-less parameter's declaration and
// each declaration hop. Descent into a named declaration happens once per
// symbol, so a recursive type terminates.
//
// Parameters WITH defaults never trip this: the checker applies defaults at
// use sites, so `interface A<S extends string = string>` written bare is legal
// AND arrives fully resolved (`A<string>`) — pinned by the defaults matrix in
// the tests. References to type PARAMETERS are skipped here (MKR003/MKR010 own
// those), as are signature interiors (function/constructor type nodes and
// method members), mirroring marker.FindFreeTypeParameter's exemption.

// missingTypeArgsFinding is one written generic reference lacking required
// arguments: the referenced type's name, the first default-less parameter, and
// the Related breadcrumbs (parameter declaration first, then alias hops).
type missingTypeArgsFinding struct {
	TypeName  string
	ParamName string
	Related   []diagnostics.Related
}

// missingArgsNodeBudget bounds the written-syntax walk; type-argument lists are
// tiny, so the budget only matters for degenerate generated code.
const missingArgsNodeBudget = 256

// missingArgsMaxHops caps alias-chain breadcrumbs, matching the semantic
// walk's freeParamMaxHops.
const missingArgsMaxHops = 3

type missingArgsWalker struct {
	typeChecker *checker.Checker
	budget      int
	// visitedDeclarations guards declaration-body descent (alias, interface,
	// class) against recursive chains: each named declaration is entered once.
	visitedDeclarations map[*ast.Symbol]bool
}

// findMissingTypeArgs walks every written type-argument node of a marker call.
// typeArguments may be nil (inferred call) — nothing to check syntactically.
func findMissingTypeArgs(typeChecker *checker.Checker, typeArguments *ast.NodeList) (missingTypeArgsFinding, bool) {
	if typeArguments == nil || len(typeArguments.Nodes) == 0 {
		return missingTypeArgsFinding{}, false
	}
	walker := &missingArgsWalker{typeChecker: typeChecker, budget: missingArgsNodeBudget, visitedDeclarations: map[*ast.Symbol]bool{}}
	for _, node := range typeArguments.Nodes {
		if finding, found := walker.walk(node, nil); found {
			return finding, true
		}
	}
	return missingTypeArgsFinding{}, false
}

func (walker *missingArgsWalker) walk(node *ast.Node, hops []diagnostics.Related) (missingTypeArgsFinding, bool) {
	if node == nil || walker.budget <= 0 {
		return missingTypeArgsFinding{}, false
	}
	walker.budget--

	switch node.Kind {
	case ast.KindTypeReference:
		return walker.walkReference(node, hops)
	case ast.KindArrayType:
		return walker.walk(node.AsArrayTypeNode().ElementType, hops)
	case ast.KindParenthesizedType:
		return walker.walk(node.AsParenthesizedTypeNode().Type, hops)
	case ast.KindTypeOperator:
		// readonly T[] and friends.
		return walker.walk(node.AsTypeOperatorNode().Type, hops)
	case ast.KindNamedTupleMember:
		return walker.walk(node.AsNamedTupleMember().Type, hops)
	case ast.KindOptionalType:
		return walker.walk(node.AsOptionalTypeNode().Type, hops)
	case ast.KindRestType:
		return walker.walk(node.AsRestTypeNode().Type, hops)
	case ast.KindMappedType:
		return walker.walk(node.AsMappedTypeNode().Type, hops)
	case ast.KindIndexedAccessType:
		indexed := node.AsIndexedAccessTypeNode()
		if finding, found := walker.walk(indexed.ObjectType, hops); found {
			return finding, true
		}
		return walker.walk(indexed.IndexType, hops)
	case ast.KindConditionalType:
		conditional := node.AsConditionalTypeNode()
		for _, branch := range []*ast.Node{conditional.CheckType, conditional.ExtendsType, conditional.TrueType, conditional.FalseType} {
			if finding, found := walker.walk(branch, hops); found {
				return finding, true
			}
		}
	case ast.KindExpressionWithTypeArguments:
		// An `extends` / `implements` clause entry: the same reference shape as
		// a TypeReference, with the name in Expression.
		return walker.walkNamed(node.AsExpressionWithTypeArguments().Expression, node.AsExpressionWithTypeArguments().TypeArguments, hops)
	case ast.KindTupleType:
		for _, element := range node.AsTupleTypeNode().Elements.Nodes {
			if finding, found := walker.walk(element, hops); found {
				return finding, true
			}
		}
	case ast.KindUnionType:
		for _, member := range node.AsUnionTypeNode().Types.Nodes {
			if finding, found := walker.walk(member, hops); found {
				return finding, true
			}
		}
	case ast.KindIntersectionType:
		for _, member := range node.AsIntersectionTypeNode().Types.Nodes {
			if finding, found := walker.walk(member, hops); found {
				return finding, true
			}
		}
	case ast.KindTypeLiteral:
		return walker.walkMembers(node.AsTypeLiteralNode().Members, hops)
	}
	return missingTypeArgsFinding{}, false
}

// walkMembers descends the data members of a type literal, interface or class
// body: property and index signatures, class fields. Method / call /
// construct signatures are signature interiors — exempt.
func (walker *missingArgsWalker) walkMembers(members *ast.NodeList, hops []diagnostics.Related) (missingTypeArgsFinding, bool) {
	if members == nil {
		return missingTypeArgsFinding{}, false
	}
	for _, member := range members.Nodes {
		var typeNode *ast.Node
		switch member.Kind {
		case ast.KindPropertySignature:
			typeNode = member.AsPropertySignatureDeclaration().Type
		case ast.KindPropertyDeclaration:
			typeNode = member.AsPropertyDeclaration().Type
		case ast.KindIndexSignature:
			typeNode = member.AsIndexSignatureDeclaration().Type
		default:
			continue
		}
		if finding, found := walker.walk(typeNode, hops); found {
			return finding, true
		}
	}
	return missingTypeArgsFinding{}, false
}

func (walker *missingArgsWalker) walkReference(reference *ast.Node, hops []diagnostics.Related) (missingTypeArgsFinding, bool) {
	referenceNode := reference.AsTypeReferenceNode()
	return walker.walkNamed(referenceNode.TypeName, referenceNode.TypeArguments, hops)
}

// walkNamed checks one written reference to a named type (a TypeReference, or
// an extends / implements clause entry): its written arguments first, then
// the arity of the declaration it names, then that declaration's own body.
func (walker *missingArgsWalker) walkNamed(typeName *ast.Node, typeArguments *ast.NodeList, hops []diagnostics.Related) (missingTypeArgsFinding, bool) {
	// Nested written arguments first (`Box<A2>` — the offender may be inside).
	if typeArguments != nil {
		for _, argument := range typeArguments.Nodes {
			if finding, found := walker.walk(argument, hops); found {
				return finding, true
			}
		}
	}

	if typeName == nil {
		return missingTypeArgsFinding{}, false
	}
	symbol := walker.typeChecker.GetSymbolAtLocation(typeName)
	if symbol == nil {
		return missingTypeArgsFinding{}, false
	}
	symbol = comptimeargs.ResolveImportAlias(walker.typeChecker, symbol)
	if symbol == nil {
		return missingTypeArgsFinding{}, false
	}

	declaration := typeDeclarationOf(symbol)
	if declaration == nil {
		// A type parameter, enum, namespace, … — not a generic declaration this
		// check owns (type params belong to MKR003/MKR010).
		return missingTypeArgsFinding{}, false
	}

	written := 0
	if typeArguments != nil {
		written = len(typeArguments.Nodes)
	}
	if paramName, paramSite, required := firstDefaultlessParamPast(declaration, written); required {
		related := append([]diagnostics.Related{{
			Site:    paramSite,
			Message: "type parameter `" + paramName + "` is declared here without a default",
		}}, hops...)
		return missingTypeArgsFinding{TypeName: symbol.Name, ParamName: paramName, Related: related}, true
	}

	// Arity satisfied. Follow the declaration's body so a bare generic buried
	// in the chain (`type X = A2`, `interface Outer {b: A2}`, `class C extends
	// A2` → marker over the outer name) still surfaces at the marker call.
	// Each declaration is entered once, so a recursive type terminates.
	if walker.visitedDeclarations[symbol] {
		return missingTypeArgsFinding{}, false
	}
	walker.visitedDeclarations[symbol] = true
	if len(hops) < missingArgsMaxHops {
		if sourceFile := ast.GetSourceFileOfNode(declaration); sourceFile != nil {
			hops = append(hops[:len(hops):len(hops)], diagnostics.Related{
				Site:    textpos.NodeSite(sourceFile.FileName(), sourceFile, declaration),
				Message: "reached via " + declarationKindLabel(declaration) + " `" + symbol.Name + "`, declared here",
			})
		}
	}
	switch declaration.Kind {
	case ast.KindTypeAliasDeclaration:
		return walker.walk(declaration.AsTypeAliasDeclaration().Type, hops)
	case ast.KindInterfaceDeclaration:
		interfaceDeclaration := declaration.AsInterfaceDeclaration()
		if finding, found := walker.walkHeritage(interfaceDeclaration.HeritageClauses, hops); found {
			return finding, true
		}
		return walker.walkMembers(interfaceDeclaration.Members, hops)
	case ast.KindClassDeclaration:
		classDeclaration := declaration.AsClassDeclaration()
		if finding, found := walker.walkHeritage(classDeclaration.HeritageClauses, hops); found {
			return finding, true
		}
		return walker.walkMembers(classDeclaration.Members, hops)
	}
	return missingTypeArgsFinding{}, false
}

// walkHeritage descends every `extends` / `implements` clause entry of an
// interface or class: a parent written bare (`interface Outer extends Box {}`)
// is the same missing-arguments case as a member written bare.
func (walker *missingArgsWalker) walkHeritage(clauses *ast.NodeList, hops []diagnostics.Related) (missingTypeArgsFinding, bool) {
	if clauses == nil {
		return missingTypeArgsFinding{}, false
	}
	for _, clause := range clauses.Nodes {
		heritage := clause.AsHeritageClause()
		if heritage == nil || heritage.Types == nil {
			continue
		}
		for _, entry := range heritage.Types.Nodes {
			if finding, found := walker.walk(entry, hops); found {
				return finding, true
			}
		}
	}
	return missingTypeArgsFinding{}, false
}

// typeDeclarationOf returns the symbol's interface / class / type-alias
// declaration, or nil when the symbol is not a (potentially generic) type
// declaration. Merged interfaces: the first declaration carries the parameter
// list (TS requires merged declarations to agree on it).
func typeDeclarationOf(symbol *ast.Symbol) *ast.Node {
	for _, declaration := range symbol.Declarations {
		if declaration == nil {
			continue
		}
		switch declaration.Kind {
		case ast.KindInterfaceDeclaration, ast.KindClassDeclaration, ast.KindTypeAliasDeclaration:
			return declaration
		}
	}
	return nil
}

// firstDefaultlessParamPast reports whether declaration requires more type
// arguments than were written, returning the first unsatisfied default-less
// parameter's name + declaration site. TS mandates defaulted parameters come
// last, so "the first default-less parameter at index >= written" is exactly
// the first unsatisfied requirement.
func firstDefaultlessParamPast(declaration *ast.Node, written int) (string, diagnostics.Site, bool) {
	for index, parameter := range declaration.TypeParameters() {
		if index < written || parameter == nil {
			continue
		}
		if parameter.AsTypeParameterDeclaration().DefaultType != nil {
			continue
		}
		name := ""
		if nameNode := parameter.Name(); nameNode != nil {
			name = nameNode.Text()
		}
		site := diagnostics.Site{}
		if sourceFile := ast.GetSourceFileOfNode(parameter); sourceFile != nil {
			site = textpos.NodeSite(sourceFile.FileName(), sourceFile, parameter)
		}
		return name, site, true
	}
	return "", diagnostics.Site{}, false
}

// declarationKindLabel names a declaration kind for the breadcrumb message.
func declarationKindLabel(declaration *ast.Node) string {
	switch declaration.Kind {
	case ast.KindInterfaceDeclaration:
		return "interface"
	case ast.KindClassDeclaration:
		return "class"
	}
	return "alias"
}
