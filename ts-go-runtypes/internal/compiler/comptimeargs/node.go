package comptimeargs

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
)

// IsCompTimeArgsParamNode reports whether paramSymbol's declared type annotation SYNTACTICALLY
// references the CompTimeArgs marker alias. CompTimeArgs is the zero-cost identity
// `type CompTimeArgs<T> = T` (markers.ts), which a brand property would cost ~700 TS instantiations
// over for a tuple T; identity drops the alias from the RESOLVED type, so marker.DetectAny can no
// longer see it. The written annotation survives in the .d.ts, so detection reads the type node,
// with the same import-alias resolution and package gate DetectAny applies.
func IsCompTimeArgsParamNode(typeChecker *checker.Checker, paramSymbol *ast.Symbol, opts marker.Options) bool {
	return isMarkerAliasParamNode(typeChecker, paramSymbol, opts, marker.KindCompTimeArgs)
}

// IsCompTimeHintsParamNode is the twin for the LENIENT read-only marker. Same identity-alias story
// as CompTimeArgs, so the written annotation is the only signal.
func IsCompTimeHintsParamNode(typeChecker *checker.Checker, paramSymbol *ast.Symbol, opts marker.Options) bool {
	return isMarkerAliasParamNode(typeChecker, paramSymbol, opts, marker.KindCompTimeHints)
}

// isMarkerAliasParamNode is the shared syntactic check: does paramSymbol's
// written type annotation reference the given marker kind's alias, resolved
// through import aliases and gated on the marker package's declaring module?
func isMarkerAliasParamNode(typeChecker *checker.Checker, paramSymbol *ast.Symbol, opts marker.Options, kind marker.Kind) bool {
	if typeChecker == nil || paramSymbol == nil {
		return false
	}
	spec, ok := marker.SpecForKind(opts, kind)
	if !ok {
		return false
	}
	for _, declaration := range paramSymbol.Declarations {
		if declaration == nil || !ast.IsParameterDeclaration(declaration) {
			continue
		}
		typeNode := declaration.AsParameterDeclaration().Type
		if typeNode == nil || !ast.IsTypeReferenceNode(typeNode) {
			continue
		}
		typeName := typeNode.AsTypeReferenceNode().TypeName
		if typeName == nil || typeName.Kind != ast.KindIdentifier {
			continue
		}
		// Require the marker package's name + module, never a user's own same-named local type.
		symbol := ResolveImportAlias(typeChecker, typeChecker.GetSymbolAtLocation(typeName))
		if symbol == nil || symbol.Name != spec.Name {
			continue
		}
		if opts.DeclaredInMarkerPackage(symbol) {
			return true
		}
	}
	return false
}

// IsInjectionMarkerParamNode reports whether paramSymbol's declared type annotation SYNTACTICALLY
// references an injection-marker alias declared in the marker package.
//
// It reads the WRITTEN annotation where marker.DetectAny matches the RESOLVED type. The two agree
// for a genuine marker function, but DIVERGE for an unrelated generic whose parameter merely
// INFERRED the branded type: in `expect(getRunTypeId<T>()).toBe(x)`, `Assertion<U>.toBe(expected: U)`
// instantiates `expected` to `InjectRunTypeId<T>`, which DetectAny matches at the type level even
// though `toBe` is not ours. enclosedByInjectionMarker gates on this so it never mistakes such a
// passer-through for an enclosing marker, which would wrongly drop the argument's OWN injection.
func IsInjectionMarkerParamNode(typeChecker *checker.Checker, paramSymbol *ast.Symbol, opts marker.Options) bool {
	if typeChecker == nil || paramSymbol == nil {
		return false
	}
	opts = marker.WithDefaults(opts)
	for _, declaration := range paramSymbol.Declarations {
		if declaration == nil || !ast.IsParameterDeclaration(declaration) {
			continue
		}
		typeNode := declaration.AsParameterDeclaration().Type
		if typeNode == nil || !ast.IsTypeReferenceNode(typeNode) {
			continue
		}
		typeName := typeNode.AsTypeReferenceNode().TypeName
		if typeName == nil || typeName.Kind != ast.KindIdentifier {
			continue
		}
		// Require the marker package's symbol name + declaring module, so a user's own same-named
		// local brand never triggers.
		symbol := ResolveImportAlias(typeChecker, typeChecker.GetSymbolAtLocation(typeName))
		if symbol == nil {
			continue
		}
		for _, kind := range []marker.Kind{marker.KindInjectRunTypeId, marker.KindInjectTypeFnArgs} {
			spec, ok := marker.SpecForKind(opts, kind)
			if !ok || symbol.Name != spec.Name {
				continue
			}
			if opts.DeclaredInMarkerPackage(symbol) {
				return true
			}
		}
	}
	return false
}
