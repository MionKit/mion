package enrichgen

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/runtype"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment"
	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment/astcheck"
	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment/mirror"
)

// CheckFile is the ONE enrichment-health pass behind both the resolver's checkEnrich lint pass and `enrich <file> --no-emit`,
// so the editor and the command never disagree; it contributes nothing for a non-enrichment file and never fails.
// Three diagnostic groups off one text read: tag hygiene, FriendlyText / MockData content validity, and breadcrumb drift.
// filePath is echoed on each diagnostic site; absolutePath resolves the breadcrumb source, the CLI passing one path for both.
// markerOpts carries the accepted marker package set and the Program filesystem, so unsaved overlay text is honored.
func CheckFile(sourceFile *ast.SourceFile, chk *checker.Checker, cache *runtype.Cache, markerOpts marker.Options, filePath, absolutePath string) []diagnostics.Diagnostic {
	var out []diagnostics.Diagnostic
	if sourceFile == nil {
		return out
	}
	scan := mirror.NewScanForSourceFile(sourceFile)
	if !scan.IsEnrichmentFile() {
		return out
	}

	text := scan.Text()
	lineIndex := mirror.NewLineIndex(text)
	classifier := scan.FamilyClassifier()
	for _, tag := range scan.DirtyTags() {
		out = append(out, diagnostics.New(tagCode(tag.Kind, classifier.FamilyFor(tag)), tagSite(filePath, lineIndex, tag)))
	}
	// A blank scaffold value is as incomplete as a @todo marker: deleting the @todo line does not make it done.
	// A value sits below its const's annotation, hence FamilyAt (at-or-before) rather than FamilyFor.
	for _, blank := range scan.BlankValues() {
		out = append(out, diagnostics.New(tagCode(blank.Kind, classifier.FamilyAt(blank.Start)), tagSite(filePath, lineIndex, blank)))
	}

	for _, finding := range astcheck.CheckSourceFile(sourceFile, chk, cache, markerOpts, filePath) {
		out = append(out, enrichDiagnostic(finding.Code, finding.Severity, finding.Args, finding.Site))
	}

	// Drift only applies to GENERATED mirrors: a hand-written annotation file has ordinary imports, not a breadcrumb.
	if scan.HasMarkerComment() {
		for _, drift := range mirror.CheckBreadcrumbDrift(absolutePath, text, markerOpts.FS) {
			out = append(out, diagnostics.New(drift.Code, tagSite(filePath, lineIndex, mirror.TagFinding{Start: drift.Start, End: drift.End}), drift.Args...))
		}
	}
	return out
}

// HygieneDiagnostics is the text-only tag-hygiene subset of CheckFile: no Program, no module resolution, no checker.
// The enrich WRITE lane uses it on fresh mirrors, whose family its spec already gives, so no classifier is needed.
func HygieneDiagnostics(mirrorText, filePath string, mockFamily bool) []diagnostics.Diagnostic {
	family := mirror.FamilyFriendly
	if mockFamily {
		family = mirror.FamilyMock
	}
	lineIndex := mirror.NewLineIndex(mirrorText)
	scan := mirror.NewScan(mirrorText)
	var out []diagnostics.Diagnostic
	for _, tag := range scan.DirtyTags() {
		out = append(out, diagnostics.New(tagCode(tag.Kind, family), tagSite(filePath, lineIndex, tag)))
	}
	for _, blank := range scan.BlankValues() {
		out = append(out, diagnostics.New(tagCode(blank.Kind, family), tagSite(filePath, lineIndex, blank)))
	}
	return out
}

// enrichDiagnostic builds the wire diagnostic for one content finding; a registered code takes its severity from the catalog.
// An unregistered code must not panic mid-lint, so it is built from the finding's own severity and the JS side renders it.
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

// tagCode maps a hygiene TagKind plus the mirror family to its diag code, every hygiene code being family-specific.
// An unattributable finding, only possible in a degenerate hand-edited file, reports under the friendly code.
func tagCode(kind mirror.TagKind, family mirror.MirrorFamily) string {
	if family == mirror.FamilyMock {
		switch kind {
		case mirror.TagOrphan:
			return diagnostics.CodeMockOrphanConst
		case mirror.TagOrphanChild:
			return diagnostics.CodeMockOrphanField
		case mirror.TagBlankValue:
			return diagnostics.CodeMockBlankValue
		default:
			return diagnostics.CodeMockTodo
		}
	}
	switch kind {
	case mirror.TagOrphan:
		return diagnostics.CodeFriendlyOrphanConst
	case mirror.TagOrphanChild:
		return diagnostics.CodeFriendlyOrphanField
	case mirror.TagBlankValue:
		return diagnostics.CodeFriendlyBlankValue
	default:
		return diagnostics.CodeFriendlyTodo
	}
}

// tagSite converts a byte-offset finding to a 1-based diagnostics.Site on the requested file path.
func tagSite(file string, lineIndex *mirror.LineIndex, tag mirror.TagFinding) diagnostics.Site {
	startLine, startCol := lineIndex.At(tag.Start)
	endLine, endCol := lineIndex.At(tag.End)
	return diagnostics.Site{FilePath: file, StartLine: startLine, StartCol: startCol, EndLine: endLine, EndCol: endCol}
}
