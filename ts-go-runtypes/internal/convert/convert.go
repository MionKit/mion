// Package convert is the format-conversion leaf behind the `ts-runtypes
// convert` CLI verb: it rewrites the type declarations of a source file
// between the three authoring forms (type-first, value-first builders, JSON
// Schema) over the shared reflection RunType graph. All three input forms
// already normalize to that graph through the checker; this package adds the
// output half — one printer per target form — plus declaration recognition
// and the source edits, so conversion can never change a type's structural id
// (the id oracle in the convert fuzz lane pins that).
//
// Phase 1 scope (docs/todos/format-conversion-layer.md): atomic kinds and
// literals. Composite kinds, formats, circulars and natives are later phases;
// a declaration outside the supported set is reported (CNV001) and left
// untouched.
package convert

import (
	"fmt"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/checker"
	vfspkg "github.com/microsoft/typescript-go/shim/vfs"
	"github.com/mionkit/ts-runtypes/internal/cachegen/runtype"
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
// registration rides the completion todo with the lint surfacing.
const (
	CodeUnsupportedKind = "CNV001"
	CodeGenericDecl     = "CNV002"
	CodeConstStillUsed  = "CNV003"
	CodeNameCollision   = "CNV005"
	CodePortableDialect = "CNV006"
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
// target form are left byte-identical (idempotence); declarations the phase
// cannot express are reported and left untouched.
func ConvertFile(prog *program.Program, typeChecker *checker.Checker, cache *runtype.Cache, fs vfspkg.FS, absPath string, opts Options) (*FileResult, error) {
	sourceFile := prog.SourceFile(absPath)
	if sourceFile == nil {
		return nil, fmt.Errorf("convert: source file not in program: %s", absPath)
	}
	source := sourceFile.Text()
	result := &FileResult{Path: absPath, Output: source}

	decls := recognizeFile(sourceFile, typeChecker, fs)
	imports := scanImports(sourceFile, source)
	names := newNames(decls, imports)

	var replacements []replacement
	needs := importNeeds{}
	for _, decl := range decls {
		if decl.Form == opts.Target {
			continue
		}
		if decl.Generic {
			result.Diags = append(result.Diags, Diagnostic{Code: CodeGenericDecl, Severity: SeverityError, File: absPath, Decl: decl.Name,
				Message: fmt.Sprintf("generic declaration %q cannot be converted (no spelling for an unbound type parameter)", decl.Name)})
			continue
		}
		if decl.Form != TargetType && usedOutsideDecl(sourceFile, source, decl) {
			result.Diags = append(result.Diags, Diagnostic{Code: CodeConstStillUsed, Severity: SeverityError, File: absPath, Decl: decl.ConstName,
				Message: fmt.Sprintf("const %q is referenced outside its own declaration; converting it away would break those uses", decl.ConstName)})
			continue
		}
		resolved, resolveErr := resolveDecl(typeChecker, cache, decl)
		if resolveErr != nil {
			return nil, resolveErr
		}
		printed, printDiag := printDecl(resolved, opts, names)
		if printDiag != nil {
			printDiag.File = absPath
			result.Diags = append(result.Diags, *printDiag)
			continue
		}
		needs.merge(printed.needs)
		replacements = append(replacements, replacement{start: tokenStart(source, decl.Stmt.Pos()), end: decl.Stmt.End(), text: printed.text})
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

	importEdits := planImportEdits(sourceFile, source, imports, needs, names, replacements)
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

// DeclarationIDs resolves every recognized (non-generic) declaration of a
// file and returns its structural id keyed by declaration name — the type
// name when present, else the const name. This is the id-preservation
// oracle's read side: conversion must never move any of these ids.
func DeclarationIDs(prog *program.Program, typeChecker *checker.Checker, cache *runtype.Cache, fs vfspkg.FS, absPath string) (map[string]string, error) {
	sourceFile := prog.SourceFile(absPath)
	if sourceFile == nil {
		return nil, fmt.Errorf("convert: source file not in program: %s", absPath)
	}
	ids := map[string]string{}
	for _, decl := range recognizeFile(sourceFile, typeChecker, fs) {
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
	sort.Slice(sorted, func(a, b int) bool { return sorted[a].start < sorted[b].start })
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
