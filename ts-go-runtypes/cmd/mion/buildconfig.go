// buildconfig.go layers the build path's effective resolver options from two
// sources, tsc-style: a command-line flag overrides the tsconfig plugin entry,
// which overrides the binary's built-in default. The host plugins
// (ts-runtypes-devtools) forward a --flag ONLY for an option the user set
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
	set                     map[string]bool
	hashLength              int
	singleThreaded          bool
	noSingleThreaded        bool
	noParallelScan          bool
	noParallelRender        bool
	genDir                  string
	emitMode                string
	inlineMode              string
	moduleMode              string
	pureFnReportWire        bool
	pureFnReportFile        bool
	binarySizingBias        float64
	binarySizingItems       int
	binarySizingStringBytes int
	binarySizingMaxBytes    int
	numberMode              string
	parseStrategy           string
	patternSampleCount      int
	patternSampleRetries    int
	markerPackages          string
	noMarkerPackageCheck    bool
}

// buildOptions is the merged build configuration the resolver consumes.
type buildOptions struct {
	hashLength              int
	singleThreaded          bool
	disableParallelScan     bool
	disableParallelRender   bool
	genDir                  string
	emitMode                string
	inlineMode              string
	moduleMode              string
	pureFnReportWire        bool
	pureFnReportFile        bool
	binarySizingBias        float64
	binarySizingItems       int
	binarySizingStringBytes int
	binarySizingMaxBytes    int
	numberMode              string
	parseStrategy           string
	patternSampleCount      int
	patternSampleRetries    int
	markerPackages          []string
	skipMarkerPackageCheck  bool
}

// mergeBuildOptions resolves the effective build configuration from the CLI
// flags and the tsconfig plugin entry. Precedence (highest first): an
// explicitly-set flag, then the tsconfig plugin entry, then the binary default
// the flag already carries. absCwd anchors relative path values (genDir).
// The RT disk cache is NOT resolved here — it follows the project's incremental
// setting (see resolver.Options.CacheFollowsIncremental) with the internal
// MION_CACHE_DIR env override applied in main.go.
func mergeBuildOptions(flags buildFlags, plugin tsRuntypesPlugin, absCwd string) buildOptions {
	// emit / inline / module-mode flags are declared with the binary default
	// as their flag default, so an unset flag already holds the default; a
	// present tsconfig value overrides only when the flag was not passed.
	out := buildOptions{
		hashLength:              flags.hashLength,
		singleThreaded:          flags.singleThreaded,
		emitMode:                flags.emitMode,
		inlineMode:              flags.inlineMode,
		moduleMode:              flags.moduleMode,
		pureFnReportWire:        flags.pureFnReportWire,
		pureFnReportFile:        flags.pureFnReportFile,
		binarySizingBias:        flags.binarySizingBias,
		binarySizingItems:       flags.binarySizingItems,
		binarySizingStringBytes: flags.binarySizingStringBytes,
		binarySizingMaxBytes:    flags.binarySizingMaxBytes,
		numberMode:              flags.numberMode,
		parseStrategy:           flags.parseStrategy,
		patternSampleCount:      flags.patternSampleCount,
		patternSampleRetries:    flags.patternSampleRetries,
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
	// singleThreaded: an explicit --single-threaded / --no-single-threaded (either
	// direction) wins over the tsconfig entry; the tsconfig fills in only when
	// NEITHER was passed. The --no-single-threaded opt-out lets a host plugin force
	// multi-threaded (its singleThreaded:false) over a tsconfig singleThreaded:true,
	// matching the parallelScan / parallelRender override shape.
	switch {
	case flags.set["single-threaded"]:
		out.singleThreaded = true
	case flags.set["no-single-threaded"]:
		out.singleThreaded = false
	case plugin.SingleThreaded != nil:
		out.singleThreaded = *plugin.SingleThreaded
	}

	// Pure-fn report: the tsconfig `pureFnReport` boolean fills in only when NO
	// report flag was passed on the command line, tsc-style. `true` both emits
	// the report data and writes the hardcoded-path JSON file; there is no
	// path knob (like every location under genDir, it is convention, not config).
	if !flags.set["pure-fn-report-wire"] && !flags.set["pure-fn-report-file"] && plugin.PureFnReport != nil && *plugin.PureFnReport {
		out.pureFnReportWire = true
		out.pureFnReportFile = true
	}
	// A configured file always implies the report data is produced.
	if out.pureFnReportFile {
		out.pureFnReportWire = true
	}

	// Binary cold-start sizing knobs: a tsconfig value fills in only when the
	// flag was not explicitly passed (the flag already carries the binary default).
	if sizing := plugin.BinarySizing; sizing != nil {
		if !flags.set["binary-sizing-bias"] && sizing.Bias != nil {
			out.binarySizingBias = *sizing.Bias
		}
		if !flags.set["binary-sizing-items"] && sizing.Items != nil {
			out.binarySizingItems = *sizing.Items
		}
		if !flags.set["binary-sizing-string-bytes"] && sizing.StringBytes != nil {
			out.binarySizingStringBytes = *sizing.StringBytes
		}
		if !flags.set["binary-sizing-max-bytes"] && sizing.MaxBytes != nil {
			out.binarySizingMaxBytes = *sizing.MaxBytes
		}
	}

	// numberMode default (validate.numberMode): a tsconfig value fills in only
	// when --number-mode was not explicitly passed, tsc-style.
	if !flags.set["number-mode"] && plugin.Validate != nil && strings.TrimSpace(plugin.Validate.NumberMode) != "" {
		out.numberMode = strings.TrimSpace(plugin.Validate.NumberMode)
	}
	// parse strategy default (parse.strategy): same tsc-style fill-in.
	if !flags.set["parse-strategy"] && plugin.Parse != nil && strings.TrimSpace(plugin.Parse.Strategy) != "" {
		out.parseStrategy = strings.TrimSpace(plugin.Parse.Strategy)
	}

	// Pattern sample generation knobs: pointer keys so an explicit 0 (disable
	// generation) is distinguishable from an absent key.
	if !flags.set["pattern-sample-count"] && plugin.PatternSampleCount != nil {
		out.patternSampleCount = *plugin.PatternSampleCount
	}
	if !flags.set["pattern-sample-retries"] && plugin.PatternSampleRetries != nil {
		out.patternSampleRetries = *plugin.PatternSampleRetries
	}

	// parallelScan / parallelRender read true=on (matching the host plugin's
	// PluginOptions); the flags are the inverted --no-parallel-* opt-outs.
	out.disableParallelScan = flags.noParallelScan
	if !flags.set["no-parallel-scan"] && plugin.ParallelScan != nil {
		out.disableParallelScan = !*plugin.ParallelScan
	}
	out.disableParallelRender = flags.noParallelRender
	if !flags.set["no-parallel-render"] && plugin.ParallelRender != nil {
		out.disableParallelRender = !*plugin.ParallelRender
	}

	// Marker package gate. `packages` is ADDITIVE in both directions: the flag
	// and the tsconfig entry are unioned rather than one shadowing the other,
	// because a host plugin naming its own marker package and a project naming
	// another are both true at once — dropping either would break call sites the
	// other owns. `checkPackage` is a plain override: the --no-marker-package-check
	// flag wins, else the tsconfig value, else the default (gate on).
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
// entry, then the <cwd>/__runtypes default. Relative values resolve under
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
		value = filepath.Join(absCwd, "__runtypes")
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
