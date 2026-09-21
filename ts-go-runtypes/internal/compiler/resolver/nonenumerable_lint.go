package resolver

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/runtype/typeid"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/textpos"
)

// detectNonEnumerableRequired emits NE001 for a `@nonEnumerable` property that is NOT optional: the
// guard the tag requests applies only to optional properties (the invariant GUARDED ⇒ OPTIONAL-in-type
// keeps `DataOnly<T>` accurate), so a required tagged property is a silent no-op until `?` is added.
// The check is purely syntactic, so it needs no type checker, and the text pre-filter skips the AST
// walk for the ~all files that never mention the tag.
func detectNonEnumerableRequired(file string, sourceFile *ast.SourceFile) []diagnostics.Diagnostic {
	if sourceFile == nil {
		return nil
	}
	if !strings.Contains(sourceFile.Text(), typeid.NonEnumerableTagName) {
		return nil
	}
	var out []diagnostics.Diagnostic
	var walk func(node *ast.Node)
	walk = func(node *ast.Node) {
		if node == nil {
			return
		}
		if isPropertyMember(node) && !ast.HasQuestionToken(node) && hasNonEnumerableJSDocTag(node, sourceFile) {
			out = append(out, diagnostics.New(
				diagnostics.CodeNonEnumerableRequiresOptional,
				textpos.NodeSite(file, sourceFile, node),
				propertyMemberName(node),
			))
		}
		node.ForEachChild(func(child *ast.Node) bool {
			walk(child)
			return false
		})
	}
	walk(sourceFile.AsNode())
	return out
}

// isPropertyMember reports a class property or property signature, the declarations the guard reads.
func isPropertyMember(node *ast.Node) bool {
	return ast.IsPropertyDeclaration(node) || ast.IsPropertySignatureDeclaration(node)
}

// hasNonEnumerableJSDocTag mirrors typeid.hasNonEnumerableTag, which reads the same tag off the property SYMBOL.
func hasNonEnumerableJSDocTag(node *ast.Node, sourceFile *ast.SourceFile) bool {
	for _, jsdoc := range node.JSDoc(sourceFile) {
		tags := jsdoc.AsJSDoc().Tags
		if tags == nil {
			continue
		}
		for _, tag := range tags.Nodes {
			if !ast.IsJSDocUnknownTag(tag) {
				continue
			}
			if tagName := tag.TagName(); tagName != nil && tagName.Text() == typeid.NonEnumerableTagName {
				return true
			}
		}
	}
	return false
}

// propertyMemberName returns the property's declared name for the diagnostic message.
func propertyMemberName(node *ast.Node) string {
	name := node.Name()
	if name == nil {
		return ""
	}
	return name.Text()
}
