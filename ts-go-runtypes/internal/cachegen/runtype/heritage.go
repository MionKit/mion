package runtype

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
)

// safeGetBaseTypes calls Checker.GetBaseTypes on tsType, but works
// around tsgo's internal crash on Reference instantiations (e.g.
// `A<string>`) where the InterfaceType data isn't directly attached
// to the Reference object. For Reference types we route to the
// Target — the un-instantiated class/interface that actually carries
// the resolved-base-types slot.
//
// Returns nil for types where neither path applies (e.g. type
// literals, function types). Never panics.
func safeGetBaseTypes(typeChecker *checker.Checker, tsType *checker.Type) []*checker.Type {
	if tsType == nil {
		return nil
	}
	objectFlags := tsType.ObjectFlags()
	if objectFlags&checker.ObjectFlagsClassOrInterface != 0 {
		return typeChecker.GetBaseTypes(tsType)
	}
	if objectFlags&checker.ObjectFlagsReference != 0 {
		target := tsType.Target()
		if target != nil && target.ObjectFlags()&checker.ObjectFlagsClassOrInterface != 0 {
			return typeChecker.GetBaseTypes(target)
		}
	}
	return nil
}

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
