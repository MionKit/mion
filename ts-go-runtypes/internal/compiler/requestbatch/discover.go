package requestbatch

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/comptimeargs"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
)

// batchCalleeName is a cheap pre-filter before resolving signatures, not the contract: the brand is.
// A wrapper under another name still reaches the brand check through the array-literal pre-filter, so
// only a call matching NEITHER filter is missed.
const batchCalleeName = "batch"

// firstArgIsArrayLiteral is the secondary pre-filter: the `[...routes]` argument every batch call starts with.
func firstArgIsArrayLiteral(callExpr *ast.CallExpression) bool {
	if callExpr.Arguments == nil || len(callExpr.Arguments.Nodes) == 0 {
		return false
	}
	firstArg := unwrap(callExpr.Arguments.Nodes[0])
	return firstArg != nil && firstArg.Kind == ast.KindArrayLiteralExpression
}

// isBatchCall reports whether call is a branded batch call and where its id parameter sits: the resolved
// signature must carry an InjectBatchId parameter after the routes parameter (always slot 0). A callee that
// lost the brand through a cast resolves to a marker-free signature and is not a batch to the build.
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

// unwrap strips the wrapper set every literal recovery in the build agrees on, plus the non-null `!`
// postfix, which changes nothing at runtime and is common on a route call typed as optional.
func unwrap(node *ast.Node) *ast.Node {
	for {
		node = comptimeargs.UnwrapWrappers(node)
		if node == nil || node.Kind != ast.KindNonNullExpression {
			return node
		}
		node = node.AsNonNullExpression().Expression
	}
}
