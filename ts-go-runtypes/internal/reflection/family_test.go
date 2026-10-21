package reflection

import (
	"go/ast"
	"go/parser"
	"go/token"
	"testing"
)

// The reserved kinds FamilyOf leaves unclassified on purpose (see family.go).
var unclassifiedKinds = map[ReflectionKind]bool{KindTypeParameter: true, KindInfer: true}

// declaredKinds reads the iota block in runtype.go, so a kind added there is checked without editing this test.
func declaredKinds(t *testing.T) []ReflectionKind {
	t.Helper()
	file, err := parser.ParseFile(token.NewFileSet(), "runtype.go", nil, 0)
	if err != nil {
		t.Fatalf("parsing runtype.go: %v", err)
	}
	for _, decl := range file.Decls {
		block, ok := decl.(*ast.GenDecl)
		if !ok || block.Tok != token.CONST || len(block.Specs) == 0 {
			continue
		}
		first := block.Specs[0].(*ast.ValueSpec)
		if len(first.Names) == 0 || first.Names[0].Name != "KindNever" {
			continue
		}
		kinds := make([]ReflectionKind, len(block.Specs))
		for i := range block.Specs {
			kinds[i] = KindNever + ReflectionKind(i)
		}
		return kinds
	}
	t.Fatalf("no KindNever iota block in runtype.go")
	return nil
}

// The per-kind gates (nondata agreement, the diagnostics grid) skip FamilyUnknown kinds, so every kind needs a family.
func TestFamilyOf_EveryDeclaredKind(t *testing.T) {
	for _, kind := range declaredKinds(t) {
		unknown := FamilyOf(kind) == FamilyUnknown
		if unknown && !unclassifiedKinds[kind] {
			t.Errorf("kind %d has no case in FamilyOf: classify it, or list it in unclassifiedKinds with a reason", kind)
		}
		if !unknown && unclassifiedKinds[kind] {
			t.Errorf("kind %d is classified now: drop it from unclassifiedKinds", kind)
		}
	}
}
