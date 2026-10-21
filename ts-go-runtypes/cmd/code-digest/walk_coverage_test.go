package main

import (
	"testing"

	"github.com/microsoft/typescript-go/shim/ast"
)

func TestTsWalker_EveryKindHasARow(t *testing.T) {
	rows := map[string]int{}
	for kind := ast.KindUnknown; kind < ast.KindCount; kind++ {
		if ast.IsJSDocKind(kind) && ast.IsTokenKind(kind) {
			t.Errorf("%v is both a JSDoc kind and a token kind, so its row is ambiguous", kind)
		}
		rows[walkRow(kind)]++
	}
	for _, row := range []string{"dropped", "emitted whole", "walked through"} {
		if rows[row] == 0 {
			t.Errorf("no kind takes the %q row, so the walk no longer matches its rows", row)
		}
	}
	// Literal text must never reach the gap scanner, which would misread a regex or a template as code.
	for _, kind := range []ast.Kind{
		ast.KindIdentifier, ast.KindPrivateIdentifier,
		ast.KindStringLiteral, ast.KindNumericLiteral, ast.KindBigIntLiteral, ast.KindRegularExpressionLiteral,
		ast.KindNoSubstitutionTemplateLiteral, ast.KindTemplateHead, ast.KindTemplateMiddle, ast.KindTemplateTail,
	} {
		if walkRow(kind) != "emitted whole" {
			t.Errorf("%v must be emitted whole, its row is %q", kind, walkRow(kind))
		}
	}
}
