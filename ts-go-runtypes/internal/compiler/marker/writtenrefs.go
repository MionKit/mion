package marker

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/bundled"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/tspath"
)

// writtenRefNodeBudget bounds one EachWrittenTypeRef walk. A declaration
// closure is small; the budget only matters for degenerate generated code.
const writtenRefNodeBudget = 4096

// bundledLibPrefix is the bundled default-lib directory: a reference into
// `lib.*.d.ts` is never followed (the lib is not the user's to fix, and its
// bodies are huge).
var bundledLibPrefix = tspath.NormalizePath(bundled.LibPath())

// EachWrittenTypeRef visits every TypeReference node written under root,
// then follows each reference into the interface, class or type-alias
// declaration it names and visits that declaration's written syntax too,
// each declaration once. `via` is the chain of declaration names the walk
// went through to reach the reference (empty for one written under root).
//
// This is the syntax-side twin of reflection.WalkGraph: a refusal gate that
// looks at a declaration's OWN syntax only ("does this declaration write a
// name that failed to resolve?") is blind to the same failure one
// declaration deeper (`interface Payload {user: User}` over a broken `User`),
// and both convert and enrich had exactly that gap. Declarations in the
// bundled default lib and under node_modules are not followed: they are not
// the user's to fix, so a gate has nothing to tell them about.
func EachWrittenTypeRef(typeChecker *checker.Checker, root *ast.Node, visit func(reference *ast.Node, via []string)) {
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
		if ast.IsTypeReferenceNode(node) {
			visit(node, via)
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
