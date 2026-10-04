package apitypes

import (
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/scanner"
)

type itemKind int

const (
	// itemDeclaration is a top-level declaration statement, kept whole so its members, and so its ids, stay.
	itemDeclaration itemKind = iota
	// itemAlways is a `declare global` or `declare module` block: nothing names it, yet it changes the types used.
	itemAlways
	itemImport      // one binding of an import statement
	itemExportLocal // one specifier of `export {a as b}`
	itemReExport    // one specifier of `export {a as b} from './x'`
	itemExportStar  // `export * from './x'`
	itemExportEmpty // `export {}`: keeps a file a module
	itemMember      // one statement of a `declare global` or a relative `declare module` block, kept on its own
)

// item is the unit kept or dropped.
type item struct {
	file      *fileInfo
	kind      itemKind
	statement *ast.Node
	node      *ast.Node // the specifier, for an import or export binding
	names     []string  // local names a declaration or import binding declares
	// exportedName is the name this item makes the file export, "" when none.
	exportedName string
	// specifier and importedName name the module side of an import or re-export ("*" for a namespace).
	specifier    string
	importedName string
	localName    string // the local an `export {a as b}` points at
	kept         bool
	block        *item // the block an itemMember belongs to
	// users are the kept items that use this one.
	users []*item
}

func (current *item) label() string {
	if len(current.names) > 0 {
		return strings.Join(current.names, ",")
	}
	if current.exportedName != "" {
		return current.exportedName
	}
	return current.specifier
}

func (current *item) isExportProvider() bool {
	return current.exportedName != "" && current.kind != itemImport
}

// fileInfo is one emitted .d.ts and its items.
type fileInfo struct {
	path   string
	source *ast.SourceFile
	text   string
	items  []*item
	locals map[string][]*item
	// holes are cut ranges inside kept statements: private and raw middleware members.
	holes     []textRange
	cutLabels []string
	// publicApiArgs are the type arguments of `PublicApi<…>` references, where a routes object may be named.
	publicApiArgs []textRange
	// imported: a kept side-effect import names this file, so it ships even with nothing else kept.
	imported bool
}

// textRange is a cut range; text, when set, is written in its place.
type textRange struct {
	start, end int
	text       string
}

func newFileInfo(path string, source *ast.SourceFile) *fileInfo {
	file := &fileInfo{path: path, source: source, text: source.Text(), locals: map[string][]*item{}}
	for _, statement := range source.Statements.Nodes {
		file.addStatement(statement)
	}
	return file
}

func (file *fileInfo) add(current *item) {
	current.file = file
	file.items = append(file.items, current)
	for _, name := range current.names {
		file.locals[name] = append(file.locals[name], current)
	}
}

func (file *fileInfo) addStatement(statement *ast.Node) {
	switch statement.Kind {
	case ast.KindImportDeclaration:
		file.addImport(statement)
	case ast.KindExportDeclaration:
		file.addExport(statement)
	case ast.KindExportAssignment:
		assignment := statement.AsExportAssignment()
		exported := "default"
		if assignment.IsExportEquals {
			exported = "export="
		}
		file.add(&item{kind: itemDeclaration, statement: statement, exportedName: exported})
	case ast.KindModuleDeclaration:
		if isMemberBlock(statement) {
			file.addMemberBlock(statement)
			return
		}
		if statement.Name().Kind == ast.KindStringLiteral {
			file.add(&item{kind: itemAlways, statement: statement})
			return
		}
		file.addDeclaration(statement)
	default:
		file.addDeclaration(statement)
	}
}

// isMemberBlock: a `declare global` or a `declare module './x'` block, whose statements are kept one by one.
func isMemberBlock(statement *ast.Node) bool {
	return ast.IsGlobalScopeAugmentation(statement) || strings.HasPrefix(relativeAugmentation(statement), ".")
}

// relativeAugmentation is the specifier a `declare module 'x'` block augments, "" for any other statement.
func relativeAugmentation(statement *ast.Node) string {
	if statement.Kind != ast.KindModuleDeclaration || statement.Name().Kind != ast.KindStringLiteral {
		return ""
	}
	return statement.Name().Text()
}

// addMemberBlock adds a member block and one item per statement in it; their names stay out of file.locals.
func (file *fileInfo) addMemberBlock(statement *ast.Node) {
	block := &item{kind: itemAlways, statement: statement}
	file.add(block)
	body := statement.AsModuleDeclaration().Body
	if body == nil || body.Kind != ast.KindModuleBlock {
		return
	}
	for _, inner := range body.AsModuleBlock().Statements.Nodes {
		file.items = append(file.items, &item{kind: itemMember, statement: inner, block: block, file: file, names: statementNames(inner)})
	}
}

// statementNames lists the names a declaration statement declares.
func statementNames(statement *ast.Node) []string {
	if statement.Kind != ast.KindVariableStatement {
		if name := statement.Name(); name != nil && ast.IsIdentifier(name) {
			return []string{name.Text()}
		}
		return nil
	}
	var names []string
	for _, variable := range statement.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes {
		names = append(names, bindingNames(variable.Name())...)
	}
	return names
}

func (file *fileInfo) addDeclaration(statement *ast.Node) {
	declaration := &item{kind: itemDeclaration, statement: statement, names: statementNames(statement)}
	flags := ast.GetCombinedModifierFlags(statement)
	if flags&ast.ModifierFlagsExport != 0 && len(declaration.names) > 0 {
		if flags&ast.ModifierFlagsDefault != 0 {
			declaration.exportedName = "default"
		} else {
			// One item may export several names (`export declare const a: A, b: B`); each is provided by this item.
			for _, name := range declaration.names[1:] {
				file.add(&item{kind: itemDeclaration, statement: statement, exportedName: name, names: nil, localName: declaration.names[0]})
			}
			declaration.exportedName = declaration.names[0]
		}
	}
	file.add(declaration)
}

func bindingNames(name *ast.Node) []string {
	if name == nil {
		return nil
	}
	if ast.IsIdentifier(name) {
		return []string{name.Text()}
	}
	var out []string
	name.ForEachChild(func(child *ast.Node) bool {
		if child.Kind == ast.KindBindingElement {
			out = append(out, bindingNames(child.Name())...)
		}
		return false
	})
	return out
}

func (file *fileInfo) addImport(statement *ast.Node) {
	declaration := statement.AsImportDeclaration()
	specifier := moduleText(declaration.ModuleSpecifier)
	clause := declaration.ImportClause
	if clause == nil {
		// A side-effect import loads globals; keep it with the file.
		file.add(&item{kind: itemAlways, statement: statement, specifier: specifier})
		return
	}
	if name := clause.Name(); name != nil {
		file.add(&item{kind: itemImport, statement: statement, node: name, names: []string{name.Text()}, specifier: specifier, importedName: "default"})
	}
	bindings := clause.AsImportClause().NamedBindings
	if bindings == nil {
		return
	}
	if bindings.Kind == ast.KindNamespaceImport {
		name := bindings.Name()
		file.add(&item{kind: itemImport, statement: statement, node: bindings, names: []string{name.Text()}, specifier: specifier, importedName: "*"})
		return
	}
	for _, element := range bindings.AsNamedImports().Elements.Nodes {
		spec := element.AsImportSpecifier()
		imported := element.Name().Text()
		if spec.PropertyName != nil {
			imported = spec.PropertyName.Text()
		}
		file.add(&item{kind: itemImport, statement: statement, node: element, names: []string{element.Name().Text()}, specifier: specifier, importedName: imported})
	}
}

func (file *fileInfo) addExport(statement *ast.Node) {
	declaration := statement.AsExportDeclaration()
	specifier := ""
	if declaration.ModuleSpecifier != nil {
		specifier = moduleText(declaration.ModuleSpecifier)
	}
	clause := declaration.ExportClause
	switch {
	case clause == nil:
		file.add(&item{kind: itemExportStar, statement: statement, specifier: specifier, importedName: "*"})
	case clause.Kind == ast.KindNamespaceExport:
		file.add(&item{kind: itemReExport, statement: statement, node: clause, specifier: specifier, importedName: "*", exportedName: clause.Name().Text()})
	case len(clause.AsNamedExports().Elements.Nodes) == 0:
		file.add(&item{kind: itemExportEmpty, statement: statement})
	default:
		for _, element := range clause.AsNamedExports().Elements.Nodes {
			spec := element.AsExportSpecifier()
			exported := element.Name().Text()
			source := exported
			if spec.PropertyName != nil {
				source = spec.PropertyName.Text()
			}
			if specifier == "" {
				file.add(&item{kind: itemExportLocal, statement: statement, node: element, exportedName: exported, localName: source})
			} else {
				file.add(&item{kind: itemReExport, statement: statement, node: element, exportedName: exported, specifier: specifier, importedName: source})
			}
		}
	}
}

func moduleText(node *ast.Node) string {
	if node != nil && ast.IsStringLiteralLike(node) {
		return node.Text()
	}
	return ""
}

// anyKept: some item of the file is kept, an augmentation included.
func (file *fileInfo) anyKept() bool {
	for _, current := range file.items {
		if current.kept {
			return true
		}
	}
	return false
}

// keptAny: some item of the file other than an augmentation, a global or `export {}` is kept.
func (file *fileInfo) keptAny() bool {
	for _, current := range file.items {
		if current.kept && current.kind != itemAlways && current.kind != itemMember && current.kind != itemExportEmpty {
			return true
		}
	}
	return false
}

func (file *fileInfo) inHole(node *ast.Node) bool {
	for _, hole := range file.holes {
		if node.Pos() >= hole.start && node.End() <= hole.end {
			return true
		}
	}
	return false
}

// localRead is a local name a statement reads, with the member read off it (`ns.member`), "" when read bare.
type localRead struct{ name, member string }

// reads lists the locals a kept statement reads outside its holes, each with the member read off it.
func (current *item) reads(file *fileInfo) []localRead {
	if current.statement == nil || current.kind == itemExportEmpty {
		return nil
	}
	if current.localName != "" && current.kind == itemDeclaration {
		// A sibling export of a multi-name variable statement: the first name's item walks the statement.
		return []localRead{{name: current.localName}}
	}
	// Over-reading only keeps an extra declaration.
	seen := map[localRead]bool{}
	var out []localRead
	file.eachRead(current.statement, func(identifier *ast.Node, member string) {
		read := localRead{name: identifier.Text(), member: member}
		if !seen[read] {
			seen[read] = true
			out = append(out, read)
		}
	})
	return out
}

// eachRead visits each identifier node reads outside the file's holes, with the first member read off it.
func (file *fileInfo) eachRead(node *ast.Node, visit func(identifier *ast.Node, member string)) {
	if node == nil || file.inHole(node) {
		return
	}
	switch node.Kind {
	case ast.KindIdentifier:
		visit(node, "")
		return
	case ast.KindQualifiedName:
		if left := node.AsQualifiedName().Left; ast.IsIdentifier(left) {
			visit(left, node.AsQualifiedName().Right.Text())
		} else {
			file.eachRead(left, visit)
		}
		return
	case ast.KindPropertyAccessExpression:
		if expression := node.Expression(); ast.IsIdentifier(expression) {
			visit(expression, node.Name().Text())
		} else {
			file.eachRead(expression, visit)
		}
		return
	case ast.KindImportType:
		for _, argument := range node.TypeArguments() {
			file.eachRead(argument, visit)
		}
		return
	}
	skip := declaredName(node)
	node.ForEachChild(func(child *ast.Node) bool {
		if child != skip {
			file.eachRead(child, visit)
		}
		return false
	})
}

// declaredName is the name child a walk skips: a name a node declares, never one it reads.
func declaredName(node *ast.Node) *ast.Node {
	switch node.Kind {
	case ast.KindPropertySignature, ast.KindPropertyDeclaration, ast.KindMethodSignature, ast.KindMethodDeclaration,
		ast.KindGetAccessor, ast.KindSetAccessor, ast.KindEnumMember, ast.KindPropertyAssignment, ast.KindParameter,
		ast.KindTypeParameter, ast.KindNamedTupleMember, ast.KindBindingElement, ast.KindClassDeclaration,
		ast.KindInterfaceDeclaration, ast.KindTypeAliasDeclaration, ast.KindEnumDeclaration, ast.KindFunctionDeclaration,
		ast.KindModuleDeclaration, ast.KindVariableDeclaration, ast.KindShorthandPropertyAssignment:
		name := node.Name()
		if name != nil && name.Kind == ast.KindComputedPropertyName {
			return nil
		}
		if node.Kind == ast.KindShorthandPropertyAssignment {
			return nil
		}
		return name
	}
	return nil
}

type importTypeRef struct {
	specifier, name string
	node            *ast.Node // the specifier literal, for module resolution
}

// importTypes lists the `import("x").Y` types a kept statement reads, with Y's first segment.
func (current *item) importTypes(file *fileInfo) []importTypeRef {
	if current.statement == nil {
		return nil
	}
	var out []importTypeRef
	var walk func(node *ast.Node) bool
	walk = func(node *ast.Node) bool {
		if file.inHole(node) {
			return false
		}
		if node.Kind == ast.KindImportType {
			importType := node.AsImportTypeNode()
			specifier := ""
			var literalNode *ast.Node
			if literal := importType.Argument; literal != nil && literal.Kind == ast.KindLiteralType {
				literalNode = literal.AsLiteralTypeNode().Literal
				specifier = moduleText(literalNode)
			}
			name := "*"
			if qualifier := importType.Qualifier; qualifier != nil {
				for qualifier.Kind == ast.KindQualifiedName {
					qualifier = qualifier.AsQualifiedName().Left
				}
				name = qualifier.Text()
			}
			if specifier != "" {
				out = append(out, importTypeRef{specifier: specifier, name: name, node: literalNode})
			}
		}
		node.ForEachChild(walk)
		return false
	}
	walk(current.statement)
	return out
}

// render writes the kept statements as written, cut members left out; false when nothing was kept.
func (file *fileInfo) render() (string, bool) {
	if !file.anyKept() && !file.imported {
		return "", false
	}
	statements := file.source.Statements.Nodes
	var builder strings.Builder
	if len(statements) > 0 {
		// The file's leading trivia (a header, `/// <reference>` lines) stays with the file.
		builder.WriteString(file.text[:scanner.GetTokenPosOfNode(statements[0], file.source, false)])
	}
	isModule := false
	for index, statement := range statements {
		text := file.renderStatement(statement, index == 0)
		if text == "" {
			continue
		}
		if statement.Kind == ast.KindImportDeclaration || statement.Kind == ast.KindExportDeclaration || statement.Kind == ast.KindExportAssignment ||
			ast.GetCombinedModifierFlags(statement)&ast.ModifierFlagsExport != 0 {
			isModule = true
		}
		builder.WriteString(text)
	}
	// A dropped first statement leaves the next one's leading newline at the top.
	out := strings.TrimLeft(strings.TrimRight(builder.String(), " \t\r\n"), "\r\n") + "\n"
	if !isModule && ast.IsExternalModule(file.source) {
		out += "export {};\n"
	}
	return out, true
}

// renderStatement returns a statement's text when any of its items is kept, rebuilding a partly kept import or export list.
func (file *fileInfo) renderStatement(statement *ast.Node, first bool) string {
	var all, kept []*item
	for _, current := range file.items {
		if current.statement == statement {
			all = append(all, current)
			if current.kept {
				kept = append(kept, current)
			}
		}
	}
	start := statement.Pos()
	if first {
		start = scanner.GetTokenPosOfNode(statement, file.source, false)
	}
	switch {
	case len(all) > 0 && all[0].kind == itemExportEmpty:
		if !file.anyKept() && !file.imported {
			return ""
		}
		return file.text[start:statement.End()]
	case len(kept) == 0:
		return ""
	case len(kept) == len(all) || (statement.Kind != ast.KindImportDeclaration && statement.Kind != ast.KindExportDeclaration):
		return file.slice(start, statement.End())
	}
	return file.leading(start, statement) + file.rebuildList(statement, kept)
}

// slice returns text[start:end) with the holes inside it removed.
func (file *fileInfo) slice(start, end int) string {
	holes := append([]textRange(nil), file.holes...)
	sort.Slice(holes, func(i, j int) bool { return holes[i].start < holes[j].start })
	var builder strings.Builder
	cursor := start
	for _, hole := range holes {
		if hole.start < cursor || hole.end > end {
			continue
		}
		builder.WriteString(file.text[cursor:hole.start])
		builder.WriteString(hole.text)
		cursor = hole.end
	}
	builder.WriteString(file.text[cursor:end])
	return builder.String()
}

func (file *fileInfo) leading(start int, statement *ast.Node) string {
	return file.text[start:scanner.GetTokenPosOfNode(statement, file.source, false)]
}

// rebuildList writes an import or export statement with only its kept bindings, each as written.
func (file *fileInfo) rebuildList(statement *ast.Node, kept []*item) string {
	nodeText := func(node *ast.Node) string {
		return file.text[scanner.GetTokenPosOfNode(node, file.source, false):node.End()]
	}
	if statement.Kind == ast.KindImportDeclaration {
		declaration := statement.AsImportDeclaration()
		clause := declaration.ImportClause
		var defaultName, namespace string
		var named []string
		for _, current := range kept {
			switch {
			case current.importedName == "default" && current.node == clause.Name():
				defaultName = current.names[0]
			case current.importedName == "*":
				namespace = nodeText(current.node)
			default:
				named = append(named, nodeText(current.node))
			}
		}
		var parts []string
		if defaultName != "" {
			parts = append(parts, defaultName)
		}
		if namespace != "" {
			parts = append(parts, namespace)
		}
		if len(named) > 0 {
			parts = append(parts, "{ "+strings.Join(named, ", ")+" }")
		}
		prefix := "import "
		if clause.AsImportClause().PhaseModifier == ast.KindTypeKeyword {
			prefix = "import type "
		}
		return prefix + strings.Join(parts, ", ") + " from " + nodeText(declaration.ModuleSpecifier) + ";"
	}
	declaration := statement.AsExportDeclaration()
	named := make([]string, 0, len(kept))
	for _, current := range kept {
		named = append(named, nodeText(current.node))
	}
	prefix := "export "
	if declaration.IsTypeOnly {
		prefix = "export type "
	}
	out := prefix + "{ " + strings.Join(named, ", ") + " }"
	if declaration.ModuleSpecifier != nil {
		out += " from " + nodeText(declaration.ModuleSpecifier)
	}
	return out + ";"
}
