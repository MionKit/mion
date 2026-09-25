// Package builders recognises value-first builder calls (RT.string(), RT.object({…}), the temporal.* family)
// so the resolver can treat one as a valid CompTimeArgs leaf, self-validated on its own scan visit.
// Detection is by RETURN TYPE, a marker package's `RunType<…>`, never by name, so the `temporal.*` builders
// (whose signature symbol is named `build`, not `instant`) and any user wrapper returning a `RunType<…>` are
// covered. A leaf package: it must NOT import internal/compiler/resolver or comptimeargs, both depend on it.
package builders

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
)

// RunTypeName is the interface every value-first builder returns a `RunType<T>` from.
const RunTypeName = "RunType"

// PropModSentinel marks the carrier optional() / propMod() return: they compose into object({…}) but return
// a carrier, not a RunType, so the leaf check must recognise them separately.
const PropModSentinel = "__propMod"

// SlotSentinel marks the carrier slot() returns, one labeled tuple slot or named function parameter; like
// propMod it composes into a builder but returns a carrier, so the leaf check recognizes it structurally.
const SlotSentinel = "__slotLabel"

// GetRunTypeName is the id-LOOKUP escape: it returns a `RunType<T>` like every builder but does not BUILD
// one, it hands the injected id to the runtime registry. So a nested builder can lose its id and rebuild
// from its arguments, while this one has nothing to look up and throws.
const GetRunTypeName = "getRunType"

// IsIdLookupCall exempts `getRunType` from optimisations that assume a RunType-returning call can be
// reconstructed from its arguments.
func IsIdLookupCall(typeChecker *checker.Checker, call *ast.Node, markerOpts marker.Options) bool {
	if typeChecker == nil || call == nil || call.Kind != ast.KindCallExpression {
		return false
	}
	callExpression := call.AsCallExpression()
	if callExpression == nil || callExpression.Expression == nil {
		return false
	}
	symbol := typeChecker.GetSymbolAtLocation(callExpression.Expression)
	if symbol == nil {
		return false
	}
	if target := checker.SkipAlias(symbol, typeChecker); target != nil {
		symbol = target
	}
	return symbol.Name == GetRunTypeName && markerOpts.DeclaredInMarkerPackage(symbol)
}

// IsMarkerBuilderCall reports a value-first builder the marker package itself declares, the only calls whose
// runtime is known to fall back to its carrier without an id. A user wrapper returning `RunType<T>` may
// forward to getRunType and throw, so it never qualifies.
func IsMarkerBuilderCall(typeChecker *checker.Checker, call *ast.Node, markerOpts marker.Options) bool {
	if !IsValueBuilderCall(typeChecker, call, markerOpts) {
		return false
	}
	callExpression := call.AsCallExpression()
	if callExpression == nil || callExpression.Expression == nil {
		return false
	}
	symbol := typeChecker.GetSymbolAtLocation(callExpression.Expression)
	if symbol == nil {
		return false
	}
	if target := checker.SkipAlias(symbol, typeChecker); target != nil {
		symbol = target
	}
	return markerOpts.DeclaredInMarkerPackage(symbol)
}

// IsBuilderLeafCall reports whether call is a builder or a property-modifier call valid as a CompTimeArgs
// leaf; a user-module call is neither, so dynamic construction is still rejected. Each accepted call
// validates its own args on its own scan visit, so the leaf check STOPS here without recursing.
func IsBuilderLeafCall(typeChecker *checker.Checker, call *ast.Node, markerOpts marker.Options) bool {
	if typeChecker == nil || call == nil || call.Kind != ast.KindCallExpression {
		return false
	}
	returnType := CallReturnType(typeChecker, call)
	if returnType == nil {
		return false
	}
	if IsRunType(returnType, markerOpts) {
		return true
	}
	// The carrier interfaces are internal, so there is no symbol to gate on; their sentinel properties
	// are unique to the marker module.
	if checker.Checker_getPropertyOfType(typeChecker, returnType, PropModSentinel) != nil {
		return true
	}
	return checker.Checker_getPropertyOfType(typeChecker, returnType, SlotSentinel) != nil
}

// IsRunType matches the marker module's `RunType<…>` through the type's own symbol or its alias, both gated
// on the declaring module. Exported so the resolver can tell a schema-overload argument, declared
// `RunType<T>`, from a reflect-form value; markerOpts carries the accepted marker package set.
func IsRunType(tsType *checker.Type, markerOpts marker.Options) bool {
	for _, symbol := range declaringSymbols(tsType) {
		if symbol != nil && symbol.Name == RunTypeName && markerOpts.DeclaredInMarkerPackage(symbol) {
			return true
		}
	}
	return false
}

// IsMarkerPackageType is the name-free twin of IsRunType, for callers judging a type by its shape: a user
// module's own all-literal return type must not earn a marker type's leeway.
func IsMarkerPackageType(tsType *checker.Type, markerOpts marker.Options) bool {
	for _, symbol := range declaringSymbols(tsType) {
		if symbol != nil && markerOpts.DeclaredInMarkerPackage(symbol) {
			return true
		}
	}
	return false
}

// declaringSymbols returns the type's own symbol and its alias symbol; only one of them carries the
// declaration on a given type, so both are checked.
func declaringSymbols(tsType *checker.Type) [2]*ast.Symbol {
	var symbols [2]*ast.Symbol
	if tsType == nil {
		return symbols
	}
	symbols[0] = checker.Type_symbol(tsType)
	if alias := checker.Type_alias(tsType); alias != nil {
		symbols[1] = alias.Symbol()
	}
	return symbols
}

// CallReturnType is exported so a caller needing more than IsBuilderLeafCall's verdict inspects the same
// type it judges on.
func CallReturnType(typeChecker *checker.Checker, call *ast.Node) *checker.Type {
	if typeChecker == nil || call == nil || call.Kind != ast.KindCallExpression {
		return nil
	}
	signature := checker.Checker_getResolvedSignature(typeChecker, call, nil, 0)
	if signature == nil {
		return nil
	}
	return checker.Checker_getReturnTypeOfSignature(typeChecker, signature)
}
