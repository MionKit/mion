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

// InferredConfig is an opaque carrier for the FULL parsed CompilerOptions of a
// project tsconfig.json. It is parsed once per process and frozen; NewInferred
// adopts the options wholesale, so every Program built without a config file of
// its own (daemon setSources rebuilds, the inline one-shot, the enrich CLI)
// behaves exactly like the tsgo CLI under the same config — tsgo enforces every
// flag, RunTypes curates nothing.
//
// The parsed options are held privately because CompilerOptions.Paths is typed
// *collections.OrderedMap, whose package lives in typescript-go's internal/ tree
// with no shim — it cannot be named from this module. Callers pass the handle
// around; only NewInferred (same package) reads it. A nil handle means "no
// tsconfig anywhere", so Programs fall back to the fixed inferred defaults.
//
// fileNames is the config's include-resolved file list (`files` + `include` −
// `exclude`, absolute), the set tsc itself would root. Inferred lanes union it
// (or its declaration-file subset) into their roots so ambient declarations —
// a `.d.ts` in the include set that nothing imports — resolve exactly as they
// do in the build lane instead of silently degrading to `any`.
type InferredConfig struct {
	options   *core.CompilerOptions
	fileNames []string
}

// DiscoverTsconfig walks upward from cwd looking for a tsconfig.json,
// mirroring tsc's own discovery exactly (tsgo's findConfigFile over
// ForEachAncestorDirectory, vendored internal/execute/tsc.go — the shim does
// not export it, so the identical loop lives here): the nearest tsconfig.json
// in cwd or any ancestor directory wins. Returns "" when none exists — the
// caller's no-config posture applies. This is THE shared discovery: every lane
// (build, daemon, one-shot, enrich) resolves the config identically — explicit
// path, else this walk, else nothing — a lane never invents its own scheme.
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

// RootDir returns the parsed config's compilerOptions.rootDir ("" when unset),
// as tsgo resolved it (extends-aware). Consumers read TypeScript-owned values
// from the parse — never from a side JSONC read of the file.
func (inferredConfig *InferredConfig) RootDir() string {
	if inferredConfig == nil || inferredConfig.options == nil {
		return ""
	}
	return inferredConfig.options.RootDir
}

// FileNames returns the config's include-resolved file list (absolute paths),
// nil for a nil handle. One-shot lanes (convert, enrich) union the whole list
// into their roots; do not mutate the returned slice.
func (inferredConfig *InferredConfig) FileNames() []string {
	if inferredConfig == nil {
		return nil
	}
	return inferredConfig.fileNames
}

// DeclarationFileNames returns only the declaration-file (`.d.ts`/`.d.mts`/
// `.d.cts`) members of the config's file list. The daemon lanes root exactly
// this subset: declaration files are cheap to parse, carry precisely the
// ambient globals a narrow program loses, and are skipped by the whole-program
// scan (`scanAllProgramFiles`), so rooting them widens what the checker SEES
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

// UnionRoots appends the extra file names onto base, skipping entries already
// present (paths are compared as the normalized strings both the config parse
// and the callers produce). Returns base unchanged when extra adds nothing.
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

// ParseInferredConfig resolves tsconfigPath relative to cwd and parses it with
// tsgo's own config loader (follows `extends`), freezing the effective
// CompilerOptions for the process lifetime.
//
// Strict like tsc: a NAMED config that is missing or fails to parse returns an
// error carrying the first tsgo diagnostic. (nil, nil) only when tsconfigPath
// is empty — no config was named, and the caller falls back to the fixed
// inferred defaults (tsc's own loose-file posture).
//
// extraConditions (the enrich CLI passes "source") are folded in ONCE here: the
// parsed options are Clone()d and CustomConditions becomes the union. With no
// extras the parsed pointer is used as-is — zero mutation, shared safely across
// every sequential Program (tsgo's own LSP pattern). The options are never
// rebuilt field-by-field: that would drop ConfigFilePath, which roots @types
// discovery.
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
	// The inferred lanes take their roots from the caller, never from the
	// config's include set, so TS18003 "no inputs" is irrelevant here.
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

// noInputsFoundCode is tsc's TS18003 ("No inputs were found in config file") —
// the one config diagnostic that only concerns the config's OWN include set.
const noInputsFoundCode = 18003

// firstConfigContentError returns the first fatal config-CONTENT diagnostic of
// a parse, or nil. Syntax and option-validation errors ride the
// ParsedCommandLine (GetConfigFileParsingDiagnostics), NOT the second return of
// GetParsedCommandLineOfConfigFile, which only carries file-read failures —
// checking the second return alone silently accepts a malformed config.
// allowNoInputs skips TS18003 for callers that supply their own roots.
func firstConfigContentError(parsed *tsoptions.ParsedCommandLine, allowNoInputs bool) *ast.Diagnostic {
	for _, diagnostic := range parsed.GetConfigFileParsingDiagnostics() {
		if allowNoInputs && diagnostic.Code() == noInputsFoundCode {
			continue
		}
		return diagnostic
	}
	return nil
}
