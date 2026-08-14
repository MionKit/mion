// Package convert is the format-conversion leaf behind the `ts-runtypes
// convert` CLI verb: it rewrites the type declarations of a source file
// between the three authoring forms (type-first, value-first builders, JSON
// Schema) over the shared reflection RunType graph. All three input forms
// already normalize to that graph through the checker; this package adds the
// output half — one printer per target form — plus declaration recognition
// and the source edits, so conversion can never change a type's structural id
// (the id oracle in the convert fuzz lane pins that).
//
// Coverage spans the reflected type space — atoms, literals, formats,
// composites, enums/classes/natives, functions, template literals, brand
// metadata, circulars and multi-file reference sets (record:
// docs/done/format-conversion-completion.md). A declaration with no exact
// spelling reports a CNV diagnostic and stays untouched.
package convert

import (
	"fmt"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/cachegen/runtype"
	"github.com/mionkit/ts-runtypes/internal/compiler/marker"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
)

// Target names one of the three authoring forms a file can be converted to.
type Target string

const (
	TargetType       Target = "type"
	TargetBuilders   Target = "builders"
	TargetJSONSchema Target = "json-schema"
)

// ParseTarget maps the CLI --to value onto a Target.
func ParseTarget(raw string) (Target, error) {
	switch Target(raw) {
	case TargetType, TargetBuilders, TargetJSONSchema:
		return Target(raw), nil
	}
	return "", fmt.Errorf("unknown --to target %q (expected type | builders | json-schema)", raw)
}

// Severity of a conversion diagnostic. Errors leave the declaration
// untouched and make the CLI exit non-zero; Warnings note a normalization.
type Severity int

const (
	SeverityError   Severity = 1
	SeverityWarning Severity = 2
)

// Diagnostic codes (CNV family). CLI-local for now — catalog + wire
// registration rides the lint surfacing (see docs/done/format-conversion-*).
const (
	CodeUnsupportedKind    = "CNV001"
	CodeGenericDecl        = "CNV002"
	CodeConstStillUsed     = "CNV003"
	CodeOutsideSet         = "CNV004"
	CodeNameCollision      = "CNV005"
	CodePortableDialect    = "CNV006"
	CodeTemporalNotLoaded  = "CNV007"
	CodeUnresolvedTypeName = "CNV008"
)

// Diagnostic is one per-declaration conversion finding.
type Diagnostic struct {
	Code     string
	Severity Severity
	File     string
	Decl     string
	Message  string
}

// Options selects the conversion target for a run.
type Options struct {
	Target Target
	// Portable forbids the RunTypes schema dialect (jsType rows, embedType) on
	// the json-schema target: a declaration needing it becomes an Error.
	Portable bool
}

// FileResult is the outcome of converting one file. Output is the full new
// source when Changed; Diags carries the per-declaration findings either way.
type FileResult struct {
	Path    string
	Output  string
	Changed bool
	Diags   []Diagnostic
}

// ConvertFile converts every recognized declaration of one source file to
// opts.Target and returns the rewritten source. Declarations already in the
// target form are left byte-identical (idempotence); declarations the
// converter cannot express are reported and left untouched. set is the
// run-wide conversion context; nil converts the file as a single-file set.
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
	imports := scanImports(sourceFile, source)
	inScope := inScopeNames(sourceFile)
	names := newNames(decls, imports, inScope)
	fileCtx := &fileContext{set: set, bindings: buildFileBindings(sourceFile, typeChecker), inScope: inScope, path: absPath}

	type plannedDecl struct {
		decl    *declaration
		printed *printedDecl
	}
	var planned []plannedDecl
	for _, decl := range decls {
		if decl.Form == opts.Target {
			continue
		}
		if decl.Generic {
			// WARNING, not an error: a generic alias has no runtime shape to
			// convert, so there is nothing here to fail on — the same reason
			// recognizeFile skips classes and functions outright. Its
			// INSTANTIATIONS convert wherever they are reflected. Reporting it
			// as an error made one type-level helper (`type Thunk<T> = () => T`)
			// fail an entire file, which is how the suites' own harness files
			// stopped converting.
			result.Diags = append(result.Diags, Diagnostic{Code: CodeGenericDecl, Severity: SeverityWarning, File: absPath, Decl: decl.Name,
				Message: fmt.Sprintf("generic declaration %q is left as written (an unbound type parameter has no runtime shape); its instantiations still convert", decl.Name)})
			continue
		}
		if temporalDiags := temporalAnyDiags(typeChecker, decl, absPath); len(temporalDiags) > 0 {
			result.Diags = append(result.Diags, temporalDiags...)
			continue
		}
		// CNV008 — a written type name resolved to the checker's error type
		// (`any` never written): refuse the declaration rather than cement
		// `any` / `RT.any()` into the rewritten source.
		if unresolvedDiags := unresolvedNameDiags(typeChecker, decl, absPath); len(unresolvedDiags) > 0 {
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
	// Marker CALL SITES (callsites.go). Planned BEFORE the const-away fixpoint
	// so their spans join keptSpans: rewriting `fn(namedRT)` into `fn<Named>()`
	// removes a use of the const, which is exactly what lets the const convert
	// away instead of refusing with CNV005.
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

	// Const-away safety, AFTER printing: converting to type-form removes the
	// const binding, so every reference the conversion will NOT rewrite must
	// keep it — and only the declarations that actually PRINTED get rewritten
	// (a skipped or refused declaration keeps its original span, references
	// included). Dropping one const can re-expose uses inside its own kept
	// span, so filter to a fixpoint.
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
	for _, plan := range planned {
		decl := plan.decl
		needs.merge(plan.printed.needs)
		replacements = append(replacements, replacement{start: tokenStart(source, decl.Stmt.Pos()), end: decl.Stmt.End(), text: plan.printed.text})
		// Converting a const form to type-form replaces the const with a plain
		// `type Name = …;`, so its InferType alias (now self-referential noise)
		// is dropped; const → const conversions keep the existing alias as-is.
		if opts.Target == TargetType && decl.AliasStmt != nil {
			aliasStart := tokenStart(source, decl.AliasStmt.Pos())
			aliasEnd := decl.AliasStmt.End()
			if aliasEnd < len(source) && source[aliasEnd] == '\n' {
				aliasEnd++
			}
			replacements = append(replacements, replacement{start: aliasStart, end: aliasEnd, text: ""})
		}
	}
	if len(replacements) == 0 {
		return result, nil
	}

	importEdits := planImportEdits(sourceFile, source, imports, needs, names, replacements, fileCtx.bindings.removableLocals(set))
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

// constUsedBeyondConversions reports whether the const's identifier is
// referenced anywhere the conversion will NOT rewrite — across the whole
// program, so an in-set sibling file's marker call site
// (`createValidateFn(userRT)`) keeps the const too. For the CURRENT file the
// rewritten spans are exactly the declarations that PRINTED successfully
// (currentFileSpans); for OTHER in-set files the run optimistically counts
// their convertible candidate declarations (each file's own conversion
// applies the same safety check to itself). The use positions come from the
// set's program-wide index (set.constUseIndex — built once per run), so the
// fixpoint iterations only re-filter positions against spans.
func constUsedBeyondConversions(set *Set, decl *declaration, currentFile string, target Target, currentFileSpans [][2]int) bool {
	if decl.ConstName == "" {
		return false
	}
	constSymbol := set.checker.GetSymbolAtLocation(decl.NameNode)
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

// DeclarationIDs resolves every recognized (non-generic) declaration of a
// file and returns its structural id keyed by declaration name — the type
// name when present, else the const name. This is the id-preservation
// oracle's read side: conversion must never move any of these ids.
func DeclarationIDs(prog *program.Program, typeChecker *checker.Checker, cache *runtype.Cache, markerOpts marker.Options, absPath string) (map[string]string, error) {
	sourceFile := prog.SourceFile(absPath)
	if sourceFile == nil {
		return nil, fmt.Errorf("convert: source file not in program: %s", absPath)
	}
	ids := map[string]string{}
	for _, decl := range recognizeFile(sourceFile, typeChecker, markerOpts) {
		if decl.Generic {
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
	// Zero-width insertions sort BEFORE a replacement starting at the same
	// offset (an import block prepended at a declaration's exact start), and
	// the sort is stable so equal edits keep their plan order.
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

// tokenStart returns the byte offset of the first non-trivia character at or
// after pos — the declaration's real start, leaving leading JSDoc/comments
// outside the replaced span so they survive conversion.
func tokenStart(source string, pos int) int {
	offset := pos
	for offset < len(source) {
		switch {
		case source[offset] == ' ' || source[offset] == '\t' || source[offset] == '\n' || source[offset] == '\r':
			offset++
		case strings.HasPrefix(source[offset:], "//"):
			lineEnd := strings.IndexByte(source[offset:], '\n')
			if lineEnd < 0 {
				return len(source)
			}
			offset += lineEnd + 1
		case strings.HasPrefix(source[offset:], "/*"):
			blockEnd := strings.Index(source[offset+2:], "*/")
			if blockEnd < 0 {
				return len(source)
			}
			offset += 2 + blockEnd + 2
		default:
			return offset
		}
	}
	return offset
}
