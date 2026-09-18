package purefunctions

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
)

// pureFnCalleeName / pureFnFactoryCalleeName are the well-known identifiers the
// walker uses as a cheap pre-filter before resolving signatures. tsgo's
// signature resolution is one of its heaviest operations, and a string compare
// on the callee rules out almost every call in a file. They are NOT the
// contract — the marker brands are. A registration under a DIFFERENT callee
// name (a renamed import, or a library's own `registerXPureFn`) reaches the
// brand check through the secondary pre-filter `anyArgIsInlineFunction`, since
// a registration's function argument is always an inline function literal. Only
// a call that matches NEITHER cheap filter is missed by extraction.
const pureFnCalleeName = "registerPureFn"
const pureFnFactoryCalleeName = "registerPureFnFactory"

// anyArgIsInlineFunction is the secondary extraction pre-filter: SOME argument
// is an inline arrow/function expression — the `PureFunction<F>` shape. This
// lets renamed imports and branded wrapper factories reach the (authoritative)
// brand check without paying signature resolution on every unrelated call;
// false positives (any other `foo(() => …)` call) are rejected there. The scan
// covers every argument, not just the first, because a wrapper may declare
// leading non-marker parameters (mion's `inputFrom(source, mapper)` carries the
// mapper at slot 1).
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

// isPureFnRegistration reports whether call registers a pure function
// (`registerPureFn` / `registerPureFnFactory`, or a wrapper carrying the same
// brands), whether it uses the direct form (wrap), and WHERE the two marker
// parameters sit. Two-layer check:
//
//  1. Cheap: the callee is an identifier whose text equals a well-known
//     registrar, OR some argument is an inline function literal (renamed
//     imports and branded wrappers). Avoids signature resolution on unrelated
//     calls.
//  2. Brand verify: the resolved signature carries a pure-fn form marker
//     (`PureFunction<F>` → direct, or `PureFunctionFactory<F>` → factory) at
//     SOME parameter, followed by an `InjectPureFnId<F>` parameter. Positions
//     are discovered, not assumed — a wrapper may declare leading non-marker
//     parameters (`inputFrom(source, mapper, id?)`), so the brand pair is the
//     contract, not slots 0/1. Module-of-origin is implicit in the brand check,
//     so a user's own same-named function is rejected even if it passes the
//     name filter. Overloaded wrappers work per call site: the checker resolves
//     the signature the call binds to, so a marker-free overload never
//     extracts.
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

// PureFnBrandPair is the brand-verify half of the lane, over an already
// resolved signature: it reports whether the signature carries a pure-fn form
// marker (`PureFunction<F>` → wrap, or `PureFunctionFactory<F>`) at SOME
// parameter, followed by an `InjectPureFnId<F>` parameter, and where both sit.
// Exported so the batches extractor can recognise a branded mapper factory
// (mion's `inputFrom(source, mapper, id?)`) by the very same pair, on any of
// its overloads, without re-deriving the rule.
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

// PureFnIDForCall runs the extraction on ONE call and returns the id it would
// be registered under, byte-identical to the id spliced into that same call.
// The batches extractor uses it to record an inline `inputFrom(source, mapper)`
// mapper by the id its body will be registered under, so the batch report and
// the injected id can never disagree. It reads the SAME memo the module emit
// reads, so the two cannot drift and the body is never rendered twice. False
// when the call is not a registration, or its function argument is not inline.
func PureFnIDForCall(typeChecker *checker.Checker, markerOpts marker.Options, sourceFile *ast.SourceFile, call *ast.Node, cache *FileCache) (string, bool) {
	entry, _, cycle := cache.resolver(typeChecker, markerOpts).entryFor(sourceFile, call)
	if cycle || entry == nil {
		return "", false
	}
	return entry.Key(), true
}
