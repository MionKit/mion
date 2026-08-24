package purefunctions

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/compiler/comptimeargs"
)

// OverrideNamespace is the reserved pure-fn namespace every `overrideX<T>(pureFn)`
// cfn is registered under. The cfn's function name is the code-only body hash
// (CodeHash), so its cache key is `cfn::<CodeHash(body)>` — content-addressed,
// so two structurally-identical override bodies collapse to one module.
const OverrideNamespace = "cfn"

// ExtractOverrideFn turns the inline function argument of an
// `overrideX<T>(pureFn, id)` call into a pure-fn Entry. Unlike a
// registerPureFnFactory factory `(utl) => fn`, the override arg IS the pure fn
// directly (e.g. `(v) => …`), so it is wrapped as a zero-parameter factory whose
// body returns it: `function(){ return <fn> }`. The returned Entry flows through
// the unchanged CollectEntries → module emit, producing the `cfn::<hash>` module
// the type-fn redirect depends on.
//
// Returns (Entry{}, false) when fnArg is not an inline function — the resolver's
// PureFunction brand check (PFN001 / PFE90xx) is the diagnostic surface, so this
// extractor stays a quiet best-effort (no double-reporting, mirroring extractOne).
func ExtractOverrideFn(typeChecker *checker.Checker, sourceFile *ast.SourceFile, fnArg *ast.Node) (Entry, bool) {
	if typeChecker == nil || sourceFile == nil || fnArg == nil {
		return Entry{}, false
	}
	fnNode, result := comptimeargs.CheckLiteralFunction(typeChecker, fnArg)
	if !result.Ok || fnNode == nil {
		return Entry{}, false
	}
	// The factory body returns the override fn verbatim (types stripped). The
	// arrow/function expression renders as `return <fn>;`.
	code := stripTypesFromExpr(sourceFile, fnNode)
	hash := CodeHash(code)
	return Entry{
		Namespace:    OverrideNamespace,
		FunctionName: hash,
		ParamNames:   nil, // factory takes no `utl` parameter in v1
		Code:         code,
		BodyHash:     BodyHash(OverrideNamespace, hash, code),
		// The Vite plugin nulls out the whole argument (including any
		// `as`/`satisfies` wrapper) — the body now lives only in the cfn module.
		FactoryArgStart: fnArg.Pos(),
		FactoryArgEnd:   fnArg.End(),
		FilePath:        sourceFile.FileName(),
	}, true
}
