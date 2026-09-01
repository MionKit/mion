package resolver

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/textpos"
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
//   - detectWrittenTypeRefGuards walks the call's written type-argument syntax
//     ONCE, classifying each TypeReference into the sibling that owns it:
//     `Temporal.<KnownName>` → TMP001 (temporal_guard.go — note its stricter
//     any predicate), any other name → MKR013 when it resolved error-like.
//   - detectUnresolvedNameSlot covers the reflect form, which has no written
//     type syntax at the call: the slot's RESOLVED type argument being
//     error-like is itself proof the degradation was never written.
//
// Callers suppress MKR013 when MKR007 already fired for the call (the
// unresolved-import message names the actionable import) — TMP001 always
// surfaces, its cause being independent of imports — and the slot probe when
// the walk already named a reference. Like its siblings this guard only sees
// syntax written AT the call site: a reflect-form value whose type nests an
// error-like member deeper than the top level stays invisible here.

// detectWrittenTypeRefGuards scans the call's explicit type-argument syntax in
// one traversal, returning TMP001 and MKR013 hits separately so callers keep
// their per-family suppression rules.
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

// walkWrittenTypeRefs recurses a type-node subtree, classifying every
// TypeReference: a known Temporal name with an any-flavored resolution emits
// TMP001, any other name whose resolved type is error-like `any` emits MKR013.
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
