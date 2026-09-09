package resolver

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/srcscan"
	"github.com/mionkit/mion/ts-go-runtypes/internal/textpos"
)

// expecterror.go finds the `@mion-expect-error` comments in the program's own
// source and hands them to diagnostics.ApplyExpectErrors, which owns what they
// mean. This half owns only two things a comment lexer and a line map can
// answer: WHERE the real comments are, and WHICH line each one covers.
//
// It runs at the Dispatch choke point, so a directive removes a finding for
// every consumer at once: the bundler build, `mion compile`, and the editor's
// lint squiggles. That is what a source-level assertion should do, unlike
// `downgradeErrors`, which is build policy and is applied by the consumer that
// decides whether to halt.

// settleDiagnostics is the last thing every op's diagnostics pass through: the
// repeats collapse, then the `@mion-expect-error` comments take effect. Both
// belong here rather than inside a handler because the lanes assemble their
// diagnostics on different branches of dispatch.
//
// SILENCING runs on every op, because a directive is a fact about the source
// whichever question was asked. REPORTING a wrong directive (the EXP codes)
// runs only on the whole-program op, because "this directive silenced nothing"
// is only answerable once, against every finding the program has. A build makes
// several calls (a dump, a generate, a transform per file), and asking a
// single-file op whether a directive was used would report every directive in
// the project as unused.
//
// Cost when no directive exists is one substring scan per source file.
func (sess *Session) settleDiagnostics(list []diagnostics.Diagnostic, wholeProgram bool) []diagnostics.Diagnostic {
	list = diagnostics.Dedupe(list)
	directives := sess.programDirectives()
	if len(directives) == 0 {
		return list
	}
	return diagnostics.ApplyExpectErrors(list, directives, sess.absPath, wholeProgram)
}

// programDirectives collects every directive in the program's non-declaration
// source. It covers files with NO diagnostics too, because an unused directive
// is exactly the case EXP001 exists to report, and that file has nothing else
// to report.
//
// Cost is one substring scan per file (the same prefilter the non-enumerable
// and router-init passes use); only a file that actually carries the marker
// pays for a parse-guided comment lex.
func (sess *Session) programDirectives() []diagnostics.Directive {
	if sess.Program == nil || sess.Program.TS == nil {
		return nil
	}
	var directives []diagnostics.Directive
	for _, sourceFile := range sess.Program.TS.SourceFiles() {
		if sourceFile == nil || sourceFile.IsDeclarationFile {
			continue
		}
		if !strings.Contains(sourceFile.Text(), diagnostics.DirectiveMarker) {
			continue
		}
		directives = append(directives, fileDirectives(sourceFile.FileName(), sourceFile)...)
	}
	return directives
}

// fileDirectives parses one file's directives. Comments come from srcscan, so a
// `@mion-expect-error` written inside a string or a regex is not a directive
// and a directive inside a template interpolation is.
func fileDirectives(filePath string, sourceFile *ast.SourceFile) []diagnostics.Directive {
	text := sourceFile.Text()
	spans := srcscan.Comments(text, srcscan.LiteralTokenRanges(sourceFile))
	var directives []diagnostics.Directive
	for _, span := range spans {
		body, isDirective := directiveBody(text, span)
		if !isDirective {
			continue
		}
		startLine, startCol := textpos.LineCol(sourceFile, span.Start)
		endLine, endCol := textpos.LineCol(sourceFile, span.End)
		directives = append(directives, diagnostics.Directive{
			// The comment silences the line BELOW its last line, so a block
			// comment spanning several lines still points at the code under it.
			AppliesToLine: endLine + 1,
			Codes:         directiveCodes(body),
			Site: diagnostics.Site{
				FilePath:  filePath,
				StartLine: startLine,
				StartCol:  startCol,
				EndLine:   endLine,
				EndCol:    endCol,
			},
		})
	}
	return directives
}

// directiveBody reports whether a comment span is a directive, and returns the
// text after the marker.
//
// The comment must be the first thing on its own line. A trailing comment after
// code is deliberately not a directive: it would otherwise be ambiguous whether
// it covers the line it sits on or the next one, and TypeScript draws the same
// line for `@ts-expect-error`.
func directiveBody(text string, span srcscan.Span) (string, bool) {
	if !ownLine(text, span.Start) {
		return "", false
	}
	inner := strings.TrimSpace(strings.Trim(strings.TrimPrefix(strings.TrimPrefix(text[span.Start:span.End], "//"), "/*"), "*/"))
	// Tolerate a leading `*` so the directive also works inside a JSDoc block.
	inner = strings.TrimSpace(strings.TrimPrefix(inner, "*"))
	if !strings.HasPrefix(inner, diagnostics.DirectiveMarker) {
		return "", false
	}
	rest := inner[len(diagnostics.DirectiveMarker):]
	// `@mion-expect-errorFOO` is a different word, not a bare directive.
	if rest != "" && !isSeparator(rest[0]) {
		return "", false
	}
	return rest, true
}

// ownLine reports whether only whitespace precedes offset on its line.
func ownLine(text string, offset int) bool {
	for i := offset - 1; i >= 0; i-- {
		switch text[i] {
		case '\n', '\r':
			return true
		case ' ', '\t':
		default:
			return false
		}
	}
	return true
}

// directiveCodes splits the text after the marker into codes. Space and comma
// both separate, so `VL002, PJ001` and `VL002 PJ001` read the same. No codes is
// the bare form.
func directiveCodes(rest string) []string {
	fields := strings.FieldsFunc(rest, func(r rune) bool { return r == ',' || r == ' ' || r == '\t' || r == '\n' || r == '\r' })
	codes := make([]string, 0, len(fields))
	for _, field := range fields {
		if field != "" {
			codes = append(codes, field)
		}
	}
	if len(codes) == 0 {
		return nil
	}
	return codes
}

// isSeparator reports whether b separates the marker from its code list.
func isSeparator(b byte) bool {
	return b == ' ' || b == '\t' || b == ',' || b == '\n' || b == '\r'
}
