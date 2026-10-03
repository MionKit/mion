package batchcompile

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/scanner"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// privateToProtectedSplices rewrites each class member's `private` keyword to `protected` for the declaration emit only:
// tsgo writes a private member as `private name;` with its type erased, which a consumer could only read as `any`
// (MKR016). Protected keeps the type and the imports it uses, keeps the class nominal, and stays unreadable from
// outside. A `private constructor` stays: it erases nothing.
func privateToProtectedSplices(original *program.Program) []protocol.Replacement {
	var out []protocol.Replacement
	for _, sourceFile := range original.TS.SourceFiles() {
		if sourceFile == nil || sourceFile.IsDeclarationFile || original.TS.IsSourceFileFromExternalLibrary(sourceFile) {
			continue
		}
		var visit func(node *ast.Node) bool
		visit = func(node *ast.Node) bool {
			if ast.IsClassLike(node) {
				for _, member := range node.Members() {
					for _, keyword := range privateKeywords(member) {
						start := scanner.GetTokenPosOfNode(keyword, sourceFile, false)
						out = append(out, protocol.Replacement{File: sourceFile.FileName(), Start: start, End: keyword.End(), Text: "protected"})
					}
				}
			}
			node.ForEachChild(visit)
			return false
		}
		sourceFile.AsNode().ForEachChild(visit)
	}
	return out
}

// privateKeywords returns the `private` modifier of a field, method or accessor, or of each constructor parameter property.
func privateKeywords(member *ast.Node) []*ast.Node {
	switch member.Kind {
	case ast.KindPropertyDeclaration, ast.KindMethodDeclaration, ast.KindGetAccessor, ast.KindSetAccessor:
		if keyword := privateModifier(member); keyword != nil {
			return []*ast.Node{keyword}
		}
	case ast.KindConstructor:
		var keywords []*ast.Node
		for _, parameter := range member.Parameters() {
			if keyword := privateModifier(parameter); keyword != nil {
				keywords = append(keywords, keyword)
			}
		}
		return keywords
	}
	return nil
}

func privateModifier(node *ast.Node) *ast.Node {
	modifiers := node.Modifiers()
	if modifiers == nil {
		return nil
	}
	for _, modifier := range modifiers.Nodes {
		if modifier.Kind == ast.KindPrivateKeyword {
			return modifier
		}
	}
	return nil
}
