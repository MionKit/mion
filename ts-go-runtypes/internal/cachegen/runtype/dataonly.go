package runtype

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
)

// dataOnlyAliasName is the symbol name of the DataOnly utility type alias the
// serializer special-cases. Defined in
// packages/run-types/src/runtypes/dataOnly.ts and gated by
// the configured marker package set so a user-defined `DataOnly` outside a
// marker package never triggers the special path.
const dataOnlyAliasName = "DataOnly"

// dataOnlyLadderAliasName is the internal helper alias the SHIPPED DataOnly
// delegates its branch ladder to (dataOnly.ts): the object branch's mapped
// type is declared inside `DataOnlyLadder<T, Depth>`, not inside `DataOnly`
// itself, so walking a production-instantiated mapped type up to its
// enclosing alias lands here. Recognised alongside dataOnlyAliasName under
// the same module gate.
const dataOnlyLadderAliasName = "DataOnlyLadder"

// builderInternalAliasNames are the ts-runtypes/builders helper aliases that model
// an object's shape from a value-first `object({...})` builder — `ObjectType<C>`,
// its optional/readonly/mixed conditional branches, and the `Flatten` those
// branches wrap their group-intersection in (so `InferType` reads a single object
// literal, not `{req} & {opt}`). They are compiler-internal and must never surface
// in reflection. On a COLD scan (before tsgo has instantiated the builder
// types) the modeled type can be left as one of these un-reduced aliases;
// serializing its name + type arguments (the raw builder config
// `PropModCarrier<…, RunType<…>>`) then leaks the whole RunType wrapper into the
// runtype bundle as dead, unreachable entries. Treating the alias as anonymous
// drops the name AND the type-argument reflection, while the structural walk still
// projects the modeled object shape.
var builderInternalAliasNames = map[string]bool{
	"ObjectType":         true,
	"ObjectOptionalOnly": true,
	"ObjectReadonlyOnly": true,
	"ObjectMixed":        true,
	"Flatten":            true,
}

// isBuilderInternalAlias reports whether aliasSymbol names one of the
// ts-runtypes/builders object-shape helper aliases (builderInternalAliasNames),
// gated on the marker package so a user type of the same name never triggers it.
func isBuilderInternalAlias(aliasSymbol *ast.Symbol, markerOpts marker.Options) bool {
	if aliasSymbol == nil || !builderInternalAliasNames[aliasSymbol.Name] {
		return false
	}
	return markerOpts.DeclaredInMarkerPackage(aliasSymbol)
}

// dataOnlyTypeName recognises a synthesized mapped type that came from
// instantiating the `DataOnly<T>` utility from `mion`
// and composes a stable label `"DataOnly<<innerName>>"` for it.
//
// Background — DataOnly resolves a plain object through a conditional
// branch ladder that ends in a key-filtering homomorphic mapped type
// (`{[K in keyof T as K extends symbol ? never : …]: …}`). The conditional
// + key-remapping strip the alias from the result type (`Type_alias`
// returns nil). Without intervention the serializer leaves TypeName empty,
// which makes DefaultIsRTInlined treat the root as an anonymous compound
// and inline its entire body into every consumer — hurting cache reuse on
// a type the user explicitly named.
//
// The recognition walks `MappedType.declaration` up the AST to its
// enclosing TypeAliasDeclaration and matches on (a) the alias's symbol
// name and (b) the package gate placing the declaration inside
// mion — the same module gate the marker scanner uses. TWO alias
// names match: `DataOnly` itself (the shape minimal stand-ins and older
// spellings declare the mapped type in), and `DataOnlyLadder` — the
// helper alias the SHIPPED dataOnly.ts hosts the object branch in, which
// is where every production instantiation lands. Matching only `DataOnly`
// left this path dead against the real package (caught when the test
// suites moved off the hand-written marker stand-in onto the shipped
// declarations). The inner name is composed from the mapped type's
// modifiersType (the bound T): we try its alias name first (matches
// `type X = …` argument), falling back to its symbol name (matches
// `interface X` argument). Returns ok=false for any non-matching case so
// callers fall through to existing TypeName paths unchanged.
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

// enclosingTypeAlias walks node's Parent chain looking for the nearest
// TypeAliasDeclaration ancestor. Returns nil if no such ancestor exists
// (the mapped type isn't part of an alias body — possible for ad-hoc
// `{[K in …]: …}` literals at type positions, which we deliberately don't
// special-case).
func enclosingTypeAlias(node *ast.Node) *ast.Node {
	for n := node; n != nil; n = n.Parent {
		if n.Kind == ast.KindTypeAliasDeclaration {
			return n
		}
	}
	return nil
}

// nameOfBoundType returns a user-recognisable name for the type DataOnly
// was instantiated over — preferring the alias name (the `X` in
// `type X = …`) and falling back to the symbol name (the `X` in
// `interface X`). Both forms cover the common cases; primitives or
// otherwise-unnamed types yield "".
func nameOfBoundType(boundType *checker.Type) string {
	if boundType == nil {
		return ""
	}
	if alias := checker.Type_alias(boundType); alias != nil && alias.Symbol() != nil {
		return alias.Symbol().Name
	}
	if symbol := checker.Type_symbol(boundType); symbol != nil && symbol.Name != "" && symbol.Name[0] != '\xfe' {
		// Skip the `\xfetype` sentinel TS uses for synthesized "__type"
		// symbols (anonymous object literals, mapped results without a
		// useful binding name); fall through to "" so the caller can
		// decide not to stamp a label.
		return symbol.Name
	}
	return ""
}
