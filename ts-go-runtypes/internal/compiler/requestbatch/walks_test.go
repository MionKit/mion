package requestbatch

import (
	goast "go/ast"
	"go/parser"
	"go/token"
	"testing"
)

// TestMapperCallFinder_ReachesEveryNode pins the visitor rule for this package's syntax walk: one switch, one arm
// per handled kind, every other kind walked through ForEachChild.
func TestMapperCallFinder_ReachesEveryNode(t *testing.T) {
	rows := map[string]string{"KindCallExpression": "isMapperFactoryCall"}
	file, err := parser.ParseFile(token.NewFileSet(), "routes.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	var visit *goast.FuncDecl
	for _, decl := range file.Decls {
		if fn, ok := decl.(*goast.FuncDecl); ok && fn.Recv != nil && fn.Name.Name == "visit" {
			if receiver, ok := fn.Recv.List[0].Type.(*goast.StarExpr); ok && receiver.X.(*goast.Ident).Name == "mapperCallFinder" {
				visit = fn
			}
		}
	}
	if visit == nil {
		t.Fatal("mapperCallFinder.visit not found")
	}
	arms := map[string]bool{}
	walksChildren := false
	goast.Inspect(visit.Body, func(node goast.Node) bool {
		switch typed := node.(type) {
		case *goast.CaseClause:
			for _, expr := range typed.List {
				name := expr.(*goast.SelectorExpr).Sel.Name
				target, ok := rows[name]
				if !ok {
					t.Errorf("arm %s has no row", name)
					continue
				}
				calls := false
				goast.Inspect(typed, func(child goast.Node) bool {
					if call, ok := child.(*goast.CallExpr); ok {
						if callee, ok := call.Fun.(*goast.SelectorExpr); ok && callee.Sel.Name == target {
							calls = true
						}
					}
					return true
				})
				if !calls {
					t.Errorf("arm %s does not call %s", name, target)
				}
				arms[name] = true
			}
		case *goast.CallExpr:
			if callee, ok := typed.Fun.(*goast.SelectorExpr); ok && callee.Sel.Name == "ForEachChild" {
				if argument, ok := typed.Args[0].(*goast.SelectorExpr); ok && argument.Sel.Name == "visit" {
					walksChildren = true
				}
			}
		}
		return true
	})
	for name := range rows {
		if !arms[name] {
			t.Errorf("row %s has no arm", name)
		}
	}
	if !walksChildren {
		t.Error("every other kind must be walked through ForEachChild(finder.visit)")
	}
}
