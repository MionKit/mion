package resolver

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/srcscan"
	"github.com/mionkit/mion/ts-go-runtypes/internal/textpos"
)

// expecterror.go finds the `@mion-expect-error` / `@mion-downgrade-error`
// comments in the program's own source and hands them to
// diagnostics.ApplyDirectives, which owns what they mean. This half owns only
// what a comment lexer and a line map can answer: WHERE the real comments are,
// WHICH line each one covers, WHICH of the two it is, and whether its shape and
// position make it a file directive rather than a line one.
//
// It runs at the Dispatch choke point, so a directive removes a finding for
// every consumer at once: the bundler build, `mion compile`, and the editor's
// lint squiggles. That is what a source-level assertion should do, unlike
// `downgradeErrors`, which is build policy and is applied by the consumer that
// decides whether to halt.

// settleDiagnostics is the last thing every op's diagnostics pass through: the
// repeats collapse, then the directive comments take effect. Both
// belong here rather than inside a handler because the lanes assemble their
// diagnostics on different branches of dispatch.
//
// APPLYING a directive runs on every op, because a directive is a fact about
// the source whichever question was asked. REPORTING a wrong directive (the EXP
// / DWN codes) runs only where the answer is real, which is what directiveScope
// works out.
//
// Cost when no directive exists is one substring scan per source file, and the
// sweep is skipped entirely when there is neither a finding to silence nor a
// report to make.
func (sess *Session) settleDiagnostics(list []diagnostics.Diagnostic, request protocol.Request) []diagnostics.Diagnostic {
	list = diagnostics.Dedupe(list)
	scope := sess.directiveScope(request)
	if len(list) == 0 && !scope.Reports {
		return list
	}
	directives := sess.programDirectives()
	if len(directives) == 0 {
		return list
	}
	return diagnostics.ApplyDirectives(list, directives, sess.absPath, scope)
}

// directiveScope describes what this request could report, so the EXP / DWN
// codes never fire on a question it cannot answer.
//
// Two ops report. OpGenerate is the BUILD pass: it covers every file but never
// asks for the opt-in families, so it judges only directives naming codes it
// could have raised. OpScanFiles is the LINT pass: it covers the files it was
// given and, with both opt-ins set, every family for them, which is what makes
// the editor the place a stale or mistyped directive shows up. Every other op
// silences without judging.
func (sess *Session) directiveScope(request protocol.Request) diagnostics.PassScope {
	families := map[diagnostics.Family]bool{
		diagnostics.FamilyPureFn: true,
		diagnostics.FamilyMarker: true,
	}
	switch request.Op {
	case protocol.OpGenerate:
		// A generate renders every entry, so the RunType family is always in play.
		families[diagnostics.FamilyRunType] = true
		return diagnostics.PassScope{Reports: true, Families: families}
	case protocol.OpScanFiles:
		// The RunType family only renders when the request asked for entries or
		// for their diagnostics; a plain rewrite scan raises none of them.
		if request.IncludeEntryModules || request.IncludeRtDiagnostics {
			families[diagnostics.FamilyRunType] = true
		}
		if request.CheckEnrich {
			families[diagnostics.FamilyEnrich] = true
		}
		if request.CheckRouterRules {
			families[diagnostics.FamilyMionRoute] = true
		}
		files := make(map[string]bool, len(request.Files))
		for _, file := range request.Files {
			files[sess.absPath(file)] = true
		}
		return diagnostics.PassScope{Reports: true, Files: files, Families: families}
	}
	return diagnostics.PassScope{}
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
		if !carriesDirective(sourceFile.Text()) {
			continue
		}
		directives = append(directives, fileDirectives(sourceFile.FileName(), sourceFile)...)
	}
	return directives
}

// carriesDirective is the cheap per-file prefilter: only a file that actually
// spells one of the markers pays for a parse-guided comment lex.
func carriesDirective(text string) bool {
	return strings.Contains(text, diagnostics.DirectiveMarker) ||
		strings.Contains(text, diagnostics.DowngradeDirectiveMarker)
}

// fileDirectives parses one file's directives. Comments come from srcscan, so a
// directive written inside a string or a regex is not one, and a directive
// inside a template interpolation is.
func fileDirectives(filePath string, sourceFile *ast.SourceFile) []diagnostics.Directive {
	text := sourceFile.Text()
	spans := srcscan.Comments(text, srcscan.LiteralTokenRanges(sourceFile))
	codeStart := firstCodeOffset(text, spans)
	var directives []diagnostics.Directive
	for _, span := range spans {
		kind, body, isBlock, isDirective := directiveBody(text, span)
		if !isDirective {
			continue
		}
		startLine, startCol := textpos.LineCol(sourceFile, span.Start)
		endLine, endCol := textpos.LineCol(sourceFile, span.End)
		scope := diagnostics.DirectiveScopeLine
		// A block comment before any code covers the file, the way ESLint's
		// `/* eslint-disable */` does. A line comment never does, and neither
		// does a block comment further down, which stays the line form it is
		// today.
		if isBlock && span.End <= codeStart {
			scope = diagnostics.DirectiveScopeFile
		}
		directives = append(directives, diagnostics.Directive{
			Kind:  kind,
			Scope: scope,
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

// firstCodeOffset is where the file's code begins: the first byte that is
// neither whitespace nor inside a comment. Comments come in source order, so one
// pass over them is enough. A file of nothing but comments answers its length,
// which makes every directive in it a file directive.
func firstCodeOffset(text string, spans []srcscan.Span) int {
	offset := 0
	for _, span := range spans {
		for offset < span.Start && isSpace(text[offset]) {
			offset++
		}
		if offset < span.Start {
			return offset
		}
		offset = span.End
	}
	for offset < len(text) && isSpace(text[offset]) {
		offset++
	}
	return offset
}

// isSpace reports whether b is whitespace between the top of a file and its
// first code.
func isSpace(b byte) bool {
	return b == ' ' || b == '\t' || b == '\n' || b == '\r' || b == '\v' || b == '\f'
}

// directiveBody reports whether a comment span is a directive, and returns which
// kind it is, the text after the marker, and whether it was written as a block
// comment (which is what makes it a file directive at the top of a file).
//
// The comment must be the first thing on its own line. A trailing comment after
// code is deliberately not a directive: it would otherwise be ambiguous whether
// it covers the line it sits on or the next one, and TypeScript draws the same
// line for `@ts-expect-error`.
func directiveBody(text string, span srcscan.Span) (diagnostics.DirectiveKind, string, bool, bool) {
	if !ownLine(text, span.Start) {
		return 0, "", false, false
	}
	raw := text[span.Start:span.End]
	isBlock := strings.HasPrefix(raw, "/*")
	inner := strings.TrimSpace(strings.Trim(strings.TrimPrefix(strings.TrimPrefix(raw, "//"), "/*"), "*/"))
	// Tolerate a leading `*` so the directive also works inside a JSDoc block.
	inner = strings.TrimSpace(strings.TrimPrefix(inner, "*"))
	for _, kind := range []diagnostics.DirectiveKind{diagnostics.DirectiveExpect, diagnostics.DirectiveDowngrade} {
		marker := kind.Marker()
		if !strings.HasPrefix(inner, marker) {
			continue
		}
		rest := inner[len(marker):]
		// `@mion-expect-errorFOO` is a different word, not a bare directive.
		if rest != "" && !isSeparator(rest[0]) {
			return 0, "", false, false
		}
		return kind, rest, isBlock, true
	}
	return 0, "", false, false
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
