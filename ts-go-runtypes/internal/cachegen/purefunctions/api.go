// Package purefunctions extracts `registerPureFnFactory(...)` call sites
// into the pure-fn cache: it walks marker-branded calls, strips TS types
// from the factory body (byte-compatible BodyHash), enforces the purity
// rules (PFE9006–9011), records cross-fn deps, and renders the
// virtual:runtypes-pure-fns module rows the plugin serves.
package purefunctions

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

// CheckPurity runs the package's purity rules against an inline
// function-literal node and returns the diagnostics they produce
// (PFE9006–PFE9011, all Error severity). Public wrapper around the
// package-private checkPurity used by the resolver's PureFunction<F>
// marker path — the extractor calls checkPurity directly.
//
// It runs the dep walk first, for the one thing purity needs from it: the
// imported ids a body reaches another pure fn through are LOWERED to string
// literals when the body is emitted, so they are not captures. Any diagnostic
// the dep walk produces is dropped here, because the extractor's own pass over
// the same body reports it.
//
// fnNode must be a KindArrowFunction or KindFunctionExpression. Callers should
// run comptimeargs.CheckLiteralFunction first to enforce the inline-shape rule
// (PFN001) before invoking this; the purity walker itself does not validate the
// outer node's kind.
func CheckPurity(typeChecker *checker.Checker, markerOpts marker.Options, sourceFile *ast.SourceFile, fnNode *ast.Node) []diagnostics.Diagnostic {
	_, _, exempt, _ := newResolveCtx(typeChecker, markerOpts).extractDeps(sourceFile, fnNode, utlParamName(fnNode))
	return checkPurity(sourceFile, fnNode, exempt)
}

// utlParamName is the name a factory binds rtUtils to — its first parameter —
// which is how the dep walk recognises a tracked lookup. Empty for the direct
// form, whose argument is the pure fn itself and reaches no utl.
func utlParamName(fnNode *ast.Node) string {
	fnLike := fnNode.FunctionLikeData()
	if fnLike == nil || fnLike.Parameters == nil || len(fnLike.Parameters.Nodes) == 0 {
		return ""
	}
	first := fnLike.Parameters.Nodes[0].AsParameterDeclaration()
	if first == nil || first.Name() == nil || first.Name().Kind != ast.KindIdentifier {
		return ""
	}
	return first.Name().Text()
}

// Type aliases to the central diag package — kept on purefns so test
// fixtures and any in-package callers can continue to write the bare names
// without importing diag themselves. Constants are re-exported so PFE9xxx
// code references stay short.
type (
	Diagnostic = diagnostics.Diagnostic
)

const (
	CodeDestructuredParam     = diagnostics.CodeDestructuredParam
	CodePureFnDependencyCycle = diagnostics.CodePureFnDependencyCycle

	CodePurityThis          = diagnostics.CodePurityThis
	CodePurityAwait         = diagnostics.CodePurityAwait
	CodePurityYield         = diagnostics.CodePurityYield
	CodePurityDynamicImport = diagnostics.CodePurityDynamicImport
	CodePurityForbidden     = diagnostics.CodePurityForbidden
	CodePurityClosure       = diagnostics.CodePurityClosure

	CodeMissingPureFnDep    = diagnostics.CodeMissingPureFnDep
	CodePurityDepNotLiteral = diagnostics.CodePurityDepNotLiteral
	CodePureFnIdMismatch    = diagnostics.CodePureFnIdMismatch
)
