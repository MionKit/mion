package marker

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/bundled"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/tspath"
)

// writtenRefNodeBudget bounds one EachWrittenTypeRef walk; it only matters for generated code.
const writtenRefNodeBudget = 4096

// bundledLibPrefix is the bundled default-lib directory; a reference into `lib.*.d.ts` is never
// followed (not the user's to fix, and the bodies are huge).
var bundledLibPrefix = tspath.NormalizePath(bundled.LibPath())

// EachWrittenTypeRef visits every TypeReference under root and in each declaration one names; `via` is the name chain.
// Syntax-side twin of reflection.WalkGraph: a gate reading only a declaration's own syntax misses a broken type one deeper.
func EachWrittenTypeRef(typeChecker *checker.Checker, root *ast.Node, visit func(reference *ast.Node, via []string)) {
	eachWrittenNode(typeChecker, root, func(node *ast.Node, via []string) {
		if ast.IsTypeReferenceNode(node) {
			visit(node, via)
		}
	})
}

// EachWrittenTypeName visits the first identifier of each type reference and `typeof` query EachWrittenTypeRef's walk meets.
func EachWrittenTypeName(typeChecker *checker.Checker, root *ast.Node, visit func(name *ast.Node)) {
	eachWrittenNode(typeChecker, root, func(node *ast.Node, _ []string) {
		switch node.Kind {
		case ast.KindTypeReference:
			visit(ast.GetFirstIdentifier(node.AsTypeReferenceNode().TypeName))
		case ast.KindTypeQuery:
			visit(ast.GetFirstIdentifier(node.AsTypeQueryNode().ExprName))
		}
	})
}

// eachWrittenNode visits every node written under root and under each declaration a TypeReference names.
func eachWrittenNode(typeChecker *checker.Checker, root *ast.Node, visit func(node *ast.Node, via []string)) {
	if typeChecker == nil || root == nil {
		return
	}
	budget := writtenRefNodeBudget
	visited := map[*ast.Symbol]bool{}
	var walk func(node *ast.Node, via []string)
	walk = func(node *ast.Node, via []string) {
		if node == nil || budget <= 0 {
			return
		}
		budget--
		visit(node, via)
		if ast.IsTypeReferenceNode(node) {
			if declaration, name := followedDeclaration(typeChecker, node.AsTypeReferenceNode().TypeName, visited); declaration != nil {
				walk(declaration, append(via[:len(via):len(via)], name))
			}
		}
		node.ForEachChild(func(child *ast.Node) bool {
			walk(child, via)
			return false
		})
	}
	walk(root, nil)
}

// followedDeclaration resolves a written type name to the interface, class
// or type-alias declaration it names, once per symbol, skipping the bundled
// lib and node_modules. Returns nil when there is nothing to follow.
func followedDeclaration(typeChecker *checker.Checker, typeName *ast.Node, visited map[*ast.Symbol]bool) (*ast.Node, string) {
	if typeName == nil {
		return nil, ""
	}
	symbol := typeChecker.GetSymbolAtLocation(typeName)
	for i := 0; i < 16 && symbol != nil && symbol.Flags&ast.SymbolFlagsAlias != 0; i++ {
		next := checker.Checker_getImmediateAliasedSymbol(typeChecker, symbol)
		if next == nil || next == symbol {
			break
		}
		symbol = next
	}
	if symbol == nil || visited[symbol] {
		return nil, ""
	}
	visited[symbol] = true
	for _, declaration := range symbol.Declarations {
		if declaration == nil {
			continue
		}
		switch declaration.Kind {
		case ast.KindInterfaceDeclaration, ast.KindClassDeclaration, ast.KindTypeAliasDeclaration:
		default:
			continue
		}
		sourceFile := ast.GetSourceFileOfNode(declaration)
		if sourceFile == nil {
			continue
		}
		fileName := tspath.NormalizePath(sourceFile.FileName())
		if strings.HasPrefix(fileName, bundledLibPrefix) || strings.Contains(fileName, "/node_modules/") {
			return nil, ""
		}
		return declaration, symbol.Name
	}
	return nil, ""
}
