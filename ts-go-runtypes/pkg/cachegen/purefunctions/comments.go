package purefunctions

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/scanner"
)

// appendCommentRanges adds a range per comment in node's span: the code ships as a string literal no minifier reaches.
func appendCommentRanges(sourceFile *ast.SourceFile, node *ast.Node, ranges *[]textRange) {
	text := sourceFile.Text()
	start, end := node.Pos(), node.End()
	existing := len(*ranges)
	regexStarts := map[int]bool{}
	collectRegexStarts(sourceFile, node, regexStarts)
	// One entry per open `{` or `${`; true marks a `${`, whose `}` resumes the template text.
	var braces []bool
	tokens := scanner.GetScannerForSourceFile(sourceFile, start)
	for {
		gapEnd := min(tokens.TokenStart(), end)
		for _, comment := range triviaComments(text, tokens.TokenFullStart(), gapEnd) {
			removal := commentRemoval(text, comment, start, end)
			if !overlapsAny(removal, (*ranges)[:existing]) {
				*ranges = append(*ranges, removal)
			}
		}
		if tokens.Token() == ast.KindEndOfFile || tokens.TokenStart() >= end {
			return
		}
		switch tokens.Token() {
		case ast.KindSlashToken, ast.KindSlashEqualsToken:
			if regexStarts[tokens.TokenStart()] {
				tokens.ReScanSlashToken()
			}
		case ast.KindTemplateHead:
			braces = append(braces, true)
		case ast.KindOpenBraceToken:
			braces = append(braces, false)
		case ast.KindCloseBraceToken:
			if len(braces) == 0 {
				break
			}
			inTemplate := braces[len(braces)-1]
			braces = braces[:len(braces)-1]
			if inTemplate && tokens.ReScanTemplateToken(false) == ast.KindTemplateMiddle {
				braces = append(braces, true)
			}
		}
		tokens.Scan()
	}
}

// collectRegexStarts exists because the scanner reads a regex's `/` as division: a `//` in it would pass for a comment.
func collectRegexStarts(sourceFile *ast.SourceFile, node *ast.Node, starts map[int]bool) {
	if node.Kind == ast.KindRegularExpressionLiteral {
		starts[scanner.GetTokenPosOfNode(node, sourceFile, false)] = true
		return
	}
	node.ForEachChild(func(child *ast.Node) bool {
		collectRegexStarts(sourceFile, child, starts)
		return false
	})
}

// triviaComments returns the [start, end) of each comment in text[from:to], a span holding only whitespace and comments.
func triviaComments(text string, from, to int) [][2]int {
	var comments [][2]int
	for pos := from; pos+1 < to; pos++ {
		if text[pos] != '/' {
			continue
		}
		switch text[pos+1] {
		case '/':
			commentEnd := strings.IndexAny(text[pos:to], "\r\n")
			if commentEnd < 0 {
				commentEnd = to - pos
			}
			comments = append(comments, [2]int{pos, pos + commentEnd})
			pos += commentEnd
		case '*':
			commentEnd := strings.Index(text[pos+2:to], "*/")
			if commentEnd < 0 {
				commentEnd = to - pos - 2
			} else {
				commentEnd += 2
			}
			comments = append(comments, [2]int{pos, pos + 2 + commentEnd})
			pos += 1 + commentEnd
		}
	}
	return comments
}

// commentRemoval turns a block comment holding a newline into a newline: it still ends a `return` statement.
// A block comment with no space on either side becomes a space, so `a/**/b` does not read `ab`.
func commentRemoval(text string, comment [2]int, start, end int) textRange {
	before := comment[0]
	for before > start && (text[before-1] == ' ' || text[before-1] == '\t') {
		before--
	}
	after := comment[1]
	for after < end && (text[after] == ' ' || text[after] == '\t') {
		after++
	}
	ownLine := before > start && text[before-1] == '\n' && (after == end || text[after] == '\n' || text[after] == '\r')
	if ownLine {
		return textRange{Start: before - 1, End: after}
	}
	if text[comment[0]+1] == '/' {
		return textRange{Start: before, End: comment[1]}
	}
	if strings.ContainsAny(text[comment[0]:comment[1]], "\r\n") {
		return textRange{Start: comment[0], End: comment[1], Text: "\n"}
	}
	if before < comment[0] || after > comment[1] {
		return textRange{Start: comment[0], End: comment[1]}
	}
	return textRange{Start: comment[0], End: comment[1], Text: " "}
}

func overlapsAny(candidate textRange, ranges []textRange) bool {
	for _, other := range ranges {
		if candidate.Start < other.End && other.Start < candidate.End {
			return true
		}
	}
	return false
}
