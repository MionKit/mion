// Package batchcompile is the tsc-style compile CLI: it reads a project's files,
// applies the mion call-site rewrite, runs tsgo's Emit to produce real
// JavaScript, composes the two source maps so breakpoints land on the ORIGINAL
// TypeScript, and writes the generated cache modules to disk. One command that
// behaves like a compile pass — no bundler, no IPC.
//
// Two passes over two Programs:
//
//  1. The ORIGINAL program (from tsconfig) is scanned for markers; OpTransform
//     with an empty OutDir yields, per marker file, the rewritten source (still
//     carrying `rtmod:/…` specifiers) and map A (rewritten → original).
//     OpGenerate writes the cache modules.
//  2. A SECOND program is built with the rewritten sources OVERLAID at the same
//     paths (so tsgo's real tsconfig compiler options — target/module/outDir/
//     sourceMap — still apply), then Emit()'d. Each emitted .js has its
//     `rtmod:/…` imports relativized to the cache dir, and each emitted
//     .js.map (map B: js → rewritten) is composed with map A into js → original.
//
// Emit has no custom-transformer hook, hence the two-pass + compose approach.
package batchcompile

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"github.com/microsoft/typescript-go/shim/compiler"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/sourcerewrite"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// emitCapture collects the files tsgo emits. Emit runs its per-file work in a
// PARALLEL work group, so WriteFile is invoked from several goroutines at once
// and the map MUST be guarded: an unsynchronized write here is not a benign
// race but a fatal "concurrent map writes" runtime error that kills the whole
// compile, which is how it surfaced (an intermittent `convert-cli` panic under
// full-suite load).
type emitCapture struct {
	mu    sync.Mutex
	files map[string]string
}

func newEmitCapture() *emitCapture {
	return &emitCapture{files: make(map[string]string)}
}

func (capture *emitCapture) add(fileName, text string) {
	capture.mu.Lock()
	defer capture.mu.Unlock()
	capture.files[fileName] = text
}

// Options configures a compile run. Cwd + TsconfigPath locate the project;
// GenDir is where the generated cache modules land (the emitted .js import
// them by a relative path). ResolverOpts carries the compiler knobs (emitMode,
// moduleMode, hashLength, …) exactly as the plugin/CLI merge them.
type Options struct {
	Cwd          string
	TsconfigPath string
	GenDir       string
	ResolverOpts resolver.Options
	// NoEmit runs a diagnostics-only pass (compile --no-emit): the Pass-1 OpDump
	// scan computes the RunType-family diagnostics in memory, then Run returns them
	// WITHOUT OpTransform / OpGenerate / Pass 2 — nothing is written. Mirrors tsc
	// --noEmit.
	NoEmit bool
}

// Result reports what a compile run produced.
type Result struct {
	EmittedFiles []string // absolute paths of the .js files written
	Caches       []string // generated cache-module basenames
	Diagnostics  []diagnostics.Diagnostic
}

// Run executes the compile. See the package doc for the two-pass model.
func Run(opts Options) (*Result, error) {
	cwd, err := filepath.Abs(opts.Cwd)
	if err != nil {
		return nil, fmt.Errorf("compile: abs(cwd): %w", err)
	}
	genDir := opts.GenDir
	if genDir == "" {
		genDir = filepath.Join(cwd, ".mion")
	}
	genDir, err = filepath.Abs(genDir)
	if err != nil {
		return nil, fmt.Errorf("compile: abs(genDir): %w", err)
	}

	// ── Pass 1: original program, scan, rewrite, generate caches ──────────────
	// The output root is session config now: set it BEFORE resolver.New so
	// OpGenerate's resolveOutDir lands on the same dir the emit step uses.
	// TransformRelative stays false — pass 1 keeps the virtual rtmod:
	// specifiers and the EMITTED .js is relativized later (see below).
	resolverOpts := opts.ResolverOpts
	resolverOpts.GenDir = genDir

	p1, err := program.New(program.Options{Cwd: cwd, TsconfigPath: opts.TsconfigPath})
	if err != nil {
		return nil, fmt.Errorf("compile: program: %w", err)
	}
	r1, err := resolver.New(p1, resolverOpts)
	if err != nil {
		return nil, fmt.Errorf("compile: resolver: %w", err)
	}
	defer r1.Close()

	result := &Result{}

	// Whole-program dump scans every file and returns one site per rewrite point;
	// the unique files are exactly those that need the overlay.
	dump := r1.Dispatch(protocol.Request{Op: protocol.OpDump})
	if dump.Error != "" {
		return nil, fmt.Errorf("compile: dump: %s", dump.Error)
	}
	result.Diagnostics = append(result.Diagnostics, dump.Diagnostics...)

	// compile --no-emit: the OpDump above already ran the full scan +
	// collectEntryModules + RunType-family diagnostics in memory. Return them and
	// skip OpTransform / OpGenerate / Pass 2 — nothing is written to disk.
	if opts.NoEmit {
		return result, nil
	}

	markerFiles := uniqueFiles(dump.Sites, dump.Replacements)

	rewrittenByAbs := make(map[string]string, len(markerFiles))
	mapAByAbs := make(map[string]*protocol.SourceMap, len(markerFiles))
	if len(markerFiles) > 0 {
		// TransformRelative is off for this session, so the rtmod: specifiers
		// survive — we relativize the EMITTED .js later, against its output
		// location, not the source.
		tr := r1.Dispatch(protocol.Request{Op: protocol.OpTransform, Files: markerFiles})
		if tr.Error != "" {
			return nil, fmt.Errorf("compile: transform: %s", tr.Error)
		}
		for file, res := range tr.Transformed {
			abs := absOf(cwd, file)
			if res.Code != "" {
				rewrittenByAbs[abs] = res.Code
			}
			if res.Map != nil {
				mapAByAbs[abs] = res.Map
			}
		}
	}

	// Generate the cache modules to <genDir>/types.
	gen := r1.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if gen.Error != "" {
		return nil, fmt.Errorf("compile: generate: %s", gen.Error)
	}
	result.Caches = gen.Generated
	result.Diagnostics = append(result.Diagnostics, gen.Diagnostics...)
	if gen.OutDir != "" {
		genDir = gen.OutDir
	}

	// ── Pass 2: overlaid program, emit, relativize + compose ──────────────────
	p2, err := program.New(program.Options{Cwd: cwd, TsconfigPath: opts.TsconfigPath, Overlay: rewrittenByAbs})
	if err != nil {
		return nil, fmt.Errorf("compile: overlay program: %w", err)
	}

	// Capture every emitted file; tsgo calls WriteFile INSTEAD of writing to
	// disk, so we transform the bytes before writing them ourselves.
	capture := newEmitCapture()
	emitResult := p2.TS.Emit(context.Background(), compiler.EmitOptions{
		WriteFile: func(fileName, text string, _ *compiler.WriteFileData) error {
			capture.add(fileName, text)
			return nil
		},
	})
	if emitResult != nil && emitResult.EmitSkipped {
		return nil, errors.New("compile: tsgo emit was skipped")
	}

	// Process outputs into a new map so we never mutate while ranging.
	final := make(map[string]string, len(capture.files))
	for outPath, text := range capture.files {
		switch {
		case strings.HasSuffix(outPath, ".js.map"):
			final[outPath] = composeEmittedMap(text, outPath, mapAByAbs)
		case strings.HasSuffix(outPath, ".js"):
			// The rtmod: specifiers survived emit unresolved; relativize them
			// against THIS output file's location to the cache dir. Same-line
			// string edits on the import block (which maps to nothing), so the
			// composed map stays valid.
			final[outPath] = resolver.RelativizeUserImports(outPath, genDir, text)
		default:
			final[outPath] = text
		}
	}

	// Write everything.
	for outPath, text := range final {
		if err := os.MkdirAll(filepath.Dir(outPath), 0o755); err != nil {
			return nil, fmt.Errorf("compile: mkdir %s: %w", outPath, err)
		}
		if err := os.WriteFile(outPath, []byte(text), 0o644); err != nil {
			return nil, fmt.Errorf("compile: write %s: %w", outPath, err)
		}
		if strings.HasSuffix(outPath, ".js") {
			result.EmittedFiles = append(result.EmittedFiles, outPath)
		}
	}
	sort.Strings(result.EmittedFiles)
	return result, nil
}

// composeEmittedMap composes an emitted .js.map (map B: js → rewritten) with the
// corresponding map A (rewritten → original) so the final map points at the
// user's original source. If the map's source file has no rewrite (a non-marker
// file), or can't be parsed/correlated, the emitted map is returned unchanged
// (it is already js → original for un-rewritten files).
func composeEmittedMap(text, mapPath string, mapAByAbs map[string]*protocol.SourceMap) string {
	var mapB protocol.SourceMap
	if err := json.Unmarshal([]byte(text), &mapB); err != nil || len(mapB.Sources) == 0 {
		return text
	}
	sourceAbs := resolveMapSource(mapB.Sources[0], mapPath)
	mapA := mapAByAbs[sourceAbs]
	if mapA == nil {
		return text // un-rewritten file: js → original already
	}
	composed := sourcerewrite.ComposeMaps(mapA, &mapB)
	// Map A carried the ABSOLUTE source path; tsc convention is a path relative
	// to the .map file (portable when the output dir moves). Match it.
	if len(composed.Sources) == 1 && filepath.IsAbs(composed.Sources[0]) {
		if rel, relErr := filepath.Rel(filepath.Dir(mapPath), composed.Sources[0]); relErr == nil {
			composed.Sources[0] = filepath.ToSlash(rel)
		}
	}
	encoded, err := json.Marshal(composed)
	if err != nil {
		return text
	}
	return string(encoded)
}

// resolveMapSource resolves a source-map `sources[0]` entry (relative to the map
// file's directory) to an absolute, cleaned path so it can be matched against
// the rewrite table (keyed by absolute source path).
func resolveMapSource(source, mapPath string) string {
	if filepath.IsAbs(source) {
		return filepath.Clean(source)
	}
	return filepath.Clean(filepath.Join(filepath.Dir(mapPath), filepath.FromSlash(source)))
}

// uniqueFiles collects the distinct source files touched by sites + pure-fn
// replacements, resolved to absolute paths (they need the overlay).
func uniqueFiles(sites []protocol.Site, replacements []protocol.Replacement) []string {
	seen := make(map[string]bool)
	var files []string
	add := func(file string) {
		if file == "" || seen[file] {
			return
		}
		seen[file] = true
		files = append(files, file)
	}
	for _, site := range sites {
		add(site.File)
	}
	for _, rep := range replacements {
		add(rep.File)
	}
	sort.Strings(files)
	return files
}

// absOf resolves a possibly-relative file path against cwd.
func absOf(cwd, file string) string {
	if filepath.IsAbs(file) {
		return filepath.Clean(file)
	}
	return filepath.Clean(filepath.Join(cwd, file))
}
