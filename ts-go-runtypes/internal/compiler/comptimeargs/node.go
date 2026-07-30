package comptimeargs

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/compiler/marker"
)

// IsCompTimeArgsParamNode reports whether paramSymbol's declared type annotation
// SYNTACTICALLY references the CompTimeArgs marker alias (`x: CompTimeArgs<…>`).
//
// CompTimeArgs is the zero-cost identity `type CompTimeArgs<T> = T` (markers.ts):
// the old `T & {__rtCompTimeArgsBrand?: never}` cost ~700 TS instantiations when
// T was a tuple — the `tuple` / `union` / `func` member lists (see
// docs/value-first-typecheck-cost.md). Identity removes the cost, but its
// instantiation drops the alias from the RESOLVED parameter type, so
// marker.DetectAny (resolved-type alias name / brand-property matching) can no
// longer see it. The written `CompTimeArgs<…>` annotation does survive in the
// .d.ts, so detect it here off the parameter's type node — resolving the reference
// through import aliases and confirming the marker package's symbol name +
// declaring module, the same rigor DetectAny applies. Shared by the resolver scan
// and the pure-fn extractor, the two places that recognise CompTimeArgs params.
func IsCompTimeArgsParamNode(typeChecker *checker.Checker, paramSymbol *ast.Symbol, opts marker.Options) bool {
	return isMarkerAliasParamNode(typeChecker, paramSymbol, opts, marker.KindCompTimeArgs)
}

// IsCompTimeHintsParamNode is the CompTimeHints twin — the LENIENT
// read-only marker (build reads literal values best-effort, never
// validates; createMockDataFn's options bag today). Same identity-alias
// story as CompTimeArgs (no brand survives resolution), so the written
// annotation is the only signal.
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
		// Resolve the reference to its declaration (following an `import {CompTimeArgs}`
		// alias), then require the marker package's name + module — never a user's own
		// same-named local type.
		symbol := ResolveImportAlias(typeChecker, typeChecker.GetSymbolAtLocation(typeName))
		if symbol == nil || symbol.Name != spec.Name {
			continue
		}
		if marker.DeclaredInModule(symbol, spec.Module, opts.FS) {
			return true
		}
	}
	return false
}

// IsInjectionMarkerParamNode reports whether paramSymbol's declared type
// annotation SYNTACTICALLY references an injection-marker alias — a trailing
// `id?: InjectRunTypeId<…>` or `ids?: InjectTypeFnArgs<…>` slot declared in the
// marker package.
//
// Unlike marker.DetectAny, which matches the RESOLVED parameter type, this
// reads the WRITTEN annotation. The two agree for a genuine marker function
// (which declares the annotation), but they DIVERGE for an unrelated generic
// function whose parameter merely INFERRED the branded marker type from a
// marker-typed argument. The load-bearing example is vitest's
// `expect(getRunTypeId<T>()).toBe(x)`: `expect` returns `Assertion<InjectRunTypeId<T>>`,
// so `Assertion<U>.toBe(expected: U)` instantiates `expected` to
// `InjectRunTypeId<T>`. DetectAny (correctly, at the type level) matches that
// inferred type — but `toBe` is not one of our functions, and only the
// syntactic annotation (`expected: U`, not `expected: InjectRunTypeId<…>`)
// tells them apart. enclosedByInjectionMarker gates on this so it never
// mistakes such a passer-through for an enclosing marker (which would wrongly
// drop the argument's OWN injection). See
// docs/done/same-typeid-two-marker-calls-one-statement-not-injected.md.
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
		// Resolve through any `import {InjectRunTypeId}` alias, then require the
		// marker package's symbol name + declaring module — the same rigor
		// IsCompTimeArgsParamNode / DetectAny apply, so a user's own same-named
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
			if marker.DeclaredInModule(symbol, spec.Module, opts.FS) {
				return true
			}
		}
	}
	return false
}
