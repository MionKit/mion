package resolver

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/mionkit/ts-runtypes/internal/cachegen/runtype/typeid"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/textpos"
)

// detectNonEnumerableRequired walks a file's property declarations for ones
// tagged `@nonEnumerable` in JSDoc that are NOT optional, emitting NE001. The
// guard the tag requests applies only to optional properties (the invariant
// GUARDED ⇒ OPTIONAL-in-type keeps `DataOnly<T>` accurate), so a required
// tagged property is a silent no-op — this tells the user to add `?`.
//
// The check is purely syntactic (JSDoc tag + `?` token), so it needs no type
// checker. A cheap text pre-filter skips the AST walk entirely for the ~all
// files that never mention the tag.
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

// isPropertyMember reports whether node is a class property or interface /
// object-type property signature — the declarations whose optionality and
// `@nonEnumerable` tag the guard reads.
func isPropertyMember(node *ast.Node) bool {
	return ast.IsPropertyDeclaration(node) || ast.IsPropertySignatureDeclaration(node)
}

// hasNonEnumerableJSDocTag reports whether the node carries a `@nonEnumerable`
// JSDoc tag (parsed as a JSDocUnknownTag). Mirrors typeid.hasNonEnumerableTag,
// which reads the same tag off the property SYMBOL during projection.
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

// propertyMemberName returns the property's declared name for the diagnostic
// message, or "" when it has no simple identifier/string name.
func propertyMemberName(node *ast.Node) string {
	name := node.Name()
	if name == nil {
		return ""
	}
	return name.Text()
}
