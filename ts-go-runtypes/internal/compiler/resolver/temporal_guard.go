package resolver

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/reflection"
	"github.com/mionkit/ts-runtypes/internal/textpos"
)

// detectTemporalNotLoaded scans the explicit type-argument syntax of a marker
// call for `Temporal.<Name>` type references that resolved to `any` — the
// signature of a consumer whose tsconfig `lib` doesn't load the Temporal
// namespace (e.g. `lib: ["ES2023"]` with no ESNext.Temporal). Left unguarded,
// such a reference silently degrades to `any` and the generated validator
// accepts ANY value with no signal. We surface it as a TMP001 error instead.
//
// Detection is syntax-based on purpose: when the lib is missing there is no
// `Temporal` symbol to inspect on the resolved type — the type IS plain `any`
// — so the only evidence of intent is the written `Temporal.<Name>` qualified
// name. We walk the call's type-argument nodes, and for every TypeReference
// whose name is `Temporal.<KnownTemporalType>`, check whether the node's
// resolved type is `any`; if so, emit the diagnostic.
//
// Note: when the lib IS loaded, `Temporal.PlainDate` resolves to a real
// (non-any) type, so this fires nothing — zero cost for correct setups.
func detectTemporalNotLoaded(scanChecker *checker.Checker, file string, call *ast.Node) []diagnostics.Diagnostic {
	callExpression := call.AsCallExpression()
	if callExpression == nil || callExpression.TypeArguments == nil {
		return nil
	}
	var diagnostics []diagnostics.Diagnostic
	for _, typeArgNode := range callExpression.TypeArguments.Nodes {
		walkTemporalRefs(scanChecker, file, typeArgNode, &diagnostics)
	}
	return diagnostics
}

// walkTemporalRefs recurses a type-node subtree, emitting TMP001 for every
// `Temporal.<Name>` reference that resolved to `any`.
func walkTemporalRefs(scanChecker *checker.Checker, file string, node *ast.Node, out *[]diagnostics.Diagnostic) {
	if node == nil {
		return
	}
	if ast.IsTypeReferenceNode(node) {
		if name, ok := temporalQualifiedName(node); ok {
			refType := checker.Checker_getTypeFromTypeNode(scanChecker, node)
			if refType != nil && checker.Type_flags(refType)&checker.TypeFlagsAny != 0 {
				sourceFile := ast.GetSourceFileOfNode(node)
				if sourceFile != nil {
					*out = append(*out, diagnostics.New(
						diagnostics.CodeTemporalNotLoaded,
						textpos.NodeSite(file, sourceFile, node),
						name,
					))
				}
			}
		}
	}
	node.ForEachChild(func(child *ast.Node) bool {
		walkTemporalRefs(scanChecker, file, child, out)
		return false
	})
}

// temporalQualifiedName reports whether a TypeReference node names a builtin
// Temporal type (`Temporal.<Name>` where <Name> is in the registry), and
// returns the qualified string for the diagnostic message. Bare names and
// non-Temporal qualified names return ok=false.
func temporalQualifiedName(typeRefNode *ast.Node) (string, bool) {
	typeRef := typeRefNode.AsTypeReferenceNode()
	if typeRef == nil || typeRef.TypeName == nil {
		return "", false
	}
	entity := typeRef.TypeName
	if !ast.IsQualifiedName(entity) {
		return "", false
	}
	qualified := entity.AsQualifiedName()
	if qualified == nil || qualified.Left == nil || qualified.Right == nil {
		return "", false
	}
	// Left must be the bare identifier `Temporal`; Right the type name.
	if qualified.Left.Kind != ast.KindIdentifier || qualified.Left.Text() != reflection.TemporalNamespace {
		return "", false
	}
	typeName := qualified.Right.Text()
	if _, ok := reflection.TemporalInfoByName(typeName); !ok {
		return "", false
	}
	return reflection.TemporalNamespace + "." + typeName, true
}
