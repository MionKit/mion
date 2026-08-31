// config.go is the ts-runtypes-params reader for the CLI. Config RESOLUTION is
// TypeScript's, shared by every lane (explicit --tsconfig, else
// program.DiscoverTsconfig's tsc-style upward walk from cwd), and
// TypeScript-owned values come from tsgo's own parse; the JSONC reader here
// (comments and trailing commas stripped) exists ONLY for the `plugins[]`
// mion entry — our params riding tsconfig's language-service plugin
// slot, which tsc ignores and tsgo does not parse. The enrich-specific
// resolution (enrichConfig, resolveEnrichConfig, mirrorPath) rides along here
// for now.
package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"

	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/enrichment/enrichgen"
)

// The enrichment layout constants, the enrichConfig type, its path helpers, and
// the pure scaffold planner now live in the shared internal/enrichment/enrichgen
// leaf package, so the OpEnrich daemon op and the CLI `enrich` verb compute
// byte-identical mirrors over one implementation. These aliases keep the CLI call
// sites terse; the JSONC plugin side-read below stays here (it is disk I/O the
// leaf package deliberately does not do — the CLI feeds it in via PluginSettings).
const (
	defaultGenDirName   = enrichgen.DefaultGenDirName
	enrichedSubdir      = enrichgen.EnrichedSubdir
	familyFriendly      = enrichgen.FamilyFriendly
	familyMock          = enrichgen.FamilyMock
	defaultI18nDirName  = enrichgen.DefaultI18nDirName
	defaultSourceLocale = enrichgen.DefaultSourceLocale
)

// enrichConfig is the resolved enrichment configuration for an enrich target,
// aliased to the shared type so the CLI and the daemon resolve it identically.
type enrichConfig = enrichgen.Config

// tsRuntypesPlugin is the shape of the `mion` entry under
// compilerOptions.plugins[]. It is the single canonical config surface for the
// Go compiler's project tunables; the host plugins (ts-runtypes-devtools) forward
// only host-specific knobs (binary path, cwd) plus any explicit per-build
// override. Unknown keys are ignored.
//
// The string knobs (genDir / moduleMode / emitMode / inlineMode) decode to
// their zero value when absent; the build-path knobs below use POINTERS so an
// absent key (nil) is distinguishable from an explicit false / 0 — the merge in
// buildconfig.go only overrides a binary default when the key is actually
// present.
type tsRuntypesPlugin struct {
	Name string `json:"name"`
	// GenDir is the RunTypes output root; every location under it is
	// convention (types/, enriched/{friendly,mock,i18n}) and NOT configurable.
	GenDir     string `json:"genDir"`
	ModuleMode string `json:"moduleMode"`
	EmitMode   string `json:"emitMode"`
	InlineMode string `json:"inlineMode"`

	// I18n is the FriendlyText translation config. A pointer so an absent key
	// (nil) keeps every i18n default dormant.
	I18n *i18nPluginConfig `json:"i18n"`

	// Build-path project knobs, read by resolveBuildPlugin and merged in
	// buildconfig.go. The enrichment path ignores them.
	//
	// NB: there is deliberately NO cacheDir key. The RT disk cache follows
	// TypeScript's own `incremental` / `composite` switch (on when the project
	// is incremental, off otherwise) rather than a knob of ours; the internal
	// RT_CACHE_DIR env var overrides it for tests / direct-binary power users.
	HashLength     *int  `json:"hashLength"`
	SingleThreaded *bool `json:"singleThreaded"`
	ParallelScan   *bool `json:"parallelScan"`
	ParallelRender *bool `json:"parallelRender"`
	// Pattern mockSample auto-generation: how many samples to generate per
	// sample-less pattern (0 disables) and the per-sample draw multiplier.
	// Pointers so an explicit 0 is distinct from an absent key.
	PatternSampleCount   *int `json:"patternSampleCount"`
	PatternSampleRetries *int `json:"patternSampleRetries"`
	// PureFnReport is the pure-fn build report switch: `true` emits the report
	// AND writes it to the HARDCODED `<genDir>/types/pure-fns-report.json`;
	// absent (nil) / false keeps it off. A pointer so an absent key falls
	// through to the false default. There is deliberately NO path variant — like
	// every location under genDir, the report path is convention, not config.
	// Build-lane project option — the host plugin forwards the equivalent CLI flag.
	PureFnReport *bool `json:"pureFnReport"`
	// FailOnError controls whether Error-severity build diagnostics fail the
	// host build/transform. It is read Go-side and ECHOED on the generate
	// response (protocol.Response.FailOnError); the resolver never halts on it
	// itself, so there is no CLI flag and no buildconfig merge — the JS host
	// applies precedence (its own option, then this echo, then the true
	// default). A pointer so an absent key (nil) is distinct from an explicit
	// false. The enrich lane ignores it.
	FailOnError *bool `json:"failOnError"`
	// BinarySizing groups the binary `dynamic` strategy's cold-start
	// buffer-estimate knobs under one `binarySizing` object (like `i18n`). A nil
	// object (absent key) keeps every binary default.
	BinarySizing *binarySizingPluginConfig `json:"binarySizing"`
	// Validate groups project-wide defaults for the per-call-site ValidateOptions
	// bag under one `validate` object (like `binarySizing`). A nil object (absent key)
	// keeps every validator on its built-in default. Merged per field into each
	// validate / validationErrors call site by the scanner (site value wins per
	// field); folds into each entry's fnHash variant, so it is NOT a disk
	// fingerprint input.
	Validate *validatePluginConfig `json:"validate"`
	// Parse groups the project-wide default for createParseFn's strategy. A
	// per-call-site `strategy` wins over it.
	Parse *parsePluginConfig `json:"parse"`
	// Markers groups the marker-package gate under one `markers` object (like
	// `binarySizing`). It answers "which packages am I willing to accept the
	// marker types from?", so a library can declare `InjectRunTypeId` and
	// friends itself instead of depending on mion purely for types. A nil
	// object (absent key) keeps the built-in gate: markers count only when
	// @mionjs/run-types declared them.
	Markers *markersPluginConfig `json:"markers"`
}

// markersPluginConfig is the `markers` object under the mion plugin
// entry:
//
//	{ "packages": ["@my-org/runtypes-markers"], "checkPackage": true }
//
// packages ADDS packages allowed to declare the marker types; @mionjs/run-types
// is always accepted on top of whatever is listed, so this key can never take a
// working call site away. checkPackage:false drops the package gate entirely —
// a type is a marker on its NAME alone, wherever it came from. That is the
// escape hatch, not the recommended setting: with it off, any local `type
// InjectRunTypeId<T> = …` starts driving rewrites.
type markersPluginConfig struct {
	Packages     []string `json:"packages"`
	CheckPackage *bool    `json:"checkPackage"`
}

// binarySizingPluginConfig is the `binarySizing` object under the mion
// plugin entry:
//
//	{ "bias": 0.8, "items": 100, "stringBytes": 32, "maxBytes": 65536 }
//
// bias (0..1) tunes how generous the first buffer is; items / stringBytes are
// the assumed magnitudes for unbounded collections and strings; maxBytes caps
// the estimate. Pointers so an absent key falls through to the binary default.
type binarySizingPluginConfig struct {
	Bias        *float64 `json:"bias"`
	Items       *int     `json:"items"`
	StringBytes *int     `json:"stringBytes"`
	MaxBytes    *int     `json:"maxBytes"`
}

// validatePluginConfig is the `validate` object under the mion plugin
// entry — project-wide defaults for the per-call-site ValidateOptions bag:
//
//	{ "numberMode": "typeof" }
//
// numberMode defaults ValidateOptions.numberMode ("isFinite" | "typeof" |
// "notNaN"); empty / absent leaves every validator on the isFinite default.
type validatePluginConfig struct {
	NumberMode string `json:"numberMode"`
}

// parsePluginConfig is the `parse` object under the mion plugin entry —
// the project-wide default for createParseFn's per-call-site strategy:
//
//	{ "strategy": "strip" }
//
// strategy defaults ParseOptions.strategy ("preserve" | "strip" | "fail");
// empty / absent leaves every parser on the preserve default. Set it once when
// a project wants every payload cleaned (strip) or every undeclared key
// rejected (fail), rather than repeating the option at each call.
type parsePluginConfig struct {
	Strategy string `json:"strategy"`
}

// i18nPluginConfig is the `i18n` object under the mion plugin entry:
//
//	{ "sourceLocale": "en", "locales": ["es", "pl"], "strict": false }
//
// sourceLocale names the language the source FriendlyText maps are authored in
// (it selects the plural arms the scaffold emits). locales is the target set —
// the source locale is NOT listed. strict turns `enrich --translate --no-emit` findings
// into errors; the runtime is always lenient. The translation subtree location
// is convention (<genDir>/enriched/i18n/<locale>/…), never configurable.
type i18nPluginConfig struct {
	SourceLocale string   `json:"sourceLocale"`
	Locales      []string `json:"locales"`
	Strict       bool     `json:"strict"`
}

// tsconfigShape decodes ONLY the plugins slot — the mion entry, our
// params. Every TypeScript-owned compilerOptions value comes from tsgo's parse.
type tsconfigShape struct {
	CompilerOptions struct {
		Plugins []json.RawMessage `json:"plugins"`
	} `json:"compilerOptions"`
}

// resolveConfigPath is THE config-resolution policy for every CLI lane — the
// single "explicit flag, else discover" function, exactly tsc's: an explicit
// --tsconfig (anchored under absCwd) wins; else program.DiscoverTsconfig's
// upward walk from absCwd; else "" (no config anywhere — the inferred-defaults
// posture). Called from exactly one entry per lane: main's resolver
// subcommands, and resolveEnrichProject for the enrich verbs.
//
// It resolves the PATH only; existence is enforced downstream by
// program.ParseInferredConfig / program.New (a missing NAMED path becomes a loud
// "tsconfig not found at <path>" there). Resolving rather than fataling here lets
// the serve daemon report a bad --tsconfig per-op (on setSources) and stay alive
// to heal, instead of crashing at startup.
func resolveConfigPath(absCwd, tsconfigFlag string) string {
	if trimmed := strings.TrimSpace(tsconfigFlag); trimmed != "" {
		if filepath.IsAbs(trimmed) {
			return trimmed
		}
		return filepath.Join(absCwd, trimmed)
	}
	return program.DiscoverTsconfig(absCwd)
}

// resolveEnrichProject resolves the ONE tsconfig for an enrich command run and
// parses it EXACTLY ONCE, returning both the path and the frozen config to thread
// into resolveEnrichConfig (genDir/rootDir/hashLength) AND buildProgram (type
// resolution) — which used to parse the config twice. The config's own module
// resolution conditions are adopted wholesale, so enrich resolves exactly like a
// build; a project that dogfoods its in-tree src opts in via
// customConditions:["source"] in the tsconfig (enrich never forces it). "" path +
// nil config means no tsconfig anywhere (the inferred-defaults fallback).
func resolveEnrichProject(tsconfigFlag string) (string, *program.InferredConfig) {
	cwd := enrichCwd("tsconfig discovery")
	tsconfigPath := resolveConfigPath(cwd, tsconfigFlag)
	parsed, err := program.ParseInferredConfig(cwd, tsconfigPath)
	if err != nil {
		fatal("%v", err)
	}
	return tsconfigPath, parsed
}

// resolveEnrichConfig computes the enrichment config for an enrich target file.
// It performs the one bit of disk I/O the pure enrichgen.ResolveConfig cannot —
// the JSONC side-read of the tsconfig's mion plugin entry (our params
// riding tsconfig's language-service plugin slot; tsc ignores it and tsgo does
// not parse it) — then delegates the (pure) path math to the shared leaf package,
// so the daemon op resolves the same layout. Strict like tsc: a resolved config
// that does not parse is fatal; only no-config-anywhere falls back to defaults.
func resolveEnrichConfig(absTargetFile, genDirFlag, tsconfigPath string, parsed *program.InferredConfig) enrichConfig {
	var pluginSettings enrichgen.PluginSettings
	if tsconfigPath != "" {
		pluginTsconfig, ok := parseTsconfig(tsconfigPath)
		if !ok {
			fatal("tsconfig %s: cannot parse", tsconfigPath)
		}
		if plugin, ok := findTsRuntypesPlugin(pluginTsconfig); ok {
			pluginSettings = pluginSettingsFrom(plugin)
		}
	}
	return enrichgen.ResolveConfig(absTargetFile, genDirFlag, tsconfigPath, parsed, pluginSettings)
}

// pluginSettingsFrom projects the CLI's JSONC-read mion plugin entry onto
// the shared enrichgen.PluginSettings the resolver consumes.
func pluginSettingsFrom(plugin tsRuntypesPlugin) enrichgen.PluginSettings {
	settings := enrichgen.PluginSettings{
		GenDir:     plugin.GenDir,
		ModuleMode: plugin.ModuleMode,
		EmitMode:   plugin.EmitMode,
		InlineMode: plugin.InlineMode,
	}
	if plugin.HashLength != nil {
		settings.HashLength = *plugin.HashLength
	}
	if plugin.I18n != nil {
		settings.I18n = &enrichgen.I18nSettings{
			SourceLocale: plugin.I18n.SourceLocale,
			Locales:      plugin.I18n.Locales,
			Strict:       plugin.I18n.Strict,
		}
	}
	return settings
}

// ensureFamilyReadme self-documents an enrichment family dir (or the i18n
// translation root) the moment it is created: every conventional dir under
// genDir carries a README explaining what it is. Write-if-absent so an edit is
// never clobbered; best-effort (a failure surfaces on the mirror write itself).
func ensureFamilyReadme(config enrichConfig, family string) {
	texts := map[string][2]string{
		familyFriendly: {filepath.Join(config.EnrichDir, familyFriendly),
			"# FriendlyText mirrors\n\nHuman-facing labels and error messages for your types, one mirror file per\nsource file. Scaffolded and kept in sync by `mion enrich`; the values are\nyours to edit. Commit these files.\n"},
		familyMock: {filepath.Join(config.EnrichDir, familyMock),
			"# MockData mirrors\n\nRealistic sample pools and ranges for your types, one mirror file per source\nfile. Scaffolded and kept in sync by `mion enrich`; the values are yours\nto edit. Commit these files.\n"},
		defaultI18nDirName: {config.I18nDir,
			"# Translations\n\nPer-locale translations of the FriendlyText mirrors, one folder per locale.\nManaged with `mion enrich --translate`. Commit these files.\n"},
	}
	entry, ok := texts[family]
	if !ok {
		return
	}
	dir, text := entry[0], entry[1]
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return
	}
	readme := filepath.Join(dir, "README.md")
	if _, err := os.Stat(readme); err == nil {
		return
	}
	_ = os.WriteFile(readme, []byte(text), 0o644)
}

// The mirror-path helpers (MirrorPath / LegacyMirrorPath / MirrorRel /
// TranslationPathFor) and the forceTSExt / resolveUnder utilities now live as
// methods on enrichgen.Config in internal/enrichment/enrichgen, shared with the
// OpEnrich daemon op. Call them as config.MirrorPath(...) etc.

// parseTsconfig reads and tolerantly parses a JSONC tsconfig.json (comments +
// trailing commas stripped). Returns ok=false on read or parse failure so the
// caller falls back to defaults.
func parseTsconfig(tsconfigPath string) (tsconfigShape, bool) {
	var parsed tsconfigShape
	raw, err := os.ReadFile(tsconfigPath)
	if err != nil {
		return parsed, false
	}
	cleaned := stripJSONC(string(raw))
	if err := json.Unmarshal([]byte(cleaned), &parsed); err != nil {
		return parsed, false
	}
	return parsed, true
}

// findTsRuntypesPlugin scans compilerOptions.plugins[] for the entry whose
// "name" is "mion". Entries that fail to decode are skipped.
func findTsRuntypesPlugin(parsed tsconfigShape) (tsRuntypesPlugin, bool) {
	for _, raw := range parsed.CompilerOptions.Plugins {
		var plugin tsRuntypesPlugin
		if err := json.Unmarshal(raw, &plugin); err != nil {
			continue
		}
		if plugin.Name == "mion" {
			return plugin, true
		}
	}
	return tsRuntypesPlugin{}, false
}

// resolveBuildPlugin reads the compilerOptions.plugins[name=mion] entry
// from the build path's tsconfig — the same file program.New loads in the
// default (on-disk tsconfig) mode. Returns ok=false when no tsconfig resolves
// or it carries no mion entry; the build path then runs on CLI flags +
// binary defaults alone (the inline / server modes have no tsconfig, and a
// project may simply never add the plugin entry).
//
// tsconfigFlag is the --tsconfig CLI value (empty → <absCwd>/tsconfig.json),
// matching program.New's own resolution so the binary reads the very tsconfig
// it compiles against. A missing or malformed tsconfig returns ok=false rather
// than erroring — same tolerant contract as resolveEnrichConfig.
func resolveBuildPlugin(absCwd, tsconfigFlag string) (tsRuntypesPlugin, bool) {
	parsed, ok := parseTsconfig(buildTsconfigPath(absCwd, tsconfigFlag))
	if !ok {
		return tsRuntypesPlugin{}, false
	}
	return findTsRuntypesPlugin(parsed)
}

// buildTsconfigPath anchors main's ALREADY-RESOLVED tsconfig path (the single
// resolution seam: explicit --tsconfig, else program.DiscoverTsconfig) under
// absCwd when relative. "" stays "" — no config exists anywhere, so there is
// no plugin block to read; this function never invents a default.
func buildTsconfigPath(absCwd, tsconfigFlag string) string {
	tsconfigPath := strings.TrimSpace(tsconfigFlag)
	if tsconfigPath == "" {
		return ""
	}
	if !filepath.IsAbs(tsconfigPath) {
		return filepath.Join(absCwd, tsconfigPath)
	}
	return tsconfigPath
}

// knownPluginKeys is the set of JSON keys the mion plugin entry
// recognises, derived by reflection from tsRuntypesPlugin's json tags so it can
// never drift from the struct. Used to warn on a likely-typo'd key.
var knownPluginKeys = func() map[string]bool {
	keys := map[string]bool{}
	pluginType := reflect.TypeOf(tsRuntypesPlugin{})
	for i := 0; i < pluginType.NumField(); i++ {
		tag := pluginType.Field(i).Tag.Get("json")
		if name, _, _ := strings.Cut(tag, ","); name != "" && name != "-" {
			keys[name] = true
		}
	}
	return keys
}()

// unknownPluginKeys returns the keys in the mion plugin entry that the
// build path does not recognise (sorted) — almost always a typo. Empty when no
// tsconfig resolves, it is malformed, or it has no mion entry, so a
// project without the plugin never warns. The build path surfaces these on
// stderr; an unknown key is otherwise silently ignored.
func unknownPluginKeys(absCwd, tsconfigFlag string) []string {
	raw, err := os.ReadFile(buildTsconfigPath(absCwd, tsconfigFlag))
	if err != nil {
		return nil
	}
	var parsed struct {
		CompilerOptions struct {
			Plugins []map[string]json.RawMessage `json:"plugins"`
		} `json:"compilerOptions"`
	}
	if json.Unmarshal([]byte(stripJSONC(string(raw))), &parsed) != nil {
		return nil
	}
	for _, entry := range parsed.CompilerOptions.Plugins {
		var name string
		if json.Unmarshal(entry["name"], &name) != nil || name != "mion" {
			continue
		}
		var unknown []string
		for key := range entry {
			if !knownPluginKeys[key] {
				unknown = append(unknown, key)
			}
		}
		sort.Strings(unknown)
		return unknown
	}
	return nil
}

// stripJSONC removes // line comments, /* block */ comments, and trailing
// commas from a JSONC document, leaving valid JSON. It is string/escape aware so
// a `//` or `,` inside a string literal is preserved. This is intentionally
// minimal — robustness over completeness; a tsconfig it cannot clean simply
// fails json.Unmarshal and the caller falls back to defaults.
func stripJSONC(input string) string {
	var out strings.Builder
	out.Grow(len(input))

	inString := false
	inLineComment := false
	inBlockComment := false
	escaped := false

	for i := 0; i < len(input); i++ {
		current := input[i]

		if inLineComment {
			if current == '\n' {
				inLineComment = false
				out.WriteByte(current)
			}
			continue
		}
		if inBlockComment {
			if current == '*' && i+1 < len(input) && input[i+1] == '/' {
				inBlockComment = false
				i++
			}
			continue
		}
		if inString {
			out.WriteByte(current)
			if escaped {
				escaped = false
			} else if current == '\\' {
				escaped = true
			} else if current == '"' {
				inString = false
			}
			continue
		}

		// Not in a string or comment.
		switch {
		case current == '"':
			inString = true
			out.WriteByte(current)
		case current == '/' && i+1 < len(input) && input[i+1] == '/':
			inLineComment = true
			i++
		case current == '/' && i+1 < len(input) && input[i+1] == '*':
			inBlockComment = true
			i++
		case current == ',':
			// Drop a trailing comma: a comma followed (after whitespace) by a
			// closing } or ]. Otherwise keep it.
			if isTrailingComma(input, i+1) {
				continue
			}
			out.WriteByte(current)
		default:
			out.WriteByte(current)
		}
	}
	return out.String()
}

// isTrailingComma reports whether the next non-whitespace byte at or after pos
// is a closing brace or bracket (so the preceding comma is a trailing comma).
func isTrailingComma(input string, pos int) bool {
	for i := pos; i < len(input); i++ {
		switch input[i] {
		case ' ', '\t', '\r', '\n':
			continue
		case '}', ']':
			return true
		default:
			return false
		}
	}
	return false
}
