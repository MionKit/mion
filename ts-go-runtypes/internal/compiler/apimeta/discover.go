package apimeta

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
)

// dispatchCalleeNames are the well-known method names the walker uses as a
// cheap pre-filter before resolving signatures: the three dispatch methods of
// a subrequest, a batch builder's `call`, and the `initClient` anchor. They
// are NOT the contract, the InjectApiMetadata brand is: a call under another
// name is simply not looked at, which the client package never produces (its
// dispatch methods are interface members and cannot be renamed).
var dispatchCalleeNames = []string{"call", "prefill", "typeErrors", "initClient"}

func isDispatchCalleeName(name string) bool {
	for _, known := range dispatchCalleeNames {
		if name == known {
			return true
		}
	}
	return false
}

// isApiMetadataCall reports whether call is a branded dispatch call, WHERE its
// marker parameter sits, and that parameter's type (the instantiated
// InjectApiMetadata alias the ids and the API are read from). Two layers: the
// cheap name filter above, then the brand on the resolved signature.
func isApiMetadataCall(typeChecker *checker.Checker, markerOpts marker.Options, call *ast.Node) (matched bool, paramIndex int, paramType *checker.Type) {
	callExpr := call.AsCallExpression()
	if callExpr == nil || callExpr.Expression == nil {
		return false, 0, nil
	}
	if !isDispatchCalleeName(calleeIdentifierName(callExpr)) {
		return false, 0, nil
	}
	signature := checker.Checker_getResolvedSignature(typeChecker, call, nil, 0)
	if signature == nil {
		return false, 0, nil
	}
	for index, parameter := range checker.Signature_parameters(signature) {
		if purefunctions.ParamHasMarker(typeChecker, markerOpts, parameter, marker.KindInjectApiMetadata) {
			return true, index, typeChecker.GetTypeOfSymbol(parameter)
		}
	}
	return false, 0, nil
}
