// Package mirror maintains the committed enrichment mirror files, the per-source FriendlyText / MockData consts: it parses
// one into an Index, reconciles it against freshly generated skeletons, splits a multi-type mirror per declaration file,
// and finds the dirty tags the lint reports.
package mirror

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/parser"
	"github.com/microsoft/typescript-go/shim/scanner"
	"github.com/microsoft/typescript-go/shim/tspath"
)

// Index is the parsed view of a committed mirror that reconcile matches the freshly-regenerated desired set against.
// Its byte ranges are raw offsets into the ORIGINAL bytes, as AST Pos/End are, so a splice slices them with no conversion.
type Index struct {
	// raw is the original file bytes (the splice base).
	raw []byte
	// sourceFile is the parsed AST, which the scanner needs for trivia-trimmed statement starts.
	sourceFile *ast.SourceFile
	// consts lists every indexed friendly*/mock* const in declaration order.
	consts []*constEntry
	// byTypeForm is keyed by form plus typeID, so one type's friendly and mock consts, which SHARE an id, never collide.
	// Only a const carrying an @rtType marker appears here.
	byTypeForm map[string]*constEntry
	// byVar is the fallback match, used with no marker or after an id change left the @rtType stale.
	byVar map[string]*constEntry
	// breadcrumb is the source breadcrumb import, nil when the file has none.
	breadcrumb *importEntry
	// dslImport is the DSL-types import, nil when absent.
	dslImport *importEntry
	// valueImports are the cross-file value-import lines, in declaration order.
	valueImports []*importEntry
	// orphanCarcasses are the commented-out const blocks, keyed by VAR NAME so the SAME named type reappearing restores
	// its preserved value. An id key instead revived a different same-shape type's const, churning it back out next pass,
	// and let two same-shape desired consts both restore one carcass, which overlaps their splices.
	orphanCarcasses map[string]*carcassEntry
	// Warnings are non-fatal advisories collected while indexing; the CLI prints them, this package never does I/O.
	Warnings []string
}

// carcassEntry is one commented-out const block: its byte range and the preserved text between the tag and ` */`.
type carcassEntry struct {
	start int
	end   int
	inner string // the original const declaration text, restorable verbatim
}

// typeFormKey keys byTypeForm so a type's friendly and mock consts index distinctly despite sharing a structural id.
func typeFormKey(typeID string, isFriendly bool) string {
	if isFriendly {
		return "f:" + typeID
	}
	return "m:" + typeID
}

// constEntry is one indexed enrichment const declaration; tokenStart is trivia-trimmed, so a whole-const replace does
// not swallow a leading comment, while fullStart is there only to read the comment block carrying the markers.
type constEntry struct {
	varName    string            // the const identifier, e.g. "friendlyUser"
	isFriendly bool              // friendly* (true) vs mock* (false)
	typeName   string            // the annotated source type, e.g. "User" from FriendlyText<User>
	typeID     string            // the @rtType id, or "" when no marker (matched by var name)
	childIDs   map[string]string // @rtIds dotted-field-path → child type id
	fullStart  int               // node.Pos() — start of leading trivia (the JSDoc)
	tokenStart int               // trivia-trimmed start (the `export` keyword)
	end        int               // node.End()
	body       *ast.Node         // the object-literal initializer (nil when not an object literal)
	// markerStart / markerEnd bound the existing @rtType JSDoc so a stale marker is replaced surgically.
	// Both zero with no marker block, where the caller inserts before tokenStart instead.
	markerStart int
	markerEnd   int
	// varNameStart / varNameEnd bound the const identifier and annoNameStart / annoNameEnd the annotation type name.
	// Both are spliced when a RENAMED type keeps its structural id, so its const is carried rather than orphaned.
	varNameStart  int
	varNameEnd    int
	annoNameStart int
	annoNameEnd   int
	// annoWrapper is the annotation WRAPPER name and its bounds, so `enrich --update` can splice a legacy FriendlyType.
	annoWrapper      string
	annoWrapperStart int
	annoWrapperEnd   int
}

// importEntry is one indexed import: its names, the statement's byte range, and the named-bindings clause range.
type importEntry struct {
	names      []string
	nameSpans  [][2]int // each name's original identifier range, aligned with names, for the DSL-import lazy rename
	specifier  string
	tokenStart int
	end        int
	// clauseStart / clauseEnd bound the INSIDE of the named-bindings list, so a rewrite keeps `from '<src>'` byte-identical.
	clauseStart int
	clauseEnd   int
}

// rtTypePattern matches the `@rtType <Name>#<id>` marker, or a bare id; group 1 is the optional name, group 2 the id.
var rtTypePattern = regexp.MustCompile(RtTypeTag + `\s+(?:(\w+)#)?(\w+)`)

// rtIdsPattern matches the `@rtIds { … }` block, group 1 the body between the braces.
var rtIdsPattern = regexp.MustCompile(RtIdsTag + `\s*\{([^}]*)\}`)

// rtIdsEntryPattern matches one @rtIds entry: group 1 the dotted field path, group 3 the id.
var rtIdsEntryPattern = regexp.MustCompile(`([\w.$]+)\s*:\s*(?:([\w$]+)#)?(\w+)`)

// ParseMirror indexes a mirror's consts and imports, and errors on any parse diagnostic: a file we cannot parse must
// never be appended to or overwritten. The parser returns a node with Diagnostics rather than nil, so that gate is the check.
func ParseMirror(mirrorPath string, mirrorBytes []byte) (*Index, error) {
	text := string(mirrorBytes)
	sourceFile := parser.ParseSourceFile(
		ast.SourceFileParseOptions{FileName: mirrorPath, Path: tspath.Path(mirrorPath)},
		text,
		core.ScriptKindTS,
	)
	if sourceFile == nil {
		return nil, fmt.Errorf("mion enrich --update: cannot parse mirror %s; fix or delete it", mirrorPath)
	}
	if diagnostics := sourceFile.Diagnostics(); len(diagnostics) > 0 {
		return nil, fmt.Errorf("mion enrich --update: cannot parse mirror %s (%d syntax error(s)); fix or delete it: %s",
			mirrorPath, len(diagnostics), firstDiagnosticMessage(diagnostics))
	}

	index := &Index{
		raw:             mirrorBytes,
		sourceFile:      sourceFile,
		byTypeForm:      map[string]*constEntry{},
		byVar:           map[string]*constEntry{},
		orphanCarcasses: map[string]*carcassEntry{},
	}

	root := sourceFile.AsNode()
	if root == nil {
		return index, nil
	}
	for _, statement := range root.Statements() {
		if statement == nil {
			continue
		}
		switch {
		case ast.IsImportDeclaration(statement):
			index.indexImport(text, statement)
		case ast.IsVariableStatement(statement):
			index.indexVariableStatement(text, statement)
		}
	}
	index.indexOrphanCarcasses(text)
	return index, nil
}

// orphanCarcassPattern matches a whole-const @rtOrphan block, group 1 the preserved inner text.
var orphanCarcassPattern = regexp.MustCompile(`(?s)/\* @rtOrphan (.*?) \*/`)

// indexOrphanCarcasses recovers each carcass's preserved text, keyed by its var name so the same type reappearing
// restores it. A carcass is a comment, not a statement, so this is a text scan, but every match is anchored to a real
// comment start: an authored string embedding the syntax would otherwise be spliced back in as live code.
func (index *Index) indexOrphanCarcasses(text string) {
	scan := NewScanForSourceFile(index.sourceFile)
	for _, match := range orphanCarcassPattern.FindAllStringSubmatchIndex(text, -1) {
		blockStart, blockEnd := match[0], match[1]
		if !scan.commentStartsAt(blockStart) {
			continue // carcass bytes inside a literal or mid-comment are not a carcass
		}
		inner := text[match[2]:match[3]]
		varName := carcassVarName(inner)
		if varName == "" {
			continue // with no recoverable var name nothing can match it
		}
		// Swallow a single trailing newline so a restore replaces the carcass line cleanly.
		end := blockEnd
		if end < len(text) && text[end] == '\n' {
			end++
		}
		index.orphanCarcasses[varName] = &carcassEntry{start: blockStart, end: end, inner: inner}
	}
}

// carcassVarName extracts the const identifier from a carcass's preserved text, for the friendly/mock form fallback.
func carcassVarName(inner string) string {
	match := regexp.MustCompile(`export\s+const\s+(\w+)`).FindStringSubmatch(inner)
	if match == nil {
		return ""
	}
	return match[1]
}

// firstDiagnosticMessage renders the first diagnostic for the fatal-on-parse-error report.
func firstDiagnosticMessage(diagnostics []*ast.Diagnostic) string {
	if len(diagnostics) == 0 {
		return ""
	}
	return diagnostics[0].String()
}

// indexVariableStatement records every enrichment const the statement declares, keyed by @rtType id, else by var name.
func (index *Index) indexVariableStatement(text string, statement *ast.Node) {
	tokenStart := scanner.GetTokenPosOfNode(statement, index.sourceFile, false)
	// A carcass above this const is its leading trivia but NOT its marker, so own trivia starts past the last one.
	// Otherwise the first live const after a carcass adopts that @rtType, and a marker refresh overwrites the carcass.
	ownStart := ownTriviaStart(text, statement.Pos(), tokenStart)
	leadingComment := text[ownStart:tokenStart]

	for _, declaration := range variableDeclarations(statement) {
		if !ast.IsVariableDeclaration(declaration) {
			continue
		}
		nameNode := declaration.Name()
		if nameNode == nil || nameNode.Kind != ast.KindIdentifier {
			continue
		}
		varName := nameNode.Text()
		isFriendly, isMock := isFriendlyVar(varName), isMockVar(varName)
		if !isFriendly && !isMock {
			continue
		}
		typeID, childIDs := parseConstMarkers(leadingComment)

		var body *ast.Node
		if initializer := declaration.AsVariableDeclaration().Initializer; initializer != nil && ast.IsObjectLiteralExpression(initializer) {
			body = initializer
		}

		markerStart, markerEnd := markerBlockRange(text, ownStart, tokenStart)
		typeName, annoStart, annoEnd := annotationTypeNameRange(declaration, index.sourceFile)
		wrapperName, wrapperStart, wrapperEnd := annotationWrapperRange(declaration, index.sourceFile)
		entry := &constEntry{
			varName:          varName,
			isFriendly:       isFriendly,
			typeName:         typeName,
			typeID:           typeID,
			childIDs:         childIDs,
			fullStart:        ownStart,
			tokenStart:       tokenStart,
			end:              statement.End(),
			body:             body,
			markerStart:      markerStart,
			markerEnd:        markerEnd,
			varNameStart:     scanner.GetTokenPosOfNode(nameNode, index.sourceFile, false),
			varNameEnd:       nameNode.End(),
			annoNameStart:    annoStart,
			annoNameEnd:      annoEnd,
			annoWrapper:      wrapperName,
			annoWrapperStart: wrapperStart,
			annoWrapperEnd:   wrapperEnd,
		}
		index.consts = append(index.consts, entry)
		index.byVar[varName] = entry
		if typeID != "" {
			key := typeFormKey(typeID, isFriendly)
			// A duplicate id for one form is hand-edit corruption: keep the FIRST and warn, since last-write-wins
			// would mis-pair the reconcile. The duplicate stays reachable through byVar.
			if first, dup := index.byTypeForm[key]; dup {
				index.Warnings = append(index.Warnings, fmt.Sprintf(
					"mion enrich --update: duplicate @rtType id %q (form %s) on both %q and %q — keeping the first; fix the marker on the second",
					typeID, formLabel(isFriendly), first.varName, varName))
			} else {
				index.byTypeForm[key] = entry
			}
		}
	}
}

// formLabel renders the friendly/mock form for a diagnostic message.
func formLabel(isFriendly bool) string {
	if isFriendly {
		return "friendly"
	}
	return "mock"
}

// annotationTypeNameRange reads a const's annotated source type name and its range, so a rename can splice it.
// The name is "" when the annotation is absent or is not a single named type argument.
func annotationTypeNameRange(declaration *ast.Node, sourceFile *ast.SourceFile) (name string, start, end int) {
	typeNode := declaration.AsVariableDeclaration().Type
	if typeNode == nil || !ast.IsTypeReferenceNode(typeNode) {
		return "", 0, 0
	}
	args := typeNode.TypeArguments()
	if len(args) == 0 {
		return "", 0, 0
	}
	arg := args[0]
	if arg == nil || !ast.IsTypeReferenceNode(arg) {
		return "", 0, 0
	}
	nameNode := arg.AsTypeReferenceNode().TypeName
	if nameNode == nil {
		return "", 0, 0
	}
	return nameNode.Text(), scanner.GetTokenPosOfNode(nameNode, sourceFile, false), nameNode.End()
}

// annotationWrapperRange reads the annotation's WRAPPER name, not its `<T>` argument, and its range, so `enrich --update`
// can splice a legacy `FriendlyType` to `FriendlyText`. The name is "" when the annotation is not a type reference.
func annotationWrapperRange(declaration *ast.Node, sourceFile *ast.SourceFile) (name string, start, end int) {
	typeNode := declaration.AsVariableDeclaration().Type
	if typeNode == nil || !ast.IsTypeReferenceNode(typeNode) {
		return "", 0, 0
	}
	nameNode := typeNode.AsTypeReferenceNode().TypeName
	if nameNode == nil {
		return "", 0, 0
	}
	return nameNode.Text(), scanner.GetTokenPosOfNode(nameNode, sourceFile, false), nameNode.End()
}

// indexImport records one import as the source breadcrumb, the DSL import, or a cross-file value import.
func (index *Index) indexImport(text string, statement *ast.Node) {
	importDecl := statement.AsImportDeclaration()
	if importDecl == nil || importDecl.ModuleSpecifier == nil {
		return
	}
	specifier := importDecl.ModuleSpecifier.Text()
	tokenStart := scanner.GetTokenPosOfNode(statement, index.sourceFile, false)

	names, nameSpans, clauseStart, clauseEnd := importedNames(text, importDecl, index.sourceFile)
	entry := &importEntry{
		names:       names,
		nameSpans:   nameSpans,
		specifier:   specifier,
		tokenStart:  tokenStart,
		end:         statement.End(),
		clauseStart: clauseStart,
		clauseEnd:   clauseEnd,
	}

	isTypeOnly := importDecl.ImportClause != nil && importDecl.ImportClause.AsImportClause() != nil &&
		importDecl.ImportClause.AsImportClause().PhaseModifier == ast.KindTypeKeyword
	switch {
	case specifier == "@mionjs/run-types" && isTypeOnly:
		index.dslImport = entry
	case isTypeOnly:
		// The FIRST type-only import from anywhere but the DSL package is the source breadcrumb.
		if index.breadcrumb == nil {
			index.breadcrumb = entry
		}
	default:
		// A value import carries the cross-file const references.
		index.valueImports = append(index.valueImports, entry)
	}
}

// importedNames returns an import's names before any `as` alias, each name's own range, and the names-list range.
// The list range is trimmed of trivia, so a splice replaces exactly `User, Post` and leaves the braces byte-identical.
func importedNames(text string, importDecl *ast.ImportDeclaration, sourceFile *ast.SourceFile) (names []string, nameSpans [][2]int, clauseStart, clauseEnd int) {
	if importDecl.ImportClause == nil {
		return nil, nil, 0, 0
	}
	clause := importDecl.ImportClause.AsImportClause()
	if clause == nil || clause.NamedBindings == nil {
		return nil, nil, 0, 0
	}
	if !ast.IsNamedImports(clause.NamedBindings) {
		return nil, nil, 0, 0
	}
	named := clause.NamedBindings.AsNamedImports()
	if named == nil || named.Elements == nil {
		return nil, nil, 0, 0
	}
	for _, element := range named.Elements.Nodes {
		if element == nil || !ast.IsImportSpecifier(element) {
			continue
		}
		specifier := element.AsImportSpecifier()
		// The ORIGINAL name node, so a splice rewrites `Foo` of `Foo as Bar` and never the local alias.
		nameNode := specifier.PropertyName
		if nameNode == nil {
			nameNode = element.Name()
		}
		if nameNode == nil {
			continue
		}
		name := nameNode.Text()
		if name != "" {
			names = append(names, name)
			nameSpans = append(nameSpans, [2]int{scanner.GetTokenPosOfNode(nameNode, sourceFile, false), nameNode.End()})
		}
	}
	// Trimming the span leaves the braces and their padding byte-identical when a reconcile rewrites only the names.
	clauseStart, clauseEnd = trimRange(text, named.Elements.Pos(), named.Elements.End())
	return names, nameSpans, clauseStart, clauseEnd
}

// trimRange shrinks a range past leading and trailing ASCII whitespace.
func trimRange(text string, start, end int) (int, int) {
	for start < end && isSpaceByte(text[start]) {
		start++
	}
	for end > start && isSpaceByte(text[end-1]) {
		end--
	}
	return start, end
}

func isSpaceByte(b byte) bool {
	return b == ' ' || b == '\t' || b == '\r' || b == '\n'
}

// ownTriviaStart is the byte past the last carcass preceding a const, else fullStart.
// A carcass above a const is that const's leading trivia but a separate commented-out entity, which its marker detection
// and its orphan-fold start must never reach into.
func ownTriviaStart(text string, fullStart, tokenStart int) int {
	if fullStart < 0 || tokenStart > len(text) || fullStart >= tokenStart {
		return fullStart
	}
	start := fullStart
	for _, loc := range orphanCarcassPattern.FindAllStringIndex(text[fullStart:tokenStart], -1) {
		end := fullStart + loc[1]
		if end < tokenStart && text[end] == '\n' {
			end++ // swallow the trailing newline so the next line is own trivia
		}
		if end > start {
			start = end
		}
	}
	return start
}

// markerBlockRange returns the @rtType block's range in a const's leading trivia, a trailing newline included so a
// replace swaps the whole marker line; (0,0) when there is no such block.
func markerBlockRange(text string, fullStart, tokenStart int) (int, int) {
	region := text[fullStart:tokenStart]
	open := strings.Index(region, "/*")
	for open >= 0 {
		close := strings.Index(region[open:], "*/")
		if close < 0 {
			break
		}
		blockEnd := open + close + 2 // past the closing `*/`
		block := region[open:blockEnd]
		if strings.Contains(block, "@rtType") {
			start := fullStart + open
			end := fullStart + blockEnd
			// Swallow a single trailing newline so the marker line is fully replaced.
			if end < len(text) && text[end] == '\n' {
				end++
			}
			return start, end
		}
		next := strings.Index(region[blockEnd:], "/*")
		if next < 0 {
			break
		}
		open = blockEnd + next
	}
	return 0, 0
}

// parseConstMarkers extracts a const's @rtType id and @rtIds child-id map, ("", nil) when it carries no markers.
func parseConstMarkers(comment string) (typeID string, childIDs map[string]string) {
	if match := rtTypePattern.FindStringSubmatch(comment); match != nil {
		typeID = match[2]
	}
	if match := rtIdsPattern.FindStringSubmatch(comment); match != nil {
		childIDs = map[string]string{}
		for _, entry := range rtIdsEntryPattern.FindAllStringSubmatch(match[1], -1) {
			field := entry[1]
			id := entry[3]
			if field != "" && id != "" {
				childIDs[field] = id
			}
		}
		if len(childIDs) == 0 {
			childIDs = nil
		}
	}
	return typeID, childIDs
}

// Breadcrumb returns the source breadcrumb's module specifier, ok false when the file has none.
func (index *Index) Breadcrumb() (string, bool) {
	if index.breadcrumb == nil {
		return "", false
	}
	return index.breadcrumb.specifier, true
}

// FriendlyConstType is a friendly const's view for the translate driver's DISCOVERY step; TypeName is "" when unannotated.
type FriendlyConstType struct {
	VarName  string
	TypeName string
}

// FriendlyConstTypes lists the friendly consts in declaration order, EXCLUDING translation vars: a translation file is
// never itself a translate source.
func (index *Index) FriendlyConstTypes() []FriendlyConstType {
	var out []FriendlyConstType
	for _, entry := range index.consts {
		if !entry.isFriendly || isTranslationVar(entry.varName) {
			continue
		}
		out = append(out, FriendlyConstType{VarName: entry.varName, TypeName: entry.typeName})
	}
	return out
}

// isFriendlyVar / isMockVar report whether an identifier is one of our emitted enrichment vars.
// A TRANSLATION const counts as friendly-form too: same tree, same reconcile machinery.
func isFriendlyVar(name string) bool {
	return hasCamelSuffix(name, "friendly") || isTranslationVar(name)
}

func isMockVar(name string) bool {
	return hasCamelSuffix(name, "mock")
}

// isTranslationVar reports whether name is `<locale>_friendly<Name>`; the locale LEADS on purpose, since a trailing
// `friendlyUser_es` would still read as a plain friendly const.
func isTranslationVar(name string) bool {
	idx := strings.Index(name, "_friendly")
	if idx <= 0 {
		return false
	}
	return hasCamelSuffix(name[idx+1:], "friendly")
}

// TranslationVarName is `<locale>_<sourceVar>` with BCP-47 separators sanitized to underscores.
func TranslationVarName(locale, sourceVar string) string {
	return strings.ReplaceAll(locale, "-", "_") + "_" + sourceVar
}

// hasCamelSuffix matches prefix plus an upper-case-led suffix: "friendlyUser", but not "friendly" or "friendlyx".
func hasCamelSuffix(name, prefix string) bool {
	if !strings.HasPrefix(name, prefix) || len(name) <= len(prefix) {
		return false
	}
	next := name[len(prefix)]
	return next >= 'A' && next <= 'Z'
}
