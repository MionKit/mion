package convert

// drizzle.go is the drizzle-table conversion arm: it recognizes table declarations of BOTH authoring
// roads by the mion drizzle sentinels on their resolved types, never by function name, and rewrites
// them between the canonical pair spellings:
//
//	builders form                              type form
//	const users = DZ.pgTable('users', {…});    type UsersTable = DZ.PgTable<'users', {…}>;
//	type UsersTable = typeof users;            const users = DZ.tableFromType<UsersTable>(options?);
//
// The emitted const uses the marker form, resolved by the devtools transform. The explicit
// `tableFromType(getRunType<T>(), options?)` escape hatch is still recognized (pairing ignores the value
// arguments) and left as written in the target form. References go in the eagerly evaluated options
// object, so a table declared later in the file is wrapped in a thunk. Both directions keep the value
// and the type name, and always print both halves.
//
// A column is ONE builder call whose props object holds config keys and modifiers together, split by
// drizzleModNames; its type is the same props object as the column type's one argument, and db names
// that differ from the key ride the table's names map. No Go name table: builder names come from the
// rtColSpec sentinel literals, type names from the first-letter uppercase rule checked against the
// dialect module's real exports. A construct with no type spelling (interpolated sql, $type, non-literal
// args, out-of-file references, enum and custom columns) reports CNV009 and stays untouched.

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/runtype"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
	"github.com/mionkit/mion/ts-go-runtypes/internal/tsimports"
)

// The sentinel member suffixes; tsgo spells a unique-symbol member as
// `\xFE@<symbolConstName>@<checkerId>`, whose id stripSentinelId removes.
const (
	// The table type IS its metadata, so this brand marks a node as a table and carries the dialect
	// that recorded it; name, columns and extras are the node's own members.
	sentinelTable   = "@rtTableBrand"
	sentinelColSpec = "@rtColSpecKey"
)

// stripSentinelId reduces a late-bound member name to its stable form, mirroring
// cachegen/runtype's stableMemberName.
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

// typeHasSentinel reports whether the resolved type has a member whose stable name ends with the
// sentinel suffix.
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

// drizzleTypeAlias recognizes `type N = <ref>` whose declared type carries the table sentinel, the
// type road's spelling.
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

// drizzleConstForm recognizes `const c = <call>` whose declared type carries the table sentinel: a
// builders-form table or the type form's tableFromType handle, which pairDrizzleDecls tells apart.
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

// typeofAliasTarget returns the const name of a `type N = typeof c` statement, the builders form's
// type-name half.
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

// tableFromTypeTarget returns N when the initializer is the type form's handle call,
// `<ns>.tableFromType<N>(…)`.
func tableFromTypeTarget(typeChecker *checker.Checker, initializer *ast.Node) (string, bool) {
	if initializer == nil || initializer.Kind != ast.KindCallExpression {
		return "", false
	}
	call := initializer.AsCallExpression()
	callee := call.Expression
	if callee == nil {
		return "", false
	}
	// Either spelling of the bridge, namespace-qualified or a named binding under whatever local it
	// was imported as.
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

// pairDrizzleDecls merges the pair halves: a `typeof` alias onto its builders const, consuming the
// alias's own candidate declaration, and a tableFromType handle const onto its type declaration. It
// runs inside recognizeFile, after the statement walk collected every candidate.
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

// drizzleProp is one props member: a config key with its literal text, or a modifier whose callback, when it takes one, is args[0] verbatim.
type drizzleProp struct {
	key   string
	value string
	isMod bool
	args  []string
	// refConst is the const a builders-form reference names; the graph only knows refTable.
	refConst    string
	refTable    string
	refColumn   string
	refActions  string
	isReference bool
	isRuntime   bool
}

// drizzleModNames is every modifier method a column type can carry, across all dialects. A column's
// props object holds the builder's own config keys AND its modifier calls together, so this list is
// what tells the two halves apart in both directions. Its twin is colModNames in
// packages/drizzle-orm/src/columns.ts; both are gated against the dialect manifests, here by
// TestDrizzleModNamesMatchManifests.
var drizzleModNames = map[string]bool{
	"$default":                     true,
	"$defaultFn":                   true,
	"$onUpdate":                    true,
	"$onUpdateFn":                  true,
	"$type":                        true,
	"array":                        true,
	"autoincrement":                true,
	"default":                      true,
	"defaultNow":                   true,
	"defaultRandom":                true,
	"generatedAlwaysAs":            true,
	"generatedAlwaysAsIdentity":    true,
	"generatedByDefaultAsIdentity": true,
	"notNull":                      true,
	"onUpdateNow":                  true,
	"primaryKey":                   true,
	"references":                   true,
	"unique":                       true,
}

// modPropValue is the prop rule: `true` for no arguments, else the args tuple, so `default: [true]` stays apart from a flag.
func modPropValue(args []string, separator string) string {
	if len(args) == 0 {
		return "true"
	}
	return "[" + strings.Join(args, separator) + "]"
}

// drizzleColumn is one column: key, builder fn, db name ("" when it equals the key) and its props in authored order.
type drizzleColumn struct {
	key   string
	fn    string
	name  string
	props []drizzleProp
}

// drizzleEntryChain is one chained call on a table entry (.on(...), ...).
type drizzleEntryChain struct {
	method    string
	argsType  []string // type-mode arg texts ({col: 'a'}, Sql<'...'>)
	argsValue []string // builders-mode arg texts (t.a, sql`...`)
}

// drizzleEntry is one table-level extraConfig entry; each road fills the arg texts its printer reads.
type drizzleEntry struct {
	fn    string
	chain []drizzleEntryChain // chain[0] is the BASE call's args (method "")
}

// drizzleTableSpec is the shared intermediate BOTH printers consume, built from the call AST or the
// reflected graph depending on the source road.
type drizzleTableSpec struct {
	spelling  *drizzleSpelling // how this file names the dialect package
	tableFn   string           // e.g. "pgTable" (canonical lowerFirst spelling)
	tableName string
	columns   []drizzleColumn
	entries   []drizzleEntry
	// refTables are the referenced DB names in first-seen order, for the type form's `tables` option;
	// refConsts keeps the const each one was named by, since two tables may share a DB name.
	refTables []string
	refConsts map[string]string
}

// addRefTable records a referenced DB table name once, in first-seen order.
func (spec *drizzleTableSpec) addRefTable(tableName, constName string) {
	if spec.refConsts == nil {
		spec.refConsts = map[string]string{}
	}
	if _, seen := spec.refConsts[tableName]; seen {
		return
	}
	spec.refConsts[tableName] = constName
	spec.refTables = append(spec.refTables, tableName)
}

func drizzleRefuse(decl *declaration, format string, args ...any) *Diagnostic {
	return &Diagnostic{Code: CodeDrizzleUnsupported, Severity: SeverityError, Decl: declLabel(decl),
		Message: fmt.Sprintf("drizzle table %q: ", declLabel(decl)) + fmt.Sprintf(format, args...)}
}

// ── how a file spells the dialect package ────────────────────────────────────

// drizzleSpelling is the ONE place that knows how a file names the dialect package's exports, so
// recognition and printing cannot disagree: a namespace import spells `DZ.pgTable`, a named one
// `pgTable` under whatever local it bound, and a converted file keeps the style it was written in.
// A name the printed output needs but the file has not imported is claimed here, collision free,
// and reported as an import need, since drizzle's own `index` and ours cannot share one binding.
type drizzleSpelling struct {
	namespace string // the namespace local, "" when the file uses named imports
	module    string // the dialect module specifier
	scan      *importScan
	names     *nameTable
	used      map[string]bool   // every identifier the file already mentions
	locals    map[string]string // exported name → the local this file spells it as
	needs     []foreignNeed
}

func (spelling *drizzleSpelling) qualified() bool { return spelling.namespace != "" }

// spellType is the text for an export used as a TYPE (PgTable, Varchar, NotNull).
func (spelling *drizzleSpelling) spellType(exported string) string {
	return spelling.spell(exported, true)
}

// spellValue is the text for an export that is CALLED, so a claimed import never comes in as
// `import type`.
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
		base := exported
		// Step aside from a name the file already uses, before claim sees it: binding `Date` here
		// would change what every `Date` annotation in the file means.
		if spelling.used[base] {
			base += "$rt"
		}
		local = spelling.names.claim(base)
		if local == "" {
			local = base
		}
		spelling.needs = append(spelling.needs, foreignNeed{moduleSpec: spelling.module, typeName: exported, local: local, typeOnly: typeOnly})
	}
	spelling.locals[exported] = local
	return local
}

// attach hands the printed declaration's import needs to the planner: keep every binding the output
// spelled, add the ones this conversion introduced.
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

// drizzleSpellings is the per-file registry, one spelling per dialect module, so every declaration
// in a file agrees on how that package is named.
type drizzleSpellings struct {
	scan  *importScan
	names *nameTable
	// used is EVERY identifier the file mentions, not just what it declares, and a claimed local
	// must dodge them: binding a column type as a bare `Date` would redefine that name file-wide.
	used     map[string]bool
	byModule map[string]*drizzleSpelling
}

func newDrizzleSpellings(scan *importScan, names *nameTable, used map[string]bool) *drizzleSpellings {
	return &drizzleSpellings{scan: scan, names: names, used: used, byModule: map[string]*drizzleSpelling{}}
}

// identifiersIn collects every identifier text in a file, so a claimed import cannot shadow a name
// the file already means something by, the ambient ones no declaration list mentions included.
func identifiersIn(sourceFile *ast.SourceFile) map[string]bool {
	used := map[string]bool{}
	root := sourceFile.AsNode()
	if root == nil {
		return used
	}
	var walk func(node *ast.Node) bool
	walk = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		if ast.IsIdentifier(node) {
			used[node.Text()] = true
		}
		node.ForEachChild(walk)
		return false
	}
	root.ForEachChild(walk)
	return used
}

// forModule answers how this file spells one dialect module. The style comes from the file's own
// imports, never the declaration being converted, so two tables in one file print alike.
func (spellings *drizzleSpellings) forModule(module string) *drizzleSpelling {
	if existing, ok := spellings.byModule[module]; ok {
		return existing
	}
	spelling := &drizzleSpelling{module: module, scan: spellings.scan, names: spellings.names, used: spellings.used, locals: map[string]string{}}
	if spellings.scan != nil {
		spelling.namespace = spellings.scan.NamespaceAlias(module)
	}
	spellings.byModule[module] = spelling
	return spelling
}

// removableLocals are the dialect-package bindings the file bound BEFORE the conversion; whichever
// the printed output no longer spells may go, and the planner still keeps any binding used outside
// the rewritten spans.
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
		// Drop every dialect-package binding, but from the root only the reference helpers: the rest is the file's.
		root := module == drizzleRootModule
		for _, binding := range append(append([]namedBinding{}, entry.Named...), entry.ExtraNamedBindings()...) {
			if root && binding.Imported != "tableRef" && binding.Imported != "TableRef" {
				continue
			}
			locals[binding.Local] = true
		}
	}
	return locals
}

// dialectModuleNode returns a node whose symbol IS the dialect module, what the export walk resolves
// from: a namespace identifier, or the module specifier a named binding came from.
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

// dialectTypeReference is the type-position twin of dialectExportCallee, resolving a reference to
// the EXPORTED type name and the module it came from.
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

// dialectExportCallee decomposes a callee naming a dialect export, in either import style, into the
// EXPORTED name and its module. The module always resolves through the checker, never from the name,
// so a shadowing local cannot pass as the import it hides.
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

// literalExprText renders a literal-only expression canonically: single quotes, members in source
// order. A non-literal construct has no type spelling.
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
		// Comma-joined, valid in BOTH positions the canonical text lands in: a value config object
		// and a type literal argument.
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

// skipTrivia advances past the leading whitespace Pos() includes.
func skipTrivia(source string, pos int) int {
	for pos < len(source) && (source[pos] == ' ' || source[pos] == '\t' || source[pos] == '\n' || source[pos] == '\r') {
		pos++
	}
	return pos
}

// ── builders AST → spec ──────────────────────────────────────────────────────

// sqlTemplateText returns the raw text of the slim `sql` tagged template with NO substitutions,
// verified by package import rather than by name. An interpolated template has no type spelling.
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

// rootExportCallee reports whether a callee names this @mionjs/drizzle-orm export, named or through a namespace.
func rootExportCallee(typeChecker *checker.Checker, callee *ast.Node, exported string) bool {
	if callee == nil {
		return false
	}
	if ast.IsIdentifier(callee) {
		return !tsimports.IsNamespaceImport(typeChecker, callee) &&
			tsimports.ModuleOfImport(typeChecker, callee) == drizzleRootModule && importedNameOf(typeChecker, callee) == exported
	}
	if !ast.IsPropertyAccessExpression(callee) {
		return false
	}
	access := callee.AsPropertyAccessExpression()
	return access.Name().Text() == exported && access.Expression != nil && ast.IsIdentifier(access.Expression) &&
		tsimports.IsNamespaceImport(typeChecker, access.Expression) && tsimports.ModuleOfImport(typeChecker, access.Expression) == drizzleRootModule
}

// tableRefTarget parses `tableRef(table, 'column')`, the one spelling of a column of another table.
func tableRefTarget(typeChecker *checker.Checker, node *ast.Node) (constName string, columnKey string, ok bool) {
	for node != nil && node.Kind == ast.KindParenthesizedExpression {
		node = node.AsParenthesizedExpression().Expression
	}
	if node == nil || !ast.IsCallExpression(node) {
		return "", "", false
	}
	call := node.AsCallExpression()
	if !rootExportCallee(typeChecker, call.Expression, "tableRef") || call.Arguments == nil || len(call.Arguments.Nodes) != 2 {
		return "", "", false
	}
	tableArg, columnArg := call.Arguments.Nodes[0], call.Arguments.Nodes[1]
	if !ast.IsIdentifier(tableArg) || !ast.IsStringLiteral(columnArg) {
		return "", "", false
	}
	return tableArg.Text(), columnArg.Text(), true
}

// specFromBuildersAST parses `NS.pgTable('name', {key: NS.fn(name?, props?)})`.
func specFromBuildersAST(source string, decl *declaration, typeChecker *checker.Checker, fileInfo *drizzleFileInfo) (*drizzleTableSpec, *ast.Node, *Diagnostic) {
	initializer := constInitializer(decl.Stmt)
	call := initializer.AsCallExpression()
	tableFn, module, ok := dialectExportCallee(typeChecker, call.Expression)
	if !ok {
		return nil, nil, drizzleRefuse(decl, "%s", unspellableTableHead(typeChecker, initializer))
	}
	spelling := fileInfo.spellings.forModule(module)
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
		entries, entriesDiag := entriesFromExtraConfigAST(source, decl, call.Arguments.Nodes[2], spec, typeChecker, fileInfo)
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
		column, diag := columnFromCall(source, decl, assignment.Initializer, keyNode.Text(), spec, typeChecker, fileInfo)
		if diag != nil {
			return nil, nil, diag
		}
		for _, prop := range column.props {
			if prop.isReference {
				spec.addRefTable(prop.refTable, prop.refConst)
			}
		}
		spec.columns = append(spec.columns, *column)
	}
	return spec, moduleNode, nil
}

// unspellableTableHead says WHY a recognized table declaration's head has no type spelling. The
// declaration IS a table, its resolved type carrying the sentinel, so "not recognized" is never the
// answer; naming the construct is what makes the report actionable.
func unspellableTableHead(typeChecker *checker.Checker, initializer *ast.Node) string {
	callee := initializer.AsCallExpression().Expression
	if callee != nil && ast.IsPropertyAccessExpression(callee) {
		access := callee.AsPropertyAccessExpression()
		if access.Expression != nil && access.Expression.Kind == ast.KindCallExpression {
			return fmt.Sprintf("a chained modifier on the table (.%s()) has no type spelling — the table type carries columns and extras, not table-level calls", access.Name().Text())
		}
		if access.Expression != nil && ast.IsIdentifier(access.Expression) {
			return fmt.Sprintf("a table declared on the %q handle has no type spelling — the table type cannot carry the schema it belongs to", access.Expression.Text())
		}
	}
	if callee != nil && ast.IsIdentifier(callee) && tsimports.ModuleOfImport(typeChecker, callee) == "" {
		return fmt.Sprintf("%q is a local binding, not a dialect export — a table built by a table creator has no type spelling, because the type cannot carry the creator's name transform", callee.Text())
	}
	return "the table call must name an export of the dialect package, imported directly or through a namespace"
}

// columnFromCall parses one builder call, `NS.fn(name?, props?)`: its props object IS the column type's argument.
func columnFromCall(source string, decl *declaration, expr *ast.Node, columnKey string, spec *drizzleTableSpec, typeChecker *checker.Checker, fileInfo *drizzleFileInfo) (*drizzleColumn, *Diagnostic) {
	// Every refusal names the column: these tables run to seventy columns.
	refuse := func(format string, args ...any) *Diagnostic {
		return drizzleRefuse(decl, "column %q: "+format, append([]any{columnKey}, args...)...)
	}
	if expr == nil || !ast.IsCallExpression(expr) {
		return nil, refuse("a column must be one builder call")
	}
	call := expr.AsCallExpression()
	if callee := call.Expression; callee != nil && ast.IsPropertyAccessExpression(callee) {
		if access := callee.AsPropertyAccessExpression(); access.Expression != nil && ast.IsCallExpression(access.Expression) {
			return nil, refuse("a chained .%s() does not exist on the slim builders, every setting goes in the one props object", access.Name().Text())
		}
	}
	builderFn, module, isDialect := dialectExportCallee(typeChecker, call.Expression)
	if !isDialect || module != spec.spelling.module {
		return nil, refuse("a column must be a builder call rooted in the dialect package (a locally declared handle, like an enum or a customType, has no type spelling)")
	}
	column := &drizzleColumn{key: columnKey, fn: builderFn}
	args := call.Arguments.Nodes
	argIndex := 0
	if argIndex < len(args) && ast.IsStringLiteral(args[argIndex]) {
		if dbName := args[argIndex].Text(); dbName != columnKey {
			column.name = dbName
		}
		argIndex++
	} else if argIndex < len(args) && args[argIndex].Kind != ast.KindObjectLiteralExpression && args[argIndex].Kind != ast.KindArrayLiteralExpression {
		// The db name lands in the table's names map, so only a literal carries over.
		return nil, refuse("builder %q: the db name must be a string literal", builderFn)
	}
	if argIndex < len(args) {
		if args[argIndex].Kind == ast.KindArrayLiteralExpression {
			return nil, refuse("builder %q takes a values array, which has no type spelling — the column types mirror a props object", builderFn)
		}
		if args[argIndex].Kind != ast.KindObjectLiteralExpression {
			return nil, refuse("builder %q: props must be an object literal", builderFn)
		}
		props, diag := propsFromObjectAST(source, args[argIndex], builderFn, spec, typeChecker, fileInfo, decl, refuse)
		if diag != nil {
			return nil, diag
		}
		column.props = props
		argIndex++
	}
	if argIndex < len(args) {
		return nil, refuse("builder %q: unexpected extra argument", builderFn)
	}
	return column, nil
}

// propsFromObjectAST reads a props object in authored order; a reference as the table and column its tableRef() names.
func propsFromObjectAST(source string, object *ast.Node, builderFn string, spec *drizzleTableSpec, typeChecker *checker.Checker, fileInfo *drizzleFileInfo, decl *declaration, refuse func(format string, args ...any) *Diagnostic) ([]drizzleProp, *Diagnostic) {
	var props []drizzleProp
	for _, property := range object.AsObjectLiteralExpression().Properties.Nodes {
		if property.Kind != ast.KindPropertyAssignment {
			return nil, refuse("builder %q: props members must be plain `key: value` assignments", builderFn)
		}
		assignment := property.AsPropertyAssignment()
		nameNode := assignment.Name()
		if nameNode == nil || (!ast.IsIdentifier(nameNode) && !ast.IsStringLiteral(nameNode)) {
			return nil, refuse("builder %q: props keys must be plain names", builderFn)
		}
		key := nameNode.Text()
		value := assignment.Initializer
		if !IsDrizzleModName(key) {
			text, ok := literalExprText(source, value)
			if !ok {
				return nil, refuse("builder %q: config key %q carries a non-literal value", builderFn, key)
			}
			props = append(props, drizzleProp{key: propertyKeyText(nameNode), value: text})
			continue
		}
		prop := drizzleProp{key: key, isMod: true}
		var elements []*ast.Node
		if value.Kind == ast.KindArrayLiteralExpression {
			elements = value.AsArrayLiteralExpression().Elements.Nodes
		}
		switch {
		case key == "$type":
			return nil, refuse("prop $type has no spelling convert carries across roads, its type argument is not a literal; keep this table on the builders road")
		case IsDrizzleRuntimeMod(key):
			if value.Kind != ast.KindArrayLiteralExpression || len(elements) != 1 {
				return nil, refuse("prop %q takes its one callback in a tuple, [() => ...]", key)
			}
			prop.isRuntime = true
			prop.args = []string{strings.TrimSpace(source[skipTrivia(source, elements[0].Pos()):elements[0].End()])}
		case key == "references":
			if value.Kind != ast.KindArrayLiteralExpression || len(elements) < 1 || len(elements) > 2 || elements[0].Kind != ast.KindArrowFunction {
				return nil, refuse("references: expected [() => tableRef(table, 'column')] and optional actions")
			}
			constName, refColumn, ok := tableRefTarget(typeChecker, elements[0].AsArrowFunction().Body)
			if !ok {
				return nil, refuse("references: only a `() => tableRef(table, 'column')` target has a type spelling")
			}
			refTable, known := fileInfo.tableNameForConst(constName, decl)
			if !known {
				return nil, refuse("references: %q is not a drizzle table this declaration can see", constName)
			}
			prop.isReference, prop.refConst, prop.refTable, prop.refColumn = true, constName, refTable, refColumn
			if len(elements) == 2 {
				actionsText, ok := literalExprText(source, elements[1])
				if !ok {
					return nil, refuse("references: the actions argument must be a literal object")
				}
				prop.refActions = actionsText
			}
		case value.Kind == ast.KindTrueKeyword:
		case value.Kind == ast.KindArrayLiteralExpression:
			for _, element := range elements {
				if sqlText, ok := sqlTemplateText(element, typeChecker); ok {
					prop.args = append(prop.args, spec.spelling.spellType("Sql")+"<"+quoteSingle(sqlText)+">")
					continue
				}
				argText, ok := literalExprText(source, element)
				if !ok {
					return nil, refuse("prop %q: argument is not a literal (interpolated sql, functions and column references have no type spelling)", key)
				}
				prop.args = append(prop.args, argText)
			}
		default:
			return nil, refuse("prop %q takes `true` or its argument tuple", key)
		}
		props = append(props, prop)
	}
	return props, nil
}

// ── extraConfig entries (builders AST → spec) ────────────────────────────────

// entryArgText renders one extraConfig argument in its TYPE spelling, recording a cross-table reference in spec.refTables.
func entryArgText(source string, decl *declaration, node *ast.Node, spec *drizzleTableSpec, paramName string, typeChecker *checker.Checker, fileInfo *drizzleFileInfo) (string, *Diagnostic) {
	if sqlText, ok := sqlTemplateText(node, typeChecker); ok {
		return spec.spelling.spellType("Sql") + "<" + quoteSingle(sqlText) + ">", nil
	}
	if ast.IsPropertyAccessExpression(node) {
		access := node.AsPropertyAccessExpression()
		if access.Expression != nil && ast.IsIdentifier(access.Expression) && access.Expression.Text() == paramName && paramName != "" {
			return "{col: " + quoteSingle(access.Name().Text()) + "}", nil
		}
		return "", drizzleRefuse(decl, "extraConfig: only columns of this table (t.x) or tableRef(table, 'column') convert")
	}
	if constName, columnKey, ok := tableRefTarget(typeChecker, node); ok {
		tableName, known := fileInfo.tableNameForConst(constName, decl)
		if !known {
			return "", drizzleRefuse(decl, "extraConfig: %q is not a drizzle table this declaration can see", constName)
		}
		spec.addRefTable(tableName, constName)
		return "{table: " + quoteSingle(tableName) + ", col: " + quoteSingle(columnKey) + "}", nil
	}
	if node.Kind == ast.KindArrayLiteralExpression {
		var items []string
		for _, element := range node.AsArrayLiteralExpression().Elements.Nodes {
			text, diag := entryArgText(source, decl, element, spec, paramName, typeChecker, fileInfo)
			if diag != nil {
				return "", diag
			}
			items = append(items, text)
		}
		return "[" + strings.Join(items, ", ") + "]", nil
	}
	if node.Kind == ast.KindObjectLiteralExpression {
		var members []string
		for _, property := range node.AsObjectLiteralExpression().Properties.Nodes {
			if property.Kind != ast.KindPropertyAssignment {
				return "", drizzleRefuse(decl, "extraConfig: config objects must use plain `key: value` members")
			}
			assignment := property.AsPropertyAssignment()
			nameNode := assignment.Name()
			if nameNode == nil {
				return "", drizzleRefuse(decl, "extraConfig: unnamed config member")
			}
			text, diag := entryArgText(source, decl, assignment.Initializer, spec, paramName, typeChecker, fileInfo)
			if diag != nil {
				return "", diag
			}
			members = append(members, propertyKeyText(nameNode)+": "+text)
		}
		return "{" + strings.Join(members, ", ") + "}", nil
	}
	literal, ok := literalExprText(source, node)
	if !ok {
		return "", drizzleRefuse(decl, "extraConfig: argument is not a literal, a column reference or literal sql")
	}
	return literal, nil
}

// entriesFromExtraConfigAST parses the table call's third argument, an arrow callback returning an
// array literal of helper chains.
func entriesFromExtraConfigAST(source string, decl *declaration, node *ast.Node, spec *drizzleTableSpec, typeChecker *checker.Checker, fileInfo *drizzleFileInfo) ([]drizzleEntry, *Diagnostic) {
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
	for body != nil && body.Kind == ast.KindParenthesizedExpression {
		body = body.AsParenthesizedExpression().Expression
	}
	// BOTH shapes drizzle accepts: the array form and the older keyed-object one its own suites
	// still write. drizzle and the recorder read only that object's VALUES, so its keys are labels
	// and the printed builders form comes back as the array.
	var elements []*ast.Node
	switch {
	case body != nil && body.Kind == ast.KindArrayLiteralExpression:
		elements = body.AsArrayLiteralExpression().Elements.Nodes
	case body != nil && body.Kind == ast.KindObjectLiteralExpression:
		for _, property := range body.AsObjectLiteralExpression().Properties.Nodes {
			if property.Kind != ast.KindPropertyAssignment {
				return nil, drizzleRefuse(decl, "extraConfig: the keyed-object form must use plain `key: entry` members")
			}
			elements = append(elements, property.AsPropertyAssignment().Initializer)
		}
	default:
		return nil, drizzleRefuse(decl, "extraConfig must return an array literal of entries, or the keyed object drizzle also accepts")
	}
	// drizzle flattens ONE level (`extraConfig.flat(1)`), so a grouped array is a legal way to write
	// entries and its own suites use it.
	var flattened []*ast.Node
	for _, element := range elements {
		if element != nil && element.Kind == ast.KindArrayLiteralExpression {
			flattened = append(flattened, element.AsArrayLiteralExpression().Elements.Nodes...)
			continue
		}
		flattened = append(flattened, element)
	}
	var entries []drizzleEntry
	for _, element := range flattened {
		entry, diag := entryFromChainAST(source, decl, element, spec, paramName, typeChecker, fileInfo)
		if diag != nil {
			return nil, diag
		}
		entries = append(entries, *entry)
	}
	return entries, nil
}

// entryFromChainAST parses `NS.helper(args).m1(args)...` through the shared chain walker.
func entryFromChainAST(source string, decl *declaration, expr *ast.Node, spec *drizzleTableSpec, paramName string, typeChecker *checker.Checker, fileInfo *drizzleFileInfo) (*drizzleEntry, *Diagnostic) {
	if expr != nil && ast.IsIdentifier(expr) {
		return nil, drizzleRefuse(decl,
			"extraConfig entry %q is another declaration in this file — the table type spells its extras inline, so it cannot point at one", expr.Text())
	}
	base, links, ok := WalkCallChain(expr)
	if !ok {
		return nil, drizzleRefuse(decl, "extraConfig entries must be helper call chains")
	}
	helperFn, module, isDialect := dialectExportCallee(typeChecker, base.AsCallExpression().Expression)
	if !isDialect || module != spec.spelling.module {
		return nil, drizzleRefuse(decl, "extraConfig entries must be helper chains rooted in the dialect package")
	}
	argTexts := func(call *ast.Node) ([]string, *Diagnostic) {
		var texts []string
		for _, argument := range call.AsCallExpression().Arguments.Nodes {
			text, diag := entryArgText(source, decl, argument, spec, paramName, typeChecker, fileInfo)
			if diag != nil {
				return nil, diag
			}
			texts = append(texts, text)
		}
		return texts, nil
	}
	baseArgs, diag := argTexts(base)
	if diag != nil {
		return nil, diag
	}
	entry := &drizzleEntry{fn: helperFn, chain: []drizzleEntryChain{{method: "", argsType: baseArgs}}}
	for _, link := range links {
		linkArgs, diag := argTexts(link.Call)
		if diag != nil {
			return nil, diag
		}
		entry.chain = append(entry.chain, drizzleEntryChain{method: link.Method, argsType: linkArgs})
	}
	return entry, nil
}

// ── reflected graph → spec (type form) ───────────────────────────────────────

// specFromGraph reads the table spec off the reflected graph, the Go mirror of fromType.ts; deps collects derived const names.
func specFromGraph(resolved *resolvedDecl, decl *declaration, spelling *drizzleSpelling, tableFn string, fileInfo *drizzleFileInfo, deps drizzleDeps) (*drizzleTableSpec, *Diagnostic) {
	sqlSpelling := fileInfo.sqlSpelling
	deref := func(node *reflection.RunType) *reflection.RunType {
		if node != nil && node.Kind == reflection.KindRef {
			return resolved.Resolve(node.ID)
		}
		return node
	}
	// properties lists a node's property children DEREFERENCED, child slots in the serialized graph
	// being `{kind:-1, id}` sentinels. Flat, because a table type is one object: the metadata, which
	// each dialect's interface extends.
	var properties func(node *reflection.RunType) []*reflection.RunType
	properties = func(node *reflection.RunType) []*reflection.RunType {
		node = deref(node)
		if node == nil {
			return nil
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
	if member(root, sentinelTable) == nil {
		return nil, drizzleRefuse(decl, "the declared type carries no table metadata")
	}
	meta := root
	nameNode := member(meta, "name")
	if nameNode == nil || nameNode.Kind != reflection.KindLiteral {
		return nil, drizzleRefuse(decl, "the table name is not a string literal")
	}
	tableName, _ := nameNode.Literal.(string)
	columnsNode := member(meta, "columns")
	if columnsNode == nil {
		return nil, drizzleRefuse(decl, "the table type has no columns record")
	}
	// The db names that differ from the record key, off the table's names map.
	dbNames := map[string]string{}
	for _, nameMember := range properties(member(meta, "names")) {
		if valueNode := deref(nameMember.Child); valueNode != nil && valueNode.Kind == reflection.KindLiteral {
			if dbName, isString := valueNode.Literal.(string); isString && dbName != nameMember.Name {
				dbNames[nameMember.Name] = dbName
			}
		}
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
		column := drizzleColumn{key: columnMember.Name, name: dbNames[columnMember.Name]}
		fnNode := member(specNode, "fn")
		if fnNode == nil || fnNode.Kind != reflection.KindLiteral {
			return nil, drizzleRefuse(decl, "column %q has no builder fn literal", columnMember.Name)
		}
		column.fn, _ = fnNode.Literal.(string)
		if column.fn == "enum" || column.fn == "custom" {
			return nil, drizzleRefuse(decl, "column %q is a %s column, which has no type twin: its builder needs a runtime handle, keep this table on the builders road", columnMember.Name, column.fn)
		}
		// A modifier key is recognized BEFORE its value is read: $type carries a type with no literal value.
		for _, propMember := range properties(member(specNode, "config")) {
			propName := propMember.Name
			valueNode := deref(propMember.Child)
			if valueNode == nil {
				return nil, drizzleRefuse(decl, "column %q: malformed prop %q", columnMember.Name, propName)
			}
			if !IsDrizzleModName(propName) {
				value, diag := literalText(valueNode, columnMember.Name+"."+propName)
				if diag != nil {
					return nil, diag
				}
				column.props = append(column.props, drizzleProp{key: propName, value: value})
				continue
			}
			prop := drizzleProp{key: propName, isMod: true}
			switch {
			case propName == "$type":
				return nil, drizzleRefuse(decl, "column %q: the $type override has no builders spelling convert can print — keep this table on the type road", columnMember.Name)
			case propName == "references":
				if valueNode.Kind != reflection.KindTuple || len(valueNode.Children) == 0 {
					return nil, drizzleRefuse(decl, "column %q: malformed references prop", columnMember.Name)
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
				prop.isReference = true
				prop.refTable, _ = refTableNode.Literal.(string)
				prop.refColumn, _ = refColumnNode.Literal.(string)
				if len(valueNode.Children) > 1 {
					actionsMember := deref(valueNode.Children[1])
					actionsText, diag := literalText(actionsMember.Child, columnMember.Name+".references.actions")
					if diag != nil {
						return nil, diag
					}
					prop.refActions = actionsText
				}
			case IsDrizzleRuntimeMod(propName):
				// The callback text is read off the paired const's options.runtime afterwards.
				if valueNode.Kind != reflection.KindLiteral {
					return nil, drizzleRefuse(decl, "column %q: malformed runtime flag %q", columnMember.Name, propName)
				}
				prop.isRuntime = true
			case valueNode.Kind == reflection.KindLiteral:
			case valueNode.Kind == reflection.KindTuple:
				for i, rawTupleMember := range valueNode.Children {
					tupleMember := deref(rawTupleMember)
					if tupleMember == nil {
						return nil, drizzleRefuse(decl, "column %q: prop %q has a missing arg node", columnMember.Name, propName)
					}
					argText, diag := literalText(tupleMember.Child, fmt.Sprintf("%s.%s[%d]", columnMember.Name, propName, i))
					if diag != nil {
						return nil, diag
					}
					prop.args = append(prop.args, argText)
				}
			default:
				return nil, drizzleRefuse(decl, "column %q: prop %q carries neither a flag nor an args tuple", columnMember.Name, propName)
			}
			column.props = append(column.props, prop)
		}
		spec.columns = append(spec.columns, column)
	}
	// Table-level extras, rendered in builders mode: {col} → t.<key>, {table, col} → tableRef(<const>, '<key>').
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
				target, known := fileInfo.constForTableName(refTableName, decl)
				targetConst := ""
				if known {
					targetConst = fileInfo.constNameOf(target, deps)
				}
				if targetConst == "" {
					return "", drizzleRefuse(decl, "%s: references table %q is not declared where this table can see it", where, refTableName)
				}
				return fileInfo.rootSpelling().spellValue("tableRef") + "(" + targetConst + ", " + quoteSingle(key) + ")", nil
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

// drizzleExports enumerates the dialect module's exported names by walking its source statements,
// following relative re-exports, from the module node's symbol. Same walk the manifest generator
// uses, and syntactic so type-only exports count too.
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

// collectModuleExports gathers a module's exported names, recursing through RELATIVE re-exports
// only, a bare one being another package's surface.
func collectModuleExports(prog *program.Program, modulePath string, names map[string]bool, visited map[string]bool) {
	if modulePath == "" || visited[modulePath] {
		return
	}
	visited[modulePath] = true
	moduleFile := prog.SourceFile(modulePath)
	if moduleFile == nil {
		return
	}
	// A relative re-export names a MODULE while the program holds FILES: source spells
	// `./columns.ts`, a published .d.ts spells `./columns.js` beside a `columns.d.ts`, and a
	// directory import means its index. Try each, or the walk stops at the entry file, the module
	// looks empty, and every column type loses its spelling against a published package.
	relativeTarget := func(moduleSpecifier *ast.Node) string {
		specifierText := moduleSpecifier.Text()
		if !strings.HasPrefix(specifierText, "./") && !strings.HasPrefix(specifierText, "../") {
			return ""
		}
		joined := filepath.ToSlash(filepath.Join(filepath.Dir(modulePath), filepath.FromSlash(specifierText)))
		candidates := []string{joined}
		if trimmed, isJS := strings.CutSuffix(joined, ".js"); isJS {
			candidates = append(candidates, trimmed+".d.ts", trimmed+".ts")
		}
		// The published .d.ts keeps the SOURCE specifier while the file beside it is
		// `columns.d.ts`; getting this case wrong costs every column type its spelling.
		if trimmed, isTS := strings.CutSuffix(joined, ".ts"); isTS && !strings.HasSuffix(joined, ".d.ts") {
			candidates = append(candidates, trimmed+".d.ts", trimmed+".js")
		}
		if !strings.HasSuffix(joined, ".ts") && !strings.HasSuffix(joined, ".js") {
			candidates = append(candidates, joined+".d.ts", joined+".ts", joined+"/index.d.ts", joined+"/index.ts")
		}
		for _, candidate := range candidates {
			if prog.SourceFile(candidate) != nil {
				return candidate
			}
		}
		return joined
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
				// Star re-export: only a relative target can be enumerated.
				if target != "" {
					collectModuleExports(prog, target, names, visited)
				}
				continue
			}
			// A named re-export counts whatever its specifier, the names being spelled right here:
			// the dialect packages re-export the shared carriers this way.
			for _, specifier := range exportDeclaration.ExportClause.AsNamedExports().Elements.Nodes {
				if nameNode := specifier.Name(); nameNode != nil {
					names[nameNode.Text()] = true
				}
			}
		}
	}
}

// ── printers ─────────────────────────────────────────────────────────────────

// referenceTarget finds a reference's table: by the const the builders form names, else by the graph's DB name.
func (info *drizzleFileInfo) referenceTarget(prop drizzleProp, decl *declaration) (drizzleTableRef, bool) {
	if prop.refConst != "" {
		return info.lookup(decl, func(ref drizzleTableRef) bool { return ref.constName == prop.refConst })
	}
	return info.constForTableName(prop.refTable, decl)
}

// typeProps spells a column's ONE type argument, the props object, or "" when it has no props.
func typeProps(column drizzleColumn, decl *declaration, fileInfo *drizzleFileInfo, deps drizzleDeps) (string, *Diagnostic) {
	var members []string
	for _, prop := range column.props {
		switch {
		case !prop.isMod:
			members = append(members, prop.key+": "+prop.value)
		case prop.isReference:
			target, known := fileInfo.referenceTarget(prop, decl)
			if !known {
				return "", drizzleRefuse(decl, "column %q: references table %q is not declared where this table can see it", column.key, prop.refTable)
			}
			// A self-reference names the table by its db name: its own alias is still being declared.
			tableArg := quoteSingle(prop.refTable)
			if target.decl != decl {
				if tableArg = fileInfo.typeNameOf(target, deps); tableArg == "" {
					return "", drizzleRefuse(decl, "column %q: references table %q, which has no type name to spell", column.key, prop.refTable)
				}
			}
			ref := fileInfo.rootSpelling().spellType("TableRef") + "<" + tableArg + ", " + quoteSingle(prop.refColumn) + ">"
			if prop.refActions != "" {
				ref += ", " + prop.refActions
			}
			members = append(members, "references: ["+ref+"]")
		case prop.isRuntime:
			// The callback moves into the const's options.runtime, never the type.
			members = append(members, prop.key+": true")
		default:
			members = append(members, prop.key+": "+modPropValue(prop.args, ", "))
		}
	}
	if len(members) == 0 {
		return "", nil
	}
	return "{" + strings.Join(members, "; ") + "}", nil
}

// namesText is the table type's names map argument, the db names that differ from the record key.
func namesText(spec *drizzleTableSpec) string {
	var members []string
	for _, column := range spec.columns {
		if column.name != "" {
			members = append(members, column.key+": "+quoteSingle(column.name))
		}
	}
	if len(members) == 0 {
		return ""
	}
	return "{" + strings.Join(members, "; ") + "}"
}

// printDrizzleType renders the canonical type-form pair from a spec.
func printDrizzleType(spec *drizzleTableSpec, decl *declaration, typeName, constName string, exports map[string]bool, fileInfo *drizzleFileInfo, deps drizzleDeps) (*printedDecl, *Diagnostic) {
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
		text := spec.spelling.spellType(columnTypeName)
		props, diag := typeProps(column, decl, fileInfo, deps)
		if diag != nil {
			return nil, diag
		}
		if props != "" {
			text += "<" + props + ">"
		}
		columns = append(columns, "  "+column.key+": "+text+";")
	}
	if !exports["tableFromType"] {
		return nil, drizzleRefuse(decl, "the dialect module exports no tableFromType")
	}
	// The options object, canonical layout: `tables` first, evaluated EAGERLY at the const, so the
	// referenced table must be declared earlier in the file where the builders road's closure was
	// lazy; then `runtime`, the callbacks in column and props order.
	var optionParts []string
	if len(spec.refTables) > 0 {
		var tableEntries []string
		for _, refTableName := range spec.refTables {
			target, known := fileInfo.constForTableName(refTableName, decl)
			if refConst := spec.refConsts[refTableName]; refConst != "" {
				target, known = fileInfo.lookup(decl, func(ref drizzleTableRef) bool { return ref.constName == refConst })
			}
			targetConst := ""
			if known {
				targetConst = fileInfo.constNameOf(target, deps)
			}
			if targetConst == "" {
				return nil, drizzleRefuse(decl, "references table %q is not declared where this table can see it", refTableName)
			}
			key := refTableName
			if !isPlainIdentifier(key) {
				key = quoteSingle(key)
			}
			// A table declared LATER in the file cannot be read at the bridge call, so it rides a
			// thunk, the laziness drizzle's own `references: () => cities.id` has. A backward
			// reference stays the plain value, so a file that never needed the thunk keeps its
			// spelling.
			value := targetConst
			if target.pos >= decl.Stmt.Pos() {
				value = "() => " + targetConst
			}
			tableEntries = append(tableEntries, key+": "+value)
		}
		optionParts = append(optionParts, "tables: {"+strings.Join(tableEntries, ", ")+"}")
	}
	var runtimeEntries []string
	for _, column := range spec.columns {
		var callbackParts []string
		for _, prop := range column.props {
			if prop.isRuntime && len(prop.args) == 1 {
				callbackParts = append(callbackParts, prop.key+": "+prop.args[0])
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
					links = append(links, link.method+": "+modPropValue(link.argsType, ", "))
				}
				text += ", {" + strings.Join(links, ", ") + "}"
			}
			text += ">"
			entries = append(entries, "  "+text+",")
		}
		extrasText = ", [\n" + strings.Join(entries, "\n") + "\n]"
	}
	// The names map is the fourth argument, so a table with names and no extras passes `[]` for them.
	if names := namesText(spec); names != "" {
		if extrasText == "" {
			extrasText = ", []"
		}
		extrasText += ", " + names
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
	attachRootSpelling(fileInfo, &printed.needs)
	printed.text = fmt.Sprintf("%stype %s = %s<%s, {\n%s\n}%s>;\n%sconst %s = %s<%s>(%s);",
		exportPrefix, typeName, tableTypeText, quoteSingle(spec.tableName), strings.Join(columns, "\n"), extrasText,
		constPrefix, constName, bridgeText, typeName, optionsText)
	return printed, nil
}

// isPlainIdentifier reports whether the text can stand as an unquoted object key.
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

// builderProps spells a column's props object for its builder call, or "" when it has no props.
func builderProps(column drizzleColumn, decl *declaration, constName string, fileInfo *drizzleFileInfo, deps drizzleDeps) (string, *Diagnostic) {
	var members []string
	for _, prop := range column.props {
		switch {
		case !prop.isMod:
			members = append(members, prop.key+": "+prop.value)
		case prop.isReference:
			target, known := fileInfo.referenceTarget(prop, decl)
			targetConst := ""
			if known {
				targetConst = fileInfo.constNameOf(target, deps)
			}
			if targetConst == "" && known {
				return "", drizzleRefuse(decl, "references table %q, which did not convert, so it has no const to call", prop.refTable)
			}
			if targetConst == "" {
				return "", drizzleRefuse(decl, "references table %q is not declared in this file", prop.refTable)
			}
			root := fileInfo.rootSpelling()
			// A self-reference needs a return annotation: TS cannot infer a table inside its own initializer (TS7022).
			returnType := ""
			if targetConst == constName {
				returnType = ": " + root.spellType("TableRef") + "<" + quoteSingle(prop.refTable) + ", " + quoteSingle(prop.refColumn) + ">"
			}
			ref := "()" + returnType + " => " + root.spellValue("tableRef") + "(" + targetConst + ", " + quoteSingle(prop.refColumn) + ")"
			if prop.refActions != "" {
				ref += ", " + prop.refActions
			}
			members = append(members, "references: ["+ref+"]")
		default:
			// A runtime modifier's args[0] is its callback, filled from options.runtime.
			members = append(members, prop.key+": "+modPropValue(prop.args, ", "))
		}
	}
	if len(members) == 0 {
		return "", nil
	}
	return "{" + strings.Join(members, ", ") + "}", nil
}

// printDrizzleBuilders renders the canonical builders-form pair from a spec.
func printDrizzleBuilders(spec *drizzleTableSpec, decl *declaration, typeName, constName string, exports map[string]bool, fileInfo *drizzleFileInfo, deps drizzleDeps) (*printedDecl, *Diagnostic) {
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
			args = append(args, quoteSingle(column.name))
		}
		props, diag := builderProps(column, decl, constName, fileInfo, deps)
		if diag != nil {
			return nil, diag
		}
		if props != "" {
			args = append(args, props)
		}
		columns = append(columns, "  "+column.key+": "+spec.spelling.spellValue(column.fn)+"("+strings.Join(args, ", ")+"),")
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
	attachRootSpelling(fileInfo, &printed.needs)
	printed.text = fmt.Sprintf("%sconst %s = %s(%s, {\n%s\n}%s);\n%stype %s = typeof %s;",
		exportPrefix, constName, tableFnText, quoteSingle(spec.tableName), strings.Join(columns, "\n"), extrasText,
		aliasPrefix, typeName, constName)
	return printed, nil
}

// readRuntimeCallbackTexts returns the verbatim callback texts per column key and method from the
// paired const's options argument; the explicit form's options ride after the runType, so the first
// OBJECT-LITERAL argument is the bag.
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

// fillRuntimeCallbacks pairs the graph's runtime flag props with the options.runtime callback texts
// both ways: a flag without a callback and a callback without a flag each refuse, naming the column
// and method.
func fillRuntimeCallbacks(spec *drizzleTableSpec, decl *declaration, source string) *Diagnostic {
	texts, diag := readRuntimeCallbackTexts(source, decl)
	if diag != nil {
		return diag
	}
	used := map[string]bool{}
	for columnIndex := range spec.columns {
		column := &spec.columns[columnIndex]
		for propIndex := range column.props {
			prop := &column.props[propIndex]
			if !prop.isRuntime {
				continue
			}
			text := texts[column.key][prop.key]
			if text == "" {
				return drizzleRefuse(decl, "column %q carries the %s flag but the const's options.runtime has no matching callback", column.key, prop.key)
			}
			prop.args = []string{text}
			used[column.key+"."+prop.key] = true
		}
	}
	for columnKey, methods := range texts {
		for method := range methods {
			if !used[columnKey+"."+method] {
				return drizzleRefuse(decl, "options.runtime.%s.%s has no matching %s flag on the column type", columnKey, method, method)
			}
		}
	}
	return nil
}

// ── the conversion entry (called from ConvertFile) ───────────────────────────

// drizzlePlan is one declaration's replacement; deps are the tables whose derived pair name it prints.
type drizzlePlan struct {
	decl    *declaration
	printed *printedDecl
	deps    drizzleDeps
}

// drizzleDeps are tables a reference named by the pair name this run derives, which exists only if they convert too.
type drizzleDeps map[*declaration]bool

// settleDrizzlePlans re-prints a plan that named a table by a derived pair name its table did not get: a
// builders const is still `typeof <const>`, anything else withdraws the plan. Repeats to a fixpoint.
func settleDrizzlePlans(plans []drizzlePlan, absPath string, info *drizzleFileInfo, reconvert func(decl *declaration) (*drizzlePlan, *Diagnostic)) ([]drizzlePlan, []Diagnostic) {
	var diags []Diagnostic
	for {
		converted := map[*declaration]bool{}
		for _, plan := range plans {
			converted[plan.decl] = true
		}
		kept := plans[:0]
		changed := false
		for _, plan := range plans {
			stale := false
			for dep := range plan.deps {
				if !converted[dep] {
					info.unconverted[dep] = true
					stale = true
				}
			}
			if !stale {
				kept = append(kept, plan)
				continue
			}
			changed = true
			settled, diag := reconvert(plan.decl)
			if diag != nil {
				diag.File = absPath
				diags = append(diags, *diag)
				continue
			}
			kept = append(kept, *settled)
		}
		plans = kept
		if !changed {
			return plans, diags
		}
	}
}

// drizzleFileInfo carries the per-file lookups the drizzle arm shares across declarations: the
// const↔table-name maps, the declaration position per table name for the declared-earlier check,
// and the slim sql binding.
type drizzleFileInfo struct {
	spellings *drizzleSpellings
	// names is the file's table and baseTaken the names visible everywhere in it, from which a
	// nested scope's own table is derived on demand and cached.
	names       *nameTable
	baseTaken   map[string]bool
	scopedNames map[*ast.Node]*nameTable
	// tables is every drizzle table the file declares, in source order, WITH its scope. A flat name
	// map cannot serve a file declaring one 'cities' at the top level and another inside a test
	// body: a reference must reach the one its own scope can see.
	tables      []drizzleTableRef
	sqlSpelling string
	// derived is each converting table's pair name, claimed once so an earlier reference agrees with it;
	// unconverted are the tables that did not get theirs.
	target      Target
	derived     map[*declaration]string
	unconverted map[*declaration]bool
}

// drizzleTableRef is one declared table, as a reference target.
type drizzleTableRef struct {
	tableName string
	constName string
	decl      *declaration
	pos       int
	scope     *ast.Node // nil at the top level
}

// visibleFrom reports whether a declaration in `from` can name this table: it is top level, or its
// block contains the declaration.
func (ref drizzleTableRef) visibleFrom(from *declaration) bool {
	if ref.scope == nil {
		return true
	}
	if from == nil || from.Stmt == nil {
		return false
	}
	return ref.scope.Pos() <= from.Stmt.Pos() && from.Stmt.End() <= ref.scope.End()
}

// lookup returns the INNERMOST visible table matching pick, as name resolution itself works.
func (info *drizzleFileInfo) lookup(from *declaration, pick func(drizzleTableRef) bool) (drizzleTableRef, bool) {
	var best drizzleTableRef
	var found bool
	for _, ref := range info.tables {
		if !pick(ref) || !ref.visibleFrom(from) {
			continue
		}
		if !found || scopeDepth(ref.scope) >= scopeDepth(best.scope) {
			best, found = ref, true
		}
	}
	return best, found
}

// scopeDepth counts a scope's enclosing blocks, so "innermost" is comparable.
func scopeDepth(scope *ast.Node) int {
	depth := 0
	for node := scope; node != nil; node = node.Parent {
		if node.CanHaveStatements() {
			depth++
		}
	}
	return depth
}

// tableNameForConst resolves a const name a reference spelled to the DB table it names, in the scope
// doing the naming.
func (info *drizzleFileInfo) tableNameForConst(constName string, from *declaration) (string, bool) {
	ref, found := info.lookup(from, func(ref drizzleTableRef) bool { return ref.constName == constName })
	if !found {
		return "", false
	}
	return ref.tableName, true
}

// constForTableName is the reverse: which table holds a DB name and where it was declared, which the
// type road's tables option needs because it reads eagerly unless thunked.
func (info *drizzleFileInfo) constForTableName(tableName string, from *declaration) (drizzleTableRef, bool) {
	return info.lookup(from, func(ref drizzleTableRef) bool { return ref.tableName == tableName })
}

// typeNameOf is the type a reference to this table spells: its own, else the derived one deps records.
func (info *drizzleFileInfo) typeNameOf(ref drizzleTableRef, deps drizzleDeps) string {
	if ref.decl == nil {
		return ""
	}
	if ref.decl.Name != "" {
		return ref.decl.Name
	}
	if ref.decl.Form == info.target {
		return ""
	}
	if info.unconverted[ref.decl] {
		return "typeof " + ref.constName
	}
	deps[ref.decl] = true
	return info.pairName(ref.decl)
}

// constNameOf is the const a reference to this table calls, the typeNameOf twin.
func (info *drizzleFileInfo) constNameOf(ref drizzleTableRef, deps drizzleDeps) string {
	if ref.constName != "" {
		return ref.constName
	}
	if ref.decl == nil || ref.decl.Form == info.target || info.unconverted[ref.decl] {
		return ""
	}
	deps[ref.decl] = true
	return info.pairName(ref.decl)
}

// pairName is the claimed-once name of a converting table's missing half.
func (info *drizzleFileInfo) pairName(decl *declaration) string {
	if name, ok := info.derived[decl]; ok {
		return name
	}
	name := ""
	if decl.Form == TargetBuilders {
		name = info.namesFor(decl).deriveDrizzleTypeName(decl.ConstName)
	} else {
		name = info.namesFor(decl).deriveDrizzleConstName(decl.Name)
	}
	info.derived[decl] = name
	return name
}

const drizzleRootModule = "@mionjs/drizzle-orm"

// rootSpelling names @mionjs/drizzle-orm's exports; only called while printing, registering the module is what makes its bindings removable.
func (info *drizzleFileInfo) rootSpelling() *drizzleSpelling {
	return info.spellings.forModule(drizzleRootModule)
}

// attachRootSpelling hands the root module's claimed bindings to the planner when the file registered it.
func attachRootSpelling(info *drizzleFileInfo, needs *importNeeds) {
	if info == nil || info.spellings == nil {
		return
	}
	if spelling, ok := info.spellings.byModule[drizzleRootModule]; ok {
		spelling.attach(needs)
	}
}

// buildDrizzleFileInfo scans the recognized declarations once per file.
func buildDrizzleFileInfo(decls []*declaration, imports *importScan, names *nameTable, baseTaken map[string]bool, used map[string]bool, target Target) *drizzleFileInfo {
	info := &drizzleFileInfo{
		spellings:   newDrizzleSpellings(imports, names, used),
		names:       names,
		baseTaken:   baseTaken,
		scopedNames: map[*ast.Node]*nameTable{},
		target:      target,
		derived:     map[*declaration]string{},
		unconverted: map[*declaration]bool{},
	}
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
		// A standalone type claims its table name with an empty const; pairName derives one.
		info.tables = append(info.tables, drizzleTableRef{tableName: tableName, constName: decl.ConstName, decl: decl, pos: decl.Stmt.Pos(), scope: decl.Scope})
	}
	if imports != nil {
		if local := imports.LocalFor(drizzleRootModule, "sql"); local != "" {
			info.sqlSpelling = local
		} else if alias := imports.NamespaceAlias(drizzleRootModule); alias != "" {
			info.sqlSpelling = alias + ".sql"
		}
		// A reference helper the converted form no longer spells must be dropped, or neither form is a fixpoint.
		if imports.LocalFor(drizzleRootModule, "tableRef") != "" || imports.LocalFor(drizzleRootModule, "TableRef") != "" {
			info.spellings.forModule(drizzleRootModule)
		}
	}
	return info
}

// namesFor is the table a declaration's pair names are claimed against: the file's own at the top
// level, a scope-local one, file names plus that block's, for a nested declaration.
func (info *drizzleFileInfo) namesFor(decl *declaration) *nameTable {
	if decl.Scope == nil {
		return info.names
	}
	if cached, ok := info.scopedNames[decl.Scope]; ok {
		return cached
	}
	scoped := info.names.forScope(info.baseTaken, declaredNamesIn(decl.Scope))
	info.scopedNames[decl.Scope] = scoped
	return scoped
}

// declaredNamesIn lists what one block declares directly, enough to keep a claimed pair name from
// colliding with a sibling in the same scope.
func declaredNamesIn(scope *ast.Node) map[string]bool {
	names := map[string]bool{}
	add := func(nameNode *ast.Node) {
		if nameNode != nil && ast.IsIdentifier(nameNode) {
			names[nameNode.Text()] = true
		}
	}
	for _, statement := range scope.Statements() {
		if statement == nil {
			continue
		}
		if ast.IsVariableStatement(statement) {
			for _, declarator := range statement.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes {
				add(declarator.Name())
			}
			continue
		}
		add(statement.Name())
	}
	return names
}

// convertDrizzleDecl converts one recognized drizzle declaration to the target form's pair.
func convertDrizzleDecl(prog *program.Program, typeChecker *checker.Checker, cache *runtype.Cache, source string, decl *declaration, fileInfo *drizzleFileInfo) (*drizzlePlan, *Diagnostic) {
	deps := drizzleDeps{}
	if decl.Form == TargetBuilders {
		// builders → type: the spec lives in the call AST.
		spec, moduleNode, diag := specFromBuildersAST(source, decl, typeChecker, fileInfo)
		if diag != nil {
			return nil, diag
		}
		exports, _ := drizzleExports(prog, typeChecker, moduleNode)
		if exports == nil {
			return nil, drizzleRefuse(decl, "cannot resolve the dialect module %q", spec.spelling.module)
		}
		typeName := decl.Name
		if typeName == "" {
			if typeName = fileInfo.pairName(decl); typeName == "" {
				return nil, drizzleRefuse(decl, "no free type name for the pair")
			}
		}
		printed, diag := printDrizzleType(spec, decl, typeName, decl.ConstName, exports, fileInfo, deps)
		if diag != nil {
			return nil, diag
		}
		return &drizzlePlan{decl: decl, printed: printed, deps: deps}, nil
	}
	// type → builders: the spec lives in the reflected graph, and the alias and table type come from
	// the alias declaration's type reference.
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
	spec, diag := specFromGraph(resolved, decl, spelling, tableFn, fileInfo, deps)
	if diag != nil {
		return nil, diag
	}
	if runtimeDiag := fillRuntimeCallbacks(spec, decl, source); runtimeDiag != nil {
		return nil, runtimeDiag
	}
	constName := decl.ConstName
	if constName == "" {
		if constName = fileInfo.pairName(decl); constName == "" {
			return nil, drizzleRefuse(decl, "no free const name for the pair")
		}
	}
	printed, diag := printDrizzleBuilders(spec, decl, decl.Name, constName, exports, fileInfo, deps)
	if diag != nil {
		return nil, diag
	}
	return &drizzlePlan{decl: decl, printed: printed, deps: deps}, nil
}
