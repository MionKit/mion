package batchcompile

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/compiler"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

// typeScriptTreeDirs resolves emitMode ts's outDir and the root it mirrors, refusing before anything is generated.
func typeScriptTreeDirs(p1 *program.Program, cwd string) (outDir, srcDir string, err error) {
	options := p1.TS.Options()
	if options.OutDir == "" {
		return "", "", fmt.Errorf("compile: emitMode ts writes the rewritten TypeScript to the tsconfig outDir, and none is set")
	}
	outDir = tspath.ResolvePath(cwd, options.OutDir)
	var fileNames []string
	if commandLine := p1.TS.CommandLine(); commandLine != nil {
		fileNames = commandLine.FileNames()
	}
	srcDir = program.InferSrcDir(cwd, options.RootDir, options.BaseUrl, fileNames)
	if filepath.Clean(outDir) == filepath.Clean(srcDir) {
		return "", "", fmt.Errorf("compile: emitMode ts writes TypeScript to the tsconfig outDir, and %s is the source root itself: "+
			"the rewritten sources would overwrite yours", outDir)
	}
	return outDir, srcDir, nil
}

// writeTypeScriptTree lands the rewritten sources on disk as TypeScript: a TS-to-native compiler has no plugin hook.
func writeTypeScriptTree(result *Result, p1 *program.Program, cwd, genDir, outDir, srcDir string, rewrittenByAbs map[string]string,
	mode constants.EmitMode, pureFnArtifact map[string]string) (*Result, error) {
	written := make([]string, 0)
	for _, sourceFile := range p1.TS.SourceFiles() {
		if sourceFile == nil || !isProjectSource(p1.TS, sourceFile, genDir) {
			continue
		}
		abs := absOf(cwd, sourceFile.FileName())
		rel, err := filepath.Rel(srcDir, abs)
		outside := err != nil || strings.HasPrefix(rel, "..")
		if outside && sourceFile.IsDeclarationFile {
			// A declaration the program reads from elsewhere (a sibling package's types) emits nothing in the JS lane either.
			continue
		}
		if outside {
			result.Diagnostics = append(result.Diagnostics, diagnostics.New(diagnostics.CodeEmitOutsideRootDir,
				diagnostics.Site{FilePath: abs}, filepath.Join(outDir, filepath.Base(abs)), outDir))
			continue
		}
		outPath := filepath.Join(outDir, rel)
		text, rewritten := rewrittenByAbs[abs]
		if !rewritten {
			text = sourceFile.Text()
		}
		text = resolver.RelativizeUserImports(outPath, genDir, text, mode)
		if err := os.MkdirAll(filepath.Dir(outPath), 0o755); err != nil {
			return nil, fmt.Errorf("compile: mkdir %s: %w", outPath, err)
		}
		if err := os.WriteFile(outPath, []byte(text), 0o644); err != nil {
			return nil, fmt.Errorf("compile: write %s: %w", outPath, err)
		}
		written = append(written, outPath)
	}
	sort.Strings(written)
	result.EmittedFiles = written
	if err := resolver.SyncArtifactDir(filepath.Join(outDir, constants.PureFnArtifactDir), pureFnArtifact); err != nil {
		return nil, fmt.Errorf("compile: %w", err)
	}
	return result, nil
}

// isProjectSource reports a file the project authored: not a lib or installed package, not the generated tree.
func isProjectSource(tsProgram *compiler.Program, sourceFile *ast.SourceFile, genDir string) bool {
	if tsProgram.IsSourceFileDefaultLibrary(sourceFile.Path()) || tsProgram.IsSourceFileFromExternalLibrary(sourceFile) {
		return false
	}
	return !isWithinDir(genDir, sourceFile.FileName())
}
