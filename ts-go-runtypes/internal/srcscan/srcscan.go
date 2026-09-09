// Package srcscan is the ONE comment lexer for TypeScript source, shared by
// every pass that needs to know where the real comments of a file are.
//
// Comments are derived from a tsgo PARSE rather than a hand-rolled lexer. The
// parser is the oracle for where the string, template-literal and regex TOKENS
// sit; comments are then found by a single linear pass over everything those
// tokens do not cover. That construction is what makes the spans exact where a
// text-only lexer cannot be:
//
//   - a comment inside a template interpolation (`${/* … */ name}`) IS a
//     comment, because the interpolation is code between two template-literal
//     tokens, never inside one;
//   - `/*` bytes inside a regex literal are NOT a comment start, because the
//     regex is one opaque token. Text-only lexing cannot know that without
//     parsing (the classic slash ambiguity), and a phantom comment there is
//     exactly the false positive that makes a probe "match" across live code.
//
// Two callers today: the enrichment hygiene probes (internal/enrichment/mirror)
// and the `@mion-expect-error` directive scan (internal/compiler/resolver).
package srcscan

import (
	"sort"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/scanner"
)

// Span is a half-open [Start, End) byte range covering one `//` line comment
// (through end of line, newline excluded) or one `/* … */` block comment
// (delimiters included). Spans are in text order and never overlap.
type Span struct {
	Start int
	End   int
}

// LiteralTokenRanges walks the AST collecting the byte range of every token
// whose TEXT is opaque data — string literals, the literal parts of template
// expressions (head/middle/tail; the `${…}` interpolations between them are
// code and deliberately NOT covered), regex literals, and JSX text. Ranges are
// [tokenStart, end) including the delimiters, sorted by start. JSDoc nodes are
// not visited (plain ForEachChild), so a type annotation inside a doc comment
// never claims a range — comments win by starting earlier anyway.
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

// Comments is the linear pass: it walks text once, skipping the opaque literal
// ranges, and records every `//` line comment (through end of line) and
// `/* … */` block comment (including delimiters; an unterminated block runs to
// EOF). With literals removed by the oracle, any remaining `//` or `/*` outside
// a comment IS a comment start — TypeScript has no other production for those
// byte pairs.
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
