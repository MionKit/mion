package routerrules

import (
	goast "go/ast"
	"go/parser"
	"go/token"
	"strconv"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/ast"
)

// These are structural dispatch tests. Diagnostic behavior is exercised through
// the real resolver by the frontend Drizzle suites.
func TestDrizzleVisitor_EveryTypeNodeKindHasARow(t *testing.T) {
	rows := map[ast.Kind]string{
		ast.KindTypeReference: "visitTypeReference", ast.KindTypeQuery: "visitTypeQuery", ast.KindImportType: "visitImportType",
		ast.KindTypePredicate: "children", ast.KindFunctionType: "visitFunctionType", ast.KindConstructorType: "visitConstructorType",
		ast.KindTypeLiteral: "children", ast.KindArrayType: "children", ast.KindTupleType: "children", ast.KindOptionalType: "children",
		ast.KindRestType: "children", ast.KindUnionType: "children", ast.KindIntersectionType: "children", ast.KindConditionalType: "children",
		ast.KindInferType: "children", ast.KindThisType: "children", ast.KindTypeOperator: "children", ast.KindIndexedAccessType: "children",
		ast.KindParenthesizedType: "children", ast.KindMappedType: "children", ast.KindLiteralType: "children", ast.KindNamedTupleMember: "children", ast.KindTemplateLiteralType: "children",
		ast.KindTemplateLiteralTypeSpan: "children",
	}
	for kind := ast.KindFirstTypeNode; kind <= ast.KindLastTypeNode; kind++ {
		if rows[kind] == "" {
			t.Errorf("type node %v has no dispatch row", kind)
		}
	}
	file, err := parser.ParseFile(token.NewFileSet(), "drizzle.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	expected := map[string]string{"KindTypeReference": "visitTypeReference", "KindTypeQuery": "visitTypeQuery", "KindImportType": "visitImportType"}
	for _, declaration := range file.Decls {
		fn, ok := declaration.(*goast.FuncDecl)
		if !ok || fn.Name.Name != "visit" || fn.Recv == nil {
			continue
		}
		receiver := fn.Recv.List[0].Type.(*goast.StarExpr).X.(*goast.Ident).Name
		if receiver != "drizzleProvenance" {
			continue
		}
		goast.Inspect(fn.Body, func(node goast.Node) bool {
			clause, ok := node.(*goast.CaseClause)
			if !ok {
				return true
			}
			for _, expr := range clause.List {
				selection, ok := expr.(*goast.SelectorExpr)
				if !ok {
					continue
				}
				target := expected[selection.Sel.Name]
				if target == "" {
					continue
				}
				matched := false
				goast.Inspect(clause, func(child goast.Node) bool {
					if call, ok := child.(*goast.CallExpr); ok {
						if callee, ok := call.Fun.(*goast.SelectorExpr); ok && callee.Sel.Name == target {
							matched = true
						}
					}
					return true
				})
				if !matched {
					t.Errorf("%s must dispatch to %s", selection.Sel.Name, target)
				}
				delete(expected, selection.Sel.Name)
			}
			if clause.List == nil {
				matched := false
				goast.Inspect(clause, func(child goast.Node) bool {
					if call, ok := child.(*goast.CallExpr); ok {
						if callee, ok := call.Fun.(*goast.SelectorExpr); ok && callee.Sel.Name == "ForEachChild" {
							matched = true
						}
					}
					return true
				})
				if !matched {
					t.Error("unhandled syntax kinds must visit children")
				}
			}
			return false
		})
	}
	for kind, target := range expected {
		t.Errorf("missing dispatch: %s -> %s", kind, target)
	}
}

func TestDrizzleSchemaSurface_AllDialectsHaveRows(t *testing.T) {
	// Gate against misspelling exported names such as MysqlTable and SqliteTable.
	source, err := parser.ParseFile(token.NewFileSet(), "drizzle.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	names := map[string]bool{}
	for _, decl := range source.Decls {
		if fn, ok := decl.(*goast.FuncDecl); ok && fn.Name.Name == "slimSchemaSymbol" {
			goast.Inspect(fn.Body, func(node goast.Node) bool {
				if lit, ok := node.(*goast.BasicLit); ok && lit.Kind == token.STRING {
					name, _ := strconv.Unquote(lit.Value)
					names[name] = true
				}
				return true
			})
		}
	}
	for _, name := range strings.Fields("PgTable PgTableWithRLS MysqlTable SqliteTable RtViewBuilder PgSchema PgEnum PgEnumObject PgSequence InferSelectModel InferInsertModel InferSelectViewModel SelectModelOf InsertModelOf $inferSelect $inferInsert") {
		if !names[name] {
			t.Errorf("schema surface has no row for %s", name)
		}
	}
}

func TestDrizzleDispatch_AllSyntaxWalksHaveCoverage(t *testing.T) {
	rows := map[string]map[string]string{
		"drizzleProvenance.visit": {
			"KindTypeReference": "visitTypeReference", "KindTypeQuery": "visitTypeQuery", "KindImportType": "visitImportType",
			"KindIdentifier": "visitIdentifier", "KindQualifiedName": "visitQualifiedName", "KindPropertyAccessExpression": "visitPropertyAccessExpression", "KindElementAccessExpression": "visitElementAccessExpression",
			"KindVariableDeclaration": "visitVariableDeclaration", "KindPropertyDeclaration": "visitPropertyDeclaration", "KindPropertySignature": "visitPropertySignature", "KindParameter": "visitParameter",
			"KindFunctionDeclaration": "visitFunctionDeclaration", "KindFunctionExpression": "visitFunctionExpression", "KindArrowFunction": "visitArrowFunction", "KindMethodDeclaration": "visitMethodDeclaration", "KindMethodSignature": "visitMethodSignature",
			"KindGetAccessor": "visitGetAccessor", "KindSetAccessor": "visitSetAccessor", "KindFunctionType": "visitFunctionType", "KindConstructorType": "visitConstructorType", "KindCallSignature": "visitCallSignature", "KindConstructSignature": "visitConstructSignature", "KindCallExpression": "visitCall", "KindObjectLiteralExpression": "visitObjectLiteral", "KindClassDeclaration": "visitClassDeclaration", "KindClassExpression": "visitClassExpression", "default": "ForEachChild",
		},
		"drizzleProvenance.visitClassMember": {"KindConstructor": "visitConstructor", "KindClassStaticBlockDeclaration": "refused", "default": "visit"},
		"drizzleProvenance.visitReturns": {
			"KindReturnStatement": "visit", "KindFunctionDeclaration": "refused", "KindFunctionExpression": "refused", "KindArrowFunction": "refused", "KindMethodDeclaration": "refused", "KindClassDeclaration": "refused", "KindClassExpression": "refused", "default": "ForEachChild",
		},
		"slimSchemaVisitor.visit": {
			"KindImportDeclaration": "visitImportDeclaration", "KindExportDeclaration": "visitExportDeclaration", "KindImportType": "visitImportType",
			"KindCallExpression": "visitCall", "KindTypeAliasDeclaration": "visitTypeAliasDeclaration", "KindInterfaceDeclaration": "visitInterfaceDeclaration", "default": "ForEachChild",
		},
		"slimModuleVisitor.visit":             {"KindImportDeclaration": "visitImport", "KindExportDeclaration": "visitExport", "KindTypeReference": "visitReference", "default": "ForEachChild"},
		"slimSchemaVisitor.visitAuthoredType": {"KindTypeReference": "visitAuthoredTypeReference", "KindImportType": "visitAuthoredImportType", "KindTypeQuery": "visitAuthoredTypeQuery", "KindExpressionWithTypeArguments": "visitExpressionWithTypeArguments", "default": "ForEachChild"},
	}
	file, err := parser.ParseFile(token.NewFileSet(), "drizzle.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	for _, decl := range file.Decls {
		fn, ok := decl.(*goast.FuncDecl)
		if !ok || fn.Recv == nil {
			continue
		}
		key := fn.Recv.List[0].Type.(*goast.StarExpr).X.(*goast.Ident).Name + "." + fn.Name.Name
		table, ok := rows[key]
		if !ok {
			continue
		}
		var dispatch *goast.SwitchStmt
		goast.Inspect(fn.Body, func(node goast.Node) bool {
			if statement, ok := node.(*goast.SwitchStmt); ok {
				dispatch = statement
				return false
			}
			return true
		})
		if dispatch == nil {
			t.Fatalf("%s has no dispatch", key)
		}
		actual := map[string]string{}
		for _, node := range dispatch.Body.List {
			clause := node.(*goast.CaseClause)
			names := []string{"default"}
			if clause.List != nil {
				names = nil
				for _, expr := range clause.List {
					names = append(names, expr.(*goast.SelectorExpr).Sel.Name)
				}
			}
			for _, name := range names {
				target, ok := table[name]
				if !ok {
					t.Errorf("%s %s has no row", key, name)
					continue
				}
				matched := target == "refused"
				goast.Inspect(clause, func(child goast.Node) bool {
					if call, ok := child.(*goast.CallExpr); ok {
						if callee, ok := call.Fun.(*goast.SelectorExpr); ok && callee.Sel.Name == target {
							matched = true
						}
						if callee, ok := call.Fun.(*goast.Ident); ok && callee.Name == target {
							matched = true
						}
					}
					return true
				})
				// Some visitors inspect a node, then visit children after the switch.
				if name == "default" && len(clause.Body) == 0 {
					matched = strings.Contains(table["default"], "ForEachChild")
				}
				if !matched {
					t.Errorf("%s %s does not call %s", key, name, target)
				}
				actual[name] = target
			}
		}
		for kind := ast.KindUnknown; kind < ast.KindCount; kind++ {
			name := kind.String()
			if _, ok := table[name]; !ok {
				name = "default"
			}
			if actual[name] == "" && name != "default" {
				t.Errorf("%s kind %v has no dispatch", key, kind)
			}
		}
		if table["default"] == "ForEachChild" {
			matched := false
			goast.Inspect(fn.Body, func(node goast.Node) bool {
				if call, ok := node.(*goast.CallExpr); ok {
					if callee, ok := call.Fun.(*goast.SelectorExpr); ok && callee.Sel.Name == "ForEachChild" {
						matched = true
					}
				}
				return true
			})
			if !matched {
				t.Errorf("%s must walk all other kinds", key)
			}
		}
		delete(rows, key)
	}
	for name := range rows {
		t.Errorf("walk %s has no implementation", name)
	}
}

func TestDrizzleCheckerWalk_ChildSlotsHaveArms(t *testing.T) {
	required := map[string]map[string]bool{
		"visitCompoundType": {"Types": false, "visitType": false},
		"visitObjectType":   {"GetTypeArguments": false, "GetPropertiesOfType": false, "GetTypeOfSymbol": false, "GetSignaturesOfType": false, "GetReturnTypeOfSignature": false, "GetIndexInfosOfType": false, "KeyType": false, "ValueType": false, "visitType": false},
	}
	file, err := parser.ParseFile(token.NewFileSet(), "drizzle.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	for _, decl := range file.Decls {
		if fn, ok := decl.(*goast.FuncDecl); ok {
			if slots, ok := required[fn.Name.Name]; ok {
				goast.Inspect(fn.Body, func(node goast.Node) bool {
					if call, ok := node.(*goast.CallExpr); ok {
						if callee, ok := call.Fun.(*goast.SelectorExpr); ok {
							if _, ok := slots[callee.Sel.Name]; ok {
								slots[callee.Sel.Name] = true
							}
						}
					}
					return true
				})
			}
		}
	}
	for visitor, slots := range required {
		for slot, seen := range slots {
			if !seen {
				t.Errorf("%s does not visit %s", visitor, slot)
			}
		}
	}
}
