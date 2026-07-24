package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"sort"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/enrichment"
	"github.com/mionkit/ts-runtypes/internal/enrichment/astcheck"
	"github.com/mionkit/ts-runtypes/internal/enrichment/mirror"
)

// fileFinding pairs a Finding with its source file and 1-based position for
// the report. Line/Col are zero when a finding could not be anchored.
type fileFinding struct {
	File string `json:"file"`
	enrichment.Finding
	Line    int `json:"line,omitempty"`
	Col     int `json:"col,omitempty"`
	EndLine int `json:"endLine,omitempty"`
	EndCol  int `json:"endCol,omitempty"`
}

// runCheck implements the `check` verb — the single checking convention. A
// single .ts FILE target runs the single-file enrichment health report (the CLI
// twin of the resolver's checkEnrich pass the ts-runtypes-devtools lint plugin
// surfaces in the editor):
//
//   - tag hygiene: unfilled `@todo` scaffolds and stale `@rtOrphan` /
//     `@rtOrphanChild` carcasses, reported under the mirror's family
//     (FT020–FT022 / MD020–MD022);
//   - FriendlyText / MockData content validity against the resolved T
//     (FT002/FT003/FT005/MD001);
//   - breadcrumb drift: source deleted / type no longer declared (GE002/GE003).
//
// A DIRECTORY target (or no target — walk the enrich dir) runs the mirror-tree
// breadcrumb + location drift walk (GE001/GE002/GE003), and `--translate` runs
// the i18n completeness gate. These were the former `gen --check` and
// `check --translate` spellings, folded onto this one verb.
//
// Exits 1 when any Finding is Error severity.
func runCheck(args []string) {
	fs := flag.NewFlagSet("check", flag.ExitOnError)
	asJSON := fs.Bool("json", false, "emit findings as a JSON array")
	genDirFlag := fs.String("gen-dir", "", "RunTypes output root override (precedence: this flag > tsconfig genDir > default __runtypes)")
	translate := fs.String("translate", "", "i18n completeness gate: report @todo blanks / orphans / out-of-date translations for a locale (or 'all')")
	tsconfigFlag := fs.String("tsconfig", "", "project tsconfig path (default: found like tsc, searching upward from the working directory)")
	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, "Usage: ts-runtypes check <file.ts> [--json] [--tsconfig <path>]   (single-file enrichment health)")
		fmt.Fprintln(os.Stderr, "   or: ts-runtypes check [<dir>] [--json]                          (mirror-tree breadcrumb + location drift)")
		fmt.Fprintln(os.Stderr, "   or: ts-runtypes check --translate <locale|all>                  (translation completeness; strict via tsconfig i18n.strict)")
	}
	positional, flags := splitArgs(args)
	if err := fs.Parse(flags); err != nil {
		fatal("check: %v", err)
	}
	if *translate != "" {
		runCheckTranslate(*translate, *genDirFlag, *tsconfigFlag)
		return
	}
	// No target, or a directory target → the mirror-tree breadcrumb + location
	// drift walk (absorbed from the former `gen --check`). A single .ts file
	// target runs the deep single-file health report below.
	if len(positional) == 0 || isDirArg(positional[0]) {
		runGenCheck(positional, *genDirFlag, *asJSON, *tsconfigFlag)
		return
	}
	absPath := tspath.NormalizePath(mustAbs(positional[0]))

	_, parsed := resolveEnrichProject(*tsconfigFlag)
	prog, res, err := buildProgram(absPath, parsed)
	if err != nil {
		fatal("check: %v", err)
	}
	defer res.Close()

	sourceFile := prog.SourceFile(absPath)
	if sourceFile == nil {
		fatal("check: source file not in program: %s", absPath)
	}
	if res.Checker() == nil {
		fatal("check: resolver has no checker")
	}

	scan := mirror.NewScanForSourceFile(sourceFile)
	text := scan.Text()
	lineIndex := mirror.NewLineIndex(text)
	var findings []fileFinding

	// Tag hygiene — the same detection the resolver's checkEnrich pass uses
	// and the same comment-anchored matches `gen --prune` removes, computed
	// off the program's existing parse.
	classifier := scan.FamilyClassifier()
	for _, tag := range scan.DirtyTags() {
		findings = append(findings, tagFileFinding(absPath, lineIndex, tag, classifier.FamilyFor(tag)))
	}

	// FriendlyText / MockData content validity.
	for _, positioned := range astcheck.CheckSourceFile(sourceFile, res.Checker(), res.Cache(), prog.FS, absPath) {
		findings = append(findings, fileFinding{
			File:    absPath,
			Finding: positioned.Finding,
			Line:    positioned.Site.StartLine,
			Col:     positioned.Site.StartCol,
			EndLine: positioned.Site.EndLine,
			EndCol:  positioned.Site.EndCol,
		})
	}

	// Breadcrumb drift (GE002/GE003).
	for _, drift := range mirror.CheckBreadcrumbDrift(absPath, text, nil) {
		line, col := lineIndex.At(drift.Start)
		endLine, endCol := lineIndex.At(drift.End)
		findings = append(findings, fileFinding{
			File:    absPath,
			Finding: enrichment.Finding{Code: drift.Code, Severity: drift.Severity(), Message: drift.Message, Args: drift.Args},
			Line:    line,
			Col:     col,
			EndLine: endLine,
			EndCol:  endCol,
		})
	}

	sortFileFindings(findings)
	os.Exit(reportFindings(findings, *asJSON))
}

// isDirArg reports whether the CLI path argument points at an existing
// directory — the check verb routes a directory (or an absent) target to the
// mirror-tree drift walk, a file target to the single-file health report.
func isDirArg(path string) bool {
	info, err := os.Stat(mustAbs(path))
	return err == nil && info.IsDir()
}

// tagFileFinding converts one hygiene TagFinding to the report shape.
func tagFileFinding(file string, lineIndex *mirror.LineIndex, tag mirror.TagFinding, family mirror.MirrorFamily) fileFinding {
	code, message := tagCodeMessage(tag.Kind, family)
	line, col := lineIndex.At(tag.Start)
	endLine, endCol := lineIndex.At(tag.End)
	return fileFinding{
		File:    file,
		Finding: enrichment.Finding{Code: code, Severity: mirror.EnrichSeverity(code), Message: message},
		Line:    line,
		Col:     col,
		EndLine: endLine,
		EndCol:  endCol,
	}
}

// tagCodeMessage maps a hygiene TagKind + mirror family to its diag code and
// CLI message. Every hygiene code is family-specific since the per-family
// mirror split; an unattributable finding reports under the friendly code
// (same convention as the resolver's tagCode).
func tagCodeMessage(kind mirror.TagKind, family mirror.MirrorFamily) (string, string) {
	familyName := enrichment.FriendlyTypeName
	if family == mirror.FamilyMock {
		familyName = enrichment.MockDataName
	}
	switch kind {
	case mirror.TagOrphan:
		return tagCode(kind, family), "stale " + mirror.OrphanTag + " carcass in a " + familyName + " mirror — run `ts-runtypes gen --prune` to remove it (or restore the type)"
	case mirror.TagOrphanChild:
		return tagCode(kind, family), "stale " + mirror.OrphanChildTag + " field carcass in a " + familyName + " mirror — run `ts-runtypes gen --prune` to remove it (or restore the field)"
	default:
		return tagCode(kind, family), "unfilled " + mirror.TodoTag + " placeholder — fill in the value, then delete the " + mirror.TodoTag + " line"
	}
}

// tagCode maps a hygiene TagKind + mirror family to its diag code (the CLI
// twin of the resolver's mapping in internal/compiler/resolver/enrichcheck.go).
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

// sortFileFindings orders findings by (File, Line, Col, Path, Code) for
// deterministic reporting.
func sortFileFindings(findings []fileFinding) {
	sort.SliceStable(findings, func(left, right int) bool {
		if findings[left].File != findings[right].File {
			return findings[left].File < findings[right].File
		}
		if findings[left].Line != findings[right].Line {
			return findings[left].Line < findings[right].Line
		}
		if findings[left].Col != findings[right].Col {
			return findings[left].Col < findings[right].Col
		}
		if findings[left].Path != findings[right].Path {
			return findings[left].Path < findings[right].Path
		}
		return findings[left].Code < findings[right].Code
	})
}

// reportFindings prints findings (text or JSON) and the stderr summary, and
// returns the process exit code (1 when any Error finding is present).
func reportFindings(findings []fileFinding, asJSON bool) int {
	hasError := false
	for _, finding := range findings {
		if finding.Severity == enrichment.Error {
			hasError = true
		}
	}

	if asJSON {
		encoded, err := json.MarshalIndent(findings, "", "  ")
		if err != nil {
			fatal("check: encode json: %v", err)
		}
		fmt.Println(string(encoded))
	} else {
		for _, finding := range findings {
			if finding.Line > 0 {
				fmt.Printf("%s(%d,%d):%s\n", finding.File, finding.Line, finding.Col, enrichment.FormatFinding(finding.Finding))
			} else {
				fmt.Printf("%s:%s\n", finding.File, enrichment.FormatFinding(finding.Finding))
			}
		}
	}

	fmt.Fprintf(os.Stderr, "check: 1 file(s), %d finding(s)\n", len(findings))
	if hasError {
		return 1
	}
	return 0
}
