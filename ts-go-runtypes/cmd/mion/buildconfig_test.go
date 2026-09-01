package main

import (
	"path/filepath"
	"reflect"
	"testing"
)

// intPtr / boolPtr / strPtr build the pointer fields of a tsRuntypesPlugin —
// a present key vs the nil "absent" the merge must leave alone.
func intPtr(v int) *int       { return &v }
func boolPtr(v bool) *bool    { return &v }
func strPtr(v string) *string { return &v }

// baseFlags returns build flags as the binary declares them with nothing set —
// the flag defaults that double as the binary defaults.
func baseFlags() buildFlags {
	return buildFlags{
		set:                  map[string]bool{},
		hashLength:           0,
		emitMode:             "code",
		inlineMode:           "default",
		moduleMode:           "default",
		patternSampleCount:   100,
		patternSampleRetries: 10,
	}
}

// TestMergeBuildOptions_DefaultsWhenEmpty: no flags, no plugin entry yields
// exactly the binary defaults (the RT cache is resolved separately, off the
// project's incremental setting — not part of buildOptions).
func TestMergeBuildOptions_DefaultsWhenEmpty(t *testing.T) {
	got := mergeBuildOptions(baseFlags(), tsRuntypesPlugin{}, "/proj")
	want := buildOptions{
		hashLength: 0, emitMode: "code", inlineMode: "default", moduleMode: "default",
		genDir:             filepath.Join("/proj", "__runtypes"),
		patternSampleCount: 100, patternSampleRetries: 10,
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("merge defaults = %+v, want %+v", got, want)
	}
}

// TestMergeBuildOptions_TsconfigFillsGaps: with no flags set, every tsconfig
// value flows through.
func TestMergeBuildOptions_TsconfigFillsGaps(t *testing.T) {
	plugin := tsRuntypesPlugin{
		EmitMode:             "both",
		InlineMode:           "allInternal",
		ModuleMode:           "allSingle",
		HashLength:           intPtr(9),
		SingleThreaded:       boolPtr(true),
		ParallelScan:         boolPtr(false),
		ParallelRender:       boolPtr(false),
		PatternSampleCount:   intPtr(25),
		PatternSampleRetries: intPtr(4),
	}
	got := mergeBuildOptions(baseFlags(), plugin, "/proj")
	want := buildOptions{
		hashLength:            9,
		singleThreaded:        true,
		disableParallelScan:   true,
		disableParallelRender: true,
		genDir:                filepath.Join("/proj", "__runtypes"),
		emitMode:              "both",
		inlineMode:            "allInternal",
		moduleMode:            "allSingle",
		patternSampleCount:    25,
		patternSampleRetries:  4,
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("merge from tsconfig = %+v, want %+v", got, want)
	}
}

// TestMergeBuildOptions_SingleThreadedOverride: an explicit --single-threaded /
// --no-single-threaded (either direction) wins over the tsconfig entry, so a host
// plugin's singleThreaded:false (→ --no-single-threaded) can force multi-threaded
// over a tsconfig singleThreaded:true, and vice versa (flag > tsconfig).
func TestMergeBuildOptions_SingleThreadedOverride(t *testing.T) {
	// tsconfig singleThreaded:true alone → on.
	if got := mergeBuildOptions(baseFlags(), tsRuntypesPlugin{SingleThreaded: boolPtr(true)}, "/proj"); !got.singleThreaded {
		t.Fatalf("tsconfig singleThreaded:true → want singleThreaded=true, got %+v", got)
	}

	// --no-single-threaded forces it back off despite the tsconfig.
	off := baseFlags()
	off.set["no-single-threaded"] = true
	off.noSingleThreaded = true
	if got := mergeBuildOptions(off, tsRuntypesPlugin{SingleThreaded: boolPtr(true)}, "/proj"); got.singleThreaded {
		t.Errorf("--no-single-threaded should override tsconfig singleThreaded:true, got singleThreaded=true")
	}

	// --single-threaded forces it on over a tsconfig singleThreaded:false.
	on := baseFlags()
	on.set["single-threaded"] = true
	on.singleThreaded = true
	if got := mergeBuildOptions(on, tsRuntypesPlugin{SingleThreaded: boolPtr(false)}, "/proj"); !got.singleThreaded {
		t.Errorf("--single-threaded should override tsconfig singleThreaded:false, got singleThreaded=false")
	}
}

// TestResolveGenDir covers the three layers: flag > tsconfig > the
// <cwd>/__runtypes default (there is no disable state — compile always emits).
func TestResolveGenDir(t *testing.T) {
	defaultDir := filepath.Join("/proj", "__runtypes")
	tests := []struct {
		name   string
		flags  buildFlags
		plugin tsRuntypesPlugin
		want   string
	}{
		{"nothing set uses the default", baseFlags(), tsRuntypesPlugin{}, defaultDir},
		{"tsconfig absolute wins over default", baseFlags(), tsRuntypesPlugin{GenDir: "/abs/rt"}, "/abs/rt"},
		{"tsconfig relative anchors under cwd", baseFlags(), tsRuntypesPlugin{GenDir: "gen/rt"}, filepath.Join("/proj", "gen/rt")},
		{"tsconfig empty falls through to default", baseFlags(), tsRuntypesPlugin{GenDir: ""}, defaultDir},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := resolveGenDir(test.flags, test.plugin, "/proj"); got != test.want {
				t.Errorf("resolveGenDir = %q, want %q", got, test.want)
			}
		})
	}

	// An explicit --gen-dir flag wins over the tsconfig value.
	flags := baseFlags()
	flags.set["gen-dir"] = true
	flags.genDir = "/flag/rt"
	if got := resolveGenDir(flags, tsRuntypesPlugin{GenDir: "/abs/rt"}, "/proj"); got != "/flag/rt" {
		t.Errorf("flag genDir should win, got %q", got)
	}
}

// TestMergeBuildOptions_FlagOverridesTsconfig: an explicitly-set flag wins over
// the tsconfig value (tsc precedence), and an unset sibling still reads tsconfig.
func TestMergeBuildOptions_FlagOverridesTsconfig(t *testing.T) {
	flags := baseFlags()
	flags.set["emit-mode"] = true
	flags.emitMode = "functions"
	flags.set["hash-length"] = true
	flags.hashLength = 5
	flags.set["single-threaded"] = true
	flags.singleThreaded = true

	plugin := tsRuntypesPlugin{
		EmitMode:       "both",      // shadowed by the flag
		ModuleMode:     "allSingle", // no flag → wins
		HashLength:     intPtr(9),   // shadowed by the flag
		SingleThreaded: boolPtr(false),
	}
	got := mergeBuildOptions(flags, plugin, "/proj")
	if got.emitMode != "functions" {
		t.Errorf("emitMode = %q, want flag value functions", got.emitMode)
	}
	if got.hashLength != 5 {
		t.Errorf("hashLength = %d, want flag value 5", got.hashLength)
	}
	if !got.singleThreaded {
		t.Errorf("singleThreaded = false, want flag value true")
	}
	if got.moduleMode != "allSingle" {
		t.Errorf("moduleMode = %q, want tsconfig value allSingle", got.moduleMode)
	}
}

// TestMergeBuildOptions_PatternSampleKnobs: pointer keys, so an explicit
// tsconfig 0 (disable generation) is honored, and an explicitly-set flag
// still wins over the tsconfig value.
func TestMergeBuildOptions_PatternSampleKnobs(t *testing.T) {
	// Explicit tsconfig 0 disables — distinct from an absent key.
	got := mergeBuildOptions(baseFlags(), tsRuntypesPlugin{PatternSampleCount: intPtr(0)}, "/proj")
	if got.patternSampleCount != 0 {
		t.Errorf("patternSampleCount = %d, want tsconfig's explicit 0", got.patternSampleCount)
	}
	if got.patternSampleRetries != 10 {
		t.Errorf("patternSampleRetries = %d, want the binary default 10", got.patternSampleRetries)
	}

	// An explicitly-set flag shadows the tsconfig value.
	flags := baseFlags()
	flags.set["pattern-sample-count"] = true
	flags.patternSampleCount = 12
	flags.set["pattern-sample-retries"] = true
	flags.patternSampleRetries = 3
	plugin := tsRuntypesPlugin{PatternSampleCount: intPtr(50), PatternSampleRetries: intPtr(20)}
	got = mergeBuildOptions(flags, plugin, "/proj")
	if got.patternSampleCount != 12 || got.patternSampleRetries != 3 {
		t.Errorf("flags should win: got (%d, %d), want (12, 3)", got.patternSampleCount, got.patternSampleRetries)
	}
}

// TestMergeBuildOptions_ParallelInversion: tsconfig parallelScan:true means
// parallel-on (disable=false); :false means the serial path.
func TestMergeBuildOptions_ParallelInversion(t *testing.T) {
	on := mergeBuildOptions(baseFlags(), tsRuntypesPlugin{ParallelScan: boolPtr(true), ParallelRender: boolPtr(true)}, "/proj")
	if on.disableParallelScan || on.disableParallelRender {
		t.Errorf("parallel:true should leave disable=false, got %+v", on)
	}
	off := mergeBuildOptions(baseFlags(), tsRuntypesPlugin{ParallelScan: boolPtr(false), ParallelRender: boolPtr(false)}, "/proj")
	if !off.disableParallelScan || !off.disableParallelRender {
		t.Errorf("parallel:false should set disable=true, got %+v", off)
	}
	// An explicit --no-parallel-scan flag wins over tsconfig parallelScan:true.
	flags := baseFlags()
	flags.set["no-parallel-scan"] = true
	flags.noParallelScan = true
	mixed := mergeBuildOptions(flags, tsRuntypesPlugin{ParallelScan: boolPtr(true)}, "/proj")
	if !mixed.disableParallelScan {
		t.Errorf("--no-parallel-scan flag should win over tsconfig parallelScan:true")
	}
}

// TestNormalizeCacheDir covers the internal MION_CACHE_DIR override normalization:
// empty stays empty (explicit disable), absolute passes through, relative
// anchors under cwd. The enable/incremental decision lives in the resolver
// (resolver.cacheLocation); this helper only resolves the override path.
func TestNormalizeCacheDir(t *testing.T) {
	tests := []struct {
		name  string
		value string
		want  string
	}{
		{"empty stays empty (disable)", "", ""},
		{"whitespace-only trims to empty", "  ", ""},
		{"absolute passes through", "/abs/c", "/abs/c"},
		{"relative anchors under cwd", ".cache/rt", filepath.Join("/proj", ".cache/rt")},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := normalizeCacheDir(test.value, "/proj"); got != test.want {
				t.Errorf("normalizeCacheDir(%q) = %q, want %q", test.value, got, test.want)
			}
		})
	}
}

// TestResolveBuildPlugin reads the mion entry from an on-disk tsconfig,
// including the new pointer-typed build knobs, and tolerates a missing file.
func TestResolveBuildPlugin(t *testing.T) {
	dir := t.TempDir()
	writeTestFile(t, filepath.Join(dir, "tsconfig.json"), `{
  // build knobs
  "compilerOptions": {
    "plugins": [
      { "name": "other" },
      {
        "name": "mion",
        "emitMode": "both",
        "moduleMode": "allSingle",
        "hashLength": 9,
        "singleThreaded": true,
        "parallelScan": false,
        "genDir": "gen/rt",
      },
    ],
  },
}`)

	plugin, ok := resolveBuildPlugin(dir, "tsconfig.json")
	if !ok {
		t.Fatal("resolveBuildPlugin ok=false, want true")
	}
	if plugin.EmitMode != "both" || plugin.ModuleMode != "allSingle" {
		t.Errorf("string knobs: %+v", plugin)
	}
	if plugin.HashLength == nil || *plugin.HashLength != 9 {
		t.Errorf("hashLength pointer = %v, want 9", plugin.HashLength)
	}
	if plugin.SingleThreaded == nil || !*plugin.SingleThreaded {
		t.Errorf("singleThreaded pointer = %v, want true", plugin.SingleThreaded)
	}
	if plugin.ParallelScan == nil || *plugin.ParallelScan {
		t.Errorf("parallelScan pointer = %v, want false", plugin.ParallelScan)
	}
	if plugin.GenDir != "gen/rt" {
		t.Errorf("genDir pointer = %v, want gen/rt", plugin.GenDir)
	}

	// No tsconfig in the directory → ok=false, tolerant.
	if _, ok := resolveBuildPlugin(t.TempDir(), "tsconfig.json"); ok {
		t.Error("resolveBuildPlugin on an empty dir should return ok=false")
	}
}

// TestUnknownPluginKeys: recognised keys are silent; a typo'd key is reported
// sorted; a project with no plugin entry or no tsconfig never warns.
func TestUnknownPluginKeys(t *testing.T) {
	withConfig := func(t *testing.T, body string) string {
		dir := t.TempDir()
		writeTestFile(t, filepath.Join(dir, "tsconfig.json"), body)
		return dir
	}

	allKnown := withConfig(t, `{ "compilerOptions": { "plugins": [
    { "name": "mion", "emitMode": "both", "hashLength": 7, "genDir": "gen" }
  ] } }`)
	if got := unknownPluginKeys(allKnown, "tsconfig.json"); len(got) != 0 {
		t.Errorf("recognised keys should not warn, got %v", got)
	}

	// cacheDir is no longer a recognised key — the RT cache follows the
	// project's incremental setting, not a plugin knob — so it warns like any
	// other unknown key (a project still carrying it gets a nudge to remove it).
	removedCacheDir := withConfig(t, `{ "compilerOptions": { "plugins": [
    { "name": "mion", "cacheDir": ".cache/rt" }
  ] } }`)
	if got := unknownPluginKeys(removedCacheDir, "tsconfig.json"); len(got) != 1 || got[0] != "cacheDir" {
		t.Errorf("removed cacheDir key should warn, got %v", got)
	}

	typos := withConfig(t, `{ "compilerOptions": { "plugins": [
    { "name": "mion", "emitMdoe": "both", "zzz": 1, "moduleMode": "allSingle" }
  ] } }`)
	got := unknownPluginKeys(typos, "tsconfig.json")
	if want := []string{"emitMdoe", "zzz"}; len(got) != 2 || got[0] != want[0] || got[1] != want[1] {
		t.Errorf("unknownPluginKeys = %v, want %v (sorted)", got, want)
	}

	noEntry := withConfig(t, `{ "compilerOptions": { "plugins": [ { "name": "other", "x": 1 } ] } }`)
	if got := unknownPluginKeys(noEntry, "tsconfig.json"); len(got) != 0 {
		t.Errorf("no mion entry should not warn, got %v", got)
	}

	if got := unknownPluginKeys(t.TempDir(), "tsconfig.json"); len(got) != 0 {
		t.Errorf("no tsconfig should not warn, got %v", got)
	}
}

// --- marker package gate ----------------------------------------------------

// The flag and the tsconfig entry are UNIONED rather than one shadowing the
// other: a host plugin naming its own marker package and a project naming
// another are both true at once, so dropping either would break call sites the
// other owns. This is the one merge in the file that is deliberately additive.
func TestMergeBuildOptions_MarkerPackagesUnionFlagAndTsconfig(t *testing.T) {
	flags := baseFlags()
	flags.set["marker-packages"] = true
	flags.markerPackages = "@from/flag"
	plugin := tsRuntypesPlugin{Markers: &markersPluginConfig{Packages: []string{"@from/tsconfig"}}}

	got := mergeBuildOptions(flags, plugin, "/proj").markerPackages
	want := []string{"@from/flag", "@from/tsconfig"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("markerPackages = %v, want %v", got, want)
	}
}

func TestMergeBuildOptions_MarkerPackagesSplitTrimAndDedupe(t *testing.T) {
	flags := baseFlags()
	flags.markerPackages = " @a/one , @b/two ,, @a/one "
	plugin := tsRuntypesPlugin{Markers: &markersPluginConfig{Packages: []string{"@b/two", "  ", "@c/three"}}}

	got := mergeBuildOptions(flags, plugin, "/proj").markerPackages
	want := []string{"@a/one", "@b/two", "@c/three"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("markerPackages = %v, want %v", got, want)
	}
}

func TestMergeBuildOptions_MarkerPackageCheckDefaultsOn(t *testing.T) {
	if mergeBuildOptions(baseFlags(), tsRuntypesPlugin{}, "/proj").skipMarkerPackageCheck {
		t.Error("expected the package gate to be ON with nothing configured")
	}
}

// checkPackage is a plain override (not additive): the tsconfig turns the gate
// off, and an explicit flag wins over the tsconfig either way.
func TestMergeBuildOptions_MarkerPackageCheckFromTsconfig(t *testing.T) {
	plugin := tsRuntypesPlugin{Markers: &markersPluginConfig{CheckPackage: boolPtr(false)}}
	if !mergeBuildOptions(baseFlags(), plugin, "/proj").skipMarkerPackageCheck {
		t.Error("expected checkPackage:false to disable the package gate")
	}
}

func TestMergeBuildOptions_MarkerPackageCheckFlagWinsOverTsconfig(t *testing.T) {
	flags := baseFlags()
	flags.set["no-marker-package-check"] = true
	flags.noMarkerPackageCheck = true
	// tsconfig says "keep the gate on"; the explicit flag says otherwise.
	plugin := tsRuntypesPlugin{Markers: &markersPluginConfig{CheckPackage: boolPtr(true)}}
	if !mergeBuildOptions(flags, plugin, "/proj").skipMarkerPackageCheck {
		t.Error("expected --no-marker-package-check to win over the tsconfig entry")
	}
}
