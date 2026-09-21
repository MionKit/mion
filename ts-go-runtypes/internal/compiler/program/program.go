// Package program wraps the tsgolint shim-exposed typescript-go compiler: it builds a Program from a
// tsconfig.json (or an inferred project for loose files), binds the source files, and exposes the Program
// plus a checker pool for downstream type queries.
package program

import (
	"errors"
	"fmt"
	"slices"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/bundled"
	"github.com/microsoft/typescript-go/shim/compiler"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/tsoptions"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/microsoft/typescript-go/shim/vfs"
	"github.com/microsoft/typescript-go/shim/vfs/cachedvfs"
	"github.com/microsoft/typescript-go/shim/vfs/osvfs"
)

type Options struct {
	Cwd            string
	TsconfigPath   string
	SingleThreaded bool
	// Overlay injects virtual file contents (absolute path → source) on top of the on-disk VFS.
	Overlay map[string]string
	// Conditions are extra package.json resolution conditions; the enrichment CLI passes ["source"] so `mion`
	// resolves to its in-tree `src`, where the TypeFormat brands live. Consumed ONLY by the no-config fallback
	// literal: with Config set, extras were folded in at parse time (pass the same to ParseInferredConfig).
	Conditions []string
	// Config carries the project tsconfig's frozen CompilerOptions for NewInferred to adopt WHOLESALE, so
	// daemon / enrich Programs behave like the build lane. nil means no config anywhere, and the fixed
	// inferred defaults (tsc's loose-file posture) apply. NewInferred only.
	Config *InferredConfig
	// FS replaces the on-disk VFS plus Overlay: a side program built next to an existing one must see the
	// same overlay, so it borrows that program's FS. NewInferred only.
	FS vfs.FS
}

type Program struct {
	TS *compiler.Program
	FS vfs.FS
	// Cwd is what a path is reported relative to when a file belongs to no named package, so nothing
	// machine-specific reaches an id or a module name.
	Cwd string
	// Overlay is kept so a SECOND program built off this one sees the same in-memory files, not just disk.
	Overlay map[string]string
}

// New builds a ts-go Program using the supplied tsconfig.
func New(opts Options) (*Program, error) {
	if opts.Cwd == "" {
		return nil, errors.New("program.New: Cwd is required")
	}
	cwd := tspath.NormalizePath(opts.Cwd)

	baseFS := bundled.WrapFS(cachedvfs.From(osvfs.FS()))
	var fileSystem vfs.FS = baseFS
	if len(opts.Overlay) > 0 {
		fileSystem = newOverlayFS(baseFS, opts.Overlay)
	}

	// Callers resolve the config FIRST (explicit --tsconfig, else DiscoverTsconfig): New never invents a
	// default, so every lane shares one resolution seam.
	if opts.TsconfigPath == "" {
		return nil, errors.New("program.New: TsconfigPath is required — resolve it first (explicit flag, else DiscoverTsconfig)")
	}
	configPath := tspath.ResolvePath(cwd, opts.TsconfigPath)
	if !fileSystem.FileExists(configPath) {
		return nil, fmt.Errorf("tsconfig not found at %s", configPath)
	}

	host := compiler.NewCompilerHost(cwd, fileSystem, bundled.LibPath(), nil, nil)

	parsedConfig, diagnostics := tsoptions.GetParsedCommandLineOfConfigFile(
		configPath, &core.CompilerOptions{}, nil, host, nil,
	)
	if len(diagnostics) > 0 {
		return nil, fmt.Errorf("tsconfig parse failed: %s", ast.Diagnostic_Localize(diagnostics[0], ast.DefaultLocale()))
	}
	// Content errors ride the parsed result, not the second return; without this check a garbage tsconfig
	// silently built a default-options Program. Strict like tsc, TS18003 included.
	if contentDiagnostic := firstConfigContentError(parsedConfig, false); contentDiagnostic != nil {
		return nil, fmt.Errorf("tsconfig parse failed: %s", ast.Diagnostic_Localize(contentDiagnostic, ast.DefaultLocale()))
	}

	// Project references are a build-orchestration concept and bundlers never honor reference redirects.
	// Honoring them here redirected an import into a referenced project to that project's declaration OUTPUTS,
	// which a dev loop has not built, so every marker resolved to nothing and the scan found zero sites with no
	// diagnostic. Dropping them keeps normal module resolution pointed at real sources.
	if parsedConfig.ParsedConfig != nil {
		parsedConfig.ParsedConfig.ProjectReferences = nil
	}

	programOpts := compiler.ProgramOptions{
		Config:         parsedConfig,
		SingleThreaded: core.TSFalse,
		Host:           host,
	}
	if opts.SingleThreaded {
		programOpts.SingleThreaded = core.TSTrue
	}

	tsProgram := compiler.NewProgram(programOpts)
	if tsProgram == nil {
		return nil, errors.New("compiler.NewProgram returned nil")
	}
	tsProgram.BindSourceFiles()
	return &Program{TS: tsProgram, FS: fileSystem, Cwd: cwd, Overlay: opts.Overlay}, nil
}

// NewInferred builds a Program from explicit file roots instead of a config's include set. The project
// tsconfig still governs it through opts.Config; only with no config anywhere do the inferred defaults apply.
func NewInferred(opts Options, fileNames []string) (*Program, error) {
	cwd := tspath.NormalizePath(opts.Cwd)

	fileSystem := opts.FS
	if fileSystem == nil {
		baseFS := bundled.WrapFS(cachedvfs.From(osvfs.FS()))
		fileSystem = baseFS
		if len(opts.Overlay) > 0 {
			fileSystem = newOverlayFS(baseFS, opts.Overlay)
		}
	}

	host := compiler.NewCompilerHost(cwd, fileSystem, bundled.LibPath(), nil, nil)

	// One tsconfig, one behavior: adopt the parsed config's CompilerOptions WHOLESALE, zero curation, so a
	// daemon rebuild, the inline one-shot and the enrich CLI type-check like the build lane. The pointer is
	// shared across sequential Programs (tsgo's own LSP pattern; nothing mutates it after parse). The literal
	// below is ONLY the no-config fallback, for the WASM playground, bare test spawns and gen-builtin-purefns.
	var compilerOptions *core.CompilerOptions
	if cfg := opts.Config; cfg != nil && cfg.options != nil {
		compilerOptions = cfg.options
	} else {
		compilerOptions = &core.CompilerOptions{
			Module:                     core.ModuleKindESNext,
			ModuleResolution:           core.ModuleResolutionKindBundler,
			Target:                     core.ScriptTargetES2022,
			AllowImportingTsExtensions: core.TSTrue,
			StrictNullChecks:           core.TSTrue,
			StrictFunctionTypes:        core.TSTrue,
			ESModuleInterop:            core.TSTrue,
			AllowNonTsExtensions:       core.TSTrue,
			ResolveJsonModule:          core.TSTrue,
			CustomConditions:           opts.Conditions,
		}
	}

	programOpts := compiler.ProgramOptions{
		// NewParsedCommandLine, not a struct literal, also populates the wrapper's comparePathsOptions;
		// ProjectReferences stays nil by construction and the roots are exactly the caller's fileNames.
		Config: tsoptions.NewParsedCommandLine(compilerOptions, fileNames, tspath.ComparePathsOptions{
			UseCaseSensitiveFileNames: fileSystem.UseCaseSensitiveFileNames(),
			CurrentDirectory:          cwd,
		}),
		SingleThreaded: core.TSFalse,
		Host:           host,
	}
	if opts.SingleThreaded {
		programOpts.SingleThreaded = core.TSTrue
	}

	tsProgram := compiler.NewProgram(programOpts)
	if tsProgram == nil {
		return nil, errors.New("compiler.NewProgram returned nil")
	}
	tsProgram.BindSourceFiles()
	return &Program{TS: tsProgram, FS: fileSystem, Cwd: cwd, Overlay: opts.Overlay}, nil
}

// mergeConditions unions extra onto base, order-preserving and deduped, so ParseInferredConfig's
// extraConditions and a tsconfig's customConditions coexist on the cloned effective options.
func mergeConditions(base, extra []string) []string {
	out := append([]string(nil), base...)
	for _, condition := range extra {
		if !slices.Contains(out, condition) {
			out = append(out, condition)
		}
	}
	return out
}

// SourceFile returns the parsed source file for an absolute path, nil when it is not part of the program.
func (program *Program) SourceFile(absPath string) *ast.SourceFile {
	return program.TS.GetSourceFile(absPath)
}

// IsIncremental reports whether the project enables `incremental` / `composite`, the switch the RT disk
// cache follows. Read from the fully parsed config, so one inherited through `extends` counts. Nil-safe.
func (program *Program) IsIncremental() bool {
	if program == nil || program.TS == nil {
		return false
	}
	options := program.TS.Options()
	return options != nil && options.IsIncremental()
}
