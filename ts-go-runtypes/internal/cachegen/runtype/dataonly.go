package runtype

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
)

// dataOnlyAliasName is the DataOnly utility alias the serializer special-cases, declared in
// packages/run-types/src/runtypes/dataOnly.ts and gated on the configured marker package set, so a
// user-defined `DataOnly` outside a marker package never takes the special path.
const dataOnlyAliasName = "DataOnly"

// dataOnlyLadderAliasName is the helper alias the SHIPPED DataOnly delegates its branch ladder to: the object
// branch's mapped type is declared inside it, not inside `DataOnly`, so walking a production-instantiated
// mapped type up to its enclosing alias lands here. Recognised alongside dataOnlyAliasName, same module gate.
const dataOnlyLadderAliasName = "DataOnlyLadder"

// builderInternalAliasNames are the builders helper aliases modelling an object's shape from a value-first
// `object({...})` builder: `ObjectType<C>`, its optional/readonly/mixed branches, and the `Flatten` those wrap
// their group-intersection in, so `InferType` reads one object literal, not `{req} & {opt}`. They are
// compiler-internal and must never surface in reflection. On a COLD scan, before tsgo instantiated the builder
// types, the modeled type can still be one of these un-reduced aliases, and serializing its name + type
// arguments (the raw builder config) leaks the whole RunType wrapper into the bundle as dead entries.
// Treated as anonymous, name and type-argument reflection are dropped, the structural walk still projecting
// the modeled object shape.
var builderInternalAliasNames = map[string]bool{
	"ObjectType":         true,
	"ObjectOptionalOnly": true,
	"ObjectReadonlyOnly": true,
	"ObjectMixed":        true,
	"Flatten":            true,
}

// isBuilderInternalAlias reports whether aliasSymbol is one of builderInternalAliasNames, gated on the marker
// package so a user type of the same name never triggers it.
func isBuilderInternalAlias(aliasSymbol *ast.Symbol, markerOpts marker.Options) bool {
	if aliasSymbol == nil || !builderInternalAliasNames[aliasSymbol.Name] {
		return false
	}
	return markerOpts.DeclaredInMarkerPackage(aliasSymbol)
}

// dataOnlyTypeName recognises a mapped type synthesized by instantiating `DataOnly<T>` and composes the stable
// label `"DataOnly<<innerName>>"`. DataOnly's conditional ladder ends in a key-filtering homomorphic mapped
// type, and the conditional + key-remapping strip the alias from the result (`Type_alias` returns nil), so
// TypeName would stay empty and DefaultIsRTInlined would inline the whole body into every consumer of a type
// the user named. Recognition walks `MappedType.declaration` up to its enclosing TypeAliasDeclaration and
// matches the alias symbol name plus the marker-package gate. TWO names match: `DataOnly`, which minimal
// stand-ins declare the mapped type in, and `DataOnlyLadder`, where every production instantiation lands;
// matching only `DataOnly` left this path dead against the real package. The inner name comes from the mapped
// type's modifiersType, alias name first (`type X = …`), symbol name second (`interface X`).
// ok=false for any non-matching case, so callers fall through to the existing TypeName paths.
func dataOnlyTypeName(tsType *checker.Type, markerOpts marker.Options) (string, bool) {
	if tsType == nil {
		return "", false
	}
	if checker.Type_objectFlags(tsType)&checker.ObjectFlagsMapped == 0 {
		return "", false
	}
	mapped := tsType.AsMappedType()
	if mapped == nil {
		return "", false
	}
	decl := mappedTypeDeclaration(mapped)
	if decl == nil {
		return "", false
	}
	aliasDecl := enclosingTypeAlias(decl.AsNode())
	if aliasDecl == nil {
		return "", false
	}
	aliasSymbol := aliasDecl.Symbol()
	if aliasSymbol == nil || (aliasSymbol.Name != dataOnlyAliasName && aliasSymbol.Name != dataOnlyLadderAliasName) {
		return "", false
	}
	if !markerOpts.DeclaredInMarkerPackage(aliasSymbol) {
		return "", false
	}
	innerName := nameOfBoundType(mappedTypeModifiersType(mapped))
	if innerName == "" {
		return "", false
	}
	return "DataOnly<" + innerName + ">", true
}

// enclosingTypeAlias walks node's Parent chain for the nearest TypeAliasDeclaration, returning nil when the
// mapped type is not part of an alias body: an ad-hoc `{[K in …]: …}` literal, deliberately not special-cased.
func enclosingTypeAlias(node *ast.Node) *ast.Node {
	for n := node; n != nil; n = n.Parent {
		if n.Kind == ast.KindTypeAliasDeclaration {
			return n
		}
	}
	return nil
}

// nameOfBoundType returns a user-recognisable name for the type DataOnly was instantiated over: the alias name
// (`type X = …`) first, the symbol name (`interface X`) second, "" for primitives and unnamed types.
func nameOfBoundType(boundType *checker.Type) string {
	if boundType == nil {
		return ""
	}
	if alias := checker.Type_alias(boundType); alias != nil && alias.Symbol() != nil {
		return alias.Symbol().Name
	}
	if symbol := checker.Type_symbol(boundType); symbol != nil && symbol.Name != "" && symbol.Name[0] != '\xfe' {
		// The `\xfetype` sentinel marks TS's synthesized "__type" symbols, so "" lets the caller skip the label.
		return symbol.Name
	}
	return ""
}
