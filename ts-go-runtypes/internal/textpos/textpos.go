// Package textpos converts byte offsets into 1-based line/column coordinates and diagnostics.Site spans.
// It lives here because diagnostics stays ast-free and the purefns extractor must not import the resolver.
package textpos

import (
	"sort"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

// LineCol returns the 1-based line/column for byte offset pos; the cached ECMA line map avoids an O(sites × file size) re-walk.
func LineCol(sourceFile *ast.SourceFile, pos int) (int, int) {
	if pos > len(sourceFile.Text()) {
		pos = len(sourceFile.Text())
	}
	lineMap := sourceFile.ECMALineMap()
	idx := sort.Search(len(lineMap), func(i int) bool { return int(lineMap[i]) > pos }) - 1
	if idx < 0 {
		return 1, pos + 1
	}
	return idx + 1, pos - int(lineMap[idx]) + 1
}

// NodeSite builds a 1-based Site spanning node; filePath is the caller's: the resolver normalizes paths, the extractor does not.
func NodeSite(filePath string, sourceFile *ast.SourceFile, node *ast.Node) diagnostics.Site {
	if sourceFile == nil || node == nil {
		return diagnostics.Site{}
	}
	startLine, startCol := LineCol(sourceFile, node.Pos())
	endLine, endCol := LineCol(sourceFile, node.End())
	return diagnostics.Site{FilePath: filePath, StartLine: startLine, StartCol: startCol, EndLine: endLine, EndCol: endCol}
}
