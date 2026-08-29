// drizzle.go — the drizzle-table conversion arm: recognizes table
// declarations of BOTH authoring roads by the mion drizzle sentinels on their
// resolved types (never by function name) and rewrites them between the
// canonical pair spellings:
//
//	builders form                              type form
//	const users = DB.pgTable('users', {…});    type UsersTable = DB.PgTable<'users', {…}>;
//	type UsersTable = typeof users;            const users = DB.tableFromType<UsersTable>(options?);
//
// The emitted const uses the MARKER form (no getRunType call — the devtools
// transform resolves the type argument); the explicit
// `tableFromType(getRunType<T>(), options?)` escape hatch is still recognized
// (pairing ignores the value arguments) and stays as written while already in
// the target form. References ride the options object
// (`{tables: {parents: parents}}` — evaluated eagerly, so a backward
// reference refuses with a reorder message).
// Both directions preserve the VALUE (the const) and the TYPE name, so every
// use keeps working; the two halves always print together (canonical pair).
// The vocabulary is never a Go name table: builder fn names ride the type
// road's rtColSpec sentinel literals, type names are the first-letter
// uppercase rule verified against the dialect module's REAL exports, and the
// modifier vocabulary is whatever the builder's own return type / the mods
// sentinel carries. Tables using constructs with no type spelling
// (interpolated sql, $type, non-literal args, out-of-file or backward
// references) report CNV009 and stay untouched.
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
	"github.com/mionkit/ts-runtypes/internal/tsimports"
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
func tableFromTypeTarget(typeChecker *checker.Checker, initializer *ast.Node) (string, bool) {
	if initializer == nil || initializer.Kind != ast.KindCallExpression {
		return "", false
	}
	call := initializer.AsCallExpression()
	callee := call.Expression
	if callee == nil {
		return "", false
	}
	// Either spelling of the bridge: `DB.tableFromType<N>(…)` or the named
	// binding `tableFromType<N>(…)`, under whatever local it was imported as.
	calleeName := callee
	if ast.IsPropertyAccessExpression(callee) {
		calleeName = callee.AsPropertyAccessExpression().Name()
	}
	if calleeName == nil || !ast.IsIdentifier(calleeName) {
		return "", false
	}
	// The EXPORTED name, so a renamed named import still pairs.
	if importedNameOf(typeChecker, calleeName) != "tableFromType" {
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
func pairDrizzleDecls(typeChecker *checker.Checker, decls []*declaration, typeofAliases map[string]*ast.Node, typeofDecls map[string]*declaration) []*declaration {
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
		typeName, ok := tableFromTypeTarget(typeChecker, constInitializer(decl.Stmt))
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
// arg texts (empty for a flag). A references mod carries its target
// structurally instead (the two printers spell it differently). A runtime
// mod ($default/$defaultFn/$onUpdate/$onUpdateFn) carries its callback text
// VERBATIM in args[0]: the type form spells the flag marker and moves the
// callback into the const's options.runtime; the builders form puts it back
// on the chain.
type drizzleMod struct {
	method      string
	args        []string
	refTable    string
	refColumn   string
	refActions  string
	isReference bool
	isRuntime   bool
}

// drizzleMarkerName maps a modifier method onto its marker type name:
// upperFirst, skipping the $ of the runtime methods ($defaultFn → $DefaultFn,
// same rule $Type follows).
func drizzleMarkerName(method string) string {
	if strings.HasPrefix(method, "$") {
		return "$" + upperFirst(method[1:])
	}
	return upperFirst(method)
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

// drizzleEntryChain is one chained call on a table entry (.on(...), ...).
type drizzleEntryChain struct {
	method    string
	argsType  []string // type-mode arg texts ({col: 'a'}, Sql<'...'>)
	argsValue []string // builders-mode arg texts (t.a, sql`...`)
}

// drizzleEntry is one table-level extraConfig entry, both renderings
// precomputed so each printer just joins.
type drizzleEntry struct {
	fn    string
	chain []drizzleEntryChain // chain[0] is the BASE call's args (method "")
}

// drizzleTableSpec is the shared intermediate BOTH printers consume; built
// from the call AST (builders source) or the reflected graph (type source).
type drizzleTableSpec struct {
	spelling  *drizzleSpelling // how this file names the dialect package
	tableFn   string           // e.g. "pgTable" (canonical lowerFirst spelling)
	tableName string
	columns   []drizzleColumn
	entries   []drizzleEntry
	// DB table names this table references (columns + entries, first-seen
	// order): what the type form's `{tables: {...}}` option must carry.
	refTables []string
}

// addRefTable records a referenced DB table name once, in first-seen order.
func (spec *drizzleTableSpec) addRefTable(tableName string) {
	for _, existing := range spec.refTables {
		if existing == tableName {
			return
		}
	}
	spec.refTables = append(spec.refTables, tableName)
}

func drizzleRefuse(decl *declaration, format string, args ...any) *Diagnostic {
	return &Diagnostic{Code: CodeDrizzleUnsupported, Severity: SeverityError, Decl: declLabel(decl),
		Message: fmt.Sprintf("drizzle table %q: ", declLabel(decl)) + fmt.Sprintf(format, args...)}
}

// ── how a file spells the dialect package ────────────────────────────────────

// drizzleSpelling is the ONE place that knows how a file names the dialect
// package's exports, so recognition and printing can never disagree about it. A
// file written `import * as DB from '…/pg-core'` spells `DB.pgTable`; one
// written `import {pgTable} from '…/pg-core'` spells `pgTable`, under whatever
// local it bound. A converted file keeps the style it was written in.
//
// Names the printed output needs but the file does not import yet are claimed
// here, collision free, and reported as import needs — drizzle's own `index`
// and ours cannot share one binding.
type drizzleSpelling struct {
	namespace string // the namespace local, "" when the file uses named imports
	module    string // the dialect module specifier
	scan      *importScan
	names     *nameTable
	locals    map[string]string // exported name → the local this file spells it as
	needs     []foreignNeed
}

func (spelling *drizzleSpelling) qualified() bool { return spelling.namespace != "" }

// spellType is the text for an export used as a TYPE (PgTable, Varchar, NotNull).
func (spelling *drizzleSpelling) spellType(exported string) string {
	return spelling.spell(exported, true)
}

// spellValue is the text for an export that is CALLED (pgTable, varchar,
// tableFromType), so a claimed import can never come in as `import type`.
func (spelling *drizzleSpelling) spellValue(exported string) string {
	return spelling.spell(exported, false)
}

func (spelling *drizzleSpelling) spell(exported string, typeOnly bool) string {
	if spelling.qualified() {
		return spelling.namespace + "." + exported
	}
	if local, ok := spelling.locals[exported]; ok {
		return local
	}
	local := spelling.scan.LocalFor(spelling.module, exported)
	if local == "" {
		local = spelling.names.claim(exported)
		if local == "" {
			local = exported
		}
		spelling.needs = append(spelling.needs, foreignNeed{moduleSpec: spelling.module, typeName: exported, local: local, typeOnly: typeOnly})
	}
	spelling.locals[exported] = local
	return local
}

// attach hands the printed declaration's import needs to the planner: keep
// every binding the output spelled, and add the ones this conversion
// introduced.
func (spelling *drizzleSpelling) attach(needs *importNeeds) {
	if spelling.qualified() {
		needs.keepLocal(spelling.namespace)
		return
	}
	for _, local := range spelling.locals {
		needs.keepLocal(local)
	}
	for _, need := range spelling.needs {
		needs.addForeign(need)
	}
}

// drizzleSpellings is the per-file registry: one spelling per dialect module,
// so every declaration in a file agrees about how that package is named.
type drizzleSpellings struct {
	scan     *importScan
	names    *nameTable
	byModule map[string]*drizzleSpelling
}

func newDrizzleSpellings(scan *importScan, names *nameTable) *drizzleSpellings {
	return &drizzleSpellings{scan: scan, names: names, byModule: map[string]*drizzleSpelling{}}
}

// forModule answers how this file spells one dialect module. The style is read
// off the file's own imports, never off the declaration being converted, so two
// tables in one file can never be printed in two different styles.
func (spellings *drizzleSpellings) forModule(module string) *drizzleSpelling {
	if existing, ok := spellings.byModule[module]; ok {
		return existing
	}
	spelling := &drizzleSpelling{module: module, scan: spellings.scan, names: spellings.names, locals: map[string]string{}}
	if spellings.scan != nil {
		spelling.namespace = spellings.scan.NamespaceAlias(module)
	}
	spellings.byModule[module] = spelling
	return spelling
}

// removableLocals are the dialect-package bindings the file bound BEFORE the
// conversion. Whichever the printed output no longer spells may go, exactly the
// way a builders-form import goes when a file switches to the type form; the
// planner still keeps any binding used outside the rewritten spans.
func (spellings *drizzleSpellings) removableLocals() map[string]bool {
	locals := map[string]bool{}
	if spellings == nil || spellings.scan == nil {
		return locals
	}
	for module := range spellings.byModule {
		entry := spellings.scan.ByModule[module]
		if entry == nil {
			continue
		}
		for _, binding := range append(append([]namedBinding{}, entry.Named...), entry.ExtraNamedBindings()...) {
			locals[binding.Local] = true
		}
	}
	return locals
}

// dialectModuleNode returns a node whose symbol IS the dialect module, which is
// what the export walk resolves from: the namespace identifier of `DB.pgTable`,
// or the module specifier of the import declaration a named binding came from.
func dialectModuleNode(typeChecker *checker.Checker, callee *ast.Node) *ast.Node {
	nameNode := callee
	if callee != nil && ast.IsPropertyAccessExpression(callee) {
		nameNode = callee.AsPropertyAccessExpression().Expression
	}
	if nameNode == nil || !ast.IsIdentifier(nameNode) {
		return nil
	}
	if tsimports.IsNamespaceImport(typeChecker, nameNode) {
		return nameNode
	}
	symbol := typeChecker.GetSymbolAtLocation(nameNode)
	if symbol == nil {
		return nil
	}
	for node := checker.Checker_getDeclarationOfAliasSymbol(typeChecker, symbol); node != nil; node = node.Parent {
		if ast.IsImportDeclaration(node) {
			return node.AsImportDeclaration().ModuleSpecifier
		}
	}
	return nil
}

// dialectTypeReference is the type-position twin of dialectExportCallee:
// `DB.PgTable<…>` or `PgTable<…>` resolved to the EXPORTED type name and the
// module it came from.
func dialectTypeReference(typeChecker *checker.Checker, typeName *ast.Node) (exported string, moduleSpec string, nameNode *ast.Node, ok bool) {
	if typeName == nil {
		return "", "", nil, false
	}
	if typeName.Kind == ast.KindQualifiedName {
		qualified := typeName.AsQualifiedName()
		if qualified.Left == nil || !ast.IsIdentifier(qualified.Left) || !tsimports.IsNamespaceImport(typeChecker, qualified.Left) {
			return "", "", nil, false
		}
		return qualified.Right.Text(), tsimports.ModuleOfImport(typeChecker, qualified.Left), qualified.Left, true
	}
	if !ast.IsIdentifier(typeName) {
		return "", "", nil, false
	}
	module := tsimports.ModuleOfImport(typeChecker, typeName)
	if module == "" {
		return "", "", nil, false
	}
	return tsimports.ImportedNameOf(typeChecker, typeName), module, typeName, true
}

// dialectExportCallee decomposes a callee that names a dialect export in either
// import style — `DB.pgTable` or `pgTable` — into the EXPORTED name and the
// module it came from. The module is always resolved through the checker, never
// assumed from the name, so a shadowing local (`const pgTable =
// pgTableCreator(…)` in a test body) can never pass as the import it hides.
func dialectExportCallee(typeChecker *checker.Checker, callee *ast.Node) (exported string, moduleSpec string, ok bool) {
	if callee == nil {
		return "", "", false
	}
	if ast.IsIdentifier(callee) {
		if tsimports.IsNamespaceImport(typeChecker, callee) {
			return "", "", false
		}
		module := tsimports.ModuleOfImport(typeChecker, callee)
		if module == "" {
			return "", "", false
		}
		return tsimports.ImportedNameOf(typeChecker, callee), module, true
	}
	if !ast.IsPropertyAccessExpression(callee) {
		return "", "", false
	}
	access := callee.AsPropertyAccessExpression()
	if access.Expression == nil || !ast.IsIdentifier(access.Expression) || !tsimports.IsNamespaceImport(typeChecker, access.Expression) {
		return "", "", false
	}
	return access.Name().Text(), tsimports.ModuleOfImport(typeChecker, access.Expression), true
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

// sqlTemplateText recognizes the slim `sql` tagged template with NO
// substitutions (verified by package import, never by name alone) and returns
// its raw text. An interpolated template has no type spelling.
func sqlTemplateText(node *ast.Node, typeChecker *checker.Checker) (string, bool) {
	if node == nil || node.Kind != ast.KindTaggedTemplateExpression {
		return "", false
	}
	tagged := node.AsTaggedTemplateExpression()
	tag := tagged.Tag
	if tag == nil {
		return "", false
	}
	nameNode := tag
	if ast.IsPropertyAccessExpression(tag) {
		nameNode = tag.AsPropertyAccessExpression().Name()
	}
	if nameNode == nil || !ast.IsIdentifier(nameNode) || !referencedThroughPackageImport(typeChecker, nameNode) {
		return "", false
	}
	if importedNameOf(typeChecker, nameNode) != "sql" {
		return "", false
	}
	if tagged.Template == nil || tagged.Template.Kind != ast.KindNoSubstitutionTemplateLiteral {
		return "", false
	}
	return tagged.Template.Text(), true
}

// referencesTarget parses `() => <ident>.<key>` — the lazy reference callback.
func referencesTarget(node *ast.Node) (constName string, columnKey string, ok bool) {
	if node == nil || node.Kind != ast.KindArrowFunction {
		return "", "", false
	}
	arrow := node.AsArrowFunction()
	body := arrow.Body
	if body == nil || !ast.IsPropertyAccessExpression(body) {
		return "", "", false
	}
	access := body.AsPropertyAccessExpression()
	if access.Expression == nil || !ast.IsIdentifier(access.Expression) {
		return "", "", false
	}
	return access.Expression.Text(), access.Name().Text(), true
}

// specFromBuildersAST parses `NS.pgTable('name', {key: NS.fn(...).mod(...)})`.
// tableNames maps the file's drizzle const names onto their DB table names
// (references targets resolve through it).
func specFromBuildersAST(source string, decl *declaration, typeChecker *checker.Checker, tableNames map[string]string, spellings *drizzleSpellings) (*drizzleTableSpec, *ast.Node, *Diagnostic) {
	initializer := constInitializer(decl.Stmt)
	call := initializer.AsCallExpression()
	tableFn, module, ok := dialectExportCallee(typeChecker, call.Expression)
	if !ok {
		return nil, nil, drizzleRefuse(decl, "the table call must name an export of the dialect package, imported directly or through a namespace")
	}
	spelling := spellings.forModule(module)
	moduleNode := dialectModuleNode(typeChecker, call.Expression)
	if call.Arguments == nil || len(call.Arguments.Nodes) < 2 || len(call.Arguments.Nodes) > 3 {
		return nil, nil, drizzleRefuse(decl, "the table call needs a name, a columns object and optionally an extraConfig callback")
	}
	nameArg := call.Arguments.Nodes[0]
	if !ast.IsStringLiteral(nameArg) {
		return nil, nil, drizzleRefuse(decl, "the table name must be a string literal")
	}
	columnsArg := call.Arguments.Nodes[1]
	if columnsArg.Kind != ast.KindObjectLiteralExpression {
		return nil, nil, drizzleRefuse(decl, "the columns argument must be a plain object literal (helper callbacks have no type spelling)")
	}
	spec := &drizzleTableSpec{spelling: spelling, tableFn: tableFn, tableName: nameArg.Text()}
	if len(call.Arguments.Nodes) == 3 {
		entries, entriesDiag := entriesFromExtraConfigAST(source, decl, call.Arguments.Nodes[2], spec, typeChecker, tableNames)
		if entriesDiag != nil {
			return nil, nil, entriesDiag
		}
		spec.entries = entries
	}
	for _, property := range columnsArg.AsObjectLiteralExpression().Properties.Nodes {
		if property.Kind != ast.KindPropertyAssignment {
			return nil, nil, drizzleRefuse(decl, "column entries must be plain `key: builder(...)` assignments")
		}
		assignment := property.AsPropertyAssignment()
		keyNode := assignment.Name()
		if keyNode == nil || !ast.IsIdentifier(keyNode) {
			return nil, nil, drizzleRefuse(decl, "column keys must be plain identifiers")
		}
		column, diag := columnFromChain(source, decl, assignment.Initializer, keyNode.Text(), spec, typeChecker, tableNames)
		if diag != nil {
			return nil, nil, diag
		}
		column.key = keyNode.Text()
		for _, mod := range column.mods {
			if mod.isReference {
				spec.addRefTable(mod.refTable)
			}
		}
		spec.columns = append(spec.columns, *column)
	}
	return spec, moduleNode, nil
}

// columnFromChain parses `NS.fn(name?, config?).mod(args)...` into a column.
func columnFromChain(source string, decl *declaration, expr *ast.Node, columnKey string, spec *drizzleTableSpec, typeChecker *checker.Checker, tableNames map[string]string) (*drizzleColumn, *Diagnostic) {
	// Every refusal names the column: these tables run to seventy columns, and
	// "a column must be a builder call chain" alone leaves the reader to find
	// which one.
	refuse := func(format string, args ...any) *Diagnostic {
		return drizzleRefuse(decl, "column %q: "+format, append([]any{columnKey}, args...)...)
	}
	var mods []drizzleMod
	current := expr
	for {
		if current == nil || current.Kind != ast.KindCallExpression {
			return nil, refuse("a column must be a builder call chain")
		}
		call := current.AsCallExpression()
		callee := call.Expression
		if builderFn, module, isDialect := dialectExportCallee(typeChecker, callee); isDialect && module == spec.spelling.module {
			// The base builder call.
			column := &drizzleColumn{fn: builderFn}
			args := call.Arguments.Nodes
			argIndex := 0
			if argIndex < len(args) && ast.IsStringLiteral(args[argIndex]) {
				column.name = quoteSingle(args[argIndex].Text())
				argIndex++
			} else if argIndex < len(args) && args[argIndex].Kind != ast.KindObjectLiteralExpression {
				// The db name is a type parameter on the type road, so only a
				// literal carries over: `serial('id' as string)` widens it to
				// `string` and has no spelling. Say that, rather than falling
				// through and complaining about the config argument.
				return nil, refuse("builder %q: the db name must be a string literal", column.fn)
			}
			if argIndex < len(args) {
				if args[argIndex].Kind != ast.KindObjectLiteralExpression {
					return nil, refuse("builder %q: config must be an object literal", column.fn)
				}
				configText, ok := literalExprText(source, args[argIndex])
				if !ok {
					return nil, refuse("builder %q: config carries a non-literal value", column.fn)
				}
				if configText != "{}" {
					column.config = configText
				}
				argIndex++
			}
			if argIndex < len(args) {
				return nil, refuse("builder %q: unexpected extra argument", column.fn)
			}
			// mods were collected outermost-first; replay order is innermost-first.
			for left, right := 0, len(mods)-1; left < right; left, right = left+1, right-1 {
				mods[left], mods[right] = mods[right], mods[left]
			}
			column.mods = mods
			return column, nil
		}
		if callee == nil || !ast.IsPropertyAccessExpression(callee) {
			return nil, refuse("a column must be a builder call chain rooted in the dialect package (a locally declared handle, like an enum, has no type spelling)")
		}
		access := callee.AsPropertyAccessExpression()
		// A modifier call: record and step into the receiver.
		method := access.Name().Text()
		if method == "$type" {
			return nil, refuse("modifier $type has no chain spelling on the type road — author the table as a type and use the $Type marker")
		}
		if strings.HasPrefix(method, "$") {
			// Runtime-callback modifier: the callback moves VERBATIM into the
			// emitted const's options.runtime; the type carries the flag marker
			// (its existence is verified against the dialect exports at print).
			callbackArgs := call.Arguments.Nodes
			if len(callbackArgs) != 1 {
				return nil, refuse("modifier %q takes exactly one callback argument", method)
			}
			callbackNode := callbackArgs[0]
			text := strings.TrimSpace(source[skipTrivia(source, callbackNode.Pos()):callbackNode.End()])
			mods = append(mods, drizzleMod{method: method, isRuntime: true, args: []string{text}})
			current = access.Expression
			continue
		}
		if method == "references" {
			refArgs := call.Arguments.Nodes
			if len(refArgs) < 1 || len(refArgs) > 2 {
				return nil, refuse("references: expected a callback and optional actions")
			}
			constName, columnKey, ok := referencesTarget(refArgs[0])
			if !ok {
				return nil, refuse("references: only `() => otherTable.column` targets have a type spelling")
			}
			refTableName, known := tableNames[constName]
			if !known {
				return nil, refuse("references: %q is not a drizzle table declared in this file", constName)
			}
			mod := drizzleMod{method: method, isReference: true, refTable: refTableName, refColumn: columnKey}
			if len(refArgs) == 2 {
				actionsText, ok := literalExprText(source, refArgs[1])
				if !ok {
					return nil, refuse("references: the actions argument must be a literal object")
				}
				mod.refActions = actionsText
			}
			mods = append(mods, mod)
			current = access.Expression
			continue
		}
		var args []string
		for _, argument := range call.Arguments.Nodes {
			if sqlText, ok := sqlTemplateText(argument, typeChecker); ok {
				args = append(args, spec.spelling.spellType("Sql")+"<"+quoteSingle(sqlText)+">")
				continue
			}
			argText, ok := literalExprText(source, argument)
			if !ok {
				return nil, refuse("modifier %q: argument is not a literal (interpolated sql, functions and column references have no type spelling)", method)
			}
			args = append(args, argText)
		}
		mods = append(mods, drizzleMod{method: method, args: args})
		current = access.Expression
	}
}

// ── extraConfig entries (builders AST → spec) ────────────────────────────────

// entryArgTexts renders one extraConfig argument in BOTH modes: the canonical
// TYPE spelling ({col: 'a'}, {table: 'p', col: 'id'}, Sql<'...'>, literals)
// and the canonical BUILDERS spelling (t.a, parents.id, sql`...`). A
// cross-table reference also lands in spec.refTables (the type form's tables
// option needs it).
func entryArgTexts(source string, decl *declaration, node *ast.Node, spec *drizzleTableSpec, paramName string, typeChecker *checker.Checker, fileInfo *drizzleFileInfo) (string, string, *Diagnostic) {
	if sqlText, ok := sqlTemplateText(node, typeChecker); ok {
		valueText := ""
		if fileInfo.sqlSpelling != "" {
			valueText = fileInfo.sqlSpelling + "`" + sqlText + "`"
		}
		return spec.spelling.spellType("Sql") + "<" + quoteSingle(sqlText) + ">", valueText, nil
	}
	if ast.IsPropertyAccessExpression(node) {
		access := node.AsPropertyAccessExpression()
		if access.Expression != nil && ast.IsIdentifier(access.Expression) {
			base := access.Expression.Text()
			key := access.Name().Text()
			if base == paramName {
				return "{col: " + quoteSingle(key) + "}", "t." + key, nil
			}
			if tableName, ok := fileInfo.tableNameByConst[base]; ok {
				spec.addRefTable(tableName)
				return "{table: " + quoteSingle(tableName) + ", col: " + quoteSingle(key) + "}", base + "." + key, nil
			}
		}
		return "", "", drizzleRefuse(decl, "extraConfig: only columns of this table (t.x) or of a drizzle table declared in this file convert")
	}
	if node.Kind == ast.KindArrayLiteralExpression {
		var typeItems, valueItems []string
		for _, element := range node.AsArrayLiteralExpression().Elements.Nodes {
			typeText, valueText, diag := entryArgTexts(source, decl, element, spec, paramName, typeChecker, fileInfo)
			if diag != nil {
				return "", "", diag
			}
			typeItems = append(typeItems, typeText)
			valueItems = append(valueItems, valueText)
		}
		return "[" + strings.Join(typeItems, ", ") + "]", "[" + strings.Join(valueItems, ", ") + "]", nil
	}
	if node.Kind == ast.KindObjectLiteralExpression {
		var typeMembers, valueMembers []string
		for _, property := range node.AsObjectLiteralExpression().Properties.Nodes {
			if property.Kind != ast.KindPropertyAssignment {
				return "", "", drizzleRefuse(decl, "extraConfig: config objects must use plain `key: value` members")
			}
			assignment := property.AsPropertyAssignment()
			nameNode := assignment.Name()
			if nameNode == nil {
				return "", "", drizzleRefuse(decl, "extraConfig: unnamed config member")
			}
			typeText, valueText, diag := entryArgTexts(source, decl, assignment.Initializer, spec, paramName, typeChecker, fileInfo)
			if diag != nil {
				return "", "", diag
			}
			typeMembers = append(typeMembers, propertyKeyText(nameNode)+": "+typeText)
			valueMembers = append(valueMembers, propertyKeyText(nameNode)+": "+valueText)
		}
		return "{" + strings.Join(typeMembers, ", ") + "}", "{" + strings.Join(valueMembers, ", ") + "}", nil
	}
	literal, ok := literalExprText(source, node)
	if !ok {
		return "", "", drizzleRefuse(decl, "extraConfig: argument is not a literal, a column reference or literal sql")
	}
	return literal, literal, nil
}

// entriesFromExtraConfigAST parses the table call's third argument — an arrow
// callback returning an array literal of helper chains.
func entriesFromExtraConfigAST(source string, decl *declaration, node *ast.Node, spec *drizzleTableSpec, typeChecker *checker.Checker, tableNames map[string]string) ([]drizzleEntry, *Diagnostic) {
	fileInfo := &drizzleFileInfo{tableNameByConst: tableNames}
	if node == nil || node.Kind != ast.KindArrowFunction {
		return nil, drizzleRefuse(decl, "extraConfig must be an arrow callback returning an array of entries")
	}
	arrow := node.AsArrowFunction()
	paramName := ""
	if arrow.Parameters != nil && len(arrow.Parameters.Nodes) == 1 {
		if parameterName := arrow.Parameters.Nodes[0].Name(); parameterName != nil && ast.IsIdentifier(parameterName) {
			paramName = parameterName.Text()
		}
	}
	body := arrow.Body
	if body == nil || body.Kind != ast.KindArrayLiteralExpression {
		return nil, drizzleRefuse(decl, "extraConfig must return an array literal of entries")
	}
	// The caller fills the sql spelling later; here reuse the shared lookup.
	fileInfo.sqlSpelling = ""
	var entries []drizzleEntry
	for _, element := range body.AsArrayLiteralExpression().Elements.Nodes {
		entry, diag := entryFromChainAST(source, decl, element, spec, paramName, typeChecker, fileInfo)
		if diag != nil {
			return nil, diag
		}
		entries = append(entries, *entry)
	}
	return entries, nil
}

// entryFromChainAST parses `NS.helper(args).m1(args)...` (outermost-last).
func entryFromChainAST(source string, decl *declaration, expr *ast.Node, spec *drizzleTableSpec, paramName string, typeChecker *checker.Checker, fileInfo *drizzleFileInfo) (*drizzleEntry, *Diagnostic) {
	var chain []drizzleEntryChain
	current := expr
	for {
		if current == nil || current.Kind != ast.KindCallExpression {
			return nil, drizzleRefuse(decl, "extraConfig entries must be helper call chains")
		}
		call := current.AsCallExpression()
		callee := call.Expression
		helperFn, module, isDialect := dialectExportCallee(typeChecker, callee)
		isBase := isDialect && module == spec.spelling.module
		if !isBase && !ast.IsPropertyAccessExpression(callee) {
			return nil, drizzleRefuse(decl, "extraConfig entries must be helper chains rooted in the dialect package")
		}
		var argsType, argsValue []string
		var argsDiag *Diagnostic
		for _, argument := range call.Arguments.Nodes {
			typeText, valueText, diag := entryArgTexts(source, decl, argument, spec, paramName, typeChecker, fileInfo)
			if diag != nil {
				argsDiag = diag
				break
			}
			argsType = append(argsType, typeText)
			argsValue = append(argsValue, valueText)
		}
		if argsDiag != nil {
			return nil, argsDiag
		}
		if isBase {
			// The base helper call: reverse the collected chain into call order.
			for left, right := 0, len(chain)-1; left < right; left, right = left+1, right-1 {
				chain[left], chain[right] = chain[right], chain[left]
			}
			entry := &drizzleEntry{fn: helperFn}
			entry.chain = append([]drizzleEntryChain{{method: "", argsType: argsType, argsValue: argsValue}}, chain...)
			return entry, nil
		}
		access := callee.AsPropertyAccessExpression()
		chain = append(chain, drizzleEntryChain{method: access.Name().Text(), argsType: argsType, argsValue: argsValue})
		current = access.Expression
	}
}

// ── reflected graph → spec (type form) ───────────────────────────────────────

// specFromGraph reads the table spec off the resolved reflection graph — the
// same walk the runtime bridge does in JS (fromType.ts), mirrored in Go.
// fileInfo supplies the slim `sql` binding and the const-by-table-name map
// (entry column references print as `<const>.<key>`).
func specFromGraph(resolved *resolvedDecl, decl *declaration, spelling *drizzleSpelling, tableFn string, fileInfo *drizzleFileInfo) (*drizzleTableSpec, *Diagnostic) {
	sqlSpelling := fileInfo.sqlSpelling
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
		// The Sql<'text'> carrier prints as the slim sql template.
		if sqlNode := member(node, "@rtSqlTextKey"); sqlNode != nil {
			textNode := member(sqlNode, "sql")
			if textNode == nil || textNode.Kind != reflection.KindLiteral {
				return "", drizzleRefuse(decl, "%s: the Sql carrier has no literal text", where)
			}
			text, _ := textNode.Literal.(string)
			if sqlSpelling == "" {
				return "", drizzleRefuse(decl, "%s: converting an Sql value needs a `sql` import from @mionjs/drizzle-orm in this file", where)
			}
			return sqlSpelling + "`" + text + "`", nil
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
	spec := &drizzleTableSpec{spelling: spelling, tableFn: tableFn, tableName: tableName}
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
				if modMember.Name == "references" {
					if valueNode.Kind != reflection.KindTuple || len(valueNode.Children) == 0 {
						return nil, drizzleRefuse(decl, "column %q: malformed references modifier", columnMember.Name)
					}
					refNode := deref(valueNode.Children[0])
					if refNode != nil {
						refNode = deref(refNode.Child)
					}
					refTableNode := member(refNode, "table")
					refColumnNode := member(refNode, "column")
					if refTableNode == nil || refTableNode.Kind != reflection.KindLiteral || refColumnNode == nil || refColumnNode.Kind != reflection.KindLiteral {
						return nil, drizzleRefuse(decl, "column %q: references target is not literal", columnMember.Name)
					}
					mod := drizzleMod{method: "references", isReference: true}
					mod.refTable, _ = refTableNode.Literal.(string)
					mod.refColumn, _ = refColumnNode.Literal.(string)
					if len(valueNode.Children) > 1 {
						actionsMember := deref(valueNode.Children[1])
						actionsText, diag := literalText(actionsMember.Child, columnMember.Name+".references.actions")
						if diag != nil {
							return nil, diag
						}
						mod.refActions = actionsText
					}
					column.mods = append(column.mods, mod)
					continue
				}
				if modMember.Name == "$type" {
					return nil, drizzleRefuse(decl, "column %q: the $Type override has no builders spelling — keep this table on the type road", columnMember.Name)
				}
				if strings.HasPrefix(modMember.Name, "$") {
					// Runtime marker flag: the callback text is read off the
					// paired const's options.runtime afterwards.
					if valueNode.Kind != reflection.KindLiteral {
						return nil, drizzleRefuse(decl, "column %q: malformed runtime marker %q", columnMember.Name, modMember.Name)
					}
					column.mods = append(column.mods, drizzleMod{method: modMember.Name, isRuntime: true})
					continue
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
	// Table-level extras: the TableEntry tuple on the meta, rendered in
	// builders mode ({col} → t.<key>, {table, col} → <const>.<key>).
	var entryValueText func(node *reflection.RunType, where string) (string, *Diagnostic)
	entryValueText = func(node *reflection.RunType, where string) (string, *Diagnostic) {
		node = deref(node)
		if node == nil {
			return "", drizzleRefuse(decl, "%s: missing entry value", where)
		}
		if node.Kind == reflection.KindObjectLiteral {
			// Sql carriers delegate to literalText (the sql`...` spelling).
			if member(node, "@rtSqlTextKey") != nil {
				return literalText(node, where)
			}
			memberNames := map[string]*reflection.RunType{}
			for _, property := range properties(node) {
				memberNames[property.Name] = deref(property.Child)
			}
			colNode, hasCol := memberNames["col"]
			tableNode, hasTable := memberNames["table"]
			if hasCol && len(memberNames) == 1 && colNode != nil && colNode.Kind == reflection.KindLiteral {
				key, _ := colNode.Literal.(string)
				return "t." + key, nil
			}
			if hasCol && hasTable && len(memberNames) == 2 && colNode != nil && tableNode != nil &&
				colNode.Kind == reflection.KindLiteral && tableNode.Kind == reflection.KindLiteral {
				key, _ := colNode.Literal.(string)
				refTableName, _ := tableNode.Literal.(string)
				targetConst := fileInfo.constByTableName[refTableName]
				if targetConst == "" {
					return "", drizzleRefuse(decl, "%s: references table %q is not declared in this file", where, refTableName)
				}
				return targetConst + "." + key, nil
			}
			var members []string
			for _, property := range properties(node) {
				value, diag := entryValueText(property.Child, where+"."+property.Name)
				if diag != nil {
					return "", diag
				}
				members = append(members, property.Name+": "+value)
			}
			return "{" + strings.Join(members, ", ") + "}", nil
		}
		if node.Kind == reflection.KindTuple {
			var items []string
			for i, rawMember := range node.Children {
				tupleMember := deref(rawMember)
				if tupleMember == nil {
					return "", drizzleRefuse(decl, "%s[%d]: missing tuple member", where, i)
				}
				item, diag := entryValueText(tupleMember.Child, fmt.Sprintf("%s[%d]", where, i))
				if diag != nil {
					return "", diag
				}
				items = append(items, item)
			}
			return "[" + strings.Join(items, ", ") + "]", nil
		}
		return literalText(node, where)
	}
	if extrasNode := member(meta, "extras"); extrasNode != nil && extrasNode.Kind == reflection.KindTuple {
		for index, rawEntry := range extrasNode.Children {
			entryMember := deref(rawEntry)
			if entryMember == nil {
				continue
			}
			entryNode := deref(entryMember.Child)
			if entryNode == nil {
				entryNode = entryMember
			}
			entrySpec := member(entryNode, "@rtEntrySpecKey")
			if entrySpec == nil {
				return nil, drizzleRefuse(decl, "extras[%d] carries no entry spec (use the TableEntry types)", index)
			}
			fnNode := member(entrySpec, "fn")
			if fnNode == nil || fnNode.Kind != reflection.KindLiteral {
				return nil, drizzleRefuse(decl, "extras[%d] has no fn literal", index)
			}
			entry := drizzleEntry{}
			entry.fn, _ = fnNode.Literal.(string)
			base := drizzleEntryChain{method: ""}
			if argsNode := member(entrySpec, "args"); argsNode != nil && argsNode.Kind == reflection.KindTuple {
				for i, rawArg := range argsNode.Children {
					argMember := deref(rawArg)
					if argMember == nil {
						return nil, drizzleRefuse(decl, "extras[%d].args[%d] is missing", index, i)
					}
					valueText, diag := entryValueText(argMember.Child, fmt.Sprintf("extras[%d].args[%d]", index, i))
					if diag != nil {
						return nil, diag
					}
					base.argsValue = append(base.argsValue, valueText)
				}
			}
			entry.chain = append(entry.chain, base)
			if chainNode := member(entrySpec, "chain"); chainNode != nil {
				for _, chainMember := range properties(chainNode) {
					valueNode := deref(chainMember.Child)
					if valueNode == nil {
						return nil, drizzleRefuse(decl, "extras[%d]: malformed chain %q", index, chainMember.Name)
					}
					link := drizzleEntryChain{method: chainMember.Name}
					if valueNode.Kind == reflection.KindTuple {
						for i, rawArg := range valueNode.Children {
							argMember := deref(rawArg)
							if argMember == nil {
								return nil, drizzleRefuse(decl, "extras[%d].%s[%d] is missing", index, chainMember.Name, i)
							}
							valueText, diag := entryValueText(argMember.Child, fmt.Sprintf("extras[%d].%s[%d]", index, chainMember.Name, i))
							if diag != nil {
								return nil, diag
							}
							link.argsValue = append(link.argsValue, valueText)
						}
					} else if valueNode.Kind != reflection.KindLiteral {
						return nil, drizzleRefuse(decl, "extras[%d].%s is neither a flag nor an args tuple", index, chainMember.Name)
					}
					entry.chain = append(entry.chain, link)
				}
			}
			spec.entries = append(spec.entries, entry)
		}
	}
	return spec, nil
}

// ── vocabulary: the dialect module's real exports ────────────────────────────

// drizzleExports enumerates the dialect module's exported names by walking its
// source statements (following relative re-exports), starting from the
// module node's symbol — a namespace identifier, or the module specifier of the
// import declaration a named binding came from. Same walk the manifest
// generator uses; syntactic so type-only exports count too.
func drizzleExports(prog *program.Program, typeChecker *checker.Checker, moduleNode *ast.Node) (map[string]bool, string) {
	if moduleNode == nil {
		return nil, ""
	}
	symbol := typeChecker.GetSymbolAtLocation(moduleNode)
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
func printDrizzleType(spec *drizzleTableSpec, decl *declaration, typeName, constName string, exports map[string]bool, fileInfo *drizzleFileInfo) (*printedDecl, *Diagnostic) {
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
		text := spec.spelling.spellType(columnTypeName)
		if len(typeArgs) > 0 {
			text += "<" + strings.Join(typeArgs, ", ") + ">"
		}
		for _, mod := range column.mods {
			markerName := drizzleMarkerName(mod.method)
			if !exports[markerName] {
				return nil, drizzleRefuse(decl, "modifier %q has no marker type %q in the dialect module", mod.method, markerName)
			}
			if mod.isReference {
				text += " & " + spec.spelling.spellType("References") + "<" + quoteSingle(mod.refTable) + ", " + quoteSingle(mod.refColumn)
				if mod.refActions != "" {
					text += ", " + mod.refActions
				}
				text += ">"
				continue
			}
			// A runtime mod spells the bare flag marker; its callback text goes
			// into the options.runtime object below, never into the type.
			text += " & " + spec.spelling.spellType(markerName)
			if !mod.isRuntime && len(mod.args) > 0 {
				text += "<" + strings.Join(mod.args, ", ") + ">"
			}
		}
		columns = append(columns, "  "+column.key+": "+text+";")
	}
	if !exports["tableFromType"] {
		return nil, drizzleRefuse(decl, "the dialect module exports no tableFromType")
	}
	// The options object, canonical layout: `tables` first (References — it is
	// evaluated EAGERLY at the const, so the referenced table must be declared
	// earlier in the file; the builders road's `() => parent.id` closure was
	// lazy and allowed any order), then `runtime` (the $ modifiers' callbacks,
	// spec column order, chain method order).
	var optionParts []string
	if len(spec.refTables) > 0 {
		var tableEntries []string
		for _, refTableName := range spec.refTables {
			targetConst := fileInfo.constByTableName[refTableName]
			if targetConst == "" {
				return nil, drizzleRefuse(decl, "references table %q is not declared in this file", refTableName)
			}
			key := refTableName
			if !isPlainIdentifier(key) {
				key = quoteSingle(key)
			}
			// A table declared LATER in the file cannot be read at the bridge
			// call, so it rides a thunk — the same laziness drizzle's own
			// `references: () => cities.id` has. A backward reference stays the
			// plain value, so files that never needed the thunk keep the
			// spelling they had.
			value := targetConst
			if fileInfo.posByTableName[refTableName] >= decl.Stmt.Pos() {
				value = "() => " + targetConst
			}
			tableEntries = append(tableEntries, key+": "+value)
		}
		optionParts = append(optionParts, "tables: {"+strings.Join(tableEntries, ", ")+"}")
	}
	var runtimeEntries []string
	for _, column := range spec.columns {
		var callbackParts []string
		for _, mod := range column.mods {
			if mod.isRuntime && len(mod.args) == 1 {
				callbackParts = append(callbackParts, mod.method+": "+mod.args[0])
			}
		}
		if len(callbackParts) > 0 {
			runtimeEntries = append(runtimeEntries, column.key+": {"+strings.Join(callbackParts, ", ")+"}")
		}
	}
	if len(runtimeEntries) > 0 {
		optionParts = append(optionParts, "runtime: {"+strings.Join(runtimeEntries, ", ")+"}")
	}
	optionsText := ""
	if len(optionParts) > 0 {
		optionsText = "{" + strings.Join(optionParts, ", ") + "}"
	}
	extrasText := ""
	if len(spec.entries) > 0 {
		if !exports["TableEntry"] {
			return nil, drizzleRefuse(decl, "the dialect module exports no TableEntry carrier")
		}
		var entries []string
		for _, entry := range spec.entries {
			text := spec.spelling.spellType("TableEntry") + "<" + quoteSingle(entry.fn) + ", [" + strings.Join(entry.chain[0].argsType, ", ") + "]"
			if len(entry.chain) > 1 {
				var links []string
				for _, link := range entry.chain[1:] {
					if len(link.argsType) == 0 {
						links = append(links, link.method+": true")
					} else {
						links = append(links, link.method+": ["+strings.Join(link.argsType, ", ")+"]")
					}
				}
				text += ", {" + strings.Join(links, ", ") + "}"
			}
			text += ">"
			entries = append(entries, "  "+text+",")
		}
		extrasText = ", [\n" + strings.Join(entries, "\n") + "\n]"
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
	tableTypeText := spec.spelling.spellType(tableTypeName)
	bridgeText := spec.spelling.spellValue("tableFromType")
	spec.spelling.attach(&printed.needs)
	printed.text = fmt.Sprintf("%stype %s = %s<%s, {\n%s\n}%s>;\n%sconst %s = %s<%s>(%s);",
		exportPrefix, typeName, tableTypeText, quoteSingle(spec.tableName), strings.Join(columns, "\n"), extrasText,
		constPrefix, constName, bridgeText, typeName, optionsText)
	return printed, nil
}

// isPlainIdentifier reports whether the text can stand as an unquoted object
// key.
func isPlainIdentifier(text string) bool {
	if text == "" {
		return false
	}
	for i, r := range text {
		isLetter := (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || r == '_' || r == '$'
		if !isLetter && (i == 0 || r < '0' || r > '9') {
			return false
		}
	}
	return true
}

// printDrizzleBuilders renders the canonical builders-form pair from a spec.
// constByTableName maps DB table names onto the file's drizzle const names
// (the spelling a printed `.references(() => other.column)` needs).
func printDrizzleBuilders(spec *drizzleTableSpec, decl *declaration, typeName, constName string, exports map[string]bool, constByTableName map[string]string) (*printedDecl, *Diagnostic) {
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
		text := spec.spelling.spellValue(column.fn) + "(" + strings.Join(args, ", ") + ")"
		for _, mod := range column.mods {
			if mod.isReference {
				targetConst := constByTableName[mod.refTable]
				if targetConst == "" {
					return nil, drizzleRefuse(decl, "references table %q is not declared in this file", mod.refTable)
				}
				text += ".references(() => " + targetConst + "." + mod.refColumn
				if mod.refActions != "" {
					text += ", " + mod.refActions
				}
				text += ")"
				continue
			}
			text += "." + mod.method + "(" + strings.Join(mod.args, ", ") + ")"
		}
		columns = append(columns, "  "+column.key+": "+text+",")
	}
	extrasText := ""
	if len(spec.entries) > 0 {
		var entries []string
		for _, entry := range spec.entries {
			text := spec.spelling.spellValue(entry.fn) + "(" + strings.Join(entry.chain[0].argsValue, ", ") + ")"
			for _, link := range entry.chain[1:] {
				text += "." + link.method + "(" + strings.Join(link.argsValue, ", ") + ")"
			}
			entries = append(entries, "  "+text+",")
		}
		extrasText = ", (t) => [\n" + strings.Join(entries, "\n") + "\n]"
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
	tableFnText := spec.spelling.spellValue(spec.tableFn)
	spec.spelling.attach(&printed.needs)
	printed.text = fmt.Sprintf("%sconst %s = %s(%s, {\n%s\n}%s);\n%stype %s = typeof %s;",
		exportPrefix, constName, tableFnText, quoteSingle(spec.tableName), strings.Join(columns, "\n"), extrasText,
		aliasPrefix, typeName, constName)
	return printed, nil
}

// readRuntimeCallbackTexts reads the paired const's options argument
// (`tableFromType<T>({runtime: {...}})` — the explicit form's options ride
// after the runType, so the first OBJECT-LITERAL argument is the bag) and
// returns the verbatim callback texts per column key and method.
func readRuntimeCallbackTexts(source string, decl *declaration) (map[string]map[string]string, *Diagnostic) {
	texts := map[string]map[string]string{}
	if decl.AliasStmt == nil {
		return texts, nil
	}
	initializer := constInitializer(decl.AliasStmt)
	if initializer == nil || initializer.Kind != ast.KindCallExpression {
		return texts, nil
	}
	var optionsNode *ast.Node
	for _, argument := range initializer.AsCallExpression().Arguments.Nodes {
		if argument.Kind == ast.KindObjectLiteralExpression {
			optionsNode = argument
			break
		}
	}
	if optionsNode == nil {
		return texts, nil
	}
	for _, property := range optionsNode.AsObjectLiteralExpression().Properties.Nodes {
		if property.Kind != ast.KindPropertyAssignment {
			continue
		}
		assignment := property.AsPropertyAssignment()
		nameNode := assignment.Name()
		if nameNode == nil || nameNode.Text() != "runtime" || assignment.Initializer == nil {
			continue
		}
		runtimeNode := assignment.Initializer
		if runtimeNode.Kind != ast.KindObjectLiteralExpression {
			return nil, drizzleRefuse(decl, "options.runtime must be a plain object literal")
		}
		for _, columnProperty := range runtimeNode.AsObjectLiteralExpression().Properties.Nodes {
			if columnProperty.Kind != ast.KindPropertyAssignment {
				return nil, drizzleRefuse(decl, "options.runtime entries must be plain `column: {method: callback}` members")
			}
			columnAssignment := columnProperty.AsPropertyAssignment()
			columnName := columnAssignment.Name()
			callbacksNode := columnAssignment.Initializer
			if columnName == nil || callbacksNode == nil || callbacksNode.Kind != ast.KindObjectLiteralExpression {
				return nil, drizzleRefuse(decl, "options.runtime entries must be plain `column: {method: callback}` members")
			}
			perColumn := map[string]string{}
			for _, callbackProperty := range callbacksNode.AsObjectLiteralExpression().Properties.Nodes {
				if callbackProperty.Kind != ast.KindPropertyAssignment {
					return nil, drizzleRefuse(decl, "options.runtime callbacks must be plain `method: callback` members")
				}
				callbackAssignment := callbackProperty.AsPropertyAssignment()
				methodName := callbackAssignment.Name()
				callbackNode := callbackAssignment.Initializer
				if methodName == nil || callbackNode == nil {
					return nil, drizzleRefuse(decl, "options.runtime callbacks must be plain `method: callback` members")
				}
				perColumn[methodName.Text()] = strings.TrimSpace(source[skipTrivia(source, callbackNode.Pos()):callbackNode.End()])
			}
			texts[columnName.Text()] = perColumn
		}
	}
	return texts, nil
}

// fillRuntimeCallbacks pairs the graph's runtime marker flags with the
// options.runtime callback texts, both ways: a marker without a callback and
// a callback without a marker each refuse naming the column and method.
func fillRuntimeCallbacks(spec *drizzleTableSpec, decl *declaration, source string) *Diagnostic {
	texts, diag := readRuntimeCallbackTexts(source, decl)
	if diag != nil {
		return diag
	}
	used := map[string]bool{}
	for columnIndex := range spec.columns {
		column := &spec.columns[columnIndex]
		for modIndex := range column.mods {
			mod := &column.mods[modIndex]
			if !mod.isRuntime {
				continue
			}
			text := texts[column.key][mod.method]
			if text == "" {
				return drizzleRefuse(decl, "column %q carries the %s marker but the const's options.runtime has no matching callback", column.key, mod.method)
			}
			mod.args = []string{text}
			used[column.key+"."+mod.method] = true
		}
	}
	for columnKey, methods := range texts {
		for method := range methods {
			if !used[columnKey+"."+method] {
				return drizzleRefuse(decl, "options.runtime.%s.%s has no matching %s marker on the column type", columnKey, method, method)
			}
		}
	}
	return nil
}

// ── the conversion entry (called from ConvertFile) ───────────────────────────

// drizzlePlan is one drizzle declaration's replacement (the main statement
// span gets the pair text; the paired half's span is deleted).
type drizzlePlan struct {
	decl    *declaration
	printed *printedDecl
}

// drizzleFileInfo carries the per-file lookups the drizzle arm shares across
// declarations: const↔table-name maps (references), the declaration position
// per table name (the tables option's declared-earlier check) and the slim
// sql binding.
type drizzleFileInfo struct {
	spellings        *drizzleSpellings
	tableNameByConst map[string]string
	constByTableName map[string]string
	posByTableName   map[string]int
	sqlSpelling      string
}

const drizzleRootModule = "@mionjs/drizzle-orm"

// buildDrizzleFileInfo scans the recognized declarations once per file.
func buildDrizzleFileInfo(decls []*declaration, imports *importScan, names *nameTable) *drizzleFileInfo {
	info := &drizzleFileInfo{spellings: newDrizzleSpellings(imports, names), tableNameByConst: map[string]string{}, constByTableName: map[string]string{}, posByTableName: map[string]int{}}
	for _, decl := range decls {
		if !decl.Drizzle {
			continue
		}
		tableName := ""
		switch decl.Form {
		case TargetBuilders:
			initializer := constInitializer(decl.Stmt)
			if initializer != nil && initializer.Kind == ast.KindCallExpression {
				callArgs := initializer.AsCallExpression().Arguments
				if callArgs != nil && len(callArgs.Nodes) > 0 && ast.IsStringLiteral(callArgs.Nodes[0]) {
					tableName = callArgs.Nodes[0].Text()
				}
			}
		case TargetType:
			if aliasDecl := decl.Stmt.AsTypeAliasDeclaration(); aliasDecl != nil && aliasDecl.Type != nil && aliasDecl.Type.Kind == ast.KindTypeReference {
				typeRef := aliasDecl.Type.AsTypeReferenceNode()
				if typeRef.TypeArguments != nil && len(typeRef.TypeArguments.Nodes) > 0 {
					argument := typeRef.TypeArguments.Nodes[0]
					if argument.Kind == ast.KindLiteralType {
						literal := argument.AsLiteralTypeNode().Literal
						if literal != nil && ast.IsStringLiteral(literal) {
							tableName = literal.Text()
						}
					}
				}
			}
		}
		if tableName == "" {
			continue
		}
		info.posByTableName[tableName] = decl.Stmt.Pos()
		if decl.ConstName != "" {
			info.tableNameByConst[decl.ConstName] = tableName
			info.constByTableName[tableName] = decl.ConstName
		} else {
			// A standalone type declaration still claims its table name; a
			// printed builders pair will bind it to the derived const.
			info.constByTableName[tableName] = ""
		}
	}
	if imports != nil {
		if local := imports.LocalFor(drizzleRootModule, "sql"); local != "" {
			info.sqlSpelling = local
		} else if alias := imports.NamespaceAlias(drizzleRootModule); alias != "" {
			info.sqlSpelling = alias + ".sql"
		}
	}
	return info
}

// convertDrizzleDecl converts one recognized drizzle declaration to the
// target form's canonical pair.
func convertDrizzleDecl(prog *program.Program, typeChecker *checker.Checker, cache *runtype.Cache, source string, decl *declaration, opts Options, names *nameTable, fileInfo *drizzleFileInfo) (*printedDecl, *Diagnostic) {
	if decl.Form == TargetBuilders {
		// builders → type: the spec lives in the call AST.
		spec, moduleNode, diag := specFromBuildersAST(source, decl, typeChecker, fileInfo.tableNameByConst, fileInfo.spellings)
		if diag != nil {
			return nil, diag
		}
		exports, _ := drizzleExports(prog, typeChecker, moduleNode)
		if exports == nil {
			return nil, drizzleRefuse(decl, "cannot resolve the dialect module %q", spec.spelling.module)
		}
		typeName := decl.Name
		if typeName == "" {
			typeName = names.deriveDrizzleTypeName(decl.ConstName)
			if typeName == "" {
				return nil, drizzleRefuse(decl, "no free type name for the pair")
			}
		}
		return printDrizzleType(spec, decl, typeName, decl.ConstName, exports, fileInfo)
	}
	// type → builders: the spec lives in the reflected graph; the alias and
	// table type come from the alias declaration's type reference.
	aliasDecl := decl.Stmt.AsTypeAliasDeclaration()
	if aliasDecl == nil || aliasDecl.Type == nil || aliasDecl.Type.Kind != ast.KindTypeReference {
		return nil, drizzleRefuse(decl, "only a direct dialect table type reference converts")
	}
	typeRef := aliasDecl.Type.AsTypeReferenceNode()
	tableTypeName, module, referenceNode, ok := dialectTypeReference(typeChecker, typeRef.TypeName)
	if !ok {
		return nil, drizzleRefuse(decl, "the table type must name an export of the dialect package, imported directly or through a namespace")
	}
	spelling := fileInfo.spellings.forModule(module)
	exports, _ := drizzleExports(prog, typeChecker, dialectModuleNode(typeChecker, referenceNode))
	if exports == nil {
		return nil, drizzleRefuse(decl, "cannot resolve the dialect module %q", module)
	}
	tableFn := lowerFirst(tableTypeName)
	resolved, resolveErr := resolveDecl(typeChecker, cache, decl)
	if resolveErr != nil {
		return nil, drizzleRefuse(decl, "cannot resolve the table type: %v", resolveErr)
	}
	spec, diag := specFromGraph(resolved, decl, spelling, tableFn, fileInfo)
	if diag != nil {
		return nil, diag
	}
	if runtimeDiag := fillRuntimeCallbacks(spec, decl, source); runtimeDiag != nil {
		return nil, runtimeDiag
	}
	constName := decl.ConstName
	if constName == "" {
		constName = names.deriveDrizzleConstName(decl.Name)
		if constName == "" {
			return nil, drizzleRefuse(decl, "no free const name for the pair")
		}
		// The pair binds the derived const to this table name for sibling
		// references converted in the same run.
		fileInfo.constByTableName[spec.tableName] = constName
	}
	return printDrizzleBuilders(spec, decl, decl.Name, constName, exports, fileInfo.constByTableName)
}
