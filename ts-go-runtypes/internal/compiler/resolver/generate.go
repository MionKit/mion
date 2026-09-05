package resolver

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// typesSubdir is the child of the RunTypes output root that holds the
// generated cache modules (the gitignored half). The committed enrichment
// half lives under a sibling `enriched/` dir handled by the enrich path.
const typesSubdir = "types"

// moduleFileExt is the on-disk extension for a generated entry module. The
// module basename (the cache key, e.g. `val_Foo1234`, `fns/val`, `pf/rt/foo`)
// becomes <typesDir>/<basename>.js — slashed basenames nest into subdirs.
const moduleFileExt = ".js"

// outputDirAllowedMembers are the mion-owned top-level entries an output root
// may contain for us to treat it as ours: the generated `types/` half, the
// committed `enriched/` half, the self-documenting README, the VCS-hygiene
// markers, and the `rpc/` folder a mion CLIENT build writes the batch module
// into, in the SERVER project's `.mion/` (the same folder the default output
// root resolves to when the source root IS the project root). Their CONTENTS
// are never inspected — only the output root's own top level is checked.
var outputDirAllowedMembers = map[string]bool{
	typesSubdir:  true, // "types"
	"enriched":   true,
	"README.md":  true,
	".gitignore": true,
	".gitkeep":   true,
	"rpc":        true, // the batch module mion's client build writes for the server build
}

// pureFnReportFileName is the default basename of the pure-fn build report,
// written INSIDE the generated `types/` dir (alongside the pure-fn cache
// modules) when the report's file output is enabled and no explicit path was
// configured. Living under types/ means it inherits that dir's `.gitignore`
// (`*`) exactly like every generated cache module — regenerated each build,
// never committed. It is still pure DATA, not a module: pruneStaleModules only
// touches `*.js`, the manifest is built from the module set (never this file),
// and no `.json` basename is ever an rtmod:/ specifier — so it never enters the
// manifest nor gets GC'd. The output-dir guard only inspects the output root's
// top level (types/ CONTENTS are never checked), so a report file here needs no
// allow-list entry.
const pureFnReportFileName = "pure-fns-report.json"

// batchReportFileName is the request-batch twin of pureFnReportFileName: the
// whole-program `batch([...])` report, same lifecycle, same dir.
const batchReportFileName = "batches-report.json"

// outputDirSubdirs are the allowed members that must be real directories. A
// regular file named `types`/`enriched` is foreign: it would slip past the
// name-only allow-list and only fail later at MkdirAll with an opaque OS
// error, so the guard rejects it up front.
var outputDirSubdirs = map[string]bool{
	typesSubdir: true, // "types"
	"enriched":  true,
}

// systemNoiseEntries are OS / desktop-environment cruft (macOS Finder, Windows
// Explorer, KDE) that any "is this directory clean?" check must ignore — a stray
// one must never crash the build. These mirror the entries shared .gitignore
// files carry; the macOS AppleDouble `._<name>` siblings are matched by prefix.
var systemNoiseEntries = map[string]bool{
	".DS_Store":               true,
	".AppleDouble":            true,
	".LSOverride":             true,
	".Spotlight-V100":         true,
	".Trashes":                true,
	".fseventsd":              true,
	".DocumentRevisions-V100": true,
	".TemporaryItems":         true,
	"Thumbs.db":               true,
	"ehthumbs.db":             true,
	"desktop.ini":             true,
	".directory":              true,
}

// isIgnorableOutputEntry reports whether a top-level output-dir entry is a
// RunTypes-owned member or harmless OS noise, so it never trips the guard.
func isIgnorableOutputEntry(name string) bool {
	if outputDirAllowedMembers[name] || systemNoiseEntries[name] {
		return true
	}
	return strings.HasPrefix(name, "._") // macOS AppleDouble resource-fork sibling
}

// ensureOutDirAvailable refuses to generate into a directory that holds anything
// beyond the RunTypes output shape. The rule is a strict top-level check: a
// missing or empty dir, or one whose entries are only types/ / enriched/ (+ the
// VCS markers), is ours — adopt it (a previous run produces exactly that shape,
// so no per-run marker is needed). ANY extraneous file or folder means the
// configured (or inferred) outDir collides with a pre-existing directory we must
// not touch, so we abort. Files-mode has no virtual fallback, so this is a hard
// stop the caller surfaces and crashes on.
func ensureOutDirAvailable(outDir string) error {
	entries, err := os.ReadDir(outDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil // fresh dir — nothing to collide with
		}
		return fmt.Errorf("checking RunTypes output dir %s: %w", outDir, err)
	}
	for _, entry := range entries {
		name := entry.Name()
		if !isIgnorableOutputEntry(name) {
			return fmt.Errorf("refusing to generate RunTypes output into %s: it contains %q, which RunTypes did not generate. "+
				"This is a special RunTypes-managed output directory — it is owned by the build and is meant to hold ONLY RunTypes output: the regenerated `types/` cache modules (rebuilt every build, gitignored), the committed `enriched/` mirror, the README, the `rpc/` batch module a mion client build writes, plus VCS markers (.gitignore / .gitkeep) and harmless OS noise. "+
				"A foreign entry means `genDir` is pointed at a real, pre-existing directory that generating here would pollute (and prune files from). "+
				"Point the plugin's `genDir` (or the CLI) at a dedicated folder used only for RunTypes output; the default <srcDir>/%s is a dot-folder, so tsconfig `include` globs skip it and it never collides with a hand-authored source dir.",
				outDir, name, outputDirName)
		}
		// `types`/`enriched` count as ours only as directories; a regular file
		// by that name is foreign and would otherwise fail later at MkdirAll
		// with an opaque "not a directory" error.
		if outputDirSubdirs[name] && !entry.IsDir() {
			return fmt.Errorf("refusing to generate RunTypes output into %s: %q exists but is not a directory. "+
				"RunTypes manages `%s/` as a generated output subdirectory, so a plain file by that name means `genDir` points at a pre-existing directory. "+
				"Remove or rename the file, or point `genDir` at a dedicated folder used only for RunTypes output.",
				outDir, name, name)
		}
	}
	return nil
}

// generateToDisk materializes every entry-module source under
// <outDir>/types/, prunes generated files no longer in the set, and returns
// the sorted manifest of live basenames. It is the filesystem analogue of
// shipping Response.EntryModules over the wire.
func generateToDisk(outDir string, modules map[string]string) ([]string, error) {
	if err := ensureOutDirAvailable(outDir); err != nil {
		return nil, err
	}
	typesDir := filepath.Join(outDir, typesSubdir)
	if err := os.MkdirAll(typesDir, 0o755); err != nil {
		return nil, unwritableOutDirError(typesDir, err)
	}
	if err := EnsureOutputHygiene(outDir, typesDir); err != nil {
		return nil, err
	}
	// Rewrite the inter-module rtmod: imports baked into each module to
	// paths relative to that module, so the on-disk files resolve natively in
	// any bundler (the wire sources still use virtual specifiers).
	onDisk := make(map[string]string, len(modules))
	for basename, source := range modules {
		onDisk[basename] = relativizeModuleImports(basename, source)
	}
	if _, err := materializeModules(typesDir, onDisk); err != nil {
		return nil, unwritableOutDirError(typesDir, err)
	}
	if err := pruneStaleModules(typesDir, onDisk); err != nil {
		return nil, unwritableOutDirError(typesDir, err)
	}
	manifest := make([]string, 0, len(onDisk))
	for basename := range onDisk {
		manifest = append(manifest, basename)
	}
	sort.Strings(manifest)
	return manifest, nil
}

// EnsureOutputHygiene self-documents the output root on every generate lane
// (bundler plugin AND the --compile CLI, since both funnel through
// generateToDisk): each folder carries a README saying what it is, the
// regenerated types/ half is gitignored, and the committed enriched/ half
// exists. Write-if-absent so a watched file is never churned and a user's
// edit never clobbered.
func EnsureOutputHygiene(outDir, typesDir string) error {
	enrichedDir := filepath.Join(outDir, "enriched")
	if err := os.MkdirAll(enrichedDir, 0o755); err != nil {
		return unwritableOutDirError(enrichedDir, err)
	}
	writeIfAbsent := func(path, content string) error {
		if _, err := os.Stat(path); err == nil {
			return nil
		}
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			return unwritableOutDirError(path, err)
		}
		return nil
	}
	if err := writeIfAbsent(filepath.Join(outDir, "README.md"),
		"# RunTypes output\n"+
			"\n"+
			"This folder is managed by RunTypes (the `genDir` option, set in tsconfig\n"+
			"or on the bundler plugin). Everything under it follows convention:\n"+
			"\n"+
			"- `types/` — modules generated on every build. Not committed; do not edit.\n"+
			"- `enriched/` — committed enrichment files: `friendly/` (labels and\n"+
			"  messages), `mock/` (sample data), `i18n/<locale>/` (translations).\n"); err != nil {
		return err
	}
	if err := writeIfAbsent(filepath.Join(typesDir, ".gitignore"),
		"# Generated by RunTypes — do not edit or commit.\n*\n"); err != nil {
		return err
	}
	if err := writeIfAbsent(filepath.Join(typesDir, "README.md"),
		"# Generated modules\n"+
			"\n"+
			"Everything here is regenerated by RunTypes on every build.\n"+
			"Do not edit; nothing in this folder is committed (see .gitignore).\n"); err != nil {
		return err
	}
	return writeIfAbsent(filepath.Join(enrichedDir, "README.md"),
		"# Enrichment\n"+
			"\n"+
			"Reserved by RunTypes for build-time enrichment output.\n"+
			"Committed; safe to keep in version control.\n")
}

// unwritableOutDirError wraps a write failure in the output tree with an
// actionable message. Files-mode has NO virtual-module fallback — a writable
// project dir is required at build time — so a permission / read-only-FS
// failure here is fatal and the user needs to know exactly why and how to fix
// it (point `outDir` at a writable path, or build where the tree is writable).
func unwritableOutDirError(typesDir string, err error) error {
	lower := strings.ToLower(err.Error())
	if errors.Is(err, fs.ErrPermission) || strings.Contains(lower, "read-only") || strings.Contains(lower, "permission denied") {
		return fmt.Errorf("cannot write generated RunTypes modules under %s: %w — files-mode needs a writable output dir; set the plugin's `genDir` to a writable path or build where the project tree is writable", typesDir, err)
	}
	return fmt.Errorf("writing generated RunTypes modules under %s: %w", typesDir, err)
}

// pureFnReportPath is the HARDCODED location of the pure-fn report JSON:
// `<outDir>/types/pure-fns-report.json`, inside the generated cache dir so it
// follows the same gitignore + regenerate-every-build lifecycle as the pure-fn
// cache modules. Deliberately NOT configurable — like every location under the
// output root (types/, enriched/, …), the report path is convention, not a
// knob; only `genDir` itself (the root) is settable.
func pureFnReportPath(outDir string) string {
	return filepath.Join(outDir, typesSubdir, pureFnReportFileName)
}

// batchReportPath is the batch twin of pureFnReportPath:
// `<outDir>/types/batches-report.json`, equally hardcoded.
func batchReportPath(outDir string) string {
	return filepath.Join(outDir, typesSubdir, batchReportFileName)
}

// writeJSONReport marshals a build report (a slice of records; a nil slice is
// written as `[]`) to indented JSON at path, write-only-on-change (so a dev
// watcher isn't retriggered when the report is byte-identical). An empty report
// still writes `[]` so a stale file from a prior build never misleads a consumer
// into thinking nothing changed. Fatal on write error — files-mode has no
// fallback and a report the consumer's build depends on must not silently go
// missing. types/ already exists (generateToDisk created it before this runs),
// so no directory setup is needed. `label` names the report in errors.
func writeJSONReport[Record any](path, label string, report []Record) error {
	if report == nil {
		report = []Record{}
	}
	payload, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		return fmt.Errorf("encoding %s report: %w", label, err)
	}
	payload = append(payload, '\n')
	if existing, readErr := os.ReadFile(path); readErr == nil && string(existing) == string(payload) {
		return nil
	}
	if writeErr := os.WriteFile(path, payload, 0o644); writeErr != nil {
		return unwritableOutDirError(path, writeErr)
	}
	return nil
}

// workingDir is the resolver's configured cwd — the base every relative file
// path and outDir resolves against — falling back to the Program's current
// directory.
func (sess *Session) workingDir() string {
	if sess.opts.Cwd != "" {
		return sess.opts.Cwd
	}
	if sess.Program != nil && sess.Program.TS != nil {
		return sess.Program.TS.GetCurrentDirectory()
	}
	return ""
}

// absPath resolves p against the resolver's working dir when relative, so the
// generate/transform relative-path math (filepath.Rel) sees consistent bases
// regardless of whether the caller passed absolute or cwd-relative paths.
func (sess *Session) absPath(p string) string {
	if p == "" || filepath.IsAbs(p) {
		return p
	}
	return filepath.Join(sess.workingDir(), p)
}

// outputDirName is the project-folder name the files-mode output lands under
// when no explicit outDir is configured: <srcDir>/.mion/{types,enriched}.
// A dot-folder on purpose: tsconfig `include` globs skip dot-dirs, so neither
// the regenerated cache nor a fresh enrichment scaffold enters the user's
// program by accident (an authored mirror still does, through the import the
// user writes), it cannot collide with a hand-authored `runtypes/` source dir
// (the marker package itself ships one), and it is the same `.mion/` folder
// mion's Vite preset already uses for its mapper artifacts at the project root.
// The enrichment package carries the same default (enrichgen.DefaultGenDirName);
// the two must move together.
const outputDirName = ".mion"

// resolveOutDir resolves the session's absolute output root. Precedence: the
// spawn-time Options.GenDir override (the serve --gen-dir flag), else the
// tsconfig genDir, else the inferred <srcDir>/.mion — so a consumer that
// can't parse tsconfig (the dependency-free plugin) gets a sensible default it
// can adopt from the OpGenerate echo, and every op on one session (generate,
// transform, enrich) agrees on the same root by construction.
func (sess *Session) resolveOutDir() string {
	if sess.opts.GenDir != "" {
		return sess.absPath(sess.opts.GenDir)
	}
	if sess.opts.TsconfigGenDir != "" {
		return sess.absPath(sess.opts.TsconfigGenDir)
	}
	return filepath.Join(sess.inferSrcDir(), outputDirName)
}

// inferSrcDir picks the project's source root — the base for the default
// files-mode output dir. Preference order mirrors how a human reads a
// tsconfig: an explicit rootDir wins; else the common-ancestor directory of
// the program's own root files (the matched include set, node_modules
// excluded); else baseUrl; else the working dir.
func (sess *Session) inferSrcDir() string {
	cwd := sess.workingDir()
	if sess.Program == nil || sess.Program.TS == nil {
		return cwd
	}
	options := sess.Program.TS.Options()
	// rootDir wins only when it sits at or below the working dir. A rootDir
	// ABOVE cwd (e.g. tsconfig.test.json's `rootDir: "../.."`, set wide to
	// type-check sibling packages) is an emit-root signal, not a source-root
	// one — honoring it would drop the output tree outside the project. In
	// that case fall through to the common-ancestor of the actual files.
	if options != nil && options.RootDir != "" {
		if rootDir := sess.absPath(options.RootDir); isWithin(cwd, rootDir) {
			return rootDir
		}
	}
	if ancestor := commonDir(sess.projectRootFiles()); ancestor != "" {
		return ancestor
	}
	if options != nil && options.BaseUrl != "" {
		return sess.absPath(options.BaseUrl)
	}
	return cwd
}

// isWithin reports whether target is base itself or a descendant of it. Both
// are compared as forward-slash paths so the prefix test is separator-safe.
func isWithin(base, target string) bool {
	if base == "" {
		return false
	}
	base = strings.TrimSuffix(filepath.ToSlash(base), "/")
	target = strings.TrimSuffix(filepath.ToSlash(target), "/")
	return target == base || strings.HasPrefix(target, base+"/")
}

// projectRootFiles is the program's own root file set (the tsconfig-matched
// include list, or the inferred program's explicit file names), with
// node_modules-resolved entries dropped so a dependency .d.ts can't drag the
// common-ancestor up to a shared parent.
func (sess *Session) projectRootFiles() []string {
	if sess.Program == nil || sess.Program.TS == nil {
		return nil
	}
	commandLine := sess.Program.TS.CommandLine()
	if commandLine == nil {
		return nil
	}
	files := make([]string, 0)
	for _, name := range commandLine.FileNames() {
		if name == "" || strings.Contains(filepath.ToSlash(name), "/node_modules/") {
			continue
		}
		files = append(files, name)
	}
	return files
}

// commonDir returns the deepest directory that contains every path's parent
// directory, or "" when the paths share no meaningful common root (spread
// across the filesystem). Operates on forward-slash segments — tsgo paths are
// already normalized that way.
func commonDir(paths []string) string {
	var segmented [][]string
	for _, p := range paths {
		if p == "" {
			continue
		}
		dir := filepath.ToSlash(filepath.Dir(p))
		segmented = append(segmented, strings.Split(dir, "/"))
	}
	if len(segmented) == 0 {
		return ""
	}
	common := segmented[0]
	for _, segments := range segmented[1:] {
		limit := min(len(common), len(segments))
		matched := 0
		for matched < limit && common[matched] == segments[matched] {
			matched++
		}
		common = common[:matched]
	}
	// A lone leading "" means the paths only share the filesystem root — not a
	// useful source dir, so let the caller fall through to baseUrl/cwd.
	if len(common) <= 1 {
		return ""
	}
	return strings.Join(common, "/")
}

// materializeModules writes each entry-module source to
// typesDir/<basename>.js, creating parent dirs for slashed basenames. It is
// write-only-on-change: a file whose on-disk bytes already equal the new
// source is left untouched, so a dev file-watcher is not retriggered for
// content-addressed modules that did not change. Returns the basenames it
// actually (re)wrote, sorted.
func materializeModules(typesDir string, modules map[string]string) ([]string, error) {
	written := make([]string, 0)
	for basename, source := range modules {
		path := filepath.Join(typesDir, filepath.FromSlash(basename)+moduleFileExt)
		if existing, err := os.ReadFile(path); err == nil && string(existing) == source {
			continue
		}
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return nil, err
		}
		if err := os.WriteFile(path, []byte(source), 0o644); err != nil {
			return nil, err
		}
		written = append(written, basename)
	}
	sort.Strings(written)
	return written, nil
}

// pruneStaleModules deletes any *.js under typesDir whose basename is not in
// the live module set — the GC that keeps the generated tree equal to the
// current build's output when a type (and its call sites) goes away. A
// missing typesDir is a no-op.
func pruneStaleModules(typesDir string, live map[string]string) error {
	if _, err := os.Stat(typesDir); os.IsNotExist(err) {
		return nil
	}
	return filepath.WalkDir(typesDir, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || !strings.HasSuffix(path, moduleFileExt) {
			return nil
		}
		rel, relErr := filepath.Rel(typesDir, path)
		if relErr != nil {
			return relErr
		}
		basename := filepath.ToSlash(strings.TrimSuffix(rel, moduleFileExt))
		if _, ok := live[basename]; ok {
			return nil
		}
		return os.Remove(path)
	})
}
