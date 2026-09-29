// Package apiimports checks how a client file imports the API type it hands to `initClient<Api>()`: that type
// names server code, so a value import puts the server module in the client bundle. It reads the call alone, so
// no setting names a client or a server directory and the build and the editor agree.
package apiimports

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/scanner"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/apimeta"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/textpos"
)

// CheckSourceFile reports each import that brings a name of an `initClient` type argument into the file without
// `type`, once per import statement; filePath is what the sites echo.
func CheckSourceFile(typeChecker *checker.Checker, markerOpts marker.Options, sourceFile *ast.SourceFile, filePath string) []diagnostics.Diagnostic {
	if sourceFile == nil || sourceFile.IsDeclarationFile || !strings.Contains(sourceFile.Text(), apimeta.InitClientName) {
		return nil
	}
	var found []diagnostics.Diagnostic
	reported := map[*ast.Node]bool{}
	var walk ast.Visitor
	walk = func(node *ast.Node) bool {
		if node.Kind == ast.KindCallExpression && node.TypeArguments() != nil && apimeta.IsInitClientCall(typeChecker, markerOpts, node) {
			for _, typeArgument := range node.TypeArguments() {
				for _, name := range typeNames(typeArgument) {
					statement, specifier := valueImportOf(typeChecker, name)
					if statement == nil || reported[statement] {
						continue
					}
					reported[statement] = true
					found = append(found, diagnostics.New(diagnostics.CodeServerImportInClient, site(sourceFile, statement, filePath), name.Text(), specifier))
				}
			}
		}
		node.ForEachChild(walk)
		return false
	}
	sourceFile.AsNode().ForEachChild(walk)
	return found
}

// typeNames lists the first identifier of every type reference and `typeof` query in a type argument.
func typeNames(typeArgument *ast.Node) []*ast.Node {
	var names []*ast.Node
	var walk ast.Visitor
	walk = func(node *ast.Node) bool {
		switch node.Kind {
		case ast.KindTypeReference:
			names = append(names, ast.GetFirstIdentifier(node.AsTypeReferenceNode().TypeName))
		case ast.KindTypeQuery:
			names = append(names, ast.GetFirstIdentifier(node.AsTypeQueryNode().ExprName))
		}
		node.ForEachChild(walk)
		return false
	}
	walk(typeArgument)
	return names
}

// valueImportOf returns the import statement that binds name and its module specifier, unless the binding is
// type-only or not an import at all.
func valueImportOf(typeChecker *checker.Checker, name *ast.Node) (*ast.Node, string) {
	if name == nil || !ast.IsIdentifier(name) {
		return nil, ""
	}
	symbol := typeChecker.GetSymbolAtLocation(name)
	if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias == 0 {
		return nil, ""
	}
	declaration := checker.Checker_getDeclarationOfAliasSymbol(typeChecker, symbol)
	if declaration == nil || ast.IsTypeOnlyImportDeclaration(declaration) {
		return nil, ""
	}
	for node := declaration; node != nil; node = node.Parent {
		if ast.IsImportDeclaration(node) {
			return node, node.AsImportDeclaration().ModuleSpecifier.Text()
		}
	}
	return nil, ""
}

// site anchors at the statement's first token, not its leading trivia, so a directive comment above it applies.
func site(sourceFile *ast.SourceFile, statement *ast.Node, filePath string) diagnostics.Site {
	startLine, startCol := textpos.LineCol(sourceFile, scanner.GetTokenPosOfNode(statement, sourceFile, false))
	endLine, endCol := textpos.LineCol(sourceFile, statement.End())
	return diagnostics.Site{FilePath: filePath, StartLine: startLine, StartCol: startCol, EndLine: endLine, EndCol: endCol}
}
