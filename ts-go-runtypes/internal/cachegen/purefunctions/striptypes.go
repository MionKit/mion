package purefunctions

import (
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
)

// textRange is an inclusive-start, exclusive-end source-file offset pair; Text set makes it a
// REPLACEMENT, empty Text a deletion, which is what type stripping produces. A replacement is
// always built from an unwrapped expression, so it never overlaps the deletions around it: the
// `as Type` a dep argument may carry starts exactly where the replacement ends.
type textRange struct {
	Start, End int
	Text       string
}

// stripTypesFromBlock returns the JS-stripped text of blockNode, outer braces removed.
func stripTypesFromBlock(sourceFile *ast.SourceFile, blockNode *ast.Node, lowerings []textRange) string {
	fullText := sourceFile.Text()
	startOffset := blockNode.Pos()
	endOffset := blockNode.End()
	raw := fullText[startOffset:endOffset]

	ranges := append([]textRange(nil), lowerings...)
	collectTypeRanges(sourceFile, blockNode, &ranges)
	stripped := spliceRanges(raw, ranges, startOffset)
	return trimOuterBraces(stripped)
}

// stripTypesFromExpr renders an arrow expression body as "return <stripped>;".
func stripTypesFromExpr(sourceFile *ast.SourceFile, exprNode *ast.Node, lowerings []textRange) string {
	fullText := sourceFile.Text()
	startOffset := exprNode.Pos()
	endOffset := exprNode.End()
	raw := fullText[startOffset:endOffset]

	ranges := append([]textRange(nil), lowerings...)
	collectTypeRanges(sourceFile, exprNode, &ranges)
	stripped := spliceRanges(raw, ranges, startOffset)
	return "return " + strings.TrimSpace(stripped) + ";"
}

// collectTypeRanges appends every TS-only source range that must go for the result to parse as
// plain JS. Ranges may overlap or repeat; spliceRanges normalises them.
func collectTypeRanges(sourceFile *ast.SourceFile, node *ast.Node, ranges *[]textRange) {
	if node == nil {
		return
	}
	switch node.Kind {
	case ast.KindTypeAliasDeclaration, ast.KindInterfaceDeclaration:
		// The whole declaration goes: it has no runtime meaning.
		*ranges = append(*ranges, textRange{Start: node.Pos(), End: node.End()})
		return
	case ast.KindAsExpression:
		asExpr := node.AsAsExpression()
		*ranges = append(*ranges, textRange{Start: asExpr.Expression.End(), End: node.End()})
		collectTypeRanges(sourceFile, asExpr.Expression, ranges)
		return
	case ast.KindSatisfiesExpression:
		satExpr := node.AsSatisfiesExpression()
		*ranges = append(*ranges, textRange{Start: satExpr.Expression.End(), End: node.End()})
		collectTypeRanges(sourceFile, satExpr.Expression, ranges)
		return
	case ast.KindTypeAssertionExpression:
		// Legacy `<Type>expr`: the `<Type>` prefix goes.
		typeAssert := node.AsTypeAssertion()
		*ranges = append(*ranges, textRange{Start: node.Pos(), End: typeAssert.Expression.Pos()})
		collectTypeRanges(sourceFile, typeAssert.Expression, ranges)
		return
	case ast.KindNonNullExpression:
		nnExpr := node.AsNonNullExpression()
		*ranges = append(*ranges, textRange{Start: nnExpr.Expression.End(), End: node.End()})
		collectTypeRanges(sourceFile, nnExpr.Expression, ranges)
		return
	case ast.KindCallExpression:
		callExpr := node.AsCallExpression()
		// The `<T>` of `foo<T>(1)` left in place stays valid JS and means something else
		// entirely: `(foo < T) > 1`, a chain of comparisons evaluating to a boolean.
		appendTypeArgumentsRange(sourceFile.Text(), callExpr.TypeArguments, ranges)
		collectTypeRanges(sourceFile, callExpr.Expression, ranges)
		collectListTypeRanges(sourceFile, callExpr.Arguments, ranges)
		return
	case ast.KindNewExpression:
		newExpr := node.AsNewExpression()
		// The `<any>` of `new Set<any>()`, unlike the call form, is not even parseable as JS.
		appendTypeArgumentsRange(sourceFile.Text(), newExpr.TypeArguments, ranges)
		collectTypeRanges(sourceFile, newExpr.Expression, ranges)
		collectListTypeRanges(sourceFile, newExpr.Arguments, ranges)
		return
	case ast.KindParameter:
		paramDecl := node.AsParameterDeclaration()
		if paramDecl.Type != nil {
			// Scanning back from Type.Pos() for the `:` avoids depending on where
			// Name.End() sits relative to the question-mark token.
			colonPos := findPrecedingColon(sourceFile.Text(), paramDecl.Type.Pos())
			if colonPos >= 0 {
				*ranges = append(*ranges, textRange{Start: colonPos, End: paramDecl.Type.End()})
			}
			// A `?` may sit between the name and the `:`.
			if questionPos := findCharInRange(sourceFile.Text(), paramDecl.Name().End(), colonPos, '?'); questionPos >= 0 {
				*ranges = append(*ranges, textRange{Start: questionPos, End: questionPos + 1})
			}
		} else {
			// `name?` without an explicit type: only the trailing `?` to strip.
			if questionPos := findCharAfter(sourceFile.Text(), paramDecl.Name().End(), '?'); questionPos >= 0 && questionPos < node.End() {
				*ranges = append(*ranges, textRange{Start: questionPos, End: questionPos + 1})
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
				*ranges = append(*ranges, textRange{Start: colonPos, End: varDecl.Type.End()})
			}
		}
		if varDecl.Initializer != nil {
			collectTypeRanges(sourceFile, varDecl.Initializer, ranges)
		}
		return
	case ast.KindFunctionExpression, ast.KindFunctionDeclaration, ast.KindArrowFunction:
		// The factory's own outer wrapper is stripped at the caller, but the body may hold
		// nested functions, the returned pure fn among them.
		fnLike := node.FunctionLikeData()
		if fnLike != nil {
			if fnLike.Type != nil {
				// ParameterList.End() in tsgo excludes the closing `)`, so a splice from there
				// would eat it; scan back from the return Type's Pos for the `:` instead.
				colonPos := findPrecedingColon(sourceFile.Text(), fnLike.Type.Pos())
				if colonPos >= 0 {
					*ranges = append(*ranges, textRange{Start: colonPos, End: fnLike.Type.End()})
				}
			}
			if fnLike.TypeParameters != nil {
				// TypeParameters.Pos/End cover the inner identifiers only, so the surrounding
				// `<...>` is found by scanning outwards.
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
				*ranges = append(*ranges, textRange{Start: start, End: end})
			}
		}
		// Fall through to descend into parameters + body (collects nested types).
	}
	node.ForEachChild(func(child *ast.Node) bool {
		collectTypeRanges(sourceFile, child, ranges)
		return false
	})
}

// appendTypeArgumentsRange splices the `<...>` type-argument list of a call or new expression.
// Like a function-like's TypeParameters, the list's range covers the inner type nodes only, so the
// angle brackets are found by scanning outwards.
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
	*ranges = append(*ranges, textRange{Start: start, End: end})
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

// findPrecedingColon scans back from pos for the nearest `:`, skipping whitespace; -1 when
// non-whitespace comes first.
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

// findCharAfter scans forward from start for c, skipping whitespace; -1 when another
// non-whitespace byte comes first.
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

// spliceRanges applies every range to raw, `base` being the source-file offset raw starts at.
// Overlapping or touching DELETIONS are merged; a replacement never is, so its text is written once.
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
		if r.Start <= last.End && last.Text == "" && r.Text == "" {
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
		b.WriteString(r.Text)
		cursor = end
	}
	if cursor < len(raw) {
		b.WriteString(raw[cursor:])
	}
	return b.String()
}

// trimOuterBraces removes a Block's leading `{` and trailing `}` and the whitespace around them.
func trimOuterBraces(text string) string {
	trimmed := strings.TrimSpace(text)
	if len(trimmed) < 2 || trimmed[0] != '{' || trimmed[len(trimmed)-1] != '}' {
		return strings.TrimSpace(text)
	}
	return strings.TrimSpace(trimmed[1 : len(trimmed)-1])
}
