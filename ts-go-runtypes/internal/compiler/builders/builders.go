// Package builders recognises value-first builder calls (RT.string(),
// RT.object({…}), RT.array(…), the temporal.* family, …) so the resolver can
// treat a builder call as a valid CompTimeArgs leaf (a nested `string({…})`
// inside `object({…})` is a literal, self-validated on its own scan visit).
//
// Detection is by RETURN TYPE, not by function name: a builder is any call
// whose resolved return type is the marker module's `RunType<…>`. Keying on the
// return type — rather than a hand-maintained name allowlist — auto-covers the
// six `temporal.*` builders (which resolve through a shared `temporalBuilder`
// closure whose signature symbol is named `build`/anonymous, not `instant`) and
// any user wrapper that returns a `RunType<…>`.
//
// This is a leaf package: it imports only the AST/checker shims and
// internal/compiler/marker (for DeclaredInModule). It must not import internal/compiler/resolver
// or internal/compiler/comptimeargs — both depend on it.
package builders

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	vfspkg "github.com/microsoft/typescript-go/shim/vfs"
	"github.com/mionkit/ts-runtypes/internal/compiler/marker"
)

// RunTypeName is the marker module's run-type interface symbol name. The
// value-first builders all return `RunType<T>` from this interface.
const RunTypeName = "RunType"

// PropModSentinel is the carrier property optional()/propMod() return
// ({__propMod, __field}). Those helpers compose into object({…}) but return a
// carrier, not a RunType, so they need their own recognition in the leaf check.
const PropModSentinel = "__propMod"

// IsBuilderLeafCall reports whether call is a static builder-construction call
// valid as a CompTimeArgs leaf: a builder (returns RunType<…>, incl.
// the temporal.* family and composers) OR a property modifier (optional() /
// propMod(), returning a {__propMod,…} carrier). A user-module call is neither,
// so dynamic construction is still rejected. Each accepted call self-validates
// its own CompTimeArgs args on its own scan visit, so the leaf check STOPS here
// without recursing.
func IsBuilderLeafCall(typeChecker *checker.Checker, markerModule string, call *ast.Node, fs vfspkg.FS) bool {
	if typeChecker == nil || call == nil || call.Kind != ast.KindCallExpression {
		return false
	}
	signature := checker.Checker_getResolvedSignature(typeChecker, call, nil, 0)
	if signature == nil {
		return false
	}
	returnType := checker.Checker_getReturnTypeOfSignature(typeChecker, signature)
	if returnType == nil {
		return false
	}
	if IsRunType(returnType, markerModule, fs) {
		return true
	}
	// propMod / optional carrier — recognised structurally by the sentinel
	// property (the carrier interface is internal, so there's no symbol to gate
	// on; the property is unique to the marker module's modifiers).
	return checker.Checker_getPropertyOfType(typeChecker, returnType, PropModSentinel) != nil
}

// IsRunType reports whether tsType is the marker module's `RunType<…>` —
// matched via the type's own symbol (the interface case) or its alias symbol
// (defensive, in case a future declaration aliases it), both gated on the
// declaring module. Exported so the resolver can tell a schema-overload arg
// (`createValidateFn(schemaConst)`, declared `RunType<T>`) from a reflect-form value.
// fs is the resolver's virtual filesystem for the module-of-origin package.json
// walk (nil = real on-disk); see marker.DeclaredInModule.
func IsRunType(tsType *checker.Type, markerModule string, fs vfspkg.FS) bool {
	if tsType == nil {
		return false
	}
	if symbol := checker.Type_symbol(tsType); symbol != nil && symbol.Name == RunTypeName && marker.DeclaredInModule(symbol, markerModule, fs) {
		return true
	}
	if alias := checker.Type_alias(tsType); alias != nil {
		if symbol := alias.Symbol(); symbol != nil && symbol.Name == RunTypeName && marker.DeclaredInModule(symbol, markerModule, fs) {
			return true
		}
	}
	return false
}
