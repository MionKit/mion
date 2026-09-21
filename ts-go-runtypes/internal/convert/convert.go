// Package convert is the format-conversion leaf behind the `mion convert` CLI verb: it rewrites a
// file's type declarations between the type-first and value-first builder forms over the shared
// reflection RunType graph. Both input forms already normalize to that graph through the checker;
// this package adds the output half (one printer per target form), declaration recognition and the
// source edits, so conversion can never change a type's structural id, pinned by the id oracle in
// the convert fuzz lane. A declaration with no exact spelling reports a CNV diagnostic and stays
// untouched.
package convert

import (
	"fmt"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/runtype"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/tsimports"
)

// Target names one of the two authoring forms a file can be converted to.
type Target string

const (
	TargetType     Target = "type"
	TargetBuilders Target = "builders"
)

// ParseTarget maps the CLI --to value onto a Target.
func ParseTarget(raw string) (Target, error) {
	switch Target(raw) {
	case TargetType, TargetBuilders:
		return Target(raw), nil
	}
	return "", fmt.Errorf("unknown --to target %q (expected type | builders)", raw)
}

// Severity of a conversion diagnostic. An Error leaves the declaration untouched and exits the CLI
// non-zero; a Warning notes a normalization.
type Severity int

const (
	SeverityError   Severity = 1
	SeverityWarning Severity = 2
)

// Diagnostic codes (CNV family), CLI-local: they are not registered in the catalog or on the wire.
const (
	CodeUnsupportedKind    = "CNV001"
	CodeGenericDecl        = "CNV002"
	CodeConstStillUsed     = "CNV003"
	CodeOutsideSet         = "CNV004"
	CodeNameCollision      = "CNV005"
	CodeTemporalNotLoaded  = "CNV007"
	CodeUnresolvedTypeName = "CNV008"
	// CodeDrizzleUnsupported: a drizzle table using constructs with no type spelling (interpolated
	// sql, $type, non-literal args, out-of-file or backward references), see drizzle.go.
	CodeDrizzleUnsupported = "CNV009"
)

// Diagnostic is one per-declaration conversion finding.
type Diagnostic struct {
	Code     string   `json:"code"`
	Severity Severity `json:"severity"`
	File     string   `json:"file,omitempty"`
	Decl     string   `json:"decl,omitempty"`
	Message  string   `json:"message"`
}

// Options selects the conversion target for a run.
type Options struct {
	Target Target
}

// FileResult is the outcome of converting one file: Output is the full new source when Changed, and
// Diags carries the per-declaration findings either way.
type FileResult struct {
	Path    string       `json:"path"`
	Output  string       `json:"-"`
	Changed bool         `json:"changed"`
	Diags   []Diagnostic `json:"diags,omitempty"`
	// Converted names the declarations this file rewrote, so a run reports what it covered and not
	// only what it refused.
	Converted []string `json:"converted,omitempty"`
}

// ConvertFile converts every recognized declaration of one file to opts.Target. A declaration
// already in the target form stays byte-identical (idempotence) and one the converter cannot express
// is reported and left untouched. A nil set converts the file as a single-file set.
func ConvertFile(prog *program.Program, typeChecker *checker.Checker, cache *runtype.Cache, markerOpts marker.Options, absPath string, opts Options, set *Set) (*FileResult, error) {
	sourceFile := prog.SourceFile(absPath)
	if sourceFile == nil {
		return nil, fmt.Errorf("convert: source file not in program: %s", absPath)
	}
	if set == nil {
		singleSet, setErr := singleFileSet(prog, typeChecker, cache, markerOpts, absPath)
		if setErr != nil {
			return nil, setErr
		}
		set = singleSet
	}
	source := sourceFile.Text()
	result := &FileResult{Path: absPath, Output: source}

	decls := set.declsFor(sourceFile, absPath, typeChecker, markerOpts)
	imports := scanImports(sourceFile)
	inScope := inScopeNames(sourceFile)
	names := newNames(decls, imports, inScope)
	fileCtx := &fileContext{set: set, bindings: buildFileBindings(sourceFile, typeChecker), inScope: inScope, path: absPath}

	type plannedDecl struct {
		decl    *declaration
		printed *printedDecl
	}
	var planned []plannedDecl
	var drizzlePlans []drizzlePlan
	drizzleInfo := buildDrizzleFileInfo(decls, imports, names, baseTakenNames(imports, inScope), identifiersIn(sourceFile))
	for _, decl := range decls {
		if decl.Form == opts.Target {
			continue
		}
		// Drizzle tables convert through their own arm (drizzle.go) and never enter the generic
		// printers, the id oracle or the const-away fixpoint: the pair keeps the const alive in both
		// directions.
		if decl.Drizzle {
			printed, drizzleDiag := convertDrizzleDecl(prog, typeChecker, cache, source, decl, opts, names, drizzleInfo)
			if drizzleDiag != nil {
				drizzleDiag.File = absPath
				result.Diags = append(result.Diags, *drizzleDiag)
				continue
			}
			drizzlePlans = append(drizzlePlans, drizzlePlan{decl: decl, printed: printed})
			continue
		}
		if decl.Generic {
			// WARNING, not an error: a generic alias has no runtime shape to convert and its
			// INSTANTIATIONS convert wherever they are reflected, so one type-level helper would
			// otherwise fail a whole file.
			result.Diags = append(result.Diags, Diagnostic{Code: CodeGenericDecl, Severity: SeverityWarning, File: absPath, Decl: decl.Name,
				Message: fmt.Sprintf("generic declaration %q is left as written (an unbound type parameter has no runtime shape); its instantiations still convert", decl.Name)})
			continue
		}
		// One walk classifies the declaration's written type references into the silent-any refusal
		// that owns them: a Temporal-lib hit gets the lib-specific message, anything else CNV008,
		// rather than cement an unwritten `any` / `RT.any()` into the rewritten source.
		temporalDiags, unresolvedDiags := writtenTypeRefDiags(typeChecker, decl, absPath)
		if len(temporalDiags) > 0 {
			result.Diags = append(result.Diags, temporalDiags...)
			continue
		}
		if len(unresolvedDiags) > 0 {
			result.Diags = append(result.Diags, unresolvedDiags...)
			continue
		}
		if outsideDiags := outsideSetDiags(prog, typeChecker, markerOpts, decl, set, absPath); len(outsideDiags) > 0 {
			result.Diags = append(result.Diags, outsideDiags...)
			continue
		}
		resolved, resolveErr := resolveDecl(typeChecker, cache, decl)
		if resolveErr != nil {
			return nil, resolveErr
		}
		printed, printDiag := printDecl(resolved, opts, names, fileCtx)
		if printDiag != nil {
			printDiag.File = absPath
			result.Diags = append(result.Diags, *printDiag)
			continue
		}
		planned = append(planned, plannedDecl{decl: decl, printed: printed})
	}
	// Marker call sites (callsites.go) are planned BEFORE the const-away fixpoint so their spans join
	// keptSpans: rewriting `fn(namedRT)` into `fn<Named>()` removes a use of the const, which is what
	// lets the const convert away instead of refusing with CNV005.
	var plannedCalls []*callSite
	var callTexts []*printedDecl
	for _, site := range recognizeCallSites(sourceFile, typeChecker, cache, markerOpts, set, opts.Target) {
		if site.form == opts.Target {
			continue
		}
		printed, printDiag := printCallSite(site, opts, names, fileCtx, cache.NodeByID)
		if printDiag != nil {
			printDiag.File = absPath
			result.Diags = append(result.Diags, *printDiag)
			continue
		}
		plannedCalls = append(plannedCalls, site)
		callTexts = append(callTexts, printed)
	}

	// Const-away safety runs AFTER printing: converting to type-form removes the const binding, so
	// any reference the conversion will NOT rewrite has to keep it, and only the declarations that
	// PRINTED are rewritten. Dropping one const can re-expose uses inside its own kept span, hence
	// the fixpoint.
	if opts.Target == TargetType {
		for {
			var keptSpans [][2]int
			for _, site := range plannedCalls {
				keptSpans = append(keptSpans, [2]int{site.start, site.end})
			}
			for _, plan := range planned {
				keptSpans = append(keptSpans, [2]int{plan.decl.Stmt.Pos(), plan.decl.Stmt.End()})
				if plan.decl.AliasStmt != nil {
					keptSpans = append(keptSpans, [2]int{plan.decl.AliasStmt.Pos(), plan.decl.AliasStmt.End()})
				}
			}
			dropped := false
			kept := planned[:0]
			for _, plan := range planned {
				if plan.decl.Form != TargetType && constUsedBeyondConversions(set, plan.decl, absPath, opts.Target, keptSpans) {
					result.Diags = append(result.Diags, Diagnostic{Code: CodeConstStillUsed, Severity: SeverityError, File: absPath, Decl: plan.decl.ConstName,
						Message: fmt.Sprintf("const %q is referenced outside the converted declarations; converting it away would break those uses", plan.decl.ConstName)})
					dropped = true
					continue
				}
				kept = append(kept, plan)
			}
			planned = kept
			if !dropped {
				break
			}
		}
	}

	var replacements []replacement
	needs := importNeeds{}
	for index, site := range plannedCalls {
		needs.merge(callTexts[index].needs)
		replacements = append(replacements, replacement{start: site.start, end: site.end, text: callTexts[index].text})
	}
	// Drizzle pairs: the main statement span takes the whole pair text, and the paired half's
	// statement is removed in BOTH directions because the pair text re-emits it in canonical order.
	for _, plan := range drizzlePlans {
		needs.merge(plan.printed.needs)
		result.Converted = append(result.Converted, declLabel(plan.decl))
		start := tokenStart(source, plan.decl.Stmt.Pos())
		// The printers emit the pair flush left, so a table inside a block needs its continuation
		// lines re-indented to where the statement it replaces started.
		replacements = append(replacements, replacement{start: start, end: plan.decl.Stmt.End(), text: indentAfterFirstLine(plan.printed.text, lineIndentAt(source, start))})
		if plan.decl.AliasStmt != nil {
			aliasStart, aliasEnd := wholeLineSpan(source, plan.decl.AliasStmt)
			replacements = append(replacements, replacement{start: aliasStart, end: aliasEnd, text: ""})
		}
	}
	for _, plan := range planned {
		decl := plan.decl
		needs.merge(plan.printed.needs)
		result.Converted = append(result.Converted, declLabel(decl))
		replacements = append(replacements, replacement{start: tokenStart(source, decl.Stmt.Pos()), end: decl.Stmt.End(), text: plan.printed.text})
		// A const converted to type-form leaves its InferType alias self-referential, so it is
		// dropped; const → const conversions keep the alias as-is.
		if opts.Target == TargetType && decl.AliasStmt != nil {
			aliasStart, aliasEnd := wholeLineSpan(source, decl.AliasStmt)
			replacements = append(replacements, replacement{start: aliasStart, end: aliasEnd, text: ""})
		}
	}
	if len(replacements) == 0 {
		return result, nil
	}

	removable := fileCtx.bindings.removableLocals(set)
	// The dialect packages are a dependency, not part of the conversion SET, so their bindings are
	// marked here or a builders import would survive a file that no longer calls it.
	for local := range drizzleInfo.spellings.removableLocals() {
		removable[local] = true
	}
	importEdits := planImportEdits(sourceFile, source, imports, needs, names, replacements, removable)
	replacements = append(replacements, importEdits...)
	output, applyErr := applyReplacements(source, replacements)
	if applyErr != nil {
		return nil, fmt.Errorf("convert %s: %w", absPath, applyErr)
	}
	if output != source {
		result.Output = output
		result.Changed = true
	}
	return result, nil
}

// constUsedBeyondConversions reports whether the const is referenced anywhere the conversion will
// NOT rewrite, across the whole program, so an in-set sibling file's marker call site keeps the
// const too. For the CURRENT file the rewritten spans are the declarations that PRINTED; for OTHER
// in-set files the run optimistically counts their candidate declarations, each file applying the
// same check to itself. Use positions come from set.constUseIndex, built once per run, so the
// fixpoint only re-filters positions against spans.
func constUsedBeyondConversions(set *Set, decl *declaration, currentFile string, target Target, currentFileSpans [][2]int) bool {
	if decl.ConstName == "" {
		return false
	}
	constSymbol := set.checker.GetSymbolAtLocation(constNameNode(decl))
	if constSymbol == nil {
		return false
	}
	inSpans := func(pos int, spans [][2]int) bool {
		for _, span := range spans {
			if pos >= span[0] && pos < span[1] {
				return true
			}
		}
		return false
	}
	otherFileSpans := set.candidateSpansFor(target)
	for _, use := range set.constUseIndex()[constSymbol] {
		switch {
		case use.file == currentFile:
			if !inSpans(use.pos, currentFileSpans) {
				return true
			}
		case set.Files[use.file]:
			if !inSpans(use.pos, otherFileSpans[use.file]) {
				return true
			}
		default:
			return true
		}
	}
	return false
}

// DeclarationIDs returns every recognized non-generic declaration's structural id, keyed by type
// name when present, else const name. The id-preservation oracle's read side: conversion must never
// move any of these ids.
func DeclarationIDs(prog *program.Program, typeChecker *checker.Checker, cache *runtype.Cache, markerOpts marker.Options, absPath string) (map[string]string, error) {
	sourceFile := prog.SourceFile(absPath)
	if sourceFile == nil {
		return nil, fmt.Errorf("convert: source file not in program: %s", absPath)
	}
	ids := map[string]string{}
	for _, decl := range recognizeFile(sourceFile, typeChecker, markerOpts) {
		// A drizzle table's declared-type id MOVES with the authoring road by design (the invariant
		// is the MODEL ids, pinned by the JS lanes), so tables are exempt from this oracle.
		if decl.Generic || decl.Drizzle {
			continue
		}
		resolved, resolveErr := resolveDecl(typeChecker, cache, decl)
		if resolveErr != nil {
			return nil, resolveErr
		}
		ids[declLabel(decl)] = resolved.Node.ID
	}
	return ids, nil
}

// replacement is one span edit over the original source, in byte offsets.
type replacement struct {
	start int
	end   int
	text  string
}

// applyReplacements splices sorted, non-overlapping replacements into source.
func applyReplacements(source string, replacements []replacement) (string, error) {
	sorted := make([]replacement, len(replacements))
	copy(sorted, replacements)
	// A zero-width insertion sorts BEFORE a replacement starting at the same offset (an import block
	// prepended at a declaration's start), and the stable sort keeps equal edits in plan order.
	sort.SliceStable(sorted, func(a, b int) bool {
		if sorted[a].start != sorted[b].start {
			return sorted[a].start < sorted[b].start
		}
		return sorted[a].end < sorted[b].end
	})
	var out strings.Builder
	cursor := 0
	for _, rep := range sorted {
		if rep.start < cursor || rep.end < rep.start || rep.end > len(source) {
			return "", fmt.Errorf("overlapping or out-of-range edit [%d,%d)", rep.start, rep.end)
		}
		out.WriteString(source[cursor:rep.start])
		out.WriteString(rep.text)
		cursor = rep.end
	}
	out.WriteString(source[cursor:])
	return out.String(), nil
}

// tokenStart returns the byte offset of the first non-trivia character at or after pos, leaving
// leading JSDoc / comments outside the replaced span so they survive conversion.
func tokenStart(source string, pos int) int {
	return tsimports.TokenStart(source, pos)
}
