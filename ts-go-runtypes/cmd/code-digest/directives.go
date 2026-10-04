package main

import "strings"

// directive is a comment marker that changes what a tool does, so a line holding one counts as code.
type directive struct {
	marker string
	reason string
}

var tsDirectives = []directive{
	{"@ts-", "@ts-expect-error / ignore / nocheck / check change the type check"},
	{"eslint-", "eslint-disable and friends change lint results"},
	{"oxlint-", "oxlint-disable and friends change lint results"},
	{"/// <reference", "triple-slash references add types and files"},
	{"/// <amd", "triple-slash amd directives change module output"},
	{"__PURE__", "bundlers drop calls marked pure"},
	{"__NO_SIDE_EFFECTS__", "bundlers drop calls to functions marked side-effect free"},
	{"@vite-ignore", "vite leaves a dynamic import alone"},
	{"webpack", "webpack magic comments change chunking"},
	{"@vitest-environment", "vitest picks the test environment"},
	{"@jsx", "the JSX factory and import source"},
	{"istanbul", "coverage ignore hints"},
	{"c8 ignore", "coverage ignore hints"},
	{"v8 ignore", "coverage ignore hints"},
	{"prettier-ignore", "the formatter leaves the next node alone"},
	{"oxfmt-ignore", "the formatter leaves the next node alone"},
	{"sourceMappingURL", "points tools at a source map"},
}

var goDirectives = []directive{
	{"//go:", "build constraints, embed, generate, linkname and compiler pragmas"},
	{"//line ", "line directives change reported positions"},
	{"// +build", "old-style build constraints"},
	{"//export ", "cgo exports"},
	{"//nolint", "linter suppressions"},
}

// directiveLines returns every line holding a marker, trimmed. A marker inside a string also counts,
// which can only cost a re-run.
func directiveLines(text string, directives []directive) []string {
	var lines []string
	for _, line := range strings.Split(text, "\n") {
		for _, entry := range directives {
			if strings.Contains(line, entry.marker) {
				lines = append(lines, strings.TrimSpace(line))
				break
			}
		}
	}
	return lines
}
