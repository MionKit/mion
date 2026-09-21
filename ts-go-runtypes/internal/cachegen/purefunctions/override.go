package purefunctions

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/comptimeargs"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
)

// ExtractOverrideFn turns the inline function argument of an `overrideX<T>(pureFn, id)` call into
// a pure-fn Entry. The argument IS the pure fn, not a `(utl) => fn` factory, so it is wrapped as a
// zero-parameter factory whose body returns it: `function(){ return <fn> }`. Two structurally
// identical overrides hash to one id and collapse to one module. The Entry flows through the
// unchanged CollectEntries → module emit, producing the module the type-fn redirect depends on.
//
// Returns (Entry{}, false) when fnArg is not an inline function: the resolver's PureFunction brand
// check (PFN001 / PFE90xx) is the diagnostic surface, so this stays quiet, as extractOne does.
func ExtractOverrideFn(typeChecker *checker.Checker, markerOpts marker.Options, sourceFile *ast.SourceFile, fnArg *ast.Node) (Entry, bool) {
	if typeChecker == nil || sourceFile == nil || fnArg == nil {
		return Entry{}, false
	}
	fnNode, result := comptimeargs.CheckLiteralFunction(typeChecker, fnArg)
	if !result.Ok || fnNode == nil {
		return Entry{}, false
	}
	code := stripTypesFromExpr(sourceFile, fnNode, nil)
	return Entry{
		ID:         IDFor(markerOpts, sourceFile.FileName(), CodeHash(code)),
		ParamNames: nil, // the synthesised factory takes no `utl` parameter
		Code:       code,
		// The transform replaces the whole argument, any `as` / `satisfies` wrapper
		// included, so the body lives only in the emitted module.
		FactoryArgStart: fnArg.Pos(),
		FactoryArgEnd:   fnArg.End(),
		FilePath:        sourceFile.FileName(),
	}, true
}
