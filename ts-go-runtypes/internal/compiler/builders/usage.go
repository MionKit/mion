package builders

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
)

// The unused-builder-const elision analysis: a builder call whose result is provably unused in its own file
// needs no reflection graph, so the scanner drops the site and `builderResult(undefined, carrier)` returns
// the carrier nobody reads. The verdict is DEFAULT-DENY, only a `typeof myRT` in TYPE position counts as a
// non-use. An exported const is ALWAYS kept: the analysis is per-file, and a cross-file use index would need
// dev-server invalidation of OTHER files' transforms.

// IsValueBuilderCall excludes `getRunType`, which returns a RunType but THROWS without its injected id, so
// its sites are never elidable; a builder falls back to its carrier instead.
func IsValueBuilderCall(typeChecker *checker.Checker, call *ast.Node, markerOpts marker.Options) bool {
	if typeChecker == nil || call == nil || call.Kind != ast.KindCallExpression {
		return false
	}
	if IsIdLookupCall(typeChecker, call, markerOpts) {
		return false
	}
	signature := checker.Checker_getResolvedSignature(typeChecker, call, nil, 0)
	if signature == nil {
		return false
	}
	return IsRunType(checker.Checker_getReturnTypeOfSignature(typeChecker, signature), markerOpts)
}

// UnusedBuilderConst reports a result discarded outright, or bound to a non-exported `const` whose only
// references are type-only. Callers gate on IsValueBuilderCall first.
func UnusedBuilderConst(typeChecker *checker.Checker, call *ast.Node) bool {
	if typeChecker == nil || call == nil {
		return false
	}
	consumer := resultConsumer(call)
	if consumer == nil {
		return false
	}
	if consumer.Kind == ast.KindExpressionStatement {
		return true
	}
	// The const-binding lane; GetCombinedModifierFlags walks up to the VariableStatement for the export modifier.
	nameNode := consumer.Name()
	if nameNode == nil || !ast.IsIdentifier(nameNode) {
		return false
	}
	list := consumer.Parent
	if list == nil || list.Flags&ast.NodeFlagsConst == 0 {
		return false
	}
	if ast.GetCombinedModifierFlags(consumer)&ast.ModifierFlagsExport != 0 {
		return false
	}
	symbol := typeChecker.GetSymbolAtLocation(nameNode)
	if symbol == nil {
		return false
	}
	sourceFile := ast.GetSourceFileOfNode(call)
	if sourceFile == nil {
		return false
	}
	return !symbolValueUsed(typeChecker, symbol, nameNode, sourceFile.AsNode())
}

// resultConsumer climbs through wrappers that pass the value along unchanged to the node that CONSUMES the
// result. Nil for every other consumer, which means "used" to the caller.
func resultConsumer(call *ast.Node) *ast.Node {
	node := call
	for {
		parent := node.Parent
		if parent == nil {
			return nil
		}
		switch parent.Kind {
		case ast.KindParenthesizedExpression, ast.KindAsExpression, ast.KindSatisfiesExpression, ast.KindNonNullExpression:
			node = parent
		case ast.KindExpressionStatement:
			return parent
		case ast.KindVariableDeclaration:
			declaration := parent.AsVariableDeclaration()
			if declaration != nil && declaration.Initializer == node {
				return parent
			}
			return nil
		default:
			return nil
		}
	}
}

// symbolValueUsed reports whether any identifier resolving to `symbol`, the declaration's own name aside,
// sits in a VALUE position. Mirrors the reference walk of convert's constUseIndex (internal/convert/set.go).
func symbolValueUsed(typeChecker *checker.Checker, symbol *ast.Symbol, declNameNode *ast.Node, root *ast.Node) bool {
	name := declNameNode.Text()
	used := false
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil || used {
			return false
		}
		if ast.IsIdentifier(node) && node != declNameNode && node.Text() == name {
			if resolved := typeChecker.GetSymbolAtLocation(node); resolved != nil {
				if target := checker.SkipAlias(resolved, typeChecker); target != nil {
					resolved = target
				}
				if resolved == symbol && !typeOnlyReference(node) {
					used = true
					return false
				}
			}
		}
		node.ForEachChild(visit)
		return false
	}
	root.ForEachChild(visit)
	return used
}

// typeOnlyReference looks for a TypeQuery ancestor, `typeof myRT` in TYPE position, the only way a const's
// value symbol appears in a type; a TypeQuery holds an entity-name chain, never value expressions.
// Everything else reads as a value use, an export specifier included.
func typeOnlyReference(identifier *ast.Node) bool {
	for node := identifier.Parent; node != nil; node = node.Parent {
		if node.Kind == ast.KindTypeQuery {
			return true
		}
	}
	return false
}
