// buildconfig.go layers the build path's effective resolver options from two
// sources, tsc-style: a command-line flag overrides the tsconfig plugin entry,
// which overrides the binary's built-in default. The host plugins
// (@mionjs/devtools) forward a --flag ONLY for an option the user set
// explicitly, so an unset host option falls through to the tsconfig entry.
package main

import (
	"path/filepath"
	"strings"
)

// buildFlags carries the raw build-path CLI flag values plus the set of flag
// names the user actually passed (flag.Visit). "set" is what lets the merge
// tell an explicit `--single-threaded=false` from an absent flag, so tsconfig
// only fills the gaps the command line left.
type buildFlags struct {
	set                  map[string]bool
	hashLength           int
	singleThreaded       bool
	noSingleThreaded     bool
	noParallelScan       bool
	noParallelRender     bool
	genDir               string
	emitMode             string
	inlineMode           string
	moduleMode           string
	pureFnReportWire     bool
	pureFnReportFile     bool
	jsonMaxBytes         bool
	numberMode           string
	patternSampleCount   int
	patternSampleRetries int
	markerPackages       string
	noMarkerPackageCheck bool
}

// buildOptions is the merged build configuration the resolver consumes.
type buildOptions struct {
	hashLength             int
	singleThreaded         bool
	disableParallelScan    bool
	disableParallelRender  bool
	genDir                 string
	emitMode               string
	inlineMode             string
	moduleMode             string
	pureFnReportWire       bool
	pureFnReportFile       bool
	jsonMaxBytes           bool
	numberMode             string
	patternSampleCount     int
	patternSampleRetries   int
	markerPackages         []string
	skipMarkerPackageCheck bool
}

// mergeBuildOptions resolves the build config: an explicit flag, then the tsconfig plugin entry, then the default.
// The RT disk cache is not resolved here: it follows incremental (CacheFollowsIncremental), MION_CACHE_DIR in main.go.
func mergeBuildOptions(flags buildFlags, plugin tsRuntypesPlugin, absCwd string) buildOptions {
	// Each flag's default is the binary default, so an unset flag already holds it; tsconfig fills in only then.
	out := buildOptions{
		hashLength:           flags.hashLength,
		singleThreaded:       flags.singleThreaded,
		emitMode:             flags.emitMode,
		inlineMode:           flags.inlineMode,
		moduleMode:           flags.moduleMode,
		pureFnReportWire:     flags.pureFnReportWire,
		pureFnReportFile:     flags.pureFnReportFile,
		jsonMaxBytes:         flags.jsonMaxBytes,
		numberMode:           flags.numberMode,
		patternSampleCount:   flags.patternSampleCount,
		patternSampleRetries: flags.patternSampleRetries,
	}

	if !flags.set["emit-mode"] && strings.TrimSpace(plugin.EmitMode) != "" {
		out.emitMode = strings.TrimSpace(plugin.EmitMode)
	}
	if !flags.set["inline-mode"] && strings.TrimSpace(plugin.InlineMode) != "" {
		out.inlineMode = strings.TrimSpace(plugin.InlineMode)
	}
	if !flags.set["module-mode"] && strings.TrimSpace(plugin.ModuleMode) != "" {
		out.moduleMode = strings.TrimSpace(plugin.ModuleMode)
	}
	if !flags.set["hash-length"] && plugin.HashLength != nil {
		out.hashLength = *plugin.HashLength
	}
	// --no-single-threaded lets a host plugin force multi-threaded over a tsconfig singleThreaded:true.
	switch {
	case flags.set["single-threaded"]:
		out.singleThreaded = true
	case flags.set["no-single-threaded"]:
		out.singleThreaded = false
	case plugin.SingleThreaded != nil:
		out.singleThreaded = *plugin.SingleThreaded
	}

	// `pureFnReport: true` turns on both report outputs; no path knob, a location under genDir is convention.
	if !flags.set["pure-fn-report-wire"] && !flags.set["pure-fn-report-file"] && plugin.PureFnReport != nil && *plugin.PureFnReport {
		out.pureFnReportWire = true
		out.pureFnReportFile = true
	}
	// A configured file always implies the report data is produced.
	if out.pureFnReportFile {
		out.pureFnReportWire = true
	}
	if !flags.set["json-max-bytes"] && plugin.JSONMaxBytes != nil {
		out.jsonMaxBytes = *plugin.JSONMaxBytes
	}

	if !flags.set["number-mode"] && plugin.Validate != nil && strings.TrimSpace(plugin.Validate.NumberMode) != "" {
		out.numberMode = strings.TrimSpace(plugin.Validate.NumberMode)
	}

	// Pointer keys, so an explicit 0 (disable generation) differs from an absent key.
	if !flags.set["pattern-sample-count"] && plugin.PatternSampleCount != nil {
		out.patternSampleCount = *plugin.PatternSampleCount
	}
	if !flags.set["pattern-sample-retries"] && plugin.PatternSampleRetries != nil {
		out.patternSampleRetries = *plugin.PatternSampleRetries
	}

	// The tsconfig keys read true=on like PluginOptions; the flags are the inverted --no-parallel-* opt-outs.
	out.disableParallelScan = flags.noParallelScan
	if !flags.set["no-parallel-scan"] && plugin.ParallelScan != nil {
		out.disableParallelScan = !*plugin.ParallelScan
	}
	out.disableParallelRender = flags.noParallelRender
	if !flags.set["no-parallel-render"] && plugin.ParallelRender != nil {
		out.disableParallelRender = !*plugin.ParallelRender
	}

	// Marker `packages` are unioned, never shadowed: a host plugin's marker package and the project's are both live.
	out.markerPackages = mergeMarkerPackages(flags.markerPackages, plugin.Markers)
	out.skipMarkerPackageCheck = flags.noMarkerPackageCheck
	if !flags.set["no-marker-package-check"] && plugin.Markers != nil && plugin.Markers.CheckPackage != nil {
		out.skipMarkerPackageCheck = !*plugin.Markers.CheckPackage
	}

	out.genDir = resolveGenDir(flags, plugin, absCwd)
	return out
}

// mergeMarkerPackages unions the --marker-packages flag (comma-separated) with
// the tsconfig `markers.packages` list, trimming blanks and de-duplicating
// while preserving first-seen order (flag entries first, so a `--help` dump and
// a diagnostic read in the order the user is most likely to recognise).
func mergeMarkerPackages(flagValue string, markers *markersPluginConfig) []string {
	var out []string
	seen := map[string]bool{}
	add := func(name string) {
		name = strings.TrimSpace(name)
		if name == "" || seen[name] {
			return
		}
		seen[name] = true
		out = append(out, name)
	}
	for _, name := range strings.Split(flagValue, ",") {
		add(name)
	}
	if markers != nil {
		for _, name := range markers.Packages {
			add(name)
		}
	}
	return out
}

// resolveGenDir layers where `--compile` writes its cache modules: an
// explicit --gen-dir flag wins, then the tsconfig `genDir`
// entry, then the <cwd>/.mion default. Relative values resolve under
// absCwd. Unlike cacheDir there is no disable state — compile always needs an
// output location — so an empty explicit value falls through to the default.
func resolveGenDir(flags buildFlags, plugin tsRuntypesPlugin, absCwd string) string {
	value := ""
	switch {
	case flags.set["gen-dir"]:
		value = strings.TrimSpace(flags.genDir)
	case strings.TrimSpace(plugin.GenDir) != "":
		value = strings.TrimSpace(plugin.GenDir)
	}
	if value == "" {
		value = filepath.Join(absCwd, ".mion")
	}
	if !filepath.IsAbs(value) {
		value = filepath.Join(absCwd, value)
	}
	return value
}

// normalizeCacheDir resolves the internal MION_CACHE_DIR override value to an
// absolute path (empty stays empty — an explicit disable). Relative values
// anchor under absCwd, matching how genDir resolves.
func normalizeCacheDir(value, absCwd string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if !filepath.IsAbs(value) {
		value = filepath.Join(absCwd, value)
	}
	return value
}
