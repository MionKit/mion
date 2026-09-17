package purefunctions

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/comptimeargs"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
)

// ExtractOverrideFn turns the inline function argument of an
// `overrideX<T>(pureFn, id)` call into a pure-fn Entry. Unlike a
// registerPureFnFactory factory `(utl) => fn`, the override arg IS the pure fn
// directly (e.g. `(v) => …`), so it is wrapped as a zero-parameter factory whose
// body returns it: `function(){ return <fn> }`. An override is bound to no
// name, so it takes the nameless half of the id rule: its body hash, which
// makes two structurally identical overrides collapse to one module. The
// returned Entry flows through the unchanged CollectEntries → module emit,
// producing the module the type-fn redirect depends on.
//
// Returns (Entry{}, false) when fnArg is not an inline function — the resolver's
// PureFunction brand check (PFN001 / PFE90xx) is the diagnostic surface, so this
// extractor stays a quiet best-effort (no double-reporting, mirroring extractOne).
func ExtractOverrideFn(typeChecker *checker.Checker, markerOpts marker.Options, sourceFile *ast.SourceFile, fnArg *ast.Node) (Entry, bool) {
	if typeChecker == nil || sourceFile == nil || fnArg == nil {
		return Entry{}, false
	}
	fnNode, result := comptimeargs.CheckLiteralFunction(typeChecker, fnArg)
	if !result.Ok || fnNode == nil {
		return Entry{}, false
	}
	// The factory body returns the override fn verbatim (types stripped). The
	// arrow/function expression renders as `return <fn>;`.
	code := stripTypesFromExpr(sourceFile, fnNode, nil)
	id := IDFor(markerOpts, sourceFile.FileName(), CodeHash(code))
	return Entry{
		ID:         id,
		ParamNames: nil, // factory takes no `utl` parameter in v1
		Code:       code,
		BodyHash:   BodyHash(id, code),
		// The Vite plugin nulls out the whole argument (including any
		// `as`/`satisfies` wrapper) — the body now lives only in the cfn module.
		FactoryArgStart: fnArg.Pos(),
		FactoryArgEnd:   fnArg.End(),
		FilePath:        sourceFile.FileName(),
	}, true
}
