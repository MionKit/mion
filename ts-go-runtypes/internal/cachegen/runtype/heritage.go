package runtype

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
)

// collectImplementsTypes resolves the `implements` clause of a class
// symbol's declaration to its concrete checker types. Returns nil for
// symbols without a class declaration or without an implements clause.
//
// Why we walk the AST rather than ask the checker directly: the tsgo
// checker resolves implements internally only for diagnostic purposes
// (assignability checks against the class body). There's no public
// "GetImplementsOfClass" API, so we replicate the small piece we need —
// walk the heritage clauses, find the `implements` entries, resolve
// each via GetTypeFromTypeNode. Mirrors the same pattern the tsgo
// checker uses internally at
// third_party/tsgolint/typescript-go/internal/checker/checker.go:4259.
func collectImplementsTypes(typeChecker *checker.Checker, symbol *ast.Symbol) []*checker.Type {
	declarations := symbol.Declarations
	if symbol.ValueDeclaration != nil {
		declarations = append([]*ast.Node{symbol.ValueDeclaration}, declarations...)
	}
	for _, declaration := range declarations {
		if declaration == nil {
			continue
		}
		elements := ast.GetImplementsHeritageClauseElements(declaration)
		if len(elements) == 0 {
			continue
		}
		out := make([]*checker.Type, 0, len(elements))
		for _, element := range elements {
			if element == nil {
				continue
			}
			implementedType := typeChecker.GetTypeFromTypeNode(element)
			if implementedType == nil {
				continue
			}
			out = append(out, implementedType)
		}
		if len(out) > 0 {
			return out
		}
	}
	return nil
}
