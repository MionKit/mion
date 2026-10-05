package routerrules

import (
	goast "go/ast"
	"go/parser"
	"go/token"
	"strconv"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
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
			if len(clause.List) > 1 {
				t.Errorf("%s groups handled kinds in one arm", key)
			}
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
				matched := target == "refused" && len(clause.Body) == 1 && isFalseReturn(clause.Body[0])
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
			name := "Kind" + kind.String()
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
					if callee, ok := call.Fun.(*goast.SelectorExpr); ok && callee.Sel.Name == "ForEachChild" && len(call.Args) == 1 {
						if visitor, ok := call.Args[0].(*goast.SelectorExpr); ok && visitor.Sel.Name == fn.Name.Name {
							matched = true
						}
					}
				}
				return true
			})
			if matched {
				actual["default"] = "ForEachChild"
			} else {
				t.Errorf("%s must walk all other kinds", key)
			}
		}
		for kind, target := range table {
			if actual[kind] != target {
				t.Errorf("%s missing or misrouted row %s -> %s", key, kind, target)
			}
		}
		delete(rows, key)
	}
	for name := range rows {
		t.Errorf("walk %s has no implementation", name)
	}
}

func TestDrizzleCheckerWalk_ChildSlotsHaveArms(t *testing.T) {
	required := map[string][]struct{ collection, accessor, visitor string }{
		"visitCompoundType": {{"Types", "", "visitType"}},
		"visitObjectType": {
			{"GetTypeArguments", "", "visitType"},
			{"GetPropertiesOfType", "GetTypeOfSymbol", "visitType"},
			{"GetSignaturesOfType", "GetReturnTypeOfSignature", "visitType"},
			{"Parameters", "GetTypeOfSymbol", "visitType"},
			{"Declarations", "", "visit"},
			{"GetIndexInfosOfType", "KeyType", "visitType"},
			{"GetIndexInfosOfType", "ValueType", "visitType"},
		},
	}
	file, err := parser.ParseFile(token.NewFileSet(), "drizzle.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	for _, decl := range file.Decls {
		fn, ok := decl.(*goast.FuncDecl)
		if !ok {
			continue
		}
		for _, slot := range required[fn.Name.Name] {
			found := false
			goast.Inspect(fn.Body, func(node goast.Node) bool {
				loop, ok := node.(*goast.RangeStmt)
				if !ok {
					return true
				}
				getter := loop.X
				if call, ok := getter.(*goast.CallExpr); ok {
					getter = call.Fun
				}
				selection, ok := getter.(*goast.SelectorExpr)
				if !ok || selection.Sel.Name != slot.collection {
					return true
				}
				value, ok := loop.Value.(*goast.Ident)
				if !ok {
					return true
				}
				goast.Inspect(loop.Body, func(child goast.Node) bool {
					call, ok := child.(*goast.CallExpr)
					if !ok || len(call.Args) != 1 {
						return true
					}
					visitor, ok := call.Fun.(*goast.SelectorExpr)
					if !ok || visitor.Sel.Name != slot.visitor {
						return true
					}
					argument := call.Args[0]
					if slot.accessor == "" {
						if named, ok := argument.(*goast.Ident); ok && named.Name == value.Name {
							found = true
						}
						return true
					}
					extracted, ok := argument.(*goast.CallExpr)
					if !ok {
						return true
					}
					accessor, ok := extracted.Fun.(*goast.SelectorExpr)
					if !ok || accessor.Sel.Name != slot.accessor {
						return true
					}
					if receiver, ok := accessor.X.(*goast.Ident); ok && receiver.Name == value.Name {
						found = true
					}
					for _, arg := range extracted.Args {
						if named, ok := arg.(*goast.Ident); ok && named.Name == value.Name {
							found = true
						}
					}
					return true
				})
				return true
			})
			if !found {
				t.Errorf("%s does not recurse through %s/%s", fn.Name.Name, slot.collection, slot.accessor)
			}
		}
		delete(required, fn.Name.Name)
	}
	for visitor := range required {
		t.Errorf("missing visitor %s", visitor)
	}
}

func TestDrizzleCheckerWalk_EveryTypeFlagHasARow(t *testing.T) {
	rows := map[checker.TypeFlags]struct{ name, target string }{
		checker.TypeFlagsAny:             {"TypeFlagsAny", "refused"},
		checker.TypeFlagsUnknown:         {"TypeFlagsUnknown", "refused"},
		checker.TypeFlagsUndefined:       {"TypeFlagsUndefined", "refused"},
		checker.TypeFlagsNull:            {"TypeFlagsNull", "refused"},
		checker.TypeFlagsVoid:            {"TypeFlagsVoid", "refused"},
		checker.TypeFlagsString:          {"TypeFlagsString", "refused"},
		checker.TypeFlagsNumber:          {"TypeFlagsNumber", "refused"},
		checker.TypeFlagsBigInt:          {"TypeFlagsBigInt", "refused"},
		checker.TypeFlagsBoolean:         {"TypeFlagsBoolean", "refused"},
		checker.TypeFlagsESSymbol:        {"TypeFlagsESSymbol", "refused"},
		checker.TypeFlagsStringLiteral:   {"TypeFlagsStringLiteral", "refused"},
		checker.TypeFlagsNumberLiteral:   {"TypeFlagsNumberLiteral", "refused"},
		checker.TypeFlagsBigIntLiteral:   {"TypeFlagsBigIntLiteral", "refused"},
		checker.TypeFlagsBooleanLiteral:  {"TypeFlagsBooleanLiteral", "refused"},
		checker.TypeFlagsUniqueESSymbol:  {"TypeFlagsUniqueESSymbol", "refused"},
		checker.TypeFlagsEnumLiteral:     {"TypeFlagsEnumLiteral", "refused"},
		checker.TypeFlagsEnum:            {"TypeFlagsEnum", "refused"},
		checker.TypeFlagsNonPrimitive:    {"TypeFlagsNonPrimitive", "refused"},
		checker.TypeFlagsNever:           {"TypeFlagsNever", "refused"},
		checker.TypeFlagsTypeParameter:   {"TypeFlagsTypeParameter", "refused"},
		checker.TypeFlagsObject:          {"TypeFlagsObject", "visitObjectType"},
		checker.TypeFlagsIndex:           {"TypeFlagsIndex", "refused"},
		checker.TypeFlagsTemplateLiteral: {"TypeFlagsTemplateLiteral", "refused"},
		checker.TypeFlagsStringMapping:   {"TypeFlagsStringMapping", "refused"},
		checker.TypeFlagsSubstitution:    {"TypeFlagsSubstitution", "refused"},
		checker.TypeFlagsIndexedAccess:   {"TypeFlagsIndexedAccess", "refused"},
		checker.TypeFlagsConditional:     {"TypeFlagsConditional", "refused"},
		checker.TypeFlagsUnion:           {"TypeFlagsUnion", "visitUnionType"},
		checker.TypeFlagsIntersection:    {"TypeFlagsIntersection", "visitIntersectionType"},
		checker.TypeFlagsReserved1:       {"TypeFlagsReserved1", "refused"},
		checker.TypeFlagsReserved2:       {"TypeFlagsReserved2", "refused"},
		checker.TypeFlagsReserved3:       {"TypeFlagsReserved3", "refused"},
	}
	for bit := uint64(1); bit <= uint64(checker.TypeFlagsReserved3); bit <<= 1 {
		if rows[checker.TypeFlags(bit)].name == "" {
			t.Errorf("checker flag %d has no row", bit)
		}
	}
	file, err := parser.ParseFile(token.NewFileSet(), "drizzle.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	var fn *goast.FuncDecl
	for _, decl := range file.Decls {
		if candidate, ok := decl.(*goast.FuncDecl); ok && candidate.Name.Name == "visitType" {
			fn = candidate
		}
	}
	if fn == nil {
		t.Fatal("missing checker dispatch")
	}
	if len(fn.Body.List) == 0 || !isFalseReturn(fn.Body.List[len(fn.Body.List)-1]) {
		t.Error("unhandled flags must return false")
	}
	arms := map[string]*goast.CaseClause{}
	goast.Inspect(fn.Body, func(node goast.Node) bool {
		clause, ok := node.(*goast.CaseClause)
		if !ok {
			return true
		}
		for _, condition := range clause.List {
			goast.Inspect(condition, func(child goast.Node) bool {
				if flag, ok := child.(*goast.SelectorExpr); ok && strings.HasPrefix(flag.Sel.Name, "TypeFlags") {
					arms[flag.Sel.Name] = clause
				}
				return true
			})
		}
		return false
	})
	for _, row := range rows {
		arm := arms[row.name]
		if row.target == "refused" {
			if arm != nil {
				t.Errorf("%s unexpectedly dispatched", row.name)
			}
			continue
		}
		if arm == nil {
			t.Errorf("%s has no dispatch", row.name)
			continue
		}
		found := false
		goast.Inspect(arm, func(node goast.Node) bool {
			if call, ok := node.(*goast.CallExpr); ok {
				if callee, ok := call.Fun.(*goast.SelectorExpr); ok && callee.Sel.Name == row.target {
					found = true
				}
			}
			return true
		})
		if !found {
			t.Errorf("%s does not call %s", row.name, row.target)
		}
	}
}

func isFalseReturn(statement goast.Stmt) bool {
	returned, ok := statement.(*goast.ReturnStmt)
	if !ok || len(returned.Results) != 1 {
		return false
	}
	value, ok := returned.Results[0].(*goast.Ident)
	return ok && value.Name == "false"
}
