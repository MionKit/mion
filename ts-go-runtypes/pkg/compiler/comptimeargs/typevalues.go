package comptimeargs

// Type-channel twin of the AST literal readers (values.go): a comptime arg can also arrive as a
// LITERAL TYPE (`FormatString<{maxLength: 5}>`), where tsgo has already resolved every alias /
// typeof / generic, so there is nothing to ref-resolve or operator-check and literalness IS a type
// flag. Domain policy stays with the caller through TypeValueOptions.

import (
	"strconv"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
)

// TypeValueOptions parameterizes the type-literal walk.
type TypeValueOptions struct {
	// PropertyOverride intercepts every object property at every nesting level BEFORE the generic
	// literal read; return (value, true) to supply the value from elsewhere. typeid recovers
	// `typeof p` pattern bundles from the declaring AST this way, a regex source having no type to
	// ride.
	PropertyOverride func(symbol *ast.Symbol) (any, bool)
	// NonLiteralFallback renders a type the walk can't read as a literal (unions, template literals,
	// plain `number`, …); nil yields nil. typeid passes TypeToString so non-literal params still
	// differentiate cache entries.
	NonLiteralFallback func(tsType *checker.Type) any
}

// TypeLiteralObject collects an object-literal type's literal-valued properties. A zero-param `{}`
// answers nil, for compactness.
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

// TypeLiteralValue extracts a Go value from a literal-typed *checker.Type: string / number /
// boolean / bigint literals, tuples, and nested object literals. Anything else goes through
// opts.NonLiteralFallback.
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
		// tsgo stores number literals as their string repr; float64 when parseable keeps JSON
		// serialisation stable, and a very large / bigint-shaped one stays a string.
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
		// Checked before the object-recursion branch: a tuple is also flagged TypeFlagsObject.
		if checker.IsTupleType(tsType) {
			elements := typeChecker.GetTypeArguments(tsType)
			out := make([]any, 0, len(elements))
			for _, element := range elements {
				out = append(out, TypeLiteralValue(typeChecker, element, opts))
			}
			return out
		}
		// Empty objects come back nil, so callers' canonical keys stay compact (`k=null`, not `k={}`).
		return TypeLiteralObject(typeChecker, tsType, opts)
	}
	if opts.NonLiteralFallback != nil {
		return opts.NonLiteralFallback(tsType)
	}
	return nil
}

// IsTypeReadableValue reports whether the walk above can read tsType WHOLE, off the type alone. A
// value whose type answers yes needs no runtime evaluation, which is what lets a CALL producing one
// (registerFormatPattern → FormatPattern<{source: '…', …}>) stand as a compile-time literal. A
// widened field (`source: string`) answers no: there the value really would be lost.
func IsTypeReadableValue(typeChecker *checker.Checker, tsType *checker.Type) bool {
	return isTypeReadableValue(typeChecker, tsType, 0)
}

func isTypeReadableValue(typeChecker *checker.Checker, tsType *checker.Type, depth int) bool {
	if typeChecker == nil || tsType == nil || depth > DepthCap {
		return false
	}
	flags := tsType.Flags()
	switch {
	case flags&(checker.TypeFlagsStringLiteral|checker.TypeFlagsNumberLiteral|checker.TypeFlagsBooleanLiteral|checker.TypeFlagsBigIntLiteral) != 0:
		return true
	case flags&(checker.TypeFlagsUndefined|checker.TypeFlagsNull) != 0:
		return true
	case flags&checker.TypeFlagsUnion != 0:
		// The only union that survives is optionality (`'x' | undefined`), which strips to its single
		// readable member; `boolean` and literal unions strip to themselves and stop here.
		nonNullable := typeChecker.GetNonNullableType(tsType)
		return nonNullable != tsType && isTypeReadableValue(typeChecker, nonNullable, depth+1)
	case flags&checker.TypeFlagsObject == 0:
		return false
	}
	if checker.IsTupleType(tsType) {
		for _, element := range typeChecker.GetTypeArguments(tsType) {
			if !isTypeReadableValue(typeChecker, element, depth+1) {
				return false
			}
		}
		return true
	}
	properties := typeChecker.GetPropertiesOfType(tsType)
	// An empty object carries no value to read, so it is never "readable whole".
	if len(properties) == 0 {
		return false
	}
	for _, symbol := range properties {
		if !isTypeReadableValue(typeChecker, typeChecker.GetTypeOfSymbol(symbol), depth+1) {
			return false
		}
	}
	return true
}
