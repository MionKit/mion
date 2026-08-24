// Package program wraps the tsgolint shim-exposed typescript-go compiler in a
// minimal, reusable bootstrap. It creates a Program from a tsconfig.json (or
// from an inferred project for a set of loose files), binds the source files,
// and exposes the Program plus a checker pool for downstream type queries.
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
	// Overlay lets callers inject virtual file contents (absolute path → source)
	// on top of the on-disk VFS. Used by tests and by the in-memory daemon path.
	Overlay map[string]string
	// Conditions are extra package.json export/import resolution conditions
	// (CustomConditions). The enrichment CLI passes ["source"] so `ts-runtypes`
	// resolves to its in-tree `src` — where the TypeFormat brands live — so a
	// `TF.String<{minLength}>` projects with its FormatAnnotation rather than as a
	// bare `string`. Consumed ONLY by the no-config fallback literal: when Config
	// is set, extras were already folded into it at parse time (pass the same
	// extras to ParseInferredConfig). Empty leaves resolution unchanged. NewInferred only.
	Conditions []string
	// Config carries the project tsconfig's frozen, fully parsed CompilerOptions
	// for NewInferred to adopt WHOLESALE, so daemon/enrich Programs behave exactly
	// like the build lane under the same config. Produced by ParseInferredConfig;
	// nil (the default) means no config anywhere — the fixed inferred defaults
	// apply (tsc's loose-file posture). NewInferred only.
	Config *InferredConfig
}

type Program struct {
	TS *compiler.Program
	FS vfs.FS
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

	// Callers resolve the config FIRST (explicit --tsconfig, else
	// DiscoverTsconfig's tsc-style upward walk) — New never invents a default,
	// so every lane shares one resolution seam.
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
	// Content errors (malformed JSON, invalid option values) ride the parsed
	// result, not the second return — without this check a garbage tsconfig
	// silently built a default-options Program. Strict like tsc, TS18003
	// included: this lane consumes the config's own file list.
	if contentDiagnostic := firstConfigContentError(parsedConfig, false); contentDiagnostic != nil {
		return nil, fmt.Errorf("tsconfig parse failed: %s", ast.Diagnostic_Localize(contentDiagnostic, ast.DefaultLocale()))
	}

	// Project references are a build-orchestration concept (tsc --build); the
	// resolver's job is scanning the SOURCES the bundler will execute, and
	// bundlers (vite/esbuild/rollup) never honor reference redirects. Honoring
	// them here redirected imports that land in a referenced project to that
	// project's declaration OUTPUTS — which typically don't exist in a dev
	// loop — silently resolving every marker to nothing and yielding a
	// zero-site scan with no diagnostics (docs/done/
	// project-references-unbuilt-outputs-silent-zero-sites.md, found by the
	// mion migration). Dropping them keeps normal module resolution (paths,
	// node_modules, custom conditions) pointed at real sources.
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
	return &Program{TS: tsProgram, FS: fileSystem}, nil
}

// NewInferred builds a Program from explicit file roots instead of a config
// file's include set (a daemon serving overlay buffers, the enrich CLI). The
// project tsconfig still governs it: opts.Config carries the frozen parsed
// options, adopted wholesale; only with no config anywhere do the fixed
// inferred defaults apply.
func NewInferred(opts Options, fileNames []string) (*Program, error) {
	cwd := tspath.NormalizePath(opts.Cwd)

	baseFS := bundled.WrapFS(cachedvfs.From(osvfs.FS()))
	var fileSystem vfs.FS = baseFS
	if len(opts.Overlay) > 0 {
		fileSystem = newOverlayFS(baseFS, opts.Overlay)
	}

	host := compiler.NewCompilerHost(cwd, fileSystem, bundled.LibPath(), nil, nil)

	// One tsconfig, one behavior: with a parsed project config, adopt its frozen
	// CompilerOptions WHOLESALE — zero curation, tsgo enforces every flag — so a
	// daemon rebuild, the inline one-shot, and the enrich CLI type-check exactly
	// like the build lane (and the tsgo CLI) under the same config. The pointer is
	// shared across sequential Programs (tsgo's own LSP pattern; nothing mutates
	// CompilerOptions after parse). The hardcoded bundler-style literal below is
	// ONLY the no-config fallback — tsc's loose-file posture — for the WASM
	// playground, bare test spawns, and gen-builtin-purefns.
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
		// NewParsedCommandLine (vs a hand-built struct literal) also populates the
		// wrapper's comparePathsOptions; ProjectReferences stays nil by
		// construction — the roots are exactly the caller-supplied fileNames,
		// never the tsconfig's own include set.
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
	return &Program{TS: tsProgram, FS: fileSystem}, nil
}

// mergeConditions unions extra onto base, order-preserving and deduped, so
// ParseInferredConfig's extraConditions and a tsconfig's customConditions
// coexist on the cloned effective options.
func mergeConditions(base, extra []string) []string {
	out := append([]string(nil), base...)
	for _, condition := range extra {
		if !slices.Contains(out, condition) {
			out = append(out, condition)
		}
	}
	return out
}

// SourceFile returns the parsed source file for the given absolute path, or nil
// if the file is not part of the program.
func (program *Program) SourceFile(absPath string) *ast.SourceFile {
	return program.TS.GetSourceFile(absPath)
}

// IsIncremental reports whether the loaded project enables TypeScript's
// incremental or composite compilation — tsc's own switch for persisting build
// state between runs. The RT disk cache follows it: on when the project is
// incremental/composite, off otherwise. The value comes from the fully parsed
// config, so an `incremental`/`composite` inherited through `extends` counts.
// Nil-safe (returns false when there is no program, e.g. the inline-server
// path before its first setSources).
func (program *Program) IsIncremental() bool {
	if program == nil || program.TS == nil {
		return false
	}
	options := program.TS.Options()
	return options != nil && options.IsIncremental()
}
