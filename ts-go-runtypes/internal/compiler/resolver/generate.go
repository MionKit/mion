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

	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
)

// typesSubdir holds the generated cache modules, the gitignored half; the committed enrichment half is
// the sibling `enriched/` dir the enrich path handles.
const typesSubdir = "types"

// moduleFileExt turns a module basename (the cache key) into <typesDir>/<basename>.js; a slashed
// basename nests into subdirs.
const moduleFileExt = ".js"

// outputDirAllowedMembers are the mion-owned top-level entries an output root may contain for us to
// treat it as ours. Their CONTENTS are never inspected, only the output root's own top level.
var outputDirAllowedMembers = map[string]bool{
	typesSubdir:            true, // "types"
	"enriched":             true,
	"README.md":            true,
	".gitignore":           true,
	".gitkeep":             true,
	constants.RpcModuleDir: true, // "rpc": the batch table + its mapper modules
	constants.ApiModuleDir: true, // "api": what a bundleApi client build bundles (see apigen.go)
}

// pureFnReportFileName is the default basename of the pure-fn build report, written INSIDE the generated
// `types/` dir so it inherits that dir's `.gitignore` and is regenerated each build, never committed. It
// is still DATA, not a module: pruneStaleModules only touches `*.js`, the manifest is built from the
// module set, and no `.json` basename is ever an rtmod:/ specifier, so it is neither listed nor GC'd. The
// output-dir guard inspects only the output root's top level, so it needs no allow-list entry.
const pureFnReportFileName = "pure-fns-report.json"

// batchReportFileName is the request-batch twin of pureFnReportFileName: the
// whole-program `batch([...])` report, same lifecycle, same dir.
const batchReportFileName = "batches-report.json"

// outputDirSubdirs are the allowed members that must be real directories: a regular file by one of those
// names would slip past the name-only allow-list and fail later at MkdirAll with an opaque OS error.
var outputDirSubdirs = map[string]bool{
	typesSubdir: true, // "types"
	"enriched":  true,
}

// systemNoiseEntries are OS / desktop-environment cruft the "is this directory clean?" check must ignore:
// a stray one must never crash the build. The macOS AppleDouble `._<name>` siblings are matched by prefix.
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

// isIgnorableOutputEntry reports a RunTypes-owned member or harmless OS noise, which never trips the guard.
func isIgnorableOutputEntry(name string) bool {
	if outputDirAllowedMembers[name] || systemNoiseEntries[name] {
		return true
	}
	return strings.HasPrefix(name, "._") // macOS AppleDouble resource-fork sibling
}

// ensureOutDirAvailable refuses to generate into a directory holding anything beyond the RunTypes output
// shape. A previous run produces exactly that shape, so such a dir is adopted and no per-run marker is
// needed; ANY extraneous entry means the configured outDir collides with a pre-existing directory we must
// not touch. Files-mode has no virtual fallback, so this is a hard stop the caller crashes on.
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
		// `types`/`enriched` count as ours only as directories; a plain file by that name would otherwise
		// fail later at MkdirAll with an opaque "not a directory" error.
		if outputDirSubdirs[name] && !entry.IsDir() {
			return fmt.Errorf("refusing to generate RunTypes output into %s: %q exists but is not a directory. "+
				"RunTypes manages `%s/` as a generated output subdirectory, so a plain file by that name means `genDir` points at a pre-existing directory. "+
				"Remove or rename the file, or point `genDir` at a dedicated folder used only for RunTypes output.",
				outDir, name, name)
		}
	}
	return nil
}

// generateToDisk is the filesystem analogue of shipping Response.EntryModules over the wire: it writes
// every entry module under <outDir>/types/, prunes what left the set, and returns the sorted manifest.
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
	// The on-disk files must resolve natively in any bundler; the wire sources keep the virtual specifiers.
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

// EnsureOutputHygiene self-documents the output root on every generate lane, the bundler plugin and the
// --compile CLI alike: a README per folder, the regenerated types/ half gitignored, the committed
// enriched/ half present. Write-if-absent, so a watched file is never churned nor a user's edit clobbered.
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
	// npm pack honours a nested .gitignore unless a .npmignore sits beside it; a gen dir under dist/ must ship, its emit imports it.
	if err := writeIfAbsent(filepath.Join(typesDir, ".npmignore"),
		"# Generated by RunTypes. Empty on purpose: it keeps the .gitignore beside it from hiding these modules from npm pack.\n"); err != nil {
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

// unwritableOutDirError wraps a write failure with an actionable message: files-mode has NO
// virtual-module fallback, so a permission or read-only-FS failure here is fatal and the user has to be
// told how to fix it.
func unwritableOutDirError(typesDir string, err error) error {
	lower := strings.ToLower(err.Error())
	if errors.Is(err, fs.ErrPermission) || strings.Contains(lower, "read-only") || strings.Contains(lower, "permission denied") {
		return fmt.Errorf("cannot write generated RunTypes modules under %s: %w — files-mode needs a writable output dir; set the plugin's `genDir` to a writable path or build where the project tree is writable", typesDir, err)
	}
	return fmt.Errorf("writing generated RunTypes modules under %s: %w", typesDir, err)
}

// pureFnReportPath puts the report inside the generated cache dir, so it follows the same gitignore and
// regenerate-every-build lifecycle as the cache modules. Deliberately NOT configurable: like every
// location under the output root it is convention, and only `genDir` itself is settable.
func pureFnReportPath(outDir string) string {
	return filepath.Join(outDir, typesSubdir, pureFnReportFileName)
}

// SyncArtifactDir makes dir hold exactly files (paths inside dir to content), touching only changed bytes; an
// empty map removes dir, so a stale module never outlives its pure fn. Twin of unplugin's writePureFnArtifact,
// which the bundler adapters run post-bundle because generate runs at buildStart, before a bundler empties the dir.
func SyncArtifactDir(dir string, files map[string]string) error {
	if len(files) == 0 {
		if err := os.RemoveAll(dir); err != nil {
			return unwritableOutDirError(dir, err)
		}
		return nil
	}
	live := map[string]bool{}
	for rel, content := range files {
		path := filepath.Join(dir, filepath.FromSlash(rel))
		live[path] = true
		if existing, err := os.ReadFile(path); err == nil && string(existing) == content {
			continue
		}
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return unwritableOutDirError(path, err)
		}
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			return unwritableOutDirError(path, err)
		}
	}
	var subdirs []string
	err := filepath.WalkDir(dir, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			if path != dir {
				subdirs = append(subdirs, path)
			}
			return nil
		}
		if live[path] {
			return nil
		}
		return os.Remove(path)
	})
	if err != nil {
		return unwritableOutDirError(dir, err)
	}
	// Deepest first, so a directory emptied by its children's removal goes too.
	sort.Slice(subdirs, func(i, j int) bool { return len(subdirs[i]) > len(subdirs[j]) })
	for _, subdir := range subdirs {
		if entries, readErr := os.ReadDir(subdir); readErr == nil && len(entries) == 0 {
			if err := os.Remove(subdir); err != nil {
				return unwritableOutDirError(subdir, err)
			}
		}
	}
	return nil
}

// batchReportPath is the batch twin of pureFnReportPath:
// `<outDir>/types/batches-report.json`, equally hardcoded.
func batchReportPath(outDir string) string {
	return filepath.Join(outDir, typesSubdir, batchReportFileName)
}

// writeJSONReport writes a build report as indented JSON, only when the bytes changed, so a dev watcher
// is not retriggered. An empty report still writes `[]`, or a stale file from a prior build would mislead
// a consumer. Fatal on a write error: a report the consumer's build depends on must not silently go
// missing. types/ already exists, generateToDisk created it. `label` names the report in errors.
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

// workingDir is the base every relative file path and outDir resolves against, the Program's current
// directory when no cwd was configured.
func (sess *Session) workingDir() string {
	if sess.opts.Cwd != "" {
		return sess.opts.Cwd
	}
	if sess.Program != nil && sess.Program.TS != nil {
		return sess.Program.TS.GetCurrentDirectory()
	}
	return ""
}

// absPath resolves p against the working dir, so the generate/transform relative-path math sees
// consistent bases whether the caller passed absolute or cwd-relative paths.
func (sess *Session) absPath(p string) string {
	if p == "" || filepath.IsAbs(p) {
		return p
	}
	return filepath.Join(sess.workingDir(), p)
}

// outputDirName is where files-mode output lands with no explicit outDir: <srcDir>/.mion/. A dot-folder
// on purpose, since tsconfig `include` globs skip dot-dirs, so neither the regenerated cache nor a fresh
// enrichment scaffold enters the user's program by accident, and it cannot collide with a hand-authored
// `runtypes/` source dir. The enrichment package carries the same default (enrichgen.DefaultGenDirName);
// the two must move together.
const outputDirName = ".mion"

// resolveOutDir resolves the session's absolute output root, so a consumer that cannot parse tsconfig
// gets a default it can adopt from the OpGenerate echo and every op on one session agrees on the root.
func (sess *Session) resolveOutDir() string {
	if sess.opts.GenDir != "" {
		return sess.absPath(sess.opts.GenDir)
	}
	if sess.opts.TsconfigGenDir != "" {
		return sess.absPath(sess.opts.TsconfigGenDir)
	}
	return filepath.Join(sess.inferSrcDir(), outputDirName)
}

// inferSrcDir picks the project's source root, the base for the default output dir; the preference order
// mirrors how a human reads a tsconfig.
func (sess *Session) inferSrcDir() string {
	cwd := sess.workingDir()
	if sess.Program == nil || sess.Program.TS == nil {
		return cwd
	}
	options := sess.Program.TS.Options()
	// rootDir wins only at or below the working dir: one set wide to type-check sibling packages is an
	// emit-root signal, not a source-root one, and honoring it would drop the output outside the project.
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

// isWithin compares as forward-slash paths, so the prefix test is separator-safe.
func isWithin(base, target string) bool {
	if base == "" {
		return false
	}
	base = strings.TrimSuffix(filepath.ToSlash(base), "/")
	target = strings.TrimSuffix(filepath.ToSlash(target), "/")
	return target == base || strings.HasPrefix(target, base+"/")
}

// projectRootFiles is the program's own root file set, node_modules entries dropped so a dependency
// .d.ts cannot drag the common ancestor up to a shared parent.
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

// commonDir returns the deepest directory containing every path's parent, or "" when they share no
// meaningful root. It works on forward-slash segments, which is how tsgo paths already arrive.
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
	// A lone leading "" means the paths share only the filesystem root: let the caller fall through.
	if len(common) <= 1 {
		return ""
	}
	return strings.Join(common, "/")
}

// materializeModules writes each entry module to typesDir/<basename>.js, creating parent dirs for a
// slashed basename. Write-only-on-change, so a dev file-watcher is not retriggered for a module whose
// content-addressed bytes did not change; it returns the basenames it actually rewrote, sorted.
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

// pruneStaleModules deletes any *.js whose basename left the live set: the GC that keeps the generated
// tree equal to the current build's output when a type and its call sites go away.
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
