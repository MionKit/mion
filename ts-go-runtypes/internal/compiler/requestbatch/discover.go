package requestbatch

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/comptimeargs"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
)

// batchCalleeName is the well-known identifier the walker uses as a cheap
// pre-filter before resolving signatures. It is NOT the contract, the
// InjectBatchId brand is: a wrapper under a different name reaches the brand
// check through the secondary pre-filter (a first argument that is an array
// literal, the shape every batch call has). Only a call matching NEITHER
// cheap filter is missed by extraction.
const batchCalleeName = "batch"

// firstArgIsArrayLiteral is the secondary pre-filter: the `[...routes]`
// argument every batch call starts with.
func firstArgIsArrayLiteral(callExpr *ast.CallExpression) bool {
	if callExpr.Arguments == nil || len(callExpr.Arguments.Nodes) == 0 {
		return false
	}
	firstArg := unwrap(callExpr.Arguments.Nodes[0])
	return firstArg != nil && firstArg.Kind == ast.KindArrayLiteralExpression
}

// isBatchCall reports whether call is a branded batch call and WHERE its id
// parameter sits. Two-layer check mirroring the pure-fn lanes: the cheap
// syntactic filter above, then the brand: the resolved signature must carry an
// InjectBatchId parameter after the routes parameter (always slot 0). A call
// whose callee lost the brand (`batch as unknown as (routes: any[]) => unknown`)
// resolves to a marker-free signature and is not a batch to the build.
func isBatchCall(typeChecker *checker.Checker, markerOpts marker.Options, call *ast.Node) (matched bool, idParamIndex int) {
	callExpr := call.AsCallExpression()
	if callExpr == nil || callExpr.Expression == nil {
		return false, 0
	}
	if calleeIdentifierName(callExpr) != batchCalleeName && !firstArgIsArrayLiteral(callExpr) {
		return false, 0
	}
	signature := checker.Checker_getResolvedSignature(typeChecker, call, nil, 0)
	if signature == nil {
		return false, 0
	}
	parameters := checker.Signature_parameters(signature)
	for paramIndex, parameter := range parameters {
		if paramIndex == 0 {
			continue
		}
		if purefunctions.ParamHasMarker(typeChecker, markerOpts, parameter, marker.KindInjectBatchId) {
			return true, paramIndex
		}
	}
	return false, 0
}

// unwrap strips `as T`, parentheses and `satisfies T` off an expression (the
// wrapper set every literal recovery in the build agrees on) plus the
// non-null `!` postfix, which changes nothing at runtime and is common on a
// route call whose proxy the author typed as optional.
func unwrap(node *ast.Node) *ast.Node {
	for {
		node = comptimeargs.UnwrapWrappers(node)
		if node == nil || node.Kind != ast.KindNonNullExpression {
			return node
		}
		node = node.AsNonNullExpression().Expression
	}
}
