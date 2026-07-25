package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/enrichment/enrichgen"
	"github.com/mionkit/ts-runtypes/internal/enrichment/mirror"
)

// The single-file enrichment-health check is the CLI half of the shared
// enrichgen.CheckFile (the OTHER half is the resolver's checkEnrich lint pass the
// ts-runtypes-devtools plugin surfaces). It runs under the `enrich <file>
// --no-emit` grammar: tag hygiene (unfilled @todo scaffolds, stale @rtOrphan
// carcasses), FriendlyText / MockData content validity, and breadcrumb drift
// (GE002/GE003, gated on the generated-mirror marker). A DIRECTORY / no target
// runs the mirror-tree drift walk (runGenCheck); `--translate` runs the i18n
// completeness gate (runCheckTranslate) — both routed from runEnrich.

// runSingleFileCheck is the `enrich <file> --no-emit` lane: build a Program over
// the mirror file and run the shared enrichgen.CheckFile, reporting its
// diagnostics. Exits 1 on any WRONG/stale finding; under requireComplete an
// unfilled @todo also fails.
func runSingleFileCheck(fileArg, tsconfigFlag string, asJSON, requireComplete bool) {
	absPath := tspath.NormalizePath(mustAbs(fileArg))
	tsconfigPath, parsed := resolveEnrichProject(tsconfigFlag)
	config := resolveEnrichConfig(absPath, "", tsconfigPath, parsed)
	os.Exit(reportEnrichDiagnostics(checkMirrorFilesDiagnostics([]string{absPath}, parsed, config.HashLength), asJSON, requireComplete))
}

// checkMirrorFilesDiagnostics builds ONE inferred Program over the given mirror
// files (skipping any that do not exist) and runs the shared enrichgen.CheckFile
// on each, returning the combined diagnostics. It is the CLI's bridge into the
// same health pass the resolver serves the editor: the CLI already holds an
// absolute path, so it passes it for both the site echo and the breadcrumb
// resolution. No existing files → nil (so an empty --json report marshals to the
// `null` the harness expects).
func checkMirrorFilesDiagnostics(paths []string, parsed *program.InferredConfig, hashLength int) []diagnostics.Diagnostic {
	existing := make([]string, 0, len(paths))
	seen := map[string]bool{}
	for _, path := range paths {
		if seen[path] {
			continue
		}
		seen[path] = true
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			existing = append(existing, path)
		}
	}
	if len(existing) == 0 {
		return nil
	}
	prog, res, err := buildProgramMulti(existing, parsed, hashLength)
	if err != nil {
		fatal("enrich --no-emit: %v", err)
	}
	defer res.Close()

	var out []diagnostics.Diagnostic
	for _, path := range existing {
		sourceFile := prog.SourceFile(path)
		out = append(out, enrichgen.CheckFile(sourceFile, res.Checker(), res.Cache(), prog.FS, path, path)...)
	}
	return out
}

// reportEnrichDiagnostics prints the diagnostics (text via diagnostics.FormatDebug
// — the same rendering compile uses — or JSON) plus the stderr summary, and
// returns the process exit code. The gate is TWO-TIER: a WRONG/stale finding
// (malformed content, orphan carcass, breadcrumb drift) always fails; an
// INCOMPLETE finding (unfilled @todo scaffold — diagnostics.IsCompleteness) fails
// ONLY when requireComplete is set (`enrich --require-complete`). So the default
// health check tolerates the expected @todo blanks a fresh scaffold leaves, while
// the completeness gate rejects them.
// An empty JSON report marshals to `null` (a nil slice), matching the health
// harness's `JSON.parse(stdout || 'null')`.
func reportEnrichDiagnostics(diags []diagnostics.Diagnostic, asJSON, requireComplete bool) int {
	sort.SliceStable(diags, func(left, right int) bool {
		leftSite, rightSite := diags[left].Site, diags[right].Site
		if leftSite.FilePath != rightSite.FilePath {
			return leftSite.FilePath < rightSite.FilePath
		}
		if leftSite.StartLine != rightSite.StartLine {
			return leftSite.StartLine < rightSite.StartLine
		}
		if leftSite.StartCol != rightSite.StartCol {
			return leftSite.StartCol < rightSite.StartCol
		}
		return diags[left].Code < diags[right].Code
	})

	hasError := false
	for _, diag := range diags {
		if diag.Severity != diagnostics.SeverityError {
			continue
		}
		// Completeness findings (unfilled @todo) only fail under --require-complete;
		// the default health check reports them but exits 0.
		if !requireComplete && diagnostics.IsCompleteness(diag.Code) {
			continue
		}
		hasError = true
	}

	if asJSON {
		encoded, err := json.MarshalIndent(diags, "", "  ")
		if err != nil {
			fatal("enrich: encode json: %v", err)
		}
		fmt.Println(string(encoded))
	} else {
		for _, diag := range diags {
			fmt.Println(diagnostics.FormatDebug(diag))
		}
	}

	fmt.Fprintf(os.Stderr, "enrich --no-emit: %d finding(s)\n", len(diags))
	if hasError {
		return 1
	}
	return 0
}

// isDirArg reports whether the CLI path argument points at an existing directory
// — the check-only grammar routes a directory (or an absent) target to the
// mirror-tree drift walk, a file target to the single-file health report.
func isDirArg(path string) bool {
	info, err := os.Stat(mustAbs(path))
	return err == nil && info.IsDir()
}

// scaffoldWorklist reads each freshly-written mirror and returns its tag-hygiene
// diagnostics (the @todo fill-in worklist) via the text-only
// enrichgen.HygieneDiagnostics — the family of each mirror is known from its spec,
// so no second Program is built (and no dependency on resolving the mirror's
// imports). A combined --out spec (both families in one file) reports under the
// friendly codes; the exact FT02x/MD02x code is cosmetic for the worklist.
func scaffoldWorklist(specs []mirror.Spec) []diagnostics.Diagnostic {
	var out []diagnostics.Diagnostic
	for _, spec := range specs {
		contents, err := os.ReadFile(spec.MirrorPath)
		if err != nil {
			continue
		}
		mockFamily := spec.WantMock && !spec.WantFriendly
		out = append(out, enrichgen.HygieneDiagnostics(string(contents), spec.MirrorPath, mockFamily)...)
	}
	return out
}

// printEnrichWorklist surfaces the write lane's freshly-scaffolded diagnostics on
// stderr — informational, so the scaffold still exits 0. The check gate that FAILS
// on unfilled @todos (they are Error severity in the catalog) is the diagnostics-
// only `enrich <file> --no-emit`.
func printEnrichWorklist(diags []diagnostics.Diagnostic) {
	for _, diag := range diags {
		fmt.Fprintln(os.Stderr, diagnostics.FormatDebug(diag))
	}
}
