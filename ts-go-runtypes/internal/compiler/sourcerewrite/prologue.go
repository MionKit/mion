package sourcerewrite

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/scanner"
)

// PrologueEnd is the byte offset just past a leading `#!` line and the file's directive prologue
// (`"use client"`, `'use server'`, `"use strict"`, any string-literal directive). The import block must
// land after it: a directive only counts while it is the first statement, and a shebang only on line 1.
// 0 when the file has neither.
func PrologueEnd(sourceFile *ast.SourceFile) int {
	end := len(scanner.GetShebang(sourceFile.Text()))
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
	next := scanner.SkipTriviaEx(source, prologueEnd, &scanner.SkipTriviaOptions{StopAfterLineBreak: true})
	// The first newline must be the one trivia stopped after, not one inside a block comment.
	if newline := strings.IndexByte(source[prologueEnd:], '\n'); newline >= 0 && prologueEnd+newline+1 == next {
		return next, importBlock
	}
	return prologueEnd, "\n" + importBlock
}
