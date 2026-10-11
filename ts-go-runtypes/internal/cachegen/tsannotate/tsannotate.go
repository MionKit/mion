// Package tsannotate types the generated JS an emitMode ts module ships as live code: every binding TypeScript would
// read as an implicit any is annotated `any`, and every unused parameter gains a `_` prefix, so the module type-checks
// under noImplicitAny and noUnusedParameters. Only insertions: stripping the types gives the input back, modulo the
// prefixes.
package tsannotate

import (
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/parser"
	"github.com/microsoft/typescript-go/shim/scanner"
	"github.com/microsoft/typescript-go/shim/tspath"
)

type insertion struct {
	at   int
	text string
}

// Function annotates one function expression or declaration, returning it unchanged when it does not parse.
func Function(code string) string {
	wrapped := "(" + code + ")"
	const path = "/generated.ts"
	sourceFile := parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: path, Path: tspath.Path(path)}, wrapped, core.ScriptKindTS)
	if sourceFile == nil || len(sourceFile.Diagnostics()) > 0 {
		return code
	}
	var insertions []insertion
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		switch node.Kind {
		case ast.KindParameter:
			insertions = append(insertions, parameterInsertions(wrapped, node)...)
		case ast.KindVariableDeclaration:
			if variableNeedsAny(node) {
				insertions = append(insertions, insertion{at: node.Name().End(), text: ": any"})
			}
			if unusedLoopVariable(node) {
				insertions = append(insertions, insertion{at: scanner.SkipTrivia(wrapped, node.Name().Pos()), text: "_"})
			}
		}
		node.ForEachChild(visit)
		return false
	}
	sourceFile.AsNode().ForEachChild(visit)
	sort.SliceStable(insertions, func(i, j int) bool { return insertions[i].at < insertions[j].at })
	var out strings.Builder
	cursor := 0
	for _, insert := range insertions {
		out.WriteString(wrapped[cursor:insert.at])
		out.WriteString(insert.text)
		cursor = insert.at
	}
	out.WriteString(wrapped[cursor:])
	text := out.String()
	return text[1 : len(text)-1]
}

// parameterInsertions types an unannotated parameter `any` and prefixes an unused one with `_`. The JS no longer says
// which parameters were optional, so one without a default, rest or binding pattern turns optional.
func parameterInsertions(text string, node *ast.Node) []insertion {
	param := node.AsParameterDeclaration()
	name := param.Name()
	start := scanner.SkipTrivia(text, name.Pos())
	var out []insertion
	if name.Kind == ast.KindIdentifier && !strings.HasPrefix(name.Text(), "_") && !usedIn(text, node.Parent, name.Text()) {
		out = append(out, insertion{at: start, text: "_"})
		// A `name is T` return type names the parameter too, and must follow the rename.
		if returnType := node.Parent.Type(); returnType != nil && returnType.Kind == ast.KindTypePredicate {
			if predicateName := returnType.AsTypePredicateNode().ParameterName; predicateName != nil && predicateName.Text() == name.Text() {
				out = append(out, insertion{at: scanner.SkipTrivia(text, predicateName.Pos()), text: "_"})
			}
		}
	}
	if param.Type != nil {
		return out
	}
	annotation := "?: any"
	if param.Initializer != nil || param.DotDotDotToken != nil || ast.IsBindingPattern(name) || node.Parent.Kind == ast.KindSetAccessor {
		annotation = ": any"
	}
	if isBareArrowParameter(text, node) {
		return append([]insertion{{at: scanner.SkipTrivia(text, node.Pos()), text: "("}}, append(out, insertion{at: name.End(), text: annotation + ")"})...)
	}
	return append(out, insertion{at: name.End(), text: annotation})
}

// unusedLoopVariable reports a for-in / for-of variable its loop body never reads, which `_` exempts from
// noUnusedLocals (a plain `const` gets no such exemption, so emitters must not leave one unread).
func unusedLoopVariable(node *ast.Node) bool {
	name := node.Name()
	list := node.Parent
	if name.Kind != ast.KindIdentifier || strings.HasPrefix(name.Text(), "_") || list == nil || list.Parent == nil {
		return false
	}
	loop := list.Parent
	if loop.Kind != ast.KindForInStatement && loop.Kind != ast.KindForOfStatement {
		return false
	}
	return !reads(loop.AsForInOrOfStatement().Statement, name.Text())
}

// usedIn reports name read anywhere in fn's body, as an identifier that is not a property name.
func usedIn(text string, fn *ast.Node, name string) bool {
	body := fn.Body()
	if body == nil {
		return true
	}
	return reads(body, name)
}

// reads reports name as an identifier anywhere under node, property names aside.
func reads(body *ast.Node, name string) bool {
	used := false
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if used || node == nil {
			return used
		}
		if node.Kind == ast.KindIdentifier && node.Text() == name {
			parent := node.Parent
			isPropertyName := parent != nil && ((parent.Kind == ast.KindPropertyAccessExpression && parent.Name() == node) ||
				(parent.Kind == ast.KindPropertyAssignment && parent.Name() == node))
			if !isPropertyName {
				used = true
				return true
			}
		}
		node.ForEachChild(visit)
		return used
	}
	visit(body)
	return used
}

// isBareArrowParameter reports `x => …`, an arrow whose one parameter opens it, after an optional `async`.
func isBareArrowParameter(text string, node *ast.Node) bool {
	arrow := node.Parent
	if arrow == nil || arrow.Kind != ast.KindArrowFunction {
		return false
	}
	start := scanner.SkipTrivia(text, node.Pos())
	arrowStart := scanner.SkipTrivia(text, arrow.Pos())
	if strings.HasPrefix(text[arrowStart:], "async") && arrowStart+len("async") < start {
		arrowStart = scanner.SkipTrivia(text, arrowStart+len("async"))
	}
	return arrowStart == start
}

// variableNeedsAny reports a declaration TypeScript would type too narrowly or as an implicit any: a catch binding, an
// uninitialised variable, an object literal later written to by key, an empty array. A for-in / for-of head cannot take one.
func variableNeedsAny(node *ast.Node) bool {
	declaration := node.AsVariableDeclaration()
	if declaration.Type != nil || ast.IsBindingPattern(declaration.Name()) {
		return false
	}
	if node.Parent != nil && node.Parent.Kind == ast.KindCatchClause {
		return true
	}
	if node.Parent != nil && node.Parent.Parent != nil {
		switch node.Parent.Parent.Kind {
		case ast.KindForInStatement, ast.KindForOfStatement:
			return false
		}
	}
	initializer := declaration.Initializer
	switch {
	case initializer == nil:
		return true
	case initializer.Kind == ast.KindObjectLiteralExpression:
		return true
	case initializer.Kind == ast.KindArrayLiteralExpression && len(initializer.AsArrayLiteralExpression().Elements.Nodes) == 0:
		return true
	}
	return false
}

// TypeofOnlyNames lists the free names code reads only as `typeof X` operands, the runtime-detection idiom: TypeScript
// rejects one with no declaration in scope, so the module declares each `unknown`, which emits nothing.
func TypeofOnlyNames(code string) []string {
	wrapped := "(" + code + ")"
	const path = "/generated.ts"
	sourceFile := parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: path, Path: tspath.Path(path)}, wrapped, core.ScriptKindTS)
	if sourceFile == nil {
		return nil
	}
	typeofOnly := map[string]bool{}
	otherwise := map[string]bool{}
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		if node.Kind == ast.KindIdentifier {
			name := node.Text()
			parent := node.Parent
			switch {
			case parent != nil && parent.Kind == ast.KindTypeOfExpression:
				if !otherwise[name] {
					typeofOnly[name] = true
				}
			default:
				otherwise[name] = true
				delete(typeofOnly, name)
			}
		}
		node.ForEachChild(visit)
		return false
	}
	sourceFile.AsNode().ForEachChild(visit)
	names := make([]string, 0, len(typeofOnly))
	for name := range typeofOnly {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}
