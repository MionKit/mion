// importedits.go — splitting the import block.
//
// Drizzle's own suites put the whole boundary in one statement, which is exactly
// the case to handle. From pg-common.ts, 37 of these 51 names move and 13 stay:
//
//	import {alias, bigint, boolean, except, foreignKey, getTableConfig, index, …} from 'drizzle-orm/pg-core';
//
// A migrated export moves under the SAME local (the generator guarantees the
// wrapping package exports it under the same name), so the rewrite is a change of
// module specifier and nothing else. The one exception is an ALIASED export:
// `sql` has to exist on both sides at once — drizzle's builds queries, ours
// records authoring sql — so it stays where it is AND arrives under its alias.
package drizzlemigrate

import (
	"fmt"
	"sort"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/tsimports"
)

// drizzleRootModule is the dialect-agnostic package: where cols() comes from.
const drizzleRootModule = "@mionjs/drizzle-orm"

// toDrizzleLocal returns the local name toDrizzle is imported under for a
// dialect, claiming it on first use. With one dialect in the file that is plain
// `toDrizzle`; a file mixing dialects gets one binding each, since the two
// materializers are different functions.
func (file *fileRun) toDrizzleLocal(dialect string) string {
	if local, ok := file.toDrizzleByDialect[dialect]; ok {
		return local
	}
	rule := file.ruleForDialect(dialect)
	if rule == nil || rule.ToDrizzle == "" {
		return ""
	}
	base := "toDrizzle"
	if len(file.toDrizzleByDialect) > 0 {
		base += upperFirst(dialect)
	}
	local := file.claim(base)
	if local == "" {
		return ""
	}
	if file.toDrizzleByDialect == nil {
		file.toDrizzleByDialect = map[string]string{}
	}
	file.toDrizzleByDialect[dialect] = local
	return local
}

// colsLocal returns the local name cols() is imported under, claiming it on
// first use. A slim table's TYPE is its metadata, so reading a column off one
// goes through the accessor: `index('i').on(cols(users$table).name)`.
func (file *fileRun) colsLocal() string {
	if file.colsBinding != "" {
		return file.colsBinding
	}
	file.colsBinding = file.claim("cols")
	return file.colsBinding
}

func (file *fileRun) ruleForDialect(dialect string) *ModuleRule {
	for index := range file.importMap.Modules {
		if file.importMap.Modules[index].Dialect == dialect {
			return &file.importMap.Modules[index]
		}
	}
	return nil
}

// planImportEdits rewrites every mapped drizzle statement and appends the
// statements the migrated names now come from.
func (file *fileRun) planImportEdits() *Diagnostic {
	// movedByTarget accumulates the bindings each wrapping package must supply.
	movedByTarget := map[string][]tsimports.Binding{}
	var namespaceAdditions []string
	var removedSpans [][2]int

	for _, module := range file.imports.Modules() {
		rule := file.importMap.RuleFor(module)
		if rule == nil {
			continue
		}
		entry := file.imports.ByModule[module]
		for _, statement := range entry.AllStatements() {
			if !statement.Rewritable {
				continue
			}
			var stay []tsimports.Binding
			var moved []tsimports.Binding
			for _, binding := range statement.Named {
				key := bindingKey(module, binding.Local)
				local, moves := file.movedLocal[key]
				if !rule.Migrates(binding.Imported) || !moves {
					stay = append(stay, binding)
					continue
				}
				// A binding used on BOTH sides is imported twice: drizzle's under
				// its own name, ours under the second local decideBindings chose.
				if file.keepDrizzle[key] {
					stay = append(stay, binding)
				}
				moved = append(moved, tsimports.Binding{Imported: binding.Imported, Local: local, TypeOnly: binding.TypeOnly})
			}
			if len(moved) == 0 {
				continue
			}
			movedByTarget[rule.To] = append(movedByTarget[rule.To], moved...)
			file.replaceImportStatement(statement, tsimports.Render(module, statement.Namespace, stay), &removedSpans)
		}
	}

	// A namespace object needs a whole-module import of the slim package, not a
	// binding list: `import * as rtDriz from '@mionjs/drizzle-orm-pg-core'`.
	for _, module := range file.imports.Modules() {
		rule := file.importMap.RuleFor(module)
		if rule == nil {
			continue
		}
		alias := file.namespaceLocal[bindingKey(module, file.imports.NamespaceAlias(module))]
		if alias == "" {
			continue
		}
		namespaceAdditions = append(namespaceAdditions, tsimports.Render(rule.To, alias, nil))
	}

	var additions []string
	targets := make([]string, 0, len(movedByTarget))
	for target := range movedByTarget {
		targets = append(targets, target)
	}
	sort.Strings(targets)
	for _, target := range targets {
		if rendered := tsimports.Render(target, "", movedByTarget[target]); rendered != "" {
			additions = append(additions, rendered)
		}
	}
	if file.colsBinding != "" {
		additions = append(additions, tsimports.Render(drizzleRootModule, "", []tsimports.Binding{{Imported: "cols", Local: file.colsBinding}}))
	}
	// toDrizzle last, so the block reads recorder-first then materializer.
	dialects := make([]string, 0, len(file.toDrizzleByDialect))
	for dialect := range file.toDrizzleByDialect {
		dialects = append(dialects, dialect)
	}
	sort.Strings(dialects)
	for _, dialect := range dialects {
		rule := file.ruleForDialect(dialect)
		local := file.toDrizzleByDialect[dialect]
		additions = append(additions, tsimports.Render(rule.ToDrizzle, "", []tsimports.Binding{{Imported: "toDrizzle", Local: local}}))
	}
	additions = append(namespaceAdditions, additions...)
	if len(additions) == 0 {
		return nil
	}
	insertAt := file.lastSurvivingImportEnd(removedSpans)
	prefix := "\n"
	text := prefix + strings.Join(additions, "\n")
	if insertAt == 0 {
		text = strings.Join(additions, "\n") + "\n"
	}
	file.edits = append(file.edits, edit{start: insertAt, end: insertAt, text: text})
	return nil
}

// replaceImportStatement swaps one statement's text, or removes it (with its
// trailing newline) when nothing is left on the drizzle side.
func (file *fileRun) replaceImportStatement(statement *tsimports.Statement, rendered string, removedSpans *[][2]int) {
	start := tsimports.TokenStart(file.source, statement.Node.Pos())
	end := statement.Node.End()
	if rendered == "" {
		if end < len(file.source) && file.source[end] == '\n' {
			end++
		}
		*removedSpans = append(*removedSpans, [2]int{start, end})
		file.edits = append(file.edits, edit{start: start, end: end, text: ""})
		return
	}
	file.edits = append(file.edits, edit{start: start, end: end, text: rendered})
}

// lastSurvivingImportEnd anchors the additions after the last import that
// SURVIVES this rewrite — inserting at a removed statement's end would land
// inside its own removal span.
func (file *fileRun) lastSurvivingImportEnd(removedSpans [][2]int) int {
	insertAt := 0
	for _, importEnd := range file.imports.AllImportEnds {
		removed := false
		for _, span := range removedSpans {
			if importEnd > span[0] && importEnd <= span[1] {
				removed = true
				break
			}
		}
		if !removed && importEnd > insertAt {
			insertAt = importEnd
		}
	}
	return insertAt
}

func upperFirst(name string) string {
	if name == "" {
		return name
	}
	return strings.ToUpper(name[:1]) + name[1:]
}

// Describe renders a diagnostic the way the CLI prints it.
func (diagnostic Diagnostic) Describe() string {
	severity := "warning"
	if diagnostic.Severity == SeverityError {
		severity = "error"
	}
	where := diagnostic.Decl
	if diagnostic.Line > 0 {
		where = fmt.Sprintf("%s:%d", diagnostic.Decl, diagnostic.Line)
	}
	return fmt.Sprintf("%s %s [%s]: %s", diagnostic.Code, severity, where, diagnostic.Message)
}
