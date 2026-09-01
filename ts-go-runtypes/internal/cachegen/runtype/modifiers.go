package runtype

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// Visibility values mirror deepkit's ReflectionVisibility enum so the wire
// shape matches what downstream consumers already understand.
const (
	visibilityPublic    = 0
	visibilityProtected = 1
	visibilityPrivate   = 2
)

// applyMemberModifiers reads the symbol's ValueDeclaration modifier flags and
// populates Readonly / Visibility / Abstract / Static on the member node.
// `asClass` gates class-only modifiers — interface PropertySignatures and
// MethodSignatures can still be readonly but never carry visibility/static/
// abstract markers.
func applyMemberModifiers(member *reflection.RunType, symbol *ast.Symbol, asClass bool) {
	// Readonly resolution: for symbols where the AST declaration would
	// lie about the effective readonly state — mapped-type properties
	// (Readonly<T> / `+readonly` / `-readonly`) and merged synthetic
	// properties from intersections/unions — trust CheckFlagsReadonly
	// directly. The TS checker has already applied all merging rules
	// (e.g. intersection: writable wins per tsgo
	// checker.go:21057-21060), and the underlying declarations still
	// carry pre-merge modifiers. Real declared symbols (CheckFlags
	// silent on these bits) fall through to the AST modifier read.
	const checkFlagsSynthOrMapped = ast.CheckFlagsMapped | ast.CheckFlagsSyntheticProperty | ast.CheckFlagsSyntheticMethod
	if symbol.CheckFlags&checkFlagsSynthOrMapped != 0 {
		if symbol.CheckFlags&ast.CheckFlagsReadonly != 0 {
			member.Readonly = true
		}
		// Synthesised symbols never carry meaningful class-level
		// modifiers — visibility/static/abstract live on actual
		// declarations only.
		return
	}
	// Non-synthesised symbols: CheckFlagsReadonly may also be set
	// (e.g. `const` variables, getter-without-setter). Honor it
	// alongside the AST modifier check so neither path loses info.
	if symbol.CheckFlags&ast.CheckFlagsReadonly != 0 {
		member.Readonly = true
	}
	declaration := symbol.ValueDeclaration
	if declaration == nil && len(symbol.Declarations) > 0 {
		declaration = symbol.Declarations[0]
	}
	if declaration == nil {
		return
	}
	flags := ast.GetCombinedModifierFlags(declaration)
	if flags&ast.ModifierFlagsReadonly != 0 {
		member.Readonly = true
	}
	if !asClass {
		return
	}
	if flags&ast.ModifierFlagsStatic != 0 {
		member.IsStatic = true
	}
	if flags&ast.ModifierFlagsAbstract != 0 {
		member.IsAbstract = true
	}
	switch {
	case flags&ast.ModifierFlagsPrivate != 0:
		v := visibilityPrivate
		member.Visibility = &v
	case flags&ast.ModifierFlagsProtected != 0:
		v := visibilityProtected
		member.Visibility = &v
	case flags&ast.ModifierFlagsPublic != 0:
		v := visibilityPublic
		member.Visibility = &v
	}
}

// applyParameterDefault inspects the parameter's declaration for an
// initializer expression. Literal values land in `DefaultVal`; non-literal
// initializers (function/expression/computed) leave DefaultVal nil and append
// the "nonLiteralDefault" marker to Flags — mirrors the reference convention.
func applyParameterDefault(parameter *reflection.RunType, symbol *ast.Symbol) {
	paramNode := parameterDeclaration(symbol)
	if paramNode == nil || paramNode.Initializer == nil {
		return
	}
	initializer := paramNode.Initializer
	switch initializer.Kind {
	case ast.KindStringLiteral, ast.KindNoSubstitutionTemplateLiteral:
		parameter.DefaultVal = initializer.Text()
	case ast.KindNumericLiteral:
		parameter.DefaultVal = parseNumberLiteral(initializer.Text())
	case ast.KindTrueKeyword:
		parameter.DefaultVal = true
	case ast.KindFalseKeyword:
		parameter.DefaultVal = false
	case ast.KindNullKeyword:
		parameter.DefaultVal = nil
	default:
		parameter.Flags = append(parameter.Flags, "nonLiteralDefault")
	}
}

// isRestParameter returns true when the parameter symbol's declaration
// carries a `...` (DotDotDotToken). The signature wire shape stores rest
// as a string flag on KindParameter — mirrors the tuple-member treatment
// in projectTuple. We can't ask the Signature itself because the shim
// doesn't expose Signature.flags; the AST node carries the same info via
// the rest token, which TS only sets on a true variadic parameter.
func isRestParameter(symbol *ast.Symbol) bool {
	paramNode := parameterDeclaration(symbol)
	return paramNode != nil && paramNode.DotDotDotToken != nil
}

// isOptionalParameter returns true when the parameter symbol's declaration
// carries a `?` (QuestionToken). SymbolFlagsOptional gets set on optional
// property symbols but NOT on optional parameter symbols in tsgo —
// optionality lives on the AST node for parameters, same place rest does.
func isOptionalParameter(symbol *ast.Symbol) bool {
	paramNode := parameterDeclaration(symbol)
	return paramNode != nil && paramNode.QuestionToken != nil
}

// parameterDeclaration unwraps a parameter symbol to its
// ParameterDeclaration AST node, or nil if the symbol's declaration is
// missing or of the wrong kind.
func parameterDeclaration(symbol *ast.Symbol) *ast.ParameterDeclaration {
	declaration := symbol.ValueDeclaration
	if declaration == nil && len(symbol.Declarations) > 0 {
		declaration = symbol.Declarations[0]
	}
	if declaration == nil || declaration.Kind != ast.KindParameter {
		return nil
	}
	return declaration.AsParameterDeclaration()
}
