package runtype

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// Visibility values mirror deepkit's ReflectionVisibility enum, so the wire shape matches what consumers understand.
const (
	visibilityPublic    = 0
	visibilityProtected = 1
	visibilityPrivate   = 2
)

// applyMemberModifiers populates Readonly / Visibility / Abstract / Static from the declaration's modifier
// flags. `asClass` gates the class-only ones: an interface signature can be readonly but never static,
// abstract or visibility-marked.
func applyMemberModifiers(member *reflection.RunType, symbol *ast.Symbol, asClass bool) {
	// Where the AST declaration would lie about the effective readonly state (a mapped-type property, a
	// synthetic property merged out of an intersection/union), trust CheckFlagsReadonly: the checker already
	// applied the merging rules (in an intersection, writable wins) while the declarations keep pre-merge
	// modifiers. A real declared symbol, CheckFlags silent on these bits, falls through to the AST read.
	const checkFlagsSynthOrMapped = ast.CheckFlagsMapped | ast.CheckFlagsSyntheticProperty | ast.CheckFlagsSyntheticMethod
	if symbol.CheckFlags&checkFlagsSynthOrMapped != 0 {
		if symbol.CheckFlags&ast.CheckFlagsReadonly != 0 {
			member.Readonly = true
		}
		// Synthesised symbols carry no class-level modifiers: visibility/static/abstract live on declarations.
		return
	}
	// CheckFlagsReadonly can be set on a non-synthesised symbol too (a `const`, a getter without setter), so
	// both it and the AST modifier check are honoured.
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

// applyParameterDefault reads a parameter's initializer: a literal value lands in `DefaultVal`, anything else
// leaves DefaultVal nil and appends the "nonLiteralDefault" marker to Flags.
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

// isRestParameter reports whether the parameter declaration carries a `...` (DotDotDotToken). The Signature
// can't answer, the shim not exposing Signature.flags, and TS sets the rest token only on a true variadic.
func isRestParameter(symbol *ast.Symbol) bool {
	paramNode := parameterDeclaration(symbol)
	return paramNode != nil && paramNode.DotDotDotToken != nil
}

// isOptionalParameter reports whether the parameter declaration carries a `?` (QuestionToken): tsgo sets
// SymbolFlagsOptional on optional PROPERTY symbols but not on parameters, whose optionality lives on the node.
func isOptionalParameter(symbol *ast.Symbol) bool {
	paramNode := parameterDeclaration(symbol)
	return paramNode != nil && paramNode.QuestionToken != nil
}

// parameterDeclaration unwraps a parameter symbol to its ParameterDeclaration node, or nil when the
// declaration is missing or of another kind.
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
