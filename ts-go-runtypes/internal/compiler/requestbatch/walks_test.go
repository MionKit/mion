package requestbatch

import (
	goast "go/ast"
	"go/parser"
	"go/token"
	"testing"

	"github.com/microsoft/typescript-go/shim/ast"
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

// TestMapperCallFinder_FindsAMapperUnderEveryContainer runs the real walk on a mapper nested under each expression
// shape a route argument or helper body holds it in.
func TestMapperCallFinder_FindsAMapperUnderEveryContainer(t *testing.T) {
	const mapper = "inputFrom(user, (u: {id: number}) => u.id)"
	containers := map[string]string{
		"ternary":        "flag ? " + mapper + " : 0",
		"array":          "[0, " + mapper + "]",
		"object":         "({id: " + mapper + "})",
		"call argument":  "String(" + mapper + ")",
		"method chain":   mapper + ".asArg()",
		"arrow body":     "(() => " + mapper + ")",
		"function body":  "(function () { return " + mapper + "; })",
		"binary":         "0 || " + mapper,
		"template":       "`${" + mapper + "}`",
		"spread":         "[..." + "[" + mapper + "]]",
		"await":          "(async () => await " + mapper + ")",
		"parenthesized":  "(" + mapper + ")",
		"as cast":        mapper + " as unknown",
		"non-null":       mapper + "!",
		"element access": "[" + mapper + "][0]",
	}
	for name, container := range containers {
		t.Run(name, func(t *testing.T) {
			overlay := setupOverlay(t, map[string]string{"a.ts": fixture(routesBound + "declare const flag: boolean;\nconst user = routes.users.getById(1);\nexport const probe = " + container + ";\n")})
			sourceFile := overlay.prog.SourceFile(overlay.files[0])
			scope := newFileScope(overlay.typeChecker, overlay.markerOpts, sourceFile)
			probe := variableInitializer(findVariable(t, sourceFile, "probe"))
			if !scope.containsMapperCall(probe) {
				t.Errorf("containsMapperCall missed the mapper under %s", name)
			}
		})
	}
}

// TestCollectAssignments_RecordsEveryWriteForm runs the real walk on each way a file can write a variable, and pins
// the value writtenValue reads from it.
func TestCollectAssignments_RecordsEveryWriteForm(t *testing.T) {
	forms := map[string]struct{ write, value string }{
		"assignment":        {"target = 1;", "1"},
		"compound":          {"target += 1;", "1"},
		"logical":           {"target ??= 1;", "1"},
		"array destructure": {"[target] = [1];", "[1]"},
		"object shorthand":  {"({target} = {target: 1});", "{target: 1}"},
		"for-of head":       {"for (target of [1]) {}", "[1]"},
		"for-in head":       {"for (target in {a: 1}) {}", "{a: 1}"},
		"postfix increment": {"target++;", "target++"},
		"prefix increment":  {"++target;", "++target"},
	}
	for name, form := range forms {
		t.Run(name, func(t *testing.T) {
			overlay := setupOverlay(t, map[string]string{"a.ts": "export {};\nlet target: any = 0;\n" + form.write + "\n"})
			sourceFile := overlay.prog.SourceFile(overlay.files[0])
			scope := newFileScope(overlay.typeChecker, overlay.markerOpts, sourceFile)
			declaration := findVariable(t, sourceFile, "target")
			writes := scope.assignedValues(declaration.Symbol(), declaration)
			if len(writes) != 1 {
				t.Fatalf("%s: %d writes recorded, want 1", name, len(writes))
			}
			text := sourceFile.Text()
			if got := text[scanStart(text, writes[0].Pos()):writes[0].End()]; got != form.value {
				t.Errorf("%s: written value %q, want %q", name, got, form.value)
			}
		})
	}
}

// findVariable returns the variable declaration named name in sourceFile.
func findVariable(t *testing.T, sourceFile *ast.SourceFile, name string) *ast.Node {
	t.Helper()
	var found *ast.Node
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if found != nil || node == nil {
			return found != nil
		}
		if node.Kind == ast.KindVariableDeclaration && node.Name() != nil && node.Name().Kind == ast.KindIdentifier && node.Name().Text() == name {
			found = node
			return true
		}
		node.ForEachChild(visit)
		return found != nil
	}
	sourceFile.AsNode().ForEachChild(visit)
	if found == nil {
		t.Fatalf("no variable %s", name)
	}
	return found
}

// scanStart skips the leading trivia a node's Pos includes.
func scanStart(text string, pos int) int {
	for pos < len(text) && (text[pos] == ' ' || text[pos] == '\n' || text[pos] == '\t') {
		pos++
	}
	return pos
}
