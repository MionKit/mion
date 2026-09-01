// imports.go plans this package's import-block edits: it reads the file's own
// imports through internal/tsimports (the scanner both rewriting arms share),
// adds the bindings the converted output needs, and removes managed bindings the
// conversion made unused. The four `@mionjs/run-types*` modules are the managed
// set here. Only statements the scanner fully understands (named imports and/or
// one namespace import, no default import) are ever rewritten; anything else is
// left alone and additions go to a new statement.
package convert

import (
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/tsimports"
)

// The four managed module specifiers, derived from the marker package name.
var (
	moduleCore     = marker.DefaultModule
	moduleBuilders = marker.DefaultModule + "/builders"
	moduleFormats  = marker.DefaultModule + "/formats"
	moduleTemporal = marker.DefaultModule + "/formats/temporal"
)

// isManagedModule is the predicate the shared scanner takes: the modules whose
// bindings managedRoles owns.
func isManagedModule(module string) bool {
	return module == moduleCore || module == moduleBuilders || module == moduleFormats || module == moduleTemporal
}

// The shared scanner's model, under this package's historical spellings.
type (
	namedBinding = tsimports.Binding
	moduleImport = tsimports.Statement
	importScan   = tsimports.Scan
)

// Thin adapters onto the shared scanner, so the planning code below reads as it
// always did.
func scanImports(sourceFile *ast.SourceFile) *importScan {
	return tsimports.ScanFile(sourceFile, isManagedModule)
}

func renderImport(module, namespace string, named []namedBinding) string {
	return tsimports.Render(module, namespace, named)
}

func identifierUsedOutside(sourceFile *ast.SourceFile, local string, scan *importScan, replacements []replacement) bool {
	spans := make([][2]int, 0, len(replacements))
	for _, rep := range replacements {
		spans = append(spans, [2]int{rep.start, rep.end})
	}
	return tsimports.IdentifierUsedOutside(sourceFile, local, scan, spans)
}

// foreignNeed is one cross-file import the printed output needs: the module
// specifier this file reaches the declaration's file through, and the exported
// name. Local carries the binding the printed text actually spelled, which
// differs from the exported name when the file already binds that name from
// somewhere else (drizzle's own `index` beside ours). TypeOnly is false for a
// value need — the drizzle arm imports `tableFromType`, which is called.
type foreignNeed struct {
	moduleSpec string
	typeName   string
	local      string
	typeOnly   bool
}

// binding renders the need as an import binding.
func (need foreignNeed) binding() namedBinding {
	local := need.local
	if local == "" {
		local = need.typeName
	}
	return namedBinding{Imported: need.typeName, Local: local, TypeOnly: need.typeOnly}
}

// importNeeds records which managed bindings the printed output uses, plus
// the cross-file needs: foreign type names to import and existing locals the
// printed references spelled (so removal never strips them).
type importNeeds struct {
	useRT         bool
	useTF         bool
	useTFT        bool
	useGetRunType bool
	useInferType  bool
	useTypeFormat bool
	foreign       map[foreignNeed]bool
	keepLocals    map[string]bool
}

func (needs *importNeeds) addForeign(need foreignNeed) {
	if need.moduleSpec == "" || need.typeName == "" {
		return
	}
	// One canonical key per need, so the same import asked for twice under the
	// same local is one map entry.
	if need.local == "" {
		need.local = need.typeName
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
	for need := range other.foreign {
		needs.addForeign(need)
	}
	for local := range other.keepLocals {
		needs.keepLocal(local)
	}
}

// managedRole ties an importNeeds flag to its module + canonical name.
type managedRole struct {
	roleModule    string
	roleImported  string
	roleNamespace bool
	roleTypeOnly  bool
	needed        func(importNeeds) bool
	roleLocal     func(*nameTable) string
}

var managedRoles = []managedRole{
	{roleModule: moduleCore, roleImported: "getRunType", needed: func(needs importNeeds) bool { return needs.useGetRunType }, roleLocal: func(names *nameTable) string { return names.GetRunType }},
	{roleModule: moduleCore, roleImported: "InferType", roleTypeOnly: true, needed: func(needs importNeeds) bool { return needs.useInferType }, roleLocal: func(names *nameTable) string { return names.InferType }},
	{roleModule: moduleCore, roleImported: "TypeFormat", roleTypeOnly: true, needed: func(needs importNeeds) bool { return needs.useTypeFormat }, roleLocal: func(names *nameTable) string { return names.TypeFormat }},
	{roleModule: moduleBuilders, roleNamespace: true, needed: func(needs importNeeds) bool { return needs.useRT }, roleLocal: func(names *nameTable) string { return names.RT }},
	{roleModule: moduleFormats, roleNamespace: true, needed: func(needs importNeeds) bool { return needs.useTF }, roleLocal: func(names *nameTable) string { return names.TF }},
	{roleModule: moduleTemporal, roleNamespace: true, needed: func(needs importNeeds) bool { return needs.useTFT }, roleLocal: func(names *nameTable) string { return names.TFT }},
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
	for _, module := range []string{moduleCore, moduleBuilders, moduleFormats, moduleTemporal} {
		entry := scan.ByModule[module]
		var finalNamespace string
		var finalNamed []namedBinding
		// fixed* are bindings on statements the plan never touches (read-only
		// extras): they count as present but cannot be edited or removed.
		var fixedNamespace string
		var fixedNamed []namedBinding
		var foldStmts []*moduleImport
		if entry != nil && entry.Managed {
			finalNamespace = entry.Namespace
			finalNamed = append(finalNamed, entry.Named...)
		}
		if entry != nil {
			for _, extra := range entry.Extras {
				if entry.Managed && extra.Foldable() {
					finalNamed = append(finalNamed, extra.Named...)
					foldStmts = append(foldStmts, extra)
					continue
				}
				if extra.Namespace != "" && fixedNamespace == "" {
					fixedNamespace = extra.Namespace
				}
				fixedNamed = append(fixedNamed, extra.Named...)
			}
		}
		for _, role := range managedRoles {
			if role.roleModule != module {
				continue
			}
			local := role.roleLocal(names)
			// A namespace import of a managed module covers EVERY member
			// spelling (the printers then use qualified names), so named
			// roles count as present under it.
			present := finalNamespace != "" || fixedNamespace != ""
			if !present && !role.roleNamespace {
				for _, binding := range append(append([]namedBinding{}, finalNamed...), fixedNamed...) {
					if binding.Imported == role.roleImported {
						present = true
					}
				}
			}
			stillUsed := role.needed(needs) || usedElsewhere(local)
			switch {
			case stillUsed && !present:
				if role.roleNamespace {
					finalNamespace = local
				} else {
					finalNamed = append(finalNamed, namedBinding{Imported: role.roleImported, Local: local, TypeOnly: role.roleTypeOnly})
				}
			case !stillUsed && present && entry != nil && entry.Managed:
				if role.roleNamespace {
					finalNamespace = ""
				} else {
					kept := finalNamed[:0]
					for _, binding := range finalNamed {
						if binding.Imported != role.roleImported {
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
		if entry != nil && entry.Managed {
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
			if entry.Node.Pos() < first.Node.Pos() {
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
	neededByModule := map[string][]foreignNeed{}
	for need := range needs.foreign {
		neededByModule[need.moduleSpec] = append(neededByModule[need.moduleSpec], need)
	}
	foreignModules := make([]string, 0, len(scan.ByModule)+len(neededByModule))
	for module, entry := range scan.ByModule {
		if !entry.Managed {
			foreignModules = append(foreignModules, module)
		}
	}
	for module := range neededByModule {
		if scan.ByModule[module] == nil {
			foreignModules = append(foreignModules, module)
		}
	}
	sort.Strings(foreignModules)
	for _, module := range foreignModules {
		neededNames := append([]foreignNeed(nil), neededByModule[module]...)
		sort.Slice(neededNames, func(left, right int) bool {
			if neededNames[left].typeName != neededNames[right].typeName {
				return neededNames[left].typeName < neededNames[right].typeName
			}
			return neededNames[left].local < neededNames[right].local
		})
		entry := scan.ByModule[module]
		boundAlready := func(name string) bool {
			if entry == nil {
				return false
			}
			for _, binding := range append(append([]namedBinding{}, entry.Named...), entry.ExtraNamedBindings()...) {
				if binding.Imported == name {
					return true
				}
			}
			return false
		}
		if entry == nil || !entry.Rewritable {
			// No statement to extend (or a shape we never rewrite — default
			// import, namespace): still-missing names get their own new
			// statement rather than being silently dropped.
			var namedAdds []namedBinding
			for _, need := range neededNames {
				if !boundAlready(need.typeName) {
					namedAdds = append(namedAdds, need.binding())
				}
			}
			if rendered := renderImport(module, "", namedAdds); rendered != "" {
				additions = append(additions, rendered)
			}
			continue
		}
		finalNamed := make([]namedBinding, 0, len(entry.Named)+len(neededNames))
		for _, existing := range entry.Named {
			drop := removable[existing.Local] && !usedElsewhere(existing.Local) && !needs.keepLocals[existing.Local]
			if !drop {
				finalNamed = append(finalNamed, existing)
			}
		}
		for _, need := range neededNames {
			present := false
			for _, existing := range append(append([]namedBinding{}, finalNamed...), entry.ExtraNamedBindings()...) {
				if existing.Imported == need.typeName {
					present = true
				}
			}
			if !present {
				finalNamed = append(finalNamed, need.binding())
			}
		}
		if len(finalNamed) == len(entry.Named) && len(neededNames) == 0 {
			continue
		}
		appendImportEdit(&edits, source, entry, renderImport(module, "", finalNamed))
	}
	if len(additions) > 0 {
		// Anchor after the last import that SURVIVES this edit — inserting at a
		// removed statement's end would land inside its removal span.
		insertAt := 0
		for _, importEnd := range scan.AllImportEnds {
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
	oldStart := tokenStart(source, entry.Node.Pos())
	oldEnd := entry.Node.End()
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
