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

// The four managed module specifiers, derived from the marker package name.
var (
	moduleCore       = marker.DefaultModule
	moduleBuilders   = marker.DefaultModule + "/builders"
	moduleFormats    = marker.DefaultModule + "/formats"
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
	stmt      *ast.Node
	module    string
	namespace string
	named     []namedBinding
	// managed marks one of the four runtypes modules whose bindings the
	// role table owns; rewritable marks a statement whose SHAPE this package
	// may rewrite at all (named imports only — no default, no namespace).
	// Foreign modules are rewritable-but-not-managed: bindings are added for
	// cross-file references and removed only when conversion made them unused.
	managed    bool
	rewritable bool
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
		return entry.namespace
	}
	return ""
}

func (scan *importScan) localFor(module, imported string) string {
	if entry := scan.byModule[module]; entry != nil {
		for _, binding := range entry.named {
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
		if entry.namespace != "" {
			locals = append(locals, entry.namespace)
		}
		for _, binding := range entry.named {
			locals = append(locals, binding.local)
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
		ours := module == moduleCore || module == moduleBuilders || module == moduleFormats || module == moduleJSONSchema
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
		// Keep the FIRST statement per module; later duplicates stay untouched.
		if scan.byModule[module] == nil {
			scan.byModule[module] = entry
		}
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
	// Module order is the canonical block order for appended statements.
	for _, module := range []string{moduleCore, moduleBuilders, moduleFormats, moduleJSONSchema} {
		entry := scan.byModule[module]
		var finalNamespace string
		var finalNamed []namedBinding
		if entry != nil && entry.managed {
			finalNamespace = entry.namespace
			finalNamed = append(finalNamed, entry.named...)
		}
		for _, role := range managedRoles {
			if role.module != module {
				continue
			}
			local := role.local(names)
			present := false
			if role.namespace {
				present = finalNamespace != ""
			} else {
				for _, binding := range finalNamed {
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
			appendImportEdit(&edits, source, entry, renderImport(module, finalNamespace, finalNamed))
			continue
		}
		if rendered := renderImport(module, finalNamespace, finalNamed); rendered != "" {
			additions = append(additions, rendered)
		}
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
		if entry == nil {
			var namedAdds []namedBinding
			for _, name := range neededNames {
				namedAdds = append(namedAdds, namedBinding{imported: name, local: name, typeOnly: true})
			}
			if rendered := renderImport(module, "", namedAdds); rendered != "" {
				additions = append(additions, rendered)
			}
			continue
		}
		if !entry.rewritable {
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
			for _, existing := range finalNamed {
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
	if namespace != "" {
		return fmt.Sprintf("import * as %s from '%s';", namespace, module)
	}
	if len(named) == 0 {
		return ""
	}
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
	return fmt.Sprintf("import {%s} from '%s';", strings.Join(parts, ", "), module)
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
			if pos >= entry.stmt.Pos() && pos < entry.stmt.End() {
				return true
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
