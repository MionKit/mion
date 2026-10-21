// Package srcscan is the ONE comment lexer for TypeScript source: a comment is whatever a tsgo PARSE leaves uncovered by a string,
// template-literal or regex TOKEN. That is why `${/* … */ name}` IS a comment and `/*` inside a regex literal is NOT; a text-only lexer
// cannot tell (the slash ambiguity), and a phantom comment there is the false positive that makes a probe match across live code.
// Callers: the enrichment hygiene probes (internal/enrichment/mirror) and the `@mion-expect-error` scan (internal/compiler/resolver).
package srcscan

import (
	"sort"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/scanner"
)

// Span is a half-open [Start, End) byte range over one comment: a `//` line without its newline, a `/* … */` with its delimiters.
// Spans are in text order and never overlap.
type Span struct {
	Start int
	End   int
}

// LiteralTokenRanges collects the byte range of every token whose TEXT is opaque data; the `${…}` interpolations between template parts
// are code and deliberately NOT covered. Ranges include the delimiters and are sorted by start.
// JSDoc nodes are not visited, so a type annotation inside a doc comment never claims a range.
func LiteralTokenRanges(sourceFile *ast.SourceFile) [][2]int {
	if sourceFile == nil {
		return nil
	}
	root := sourceFile.AsNode()
	if root == nil {
		return nil
	}
	var ranges [][2]int
	var visit func(node *ast.Node) bool
	visit = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		switch node.Kind {
		case ast.KindStringLiteral, ast.KindNoSubstitutionTemplateLiteral,
			ast.KindTemplateHead, ast.KindTemplateMiddle, ast.KindTemplateTail,
			ast.KindRegularExpressionLiteral, ast.KindJsxText:
			start := scanner.GetTokenPosOfNode(node, sourceFile, false)
			if end := node.End(); end > start {
				ranges = append(ranges, [2]int{start, end})
			}
			return false
		}
		node.ForEachChild(visit)
		return false
	}
	root.ForEachChild(visit)
	sort.Slice(ranges, func(left, right int) bool { return ranges[left][0] < ranges[right][0] })
	return ranges
}

// Comments walks text once, skipping the opaque literal ranges: with the literals gone, any `//` or `/*` left IS a comment start,
// TypeScript has no other production for those byte pairs. An unterminated block comment runs to EOF.
func Comments(text string, literals [][2]int) []Span {
	var spans []Span
	i, n, nextLiteral := 0, len(text), 0
	for i < n {
		for nextLiteral < len(literals) && literals[nextLiteral][1] <= i {
			nextLiteral++
		}
		if nextLiteral < len(literals) && i >= literals[nextLiteral][0] {
			i = literals[nextLiteral][1]
			nextLiteral++
			continue
		}
		if text[i] == '/' && i+1 < n && text[i+1] == '/' {
			start := i
			for i < n && text[i] != '\n' {
				i++
			}
			spans = append(spans, Span{start, i})
			continue
		}
		if text[i] == '/' && i+1 < n && text[i+1] == '*' {
			start := i
			i += 2
			for i+1 < n && !(text[i] == '*' && text[i+1] == '/') {
				i++
			}
			if i+1 < n {
				i += 2
			} else {
				i = n
			}
			spans = append(spans, Span{start, i})
			continue
		}
		i++
	}
	return spans
}
