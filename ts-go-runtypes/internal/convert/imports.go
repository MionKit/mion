// imports.go manages the import block: it scans the file's existing
// `@ts-runtypes/core*` imports (so printers reuse the file's own aliases),
// adds the bindings the converted output needs, and removes managed bindings
// the conversion made unused. Only statements this package fully understands
// (named imports and/or one namespace import, no default import) are ever
// rewritten; anything else is left alone and additions go to a new statement.
package convert

import (
	"fmt"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/mionkit/ts-runtypes/internal/compiler/marker"
)

// The five managed module specifiers, derived from the marker package name.
var (
	moduleCore       = marker.DefaultModule
	moduleBuilders   = marker.DefaultModule + "/builders"
	moduleFormats    = marker.DefaultModule + "/formats"
	moduleTemporal   = marker.DefaultModule + "/formats/temporal"
	moduleJSONSchema = marker.DefaultModule + "/json-schema"
)

// foreignNeed is one cross-file type-name import the printed output needs:
// the module specifier this file reaches the declaration's file through, and
// the exported type name.
type foreignNeed struct {
	module string
	name   string
}

// importNeeds records which managed bindings the printed output uses, plus
// the cross-file needs: foreign type names to import and existing locals the
// printed references spelled (so removal never strips them).
type importNeeds struct {
	useRT                    bool
	useTF                    bool
	useTFT                   bool
	useGetRunType            bool
	useInferType             bool
	useTypeFormat            bool
	useRunTypeFromJSONSchema bool
	useEmbedType             bool
	foreign                  map[foreignNeed]bool
	keepLocals               map[string]bool
}

func (needs *importNeeds) addForeign(need foreignNeed) {
	if need.module == "" || need.name == "" {
		return
	}
	if needs.foreign == nil {
		needs.foreign = map[foreignNeed]bool{}
	}
	needs.foreign[need] = true
}

func (needs *importNeeds) keepLocal(local string) {
	if needs.keepLocals == nil {
		needs.keepLocals = map[string]bool{}
	}
	needs.keepLocals[local] = true
}

func (needs *importNeeds) merge(other importNeeds) {
	needs.useRT = needs.useRT || other.useRT
	needs.useTF = needs.useTF || other.useTF
	needs.useTFT = needs.useTFT || other.useTFT
	needs.useGetRunType = needs.useGetRunType || other.useGetRunType
	needs.useInferType = needs.useInferType || other.useInferType
	needs.useTypeFormat = needs.useTypeFormat || other.useTypeFormat
	needs.useRunTypeFromJSONSchema = needs.useRunTypeFromJSONSchema || other.useRunTypeFromJSONSchema
	needs.useEmbedType = needs.useEmbedType || other.useEmbedType
	for need := range other.foreign {
		needs.addForeign(need)
	}
	for local := range other.keepLocals {
		needs.keepLocal(local)
	}
}

// namedBinding is one named import: the exported name, its local alias, and
// whether it is a type-only specifier.
type namedBinding struct {
	imported string
	local    string
	typeOnly bool
}

// moduleImport is one import statement the scan understands.
type moduleImport struct {
	stmt   *ast.Node
	module string
	// namespace is the `* as X` alias, and namespaceTypeOnly records that the
	// statement wrote `import type * as X`. A type-only namespace exists for the
	// type checker only, so adopting it to spell a VALUE (`TF.string()`) emits
	// code that throws `TF is not defined` at runtime — which is what the
	// converted suites hit on a file that imported the formats namespace
	// type-only.
	namespace         string
	namespaceTypeOnly bool
	named             []namedBinding
	// managed marks one of the five runtypes modules whose bindings the
	// role table owns; rewritable marks a statement whose SHAPE this package
	// may rewrite at all (named imports only — no default, no namespace).
	// Foreign modules are rewritable-but-not-managed: bindings are added for
	// cross-file references and removed only when conversion made them unused.
	managed    bool
	rewritable bool
	// Later import statements from the SAME module. A managed named-only
	// extra folds into the canonical managed block (bindings carried forward,
	// statement removed) — the block render itself emits namespace + named as
	// two statements, so its own output MUST re-fold or the layout drifts.
	// Every other shape merges read-only: bindings count as present but the
	// statement is never touched.
	extras []*moduleImport
}

// foldable reports whether this extra statement may be folded into the
// canonical managed block: a managed named-only statement (a namespace extra
// would need a second namespace slot the render does not have).
func (extra *moduleImport) foldable() bool {
	if !extra.managed || !extra.rewritable {
		return false
	}
	// A VALUE namespace statement stays where it is (the block adopts its alias
	// and re-renders it). A TYPE-ONLY one must fold: it binds nothing at
	// runtime, so leaving it alone while the printers spell values through its
	// alias emits `TF is not defined`. Folding re-renders it through
	// renderImport, which always writes a value import — the upgrade. Claiming
	// a second alias instead would work too, but the claim depends on which
	// legs the file has been through, and two chains landing on the same form
	// would disagree on it.
	return extra.namespace == "" || extra.namespaceTypeOnly
}

// extraNamedBindings flattens the named bindings of every extra statement.
func (entry *moduleImport) extraNamedBindings() []namedBinding {
	var named []namedBinding
	for _, extra := range entry.extras {
		named = append(named, extra.named...)
	}
	return named
}

// importScan is the file's managed-import inventory. allImportEnds records
// every import statement's end offset (managed or not) so additions can
// anchor after the last import that SURVIVES the edit.
type importScan struct {
	byModule      map[string]*moduleImport
	lastImportEnd int
	allImportEnds []int
}

func (scan *importScan) namespaceAlias(module string) string {
	if entry := scan.byModule[module]; entry != nil {
		if entry.namespace != "" {
			return entry.namespace
		}
		for _, extra := range entry.extras {
			if extra.namespace != "" {
				return extra.namespace
			}
		}
	}
	return ""
}

func (scan *importScan) localFor(module, imported string) string {
	entry := scan.byModule[module]
	if entry == nil {
		return ""
	}
	for _, statement := range append([]*moduleImport{entry}, entry.extras...) {
		for _, binding := range statement.named {
			if binding.imported == imported {
				return binding.local
			}
		}
	}
	return ""
}

func (scan *importScan) localNames() []string {
	var locals []string
	for _, entry := range scan.byModule {
		for _, statement := range append([]*moduleImport{entry}, entry.extras...) {
			if statement.namespace != "" {
				locals = append(locals, statement.namespace)
			}
			for _, binding := range statement.named {
				locals = append(locals, binding.local)
			}
		}
	}
	return locals
}

// scanImports inventories the file's managed imports.
func scanImports(sourceFile *ast.SourceFile, source string) *importScan {
	scan := &importScan{byModule: map[string]*moduleImport{}}
	root := sourceFile.AsNode()
	if root == nil {
		return scan
	}
	for _, statement := range root.Statements() {
		if statement == nil || !ast.IsImportDeclaration(statement) {
			continue
		}
		if statement.End() > scan.lastImportEnd {
			scan.lastImportEnd = statement.End()
		}
		scan.allImportEnds = append(scan.allImportEnds, statement.End())
		importDecl := statement.AsImportDeclaration()
		if importDecl == nil || importDecl.ModuleSpecifier == nil {
			continue
		}
		module := importDecl.ModuleSpecifier.Text()
		ours := module == moduleCore || module == moduleBuilders || module == moduleFormats ||
			module == moduleTemporal || module == moduleJSONSchema
		entry := &moduleImport{stmt: statement, module: module, managed: ours, rewritable: true}
		clause := importDecl.ImportClause
		if clause == nil {
			entry.managed = false
			entry.rewritable = false
		} else {
			importClause := clause.AsImportClause()
			if importClause.Name() != nil {
				// A default import — never rewritten.
				entry.managed = false
				entry.rewritable = false
			}
			if bindings := importClause.NamedBindings; bindings != nil {
				switch bindings.Kind {
				case ast.KindNamespaceImport:
					entry.namespace = bindings.AsNamespaceImport().Name().Text()
					entry.namespaceTypeOnly = importClause.IsTypeOnly()
					if !ours {
						entry.rewritable = false
					}
				case ast.KindNamedImports:
					for _, element := range bindings.AsNamedImports().Elements.Nodes {
						specifier := element.AsImportSpecifier()
						if specifier == nil {
							continue
						}
						binding := namedBinding{typeOnly: specifier.IsTypeOnly || importClause.IsTypeOnly()}
						binding.local = element.Name().Text()
						binding.imported = binding.local
						if specifier.PropertyName != nil {
							binding.imported = specifier.PropertyName.Text()
						}
						entry.named = append(entry.named, binding)
					}
				}
			}
		}
		// The FIRST statement per module is the primary; later statements
		// merge as extras (foldable or read-only per their own shape).
		if existing := scan.byModule[module]; existing != nil {
			existing.extras = append(existing.extras, entry)
			continue
		}
		scan.byModule[module] = entry
	}
	return scan
}

// managedRole ties an importNeeds flag to its module + canonical name.
type managedRole struct {
	module    string
	imported  string
	namespace bool
	typeOnly  bool
	needed    func(importNeeds) bool
	local     func(*nameTable) string
}

var managedRoles = []managedRole{
	{module: moduleCore, imported: "getRunType", needed: func(needs importNeeds) bool { return needs.useGetRunType }, local: func(names *nameTable) string { return names.GetRunType }},
	{module: moduleCore, imported: "InferType", typeOnly: true, needed: func(needs importNeeds) bool { return needs.useInferType }, local: func(names *nameTable) string { return names.InferType }},
	{module: moduleCore, imported: "TypeFormat", typeOnly: true, needed: func(needs importNeeds) bool { return needs.useTypeFormat }, local: func(names *nameTable) string { return names.TypeFormat }},
	{module: moduleBuilders, namespace: true, needed: func(needs importNeeds) bool { return needs.useRT }, local: func(names *nameTable) string { return names.RT }},
	{module: moduleFormats, namespace: true, needed: func(needs importNeeds) bool { return needs.useTF }, local: func(names *nameTable) string { return names.TF }},
	{module: moduleTemporal, namespace: true, needed: func(needs importNeeds) bool { return needs.useTFT }, local: func(names *nameTable) string { return names.TFT }},
	{module: moduleJSONSchema, imported: "runTypeFromJsonSchema", needed: func(needs importNeeds) bool { return needs.useRunTypeFromJSONSchema }, local: func(names *nameTable) string { return names.RunTypeFromJSONSchema }},
	{module: moduleJSONSchema, imported: "embedType", needed: func(needs importNeeds) bool { return needs.useEmbedType }, local: func(names *nameTable) string { return names.EmbedType }},
}

// planImportEdits computes the import-statement replacements: per managed
// module, the final binding set = existing ∪ needed − (managed ∧ unused);
// per foreign module, needed cross-file type names are added and in-set
// bindings conversion made unused (removable, unreferenced, not spelled by
// any printed reference) are dropped.
func planImportEdits(sourceFile *ast.SourceFile, source string, scan *importScan, needs importNeeds, names *nameTable, replacements []replacement, removable map[string]bool) []replacement {
	usedElsewhere := func(local string) bool {
		return identifierUsedOutside(sourceFile, local, scan, replacements)
	}
	var edits []replacement
	var additions []string
	// The managed modules render as ONE canonical block in the module order
	// below, placed at the FIRST managed statement's position (the others are
	// removed) — or appended with the additions when the file has none. Keeping
	// each managed statement in its own slot made the layout path-dependent: a
	// statement surviving a leg kept its position while one dropped by an
	// earlier leg was re-added after the other imports, so two conversion
	// chains landing on the same form disagreed on import order.
	var managedBlock []string
	var managedStmts []*moduleImport
	for _, module := range []string{moduleCore, moduleBuilders, moduleFormats, moduleTemporal, moduleJSONSchema} {
		entry := scan.byModule[module]
		var finalNamespace string
		var finalNamed []namedBinding
		// fixed* are bindings on statements the plan never touches (read-only
		// extras): they count as present but cannot be edited or removed.
		var fixedNamespace string
		var fixedNamed []namedBinding
		var foldStmts []*moduleImport
		if entry != nil && entry.managed {
			finalNamespace = entry.namespace
			finalNamed = append(finalNamed, entry.named...)
		}
		if entry != nil {
			for _, extra := range entry.extras {
				if entry.managed && extra.foldable() {
					finalNamed = append(finalNamed, extra.named...)
					foldStmts = append(foldStmts, extra)
					continue
				}
				if extra.namespace != "" && fixedNamespace == "" {
					fixedNamespace = extra.namespace
				}
				fixedNamed = append(fixedNamed, extra.named...)
			}
		}
		for _, role := range managedRoles {
			if role.module != module {
				continue
			}
			local := role.local(names)
			// A namespace import of a managed module covers EVERY member
			// spelling (the printers then use qualified names), so named
			// roles count as present under it.
			present := finalNamespace != "" || fixedNamespace != ""
			if !present && !role.namespace {
				for _, binding := range append(append([]namedBinding{}, finalNamed...), fixedNamed...) {
					if binding.imported == role.imported {
						present = true
					}
				}
			}
			stillUsed := role.needed(needs) || usedElsewhere(local)
			switch {
			case stillUsed && !present:
				if role.namespace {
					finalNamespace = local
				} else {
					finalNamed = append(finalNamed, namedBinding{imported: role.imported, local: local, typeOnly: role.typeOnly})
				}
			case !stillUsed && present && entry != nil && entry.managed:
				if role.namespace {
					finalNamespace = ""
				} else {
					kept := finalNamed[:0]
					for _, binding := range finalNamed {
						if binding.imported != role.imported {
							kept = append(kept, binding)
						}
					}
					finalNamed = kept
				}
			}
		}
		// Unmanaged bindings on an unmanaged statement stay by definition; on a
		// managed statement every non-role binding was carried into finalNamed
		// and survives unless its own local is unused AND it is one of ours —
		// non-role bindings are never removed.
		if entry != nil && entry.managed {
			managedStmts = append(managedStmts, entry)
			managedStmts = append(managedStmts, foldStmts...)
		}
		if rendered := renderImport(module, finalNamespace, finalNamed); rendered != "" {
			managedBlock = append(managedBlock, rendered)
		}
	}
	if len(managedStmts) > 0 {
		first := managedStmts[0]
		for _, entry := range managedStmts[1:] {
			if entry.stmt.Pos() < first.stmt.Pos() {
				first = entry
			}
		}
		appendImportEdit(&edits, source, first, strings.Join(managedBlock, "\n"))
		for _, entry := range managedStmts {
			if entry != first {
				appendImportEdit(&edits, source, entry, "")
			}
		}
	} else {
		additions = append(additions, managedBlock...)
	}
	// Foreign modules, in deterministic order.
	neededByModule := map[string][]string{}
	for need := range needs.foreign {
		neededByModule[need.module] = append(neededByModule[need.module], need.name)
	}
	foreignModules := make([]string, 0, len(scan.byModule)+len(neededByModule))
	for module, entry := range scan.byModule {
		if !entry.managed {
			foreignModules = append(foreignModules, module)
		}
	}
	for module := range neededByModule {
		if scan.byModule[module] == nil {
			foreignModules = append(foreignModules, module)
		}
	}
	sort.Strings(foreignModules)
	for _, module := range foreignModules {
		neededNames := append([]string(nil), neededByModule[module]...)
		sort.Strings(neededNames)
		entry := scan.byModule[module]
		boundAlready := func(name string) bool {
			if entry == nil {
				return false
			}
			for _, binding := range append(append([]namedBinding{}, entry.named...), entry.extraNamedBindings()...) {
				if binding.imported == name {
					return true
				}
			}
			return false
		}
		if entry == nil || !entry.rewritable {
			// No statement to extend (or a shape we never rewrite — default
			// import, namespace): still-missing names get their own new
			// statement rather than being silently dropped.
			var namedAdds []namedBinding
			for _, name := range neededNames {
				if !boundAlready(name) {
					namedAdds = append(namedAdds, namedBinding{imported: name, local: name, typeOnly: true})
				}
			}
			if rendered := renderImport(module, "", namedAdds); rendered != "" {
				additions = append(additions, rendered)
			}
			continue
		}
		finalNamed := make([]namedBinding, 0, len(entry.named)+len(neededNames))
		for _, existing := range entry.named {
			drop := removable[existing.local] && !usedElsewhere(existing.local) && !needs.keepLocals[existing.local]
			if !drop {
				finalNamed = append(finalNamed, existing)
			}
		}
		for _, name := range neededNames {
			present := false
			for _, existing := range append(append([]namedBinding{}, finalNamed...), entry.extraNamedBindings()...) {
				if existing.imported == name {
					present = true
				}
			}
			if !present {
				finalNamed = append(finalNamed, namedBinding{imported: name, local: name, typeOnly: true})
			}
		}
		if len(finalNamed) == len(entry.named) && len(neededNames) == 0 {
			continue
		}
		appendImportEdit(&edits, source, entry, renderImport(module, "", finalNamed))
	}
	if len(additions) > 0 {
		// Anchor after the last import that SURVIVES this edit — inserting at a
		// removed statement's end would land inside its removal span.
		insertAt := 0
		for _, importEnd := range scan.allImportEnds {
			removed := false
			for _, edit := range edits {
				if edit.text == "" && importEnd > edit.start && importEnd <= edit.end {
					removed = true
					break
				}
			}
			if !removed && importEnd > insertAt {
				insertAt = importEnd
			}
		}
		prefix := "\n"
		if insertAt == 0 {
			prefix = ""
		}
		text := prefix + strings.Join(additions, "\n")
		if insertAt == 0 {
			text += "\n"
		}
		edits = append(edits, replacement{start: insertAt, end: insertAt, text: text})
	}
	return edits
}

// appendImportEdit records the replacement for one rewritten import
// statement: a changed statement replaces its span, an emptied one is removed
// with its trailing newline, an identical render is skipped.
func appendImportEdit(edits *[]replacement, source string, entry *moduleImport, newText string) {
	oldStart := tokenStart(source, entry.stmt.Pos())
	oldEnd := entry.stmt.End()
	if newText == "" {
		if oldEnd < len(source) && source[oldEnd] == '\n' {
			oldEnd++
		}
		*edits = append(*edits, replacement{start: oldStart, end: oldEnd, text: ""})
		return
	}
	if newText != source[oldStart:oldEnd] {
		*edits = append(*edits, replacement{start: oldStart, end: oldEnd, text: newText})
	}
}

// renderImport renders one import statement; "" when it has no bindings left.
// A namespace and named bindings never share one statement (TS forbids it) —
// managed modules only ever carry one shape, so namespace wins if both.
func renderImport(module, namespace string, named []namedBinding) string {
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
		sorted := make([]namedBinding, len(named))
		copy(sorted, named)
		sort.Slice(sorted, func(a, b int) bool { return sorted[a].imported < sorted[b].imported })
		var parts []string
		for _, binding := range sorted {
			part := binding.imported
			if binding.local != binding.imported {
				part += " as " + binding.local
			}
			if binding.typeOnly {
				part = "type " + part
			}
			parts = append(parts, part)
		}
		statements = append(statements, fmt.Sprintf("import {%s} from '%s';", strings.Join(parts, ", "), module))
	}
	return strings.Join(statements, "\n")
}

// identifierUsedOutside reports whether local is referenced anywhere outside
// the managed import statements and the replaced spans — i.e. whether the
// binding is still needed by code the conversion did not touch.
func identifierUsedOutside(sourceFile *ast.SourceFile, local string, scan *importScan, replacements []replacement) bool {
	if local == "" {
		return false
	}
	inReplaced := func(pos int) bool {
		for _, rep := range replacements {
			if pos >= rep.start && pos < rep.end {
				return true
			}
		}
		return false
	}
	inImports := func(pos int) bool {
		for _, entry := range scan.byModule {
			for _, statement := range append([]*moduleImport{entry}, entry.extras...) {
				if pos >= statement.stmt.Pos() && pos < statement.stmt.End() {
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
		if ast.IsIdentifier(node) && node.Text() == local && !inImports(node.Pos()) && !inReplaced(node.Pos()) {
			used = true
			return true
		}
		node.ForEachChild(walk)
		return used
	}
	sourceFile.AsNode().ForEachChild(walk)
	return used
}
