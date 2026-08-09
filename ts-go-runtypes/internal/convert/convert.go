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

	"github.com/microsoft/typescript-go/shim/ast"
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
// registration rides the lint surfacing (see docs/done/format-conversion-*).
const (
	CodeUnsupportedKind = "CNV001"
	CodeGenericDecl     = "CNV002"
	CodeConstStillUsed  = "CNV003"
	CodeOutsideSet      = "CNV004"
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
// target form are left byte-identical (idempotence); declarations the
// converter cannot express are reported and left untouched. set is the
// run-wide conversion context; nil converts the file as a single-file set.
func ConvertFile(prog *program.Program, typeChecker *checker.Checker, cache *runtype.Cache, fs vfspkg.FS, absPath string, opts Options, set *Set) (*FileResult, error) {
	sourceFile := prog.SourceFile(absPath)
	if sourceFile == nil {
		return nil, fmt.Errorf("convert: source file not in program: %s", absPath)
	}
	if set == nil {
		singleSet, setErr := singleFileSet(prog, typeChecker, cache, fs, absPath)
		if setErr != nil {
			return nil, setErr
		}
		set = singleSet
	}
	source := sourceFile.Text()
	result := &FileResult{Path: absPath, Output: source}

	decls := recognizeFile(sourceFile, typeChecker, fs)
	imports := scanImports(sourceFile, source)
	names := newNames(decls, imports)
	fileCtx := &fileContext{set: set, bindings: buildFileBindings(sourceFile, typeChecker), inScope: inScopeNames(sourceFile), path: absPath}

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
		// Converting to type-form removes the const binding — any reference
		// the conversion itself will not rewrite (marker call sites, other
		// modules) must keep it.
		if opts.Target == TargetType && decl.Form != TargetType && constUsedBeyondConversions(prog, typeChecker, fs, set, decl, absPath) {
			result.Diags = append(result.Diags, Diagnostic{Code: CodeConstStillUsed, Severity: SeverityError, File: absPath, Decl: decl.ConstName,
				Message: fmt.Sprintf("const %q is referenced outside the converted declarations; converting it away would break those uses", decl.ConstName)})
			continue
		}
		if outsideDiags := outsideSetDiags(prog, typeChecker, fs, decl, set, absPath); len(outsideDiags) > 0 {
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
// referenced anywhere the conversion will NOT rewrite: outside its own
// declaration and outside every recognized convertible declaration of the
// in-set files — across the whole program, so an in-set sibling file's
// marker call site (`createValidateFn(userRT)`) keeps the const too.
func constUsedBeyondConversions(prog *program.Program, typeChecker *checker.Checker, fs vfspkg.FS, set *Set, decl *declaration, currentFile string) bool {
	if decl.ConstName == "" {
		return false
	}
	constSymbol := typeChecker.GetSymbolAtLocation(decl.NameNode)
	if constSymbol == nil {
		return false
	}
	for _, sourceFile := range prog.TS.SourceFiles() {
		path := sourceFile.FileName()
		if strings.Contains(path, "/node_modules/") {
			continue
		}
		// Spans the conversion rewrites in this file: recognized convertible
		// declarations of in-set files (their printed forms reference the
		// TYPE name, never the const).
		var rewritten []*declaration
		if path == currentFile || set.Files[path] {
			rewritten = recognizeFile(sourceFile, typeChecker, fs)
		}
		inRewritten := func(pos int) bool {
			for _, other := range rewritten {
				if other.Generic {
					continue
				}
				if pos >= other.Stmt.Pos() && pos < other.Stmt.End() {
					return true
				}
				if other.AliasStmt != nil && pos >= other.AliasStmt.Pos() && pos < other.AliasStmt.End() {
					return true
				}
			}
			return false
		}
		used := false
		var walk func(node *ast.Node) bool
		walk = func(node *ast.Node) bool {
			if node == nil || used {
				return used
			}
			if ast.IsIdentifier(node) && node.Text() == decl.ConstName && !inRewritten(node.Pos()) {
				if symbol := typeChecker.GetSymbolAtLocation(node); symbol != nil && checker.SkipAlias(symbol, typeChecker) == constSymbol {
					// Import specifiers re-binding the const don't count as
					// uses on their own; real uses resolve the same symbol at
					// their own position.
					if node.Parent == nil || !ast.IsImportSpecifier(node.Parent) {
						used = true
						return true
					}
				}
			}
			node.ForEachChild(walk)
			return used
		}
		sourceFile.AsNode().ForEachChild(walk)
		if used {
			return true
		}
	}
	return false
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
