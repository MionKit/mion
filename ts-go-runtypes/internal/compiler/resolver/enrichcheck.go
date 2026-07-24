package resolver

import (
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/enrichment"
	"github.com/mionkit/ts-runtypes/internal/enrichment/astcheck"
	"github.com/mionkit/ts-runtypes/internal/enrichment/mirror"
)

// checkEnrichFiles is the Request.CheckEnrich pass of OpScanFiles: the
// enrichment-health diagnostics (FamilyEnrich) for every requested file that
// looks like an enrichment mirror. Three groups per file, one text read:
//
//   - tag hygiene (FT020–FT022 / MD020–MD022, per the mirror's family) — the
//     comment-anchored scan over the Program's view of the file (one
//     mirror.Scan built from the file's EXISTING parse, so unsaved overlay
//     text is honored and the parse is never paid twice);
//   - FriendlyText / MockData content validity (FT/MD codes) — the shared
//     astcheck walk against this resolver's checker + runtype cache;
//   - breadcrumb drift (GE002/GE003) — the mirror's source link, read from
//     disk (mirrors track on-disk sources).
//
// Non-enrichment files and files the Program doesn't carry contribute
// nothing; the pass never fails the op. Sites echo the REQUESTED path,
// matching the marker scanner's convention, so the consumer can key
// diagnostics back to the file it asked about.
func (sess *Session) checkEnrichFiles(files []string) []diagnostics.Diagnostic {
	var out []diagnostics.Diagnostic
	if sess.Program == nil {
		return out
	}
	for _, file := range files {
		sourceFile, err := sess.sourceFile(file)
		if err != nil || sourceFile == nil {
			continue
		}
		scan := mirror.NewScanForSourceFile(sourceFile)
		if !scan.IsEnrichmentFile() {
			continue
		}

		text := scan.Text()
		lineIndex := mirror.NewLineIndex(text)
		classifier := scan.FamilyClassifier()
		for _, tag := range scan.DirtyTags() {
			out = append(out, diagnostics.New(tagCode(tag.Kind, classifier.FamilyFor(tag)), tagSite(file, lineIndex, tag)))
		}

		for _, finding := range astcheck.CheckSourceFile(sourceFile, sess.checker, sess.cache, sess.Program.FS, file) {
			out = append(out, enrichDiagnostic(finding.Code, finding.Severity, finding.Args, finding.Site))
		}

		// Drift only applies to GENERATED mirrors (marker emit form present as
		// a real comment): a hand-written file that merely annotates consts
		// with FriendlyText / MockData has ordinary relative imports, not a
		// breadcrumb. The CLI `check` verb — where the user explicitly targets
		// enrichment files — stays ungated.
		if scan.HasMarkerComment() {
			absolutePath := tspath.ResolvePath(sess.Program.TS.GetCurrentDirectory(), file)
			for _, drift := range mirror.CheckBreadcrumbDrift(absolutePath, text, sess.Program.FS) {
				out = append(out, diagnostics.New(drift.Code, tagSite(file, lineIndex, mirror.TagFinding{Start: drift.Start, End: drift.End}), drift.Args...))
			}
		}
	}
	return out
}

// enrichDiagnostic builds the wire diagnostic for one content finding. Known
// codes go through diagnostics.New (severity owned by the catalog); an UNREGISTERED
// code — a checker code that landed without a codes_friendly.go /
// codes_mock.go entry — must not panic the resolver mid-lint, so it is built
// manually with the finding's own severity. The JS side renders unknown codes with its own fallback, so
// the finding still reaches the user either way.
func enrichDiagnostic(code string, severity enrichment.Severity, args []string, site diagnostics.Site) diagnostics.Diagnostic {
	if _, known := diagnostics.Definitions[code]; known {
		return diagnostics.New(code, site, args...)
	}
	diagnostic := diagnostics.Diagnostic{Code: code, Family: diagnostics.FamilyEnrich, Severity: diagSeverityFor(severity), Site: site}
	if len(args) > 0 {
		diagnostic.Args = args
	}
	return diagnostic
}

// diagSeverityFor maps an enrichment.Severity onto the wire severity scheme.
func diagSeverityFor(severity enrichment.Severity) diagnostics.Severity {
	switch severity {
	case enrichment.Error:
		return diagnostics.SeverityError
	case enrichment.Warning:
		return diagnostics.SeverityWarning
	default:
		return diagnostics.SeverityInfo
	}
}

// tagCode maps a hygiene TagKind + the finding's mirror family to its diag
// code. Since the per-family file split every hygiene code is family-specific
// (FT02x in a FriendlyText mirror, MD02x in a MockData mirror); an
// unattributable finding (no annotation, no DSL import — only possible in a
// degenerate hand-edited file) reports under the friendly code and the file
// path in the site tells the user the rest.
func tagCode(kind mirror.TagKind, family mirror.MirrorFamily) string {
	if family == mirror.FamilyMock {
		switch kind {
		case mirror.TagOrphan:
			return diagnostics.CodeMockOrphanConst
		case mirror.TagOrphanChild:
			return diagnostics.CodeMockOrphanField
		default:
			return diagnostics.CodeMockTodo
		}
	}
	switch kind {
	case mirror.TagOrphan:
		return diagnostics.CodeFriendlyOrphanConst
	case mirror.TagOrphanChild:
		return diagnostics.CodeFriendlyOrphanField
	default:
		return diagnostics.CodeFriendlyTodo
	}
}

// tagSite converts a byte-offset finding to a 1-based diagnostics.Site on the
// requested file path.
func tagSite(file string, lineIndex *mirror.LineIndex, tag mirror.TagFinding) diagnostics.Site {
	startLine, startCol := lineIndex.At(tag.Start)
	endLine, endCol := lineIndex.At(tag.End)
	return diagnostics.Site{FilePath: file, StartLine: startLine, StartCol: startCol, EndLine: endLine, EndCol: endCol}
}
