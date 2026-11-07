package sourcerewrite

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/scanner"
)

// PrologueEnd is the byte offset past a leading `#!` line and the directive prologue (any leading string-literal
// statement: `"use client"`, `'use server'`, `"use strict"`), 0 when the file has neither.
// The import block lands after it: a directive only counts as the first statement, a shebang only on line 1.
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

// placeImportBlock picks the next line when only trivia follows the prologue on its line, leaving that line untouched;
// otherwise prologueEnd behind a newline, so the block never fuses onto a directive written without `;`.
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
