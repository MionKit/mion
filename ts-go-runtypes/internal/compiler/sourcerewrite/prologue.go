package sourcerewrite

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
)

// PrologueEnd is the byte offset just past a leading `#!` line and the file's directive prologue
// (`"use client"`, `'use server'`, `"use strict"`, any string-literal directive). The import block must
// land after it: a directive only counts while it is the first statement, and a shebang only on line 1.
// 0 when the file has neither.
func PrologueEnd(sourceFile *ast.SourceFile) int {
	text := sourceFile.Text()
	end := 0
	if strings.HasPrefix(text, "#!") {
		end = len(text)
		if newline := strings.IndexByte(text, '\n'); newline >= 0 {
			end = newline
		}
	}
	for _, statement := range sourceFile.Statements.Nodes {
		if !ast.IsPrologueDirective(statement) {
			break
		}
		end = statement.End()
	}
	return end
}

// placeImportBlock picks where the import block goes for a prologue ending at byte `prologueEnd`: the
// start of the next line when only blanks or comments follow on the prologue's line, so that line stays
// untouched; otherwise right at prologueEnd, behind a newline so the block never fuses onto a directive
// written without `;`. Returns the byte offset and the block text to insert there.
func placeImportBlock(source string, prologueEnd int, importBlock string) (int, string) {
	if prologueEnd == 0 || importBlock == "" {
		return 0, importBlock
	}
	cursor := prologueEnd
	for cursor < len(source) {
		switch {
		case source[cursor] == ' ' || source[cursor] == '\t' || source[cursor] == '\r':
			cursor++
		case source[cursor] == '\n':
			return cursor + 1, importBlock
		case strings.HasPrefix(source[cursor:], "//"):
			newline := strings.IndexByte(source[cursor:], '\n')
			if newline < 0 {
				return prologueEnd, "\n" + importBlock
			}
			return cursor + newline + 1, importBlock
		case strings.HasPrefix(source[cursor:], "/*"):
			closing := strings.Index(source[cursor+2:], "*/")
			if closing < 0 || strings.Contains(source[cursor:cursor+2+closing], "\n") {
				return prologueEnd, "\n" + importBlock
			}
			cursor += 2 + closing + 2
		default:
			return prologueEnd, "\n" + importBlock
		}
	}
	return prologueEnd, "\n" + importBlock
}
