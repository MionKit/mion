package mirror

import (
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/scanner"

	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment"
)

// SplitCombined splits a pre-family-split COMBINED mirror into the two per-family contents, the caller writing them and
// deleting the legacy file. Every const and carcass is carried VERBATIM in original order, so authored values never change.
// Only the header is synthesized: the breadcrumb is recomputed for the deeper path, the DSL import keeps the family wrapper,
// and a cross-file value specifier stays byte-identical because both endpoints move down one segment.
// A statement or imported name belonging to neither family is copied into BOTH files; a family with nothing returns nil.
func SplitCombined(legacyPath string, existing []byte, friendlyPath, mockPath, sourceFile string) (friendlyOut, mockOut []byte, err error) {
	index, err := ParseMirror(legacyPath, existing)
	if err != nil {
		return nil, nil, err
	}
	text := string(existing)

	items := collectSplitItems(index, text)
	if len(items) == 0 {
		return nil, nil, nil
	}
	sort.SliceStable(items, func(left, right int) bool { return items[left].start < items[right].start })

	assemble := func(friendly bool, mirrorPath string) []byte {
		var blocks []string
		for _, item := range items {
			if (friendly && !item.friendly) || (!friendly && !item.mock) {
				continue
			}
			block := strings.TrimRight(strings.TrimLeft(text[item.start:item.end], " \t\r\n"), "\n")
			if block == "" {
				continue
			}
			blocks = append(blocks, block)
		}
		if len(blocks) == 0 {
			return nil
		}
		var builder strings.Builder
		writeSplitHeader(&builder, index, text, mirrorPath, sourceFile, friendly)
		builder.WriteString(strings.Join(blocks, "\n\n"))
		builder.WriteString("\n")
		return []byte(builder.String())
	}

	return assemble(true, friendlyPath), assemble(false, mockPath), nil
}

// splitItem is one top-level chunk of a combined mirror, tagged with the families whose split file keeps it.
type splitItem struct {
	start    int
	end      int
	friendly bool
	mock     bool
}

// collectSplitItems tags each top-level statement and carcass with its families; imports are excluded, the header is fresh.
func collectSplitItems(index *Index, text string) []splitItem {
	// Keyed by statement end; a hand-authored multi-declaration is classified by the union of its vars' families.
	entriesByEnd := map[int][]*constEntry{}
	for _, entry := range index.consts {
		entriesByEnd[entry.end] = append(entriesByEnd[entry.end], entry)
	}

	var items []splitItem
	root := index.sourceFile.AsNode()
	if root == nil {
		return nil
	}
	for _, statement := range root.Statements() {
		if statement == nil || ast.IsImportDeclaration(statement) {
			continue
		}
		tokenStart := scanner.GetTokenPosOfNode(statement, index.sourceFile, false)
		start := ownTriviaStart(text, statement.Pos(), tokenStart)
		item := splitItem{start: start, end: statement.End()}
		if owned := entriesByEnd[statement.End()]; len(owned) > 0 {
			for _, entry := range owned {
				if entry.isFriendly {
					item.friendly = true
				} else {
					item.mock = true
				}
				// The indexed entry's own trivia start, past any preceding carcass, is the authoritative span start.
				if entry.fullStart < item.start {
					item.start = entry.fullStart
				}
			}
		} else {
			item.friendly, item.mock = true, true // a hand-added statement is kept in both
		}
		items = append(items, item)
	}

	for _, carcass := range index.orphanCarcasses {
		varName := carcassVarName(carcass.inner)
		item := splitItem{start: carcass.start, end: carcass.end}
		switch {
		case isFriendlyVar(varName):
			item.friendly = true
		case isMockVar(varName):
			item.mock = true
		default:
			item.friendly, item.mock = true, true
		}
		items = append(items, item)
	}
	return items
}

// friendlyWrapperFromImport returns the wrapper spelling the combined file imported, current or legacy, so the split
// header stays byte-faithful to the verbatim-carried annotations; it defaults to the current name.
func friendlyWrapperFromImport(dslImport *importEntry) string {
	for _, name := range dslImport.names {
		if enrichment.IsFriendlyWrapperName(name) {
			return name
		}
	}
	return enrichment.FriendlyTextName
}

// writeSplitHeader synthesizes one family's header: the recomputed breadcrumb, its DSL import, its filtered value imports.
func writeSplitHeader(builder *strings.Builder, index *Index, text, mirrorPath, sourceFile string, friendly bool) {
	if index.breadcrumb != nil && len(index.breadcrumb.names) > 0 {
		builder.WriteString("import type { ")
		builder.WriteString(strings.Join(index.breadcrumb.names, ", "))
		builder.WriteString(" } from '")
		builder.WriteString(ImportSpecifier(mirrorPath, sourceFile))
		builder.WriteString("';\n")
	}
	if index.dslImport != nil {
		wrapper := enrichment.MockDataName
		if friendly {
			// Annotations are carried VERBATIM, so the import must match the source's spelling, `FriendlyType` on a file
			// predating the rename; the next `enrich --update` migrates annotation and import to `FriendlyText` together.
			wrapper = friendlyWrapperFromImport(index.dslImport)
		}
		builder.WriteString("import type { ")
		builder.WriteString(wrapper)
		builder.WriteString(" } from '@mionjs/run-types';\n")
	}
	for _, valueImport := range index.valueImports {
		var kept []string
		for _, name := range valueImport.names {
			switch {
			case isFriendlyVar(name):
				if friendly {
					kept = append(kept, name)
				}
			case isMockVar(name):
				if !friendly {
					kept = append(kept, name)
				}
			default:
				kept = append(kept, name) // an unknown import is kept in both, never breaking a hand edit
			}
		}
		if len(kept) == 0 {
			continue
		}
		builder.WriteString("import { ")
		builder.WriteString(strings.Join(kept, ", "))
		builder.WriteString(" } from '")
		builder.WriteString(valueImport.specifier)
		builder.WriteString("';\n")
	}
	builder.WriteString("\n")
}
