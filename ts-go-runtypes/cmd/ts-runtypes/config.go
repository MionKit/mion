// config.go is the ts-runtypes-params reader for the CLI. Config RESOLUTION is
// TypeScript's, shared by every lane (explicit --tsconfig, else
// program.DiscoverTsconfig's tsc-style upward walk from cwd), and
// TypeScript-owned values come from tsgo's own parse; the JSONC reader here
// (comments and trailing commas stripped) exists ONLY for the `plugins[]`
// ts-runtypes entry — our params riding tsconfig's language-service plugin
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
)

// defaultGenDirName is the conventional RunTypes output root when neither a
// --gen-dir flag nor a tsconfig `genDir` supplies one: `__runtypes` under the
// project's source root. EVERYTHING under genDir is convention, never
// configuration: `types/` (regenerated, gitignored), `enriched/friendly/`,
// `enriched/mock/`, `enriched/i18n/<locale>/` (committed).
const defaultGenDirName = "__runtypes"

// enrichedSubdir is the committed half of genDir — the enrichment mirrors live
// at <genDir>/enriched/<family>/... by convention.
const enrichedSubdir = "enriched"

// Family path segments under the enrich root. Each enrichment family owns its
// own mirror subtree (<EnrichDir>/<family>/<rel>), so one source file maps to
// one mirror file PER FAMILY: friendly/models/user.ts holds friendlyUser,
// mock/models/user.ts holds mockUser. The segment lives in the PATH (never a
// filename infix) so forceTSExt stays family-blind.
const (
	familyFriendly = "friendly"
	familyMock     = "mock"
)

// defaultI18nDirName is the translation subtree's dir name under the enrich
// root (a PARALLEL sibling of the friendly/ + mock/ family subtrees); each
// locale owns a path segment under it: <EnrichDir>/i18n/<locale>/<rel>.
const defaultI18nDirName = "i18n"

// defaultSourceLocale is the language source FriendlyText maps are assumed to
// be authored in when tsconfig `i18n.sourceLocale` is absent.
const defaultSourceLocale = "en"

// enrichConfig is the resolved enrichment configuration for a gen target. It is
// the merge of (in precedence order) the --gen-dir CLI flag and the tsconfig
// `compilerOptions.plugins[name=ts-runtypes]` `genDir` entry, then the built-in
// default; EnrichDir is derived as <genDir>/enriched (convention, not config).
//
// Paths are absolute and normalized to OS separators. EnrichDir is the absolute
// mirror root; RootDir is the absolute source root the mirror tree shadows;
// ProjectRoot is the directory the mirror root is resolved under (the tsconfig
// dir, or the target file's dir when no tsconfig is found).
type enrichConfig struct {
	ProjectRoot string
	RootDir     string
	EnrichDir   string
	// TsconfigPath is the ONE resolved tsconfig this command run reads —
	// explicit --tsconfig flag, else program.DiscoverTsconfig's tsc-style
	// upward walk from the process cwd, else "" (no config anywhere). The same
	// path feeds buildProgram's type resolution, so genDir/i18n settings and
	// type queries can never come from different configs.
	TsconfigPath string

	// parsed is the ONE tsgo InferredConfig this run resolved
	// (resolveEnrichProject), carried so buildProgram reuses it instead of
	// re-parsing — the enrich lane used to parse the same tsconfig twice. Nil
	// when no tsconfig resolved anywhere.
	parsed *program.InferredConfig

	// i18n knobs (the tsconfig plugin `i18n` object; docs/done/friendly-type-i18n.md).
	// Defaults are dormant: SourceLocale 'en', I18nDir <EnrichDir>/i18n, no
	// locales, lenient check.
	SourceLocale string
	I18nDir      string
	I18nLocales  []string
	I18nStrict   bool

	// The remaining plugin options are read and stored for completeness (and
	// future use) but are not acted on by gen yet.
	ModuleMode string
	EmitMode   string
	InlineMode string
}

// tsRuntypesPlugin is the shape of the `ts-runtypes` entry under
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
	// AllowUncheckedPatterns silences the fail-closed FMT004 build error for
	// format patterns whose mockSamples RE2 can't verify (JS-only regex
	// features), asserting the ts-runtypes JS linter owns that check. A pointer
	// so an absent key falls through to the false default. Build-lane only.
	AllowUncheckedPatterns *bool `json:"allowUncheckedPatterns"`
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
	// Size groups the binary `dynamic` strategy's cold-start buffer-estimate
	// knobs under one `size` object (like `i18n`). A nil object (absent key)
	// keeps every binary default.
	Size *sizePluginConfig `json:"size"`
	// Validate groups project-wide defaults for the per-call-site ValidateOptions
	// bag under one `validate` object (like `size`). A nil object (absent key)
	// keeps every validator on its built-in default. Merged per field into each
	// validate / validationErrors call site by the scanner (site value wins per
	// field); folds into each entry's fnHash variant, so it is NOT a disk
	// fingerprint input.
	Validate *validatePluginConfig `json:"validate"`
}

// sizePluginConfig is the `size` object under the ts-runtypes plugin entry:
//
//	{ "bias": 0.8, "items": 100, "stringBytes": 32, "maxBytes": 65536 }
//
// bias (0..1) tunes how generous the first buffer is; items / stringBytes are
// the assumed magnitudes for unbounded collections and strings; maxBytes caps
// the estimate. Pointers so an absent key falls through to the binary default.
type sizePluginConfig struct {
	Bias        *float64 `json:"bias"`
	Items       *int     `json:"items"`
	StringBytes *int     `json:"stringBytes"`
	MaxBytes    *int     `json:"maxBytes"`
}

// validatePluginConfig is the `validate` object under the ts-runtypes plugin
// entry — project-wide defaults for the per-call-site ValidateOptions bag:
//
//	{ "numberMode": "typeof" }
//
// numberMode defaults ValidateOptions.numberMode ("isFinite" | "typeof" |
// "notNaN"); empty / absent leaves every validator on the isFinite default.
type validatePluginConfig struct {
	NumberMode string `json:"numberMode"`
}

// i18nPluginConfig is the `i18n` object under the ts-runtypes plugin entry:
//
//	{ "sourceLocale": "en", "locales": ["es", "pl"], "strict": false }
//
// sourceLocale names the language the source FriendlyText maps are authored in
// (it selects the plural arms the scaffold emits). locales is the target set —
// the source locale is NOT listed. strict turns `check --translate` findings
// into errors; the runtime is always lenient. The translation subtree location
// is convention (<genDir>/enriched/i18n/<locale>/…), never configurable.
type i18nPluginConfig struct {
	SourceLocale string   `json:"sourceLocale"`
	Locales      []string `json:"locales"`
	Strict       bool     `json:"strict"`
}

// tsconfigShape decodes ONLY the plugins slot — the ts-runtypes entry, our
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
// parses it EXACTLY ONCE (with the "source" condition, so `ts-runtypes` resolves
// to its in-tree src for the repo's own dogfood tests), returning both the path
// and the frozen config to thread into resolveEnrichConfig (genDir/rootDir) AND
// buildProgram (type resolution) — which used to parse the config twice. "" path
// + nil config means no tsconfig anywhere (the inferred-defaults fallback).
func resolveEnrichProject(tsconfigFlag string) (string, *program.InferredConfig) {
	cwd, err := os.Getwd()
	if err != nil {
		fatal("tsconfig discovery: getwd: %v", err)
	}
	tsconfigPath := resolveConfigPath(cwd, tsconfigFlag)
	parsed, err := program.ParseInferredConfig(cwd, tsconfigPath, "source")
	if err != nil {
		fatal("%v", err)
	}
	return tsconfigPath, parsed
}

// resolveEnrichConfig computes the enrichment config for a gen target file.
// genDirFlag is the --gen-dir CLI value (empty when unset) and takes precedence
// over the tsconfig `genDir` entry, which takes precedence over the default.
//
// tsconfigPath is resolveConfigPath's pick (threaded in with its already-parsed
// config) — exactly tsc's resolution: the explicit --tsconfig flag, else the
// upward walk from the process cwd. When one resolves, ProjectRoot is the
// tsconfig dir, RootDir is compilerOptions.rootDir
// as tsgo parsed it (extends-aware; defaulting to the tsconfig dir when unset),
// genDir comes from the plugins entry (defaulting to <RootDir>/__runtypes), and
// the resolved path is recorded on enrichConfig.TsconfigPath so type resolution
// reads the SAME config. With no config anywhere, ProjectRoot and RootDir both
// default to the target file's directory.
//
// Strict like tsc: a config that was named or discovered but does not parse is
// fatal — only the no-config-anywhere case falls back to defaults.
func resolveEnrichConfig(absTargetFile, genDirFlag, tsconfigPath string, parsed *program.InferredConfig) enrichConfig {
	targetDir := filepath.Dir(absTargetFile)

	config := enrichConfig{
		ProjectRoot:  targetDir,
		RootDir:      targetDir,
		SourceLocale: defaultSourceLocale,
		parsed:       parsed,
	}

	genDir := ""
	if tsconfigPath != "" {
		tsconfigDir := filepath.Dir(tsconfigPath)
		config.TsconfigPath = tsconfigPath
		config.ProjectRoot = tsconfigDir
		config.RootDir = tsconfigDir

		// TypeScript-owned values come from the ONE tsgo parse the caller
		// already did (resolveEnrichProject), threaded in — never a second
		// parse. tsgo followed `extends`, so this is exactly TypeScript's view.
		if rootDir := strings.TrimSpace(parsed.RootDir()); rootDir != "" {
			config.RootDir = resolveUnder(tsconfigDir, rootDir)
		}
		// The ts-runtypes plugin entry is OUR params riding tsconfig's
		// language-service plugin slot — tsc itself ignores it and tsgo does
		// not parse it — so it is the one thing read via the JSONC side-read,
		// of the SAME resolved file.
		pluginTsconfig, ok := parseTsconfig(tsconfigPath)
		if !ok {
			fatal("tsconfig %s: cannot parse", tsconfigPath)
		}
		if plugin, ok := findTsRuntypesPlugin(pluginTsconfig); ok {
			genDir = strings.TrimSpace(plugin.GenDir)
			config.ModuleMode = plugin.ModuleMode
			config.EmitMode = plugin.EmitMode
			config.InlineMode = plugin.InlineMode
			if plugin.I18n != nil {
				if sourceLocale := strings.TrimSpace(plugin.I18n.SourceLocale); sourceLocale != "" {
					config.SourceLocale = sourceLocale
				}
				config.I18nLocales = plugin.I18n.Locales
				config.I18nStrict = plugin.I18n.Strict
			}
		}
	}

	// genDir resolution: the --gen-dir flag wins, then tsconfig `genDir`, then
	// the convention default `__runtypes` under the source root. Everything
	// BELOW genDir is convention, never configuration: mirrors live at
	// <genDir>/enriched/<family>/... and translations at
	// <genDir>/enriched/i18n/<locale>/... (see mirrorPath / translationPathFor).
	if flagValue := strings.TrimSpace(genDirFlag); flagValue != "" {
		genDir = flagValue
	}
	if genDir != "" {
		genDir = resolveUnder(config.ProjectRoot, genDir)
	} else {
		genDir = filepath.Join(config.RootDir, defaultGenDirName)
	}
	config.EnrichDir = filepath.Join(genDir, enrichedSubdir)
	config.I18nDir = filepath.Join(config.EnrichDir, defaultI18nDirName)

	return config
}

// ensureFamilyReadme self-documents an enrichment family dir (or the i18n
// translation root) the moment it is created: every conventional dir under
// genDir carries a README explaining what it is. Write-if-absent so an edit is
// never clobbered; best-effort (a failure surfaces on the mirror write itself).
func (config enrichConfig) ensureFamilyReadme(family string) {
	texts := map[string][2]string{
		familyFriendly: {filepath.Join(config.EnrichDir, familyFriendly),
			"# FriendlyText mirrors\n\nHuman-facing labels and error messages for your types, one mirror file per\nsource file. Scaffolded and kept in sync by `ts-runtypes gen`; the values are\nyours to edit. Commit these files.\n"},
		familyMock: {filepath.Join(config.EnrichDir, familyMock),
			"# MockData mirrors\n\nRealistic sample pools and ranges for your types, one mirror file per source\nfile. Scaffolded and kept in sync by `ts-runtypes gen`; the values are yours\nto edit. Commit these files.\n"},
		defaultI18nDirName: {config.I18nDir,
			"# Translations\n\nPer-locale translations of the FriendlyText mirrors, one folder per locale.\nManaged with `ts-runtypes gen --translate`. Commit these files.\n"},
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

// mirrorPath computes one family's mirror file for a source file under this
// config: <EnrichDir>/<family>/<absSourceFile relative to RootDir>, with the
// extension forced to ".ts" (a .d.ts source maps to a plain .ts mirror, which
// holds runtime consts). When absSourceFile is not under RootDir (filepath.Rel
// escapes with ".."), it falls back to the source's base name directly under
// the family dir so the mirror never lands outside the tree.
func (config enrichConfig) mirrorPath(family, absSourceFile string) string {
	return filepath.Clean(filepath.Join(config.EnrichDir, family, config.mirrorRel(absSourceFile)))
}

// legacyMirrorPath is the pre-split COMBINED mirror location (no family
// segment) a source file used to map to. Read-only: gen consults it solely to
// migrate an old combined mirror into the per-family files (see
// migrateLegacyMirror); nothing is ever written there again.
func (config enrichConfig) legacyMirrorPath(absSourceFile string) string {
	return filepath.Clean(filepath.Join(config.EnrichDir, config.mirrorRel(absSourceFile)))
}

// mirrorRel is the source file's mirror-relative sub-path: relative to RootDir
// (base name when outside it), extension forced to ".ts".
func (config enrichConfig) mirrorRel(absSourceFile string) string {
	rel, err := filepath.Rel(config.RootDir, absSourceFile)
	if err != nil || strings.HasPrefix(rel, "..") {
		rel = filepath.Base(absSourceFile)
	}
	return forceTSExt(rel)
}

// translationPathFor computes one locale's translation file for a friendly
// source mirror: <I18nDir>/<locale>/<mirror's path relative to the friendly
// family root>. The locale is a PATH SEGMENT (never a filename infix), so
// forceTSExt never sees it and a region tag like pt-BR needs no re-parse.
func (config enrichConfig) translationPathFor(locale, friendlyMirrorPath string) string {
	friendlyRoot := filepath.Join(config.EnrichDir, familyFriendly)
	rel, err := filepath.Rel(friendlyRoot, friendlyMirrorPath)
	if err != nil || strings.HasPrefix(rel, "..") {
		rel = filepath.Base(friendlyMirrorPath)
	}
	return filepath.Clean(filepath.Join(config.I18nDir, locale, rel))
}

// forceTSExt replaces a source file's extension with ".ts", collapsing a ".d.ts"
// to ".ts" too (the mirror is always a runtime .ts file).
func forceTSExt(path string) string {
	trimmed := strings.TrimSuffix(path, ".d.ts")
	if trimmed == path {
		trimmed = strings.TrimSuffix(path, filepath.Ext(path))
	}
	return trimmed + ".ts"
}

// resolveUnder joins path under base when path is relative, else returns path
// cleaned. The result is OS-separator normalized.
func resolveUnder(base, path string) string {
	if filepath.IsAbs(path) {
		return filepath.Clean(path)
	}
	return filepath.Clean(filepath.Join(base, path))
}

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
// "name" is "ts-runtypes". Entries that fail to decode are skipped.
func findTsRuntypesPlugin(parsed tsconfigShape) (tsRuntypesPlugin, bool) {
	for _, raw := range parsed.CompilerOptions.Plugins {
		var plugin tsRuntypesPlugin
		if err := json.Unmarshal(raw, &plugin); err != nil {
			continue
		}
		if plugin.Name == "ts-runtypes" {
			return plugin, true
		}
	}
	return tsRuntypesPlugin{}, false
}

// resolveBuildPlugin reads the compilerOptions.plugins[name=ts-runtypes] entry
// from the build path's tsconfig — the same file program.New loads in the
// default (on-disk tsconfig) mode. Returns ok=false when no tsconfig resolves
// or it carries no ts-runtypes entry; the build path then runs on CLI flags +
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

// knownPluginKeys is the set of JSON keys the ts-runtypes plugin entry
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

// unknownPluginKeys returns the keys in the ts-runtypes plugin entry that the
// build path does not recognise (sorted) — almost always a typo. Empty when no
// tsconfig resolves, it is malformed, or it has no ts-runtypes entry, so a
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
		if json.Unmarshal(entry["name"], &name) != nil || name != "ts-runtypes" {
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
