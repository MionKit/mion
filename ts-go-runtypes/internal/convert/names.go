// names.go owns identifier decisions: the local names the printers spell
// (namespace aliases, imported helpers) and the derived declaration names
// (`MyType` → `myTypeRT` and back), collision-checked against everything
// already named at the file's top level.
package convert

import (
	"strings"
	"unicode"

	"github.com/microsoft/typescript-go/shim/ast"
)

// nameTable carries the local spellings the printers use plus the taken-name
// set for collision-free derivation.
type nameTable struct {
	// Namespace aliases / helper locals, honoring existing imports so a file
	// that already says `import * as B from '…/builders'` keeps its alias.
	RT         string
	TF         string
	TFT        string
	InferType  string
	GetRunType string
	TypeFormat string
	taken      map[string]bool
}

// newNames seeds the table from the recognized declarations, the file's
// existing imports and EVERY other top-level name in scope (a `const RT = 5`
// must push the builders namespace onto a suffixed alias). Helper spellings
// resolve in order: an existing named binding, an existing namespace import
// of the module (qualified member spelling — no import edit needed), else
// the default name claimed against the taken set.
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

// forScope returns a name table for claims made INSIDE one block: the file's
// own names still block (a nested pair must never shadow a top-level name the
// scope might reference), but two sibling scopes may claim the same name.
// Without this, drizzle's twenty `const users` test bodies exhaust claim's
// single-digit suffix budget on the ninth.
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

// deriveConstName maps a type name onto its runtype const (`MyType` →
// `myTypeRT`), suffixing digits on collision. Returns "" when no free name
// exists within the suffix budget. Generic runtype pairs ONLY — a drizzle
// table const is a table, not a runtype, and derives via the Table rule.
func (names *nameTable) deriveConstName(typeName string) string {
	base := lowerFirst(typeName) + "RT"
	return names.claim(base)
}

// deriveTypeName maps a const name back onto a type name (`myTypeRT` →
// `MyType`) for consts that never had an InferType alias. Generic runtype
// pairs only (see deriveConstName).
func (names *nameTable) deriveTypeName(constName string) string {
	base := strings.TrimSuffix(constName, "RT")
	if base == constName || base == "" {
		base = constName + "Type"
	}
	return names.claim(upperFirst(base))
}

// jsReservedWords guards the drizzle const derivation: stripping Table off a
// type name must never produce a keyword (`NewTable` → `new`).
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

// deriveDrizzleConstName maps a drizzle table type name onto its table const,
// the inverse of deriveDrizzleTypeName: lowercase the first letter
// (`Users$table` → `users$table`). Only reached when the type has no companion
// const to keep, so it needs a free sensible name, not a perfect inverse of a
// collision suffix.
func (names *nameTable) deriveDrizzleConstName(typeName string) string {
	short := lowerFirst(typeName)
	if short != typeName && !names.taken[short] && !jsReservedWords[short] {
		names.taken[short] = true
		return short
	}
	return names.claim(short + "Table")
}

// deriveDrizzleTypeName maps a table const onto its table type name by
// uppercasing the first letter (`users$table` → `Users$table`). A const that is
// ALREADY capitalised gets a `T` instead, since uppercasing would hand the type
// the const's own spelling; further collisions walk T1, T2, … .
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

// claim returns base or a digit-suffixed variant, registering the result;
// "" when 1–9 are all taken.
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

// lineIndentAt returns the whitespace the line containing start opens with —
// what a replacement spliced there has to match on its continuation lines.
func lineIndentAt(source string, start int) string {
	lineStart := strings.LastIndexByte(source[:start], '\n') + 1
	indent := source[lineStart:start]
	if strings.TrimLeft(indent, " \t") != "" {
		return ""
	}
	return indent
}

// indentAfterFirstLine prefixes every line but the first with indent: the first
// line lands where the replaced statement already started.
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

// baseTakenNames are the names visible everywhere in a file: its import
// bindings and its top-level declarations. A nested scope's claims start from
// these, never from the whole file's, so sibling scopes do not crowd each other
// out.
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

// wholeLineSpan is the span a REMOVED statement occupies: its own text plus the
// trailing newline, and — when nothing but whitespace precedes it on the line —
// its leading indentation too. Leaving that indentation behind would push the
// next line out, which is invisible at the top level and obvious inside a block.
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
