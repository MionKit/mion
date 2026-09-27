package drizzlemigrate

// Folds drizzle's chained columns into the slim builders' single call, `varchar('n', {length: 5}).notNull()`
// becoming `varchar('n', {length: 5, notNull: true})`: a modifier with no argument is `true`, one with
// arguments its argument tuple. The fold edits only the glue between the arguments, never the arguments
// themselves, so every other rewrite inside them (an `sql` alias, a reference) composes with it.

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/convert"
	"github.com/mionkit/mion/ts-go-runtypes/internal/tsimports"
)

// columnsObjectOf finds a table or view's columns object: the innermost call's object (or object-returning callback) second argument.
func columnsObjectOf(initializer *ast.Node) *ast.Node {
	var found *ast.Node
	node := initializer
	for node != nil {
		switch {
		case ast.IsParenthesizedExpression(node):
			node = node.AsParenthesizedExpression().Expression
		case ast.IsAsExpression(node):
			node = node.AsAsExpression().Expression
		case ast.IsNonNullExpression(node):
			node = node.AsNonNullExpression().Expression
		case ast.IsCallExpression(node):
			call := node.AsCallExpression()
			if call.Arguments != nil && len(call.Arguments.Nodes) >= 2 {
				if object := objectOrReturnedObject(call.Arguments.Nodes[1]); object != nil {
					found = object
				}
			}
			callee := call.Expression
			if callee == nil || !ast.IsPropertyAccessExpression(callee) {
				return found
			}
			node = callee.AsPropertyAccessExpression().Expression
		default:
			return found
		}
	}
	return found
}

// objectOrReturnedObject is the object literal, or the one drizzle's `(t) => ({...})` column helpers form returns.
func objectOrReturnedObject(node *ast.Node) *ast.Node {
	if node != nil && node.Kind == ast.KindArrowFunction {
		node = node.AsArrowFunction().Body
	}
	for node != nil && ast.IsParenthesizedExpression(node) {
		node = node.AsParenthesizedExpression().Expression
	}
	if node != nil && ast.IsObjectLiteralExpression(node) {
		return node
	}
	return nil
}

// eachColumnChain visits every column value of a split's columns object that is a chain to fold.
func eachColumnChain(split *splitDecl, visit func(key string, value *ast.Node)) {
	if split.columns == nil {
		return
	}
	for _, property := range split.columns.AsObjectLiteralExpression().Properties.Nodes {
		if property.Kind != ast.KindPropertyAssignment {
			continue
		}
		key := ""
		if nameNode := property.Name(); nameNode != nil {
			key = nameNode.Text()
		}
		value := property.AsPropertyAssignment().Initializer
		if _, links, ok := convert.WalkCallChain(value); ok && len(links) > 0 {
			visit(key, value)
		}
	}
}

// referenceTarget reads the split table and column off a `.references(() => table.column)` link, nil for any other target.
func (file *fileRun) referenceTarget(link convert.CallChainLink) (*splitDecl, string, *ast.Node) {
	args := link.Call.AsCallExpression().Arguments
	if args == nil || len(args.Nodes) == 0 || args.Nodes[0].Kind != ast.KindArrowFunction {
		return nil, "", nil
	}
	arrow := args.Nodes[0]
	body := arrow.AsArrowFunction().Body
	for body != nil && ast.IsParenthesizedExpression(body) {
		body = body.AsParenthesizedExpression().Expression
	}
	if body == nil || !ast.IsPropertyAccessExpression(body) {
		return nil, "", nil
	}
	access := body.AsPropertyAccessExpression()
	if access.Expression == nil || !ast.IsIdentifier(access.Expression) {
		return nil, "", nil
	}
	symbol := file.checker.GetSymbolAtLocation(access.Expression)
	target := file.splitBySymbol[symbol]
	if symbol == nil || target == nil || target.kind != "table" {
		return nil, "", nil
	}
	return target, access.Name().Text(), arrow
}

// unfoldable says why a split's columns have no single-call spelling, "" when every chain folds.
func (file *fileRun) unfoldable(split *splitDecl) string {
	reason := ""
	eachColumnChain(split, func(key string, value *ast.Node) {
		if reason != "" {
			return
		}
		_, links, refusal := convert.ColumnChainProps(value)
		if refusal != "" {
			reason = fmt.Sprintf("column %q: %s", key, refusal)
			return
		}
		for _, link := range links {
			if link.Method != "references" {
				continue
			}
			if target, _, _ := file.referenceTarget(link); target == nil {
				reason = fmt.Sprintf("column %q: .references() must point at a column of a table this run migrates, `() => table.column`", key)
				return
			}
		}
	})
	return reason
}

// refuseUnfoldableSplits drops unfoldable splits to a fixpoint: dropping a table strands the references to it.
func (file *fileRun) refuseUnfoldableSplits() {
	for {
		dropped := false
		for _, split := range append([]*splitDecl{}, file.splits...) {
			reason := file.unfoldable(split)
			if reason == "" {
				continue
			}
			file.diags = append(file.diags, *file.refuse(CodeUnfoldableColumn, split.nameNode.Parent,
				reason+". The slim builders take every setting in one props object, so this declaration stays drizzle."))
			file.dropSplit(split)
			dropped = true
		}
		if !dropped {
			return
		}
	}
}

// dropSplit withdraws a split before any edit is planned: no pair, no recorder region.
func (file *fileRun) dropSplit(split *splitDecl) {
	kept := file.splits[:0]
	for _, candidate := range file.splits {
		if candidate != split {
			kept = append(kept, candidate)
		}
	}
	file.splits = kept
	for symbol, candidate := range file.splitBySymbol {
		if candidate == split {
			delete(file.splitBySymbol, symbol)
		}
	}
	regions := file.regions[:0]
	for _, region := range file.regions {
		if region != [2]int{split.initStart, split.initEnd} {
			regions = append(regions, region)
		}
	}
	file.regions = regions
}

// planColumnFolds folds every column chain of every split table and view.
func (file *fileRun) planColumnFolds() {
	for _, split := range file.splits {
		eachColumnChain(split, func(_ string, value *ast.Node) {
			base, links, _ := convert.ColumnChainProps(value)
			file.foldChain(value, base, links)
		})
	}
}

// foldChain moves a chain's modifiers into its builder's props object, each argument with the rewrites already planned in it.
func (file *fileRun) foldChain(chain *ast.Node, base *ast.Node, links []convert.CallChainLink) {
	source := file.source
	var members []string
	for _, link := range links {
		call := link.Call.AsCallExpression()
		var args []*ast.Node
		if call.Arguments != nil {
			args = call.Arguments.Nodes
		}
		switch {
		case link.Method == "$type":
			typeArgs := call.TypeArguments
			typeText := strings.TrimSpace(file.textWithEdits(typeArgs.Nodes[0].Pos(), typeArgs.Nodes[len(typeArgs.Nodes)-1].End()))
			members = append(members, "$type: "+file.rootLocal("$type", false)+"<"+typeText+">()")
		case len(args) == 0:
			members = append(members, link.Method+": true")
		default:
			if link.Method == "references" {
				file.retypeReferenceAnnotation(link)
			}
			argsText := file.textWithEdits(tsimports.TokenStart(source, args[0].Pos()), args[len(args)-1].End())
			members = append(members, link.Method+": ["+argsText+"]")
		}
	}
	file.edits = append(file.edits, edit{start: base.End(), end: chain.End(), text: ""})
	file.insertProps(base, members)
}

// insertProps writes the members into the builder's config object in its own layout, or as a new props argument.
func (file *fileRun) insertProps(base *ast.Node, members []string) {
	source := file.source
	baseCall := base.AsCallExpression()
	var baseArgs []*ast.Node
	if baseCall.Arguments != nil {
		baseArgs = baseCall.Arguments.Nodes
	}
	insertAt := func(position int, text string) {
		file.edits = append(file.edits, edit{start: position, end: position, text: text})
	}
	if len(baseArgs) == 0 {
		// Past the `(`, which follows the callee and any type arguments.
		searchFrom := baseCall.Expression.End()
		if baseCall.TypeArguments != nil {
			searchFrom = baseCall.TypeArguments.End()
		}
		insertAt(strings.IndexByte(source[searchFrom:], '(')+searchFrom+1, "{"+strings.Join(members, ", ")+"}")
		return
	}
	last := baseArgs[len(baseArgs)-1]
	switch {
	case file.propsAreExtraArgument(base) || (!ast.IsObjectLiteralExpression(last) && file.isDbNameArgument(last)):
		insertAt(last.End(), ", {"+strings.Join(members, ", ")+"}")
	case !ast.IsObjectLiteralExpression(last):
		// A config held in a variable spreads into the props object.
		insertAt(tsimports.TokenStart(source, last.Pos()), "{...")
		insertAt(last.End(), ", "+strings.Join(members, ", ")+"}")
	case len(last.AsObjectLiteralExpression().Properties.Nodes) == 0:
		insertAt(tsimports.TokenStart(source, last.Pos())+1, strings.Join(members, ", "))
	default:
		properties := last.AsObjectLiteralExpression().Properties.Nodes
		lastProperty := properties[len(properties)-1]
		tail := source[lastProperty.End():last.End()]
		if !strings.Contains(tail, "\n") {
			insertAt(lastProperty.End(), ", "+strings.Join(members, ", "))
			return
		}
		// A multi-line object takes one member per line, indented like its last property, keeping its trailing comma.
		propertyStart := tsimports.TokenStart(source, lastProperty.Pos())
		indent := "\n" + lineIndent(source, propertyStart)
		trailing := strings.TrimLeft(tail, " \t\r\n")
		if strings.HasPrefix(trailing, ",") {
			commaAt := lastProperty.End() + strings.IndexByte(tail, ',') + 1
			insertAt(commaAt, indent+strings.Join(members, ","+indent)+",")
			return
		}
		insertAt(lastProperty.End(), ","+indent+strings.Join(members, ","+indent))
	}
}

// textWithEdits is a source span with its planned rewrites applied, taking them over since the span moves.
func (file *fileRun) textWithEdits(start, end int) string {
	var inner, kept []edit
	for _, planned := range file.edits {
		if planned.start >= start && planned.end <= end {
			inner = append(inner, edit{start: planned.start - start, end: planned.end - start, text: planned.text})
			continue
		}
		kept = append(kept, planned)
	}
	file.edits = kept
	text, applyErr := applyEdits(file.source[start:end], inner)
	if applyErr != nil {
		return file.source[start:end]
	}
	return text
}

// propsAreExtraArgument reports mysqlEnum, whose last argument is its values, so its props come after them.
func (file *fileRun) propsAreExtraArgument(base *ast.Node) bool {
	callee := base.AsCallExpression().Expression
	if callee != nil && ast.IsPropertyAccessExpression(callee) {
		access := callee.AsPropertyAccessExpression()
		return access.Name().Text() == "mysqlEnum" && access.Expression != nil && ast.IsIdentifier(access.Expression) &&
			tsimports.IsNamespaceImport(file.checker, access.Expression)
	}
	return callee != nil && ast.IsIdentifier(callee) && tsimports.ModuleOfImport(file.checker, callee) != "" &&
		tsimports.ImportedNameOf(file.checker, callee) == "mysqlEnum"
}

// isDbNameArgument reports whether a builder's lone non-object argument is its db name rather than a config.
func (file *fileRun) isDbNameArgument(node *ast.Node) bool {
	if ast.IsStringLiteral(node) || node.Kind == ast.KindNoSubstitutionTemplateLiteral || node.Kind == ast.KindTemplateExpression {
		return true
	}
	argType := file.checker.GetTypeAtLocation(node)
	return argType != nil && argType.Flags()&checker.TypeFlagsStringLike != 0
}

// retypeReferenceAnnotation swaps a reference callback's drizzle column annotation (a self-reference needs one, TS7022) for its TableRef.
func (file *fileRun) retypeReferenceAnnotation(link convert.CallChainLink) {
	target, column, arrow := file.referenceTarget(link)
	if arrow == nil || arrow.Type() == nil {
		return
	}
	annotation := ""
	if target.dbName != "" {
		annotation = file.rootLocal("TableRef", true) + "<" + quoteSingle(target.dbName) + ", " + quoteSingle(column) + ">"
	} else {
		annotation = file.rootLocal("AnyTableRef", true)
	}
	typeNode := arrow.Type()
	file.edits = append(file.edits, edit{start: tsimports.TokenStart(file.source, typeNode.Pos()), end: typeNode.End(), text: annotation})
}

// quoteSingle spells a string as a single-quoted TS literal.
func quoteSingle(text string) string {
	return "'" + strings.NewReplacer(`\`, `\\`, `'`, `\'`, "\n", `\n`).Replace(text) + "'"
}
