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
// through nested written arguments and through type-alias bodies (the
// "generics chain"), and reports the first offender with Related sites at the
// default-less parameter's declaration and each alias hop.
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
	// visitedAliases guards alias-body descent against recursive alias chains.
	visitedAliases map[*ast.Symbol]bool
}

// findMissingTypeArgs walks every written type-argument node of a marker call.
// typeArguments may be nil (inferred call) — nothing to check syntactically.
func findMissingTypeArgs(typeChecker *checker.Checker, typeArguments *ast.NodeList) (missingTypeArgsFinding, bool) {
	if typeArguments == nil || len(typeArguments.Nodes) == 0 {
		return missingTypeArgsFinding{}, false
	}
	walker := &missingArgsWalker{typeChecker: typeChecker, budget: missingArgsNodeBudget, visitedAliases: map[*ast.Symbol]bool{}}
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
		for _, member := range node.AsTypeLiteralNode().Members.Nodes {
			// Data members only: property + index signatures. Method / call /
			// construct signatures are signature interiors — exempt.
			switch member.Kind {
			case ast.KindPropertySignature:
				if finding, found := walker.walk(member.AsPropertySignatureDeclaration().Type, hops); found {
					return finding, true
				}
			case ast.KindIndexSignature:
				if finding, found := walker.walk(member.AsIndexSignatureDeclaration().Type, hops); found {
					return finding, true
				}
			}
		}
	}
	return missingTypeArgsFinding{}, false
}

func (walker *missingArgsWalker) walkReference(reference *ast.Node, hops []diagnostics.Related) (missingTypeArgsFinding, bool) {
	referenceNode := reference.AsTypeReferenceNode()

	// Nested written arguments first (`Box<A2>` — the offender may be inside).
	if referenceNode.TypeArguments != nil {
		for _, argument := range referenceNode.TypeArguments.Nodes {
			if finding, found := walker.walk(argument, hops); found {
				return finding, true
			}
		}
	}

	typeName := referenceNode.TypeName
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
	if referenceNode.TypeArguments != nil {
		written = len(referenceNode.TypeArguments.Nodes)
	}
	if paramName, paramSite, required := firstDefaultlessParamPast(declaration, written); required {
		related := append([]diagnostics.Related{{
			Site:    paramSite,
			Message: "type parameter `" + paramName + "` is declared here without a default",
		}}, hops...)
		return missingTypeArgsFinding{TypeName: symbol.Name, ParamName: paramName, Related: related}, true
	}

	// Arity satisfied. Follow a type ALIAS body so a bare generic buried in the
	// chain (`type X = A2` → marker over `X`) still surfaces at the marker call.
	if declaration.Kind == ast.KindTypeAliasDeclaration && !walker.visitedAliases[symbol] {
		walker.visitedAliases[symbol] = true
		if len(hops) < missingArgsMaxHops {
			if sourceFile := ast.GetSourceFileOfNode(declaration); sourceFile != nil {
				hops = append(hops[:len(hops):len(hops)], diagnostics.Related{
					Site:    textpos.NodeSite(sourceFile.FileName(), sourceFile, declaration),
					Message: "reached via alias `" + symbol.Name + "`, declared here",
				})
			}
		}
		return walker.walk(declaration.AsTypeAliasDeclaration().Type, hops)
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
