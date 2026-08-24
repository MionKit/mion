// Package purefunctions extracts `registerPureFnFactory(...)` call sites
// into the pure-fn cache: it walks marker-branded calls, strips TS types
// from the factory body (byte-compatible BodyHash), enforces the purity
// rules (PFE9006–9011), records cross-fn deps, and renders the
// virtual:runtypes-pure-fns module rows the plugin serves.
package purefunctions

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
)

// CheckPurity runs the package's purity rules against an inline
// function-literal node and returns the diagnostics they produce
// (PFE9006–PFE9011, all Error severity). Public wrapper around the
// package-private checkPurity used by the resolver's PureFunction<F>
// marker path — the existing registerPureFnFactory extractor calls
// checkPurity directly.
//
// fnNode must be a KindArrowFunction or KindFunctionExpression. Callers
// should run comptimeargs.CheckLiteralFunction first to enforce the
// inline-shape rule (PFN001) before invoking this; the purity walker
// itself does not validate the outer node's kind.
func CheckPurity(sourceFile *ast.SourceFile, fnNode *ast.Node) []diagnostics.Diagnostic {
	return checkPurity(sourceFile, fnNode)
}

// Type aliases to the central diag package — kept on purefns so test
// fixtures and any in-package callers can continue to write the bare names
// without importing diag themselves. Constants are re-exported so PFE9xxx
// code references stay short.
type (
	Diagnostic = diagnostics.Diagnostic
)

const (
	CodeBodyHashCollision = diagnostics.CodeBodyHashCollision
	CodeDestructuredParam = diagnostics.CodeDestructuredParam

	CodePurityThis          = diagnostics.CodePurityThis
	CodePurityAwait         = diagnostics.CodePurityAwait
	CodePurityYield         = diagnostics.CodePurityYield
	CodePurityDynamicImport = diagnostics.CodePurityDynamicImport
	CodePurityForbidden     = diagnostics.CodePurityForbidden
	CodePurityClosure       = diagnostics.CodePurityClosure

	CodeMissingPureFnDep    = diagnostics.CodeMissingPureFnDep
	CodePurityDepNotLiteral = diagnostics.CodePurityDepNotLiteral
)
