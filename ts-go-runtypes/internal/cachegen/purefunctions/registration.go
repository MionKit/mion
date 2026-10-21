package purefunctions

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
)

// pureFnCalleeName / pureFnFactoryCalleeName are a cheap pre-filter before signature resolution,
// one of tsgo's heaviest operations. They are NOT the contract, the marker brands are: a
// registration under a different callee name (a renamed import, a library's own
// `registerXPureFn`) reaches the brand check through `anyArgIsInlineFunction` instead, and only a
// call matching NEITHER cheap filter is missed.
const pureFnCalleeName = "registerPureFn"
const pureFnFactoryCalleeName = "registerPureFnFactory"

// anyArgIsInlineFunction is the secondary pre-filter, the `PureFunction<F>` shape: a false
// positive (any other `foo(() => …)` call) is rejected by the brand check behind it. The scan
// covers every argument, not just the first, because a wrapper may declare leading non-marker
// parameters (mion's `inputFrom(source, mapper)` carries the mapper at slot 1).
func anyArgIsInlineFunction(callExpr *ast.CallExpression) bool {
	if callExpr.Arguments == nil {
		return false
	}
	for _, arg := range callExpr.Arguments.Nodes {
		if arg.Kind == ast.KindArrowFunction || arg.Kind == ast.KindFunctionExpression {
			return true
		}
	}
	return false
}

// isPureFnRegistration reports whether call registers a pure function, whether it uses the direct
// form (wrap), and WHERE the two marker parameters sit. The cheap filter (a known registrar name,
// or some inline function argument) only avoids signature resolution on unrelated calls; the
// resolved signature's brand pair decides.
//
// Positions are discovered, not assumed: a wrapper may declare leading non-marker parameters
// (`inputFrom(source, mapper, id?)`), so the brand pair is the contract, not slots 0/1.
// Module-of-origin is implicit in the brand check, so a user's own same-named function is rejected
// even when it passes the name filter. An overloaded wrapper works per call site, the checker
// resolving the signature the call binds to, so a marker-free overload never extracts.
func (ctx *resolveCtx) isPureFnRegistration(call *ast.Node) (matched, wrap bool, fnParamIndex, idParamIndex int) {
	callExpr := call.AsCallExpression()
	if callExpr == nil || callExpr.Expression == nil {
		return false, false, 0, 0
	}
	callee := callExpr.Expression
	if callee.Kind != ast.KindIdentifier {
		return false, false, 0, 0
	}
	if callee.Text() != pureFnCalleeName && callee.Text() != pureFnFactoryCalleeName && !anyArgIsInlineFunction(callExpr) {
		return false, false, 0, 0
	}
	signature := checker.Checker_getResolvedSignature(ctx.typeChecker, call, nil, 0)
	if signature == nil {
		return false, false, 0, 0
	}
	return PureFnBrandPair(ctx.typeChecker, ctx.markerOpts, signature)
}

// PureFnBrandPair reports whether a resolved signature carries a pure-fn form marker
// (`PureFunction<F>` → wrap, or `PureFunctionFactory<F>`) at SOME parameter, followed by an
// `InjectPureFnId<F>` parameter, and where both sit. Exported so the batches extractor recognises
// a branded mapper factory by the very same pair, on any overload, without re-deriving the rule.
func PureFnBrandPair(typeChecker *checker.Checker, markerOpts marker.Options, signature *checker.Signature) (matched, wrap bool, fnParamIndex, idParamIndex int) {
	if signature == nil {
		return false, false, 0, 0
	}
	parameters := checker.Signature_parameters(signature)
	if len(parameters) < 2 {
		return false, false, 0, 0
	}
	fnParamIndex, idParamIndex = -1, -1
	for paramIndex, parameter := range parameters {
		if fnParamIndex < 0 {
			if formMatched, formWrap := pureFnFormMarker(typeChecker, markerOpts, parameter); formMatched {
				fnParamIndex, wrap = paramIndex, formWrap
			}
			continue
		}
		if paramHasMarker(typeChecker, markerOpts, parameter, marker.KindInjectPureFnId) {
			idParamIndex = paramIndex
			break
		}
	}
	if fnParamIndex < 0 || idParamIndex < 0 {
		return false, false, 0, 0
	}
	return true, wrap, fnParamIndex, idParamIndex
}

// PureFnIDForCall returns the id ONE call would be registered under, byte-identical to the id
// spliced into that same call, so the batches extractor's report and the injected id cannot
// disagree. It reads the SAME memo the module emit reads, so the body is never rendered twice.
// False when the call is not a registration, or its function argument is not inline.
func PureFnIDForCall(typeChecker *checker.Checker, markerOpts marker.Options, sourceFile *ast.SourceFile, call *ast.Node, cache *FileCache) (string, bool) {
	entry, _, cycle := cache.resolver(typeChecker, markerOpts).entryFor(sourceFile, call)
	if cycle || entry == nil {
		return "", false
	}
	return entry.Key(), true
}
