package convert

// names.go owns identifier decisions: the local names the printers spell and the derived declaration
// names (`MyType` → `myTypeRT` and back), collision-checked against everything already named at the
// file's top level.

import (
	"strings"
	"unicode"

	"github.com/microsoft/typescript-go/shim/ast"
)

// nameTable carries the printers' local spellings plus the taken-name set derivation claims from.
type nameTable struct {
	// Namespace aliases and helper locals honor existing imports, so a file that already says
	// `import * as B from '…/builders'` keeps its alias.
	RT         string
	TF         string
	TFT        string
	InferType  string
	GetRunType string
	TypeFormat string
	taken      map[string]bool
}

// newNames seeds the table from the recognized declarations, the file's imports and EVERY other
// top-level name in scope, so a `const RT = 5` pushes the builders namespace onto a suffixed alias.
// A helper spelling resolves in order: an existing named binding, an existing namespace import of
// the module (qualified member spelling, needing no import edit), else the default name claimed.
func newNames(decls []*declaration, imports *importScan, inScope map[string]bool) *nameTable {
	names := &nameTable{taken: map[string]bool{}}
	for _, decl := range decls {
		if decl.Name != "" {
			names.taken[decl.Name] = true
		}
		if decl.ConstName != "" {
			names.taken[decl.ConstName] = true
		}
	}
	for name := range inScope {
		names.taken[name] = true
	}
	var coreNS string
	if imports != nil {
		for _, local := range imports.LocalNames() {
			names.taken[local] = true
		}
		coreNS = imports.NamespaceAlias(moduleCore)
	}
	namespaceOf := func(module string) string {
		if imports == nil {
			return ""
		}
		return imports.NamespaceAlias(module)
	}
	localOf := func(module, imported string) string {
		if imports == nil {
			return ""
		}
		return imports.LocalFor(module, imported)
	}
	helper := func(module, imported, fallback string, memberNS string) string {
		if local := localOf(module, imported); local != "" {
			return local
		}
		if memberNS != "" {
			return memberNS + "." + imported
		}
		return names.claim(fallback)
	}
	if alias := namespaceOf(moduleBuilders); alias != "" {
		names.RT = alias
	} else {
		names.RT = names.claim("RT")
	}
	if alias := namespaceOf(moduleFormats); alias != "" {
		names.TF = alias
	} else {
		names.TF = names.claim("TF")
	}
	if alias := namespaceOf(moduleTemporal); alias != "" {
		names.TFT = alias
	} else {
		names.TFT = names.claim("TFT")
	}
	names.InferType = helper(moduleCore, "InferType", "InferType", coreNS)
	names.GetRunType = helper(moduleCore, "getRunType", "getRunType", coreNS)
	names.TypeFormat = helper(moduleCore, "TypeFormat", "TypeFormat", coreNS)
	return names
}

// forScope returns a name table for claims made INSIDE one block: the file's own names still block,
// since a nested pair must never shadow a top-level name, but two sibling scopes may claim the same
// name. Without it, twenty sibling `const users` bodies exhaust claim's single-digit suffix budget.
func (names *nameTable) forScope(baseTaken map[string]bool, scopeNames map[string]bool) *nameTable {
	scoped := *names
	scoped.taken = make(map[string]bool, len(baseTaken)+len(scopeNames))
	for name := range baseTaken {
		scoped.taken[name] = true
	}
	for name := range scopeNames {
		scoped.taken[name] = true
	}
	return &scoped
}

// deriveConstName maps a type name onto its runtype const (`MyType` → `myTypeRT`), suffixing digits
// on collision and returning "" when the budget runs out. Generic runtype pairs ONLY: a drizzle
// table const is a table, not a runtype, and derives through the Table rule.
func (names *nameTable) deriveConstName(typeName string) string {
	base := lowerFirst(typeName) + "RT"
	return names.claim(base)
}

// deriveTypeName maps a const name back onto a type name for consts that never had an InferType
// alias. Generic runtype pairs only (see deriveConstName).
func (names *nameTable) deriveTypeName(constName string) string {
	base := strings.TrimSuffix(constName, "RT")
	if base == constName || base == "" {
		base = constName + "Type"
	}
	return names.claim(upperFirst(base))
}

// jsReservedWords guards the drizzle const derivation: stripping Table off a type name must never
// produce a keyword (`NewTable` → `new`).
var jsReservedWords = map[string]bool{
	"await": true, "break": true, "case": true, "catch": true, "class": true,
	"const": true, "continue": true, "debugger": true, "default": true,
	"delete": true, "do": true, "else": true, "enum": true, "export": true,
	"extends": true, "false": true, "finally": true, "for": true,
	"function": true, "if": true, "import": true, "in": true,
	"instanceof": true, "let": true, "new": true, "null": true, "return": true,
	"static": true, "super": true, "switch": true, "this": true, "throw": true,
	"true": true, "try": true, "typeof": true, "var": true, "void": true,
	"while": true, "with": true, "yield": true,
}

// deriveDrizzleConstName lowercases the first letter of a table type name, the inverse of
// deriveDrizzleTypeName. Only reached when the type has no companion const to keep, so it needs a
// free sensible name rather than a perfect inverse of a collision suffix.
func (names *nameTable) deriveDrizzleConstName(typeName string) string {
	short := lowerFirst(typeName)
	if short != typeName && !names.taken[short] && !jsReservedWords[short] {
		names.taken[short] = true
		return short
	}
	return names.claim(short + "Table")
}

// deriveDrizzleTypeName uppercases a table const's first letter. A const that is ALREADY capitalised
// gets a `T` instead, because uppercasing would hand the type the const's own spelling; further
// collisions walk T1, T2, … .
func (names *nameTable) deriveDrizzleTypeName(constName string) string {
	stem := upperFirst(constName)
	if stem != constName && !names.taken[stem] {
		names.taken[stem] = true
		return stem
	}
	if !names.taken[stem+"T"] {
		names.taken[stem+"T"] = true
		return stem + "T"
	}
	for suffix := 1; suffix <= 9; suffix++ {
		candidate := stem + "T" + string(rune('0'+suffix))
		if !names.taken[candidate] {
			names.taken[candidate] = true
			return candidate
		}
	}
	return ""
}

// claim returns base or a digit-suffixed variant and registers it; "" when 1-9 are all taken.
func (names *nameTable) claim(base string) string {
	if !names.taken[base] {
		names.taken[base] = true
		return base
	}
	for suffix := 2; suffix <= 9; suffix++ {
		candidate := base + string(rune('0'+suffix))
		if !names.taken[candidate] {
			names.taken[candidate] = true
			return candidate
		}
	}
	return ""
}

func lowerFirst(name string) string {
	if name == "" {
		return name
	}
	runes := []rune(name)
	runes[0] = unicode.ToLower(runes[0])
	return string(runes)
}

func upperFirst(name string) string {
	if name == "" {
		return name
	}
	runes := []rune(name)
	runes[0] = unicode.ToUpper(runes[0])
	return string(runes)
}

// lineIndentAt returns the whitespace the line containing start opens with, which a replacement
// spliced there has to match on its continuation lines.
func lineIndentAt(source string, start int) string {
	lineStart := strings.LastIndexByte(source[:start], '\n') + 1
	indent := source[lineStart:start]
	if strings.TrimLeft(indent, " \t") != "" {
		return ""
	}
	return indent
}

// indentAfterFirstLine prefixes every line but the first with indent, the first landing where the
// replaced statement started.
func indentAfterFirstLine(text, indent string) string {
	if indent == "" || !strings.Contains(text, "\n") {
		return text
	}
	lines := strings.Split(text, "\n")
	for i := 1; i < len(lines); i++ {
		if lines[i] != "" {
			lines[i] = indent + lines[i]
		}
	}
	return strings.Join(lines, "\n")
}

// baseTakenNames are the names visible everywhere in a file: its import bindings and its top-level
// declarations. A nested scope claims from these, never from the whole file's, so sibling scopes do
// not crowd each other out.
func baseTakenNames(imports *importScan, inScope map[string]bool) map[string]bool {
	taken := map[string]bool{}
	if imports != nil {
		for _, local := range imports.LocalNames() {
			taken[local] = true
		}
	}
	for name := range inScope {
		taken[name] = true
	}
	return taken
}

// wholeLineSpan is the span a REMOVED statement occupies: its text, the trailing newline, and its
// leading indentation when only whitespace precedes it on the line. Indentation left behind would
// push the next line out.
func wholeLineSpan(source string, statement *ast.Node) (int, int) {
	start := tokenStart(source, statement.Pos())
	lineStart := strings.LastIndexByte(source[:start], '\n') + 1
	if strings.TrimLeft(source[lineStart:start], " \t") == "" {
		start = lineStart
	}
	end := statement.End()
	if end < len(source) && source[end] == '\n' {
		end++
	}
	return start, end
}
