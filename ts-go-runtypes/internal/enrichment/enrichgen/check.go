package enrichgen

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	vfspkg "github.com/microsoft/typescript-go/shim/vfs"
	"github.com/mionkit/ts-runtypes/internal/cachegen/runtype"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/enrichment"
	"github.com/mionkit/ts-runtypes/internal/enrichment/astcheck"
	"github.com/mionkit/ts-runtypes/internal/enrichment/mirror"
)

// CheckFile is the shared enrichment-health pass over one source file — the ONE
// implementation behind both the resolver's checkEnrich lint pass (served to the
// ts-runtypes-devtools editor plugin) and the CLI `enrich <file> --no-emit` lane,
// so the editor and the command never disagree. It contributes nothing for a
// non-enrichment file; it never fails. Three diagnostic groups, one text read:
//
//   - tag hygiene (FT020–FT022 / MD020–MD022, per the mirror's family) — the
//     comment-anchored scan over the Program's view of the file;
//   - FriendlyText / MockData content validity (FT/MD codes) — the astcheck walk
//     against the checker + runtype cache;
//   - breadcrumb drift (GE002/GE003) — the mirror's source link, gated on
//     scan.HasMarkerComment() so it applies only to GENERATED mirrors (a
//     hand-written annotation file has ordinary imports, not a breadcrumb).
//
// filePath is the path echoed on each diagnostic site (the caller's requested
// path); absolutePath is the absolute path used to resolve the breadcrumb source
// (the resolver resolves the requested path against the Program's cwd; the CLI
// already holds an absolute path and passes it for both). moduleFS is the
// Program filesystem, so unsaved overlay text is honored.
func CheckFile(sourceFile *ast.SourceFile, chk *checker.Checker, cache *runtype.Cache, moduleFS vfspkg.FS, filePath, absolutePath string) []diagnostics.Diagnostic {
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
	// Blank scaffold VALUES (empty label / message / pool) are as incomplete as a
	// @todo marker — a fresh scaffold with the @todo line deleted but the values
	// still blank is NOT done. A value sits below its const's annotation, so it is
	// attributed with FamilyAt (at-or-before) rather than FamilyFor.
	for _, blank := range scan.BlankValues() {
		out = append(out, diagnostics.New(tagCode(blank.Kind, classifier.FamilyAt(blank.Start)), tagSite(filePath, lineIndex, blank)))
	}

	for _, finding := range astcheck.CheckSourceFile(sourceFile, chk, cache, moduleFS, filePath) {
		out = append(out, enrichDiagnostic(finding.Code, finding.Severity, finding.Args, finding.Site))
	}

	// Drift only applies to GENERATED mirrors (marker emit form present as a real
	// comment): a hand-written file that merely annotates consts with FriendlyText
	// / MockData has ordinary relative imports, not a breadcrumb.
	if scan.HasMarkerComment() {
		for _, drift := range mirror.CheckBreadcrumbDrift(absolutePath, text, moduleFS) {
			out = append(out, diagnostics.New(drift.Code, tagSite(filePath, lineIndex, mirror.TagFinding{Start: drift.Start, End: drift.End}), drift.Args...))
		}
	}
	return out
}

// HygieneDiagnostics is the text-only tag-hygiene subset of CheckFile: it scans
// mirrorText for unfilled @todo scaffolds, blank scaffold values, and stale
// @rtOrphan carcasses and maps each to its family-specific diag code (FT02x /
// MD02x), WITHOUT a Program — no module resolution, no checker. The enrich WRITE
// lane uses it for the freshly-scaffolded worklist, where each written mirror's
// family is already known from its spec, so no per-tag classifier is needed. (The
// full CheckFile, which also runs content validity + breadcrumb drift, backs the
// check lanes.)
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

// enrichDiagnostic builds the wire diagnostic for one content finding. Known
// codes go through diagnostics.New (severity owned by the catalog); an
// UNREGISTERED code — a checker code that landed without a codes_friendly.go /
// codes_mock.go entry — must not panic mid-lint, so it is built manually with the
// finding's own severity. The JS side renders unknown codes with its own
// fallback, so the finding still reaches the user either way.
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

// tagCode maps a hygiene TagKind + the finding's mirror family to its diag code.
// Since the per-family file split every hygiene code is family-specific (FT02x in
// a FriendlyText mirror, MD02x in a MockData mirror); an unattributable finding
// (no annotation, no DSL import — only possible in a degenerate hand-edited file)
// reports under the friendly code and the file path in the site tells the rest.
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

// tagSite converts a byte-offset finding to a 1-based diagnostics.Site on the
// requested file path.
func tagSite(file string, lineIndex *mirror.LineIndex, tag mirror.TagFinding) diagnostics.Site {
	startLine, startCol := lineIndex.At(tag.Start)
	endLine, endCol := lineIndex.At(tag.End)
	return diagnostics.Site{FilePath: file, StartLine: startLine, StartCol: startCol, EndLine: endLine, EndCol: endCol}
}
