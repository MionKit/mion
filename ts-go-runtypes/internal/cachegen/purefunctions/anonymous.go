package purefunctions

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
)

// AnonymousNamespace is the reserved pure-fn namespace every anonymous
// `registerAnonymousPureFn(fn, hash?)` pure fn is registered under. The
// function name is the code-only body hash (CodeHash), so its cache key is
// `rt::<CodeHash(body)>` — content-addressed, so two structurally-identical
// bodies collapse to one module and inject the same `"rt::<hash>"` id (whether
// registered directly or through a library wrapper).
const AnonymousNamespace = "rt"

// anonymousPureFnCalleeName / anonymousPureFnFactoryCalleeName are the
// well-known identifiers the walker uses as a cheap pre-filter before resolving
// signatures, mirroring the named-lane callee names. They are NOT the contract —
// the marker brands are. A framework wrapper under a DIFFERENT callee name (a
// renamed import, or a library's own `registerXPureFn`) reaches the brand check
// through the secondary pre-filter `firstArgIsInlineFunction` (the anonymous
// lane's argument is always an inline function literal). Only a call that matches
// NEITHER cheap filter is missed by extraction.
const anonymousPureFnCalleeName = "registerAnonymousPureFn"
const anonymousPureFnFactoryCalleeName = "registerAnonymousPureFnFactory"

// anyArgIsInlineFunction is the secondary extraction pre-filter for the
// anonymous lane: SOME argument is an inline arrow/function expression — the
// `PureFunction<F>` shape. This lets renamed imports and branded wrapper
// factories reach the (authoritative) brand check without paying signature
// resolution on every unrelated call; false positives (any other
// `foo(() => …)` call) are rejected there. The scan covers every argument, not
// just the first, because a wrapper may declare leading non-marker parameters
// (mion's `serverMapFrom(source, mapper)` carries the mapper at slot 1).
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

// isAnonymousPureFnCall reports whether call is an anonymous-lane registration
// (`registerAnonymousPureFn` / `registerAnonymousPureFnFactory`, or a wrapper
// carrying the same brands) that should be extracted, whether it uses the
// direct form (wrap), and WHERE the two marker parameters sit. Two-layer check
// mirroring `isNamedPureFnCall`:
//
//  1. Cheap: the callee is an identifier whose text equals a well-known anonymous
//     registrar, OR some argument is an inline function literal (renamed
//     imports and branded wrappers). Avoids signature resolution on unrelated
//     calls.
//  2. Brand verify: the resolved signature carries a pure-fn form marker
//     (`PureFunction<F>` → direct, or `PureFunctionFactory<F>` → factory) at
//     SOME parameter, followed by an `InjectPureFnHash<F>` parameter. Positions
//     are discovered, not assumed — a wrapper may declare leading non-marker
//     parameters (`serverMapFrom(source, mapper, hash?)`), so the brand pair is
//     the contract, not slots 0/1. Module-of-origin is implicit in the brand
//     check, so a user's own same-named function is rejected even if it passes
//     the name filter. Overloaded wrappers work per call site: the checker
//     resolves the signature the call binds to, so a marker-free overload (a
//     name-based fallback lane) never extracts.
func isAnonymousPureFnCall(typeChecker *checker.Checker, markerOpts marker.Options, call *ast.Node) (matched, wrap bool, fnParamIndex, hashParamIndex int) {
	callExpr := call.AsCallExpression()
	if callExpr == nil || callExpr.Expression == nil {
		return false, false, 0, 0
	}
	callee := callExpr.Expression
	if callee.Kind != ast.KindIdentifier {
		return false, false, 0, 0
	}
	if callee.Text() != anonymousPureFnCalleeName && callee.Text() != anonymousPureFnFactoryCalleeName && !anyArgIsInlineFunction(callExpr) {
		return false, false, 0, 0
	}
	signature := checker.Checker_getResolvedSignature(typeChecker, call, nil, 0)
	if signature == nil {
		return false, false, 0, 0
	}
	return AnonymousBrandPair(typeChecker, markerOpts, signature)
}

// AnonymousBrandPair is the brand-verify half of the anonymous lane, over an
// already-resolved signature: it reports whether the signature carries a
// pure-fn form marker (`PureFunction<F>` → wrap, or `PureFunctionFactory<F>`)
// at SOME parameter, followed by an `InjectPureFnHash<F>` parameter, and where
// both sit. Exported so the batches extractor can recognise a branded mapper
// factory (mion's `inputFrom(source, mapper, hash?)`) by the very same pair,
// on any of its overloads, without re-deriving the rule.
func AnonymousBrandPair(typeChecker *checker.Checker, markerOpts marker.Options, signature *checker.Signature) (matched, wrap bool, fnParamIndex, hashParamIndex int) {
	if signature == nil {
		return false, false, 0, 0
	}
	parameters := checker.Signature_parameters(signature)
	if len(parameters) < 2 {
		return false, false, 0, 0
	}
	fnParamIndex, hashParamIndex = -1, -1
	for paramIndex, parameter := range parameters {
		if fnParamIndex < 0 {
			if formMatched, formWrap := pureFnFormMarker(typeChecker, markerOpts, parameter); formMatched {
				fnParamIndex, wrap = paramIndex, formWrap
			}
			continue
		}
		if paramHasMarker(typeChecker, markerOpts, parameter, marker.KindInjectPureFnHash) {
			hashParamIndex = paramIndex
			break
		}
	}
	if fnParamIndex < 0 || hashParamIndex < 0 {
		return false, false, 0, 0
	}
	return true, wrap, fnParamIndex, hashParamIndex
}

// AnonymousKeyForCall runs the anonymous-lane extraction on ONE call and
// returns the registry key it would be interned under (`rt::<hash>`), which is
// byte-identical to the id the pure-fn lane splices into that same call. The
// batches extractor uses it to record an inline `inputFrom(source, mapper)`
// mapper by the key its body will be registered under, so the batch report
// and the injected hash can never disagree. False when the call is not an
// anonymous-lane registration, or its function argument is not inline.
func AnonymousKeyForCall(typeChecker *checker.Checker, markerOpts marker.Options, sourceFile *ast.SourceFile, call *ast.Node) (string, bool) {
	callExpr := call.AsCallExpression()
	if callExpr == nil {
		return "", false
	}
	matched, wrap, fnParamIndex, hashParamIndex := isAnonymousPureFnCall(typeChecker, markerOpts, call)
	if !matched {
		return "", false
	}
	entry, _ := extractAnonymous(typeChecker, markerOpts, sourceFile, call, callExpr, wrap, fnParamIndex, hashParamIndex)
	if entry == nil {
		return "", false
	}
	return entry.Key(), true
}
