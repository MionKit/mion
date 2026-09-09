package mirror

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/parser"
	"github.com/microsoft/typescript-go/shim/tspath"

	"github.com/mionkit/mion/ts-go-runtypes/internal/srcscan"
)

// scanTags.go builds the ONE lexical view every hygiene probe shares: the real
// comment spans of a mirror text, derived from a tsgo PARSE instead of a
// hand-rolled string/comment lexer. The parser is the oracle for where the
// string, template-literal and regex TOKENS are; comments are then found by a
// single linear pass over everything those tokens don't cover. The
// construction is what makes the spans exact where a text-only lexer cannot
// be:
//
//   - a comment inside a template interpolation (`${/* … */ name}`) IS a
//     comment — the interpolation is code between two template-literal tokens,
//     never inside one;
//   - `/*` bytes inside a regex literal are NOT a comment start — the regex is
//     one opaque token; text-only lexing cannot know that without parsing
//     (the classic slash ambiguity), and a phantom comment there is exactly
//     the false positive that lets a carcass "match" across live code;
//   - completeness is free — comments precede TOKENS (including a closing
//     brace), not AST node starts, so the linear pass sees a carcass parked
//     before `};` (a pruned last field) without enumerating tokens.
//
// Comment detection itself stays a linear byte scan rather than a per-token
// trivia enumeration (scanner.GetLeadingCommentRanges) because tsgo's lean AST
// does not materialize punctuation tokens as nodes — walking node leading
// trivia alone would miss a comment before `}` — and a raw token re-scan would
// re-open the very slash/template ambiguities the parse already solved.

// Scan is the shared per-file lexical view: the text plus its comment spans
// and literal-token ranges, computed once and reused by every probe
// (HasMarkerComment, IsEnrichmentFile, DirtyTags, CarcassMatches,
// FamilyClassifier). Build ONE Scan per file and call its methods; the
// same-named free functions in hygiene.go construct a throwaway Scan per call
// (each re-parses the text) — fine for tests and one-shot callers, wasteful
// in a loop that probes the same text repeatedly.
type Scan struct {
	text  string
	spans []commentSpan
	// literals are the [start, end) byte ranges of every string / template
	// part / regex token, in text order — the parse-derived opaque regions the
	// comment scan skips and the structural mask blanks.
	literals [][2]int
	// parseFailed records a syntax error in the parse. Probes stay best-effort
	// (the recovered tree still anchors most spans correctly), but destructive
	// consumers (PruneOrphanBlocks) refuse to rewrite text they cannot
	// confidently lex — the same stance ParseMirror takes for reconcile.
	parseFailed bool
	// Lazily-built masked probe texts; see structureMaskedText / importMaskedText.
	structureMasked      string
	structureMaskedBuilt bool
	importMasked         string
	importMaskedBuilt    bool
}

// scanFileName is the synthetic path for text-only scans (NewScan); the parse
// result never leaves the Scan, so the name only shows up in parser internals.
// The parser asserts filenames are absolute and normalized — hence the root.
const scanFileName = "/rt-hygiene-scan.ts"

// NewScan parses text as a standalone TypeScript source and builds its lexical
// view. It never fails: a syntax error is recorded on the Scan (the parser
// recovers and the probes stay best-effort) for destructive consumers to check.
func NewScan(text string) *Scan {
	sourceFile := parser.ParseSourceFile(
		ast.SourceFileParseOptions{FileName: scanFileName, Path: tspath.Path(scanFileName)},
		text,
		core.ScriptKindTS,
	)
	return newScanOf(sourceFile, text)
}

// NewScanForSourceFile builds the lexical view from an ALREADY-PARSED source
// file — the resolver's checkEnrich pass and `mion check` both hold the
// Program's parse, so the oracle costs one AST walk and no re-parse there.
func NewScanForSourceFile(sourceFile *ast.SourceFile) *Scan {
	return newScanOf(sourceFile, sourceFile.Text())
}

// newScanOf assembles the Scan from a parse (nil-tolerant: the parser never
// returns nil in practice, but a nil file degrades to zero literal ranges and
// a parseFailed mark rather than a panic).
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

// Text returns the scanned text (the Program's view for
// NewScanForSourceFile), so callers index findings into the same bytes the
// spans were computed over.
func (scan *Scan) Text() string {
	return scan.text
}

// structureMaskedText blanks every comment byte AND every literal-token byte
// (newlines preserved, so offsets and (?m) line anchors of the surviving code
// stay true) — the probe text for the line-anchored const-annotation patterns.
// Masking literals too means a multiline template that HAPPENS to contain a
// `const x: FriendlyType<…>` line can never make ordinary source read as a
// mirror, the same way comment masking already protected against JSDoc
// examples.
func (scan *Scan) structureMaskedText() string {
	if !scan.structureMaskedBuilt {
		scan.structureMasked = maskRanges(scan.text, scan.spans, scan.literals)
		scan.structureMaskedBuilt = true
	}
	return scan.structureMasked
}

// importMaskedText blanks comment bytes only — the probe text for
// dslImportPattern, which must still see the quoted 'mion' module
// specifier (a string literal the structural mask would blank).
func (scan *Scan) importMaskedText() string {
	if !scan.importMaskedBuilt {
		scan.importMasked = maskRanges(scan.text, scan.spans, nil)
		scan.importMaskedBuilt = true
	}
	return scan.importMasked
}

// maskRanges blanks every non-newline byte covered by the comment spans and
// the extra ranges, preserving length (offsets stay valid in the original
// text) and newlines (line structure of the surviving code stays true).
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
