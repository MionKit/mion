// Type-channel twin of the AST literal readers (values.go): comptime
// args can also arrive as LITERAL TYPES (`FormatString<{maxLength: 5}>`)
// — tsgo has already resolved every alias / typeof / generic by the time
// we see them, so unlike the AST channel there is nothing to
// ref-resolve or operator-check; literalness IS a type flag. These
// helpers walk such types into Go values. Domain policy stays with the
// caller via TypeValueOptions (typeid binds its registerFormatPattern
// escape hatch and its TypeToString cache-identity fallback).
package comptimeargs

import (
	"strconv"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
)

// TypeValueOptions parameterizes the type-literal walk.
type TypeValueOptions struct {
	// PropertyOverride, when non-nil, intercepts every object property
	// BEFORE the generic literal read — return (value, true) to supply
	// the property's value from elsewhere (typeid recovers `typeof p`
	// pattern bundles from the declaring AST this way, since a regex
	// source can't ride the type channel). Applied at every nesting level.
	PropertyOverride func(symbol *ast.Symbol) (any, bool)
	// NonLiteralFallback renders a type the walk can't read as a literal
	// (unions of literals, template literals, plain `number`, …). nil
	// yields nil for such values. typeid passes TypeToString so
	// non-literal params still differentiate cache entries.
	NonLiteralFallback func(tsType *checker.Type) any
}

// TypeLiteralObject walks an object-literal type and collects its
// literal-valued properties into a map[string]any. Returns nil when
// objectType is nil or carries no properties (a zero-param `{}` is
// represented as nil for compactness).
func TypeLiteralObject(typeChecker *checker.Checker, objectType *checker.Type, opts TypeValueOptions) map[string]any {
	if objectType == nil {
		return nil
	}
	properties := typeChecker.GetPropertiesOfType(objectType)
	if len(properties) == 0 {
		return nil
	}
	out := make(map[string]any, len(properties))
	for _, symbol := range properties {
		if opts.PropertyOverride != nil {
			if value, ok := opts.PropertyOverride(symbol); ok {
				out[symbol.Name] = value
				continue
			}
		}
		out[symbol.Name] = TypeLiteralValue(typeChecker, typeChecker.GetTypeOfSymbol(symbol), opts)
	}
	return out
}

// TypeLiteralValue extracts a Go value from a literal-typed *checker.Type.
// Supported: string, number, boolean, bigint literals; tuple literals
// (→ []any); nested object literals (recursed via TypeLiteralObject).
// Anything else goes through opts.NonLiteralFallback.
func TypeLiteralValue(typeChecker *checker.Checker, tsType *checker.Type, opts TypeValueOptions) any {
	if tsType == nil {
		return nil
	}
	flags := tsType.Flags()
	switch {
	case flags&checker.TypeFlagsStringLiteral != 0:
		if value, ok := tsType.AsLiteralType().Value().(string); ok {
			return value
		}
	case flags&checker.TypeFlagsNumberLiteral != 0:
		// tsgo stores number literals as their string repr; promote to float64
		// when parseable for stable JSON serialisation, fall back to the raw
		// stringified form when it isn't (very large / bigint-shaped).
		raw := typeChecker.TypeToString(tsType)
		if value, err := strconv.ParseFloat(raw, 64); err == nil {
			return value
		}
		return raw
	case flags&checker.TypeFlagsBooleanLiteral != 0:
		return typeChecker.TypeToString(tsType) == "true"
	case flags&checker.TypeFlagsBigIntLiteral != 0:
		return typeChecker.TypeToString(tsType)
	case flags&checker.TypeFlagsObject != 0:
		// Tuple literal (e.g. mockSamples: ['a','b','c']) → []any of the
		// element values. Checked before the object-recursion branch since
		// a tuple is also flagged TypeFlagsObject.
		if checker.IsTupleType(tsType) {
			elements := typeChecker.GetTypeArguments(tsType)
			out := make([]any, 0, len(elements))
			for _, element := range elements {
				out = append(out, TypeLiteralValue(typeChecker, element, opts))
			}
			return out
		}
		// Nested object literal — recurse. Returns nil for empty objects so
		// callers' canonical keys stay compact (`k=null` rather than `k={}`).
		return TypeLiteralObject(typeChecker, tsType, opts)
	}
	if opts.NonLiteralFallback != nil {
		return opts.NonLiteralFallback(tsType)
	}
	return nil
}
