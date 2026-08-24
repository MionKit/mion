package mirror

import (
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/scanner"

	"github.com/mionkit/ts-runtypes/internal/enrichment"
)

// SplitCombined splits a pre-family-split COMBINED mirror (one file holding
// both friendly* and mock* consts) into the two per-family file contents. It is
// the one-shot migration behind the family path segment: the caller writes the
// returned contents to friendlyPath / mockPath and deletes the legacy file.
//
// Every const statement (with its marker/@todo/leading comments) and every
// @rtOrphan carcass is carried VERBATIM into its family's file, in original
// order — authored values are never touched. Only the import header is
// synthesized fresh per family: the source breadcrumb is recomputed relative to
// the family path (the file moves one directory deeper), the DSL import keeps
// only the family's wrapper type, and cross-file value-import lines keep their
// specifiers byte-identical (both endpoints move down one family segment, so
// the relative path between two mirror files is unchanged) with their imported
// names filtered per family. A hand-added statement that is neither an import
// nor an owned const is copied into BOTH files (safe: separate modules), as is
// a value-import name that is neither friendly* nor mock*.
//
// A family with nothing to hold (no consts, no carcasses, no hand-added
// statements) returns nil content so the caller skips that file.
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

// splitItem is one top-level chunk of a combined mirror — a const statement
// (with its leading marker/comments), an @rtOrphan carcass, or a hand-added
// statement — tagged with the families whose split file keeps it.
type splitItem struct {
	start    int
	end      int
	friendly bool
	mock     bool
}

// collectSplitItems walks the combined file's top-level statements and orphan
// carcasses into family-tagged byte ranges. Import declarations are excluded
// (the header is synthesized per family).
func collectSplitItems(index *Index, text string) []splitItem {
	// A statement's byte end → its indexed const entries (a statement normally
	// declares exactly one const; a hand-authored multi-declaration is classified
	// by the union of its vars' families).
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
				// The indexed entry's own trivia start (past any preceding carcass,
				// including its marker) is the authoritative span start.
				if entry.fullStart < item.start {
					item.start = entry.fullStart
				}
			}
		} else {
			item.friendly, item.mock = true, true // hand-added statement — keep in both
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

// friendlyWrapperFromImport returns the friendly-map wrapper name the combined
// file's DSL import actually used — the current `FriendlyText` or the legacy
// `FriendlyText`, whichever it imported — so the split header stays byte-faithful
// to the verbatim-carried const annotations. Defaults to the current name.
func friendlyWrapperFromImport(dslImport *importEntry) string {
	for _, name := range dslImport.names {
		if enrichment.IsFriendlyWrapperName(name) {
			return name
		}
	}
	return enrichment.FriendlyTextName
}

// writeSplitHeader synthesizes one family file's import header from the
// combined file's indexed imports: the recomputed source breadcrumb, the
// family's DSL import, and the family-filtered cross-file value imports.
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
			// Split carries const annotations VERBATIM, so the synthesized import must
			// match the source's friendly wrapper spelling (a pre-family-split combined
			// file predates the friendly-text rename and still reads `FriendlyText`);
			// the next `gen --update` migrates both to `FriendlyText` together.
			wrapper = friendlyWrapperFromImport(index.dslImport)
		}
		builder.WriteString("import type { ")
		builder.WriteString(wrapper)
		builder.WriteString(" } from '@ts-runtypes/core';\n")
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
				kept = append(kept, name) // unknown import — keep in both, never break a hand edit
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
