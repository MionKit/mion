package batchcompile

import (
	"context"
	"fmt"
	"sort"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/compiler"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/scanner"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/sourcerewrite"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// tsc erases a `private` member's type, so a consumer reads it as `any` (MKR016). Writing it `protected` keeps the type
// and its imports, keeps the class nominal, and stays unreadable from outside.

// emitDeclarationFiles emits the .d.ts with the value splices and every `private` turned `protected`.
// It returns each spliced file's map by absolute path, so a .d.ts.map points at the source as written.
func emitDeclarationFiles(cwd, tsconfigPath string, original *program.Program, valueSplices []protocol.Replacement, writeFile compiler.WriteFile) (map[string]*protocol.SourceMap, error) {
	splices := append(append([]protocol.Replacement(nil), valueSplices...), privateToProtectedSplices(original)...)
	// Keyed by absolute path: the splice sources may spell one file differently, and each overlay entry replaces the file.
	byFile := map[string][]protocol.Replacement{}
	for _, splice := range splices {
		abs := absOf(cwd, splice.File)
		byFile[abs] = append(byFile[abs], splice)
	}
	overlay := make(map[string]string, len(byFile))
	mapByAbs := make(map[string]*protocol.SourceMap, len(byFile))
	for abs, fileSplices := range byFile {
		sourceFile := original.SourceFile(abs)
		if sourceFile == nil {
			continue
		}
		text, sourceMap := sourcerewrite.Apply(abs, sourceFile.Text(), nil, fileSplices)
		overlay[abs] = text
		if sourceMap != nil {
			mapByAbs[abs] = sourceMap
		}
	}
	// Nothing to splice: the first program is the source as written, and it is already checked.
	declarations := original
	if len(overlay) > 0 {
		// isolatedDeclarations demands a written type on protected, not private: check the source, then emit without it.
		var overrides *core.CompilerOptions
		if original.TS.Options().IsolatedDeclarations.IsTrue() {
			if found := original.TS.GetDeclarationDiagnostics(context.Background(), nil); len(found) > 0 {
				return nil, emitSkipped("declaration emit", &compiler.EmitResult{EmitSkipped: true, Diagnostics: found}, cwd)
			}
			overrides = &core.CompilerOptions{IsolatedDeclarations: core.TSFalse}
		}
		var err error
		if declarations, err = program.New(program.Options{Cwd: cwd, TsconfigPath: tsconfigPath, Overlay: overlay, Overrides: overrides}); err != nil {
			return nil, fmt.Errorf("compile: declaration program: %w", err)
		}
	}
	result := declarations.TS.Emit(context.Background(), compiler.EmitOptions{EmitOnly: compiler.EmitOnlyDts, WriteFile: writeFile})
	return mapByAbs, emitSkippedAt("declaration emit", result, cwd, spliceLocator(cwd, original, byFile))
}

// spliceLocator maps a position in a spliced file back to the original, so an error points where the user wrote it.
func spliceLocator(cwd string, original *program.Program, byFile map[string][]protocol.Replacement) diagnosticLocator {
	return func(file *ast.SourceFile, pos int) (*ast.SourceFile, int) {
		abs := absOf(cwd, file.FileName())
		splices, sourceFile := byFile[abs], original.SourceFile(abs)
		if len(splices) == 0 || sourceFile == nil {
			return file, pos
		}
		sorted := append([]protocol.Replacement(nil), splices...)
		sort.Slice(sorted, func(i, j int) bool { return sorted[i].Start < sorted[j].Start })
		shift := 0
		for _, splice := range sorted {
			start := splice.Start + shift
			if pos < start {
				break
			}
			if pos < start+len(splice.Text) {
				return sourceFile, splice.Start
			}
			shift += len(splice.Text) - (splice.End - splice.Start)
		}
		return sourceFile, pos - shift
	}
}

// privateToProtectedSplices writes `protected` over each member's `private`; a `private constructor` stays, it erases nothing.
func privateToProtectedSplices(original *program.Program) []protocol.Replacement {
	var out []protocol.Replacement
	for _, sourceFile := range original.TS.SourceFiles() {
		if sourceFile == nil || sourceFile.IsDeclarationFile || original.TS.IsSourceFileFromExternalLibrary(sourceFile) {
			continue
		}
		eachClassMember(sourceFile, func(member *ast.Node) {
			if keyword := privateModifier(member); keyword != nil {
				start := scanner.GetTokenPosOfNode(keyword, sourceFile, false)
				out = append(out, protocol.Replacement{File: sourceFile.FileName(), Start: start, End: keyword.End(), Text: "protected"})
			}
		})
	}
	return out
}

// eachClassMember also visits constructor parameters, since a .d.ts writes a parameter property as a field.
func eachClassMember(sourceFile *ast.SourceFile, visit func(member *ast.Node)) {
	var walk func(node *ast.Node) bool
	walk = func(node *ast.Node) bool {
		if ast.IsClassLike(node) {
			for _, member := range node.Members() {
				switch member.Kind {
				case ast.KindPropertyDeclaration, ast.KindMethodDeclaration, ast.KindGetAccessor, ast.KindSetAccessor:
					visit(member)
				case ast.KindConstructor:
					for _, parameter := range member.Parameters() {
						visit(parameter)
					}
				}
			}
		}
		node.ForEachChild(walk)
		return false
	}
	sourceFile.AsNode().ForEachChild(walk)
}

func privateModifier(node *ast.Node) *ast.Node {
	for _, modifier := range node.ModifierNodes() {
		if modifier.Kind == ast.KindPrivateKeyword {
			return modifier
		}
	}
	return nil
}
