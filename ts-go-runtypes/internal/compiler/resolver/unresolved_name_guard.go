package resolver

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/compiler/marker"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/textpos"
)

// This guard closes the third cause in the silent-`any` family: a WRITTEN type
// name that failed to resolve (a typo, a missing dependency's types, an ambient
// declaration the program cannot see). TMP001 covers the Temporal-lib flavor,
// MKR007 the unresolved-import flavor; MKR013 covers the bare unresolved name.
//
// Detection rides marker.IsErrorLikeAny — the checker keeps a DISTINCT error
// type for failed resolutions (any-flagged, but not the `any` intrinsic), so a
// deliberately written `any`, and a resolved `type Loose = any`, are legal by
// construction and need no keyword escape. Two probes per call:
//
//   - detectUnresolvedNameRefs walks the call's written type-argument syntax
//     (the TMP001 shape) and reports each offending TypeReference by name.
//   - detectUnresolvedNameSlot covers the reflect form, which has no written
//     type syntax at the call: the slot's RESOLVED type argument being
//     error-like is itself proof the degradation was never written.
//
// Callers suppress both probes when MKR007 already fired for the call (the
// unresolved-import message names the actionable import), and the slot probe
// when the walk already named the reference. Like its siblings this guard only
// sees syntax written AT the call site: a reflect-form value whose type nests
// an error-like member deeper than the top level stays invisible here.

// detectUnresolvedNameRefs scans the call's explicit type-argument syntax for
// type references that resolved to the checker's error type, emitting MKR013
// for each. `Temporal.<Name>` references are skipped — TMP001 owns those with
// a lib-specific fix message.
func detectUnresolvedNameRefs(scanChecker *checker.Checker, file string, call *ast.Node) []diagnostics.Diagnostic {
	callExpression := call.AsCallExpression()
	if callExpression == nil || callExpression.TypeArguments == nil {
		return nil
	}
	var diags []diagnostics.Diagnostic
	for _, typeArgNode := range callExpression.TypeArguments.Nodes {
		walkUnresolvedNameRefs(scanChecker, file, typeArgNode, &diags)
	}
	return diags
}

// walkUnresolvedNameRefs recurses a type-node subtree, emitting MKR013 for
// every non-Temporal TypeReference whose resolved type is error-like `any`.
func walkUnresolvedNameRefs(scanChecker *checker.Checker, file string, node *ast.Node, out *[]diagnostics.Diagnostic) {
	if node == nil {
		return
	}
	if ast.IsTypeReferenceNode(node) {
		if _, isTemporal := temporalQualifiedName(node); !isTemporal {
			refType := checker.Checker_getTypeFromTypeNode(scanChecker, node)
			if marker.IsErrorLikeAny(refType) {
				if name, ok := writtenEntityName(node); ok {
					if sourceFile := ast.GetSourceFileOfNode(node); sourceFile != nil {
						*out = append(*out, diagnostics.New(
							diagnostics.CodeMarkerUnresolvedTypeName,
							textpos.NodeSite(file, sourceFile, node),
							name,
						))
					}
				}
			}
		}
	}
	node.ForEachChild(func(child *ast.Node) bool {
		walkUnresolvedNameRefs(scanChecker, file, child, out)
		return false
	})
}

// detectUnresolvedNameSlot is the reflect-form probe: the slot's resolved type
// argument is error-like `any` even though the call wrote no type syntax at
// all. The diagnostic names the value argument when it is a plain identifier
// ("value" otherwise) — the site position carries the precision.
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

// writtenEntityName renders a TypeReference's written entity name
// (`Name` or `Ns.Nested.Name`) for the diagnostic message.
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

// reflectValueLabel names the reflect-form call's value argument for the
// message: the identifier text when the argument is one, "value" otherwise.
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
