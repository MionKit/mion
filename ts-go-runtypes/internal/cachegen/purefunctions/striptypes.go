package purefunctions

import (
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
)

// textRange is an inclusive-start, exclusive-end source-file offset pair.
type textRange struct {
	Start, End int
}

// stripTypesFromBlock returns the JS-stripped text of blockNode (a Block).
// Outer braces are removed — the reference getBodyText does the same
// (block.text.slice(1, -1).trim()).
func stripTypesFromBlock(sourceFile *ast.SourceFile, blockNode *ast.Node) string {
	fullText := sourceFile.Text()
	startOffset := blockNode.Pos()
	endOffset := blockNode.End()
	raw := fullText[startOffset:endOffset]

	var ranges []textRange
	collectTypeRanges(sourceFile, blockNode, &ranges)
	stripped := spliceRanges(raw, ranges, startOffset)
	return trimOuterBraces(stripped)
}

// stripTypesFromExpr renders an arrow expression body as "return <stripped>;".
func stripTypesFromExpr(sourceFile *ast.SourceFile, exprNode *ast.Node) string {
	fullText := sourceFile.Text()
	startOffset := exprNode.Pos()
	endOffset := exprNode.End()
	raw := fullText[startOffset:endOffset]

	var ranges []textRange
	collectTypeRanges(sourceFile, exprNode, &ranges)
	stripped := spliceRanges(raw, ranges, startOffset)
	return "return " + strings.TrimSpace(stripped) + ";"
}

// collectTypeRanges walks node and appends every TS-only source range that
// must be removed for the result to parse as plain JS. Ranges may overlap
// or be redundant; spliceRanges normalises them.
func collectTypeRanges(sourceFile *ast.SourceFile, node *ast.Node, ranges *[]textRange) {
	if node == nil {
		return
	}
	switch node.Kind {
	case ast.KindTypeAliasDeclaration, ast.KindInterfaceDeclaration:
		// Drop the entire declaration — it has no runtime meaning.
		*ranges = append(*ranges, textRange{node.Pos(), node.End()})
		return
	case ast.KindAsExpression:
		asExpr := node.AsAsExpression()
		// `expr as Type` → keep expr, drop everything after.
		*ranges = append(*ranges, textRange{asExpr.Expression.End(), node.End()})
		collectTypeRanges(sourceFile, asExpr.Expression, ranges)
		return
	case ast.KindSatisfiesExpression:
		satExpr := node.AsSatisfiesExpression()
		*ranges = append(*ranges, textRange{satExpr.Expression.End(), node.End()})
		collectTypeRanges(sourceFile, satExpr.Expression, ranges)
		return
	case ast.KindTypeAssertionExpression:
		// Legacy `<Type>expr` — drop the `<Type>` prefix, keep expr.
		typeAssert := node.AsTypeAssertion()
		*ranges = append(*ranges, textRange{node.Pos(), typeAssert.Expression.Pos()})
		collectTypeRanges(sourceFile, typeAssert.Expression, ranges)
		return
	case ast.KindNonNullExpression:
		nnExpr := node.AsNonNullExpression()
		// `expr!` — drop the trailing `!`.
		*ranges = append(*ranges, textRange{nnExpr.Expression.End(), node.End()})
		collectTypeRanges(sourceFile, nnExpr.Expression, ranges)
		return
	case ast.KindCallExpression:
		callExpr := node.AsCallExpression()
		// `foo<T>(1)` — drop the `<T>`. Left in place it stays valid JS but
		// means something else entirely: `(foo < T) > 1`, a chain of
		// comparisons evaluating to a boolean.
		appendTypeArgumentsRange(sourceFile.Text(), callExpr.TypeArguments, ranges)
		collectTypeRanges(sourceFile, callExpr.Expression, ranges)
		collectListTypeRanges(sourceFile, callExpr.Arguments, ranges)
		return
	case ast.KindNewExpression:
		newExpr := node.AsNewExpression()
		// `new Set<any>()` — drop the `<any>`; unlike the call form it is not
		// even parseable as JS.
		appendTypeArgumentsRange(sourceFile.Text(), newExpr.TypeArguments, ranges)
		collectTypeRanges(sourceFile, newExpr.Expression, ranges)
		collectListTypeRanges(sourceFile, newExpr.Arguments, ranges)
		return
	case ast.KindParameter:
		paramDecl := node.AsParameterDeclaration()
		if paramDecl.Type != nil {
			// Splice the `?:` or `:` plus the Type. Scan back from Type.Pos()
			// for the `:` so we don't depend on Name.End()'s relationship
			// to the question-mark token.
			colonPos := findPrecedingColon(sourceFile.Text(), paramDecl.Type.Pos())
			if colonPos >= 0 {
				*ranges = append(*ranges, textRange{colonPos, paramDecl.Type.End()})
			}
			// Also drop a `?` between the name and the `:`, if present.
			if questionPos := findCharInRange(sourceFile.Text(), paramDecl.Name().End(), colonPos, '?'); questionPos >= 0 {
				*ranges = append(*ranges, textRange{questionPos, questionPos + 1})
			}
		} else {
			// `name?` without explicit type — strip the trailing `?`.
			if questionPos := findCharAfter(sourceFile.Text(), paramDecl.Name().End(), '?'); questionPos >= 0 && questionPos < node.End() {
				*ranges = append(*ranges, textRange{questionPos, questionPos + 1})
			}
		}
		if paramDecl.Initializer != nil {
			collectTypeRanges(sourceFile, paramDecl.Initializer, ranges)
		}
		return
	case ast.KindVariableDeclaration:
		varDecl := node.AsVariableDeclaration()
		if varDecl.Type != nil {
			colonPos := findPrecedingColon(sourceFile.Text(), varDecl.Type.Pos())
			if colonPos >= 0 {
				*ranges = append(*ranges, textRange{colonPos, varDecl.Type.End()})
			}
		}
		if varDecl.Initializer != nil {
			collectTypeRanges(sourceFile, varDecl.Initializer, ranges)
		}
		return
	case ast.KindFunctionExpression, ast.KindFunctionDeclaration, ast.KindArrowFunction:
		// Strip return-type annotations and type-parameter lists on inner
		// function-likes. The factory's own outer wrapper is stripped at the
		// caller, but the body may contain nested functions (the actual
		// returned pure-fn is one of these).
		fnLike := node.FunctionLikeData()
		if fnLike != nil {
			if fnLike.Type != nil {
				// ParameterList.End() in tsgo doesn't include the closing `)`,
				// so a naive splice from there would eat it. Scan back from
				// the return-Type's Pos to find the `:`.
				colonPos := findPrecedingColon(sourceFile.Text(), fnLike.Type.Pos())
				if colonPos >= 0 {
					*ranges = append(*ranges, textRange{colonPos, fnLike.Type.End()})
				}
			}
			if fnLike.TypeParameters != nil {
				// TypeParameters.Pos/End cover the inner identifiers; we
				// need to drop the surrounding `<...>` too. Scan outwards.
				openAngle := findPrecedingAngleBracket(sourceFile.Text(), fnLike.TypeParameters.Pos(), '<')
				closeAngle := findCharAfter(sourceFile.Text(), fnLike.TypeParameters.End(), '>')
				start := fnLike.TypeParameters.Pos()
				end := fnLike.TypeParameters.End()
				if openAngle >= 0 {
					start = openAngle
				}
				if closeAngle >= 0 {
					end = closeAngle + 1
				}
				*ranges = append(*ranges, textRange{start, end})
			}
		}
		// Fall through to descend into parameters + body (collects nested types).
	}
	node.ForEachChild(func(child *ast.Node) bool {
		collectTypeRanges(sourceFile, child, ranges)
		return false
	})
}

// appendTypeArgumentsRange splices the `<...>` type-argument list of a call or
// new expression. Like a function-like's TypeParameters, the list's own range
// covers only the inner type nodes, so the surrounding angle brackets are found
// by scanning outwards. A no-op when the expression has no type arguments.
func appendTypeArgumentsRange(src string, typeArguments *ast.NodeList, ranges *[]textRange) {
	if typeArguments == nil {
		return
	}
	start := typeArguments.Pos()
	end := typeArguments.End()
	if openAngle := findPrecedingAngleBracket(src, start, '<'); openAngle >= 0 {
		start = openAngle
	}
	if closeAngle := findCharAfter(src, end, '>'); closeAngle >= 0 {
		end = closeAngle + 1
	}
	*ranges = append(*ranges, textRange{start, end})
}

// collectListTypeRanges descends into every node of an optional list.
func collectListTypeRanges(sourceFile *ast.SourceFile, list *ast.NodeList, ranges *[]textRange) {
	if list == nil {
		return
	}
	for _, item := range list.Nodes {
		collectTypeRanges(sourceFile, item, ranges)
	}
}

// findPrecedingColon scans backward from pos (exclusive) for the nearest `:`
// token, skipping whitespace. Returns -1 if none found before non-whitespace.
func findPrecedingColon(src string, pos int) int {
	for i := pos - 1; i >= 0; i-- {
		if src[i] == ':' {
			return i
		}
		if src[i] != ' ' && src[i] != '\t' && src[i] != '\n' && src[i] != '\r' {
			return -1
		}
	}
	return -1
}

// findCharInRange scans [start, end) for the first occurrence of c.
func findCharInRange(src string, start, end int, c byte) int {
	if end > len(src) {
		end = len(src)
	}
	for i := start; i < end; i++ {
		if src[i] == c {
			return i
		}
	}
	return -1
}

// findCharAfter scans forward from start (inclusive) for c, skipping whitespace.
// Returns the position of c, or -1 if a non-whitespace non-c byte is encountered first.
func findCharAfter(src string, start int, c byte) int {
	for i := start; i < len(src); i++ {
		if src[i] == c {
			return i
		}
		if src[i] != ' ' && src[i] != '\t' && src[i] != '\n' && src[i] != '\r' {
			return -1
		}
	}
	return -1
}

// findPrecedingAngleBracket is findPrecedingColon's symmetric for `<`.
func findPrecedingAngleBracket(src string, pos int, c byte) int {
	for i := pos - 1; i >= 0; i-- {
		if src[i] == c {
			return i
		}
		if src[i] != ' ' && src[i] != '\t' && src[i] != '\n' && src[i] != '\r' {
			return -1
		}
	}
	return -1
}

// spliceRanges removes every range from raw. `base` is the source-file offset
// raw corresponds to (so range offsets get translated). Overlapping or
// touching ranges are merged.
func spliceRanges(raw string, ranges []textRange, base int) string {
	if len(ranges) == 0 {
		return raw
	}
	// Sort by Start, then merge.
	sort.Slice(ranges, func(i, j int) bool {
		if ranges[i].Start != ranges[j].Start {
			return ranges[i].Start < ranges[j].Start
		}
		return ranges[i].End < ranges[j].End
	})
	merged := []textRange{ranges[0]}
	for _, r := range ranges[1:] {
		last := &merged[len(merged)-1]
		if r.Start <= last.End {
			if r.End > last.End {
				last.End = r.End
			}
			continue
		}
		merged = append(merged, r)
	}

	var b strings.Builder
	cursor := 0
	for _, r := range merged {
		start := r.Start - base
		end := r.End - base
		if start < cursor {
			start = cursor
		}
		if start > len(raw) {
			break
		}
		if end > len(raw) {
			end = len(raw)
		}
		if cursor < start {
			b.WriteString(raw[cursor:start])
		}
		cursor = end
	}
	if cursor < len(raw) {
		b.WriteString(raw[cursor:])
	}
	return b.String()
}

// trimOuterBraces removes the leading `{` and trailing `}` of a Block's raw
// text along with surrounding whitespace. Mirrors the reference
// fullText.slice(1, -1).trim().
func trimOuterBraces(text string) string {
	trimmed := strings.TrimSpace(text)
	if len(trimmed) < 2 || trimmed[0] != '{' || trimmed[len(trimmed)-1] != '}' {
		return strings.TrimSpace(text)
	}
	return strings.TrimSpace(trimmed[1 : len(trimmed)-1])
}
