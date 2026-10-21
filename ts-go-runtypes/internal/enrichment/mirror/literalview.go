package mirror

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment"
)

// astLiteralView adapts a tsgo ObjectLiteralExpression to the enrichment.LiteralView the paired checkers walk.
type astLiteralView struct {
	literal *ast.Node
	byKey   map[string]*ast.Node // property-assignment INITIALIZER expression by key
	keys    []string
}

// NewASTLiteralView builds an enrichment.LiteralView over an ObjectLiteralExpression node.
func NewASTLiteralView(literal *ast.Node) enrichment.LiteralView {
	return newASTLiteralView(literal)
}

// newASTLiteralView builds a view over an ObjectLiteralExpression node.
func newASTLiteralView(literal *ast.Node) *astLiteralView {
	view := &astLiteralView{literal: literal, byKey: map[string]*ast.Node{}}
	for _, property := range literal.AsObjectLiteralExpression().Properties.Nodes {
		if property == nil || !ast.IsPropertyAssignment(property) {
			continue // spreads, shorthands and methods are not data the checks read
		}
		assignment := property.AsPropertyAssignment()
		name := property.Name()
		if name == nil || assignment.Initializer == nil {
			continue
		}
		key := name.Text()
		if _, seen := view.byKey[key]; !seen {
			view.keys = append(view.keys, key)
		}
		view.byKey[key] = assignment.Initializer
	}
	return view
}

// Keys lists the literal's property keys in declaration order.
func (view *astLiteralView) Keys() []string {
	return view.keys
}

// Child returns the view bound to key, nil when that key's value is not an object literal.
func (view *astLiteralView) Child(key string) enrichment.LiteralView {
	value := view.byKey[key]
	if value == nil || !ast.IsObjectLiteralExpression(value) {
		return nil
	}
	return newASTLiteralView(value)
}

// StringValue returns the string-literal value bound to key.
func (view *astLiteralView) StringValue(key string) (string, bool) {
	value := view.byKey[key]
	if value == nil || !ast.IsStringLiteral(value) {
		return "", false
	}
	return value.Text(), true
}
