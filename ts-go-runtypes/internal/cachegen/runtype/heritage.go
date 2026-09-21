package runtype

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
)

// collectImplementsTypes resolves a class symbol's `implements` clause to concrete checker types, nil when the
// symbol has no class declaration or no implements clause. Walked over the AST because tsgo resolves implements
// internally for diagnostics only and exposes no "GetImplementsOfClass"; same pattern the tsgo checker uses at
// third_party/tsgolint/typescript-go/internal/checker/checker.go.
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
