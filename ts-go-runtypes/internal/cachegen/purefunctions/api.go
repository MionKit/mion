// Package purefunctions extracts `registerPureFnFactory(...)` call sites into the pure-fn
// cache: it walks marker-branded calls, strips TS types from the factory body, enforces the
// purity rules (PFE9006–9011), records cross-fn deps, and renders the per-entry module rows.
package purefunctions

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

// CheckPurity returns the PFE9006–PFE9011 diagnostics for an inline function-literal node.
// Public wrapper around checkPurity for the resolver's PureFunction<F> marker path; the
// extractor calls checkPurity directly.
//
// The dep walk runs first because the imported ids a body reaches another pure fn through are
// LOWERED to string literals when the body is emitted, so they are not captures. Its own
// diagnostics are dropped here: the extractor's pass over the same body reports them.
//
// fnNode must be a KindArrowFunction or KindFunctionExpression; run
// comptimeargs.CheckLiteralFunction (PFN001) first, this walker does not check the outer kind.
func CheckPurity(typeChecker *checker.Checker, markerOpts marker.Options, sourceFile *ast.SourceFile, fnNode *ast.Node) []diagnostics.Diagnostic {
	_, _, exempt, _ := newResolveCtx(typeChecker, markerOpts).extractDeps(sourceFile, fnNode, utlParamName(fnNode))
	return checkPurity(sourceFile, fnNode, exempt)
}

// utlParamName is the factory's first parameter, the name rtUtils is bound to, which is how the
// dep walk recognises a tracked lookup. Empty for the direct form, whose argument reaches no utl.
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

// Re-exported from the diagnostics package so fixtures and in-package callers write the bare names.
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
	CodePureFnDepUnbuilt    = diagnostics.CodePureFnDepUnbuilt
)
