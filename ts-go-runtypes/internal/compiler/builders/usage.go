package builders

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/compiler/marker"
)

// This file implements the unused-builder-const elision analysis: a value-first
// builder call whose RESULT is provably unused in its own file needs no
// reflection graph — the scanner drops the site, so the transformer injects
// nothing and `builderResult(undefined, carrier)` returns the harmless carrier
// nobody reads. Always on (no flag): the analysis is per-file with a name
// prefilter, so its cost is one bounded walk of the declaring file per builder
// const.
//
// The verdict is deliberately DEFAULT-DENY — only positively recognized
// non-value positions count as non-uses:
//
//   - `typeof myRT` in TYPE position (a TypeQuery node — what
//     `InferType<typeof myRT>` produces) is a type-only use.
//   - `createXFn(myRT)` — the DIRECT argument of one of the MARKER PACKAGE'S OWN
//     type-function factories (see IsTypeFnFactoryCall). Those resolve their own
//     injected entry tuple, so the schema they were handed is never read. A
//     third-party wrapper declaring the same marker does NOT qualify: it may
//     legitimately read its RunType argument.
//   - EVERYTHING else keeps the graph: any other argument position (builder
//     composition, `getRunType(myRT)`, a factory argument nested inside another
//     call), property access, `let`/`var` bindings, destructuring, exports
//     (modifier, `export {myRT}` specifier, `export default`), and any position
//     the classifier does not recognize.
//
// Exported consts are ALWAYS kept: the analysis is per-file so verdicts stay
// file-local (an edited file re-scans and its own verdict moves with it); a
// cross-file use index would need dev-server invalidation of OTHER files'
// transforms. The documented pattern for cross-file reuse is exporting the
// TYPE (`export type X = InferType<typeof myRT>`), which keeps the const
// file-local and elidable.

// IsValueBuilderCall reports whether call is a value-first builder call — a
// call whose resolved return type is the marker module's `RunType<…>` —
// EXCLUDING `getRunType`, which returns a RunType like a builder but does not
// BUILD one: it looks the injected id up and THROWS without it, so its sites
// are never elidable (see IsIdLookupCall). Builders tolerate a missing id by
// construction (they fall back to their carrier).
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

// UnusedBuilderConst reports whether the builder call's result is provably
// unused in its own file: either the result is discarded outright (a bare
// expression statement), or it is bound to a non-exported `const` whose only
// references are non-value ones (`typeof` in type position, a type-function
// factory argument). Callers gate on IsValueBuilderCall first.
func UnusedBuilderConst(typeChecker *checker.Checker, call *ast.Node, markerOpts marker.Options) bool {
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
	// The const-binding lane: plain identifier, `const` list, no export
	// modifier (GetCombinedModifierFlags walks up to the VariableStatement).
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
	return !symbolValueUsed(typeChecker, symbol, nameNode, sourceFile.AsNode(), markerOpts)
}

// resultConsumer climbs from the call through wrappers that pass the value
// along unchanged (parentheses / `as` / `satisfies` / non-null) and returns
// the node that CONSUMES the result: an ExpressionStatement (discarded) or the
// VariableDeclaration whose initializer the call is. Nil for every other
// consumer — argument positions, property values, returns, and anything
// unrecognized all mean "used" to the caller.
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

// symbolValueUsed walks the source file for identifiers resolving (through
// aliases) to `symbol` — skipping the declaration's own name node — and
// reports whether any sits in a VALUE position. Mirrors the reference walk of
// convert's constUseIndex (internal/convert/set.go): a cheap text prefilter,
// then symbol resolution only on name matches.
func symbolValueUsed(typeChecker *checker.Checker, symbol *ast.Symbol, declNameNode *ast.Node, root *ast.Node, markerOpts marker.Options) bool {
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
				if resolved == symbol && !nonValueReference(typeChecker, node, markerOpts) {
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

// nonValueReference reports whether the identifier sits in one of the two
// positions that do NOT read the run-type's value:
//
//   - inside a TypeQuery — `typeof myRT` in TYPE position, the only way a
//     const's value symbol appears in a type (`InferType<typeof myRT>`). A
//     TypeQuery holds just an entity-name chain, never value expressions, so any
//     TypeQuery ancestor means type-only.
//   - as the DIRECT argument of a type-function factory call
//     (`createValidateFn(myRT)`), which resolves its own injected entry tuple
//     and never reads the schema.
//
// Everything else — export specifiers included (an export makes the const
// externally reachable) — reads as a value use.
func nonValueReference(typeChecker *checker.Checker, identifier *ast.Node, markerOpts marker.Options) bool {
	for node := identifier.Parent; node != nil; node = node.Parent {
		if node.Kind == ast.KindTypeQuery {
			return true
		}
	}
	return isFactoryArgument(typeChecker, identifier, markerOpts)
}

// isFactoryArgument reports whether the identifier IS one of the arguments of a
// marker-package type-function factory call. DIRECT arguments only:
// `createValidateFn(myRT)` qualifies, `createValidateFn(partial(myRT))` does not
// — there the composing builder reads the value.
func isFactoryArgument(typeChecker *checker.Checker, identifier *ast.Node, markerOpts marker.Options) bool {
	parent := identifier.Parent
	if parent == nil || parent.Kind != ast.KindCallExpression {
		return false
	}
	callExpression := parent.AsCallExpression()
	if callExpression == nil || callExpression.Arguments == nil {
		return false
	}
	isArgument := false
	for _, argument := range callExpression.Arguments.Nodes {
		if argument == identifier {
			isArgument = true
			break
		}
	}
	if !isArgument {
		return false
	}
	return IsTypeFnFactoryCall(typeChecker, parent, markerOpts)
}
