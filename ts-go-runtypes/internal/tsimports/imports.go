// Package tsimports is the import-block inventory shared by the source-rewriting
// arms of the CLI: `convert` (between the authoring forms) and `drizzlemigrate`
// (drizzle onto the slim @mionjs/drizzle-orm-* packages).
//
// It answers the questions both arms ask of a file's imports — which local binds
// which exported name from which module, does a namespace alias already exist,
// is this identifier still referenced outside the spans we are about to replace —
// and renders statements back. It deliberately stops there: WHICH bindings a
// rewrite needs, and where the new statements go, is each arm's own planning, and
// the two genuinely differ (convert folds four @mionjs/run-types* modules into one
// canonical block; drizzlemigrate splits one drizzle statement in two by an
// export's migration status).
//
// The managed-module set is a predicate the caller supplies. It used to be four
// package-level vars pinned to @mionjs/run-types*, which is what kept this code
// from serving anything but convert.
package tsimports

import (
	"fmt"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
)

// Binding is one named import: the exported name, its local alias, and whether
// it is a type-only specifier.
type Binding struct {
	Imported string
	Local    string
	TypeOnly bool
}

// Statement is one import statement the scan understands.
type Statement struct {
	Node   *ast.Node
	Module string
	// Namespace is the `* as X` alias, and NamespaceTypeOnly records that the
	// statement wrote `import type * as X`. A type-only namespace exists for the
	// type checker only, so adopting it to spell a VALUE (`TF.string()`) emits
	// code that throws `TF is not defined` at runtime — which is what the
	// converted suites hit on a file that imported the formats namespace
	// type-only.
	Namespace         string
	NamespaceTypeOnly bool
	Named             []Binding
	// Managed marks a module whose bindings the caller's role table owns;
	// Rewritable marks a statement whose SHAPE may be rewritten at all (named
	// imports only — no default, no namespace). Unmanaged-but-rewritable is the
	// normal case for a foreign module: bindings may be added or dropped.
	Managed    bool
	Rewritable bool
	// Extras are later import statements from the SAME module. A managed
	// named-only extra folds into the canonical managed block (bindings carried
	// forward, statement removed) — the block render itself emits namespace +
	// named as two statements, so its own output MUST re-fold or the layout
	// drifts. Every other shape merges read-only: bindings count as present but
	// the statement is never touched.
	Extras []*Statement
}

// Foldable reports whether this extra statement may be folded into the caller's
// canonical managed block: a managed named-only statement (a namespace extra
// would need a second namespace slot the render does not have).
func (extra *Statement) Foldable() bool {
	if !extra.Managed || !extra.Rewritable {
		return false
	}
	// A VALUE namespace statement stays where it is (the block adopts its alias
	// and re-renders it). A TYPE-ONLY one must fold: it binds nothing at
	// runtime, so leaving it alone while the printers spell values through its
	// alias emits `TF is not defined`. Folding re-renders it through Render,
	// which always writes a value import — the upgrade. Claiming a second alias
	// instead would work too, but the claim depends on which legs the file has
	// been through, and two chains landing on the same form would disagree on it.
	return extra.Namespace == "" || extra.NamespaceTypeOnly
}

// ExtraNamedBindings flattens the named bindings of every extra statement.
func (entry *Statement) ExtraNamedBindings() []Binding {
	var named []Binding
	for _, extra := range entry.Extras {
		named = append(named, extra.Named...)
	}
	return named
}

// AllStatements is the entry plus its extras, in source order of discovery.
func (entry *Statement) AllStatements() []*Statement {
	return append([]*Statement{entry}, entry.Extras...)
}

// Scan is the file's import inventory. AllImportEnds records every import
// statement's end offset (managed or not) so additions can anchor after the last
// import that SURVIVES the edit.
type Scan struct {
	ByModule      map[string]*Statement
	LastImportEnd int
	AllImportEnds []int
}

// NamespaceAlias returns the `* as X` alias bound for module, or "".
func (scan *Scan) NamespaceAlias(module string) string {
	if entry := scan.ByModule[module]; entry != nil {
		if entry.Namespace != "" {
			return entry.Namespace
		}
		for _, extra := range entry.Extras {
			if extra.Namespace != "" {
				return extra.Namespace
			}
		}
	}
	return ""
}

// LocalFor returns the local name bound to module's `imported` export, or "".
func (scan *Scan) LocalFor(module, imported string) string {
	entry := scan.ByModule[module]
	if entry == nil {
		return ""
	}
	for _, statement := range entry.AllStatements() {
		for _, binding := range statement.Named {
			if binding.Imported == imported {
				return binding.Local
			}
		}
	}
	return ""
}

// LocalNames is every local this file's imports bind, namespaces included.
func (scan *Scan) LocalNames() []string {
	var locals []string
	for _, entry := range scan.ByModule {
		for _, statement := range entry.AllStatements() {
			if statement.Namespace != "" {
				locals = append(locals, statement.Namespace)
			}
			for _, binding := range statement.Named {
				locals = append(locals, binding.Local)
			}
		}
	}
	return locals
}

// Modules lists the scanned module specifiers, sorted, so callers iterate
// deterministically.
func (scan *Scan) Modules() []string {
	modules := make([]string, 0, len(scan.ByModule))
	for module := range scan.ByModule {
		modules = append(modules, module)
	}
	sort.Strings(modules)
	return modules
}

// ScanFile inventories a file's imports. isManaged marks the modules whose
// bindings the caller owns; pass nil when no module is managed (every statement
// is then foreign-but-rewritable, which is what drizzlemigrate wants).
func ScanFile(sourceFile *ast.SourceFile, isManaged func(module string) bool) *Scan {
	scan := &Scan{ByModule: map[string]*Statement{}}
	root := sourceFile.AsNode()
	if root == nil {
		return scan
	}
	for _, statement := range root.Statements() {
		if statement == nil || !ast.IsImportDeclaration(statement) {
			continue
		}
		if statement.End() > scan.LastImportEnd {
			scan.LastImportEnd = statement.End()
		}
		scan.AllImportEnds = append(scan.AllImportEnds, statement.End())
		importDecl := statement.AsImportDeclaration()
		if importDecl == nil || importDecl.ModuleSpecifier == nil {
			continue
		}
		module := importDecl.ModuleSpecifier.Text()
		ours := isManaged != nil && isManaged(module)
		entry := &Statement{Node: statement, Module: module, Managed: ours, Rewritable: true}
		clause := importDecl.ImportClause
		if clause == nil {
			entry.Managed = false
			entry.Rewritable = false
		} else {
			importClause := clause.AsImportClause()
			if importClause.Name() != nil {
				// A default import — never rewritten.
				entry.Managed = false
				entry.Rewritable = false
			}
			if bindings := importClause.NamedBindings; bindings != nil {
				switch bindings.Kind {
				case ast.KindNamespaceImport:
					entry.Namespace = bindings.AsNamespaceImport().Name().Text()
					entry.NamespaceTypeOnly = importClause.IsTypeOnly()
					if !ours {
						entry.Rewritable = false
					}
				case ast.KindNamedImports:
					for _, element := range bindings.AsNamedImports().Elements.Nodes {
						specifier := element.AsImportSpecifier()
						if specifier == nil {
							continue
						}
						binding := Binding{TypeOnly: specifier.IsTypeOnly || importClause.IsTypeOnly()}
						binding.Local = element.Name().Text()
						binding.Imported = binding.Local
						if specifier.PropertyName != nil {
							binding.Imported = specifier.PropertyName.Text()
						}
						entry.Named = append(entry.Named, binding)
					}
				}
			}
		}
		// The FIRST statement per module is the primary; later statements merge
		// as extras (foldable or read-only per their own shape).
		if existing := scan.ByModule[module]; existing != nil {
			existing.Extras = append(existing.Extras, entry)
			continue
		}
		scan.ByModule[module] = entry
	}
	return scan
}

// Render renders one import statement; "" when it has no bindings left.
func Render(module, namespace string, named []Binding) string {
	// Namespace and named bindings render as SEPARATE statements — TS has no
	// combined form, and the historical namespace-wins render silently DROPPED
	// user named bindings (their locals are referenced by user code a managed
	// namespace does not cover), leaving the output path-dependent and, for a
	// used binding, broken.
	var statements []string
	if namespace != "" {
		statements = append(statements, fmt.Sprintf("import * as %s from '%s';", namespace, module))
	}
	if len(named) > 0 {
		sorted := make([]Binding, len(named))
		copy(sorted, named)
		sort.Slice(sorted, func(a, b int) bool { return sorted[a].Imported < sorted[b].Imported })
		var parts []string
		for _, binding := range sorted {
			part := binding.Imported
			if binding.Local != binding.Imported {
				part += " as " + binding.Local
			}
			if binding.TypeOnly {
				part = "type " + part
			}
			parts = append(parts, part)
		}
		statements = append(statements, fmt.Sprintf("import {%s} from '%s';", strings.Join(parts, ", "), module))
	}
	return strings.Join(statements, "\n")
}

// IdentifierUsedOutside reports whether local is referenced anywhere outside the
// scanned import statements and the given spans — i.e. whether the binding is
// still needed by code the rewrite did not touch. Spans are [start, end) byte
// offsets of the replacements the caller is about to apply.
func IdentifierUsedOutside(sourceFile *ast.SourceFile, local string, scan *Scan, spans [][2]int) bool {
	if local == "" {
		return false
	}
	inSpans := func(pos int) bool {
		for _, span := range spans {
			if pos >= span[0] && pos < span[1] {
				return true
			}
		}
		return false
	}
	inImports := func(pos int) bool {
		for _, entry := range scan.ByModule {
			for _, statement := range entry.AllStatements() {
				if pos >= statement.Node.Pos() && pos < statement.Node.End() {
					return true
				}
			}
		}
		return false
	}
	used := false
	var walk func(node *ast.Node) bool
	walk = func(node *ast.Node) bool {
		if node == nil || used {
			return used
		}
		if ast.IsIdentifier(node) && node.Text() == local && !inImports(node.Pos()) && !inSpans(node.Pos()) {
			used = true
			return true
		}
		node.ForEachChild(walk)
		return used
	}
	sourceFile.AsNode().ForEachChild(walk)
	return used
}

// TokenStart returns the byte offset of the first non-trivia character at or
// after pos — a statement's real start, leaving leading JSDoc/comments outside
// the replaced span so they survive the rewrite.
func TokenStart(source string, pos int) int {
	offset := pos
	for offset < len(source) {
		switch {
		case source[offset] == ' ' || source[offset] == '\t' || source[offset] == '\n' || source[offset] == '\r':
			offset++
		case strings.HasPrefix(source[offset:], "//"):
			lineEnd := strings.IndexByte(source[offset:], '\n')
			if lineEnd < 0 {
				return len(source)
			}
			offset += lineEnd + 1
		case strings.HasPrefix(source[offset:], "/*"):
			blockEnd := strings.Index(source[offset+2:], "*/")
			if blockEnd < 0 {
				return len(source)
			}
			offset += 2 + blockEnd + 2
		default:
			return offset
		}
	}
	return offset
}

// ImportedNameOf resolves the EXPORTED name behind a callee identifier: the
// member name for a namespace access, the import specifier's property name for
// a renamed named import (`uuid as pgUuid` answers "uuid"), the identifier's own
// text otherwise. Both rewriting arms need it to see past a local alias.
func ImportedNameOf(typeChecker *checker.Checker, nameNode *ast.Node) string {
	if nameNode.Parent != nil && ast.IsPropertyAccessExpression(nameNode.Parent) &&
		nameNode.Parent.AsPropertyAccessExpression().Name() == nameNode {
		return nameNode.Text()
	}
	symbol := typeChecker.GetSymbolAtLocation(nameNode)
	if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias == 0 {
		return nameNode.Text()
	}
	aliasDecl := checker.Checker_getDeclarationOfAliasSymbol(typeChecker, symbol)
	if aliasDecl != nil && ast.IsImportSpecifier(aliasDecl) {
		if propertyName := aliasDecl.AsImportSpecifier().PropertyName; propertyName != nil {
			return propertyName.Text()
		}
	}
	return nameNode.Text()
}

// IsNamespaceImport reports whether an identifier binds a whole module
// (`import * as pg from 'drizzle-orm/pg-core'`) rather than one of its exports.
// The two spellings need different rewrites: a named binding moves modules, a
// namespace member is reached through its object.
func IsNamespaceImport(typeChecker *checker.Checker, nameNode *ast.Node) bool {
	symbol := typeChecker.GetSymbolAtLocation(nameNode)
	if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias == 0 {
		return false
	}
	declaration := checker.Checker_getDeclarationOfAliasSymbol(typeChecker, symbol)
	return declaration != nil && ast.IsNamespaceImport(declaration)
}

// ModuleOfImport returns the module specifier an identifier's binding was
// imported from, or "" when it is not an import at all (a local, a parameter, a
// shadowing declaration). This is what makes recognition shadowing-safe: a test
// body's `const pgTable = pgTableCreator(...)` answers "", not the dialect
// module its outer import came from.
func ModuleOfImport(typeChecker *checker.Checker, nameNode *ast.Node) string {
	symbol := typeChecker.GetSymbolAtLocation(nameNode)
	if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias == 0 {
		return ""
	}
	aliasDecl := checker.Checker_getDeclarationOfAliasSymbol(typeChecker, symbol)
	if aliasDecl == nil {
		return ""
	}
	for node := aliasDecl; node != nil; node = node.Parent {
		if !ast.IsImportDeclaration(node) {
			continue
		}
		if specifier := node.AsImportDeclaration().ModuleSpecifier; specifier != nil {
			return specifier.Text()
		}
		return ""
	}
	return ""
}
