// Package mirror maintains the committed enrichment mirror files — the
// per-source `.rt.ts` FriendlyText/MockData consts. It parses a mirror
// into an Index (consts, markers, imports, translations), reconciles it
// against freshly generated skeletons (add / update / orphan / prune),
// splits multi-type mirrors per declaration file, and detects the dirty
// tags (`@todo`, `@rtOrphan…`) the lint surfaces report.
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

// Index is the parsed view of an existing committed mirror file the reconcile
// (gen --update) algorithm matches the freshly-regenerated desired set against.
// It is built by ParseMirror over the file's AST; byte ranges are raw offsets
// into the ORIGINAL file bytes (AST Pos/End are byte offsets), so a splice
// slices them directly with no char conversion.
type Index struct {
	// raw is the original file bytes (the splice base).
	raw []byte
	// sourceFile is the parsed AST (the scanner needs it for trivia-trimmed
	// statement starts).
	sourceFile *ast.SourceFile
	// consts lists every indexed friendly*/mock* const in declaration order.
	consts []*constEntry
	// byTypeForm maps `<form>:<typeID>` (form = "f"/"m") → entry, so the friendly
	// and mock const of one type — which SHARE a structural id — never collide.
	// Only consts that carry an @rtType marker appear here.
	byTypeForm map[string]*constEntry
	// byVar maps a const's var name → entry (the fallback match when no marker,
	// or after a structural-id change renders the @rtType stale).
	byVar map[string]*constEntry
	// breadcrumb is the `import type { … } from '<src>'` source breadcrumb, or
	// nil when the file has none.
	breadcrumb *importEntry
	// dslImport is the `import type { FriendlyText, MockData } from '@ts-runtypes/core'`
	// DSL-types import, or nil when absent.
	dslImport *importEntry
	// valueImports are the cross-file `import { friendly*/mock* } from '<rel>'`
	// value-import lines, in declaration order.
	valueImports []*importEntry
	// orphanCarcasses are the `@rtOrphan`-tagged commented-out const blocks (a
	// type previously orphaned), keyed by VAR NAME (`friendly<Name>` / `mock<Name>`)
	// so the SAME named type reappearing can RESTORE its preserved value. Keying by
	// var name (the emission identity), not the structural id, is deliberate: an
	// id key restored a DIFFERENT same-shape type's const (reviving the old name,
	// which is re-orphaned next pass → churn) and let two same-shape desired consts
	// both restore one carcass → overlapping splices.
	orphanCarcasses map[string]*carcassEntry
	// Warnings are non-fatal advisories collected while indexing (e.g. a
	// duplicate @rtType id on two consts of the same form). The CLI prints them
	// to stderr; the pure package never does I/O.
	Warnings []string
}

// carcassEntry is one `@rtOrphan` commented-out const block: its absolute byte
// range and the preserved INNER const text (between `/* @rtOrphan ` and ` */`).
type carcassEntry struct {
	start int
	end   int
	inner string // the original const declaration text, restorable verbatim
}

// typeFormKey builds the byTypeForm composite key for a (typeID, isFriendly)
// pair so a type's friendly and mock consts index distinctly despite sharing the
// structural id.
func typeFormKey(typeID string, isFriendly bool) string {
	if isFriendly {
		return "f:" + typeID
	}
	return "m:" + typeID
}

// constEntry is one indexed `export const friendly*/mock* : Wrapper<T> = {…};`
// declaration. tokenStart is the trivia-trimmed start (so a leading JSDoc /
// comment above the const is NOT swallowed by a whole-const replace); fullStart
// is the leading-trivia start (Pos), used only to read the leading comment block
// that carries the markers.
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
	// markerStart / markerEnd bound the existing `@rtType`-bearing JSDoc block
	// (absolute byte offsets), so a stale marker can be replaced surgically. Both
	// zero when the const has no marker block (insert before tokenStart instead).
	markerStart int
	markerEnd   int
	// varNameStart / varNameEnd bound the `export const <var>` identifier, and
	// annoNameStart / annoNameEnd the `FriendlyText<<Name>>` annotation type-name —
	// both spliced when the const is RENAMED (its type was renamed but keeps its
	// structural id, so it is matched + carried, not orphaned). The annotation
	// range is (0,0) when there is no `Wrapper<Name>` annotation.
	varNameStart  int
	varNameEnd    int
	annoNameStart int
	annoNameEnd   int
	// annoWrapper is the annotation WRAPPER type name (`FriendlyText` / `MockData`,
	// or the legacy `FriendlyType`), and annoWrapperStart / annoWrapperEnd bound it,
	// so `gen --update` can splice a legacy `FriendlyType` → `FriendlyText`. Empty /
	// (0,0) when the const has no `Wrapper<Name>` annotation.
	annoWrapper      string
	annoWrapperStart int
	annoWrapperEnd   int
}

// importEntry is one indexed import statement: its declared names + the byte
// range of the whole statement (trivia-trimmed start → End) plus the byte range
// of the `{ … }` named-bindings clause (for surgical breadcrumb-name edits).
type importEntry struct {
	names      []string
	nameSpans  [][2]int // byte range of each name's original identifier, aligned with names (for the DSL-import lazy rename)
	specifier  string
	tokenStart int
	end        int
	// clauseStart / clauseEnd bound the INSIDE of the `{ … }` named-bindings list
	// (after `{`, before `}`), so the reconcile can rewrite only the names and
	// keep `from '<src>'` byte-identical. Zero when there are no named bindings.
	clauseStart int
	clauseEnd   int
}

// rtTypePattern matches the `@rtType <Name>#<id>` marker (or a bare `@rtType
// <id>`). Group 1 is the optional readable name, group 2 the id.
var rtTypePattern = regexp.MustCompile(RtTypeTag + `\s+(?:(\w+)#)?(\w+)`)

// rtIdsPattern matches the `@rtIds { … }` block; group 1 is the body between the
// braces.
var rtIdsPattern = regexp.MustCompile(RtIdsTag + `\s*\{([^}]*)\}`)

// rtIdsEntryPattern matches one `field: <ref>#<id>` (or `field: <id>`) entry
// inside an @rtIds block. Group 1 is the dotted field path, group 3 the id.
var rtIdsEntryPattern = regexp.MustCompile(`([\w.$]+)\s*:\s*(?:([\w$]+)#)?(\w+)`)

// ParseMirror parses mirrorBytes as a standalone TypeScript source file and
// indexes its consts + imports. It returns an error when the parse reports any
// diagnostic (a syntax error) — the caller never silently appends to or
// overwrites a file it cannot parse. A nil sourceFile never happens on a syntax
// error (the parser returns a node with Diagnostics populated), so the
// Diagnostics gate is the real check.
func ParseMirror(mirrorPath string, mirrorBytes []byte) (*Index, error) {
	text := string(mirrorBytes)
	sourceFile := parser.ParseSourceFile(
		ast.SourceFileParseOptions{FileName: mirrorPath, Path: tspath.Path(mirrorPath)},
		text,
		core.ScriptKindTS,
	)
	if sourceFile == nil {
		return nil, fmt.Errorf("gen --update: cannot parse mirror %s; fix or delete it", mirrorPath)
	}
	if diagnostics := sourceFile.Diagnostics(); len(diagnostics) > 0 {
		return nil, fmt.Errorf("gen --update: cannot parse mirror %s (%d syntax error(s)); fix or delete it: %s",
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

// orphanCarcassPattern matches a whole-const `@rtOrphan` block comment:
// `/* @rtOrphan <preserved const text> */`. Group 1 is the preserved inner text.
var orphanCarcassPattern = regexp.MustCompile(`(?s)/\* @rtOrphan (.*?) \*/`)

// indexOrphanCarcasses scans the raw text for `@rtOrphan` block comments (a
// whole const previously orphaned), recovering each one's preserved inner text
// keyed by its `export const <var>` name so the SAME named type reappearing can
// restore it. Carcasses are NOT statements (they are comments), so this is a
// text scan, not an AST walk — but matches are anchored to real comment starts
// (the mirror's own parse via NewScanForSourceFile), so an authored string
// value embedding the carcass syntax can never register as restorable: a
// restore-on-reappear from string bytes would splice data back in as live code.
func (index *Index) indexOrphanCarcasses(text string) {
	scan := NewScanForSourceFile(index.sourceFile)
	for _, match := range orphanCarcassPattern.FindAllStringSubmatchIndex(text, -1) {
		blockStart, blockEnd := match[0], match[1]
		if !scan.commentStartsAt(blockStart) {
			continue // carcass bytes inside a literal / mid-comment — not a carcass
		}
		inner := text[match[2]:match[3]]
		varName := carcassVarName(inner)
		if varName == "" {
			continue // no recoverable var name → nothing a desired const can match
		}
		// Extend the block range to swallow a single trailing newline so a restore
		// replaces the carcass line cleanly.
		end := blockEnd
		if end < len(text) && text[end] == '\n' {
			end++
		}
		index.orphanCarcasses[varName] = &carcassEntry{start: blockStart, end: end, inner: inner}
	}
}

// carcassVarName extracts the `export const <var>` identifier from a preserved
// carcass inner text, for the friendly/mock form fallback.
func carcassVarName(inner string) string {
	match := regexp.MustCompile(`export\s+const\s+(\w+)`).FindStringSubmatch(inner)
	if match == nil {
		return ""
	}
	return match[1]
}

// firstDiagnosticMessage returns the rendered text of the first diagnostic, for
// the fatal-on-parse-error report.
func firstDiagnosticMessage(diagnostics []*ast.Diagnostic) string {
	if len(diagnostics) == 0 {
		return ""
	}
	return diagnostics[0].String()
}

// indexVariableStatement records every `export const friendly*/mock*` the
// statement declares, keyed by its @rtType id (fallback: var name).
func (index *Index) indexVariableStatement(text string, statement *ast.Node) {
	tokenStart := scanner.GetTokenPosOfNode(statement, index.sourceFile, false)
	// A whole-const @rtOrphan carcass sitting ABOVE this const is leading trivia of
	// it, but it is NOT the const's own marker — start the const's own trivia past
	// the last such carcass so marker/id detection (and the orphan-fold) never reach
	// into it. Without this, the first live const after a carcass adopts the
	// carcass's @rtType as its own, and a marker refresh overwrites the carcass.
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
			// Duplicate `@rtType #id` for the same form across two consts is
			// hand-edit corruption: keep the FIRST (matched by id) and warn, rather
			// than silently last-write-wins (which would mis-pair the reconcile).
			// The duplicate stays reachable via byVar for the var-name fallback.
			if first, dup := index.byTypeForm[key]; dup {
				index.Warnings = append(index.Warnings, fmt.Sprintf(
					"gen --update: duplicate @rtType id %q (form %s) on both %q and %q — keeping the first; fix the marker on the second",
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

// annotationTypeNameRange reads the source type name from a const's
// `FriendlyText<T>` / `MockData<T>` annotation — the `T` identifier — plus its
// trivia-trimmed byte range (so a rename can splice it). Name is "" and the range
// (0,0) when the annotation is absent or not a single named type argument.
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

// annotationWrapperRange reads the WRAPPER type name from a const's
// `FriendlyText<T>` / `MockData<T>` annotation — the `FriendlyText` identifier
// itself (not its `<T>` argument) — plus its byte range, so a `gen --update`
// pass can splice a legacy `FriendlyType` wrapper to `FriendlyText`. Name is ""
// and the range (0,0) when the annotation is not a type reference.
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

// indexImport records one import statement: the source breadcrumb, the
// ts-runtypes DSL import, or a cross-file value import.
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
	case specifier == "@ts-runtypes/core" && isTypeOnly:
		index.dslImport = entry
	case isTypeOnly:
		// First `import type { … } from '<non-ts-runtypes>'` is the source breadcrumb.
		if index.breadcrumb == nil {
			index.breadcrumb = entry
		}
	default:
		// A value import — the cross-file friendly*/mock* references.
		index.valueImports = append(index.valueImports, entry)
	}
}

// importedNames returns the imported names of an import declaration (original
// name before any `as` alias) plus the byte range of each name's ORIGINAL
// identifier (aligned with names, for a surgical per-name splice) and the byte
// range of the names list inside its `{ … }` named bindings — trimmed of
// surrounding trivia so a splice replaces EXACTLY `User, Post` (the surrounding
// `{ ` / ` }` stay byte-identical). clauseStart == 0 when there are no named bindings.
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
		// The ORIGINAL name node — the `PropertyName` of a `Foo as Bar` specifier,
		// else the bare name — so a splice rewrites `Foo`, never the local alias.
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
	// Trim the elements' span of surrounding trivia so the clause range covers
	// EXACTLY the names text (`User, Post`), leaving the braces + their padding
	// byte-identical when a reconcile rewrites only the names.
	clauseStart, clauseEnd = trimRange(text, named.Elements.Pos(), named.Elements.End())
	return names, nameSpans, clauseStart, clauseEnd
}

// trimRange shrinks [start, end) over text to exclude leading + trailing ASCII
// whitespace, so the returned range covers only the meaningful content.
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

// ownTriviaStart returns the start of a const's OWN leading trivia within
// [fullStart, tokenStart): the byte just past the last preceding whole-const
// `@rtOrphan` carcass block (plus its trailing newline). A carcass that merely sits
// above a const is leading trivia of that const, but it is a separate commented-out
// entity — not the const's own marker/comment — so the const's id/marker detection
// and its orphan-fold start must never reach into it. Returns fullStart when there
// is no preceding carcass.
func ownTriviaStart(text string, fullStart, tokenStart int) int {
	if fullStart < 0 || tokenStart > len(text) || fullStart >= tokenStart {
		return fullStart
	}
	start := fullStart
	for _, loc := range orphanCarcassPattern.FindAllStringIndex(text[fullStart:tokenStart], -1) {
		end := fullStart + loc[1]
		if end < tokenStart && text[end] == '\n' {
			end++ // swallow the carcass's trailing newline so the next line is own trivia
		}
		if end > start {
			start = end
		}
	}
	return start
}

// markerBlockRange locates the `@rtType`-bearing `/* … */` block in the
// const's leading-trivia span [fullStart, tokenStart) and returns its absolute
// byte range, EXTENDED to include a single trailing newline so a replace swaps
// the whole marker line cleanly. Returns (0,0) when no such block exists.
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

// parseConstMarkers extracts the @rtType id and the @rtIds child-id map from a
// const's leading comment block. Returns ("", nil) when no markers are present.
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

// Breadcrumb returns the source breadcrumb's module specifier (the first
// `import type { … } from '<non-ts-runtypes>'`), ok=false when the file has
// none.
func (index *Index) Breadcrumb() (string, bool) {
	if index.breadcrumb == nil {
		return "", false
	}
	return index.breadcrumb.specifier, true
}

// FriendlyConstType is one friendly-form const's public view for the translate
// driver's DISCOVERY step: the const identifier and the source type name its
// `FriendlyText<T>` annotation carries ("" when unannotated).
type FriendlyConstType struct {
	VarName  string
	TypeName string
}

// FriendlyConstTypes lists the friendly-form consts in declaration order,
// EXCLUDING per-locale translation vars (a translation file is never itself a
// translate source).
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

// isFriendlyVar / isMockVar report whether a const identifier is one of our
// emitted enrichment vars (friendly<Name> / mock<Name> with a CamelCase
// suffix). A TRANSLATION const (`<locale>_friendly<Name>`, e.g.
// `es_friendlyUser`) counts as friendly-form too — same tree, same reconcile
// machinery — via the leading-prefix predicate isTranslationVar.
func isFriendlyVar(name string) bool {
	return hasCamelSuffix(name, "friendly") || isTranslationVar(name)
}

func isMockVar(name string) bool {
	return hasCamelSuffix(name, "mock")
}

// isTranslationVar reports whether name is a per-locale translation const:
// `<localePrefix>_friendly<Name>` with a non-empty leading segment and a
// CamelCase type suffix. The LEADING locale segment (never a suffix) is
// deliberate: `friendlyUser_es` would still match hasCamelSuffix(name,
// "friendly") as a plain friendly const, whereas the leading form is
// unambiguous.
func isTranslationVar(name string) bool {
	idx := strings.Index(name, "_friendly")
	if idx <= 0 {
		return false
	}
	return hasCamelSuffix(name[idx+1:], "friendly")
}

// TranslationVarName builds the translation const identifier for a source
// friendly var: `<locale>_<sourceVar>` with BCP-47 separators sanitized to
// underscores (`pt-BR` → `pt_BR_friendlyUser`).
func TranslationVarName(locale, sourceVar string) string {
	return strings.ReplaceAll(locale, "-", "_") + "_" + sourceVar
}

// hasCamelSuffix reports whether name is prefix + a CamelCase suffix (first
// suffix rune upper-case), e.g. "friendlyUser" but not "friendly" or "friendlyx".
func hasCamelSuffix(name, prefix string) bool {
	if !strings.HasPrefix(name, prefix) || len(name) <= len(prefix) {
		return false
	}
	next := name[len(prefix)]
	return next >= 'A' && next <= 'Z'
}
