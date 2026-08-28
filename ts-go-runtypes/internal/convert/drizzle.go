// drizzle.go — the drizzle-table conversion arm: recognizes table
// declarations of BOTH authoring roads by the mion drizzle sentinels on their
// resolved types (never by function name) and rewrites them between the
// canonical pair spellings:
//
//	builders form                                type form
//	const usersRT = DB.pgTable('users', {…});    type UsersRT = DB.PgTable<'users', {…}>;
//	type UsersRT = typeof usersRT;               const usersRT = DB.tableFromType<UsersRT>(getRunType<UsersRT>());
//
// Both directions preserve the VALUE (the const) and the TYPE name, so every
// use keeps working; the two halves always print together (canonical pair).
// The vocabulary is never a Go name table: builder fn names ride the type
// road's rtColSpec sentinel literals, type names are the first-letter
// uppercase rule verified against the dialect module's REAL exports, and the
// modifier vocabulary is whatever the builder's own return type / the mods
// sentinel carries. Tables using constructs with no type spelling (runtime
// function modifiers, sql values, extraConfig, references, non-literal args)
// report CNV009 and stay untouched.
package convert

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/cachegen/runtype"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// The sentinel member suffixes (tsgo spells a unique-symbol member as
// `\xFE@<symbolConstName>@<checkerId>`; stripSentinelId removes the id).
const (
	sentinelTable   = "@rtTableKey"
	sentinelColSpec = "@rtColSpecKey"
	sentinelColMods = "@rtColModsKey"
	sentinelColumn  = "@rtColumnKey"
)

// stripSentinelId reduces a late-bound member name to its stable form
// (mirrors cachegen/runtype stableMemberName, kept local to this package).
func stripSentinelId(name string) string {
	if len(name) < 2 || name[0] != 0xFE || name[1] != '@' {
		return name
	}
	at := strings.LastIndexByte(name, '@')
	if at <= 1 || at == len(name)-1 {
		return name
	}
	for i := at + 1; i < len(name); i++ {
		if name[i] < '0' || name[i] > '9' {
			return name
		}
	}
	return name[:at]
}

// typeHasSentinel reports whether the resolved type carries a member whose
// stable name ends with the given sentinel suffix.
func typeHasSentinel(typeChecker *checker.Checker, tsType *checker.Type, suffix string) bool {
	if tsType == nil {
		return false
	}
	for _, property := range typeChecker.GetPropertiesOfType(tsType) {
		if strings.HasSuffix(stripSentinelId(property.Name), suffix) {
			return true
		}
	}
	return false
}

// ── recognition ──────────────────────────────────────────────────────────────

// drizzleTypeAlias recognizes `type N = <ref>` whose declared type carries the
// table sentinel (the type road's PgTable/MysqlTable/SqliteTable spelling).
func drizzleTypeAlias(statement *ast.Node, typeChecker *checker.Checker) *declaration {
	nameNode := statement.Name()
	if nameNode == nil || hasTypeParameters(statement) {
		return nil
	}
	symbol := typeChecker.GetSymbolAtLocation(nameNode)
	if symbol == nil {
		return nil
	}
	declared := checker.Checker_getDeclaredTypeOfSymbol(typeChecker, symbol)
	if !typeHasSentinel(typeChecker, declared, sentinelTable) {
		return nil
	}
	decl := typeFormDeclaration(statement)
	decl.Drizzle = true
	return decl
}

// drizzleConstForm recognizes `const c = <call>` whose declared type carries
// the table sentinel — a builders-form table OR the type form's
// tableFromType handle (told apart later, in pairDrizzleDecls).
func drizzleConstForm(statement *ast.Node, typeChecker *checker.Checker) *declaration {
	initializer := constInitializer(statement)
	if initializer == nil || initializer.Kind != ast.KindCallExpression {
		return nil
	}
	variableStatement := statement.AsVariableStatement()
	declarators := variableStatement.DeclarationList.AsVariableDeclarationList().Declarations.Nodes
	nameNode := declarators[0].Name()
	if nameNode == nil || !ast.IsIdentifier(nameNode) {
		return nil
	}
	symbol := typeChecker.GetSymbolAtLocation(nameNode)
	if symbol == nil {
		return nil
	}
	if !typeHasSentinel(typeChecker, typeChecker.GetTypeOfSymbol(symbol), sentinelTable) {
		return nil
	}
	return &declaration{
		ConstName: nameNode.Text(),
		Form:      TargetBuilders,
		Drizzle:   true,
		Exported:  isExported(statement),
		Stmt:      statement,
		NameNode:  nameNode,
	}
}

// typeofAliasTarget reports whether the statement is `type N = typeof c`,
// returning the const name — the builders form's type-name half.
func typeofAliasTarget(statement *ast.Node) (string, bool) {
	alias := statement.AsTypeAliasDeclaration()
	if alias == nil || alias.Type == nil || alias.Type.Kind != ast.KindTypeQuery {
		return "", false
	}
	queried := alias.Type.AsTypeQueryNode().ExprName
	if queried == nil || !ast.IsIdentifier(queried) {
		return "", false
	}
	return queried.Text(), true
}

// tableFromTypeTarget reports whether the initializer is the type form's
// handle call — `<ns>.tableFromType<N>(getRunType<N>())` — returning N.
func tableFromTypeTarget(initializer *ast.Node) (string, bool) {
	if initializer == nil || initializer.Kind != ast.KindCallExpression {
		return "", false
	}
	call := initializer.AsCallExpression()
	callee := call.Expression
	if callee == nil || !ast.IsPropertyAccessExpression(callee) {
		return "", false
	}
	if callee.AsPropertyAccessExpression().Name().Text() != "tableFromType" {
		return "", false
	}
	if call.TypeArguments == nil || len(call.TypeArguments.Nodes) != 1 {
		return "", false
	}
	argument := call.TypeArguments.Nodes[0]
	if argument.Kind != ast.KindTypeReference {
		return "", false
	}
	typeRef := argument.AsTypeReferenceNode()
	if typeRef == nil || typeRef.TypeName == nil || !ast.IsIdentifier(typeRef.TypeName) {
		return "", false
	}
	return typeRef.TypeName.Text(), true
}

// pairDrizzleDecls merges the pair halves: a `typeof` alias onto its builders
// const (name half — the alias's own candidate declaration is consumed), and
// a tableFromType handle const onto its type declaration (value half). Runs
// inside recognizeFile, after the statement walk collected every candidate.
func pairDrizzleDecls(decls []*declaration, typeofAliases map[string]*ast.Node, typeofDecls map[string]*declaration) []*declaration {
	byConstName := map[string]*declaration{}
	byTypeName := map[string]*declaration{}
	for _, decl := range decls {
		if !decl.Drizzle {
			continue
		}
		if decl.Form == TargetBuilders && decl.ConstName != "" {
			byConstName[decl.ConstName] = decl
		}
		if decl.Form == TargetType && decl.Name != "" {
			byTypeName[decl.Name] = decl
		}
	}
	consumed := map[*declaration]bool{}
	for constName, aliasStmt := range typeofAliases {
		if decl := byConstName[constName]; decl != nil && decl.AliasStmt == nil {
			decl.AliasStmt = aliasStmt
			if nameNode := aliasStmt.Name(); nameNode != nil {
				decl.Name = nameNode.Text()
			}
			decl.AliasExported = isExported(aliasStmt)
			if aliasDecl := typeofDecls[constName]; aliasDecl != nil {
				consumed[aliasDecl] = true
			}
		}
	}
	for _, decl := range decls {
		if !decl.Drizzle || decl.Form != TargetBuilders || decl.AliasStmt != nil || consumed[decl] {
			continue
		}
		typeName, ok := tableFromTypeTarget(constInitializer(decl.Stmt))
		if !ok {
			continue
		}
		typeDecl := byTypeName[typeName]
		if typeDecl == nil || consumed[typeDecl] || typeDecl.ConstName != "" {
			continue
		}
		typeDecl.ConstName = decl.ConstName
		typeDecl.ConstNameNode = decl.NameNode
		typeDecl.AliasStmt = decl.Stmt
		consumed[decl] = true
	}
	if len(consumed) == 0 {
		return decls
	}
	kept := decls[:0]
	for _, decl := range decls {
		if !consumed[decl] {
			kept = append(kept, decl)
		}
	}
	return kept
}

// ── the shared table spec ────────────────────────────────────────────────────

// drizzleMod is one modifier call: the method name plus its rendered literal
// arg texts (empty for a flag).
type drizzleMod struct {
	method string
	args   []string
}

// drizzleColumn is one column: record key, builder fn, the rendered db-name
// and config literals ("" when absent), and the modifier chain.
type drizzleColumn struct {
	key    string
	fn     string
	name   string
	config string
	mods   []drizzleMod
}

// drizzleTableSpec is the shared intermediate BOTH printers consume; built
// from the call AST (builders source) or the reflected graph (type source).
type drizzleTableSpec struct {
	alias     string // the file's namespace alias for the dialect module
	tableFn   string // e.g. "pgTable" (canonical lowerFirst spelling)
	tableName string
	columns   []drizzleColumn
}

func drizzleRefuse(decl *declaration, format string, args ...any) *Diagnostic {
	return &Diagnostic{Code: CodeDrizzleUnsupported, Severity: SeverityError, Decl: declLabel(decl),
		Message: fmt.Sprintf("drizzle table %q: ", declLabel(decl)) + fmt.Sprintf(format, args...)}
}

// ── literal expression rendering (builders AST → canonical text) ─────────────

// literalExprText renders a literal-only expression canonically (single
// quotes, `{key: value}` members in source order). Non-literal constructs
// (identifiers, calls, sql templates, functions) have no type spelling.
func literalExprText(source string, node *ast.Node) (string, bool) {
	switch node.Kind {
	case ast.KindStringLiteral, ast.KindNoSubstitutionTemplateLiteral:
		return quoteSingle(node.Text()), true
	case ast.KindNumericLiteral, ast.KindBigIntLiteral:
		return strings.TrimSpace(source[skipTrivia(source, node.Pos()):node.End()]), true
	case ast.KindTrueKeyword:
		return "true", true
	case ast.KindFalseKeyword:
		return "false", true
	case ast.KindNullKeyword:
		return "null", true
	case ast.KindPrefixUnaryExpression:
		unary := node.AsPrefixUnaryExpression()
		if unary.Operator != ast.KindMinusToken || unary.Operand == nil || unary.Operand.Kind != ast.KindNumericLiteral {
			return "", false
		}
		operand, ok := literalExprText(source, unary.Operand)
		return "-" + operand, ok
	case ast.KindArrayLiteralExpression:
		var items []string
		for _, element := range node.AsArrayLiteralExpression().Elements.Nodes {
			item, ok := literalExprText(source, element)
			if !ok {
				return "", false
			}
			items = append(items, item)
		}
		return "[" + strings.Join(items, ", ") + "]", true
	case ast.KindObjectLiteralExpression:
		var members []string
		for _, property := range node.AsObjectLiteralExpression().Properties.Nodes {
			if property.Kind != ast.KindPropertyAssignment {
				return "", false
			}
			assignment := property.AsPropertyAssignment()
			nameNode := assignment.Name()
			if nameNode == nil {
				return "", false
			}
			value, ok := literalExprText(source, assignment.Initializer)
			if !ok {
				return "", false
			}
			members = append(members, propertyKeyText(nameNode)+": "+value)
		}
		// Comma-joined: valid in BOTH positions the canonical text lands in
		// (a value config object and a type literal argument).
		return "{" + strings.Join(members, ", ") + "}", true
	}
	return "", false
}

func propertyKeyText(nameNode *ast.Node) string {
	if ast.IsStringLiteral(nameNode) {
		return quoteSingle(nameNode.Text())
	}
	return nameNode.Text()
}

// skipTrivia advances past leading whitespace (Pos() includes trivia).
func skipTrivia(source string, pos int) int {
	for pos < len(source) && (source[pos] == ' ' || source[pos] == '\t' || source[pos] == '\n' || source[pos] == '\r') {
		pos++
	}
	return pos
}

// ── builders AST → spec ──────────────────────────────────────────────────────

// namespaceQualifier returns the namespace identifier of `NS.member` (call or
// type reference head), or nil when the reference is not namespace-qualified.
func namespaceQualifier(expr *ast.Node) (nsIdent *ast.Node, member string) {
	if expr == nil {
		return nil, ""
	}
	if ast.IsPropertyAccessExpression(expr) {
		access := expr.AsPropertyAccessExpression()
		if access.Expression != nil && ast.IsIdentifier(access.Expression) {
			return access.Expression, access.Name().Text()
		}
	}
	return nil, ""
}

// specFromBuildersAST parses `NS.pgTable('name', {key: NS.fn(...).mod(...)})`.
func specFromBuildersAST(source string, decl *declaration, typeChecker *checker.Checker) (*drizzleTableSpec, *ast.Node, *Diagnostic) {
	initializer := constInitializer(decl.Stmt)
	call := initializer.AsCallExpression()
	nsIdent, tableFn := namespaceQualifier(call.Expression)
	if nsIdent == nil {
		return nil, nil, drizzleRefuse(decl, "only namespace-qualified table calls convert (import * as DB from the dialect package)")
	}
	if call.Arguments == nil || len(call.Arguments.Nodes) < 2 {
		return nil, nil, drizzleRefuse(decl, "the table call needs a name and a columns object")
	}
	if len(call.Arguments.Nodes) > 2 {
		return nil, nil, drizzleRefuse(decl, "extraConfig (indexes, checks, foreign keys) has no type spelling yet")
	}
	nameArg := call.Arguments.Nodes[0]
	if !ast.IsStringLiteral(nameArg) {
		return nil, nil, drizzleRefuse(decl, "the table name must be a string literal")
	}
	columnsArg := call.Arguments.Nodes[1]
	if columnsArg.Kind != ast.KindObjectLiteralExpression {
		return nil, nil, drizzleRefuse(decl, "the columns argument must be a plain object literal (helper callbacks have no type spelling)")
	}
	spec := &drizzleTableSpec{alias: nsIdent.Text(), tableFn: tableFn, tableName: nameArg.Text()}
	for _, property := range columnsArg.AsObjectLiteralExpression().Properties.Nodes {
		if property.Kind != ast.KindPropertyAssignment {
			return nil, nil, drizzleRefuse(decl, "column entries must be plain `key: builder(...)` assignments")
		}
		assignment := property.AsPropertyAssignment()
		keyNode := assignment.Name()
		if keyNode == nil || !ast.IsIdentifier(keyNode) {
			return nil, nil, drizzleRefuse(decl, "column keys must be plain identifiers")
		}
		column, diag := columnFromChain(source, decl, assignment.Initializer, nsIdent.Text(), typeChecker)
		if diag != nil {
			return nil, nil, diag
		}
		column.key = keyNode.Text()
		spec.columns = append(spec.columns, *column)
	}
	return spec, nsIdent, nil
}

// columnFromChain parses `NS.fn(name?, config?).mod(args)...` into a column.
func columnFromChain(source string, decl *declaration, expr *ast.Node, alias string, typeChecker *checker.Checker) (*drizzleColumn, *Diagnostic) {
	var mods []drizzleMod
	current := expr
	for {
		if current == nil || current.Kind != ast.KindCallExpression {
			return nil, drizzleRefuse(decl, "a column must be a builder call chain")
		}
		call := current.AsCallExpression()
		callee := call.Expression
		if callee == nil || !ast.IsPropertyAccessExpression(callee) {
			return nil, drizzleRefuse(decl, "a column must be a namespace-qualified builder call chain")
		}
		access := callee.AsPropertyAccessExpression()
		if access.Expression != nil && ast.IsIdentifier(access.Expression) && access.Expression.Text() == alias {
			// The base builder call.
			column := &drizzleColumn{fn: access.Name().Text()}
			args := call.Arguments.Nodes
			argIndex := 0
			if argIndex < len(args) && ast.IsStringLiteral(args[argIndex]) {
				column.name = quoteSingle(args[argIndex].Text())
				argIndex++
			}
			if argIndex < len(args) {
				if args[argIndex].Kind != ast.KindObjectLiteralExpression {
					return nil, drizzleRefuse(decl, "builder %q: config must be an object literal", column.fn)
				}
				configText, ok := literalExprText(source, args[argIndex])
				if !ok {
					return nil, drizzleRefuse(decl, "builder %q: config carries a non-literal value", column.fn)
				}
				if configText != "{}" {
					column.config = configText
				}
				argIndex++
			}
			if argIndex < len(args) {
				return nil, drizzleRefuse(decl, "builder %q: unexpected extra argument", column.fn)
			}
			// mods were collected outermost-first; replay order is innermost-first.
			for left, right := 0, len(mods)-1; left < right; left, right = left+1, right-1 {
				mods[left], mods[right] = mods[right], mods[left]
			}
			column.mods = mods
			return column, nil
		}
		// A modifier call: record and step into the receiver.
		method := access.Name().Text()
		if strings.HasPrefix(method, "$") {
			return nil, drizzleRefuse(decl, "modifier %q is runtime-only and has no type spelling", method)
		}
		var args []string
		for _, argument := range call.Arguments.Nodes {
			argText, ok := literalExprText(source, argument)
			if !ok {
				return nil, drizzleRefuse(decl, "modifier %q: argument is not a literal (sql values, functions and column references have no type spelling)", method)
			}
			args = append(args, argText)
		}
		mods = append(mods, drizzleMod{method: method, args: args})
		current = access.Expression
	}
}

// ── reflected graph → spec (type form) ───────────────────────────────────────

// specFromGraph reads the table spec off the resolved reflection graph — the
// same walk the runtime bridge does in JS (fromType.ts), mirrored in Go.
func specFromGraph(resolved *resolvedDecl, decl *declaration, alias string, tableFn string) (*drizzleTableSpec, *Diagnostic) {
	deref := func(node *reflection.RunType) *reflection.RunType {
		if node != nil && node.Kind == reflection.KindRef {
			return resolved.Resolve(node.ID)
		}
		return node
	}
	// properties lists a node's property children DEREFERENCED (child slots in
	// the serialized graph are `{kind:-1, id}` sentinels), flattening
	// intersection arms (the type road's RtTable is `Cols & {meta}`).
	var properties func(node *reflection.RunType) []*reflection.RunType
	properties = func(node *reflection.RunType) []*reflection.RunType {
		node = deref(node)
		if node == nil {
			return nil
		}
		if node.Kind == reflection.KindIntersection {
			var flattened []*reflection.RunType
			for _, arm := range node.Children {
				flattened = append(flattened, properties(arm)...)
			}
			return flattened
		}
		var out []*reflection.RunType
		for _, child := range node.Children {
			if resolvedChild := deref(child); resolvedChild != nil {
				out = append(out, resolvedChild)
			}
		}
		return out
	}
	member := func(node *reflection.RunType, suffix string) *reflection.RunType {
		for _, property := range properties(node) {
			if strings.HasSuffix(stripSentinelId(property.Name), suffix) {
				return deref(property.Child)
			}
		}
		return nil
	}
	var literalText func(node *reflection.RunType, where string) (string, *Diagnostic)
	literalText = func(node *reflection.RunType, where string) (string, *Diagnostic) {
		node = deref(node)
		if node == nil {
			return "", drizzleRefuse(decl, "%s: missing literal node", where)
		}
		switch node.Kind {
		case reflection.KindLiteral:
			text, ok := literalValueText(node)
			if !ok {
				return "", drizzleRefuse(decl, "%s: unprintable literal", where)
			}
			return text, nil
		case reflection.KindUndefined:
			return "", nil
		case reflection.KindTuple:
			var items []string
			for i, rawMember := range node.Children {
				tupleMember := deref(rawMember)
				if tupleMember == nil {
					return "", drizzleRefuse(decl, "%s[%d]: missing tuple member", where, i)
				}
				item, diag := literalText(tupleMember.Child, fmt.Sprintf("%s[%d]", where, i))
				if diag != nil {
					return "", diag
				}
				items = append(items, item)
			}
			return "[" + strings.Join(items, ", ") + "]", nil
		case reflection.KindObjectLiteral:
			var members []string
			for _, rawMember := range node.Children {
				objectMember := deref(rawMember)
				if objectMember == nil {
					return "", drizzleRefuse(decl, "%s: missing object member", where)
				}
				value, diag := literalText(objectMember.Child, where+"."+objectMember.Name)
				if diag != nil {
					return "", diag
				}
				members = append(members, objectMember.Name+": "+value)
			}
			return "{" + strings.Join(members, ", ") + "}", nil
		}
		return "", drizzleRefuse(decl, "%s: not a literal type (kind %d)", where, node.Kind)
	}

	root := resolved.Node
	meta := member(root, sentinelTable)
	if meta == nil {
		return nil, drizzleRefuse(decl, "the declared type carries no table metadata")
	}
	nameNode := member(meta, "name")
	if nameNode == nil || nameNode.Kind != reflection.KindLiteral {
		return nil, drizzleRefuse(decl, "the table name is not a string literal")
	}
	tableName, _ := nameNode.Literal.(string)
	columnsNode := member(meta, "columns")
	if columnsNode == nil {
		return nil, drizzleRefuse(decl, "the table type has no columns record")
	}
	spec := &drizzleTableSpec{alias: alias, tableFn: tableFn, tableName: tableName}
	for _, columnMember := range properties(columnsNode) {
		columnNode := deref(columnMember.Child)
		if columnNode == nil || strings.HasPrefix(columnMember.Name, "\xFE") {
			continue
		}
		specNode := member(columnNode, sentinelColSpec)
		if specNode == nil {
			return nil, drizzleRefuse(decl, "column %q carries no column spec (use the dialect column types)", columnMember.Name)
		}
		column := drizzleColumn{key: columnMember.Name}
		fnNode := member(specNode, "fn")
		if fnNode == nil || fnNode.Kind != reflection.KindLiteral {
			return nil, drizzleRefuse(decl, "column %q has no builder fn literal", columnMember.Name)
		}
		column.fn, _ = fnNode.Literal.(string)
		if dbName := member(specNode, "name"); dbName != nil && dbName.Kind == reflection.KindLiteral {
			if text, ok := literalValueText(dbName); ok {
				column.name = text
			}
		}
		if configNode := member(specNode, "config"); configNode != nil && len(configNode.Children) > 0 {
			configText, diag := literalText(configNode, columnMember.Name+".config")
			if diag != nil {
				return nil, diag
			}
			column.config = configText
		}
		if modsNode := member(columnNode, sentinelColMods); modsNode != nil {
			for _, modMember := range properties(modsNode) {
				valueNode := deref(modMember.Child)
				if valueNode == nil {
					return nil, drizzleRefuse(decl, "column %q: malformed modifier %q", columnMember.Name, modMember.Name)
				}
				if valueNode.Kind == reflection.KindLiteral {
					spec := drizzleMod{method: modMember.Name}
					column.mods = append(column.mods, spec)
					continue
				}
				if valueNode.Kind != reflection.KindTuple {
					return nil, drizzleRefuse(decl, "column %q: modifier %q carries neither a flag nor an args tuple", columnMember.Name, modMember.Name)
				}
				mod := drizzleMod{method: modMember.Name}
				for i, rawTupleMember := range valueNode.Children {
					tupleMember := deref(rawTupleMember)
					if tupleMember == nil {
						return nil, drizzleRefuse(decl, "column %q: modifier %q has a missing arg node", columnMember.Name, modMember.Name)
					}
					argText, diag := literalText(tupleMember.Child, fmt.Sprintf("%s.%s[%d]", columnMember.Name, modMember.Name, i))
					if diag != nil {
						return nil, diag
					}
					mod.args = append(mod.args, argText)
				}
				column.mods = append(column.mods, mod)
			}
		}
		spec.columns = append(spec.columns, column)
	}
	return spec, nil
}

// ── vocabulary: the dialect module's real exports ────────────────────────────

// drizzleExports enumerates the dialect module's exported names by walking its
// source statements (following relative re-exports), starting from the
// namespace identifier's aliased module symbol. Same walk the manifest
// generator uses; syntactic so type-only exports count too.
func drizzleExports(prog *program.Program, typeChecker *checker.Checker, nsIdent *ast.Node) (map[string]bool, string) {
	symbol := typeChecker.GetSymbolAtLocation(nsIdent)
	if symbol == nil {
		return nil, ""
	}
	if symbol.Flags&ast.SymbolFlagsAlias != 0 {
		if aliased := checker.Checker_getImmediateAliasedSymbol(typeChecker, symbol); aliased != nil {
			symbol = aliased
		}
	}
	var modulePath string
	for _, declNode := range symbol.Declarations {
		if declNode != nil && ast.IsSourceFile(declNode) {
			modulePath = declNode.AsSourceFile().FileName()
			break
		}
	}
	if modulePath == "" {
		return nil, ""
	}
	names := map[string]bool{}
	collectModuleExports(prog, modulePath, names, map[string]bool{})
	return names, modulePath
}

// collectModuleExports gathers a module's exported names, recursing through
// RELATIVE re-exports only (a bare re-export is another package's surface).
func collectModuleExports(prog *program.Program, modulePath string, names map[string]bool, visited map[string]bool) {
	if modulePath == "" || visited[modulePath] {
		return
	}
	visited[modulePath] = true
	moduleFile := prog.SourceFile(modulePath)
	if moduleFile == nil {
		return
	}
	relativeTarget := func(moduleSpecifier *ast.Node) string {
		specifierText := moduleSpecifier.Text()
		if !strings.HasPrefix(specifierText, "./") && !strings.HasPrefix(specifierText, "../") {
			return ""
		}
		return filepath.ToSlash(filepath.Join(filepath.Dir(modulePath), filepath.FromSlash(specifierText)))
	}
	for _, statement := range moduleFile.AsNode().Statements() {
		if statement == nil {
			continue
		}
		switch {
		case ast.IsTypeAliasDeclaration(statement) || ast.IsInterfaceDeclaration(statement) ||
			ast.IsFunctionDeclaration(statement) || ast.IsClassDeclaration(statement):
			if isExported(statement) && statement.Name() != nil {
				names[statement.Name().Text()] = true
			}
		case ast.IsVariableStatement(statement):
			if !isExported(statement) {
				continue
			}
			for _, declarator := range statement.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes {
				if nameNode := declarator.Name(); nameNode != nil && ast.IsIdentifier(nameNode) {
					names[nameNode.Text()] = true
				}
			}
		case ast.IsExportDeclaration(statement):
			exportDeclaration := statement.AsExportDeclaration()
			if exportDeclaration.ModuleSpecifier == nil {
				if exportDeclaration.ExportClause != nil {
					for _, specifier := range exportDeclaration.ExportClause.AsNamedExports().Elements.Nodes {
						if nameNode := specifier.Name(); nameNode != nil {
							names[nameNode.Text()] = true
						}
					}
				}
				continue
			}
			target := relativeTarget(exportDeclaration.ModuleSpecifier)
			if exportDeclaration.ExportClause == nil {
				// Star re-export: only a relative target can be enumerated (a
				// bare one is another package's whole surface).
				if target != "" {
					collectModuleExports(prog, target, names, visited)
				}
				continue
			}
			// Named re-exports count regardless of the specifier: the names
			// are spelled right here (the dialect packages re-export their
			// modifier markers from @mionjs/drizzle-orm this way).
			for _, specifier := range exportDeclaration.ExportClause.AsNamedExports().Elements.Nodes {
				if nameNode := specifier.Name(); nameNode != nil {
					names[nameNode.Text()] = true
				}
			}
		}
	}
}

// ── printers ─────────────────────────────────────────────────────────────────

// printDrizzleType renders the canonical type-form pair from a spec.
func printDrizzleType(spec *drizzleTableSpec, decl *declaration, typeName, constName string, exports map[string]bool, names *nameTable) (*printedDecl, *Diagnostic) {
	tableTypeName := upperFirst(spec.tableFn)
	if !exports[tableTypeName] {
		return nil, drizzleRefuse(decl, "the dialect module exports no table type %q", tableTypeName)
	}
	var columns []string
	for _, column := range spec.columns {
		columnTypeName := upperFirst(column.fn)
		if !exports[columnTypeName] {
			return nil, drizzleRefuse(decl, "builder %q has no column type %q in the dialect module", column.fn, columnTypeName)
		}
		var typeArgs []string
		if column.name != "" {
			typeArgs = append(typeArgs, column.name)
		}
		if column.config != "" {
			typeArgs = append(typeArgs, column.config)
		}
		text := spec.alias + "." + columnTypeName
		if len(typeArgs) > 0 {
			text += "<" + strings.Join(typeArgs, ", ") + ">"
		}
		for _, mod := range column.mods {
			markerName := upperFirst(mod.method)
			if !exports[markerName] {
				return nil, drizzleRefuse(decl, "modifier %q has no marker type %q in the dialect module", mod.method, markerName)
			}
			text += " & " + spec.alias + "." + markerName
			if len(mod.args) > 0 {
				text += "<" + strings.Join(mod.args, ", ") + ">"
			}
		}
		columns = append(columns, "  "+column.key+": "+text+";")
	}
	if !exports["tableFromType"] {
		return nil, drizzleRefuse(decl, "the dialect module exports no tableFromType")
	}
	exportPrefix := ""
	if decl.AliasExported || (decl.Name == "" && decl.Exported) {
		exportPrefix = "export "
	}
	constPrefix := ""
	if decl.Exported {
		constPrefix = "export "
	}
	printed := &printedDecl{}
	printed.needs.useGetRunType = true
	printed.needs.keepLocal(spec.alias)
	printed.text = fmt.Sprintf("%stype %s = %s.%s<%s, {\n%s\n}>;\n%sconst %s = %s.tableFromType<%s>(%s<%s>());",
		exportPrefix, typeName, spec.alias, tableTypeName, quoteSingle(spec.tableName), strings.Join(columns, "\n"),
		constPrefix, constName, spec.alias, typeName, names.GetRunType, typeName)
	return printed, nil
}

// printDrizzleBuilders renders the canonical builders-form pair from a spec.
func printDrizzleBuilders(spec *drizzleTableSpec, decl *declaration, typeName, constName string, exports map[string]bool) (*printedDecl, *Diagnostic) {
	if !exports[spec.tableFn] {
		return nil, drizzleRefuse(decl, "the dialect module exports no table builder %q", spec.tableFn)
	}
	var columns []string
	for _, column := range spec.columns {
		if !exports[column.fn] {
			return nil, drizzleRefuse(decl, "the dialect module exports no column builder %q", column.fn)
		}
		var args []string
		if column.name != "" {
			args = append(args, column.name)
		}
		if column.config != "" {
			args = append(args, column.config)
		}
		text := spec.alias + "." + column.fn + "(" + strings.Join(args, ", ") + ")"
		for _, mod := range column.mods {
			text += "." + mod.method + "(" + strings.Join(mod.args, ", ") + ")"
		}
		columns = append(columns, "  "+column.key+": "+text+",")
	}
	exportPrefix := ""
	if decl.Exported {
		exportPrefix = "export "
	}
	aliasPrefix := ""
	if decl.AliasExported {
		aliasPrefix = "export "
	}
	printed := &printedDecl{}
	printed.needs.keepLocal(spec.alias)
	printed.text = fmt.Sprintf("%sconst %s = %s.%s(%s, {\n%s\n});\n%stype %s = typeof %s;",
		exportPrefix, constName, spec.alias, spec.tableFn, quoteSingle(spec.tableName), strings.Join(columns, "\n"),
		aliasPrefix, typeName, constName)
	return printed, nil
}

// ── the conversion entry (called from ConvertFile) ───────────────────────────

// drizzlePlan is one drizzle declaration's replacement (the main statement
// span gets the pair text; the paired half's span is deleted).
type drizzlePlan struct {
	decl    *declaration
	printed *printedDecl
}

// convertDrizzleDecl converts one recognized drizzle declaration to the
// target form's canonical pair.
func convertDrizzleDecl(prog *program.Program, typeChecker *checker.Checker, cache *runtype.Cache, source string, decl *declaration, opts Options, names *nameTable) (*printedDecl, *Diagnostic) {
	if decl.Form == TargetBuilders {
		// builders → type: the spec lives in the call AST.
		spec, nsIdent, diag := specFromBuildersAST(source, decl, typeChecker)
		if diag != nil {
			return nil, diag
		}
		exports, _ := drizzleExports(prog, typeChecker, nsIdent)
		if exports == nil {
			return nil, drizzleRefuse(decl, "cannot resolve the dialect module behind %q", spec.alias)
		}
		typeName := decl.Name
		if typeName == "" {
			typeName = names.deriveTypeName(decl.ConstName)
			if typeName == "" {
				return nil, drizzleRefuse(decl, "no free type name for the pair")
			}
		}
		return printDrizzleType(spec, decl, typeName, decl.ConstName, exports, names)
	}
	// type → builders: the spec lives in the reflected graph; the alias and
	// table type come from the alias declaration's type reference.
	aliasDecl := decl.Stmt.AsTypeAliasDeclaration()
	if aliasDecl == nil || aliasDecl.Type == nil || aliasDecl.Type.Kind != ast.KindTypeReference {
		return nil, drizzleRefuse(decl, "only a direct dialect table type reference converts")
	}
	typeRef := aliasDecl.Type.AsTypeReferenceNode()
	var nsIdent *ast.Node
	var tableTypeName string
	if typeRef.TypeName != nil && typeRef.TypeName.Kind == ast.KindQualifiedName {
		qualified := typeRef.TypeName.AsQualifiedName()
		if qualified.Left != nil && ast.IsIdentifier(qualified.Left) {
			nsIdent = qualified.Left
			tableTypeName = qualified.Right.Text()
		}
	}
	if nsIdent == nil {
		return nil, drizzleRefuse(decl, "only namespace-qualified table types convert (import * as DB from the dialect package)")
	}
	exports, _ := drizzleExports(prog, typeChecker, nsIdent)
	if exports == nil {
		return nil, drizzleRefuse(decl, "cannot resolve the dialect module behind %q", nsIdent.Text())
	}
	tableFn := lowerFirst(tableTypeName)
	resolved, resolveErr := resolveDecl(typeChecker, cache, decl)
	if resolveErr != nil {
		return nil, drizzleRefuse(decl, "cannot resolve the table type: %v", resolveErr)
	}
	spec, diag := specFromGraph(resolved, decl, nsIdent.Text(), tableFn)
	if diag != nil {
		return nil, diag
	}
	constName := decl.ConstName
	if constName == "" {
		constName = names.deriveConstName(decl.Name)
		if constName == "" {
			return nil, drizzleRefuse(decl, "no free const name for the pair")
		}
	}
	return printDrizzleBuilders(spec, decl, decl.Name, constName, exports)
}
