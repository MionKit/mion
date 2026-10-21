package comptimeargs

// The extraction side of the package contract: CheckLiteral and friends VALIDATE that an AST
// expression is compile-time literal, the helpers here READ such an expression into a Go value.
// Both sides share UnwrapWrappers, EachConstVariableDeclaration and DepthCap, so a ref-resolution
// policy change lands in THIS package for every consumer at once.

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
)

// ResolveImportAlias follows import-alias symbols to the original declaration's symbol, so an
// imported const resolves to the declaration carrying the initializer. This is THE cross-module hop:
// the same-module-only tracers (resolveConstInitializer) deliberately do NOT apply it, the recovery
// tracers (TraceRegexpLiteral, typeid's pattern recovery) deliberately DO.
func ResolveImportAlias(typeChecker *checker.Checker, symbol *ast.Symbol) *ast.Symbol {
	for i := 0; i < DepthCap && symbol != nil && symbol.Flags&ast.SymbolFlagsAlias != 0; i++ {
		next := checker.Checker_getImmediateAliasedSymbol(typeChecker, symbol)
		if next == nil || next == symbol {
			break
		}
		symbol = next
	}
	return symbol
}

// ResolveSpreadContainer resolves a spread's operand to its underlying object- or array-literal
// node, following wrappers, `const` bindings and import aliases. Cross-module is intentional: the
// split-and-merge use case is strongest when the fragment is an imported shared `const`. (nil,
// false) when the operand is not statically a literal container. Shared by checkObjectLiteral /
// checkArrayLiteral and the resolver's option-bag merge, so both agree on which spreads resolve.
func ResolveSpreadContainer(typeChecker *checker.Checker, node *ast.Node) (*ast.Node, bool) {
	return resolveSpreadContainer(typeChecker, node, 0)
}

func resolveSpreadContainer(typeChecker *checker.Checker, node *ast.Node, depth int) (*ast.Node, bool) {
	if depth > DepthCap || typeChecker == nil {
		return nil, false
	}
	unwrapped := UnwrapWrappers(node)
	if unwrapped == nil {
		return nil, false
	}
	switch unwrapped.Kind {
	case ast.KindObjectLiteralExpression, ast.KindArrayLiteralExpression:
		return unwrapped, true
	case ast.KindIdentifier:
		symbol := typeChecker.GetSymbolAtLocation(unwrapped)
		if symbol == nil {
			return nil, false
		}
		var initializer *ast.Node
		EachConstVariableDeclaration(ResolveImportAlias(typeChecker, symbol), func(variableDeclaration *ast.VariableDeclaration) bool {
			if variableDeclaration.Initializer == nil {
				return true
			}
			initializer = variableDeclaration.Initializer
			return false
		})
		if initializer == nil {
			return nil, false
		}
		return resolveSpreadContainer(typeChecker, initializer, depth+1)
	}
	return nil, false
}

// StringLiteralValue returns the value of a string-literal expression. No const tracing — use
// ResolveLiteralString when identifier chains must be followed.
func StringLiteralValue(node *ast.Node) (string, bool) {
	unwrapped := UnwrapWrappers(node)
	if unwrapped == nil {
		return "", false
	}
	switch unwrapped.Kind {
	case ast.KindStringLiteral, ast.KindNoSubstitutionTemplateLiteral:
		return unwrapped.Text(), true
	}
	return "", false
}

// StringArrayLiteralValue reads an array-literal of string literals; non-string elements are
// skipped, and anything that is not an array literal answers nil.
func StringArrayLiteralValue(node *ast.Node) []any {
	unwrapped := UnwrapWrappers(node)
	if unwrapped == nil || unwrapped.Kind != ast.KindArrayLiteralExpression {
		return nil
	}
	array := unwrapped.AsArrayLiteralExpression()
	if array == nil || array.Elements == nil {
		return nil
	}
	out := make([]any, 0, len(array.Elements.Nodes))
	for _, element := range array.Elements.Nodes {
		if value, ok := StringLiteralValue(element); ok {
			out = append(out, value)
		}
	}
	return out
}

// TraceRegexpLiteral recovers (source, flags) from a regex literal written directly or reached
// through a `const` identifier chain. Import aliases ARE followed: a regex's source only exists in
// source text (its TYPE erases to `RegExp`), so the trace must cross module boundaries.
func TraceRegexpLiteral(typeChecker *checker.Checker, node *ast.Node) (source, flags string, ok bool) {
	return traceRegexpLiteral(typeChecker, node, 0)
}

func traceRegexpLiteral(typeChecker *checker.Checker, node *ast.Node, depth int) (string, string, bool) {
	if depth > DepthCap {
		return "", "", false
	}
	unwrapped := UnwrapWrappers(node)
	if unwrapped == nil {
		return "", "", false
	}
	switch unwrapped.Kind {
	case ast.KindRegularExpressionLiteral:
		literal := unwrapped.AsRegularExpressionLiteral()
		if literal == nil {
			return "", "", false
		}
		source, flags := SplitRegexpLiteralText(literal.Text)
		return source, flags, true
	case ast.KindIdentifier:
		symbol := typeChecker.GetSymbolAtLocation(unwrapped)
		if symbol == nil {
			return "", "", false
		}
		var initializer *ast.Node
		EachConstVariableDeclaration(ResolveImportAlias(typeChecker, symbol), func(variableDeclaration *ast.VariableDeclaration) bool {
			if variableDeclaration.Initializer == nil {
				return true
			}
			initializer = variableDeclaration.Initializer
			return false
		})
		if initializer == nil {
			return "", "", false
		}
		return traceRegexpLiteral(typeChecker, initializer, depth+1)
	}
	return "", "", false
}

// SplitRegexpLiteralText splits "/abc/i" into source ("abc") and flags ("i"); text without a
// leading slash comes back as-is with no flags.
func SplitRegexpLiteralText(text string) (source, flags string) {
	if !strings.HasPrefix(text, "/") {
		return text, ""
	}
	body := text[1:]
	lastSlash := strings.LastIndex(body, "/")
	if lastSlash < 0 {
		return body, ""
	}
	return body[:lastSlash], body[lastSlash+1:]
}
