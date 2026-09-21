package mirror

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/parser"
	"github.com/microsoft/typescript-go/shim/tspath"

	"github.com/mionkit/mion/ts-go-runtypes/internal/srcscan"
)

// scanTags.go builds the ONE lexical view every hygiene probe shares, deriving comment spans from a tsgo PARSE rather than
// a hand-rolled lexer: the parse says where the string, template and regex TOKENS are, and a linear pass over the rest
// finds the comments. That is what keeps `/*` inside a regex from reading as a comment start, the false positive that lets
// a carcass match across live code, and what still catches a comment parked before `};`.
// The pass stays a byte scan rather than per-token trivia: tsgo's lean AST has no punctuation nodes, so trivia alone would
// miss that comment, and a raw token re-scan would re-open the slash ambiguity the parse already solved.

// Scan is the per-file lexical view every probe reuses: the text, its comment spans and its literal-token ranges.
// Build ONE per file; the same-named free functions in hygiene.go re-parse the text on each call.
type Scan struct {
	text  string
	spans []commentSpan
	// literals are every string / template part / regex token range in text order, the opaque regions the scan skips.
	literals [][2]int
	// parseFailed records a syntax error; probes stay best-effort on the recovered tree, but PruneOrphanBlocks refuses to
	// rewrite text it cannot confidently lex, the same stance ParseMirror takes for reconcile.
	parseFailed bool
	// Lazily-built masked probe texts; see structureMaskedText / importMaskedText.
	structureMasked      string
	structureMaskedBuilt bool
	importMasked         string
	importMaskedBuilt    bool
}

// scanFileName is the synthetic path for text-only scans; it is rooted because the parser asserts absolute, normalized names.
const scanFileName = "/rt-hygiene-scan.ts"

// NewScan builds the lexical view of text and never fails: a syntax error is recorded on the Scan for consumers to check.
func NewScan(text string) *Scan {
	sourceFile := parser.ParseSourceFile(
		ast.SourceFileParseOptions{FileName: scanFileName, Path: tspath.Path(scanFileName)},
		text,
		core.ScriptKindTS,
	)
	return newScanOf(sourceFile, text)
}

// NewScanForSourceFile builds the view from an ALREADY-PARSED file, so a caller holding the Program's parse re-parses nothing.
func NewScanForSourceFile(sourceFile *ast.SourceFile) *Scan {
	return newScanOf(sourceFile, sourceFile.Text())
}

// newScanOf assembles the Scan from a parse; a nil file degrades to zero literal ranges and a parseFailed mark, never a panic.
func newScanOf(sourceFile *ast.SourceFile, text string) *Scan {
	scan := &Scan{text: text}
	if sourceFile == nil {
		scan.parseFailed = true
		scan.spans = srcscan.Comments(text, nil)
		return scan
	}
	scan.parseFailed = len(sourceFile.Diagnostics()) > 0
	scan.literals = srcscan.LiteralTokenRanges(sourceFile)
	scan.spans = srcscan.Comments(text, scan.literals)
	return scan
}

// Text returns the scanned text, so a caller indexes findings into the same bytes the spans were computed over.
func (scan *Scan) Text() string {
	return scan.text
}

// structureMaskedText blanks comment AND literal bytes, newlines kept so offsets and (?m) anchors stay true.
// Masking literals is what stops a multiline template holding a `const x: FriendlyText<…>` line reading as a mirror.
func (scan *Scan) structureMaskedText() string {
	if !scan.structureMaskedBuilt {
		scan.structureMasked = maskRanges(scan.text, scan.spans, scan.literals)
		scan.structureMaskedBuilt = true
	}
	return scan.structureMasked
}

// importMaskedText blanks comment bytes only: dslImportPattern must still see the quoted module specifier.
func (scan *Scan) importMaskedText() string {
	if !scan.importMaskedBuilt {
		scan.importMasked = maskRanges(scan.text, scan.spans, nil)
		scan.importMaskedBuilt = true
	}
	return scan.importMasked
}

// maskRanges blanks every non-newline byte the spans cover, keeping length and newlines so offsets and lines stay true.
func maskRanges(text string, spans []commentSpan, extra [][2]int) string {
	if len(spans) == 0 && len(extra) == 0 {
		return text
	}
	masked := []byte(text)
	blank := func(start, end int) {
		for i := start; i < end && i < len(masked); i++ {
			if masked[i] != '\n' {
				masked[i] = ' '
			}
		}
	}
	for _, span := range spans {
		blank(span.Start, span.End)
	}
	for _, r := range extra {
		blank(r[0], r[1])
	}
	return string(masked)
}
