// Package batchcompile is the tsc-style compile CLI, no bundler and no IPC: it applies the mion call-site
// rewrite, runs tsgo's Emit for real JavaScript, and composes the two source maps so breakpoints land on the
// ORIGINAL TypeScript. Emit has no custom-transformer hook, hence two passes: pass 1 scans the tsconfig
// program, transforms it keeping the `rtmod:/…` specifiers (map A: rewritten → original) and generates the
// cache modules; pass 2 builds a second program with those sources OVERLAID at the same paths (so the real
// tsconfig options still apply), emits it, relativizes the specifiers and composes map B (js → rewritten)
// with map A.
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
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/sourcerewrite"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// emitCapture collects the files tsgo emits. Emit runs its per-file work in a PARALLEL group, so the map
// MUST be guarded: an unsynchronized write is a fatal "concurrent map writes" crash of the whole compile.
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

// Options configures a compile run; GenDir is where the cache modules land (the emitted .js import them by
// a relative path) and ResolverOpts carries the compiler knobs exactly as the plugin / CLI merge them.
type Options struct {
	Cwd          string
	TsconfigPath string
	GenDir       string
	ResolverOpts resolver.Options
	// NoEmit stops after the pass-1 scan and returns its diagnostics; nothing is written. Mirrors tsc --noEmit.
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
	// The output root is session config, so set it BEFORE resolver.New: OpGenerate's resolveOutDir must land on
	// the dir the emit step uses. TransformRelative stays false so pass 1 keeps the virtual rtmod: specifiers.
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

	// The unique files of a whole-program dump are exactly those that need the overlay.
	dump := r1.Dispatch(protocol.Request{Op: protocol.OpDump})
	if dump.Error != "" {
		return nil, fmt.Errorf("compile: dump: %s", dump.Error)
	}
	result.Diagnostics = append(result.Diagnostics, dump.Diagnostics...)

	// The OpDump above already ran the full scan and its diagnostics in memory, so nothing more is needed.
	if opts.NoEmit {
		return result, nil
	}

	// Generate BEFORE the transform: generate's SiteFiles is the COMPLETE rewrite set where the dump lists
	// marker sites alone, so a file whose only rewrite is a batch id would otherwise be emitted untouched.
	gen := r1.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if gen.Error != "" {
		return nil, fmt.Errorf("compile: generate: %s", gen.Error)
	}
	result.Caches = gen.Generated
	result.Diagnostics = append(result.Diagnostics, gen.Diagnostics...)
	if gen.OutDir != "" {
		genDir = gen.OutDir
	}

	markerFiles := uniqueFiles(dump.Sites, dump.Replacements)
	markerFiles = unionFiles(markerFiles, gen.SiteFiles)

	rewrittenByAbs := make(map[string]string, len(markerFiles))
	mapAByAbs := make(map[string]*protocol.SourceMap, len(markerFiles))
	if len(markerFiles) > 0 {
		// TransformRelative is off, so the rtmod: specifiers survive; the EMITTED .js is relativized later,
		// against its output location rather than the source.
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

	// ── Pass 2: overlaid program, emit, relativize + compose ──────────────────
	p2, err := program.New(program.Options{Cwd: cwd, TsconfigPath: opts.TsconfigPath, Overlay: rewrittenByAbs})
	if err != nil {
		return nil, fmt.Errorf("compile: overlay program: %w", err)
	}

	// tsgo calls WriteFile INSTEAD of writing to disk, so the bytes are transformed before we write them.
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

	// A new map, so nothing is mutated while ranging.
	final := make(map[string]string, len(capture.files))
	for outPath, text := range capture.files {
		switch {
		case strings.HasSuffix(outPath, ".js.map"):
			final[outPath] = composeEmittedMap(text, outPath, mapAByAbs)
		case strings.HasSuffix(outPath, ".js"):
			// The rtmod: specifiers survived emit unresolved. Same-line string edits on the import block,
			// which maps to nothing, so the composed map stays valid.
			final[outPath] = resolver.RelativizeUserImports(outPath, genDir, text)
		default:
			final[outPath] = text
		}
	}

	// Inside outDir only. A program can reach files outside its rootDir, and tsgo puts their emit beside their
	// own sources, littering another project with .js files. tsc refuses such a program (TS6059) and so does
	// this lane: an error per output and nothing written for it, never a warning, since the importer that IS
	// written would point at a file that never lands.
	outDir := ""
	if configured := p2.TS.Options().OutDir; configured != "" {
		outDir = tspath.ResolvePath(cwd, configured)
	}
	outsideOutDir := make([]string, 0)
	for outPath := range final {
		if outDir != "" && !isWithinDir(outDir, outPath) {
			outsideOutDir = append(outsideOutDir, outPath)
		}
	}
	sort.Strings(outsideOutDir)
	for _, outPath := range outsideOutDir {
		delete(final, outPath)
		result.Diagnostics = append(result.Diagnostics, diagnostics.New(diagnostics.CodeEmitOutsideRootDir, diagnostics.Site{FilePath: outPath}, outPath, outDir))
	}
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
	// Next to the emit, where `files: ["dist"]` publishes it.
	if outDir != "" {
		if err := resolver.SyncArtifactDir(filepath.Join(outDir, constants.PureFnArtifactDir), gen.PureFnArtifact); err != nil {
			return nil, fmt.Errorf("compile: %w", err)
		}
	}
	return result, nil
}

// isWithinDir reports whether target sits under dir, or is dir itself, on cleaned absolute paths.
func isWithinDir(dir, target string) bool {
	rel, err := filepath.Rel(filepath.Clean(dir), filepath.Clean(target))
	if err != nil {
		return false
	}
	return rel == "." || (rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)))
}

// composeEmittedMap composes map B (js → rewritten) with map A (rewritten → original) so the final map
// points at the user's source. An un-rewritten or uncorrelatable map is returned unchanged, being js →
// original already.
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
	// Map A carried the ABSOLUTE source path; tsc's convention is relative to the .map file, so it moves with
	// the output dir.
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

// resolveMapSource makes a `sources[0]` entry absolute and cleaned, the key the rewrite table uses.
func resolveMapSource(source, mapPath string) string {
	if filepath.IsAbs(source) {
		return filepath.Clean(source)
	}
	return filepath.Clean(filepath.Join(filepath.Dir(mapPath), filepath.FromSlash(source)))
}

// uniqueFiles collects the distinct source files sites and replacements touch: the ones needing the overlay.
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

// unionFiles merges two sorted-unique file lists into one, sorted.
func unionFiles(a, b []string) []string {
	seen := make(map[string]bool, len(a)+len(b))
	out := make([]string, 0, len(a)+len(b))
	for _, file := range append(append([]string(nil), a...), b...) {
		if file == "" || seen[file] {
			continue
		}
		seen[file] = true
		out = append(out, file)
	}
	sort.Strings(out)
	return out
}

// absOf resolves a possibly-relative file path against cwd.
func absOf(cwd, file string) string {
	if filepath.IsAbs(file) {
		return filepath.Clean(file)
	}
	return filepath.Clean(filepath.Join(cwd, file))
}
