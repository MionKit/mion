package convert

// imports.go plans this package's import-block edits through internal/tsimports, the scanner both
// rewriting arms share: it adds the bindings the converted output needs and removes managed ones the
// conversion made unused, the four `@mionjs/run-types*` modules being the managed set. Only
// statements the scanner fully understands (named imports and at most one namespace import, no
// default import) are rewritten; anything else is left alone and additions go to a new statement.

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

// isManagedModule is the predicate the shared scanner takes: the modules managedRoles owns.
func isManagedModule(module string) bool {
	return module == moduleCore || module == moduleBuilders || module == moduleFormats || module == moduleTemporal
}

// The shared scanner's model, under this package's historical spellings.
type (
	namedBinding = tsimports.Binding
	moduleImport = tsimports.Statement
	importScan   = tsimports.Scan
)

// Thin adapters onto the shared scanner, under this package's own spellings.
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

// foreignNeed is one cross-file import the printed output needs. Local is the binding the printed
// text spelled, which differs from the exported name when the file already binds that name from
// somewhere else. TypeOnly is false for a value need, such as the drizzle arm's `tableFromType`.
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

// importNeeds records which managed bindings the printed output uses, plus the foreign names to
// import and the existing locals the printed references spelled, so removal never strips them.
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
	// One canonical key per need, so the same import asked for twice is one map entry.
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

// planImportEdits computes the import-statement replacements: per managed module the final binding
// set is existing ∪ needed − (managed ∧ unused); per foreign module the needed cross-file names are
// added and in-set bindings the conversion made unused are dropped.
func planImportEdits(sourceFile *ast.SourceFile, source string, scan *importScan, needs importNeeds, names *nameTable, replacements []replacement, removable map[string]bool) []replacement {
	usedElsewhere := func(local string) bool {
		return identifierUsedOutside(sourceFile, local, scan, replacements)
	}
	var edits []replacement
	var additions []string
	// The managed modules render as ONE canonical block at the FIRST managed statement's position,
	// the others removed, or appended with the additions when the file has none. Keeping each
	// managed statement in its own slot made the layout path-dependent, so two conversion chains
	// landing on the same form disagreed on import order.
	var managedBlock []string
	var managedStmts []*moduleImport
	for _, module := range []string{moduleCore, moduleBuilders, moduleFormats, moduleTemporal} {
		entry := scan.ByModule[module]
		var finalNamespace string
		var finalNamed []namedBinding
		// fixed* are bindings on statements the plan never touches: present, but not editable.
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
			// A namespace import of a managed module covers EVERY member spelling, the printers using
			// qualified names, so named roles count as present under it.
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
		// A non-role binding is never removed: on a managed statement it was carried into finalNamed
		// and survives there.
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
			// No statement to extend, or a shape we never rewrite, so still-missing names get their
			// own new statement rather than being dropped.
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
		// Anchor after the last import that SURVIVES this edit: a removed statement's end lies inside
		// its own removal span.
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

// appendImportEdit records one import statement's replacement: a changed statement replaces its
// span, an emptied one is removed with its trailing newline, an identical render is skipped.
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
