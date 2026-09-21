package resolver

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/textpos"
)

// MKR013, the WRITTEN-name cause in the silent-`any` family (a typo, a missing dependency's types, an
// ambient declaration the program cannot see); TMP001 covers the Temporal-lib flavor and MKR007 the
// unresolved-import one. Detection rides marker.IsErrorLikeAny: the checker keeps a DISTINCT error type
// for failed resolutions, so a deliberately written `any` and a resolved `type Loose = any` are legal by
// construction and need no keyword escape. Callers suppress MKR013 once MKR007 fired for the call (its
// message names the actionable import) and the slot probe once the walk named a reference; TMP001 always
// surfaces, its cause being independent of imports. Both probes see the ROOT type and the syntax written
// AT the call only; a member that degraded one object deeper is found by the whole-graph walk in
// silent_any_walk.go.

// detectWrittenTypeRefGuards returns TMP001 and MKR013 separately, so callers keep their per-family suppression rules.
func detectWrittenTypeRefGuards(scanChecker *checker.Checker, file string, call *ast.Node) (temporalDiags, nameDiags []diagnostics.Diagnostic) {
	callExpression := call.AsCallExpression()
	if callExpression == nil || callExpression.TypeArguments == nil {
		return nil, nil
	}
	for _, typeArgNode := range callExpression.TypeArguments.Nodes {
		walkWrittenTypeRefs(scanChecker, file, typeArgNode, &temporalDiags, &nameDiags)
	}
	return temporalDiags, nameDiags
}

// walkWrittenTypeRefs recurses a type-node subtree, classifying every TypeReference into TMP001 or MKR013.
func walkWrittenTypeRefs(scanChecker *checker.Checker, file string, node *ast.Node, temporalOut, nameOut *[]diagnostics.Diagnostic) {
	if node == nil {
		return
	}
	if ast.IsTypeReferenceNode(node) {
		if temporalName, isTemporal := temporalQualifiedName(node); isTemporal {
			if temporalDegradedToAny(checker.Checker_getTypeFromTypeNode(scanChecker, node)) {
				if sourceFile := ast.GetSourceFileOfNode(node); sourceFile != nil {
					*temporalOut = append(*temporalOut, diagnostics.New(
						diagnostics.CodeTemporalNotLoaded,
						textpos.NodeSite(file, sourceFile, node),
						temporalName,
					))
				}
			}
		} else if marker.IsErrorLikeAny(checker.Checker_getTypeFromTypeNode(scanChecker, node)) {
			if name, ok := writtenEntityName(node); ok {
				if sourceFile := ast.GetSourceFileOfNode(node); sourceFile != nil {
					*nameOut = append(*nameOut, diagnostics.New(
						diagnostics.CodeMarkerUnresolvedTypeName,
						textpos.NodeSite(file, sourceFile, node),
						name,
					))
				}
			}
		}
	}
	node.ForEachChild(func(child *ast.Node) bool {
		walkWrittenTypeRefs(scanChecker, file, child, temporalOut, nameOut)
		return false
	})
}

// detectUnresolvedNameSlot is the reflect-form probe: the call wrote no type syntax, so an error-like
// resolved type argument is itself proof the degradation was never written.
func detectUnresolvedNameSlot(file string, call *ast.Node, typeArgument *checker.Type) []diagnostics.Diagnostic {
	if !marker.IsErrorLikeAny(typeArgument) {
		return nil
	}
	sourceFile := ast.GetSourceFileOfNode(call)
	if sourceFile == nil {
		return nil
	}
	return []diagnostics.Diagnostic{diagnostics.New(
		diagnostics.CodeMarkerUnresolvedTypeName,
		textpos.NodeSite(file, sourceFile, call),
		reflectValueLabel(call),
	)}
}

// writtenEntityName renders a TypeReference's written entity name, `Name` or `Ns.Nested.Name`.
func writtenEntityName(typeRefNode *ast.Node) (string, bool) {
	typeRef := typeRefNode.AsTypeReferenceNode()
	if typeRef == nil || typeRef.TypeName == nil {
		return "", false
	}
	return entityNameText(typeRef.TypeName)
}

func entityNameText(entity *ast.Node) (string, bool) {
	if entity == nil {
		return "", false
	}
	if entity.Kind == ast.KindIdentifier {
		return entity.Text(), true
	}
	if ast.IsQualifiedName(entity) {
		qualified := entity.AsQualifiedName()
		left, leftOk := entityNameText(qualified.Left)
		right, rightOk := entityNameText(qualified.Right)
		if leftOk && rightOk {
			return left + "." + right, true
		}
	}
	return "", false
}

// reflectValueLabel names the reflect-form call's value argument for the diagnostic message.
func reflectValueLabel(call *ast.Node) string {
	callExpression := call.AsCallExpression()
	if callExpression != nil && callExpression.Arguments != nil {
		for _, argument := range callExpression.Arguments.Nodes {
			if argument != nil && argument.Kind == ast.KindIdentifier {
				return argument.Text()
			}
		}
	}
	return "value"
}
