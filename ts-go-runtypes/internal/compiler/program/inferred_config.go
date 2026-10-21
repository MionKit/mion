package program

import (
	"fmt"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/bundled"
	"github.com/microsoft/typescript-go/shim/compiler"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/tsoptions"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/microsoft/typescript-go/shim/vfs/cachedvfs"
	"github.com/microsoft/typescript-go/shim/vfs/osvfs"
)

// InferredConfig carries a project tsconfig's FULL parsed CompilerOptions, parsed once per process and
// frozen, so every Program built without a config of its own behaves like the tsgo CLI under that config.
// The options stay private because CompilerOptions.Paths is typed from typescript-go's internal/ tree and
// cannot be named here; a nil handle means no tsconfig anywhere. fileNames is the include-resolved file
// list inferred lanes union into their roots, so an ambient `.d.ts` nothing imports still resolves.
type InferredConfig struct {
	options   *core.CompilerOptions
	fileNames []string
}

// DiscoverTsconfig mirrors tsc's own discovery, the nearest tsconfig.json in cwd or an ancestor; the shim
// does not export tsgo's findConfigFile, so the identical loop lives here. It is THE shared discovery:
// every lane resolves the config as explicit path, else this walk, else nothing.
func DiscoverTsconfig(cwd string) string {
	if cwd == "" {
		return ""
	}
	fileSystem := bundled.WrapFS(cachedvfs.From(osvfs.FS()))
	directory := tspath.NormalizePath(cwd)
	for {
		candidate := tspath.CombinePaths(directory, "tsconfig.json")
		if fileSystem.FileExists(candidate) {
			return candidate
		}
		parent := tspath.GetDirectoryPath(directory)
		if parent == directory {
			return ""
		}
		directory = parent
	}
}

// RootDir is compilerOptions.rootDir as tsgo resolved it (extends-aware); TypeScript-owned values are read
// from the parse, never from a side JSONC read of the file.
func (inferredConfig *InferredConfig) RootDir() string {
	if inferredConfig == nil || inferredConfig.options == nil {
		return ""
	}
	return inferredConfig.options.RootDir
}

// FileNames is the config's include-resolved file list, absolute; do not mutate the returned slice.
func (inferredConfig *InferredConfig) FileNames() []string {
	if inferredConfig == nil {
		return nil
	}
	return inferredConfig.fileNames
}

// DeclarationFileNames is the subset the daemon lanes root: cheap to parse, carrying the ambient globals a
// narrow program loses, and skipped by `scanAllProgramFiles`, so rooting them widens what the checker SEES
// without widening what any op scans.
func (inferredConfig *InferredConfig) DeclarationFileNames() []string {
	if inferredConfig == nil {
		return nil
	}
	var declarationFiles []string
	for _, fileName := range inferredConfig.fileNames {
		if tspath.IsDeclarationFileName(fileName) {
			declarationFiles = append(declarationFiles, fileName)
		}
	}
	return declarationFiles
}

// UnionRoots appends extra onto base, skipping entries already there; paths compare as the normalized
// strings both the config parse and the callers produce.
func UnionRoots(base, extra []string) []string {
	if len(extra) == 0 {
		return base
	}
	seen := make(map[string]bool, len(base))
	for _, fileName := range base {
		seen[fileName] = true
	}
	for _, fileName := range extra {
		if !seen[fileName] {
			seen[fileName] = true
			base = append(base, fileName)
		}
	}
	return base
}

// ParseInferredConfig parses tsconfigPath with tsgo's own loader (following `extends`) and freezes the
// effective CompilerOptions for the process lifetime. Strict like tsc: a NAMED config that is missing or
// fails to parse is an error, and (nil, nil) comes back only for an empty tsconfigPath. extraConditions are
// folded in ONCE here, onto a Clone, so with no extras the parsed pointer is shared unmutated across every
// sequential Program. The options are never rebuilt field by field: that drops ConfigFilePath, which roots
// @types discovery.
func ParseInferredConfig(cwd, tsconfigPath string, extraConditions ...string) (*InferredConfig, error) {
	if tsconfigPath == "" {
		return nil, nil
	}
	if cwd == "" {
		return nil, fmt.Errorf("tsconfig %s: no cwd to resolve it against", tsconfigPath)
	}
	normalizedCwd := tspath.NormalizePath(cwd)
	configPath := tspath.ResolvePath(normalizedCwd, tsconfigPath)

	fileSystem := bundled.WrapFS(cachedvfs.From(osvfs.FS()))
	if !fileSystem.FileExists(configPath) {
		return nil, fmt.Errorf("tsconfig not found at %s", configPath)
	}

	host := compiler.NewCompilerHost(normalizedCwd, fileSystem, bundled.LibPath(), nil, nil)
	parsed, diagnostics := tsoptions.GetParsedCommandLineOfConfigFile(
		configPath, &core.CompilerOptions{}, nil, host, nil,
	)
	if len(diagnostics) > 0 {
		return nil, fmt.Errorf("tsconfig parse failed: %s", ast.Diagnostic_Localize(diagnostics[0], ast.DefaultLocale()))
	}
	if parsed == nil || parsed.ParsedConfig == nil || parsed.ParsedConfig.CompilerOptions == nil {
		return nil, fmt.Errorf("tsconfig %s: parse produced no compiler options", configPath)
	}
	// The inferred lanes take their roots from the caller, so TS18003 "no inputs" is irrelevant here.
	if contentDiagnostic := firstConfigContentError(parsed, true); contentDiagnostic != nil {
		return nil, fmt.Errorf("tsconfig parse failed: %s", ast.Diagnostic_Localize(contentDiagnostic, ast.DefaultLocale()))
	}

	options := parsed.ParsedConfig.CompilerOptions
	if len(extraConditions) > 0 {
		options = options.Clone()
		options.CustomConditions = mergeConditions(extraConditions, parsed.ParsedConfig.CompilerOptions.CustomConditions)
	}
	return &InferredConfig{options: options, fileNames: parsed.FileNames()}, nil
}

// noInputsFoundCode is tsc's TS18003, the one config diagnostic that only concerns its OWN include set.
const noInputsFoundCode = 18003

// firstConfigContentError returns a parse's first fatal config-CONTENT diagnostic. Syntax and
// option-validation errors ride the ParsedCommandLine, NOT the second return of
// GetParsedCommandLineOfConfigFile, which carries only file-read failures, so checking that return alone
// silently accepts a malformed config. allowNoInputs skips TS18003 for callers supplying their own roots.
func firstConfigContentError(parsed *tsoptions.ParsedCommandLine, allowNoInputs bool) *ast.Diagnostic {
	for _, diagnostic := range parsed.GetConfigFileParsingDiagnostics() {
		if allowNoInputs && diagnostic.Code() == noInputsFoundCode {
			continue
		}
		return diagnostic
	}
	return nil
}
