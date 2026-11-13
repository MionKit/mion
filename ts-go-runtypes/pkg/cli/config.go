// config.go reads the `mion` entry of tsconfig's plugins[]: TypeScript resolves the config and tsgo parses every
// TypeScript-owned value; the JSONC reader here exists ONLY for that entry, which tsc ignores and tsgo does not
// parse.
package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/pkg/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/pkg/constants"
	"github.com/mionkit/mion/ts-go-runtypes/pkg/diagnostics"
)

// tsRuntypesPlugin is the shape of the `mion` entry under
// compilerOptions.plugins[]. It is the single canonical config surface for the
// Go compiler's project tunables; the host plugins (@mionjs/devtools) forward
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
	// convention (types/, rpc/) and NOT configurable.
	GenDir string `json:"genDir"`
	// ClientRoutes: `bundle` (the default when absent) bundles every route this client calls, `fetch` fetches every route.
	ClientRoutes string `json:"clientRoutes"`
	ModuleMode   string `json:"moduleMode"`
	EmitMode     string `json:"emitMode"`
	InlineMode   string `json:"inlineMode"`

	// Build-path project knobs, read by resolveBuildPlugin and merged in
	// buildconfig.go.
	//
	// NB: there is deliberately NO cacheDir key. The RT disk cache follows
	// TypeScript's own `incremental` / `composite` switch (on when the project
	// is incremental, off otherwise) rather than a knob of ours; the internal
	// MION_CACHE_DIR env var overrides it for tests / direct-binary power users.
	HashLength     *int  `json:"hashLength"`
	SingleThreaded *bool `json:"singleThreaded"`
	ParallelScan   *bool `json:"parallelScan"`
	ParallelRender *bool `json:"parallelRender"`
	// Pattern mockSample auto-generation: how many samples to generate per
	// sample-less pattern (0 disables) and the per-sample draw multiplier.
	// Pointers so an explicit 0 is distinct from an absent key.
	PatternSampleCount   *int `json:"patternSampleCount"`
	PatternSampleRetries *int `json:"patternSampleRetries"`
	// MaxUnknownKeys caps the unknown-key errors a strict errors fn lists per object (default 10). Internal and
	// undocumented, like singleThreaded: a pointer so an absent key keeps the default.
	MaxUnknownKeys *int `json:"maxUnknownKeys"`
	// PureFnReport is the pure-fn build report switch: `true` emits the report
	// AND writes it to the HARDCODED `<genDir>/types/pure-fns-report.json`;
	// absent (nil) / false keeps it off. A pointer so an absent key falls
	// through to the false default. There is deliberately NO path variant — like
	// every location under genDir, the report path is convention, not config.
	// Build-lane project option — the host plugin forwards the equivalent CLI flag.
	PureFnReport *bool `json:"pureFnReport"`
	// JSONMaxBytes is the type-derived size limit switch: `true` (the default
	// when absent) emits, on every fully bounded reflection root, the largest
	// compact-JSON size a valid value can have, which mion turns into per-route
	// request and response limits; `false` emits nothing and a framework falls
	// back to its own numbers. A pointer so an absent key keeps the default.
	// Build-lane project option — the host plugin forwards `--json-max-bytes=false`.
	JSONMaxBytes *bool `json:"jsonMaxBytes"`
	// DowngradeErrors lists RuntimeError codes to report as Warnings, so one finding does not block the rest, or "*" for a project that cannot name them yet.
	// A fatal Error stays fatal: the build produced no code for it, so not halting would ship a call that throws.
	// Echoed on generate (protocol.Response.DowngradeErrors) for the JS host; `mion compile` applies it to its exit code.
	// nil (absent) is the strict default.
	DowngradeErrors downgradeErrorsKey `json:"downgradeErrors"`
	// Levels: absent hides LevelInfo, "all" shows it. Echoed on generate like downgradeErrors; `mion compile` reads it too.
	Levels string `json:"levels"`
	// LogStyle: absent or "grouped" prints findings grouped by name, "lines" one line each. Echoed on generate like levels.
	LogStyle string `json:"logStyle"`
	// Validate holds project-wide ValidateOptions defaults the scanner merges per field into each site (site wins).
	// It folds into the fnHash variant, so it is NOT a disk fingerprint input; nil keeps the built-in defaults.
	Validate *validatePluginConfig `json:"validate"`
	// Markers lists the packages allowed to declare marker types, so a library need not depend on mion just for them.
	// Nil keeps the built-in gate: markers count only when @mionjs/run-types declared them.
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

// tsconfigShape decodes ONLY the plugins slot — the mion entry, our
// params. Every TypeScript-owned compilerOptions value comes from tsgo's parse.
type tsconfigShape struct {
	CompilerOptions struct {
		Plugins []json.RawMessage `json:"plugins"`
	} `json:"compilerOptions"`
}

// ResolveConfigPath is THE config-resolution policy of every CLI lane, called once per lane, exactly tsc's;
// "" means no config anywhere (inferred defaults). It resolves the PATH only, so the serve daemon reports a bad
// --tsconfig per-op (on setSources) and heals instead of crashing at startup; program.ParseInferredConfig /
// program.New fail loudly on a missing named path.
func ResolveConfigPath(absCwd, tsconfigFlag string) string {
	if trimmed := strings.TrimSpace(tsconfigFlag); trimmed != "" {
		if filepath.IsAbs(trimmed) {
			return trimmed
		}
		return filepath.Join(absCwd, trimmed)
	}
	return program.DiscoverTsconfig(absCwd)
}

// ResolveProject parses the ONE tsconfig of a command run EXACTLY ONCE, for buildProgram.
// Its module resolution conditions are adopted wholesale, so a verb resolves like a build; in-tree src opts in via
// customConditions:["source"]. "" + nil means no tsconfig anywhere.
func ResolveProject(tsconfigFlag string) (string, *program.InferredConfig) {
	cwd := projectCwd("tsconfig discovery")
	tsconfigPath := ResolveConfigPath(cwd, tsconfigFlag)
	parsed, err := program.ParseInferredConfig(cwd, tsconfigPath)
	if err != nil {
		Fatal("%v", err)
	}
	return tsconfigPath, parsed
}

// ShowInfo reads the mion plugin's `levels` key; no tsconfig or no plugin entry hides Info.
func ShowInfo(tsconfigPath string) (bool, error) {
	if tsconfigPath == "" {
		return false, nil
	}
	pluginTsconfig, ok := parseTsconfig(tsconfigPath)
	if !ok {
		return false, fmt.Errorf("tsconfig %s: cannot parse", tsconfigPath)
	}
	plugin, ok, err := findTsRuntypesPlugin(pluginTsconfig)
	if err != nil || !ok {
		return false, err
	}
	return diagnostics.ResolveLevels(plugin.Levels)
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

// downgradeErrorsKey decodes the tsconfig `downgradeErrors` value, which is
// either a list of codes or the bare wildcard string. nil means the key was
// absent. `["*"]` and `"*"` decode the same, so the tsconfig spelling and the
// plugin spelling agree.
type downgradeErrorsKey []string

func (key *downgradeErrorsKey) UnmarshalJSON(data []byte) error {
	var single string
	if err := json.Unmarshal(data, &single); err == nil {
		*key = downgradeErrorsKey{single}
		return nil
	}
	var list []string
	if err := json.Unmarshal(data, &list); err != nil {
		return fmt.Errorf("downgradeErrors must be a list of diagnostic codes or the string %q", diagnostics.DowngradeAll)
	}
	*key = list
	return nil
}

// findTsRuntypesPlugin scans compilerOptions.plugins[] for the entry whose
// "name" is "mion".
//
// An entry that names mion but does not decode is a hard error, never a skip:
// one mistyped value would otherwise throw away the WHOLE entry — genDir,
// markers, every key — and fall back to defaults with nothing said. Entries
// naming another plugin are skipped, since a language-service plugin the
// project uses for something else is none of our business.
func findTsRuntypesPlugin(parsed tsconfigShape) (tsRuntypesPlugin, bool, error) {
	raw, found := mionPluginEntry(parsed)
	if !found {
		return tsRuntypesPlugin{}, false, nil
	}
	var plugin tsRuntypesPlugin
	if err := json.Unmarshal(raw, &plugin); err != nil {
		return tsRuntypesPlugin{}, false, fmt.Errorf("tsconfig mion plugin entry: %w", err)
	}
	return plugin, true, nil
}

// mionPluginEntry is the one search for the `mion` plugins[] entry that every reader shares.
func mionPluginEntry(parsed tsconfigShape) (json.RawMessage, bool) {
	for _, raw := range parsed.CompilerOptions.Plugins {
		var named struct {
			Name string `json:"name"`
		}
		if err := json.Unmarshal(raw, &named); err == nil && named.Name == "mion" {
			return raw, true
		}
	}
	return nil, false
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
// than erroring.
func resolveBuildPlugin(absCwd, tsconfigFlag string) (tsRuntypesPlugin, bool) {
	parsed, ok := parseTsconfig(buildTsconfigPath(absCwd, tsconfigFlag))
	if !ok {
		return tsRuntypesPlugin{}, false
	}
	plugin, found, err := findTsRuntypesPlugin(parsed)
	if err != nil {
		Fatal("tsconfig %s: %v", buildTsconfigPath(absCwd, tsconfigFlag), err)
	}
	return plugin, found
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

// pluginKeyTags is derived by reflection from tsRuntypesPlugin's json tags, so it never drifts from the struct.
var pluginKeyTags = func() map[string]bool {
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

// knownPluginKey: any other key is warned about as a likely typo.
func knownPluginKey(key string) bool {
	_, registered := pluginKeyTable.Get(key)
	return pluginKeyTags[key] || registered
}

// unknownPluginKeys returns the keys in the mion plugin entry that the
// build path does not recognise (sorted) — almost always a typo. Empty when no
// tsconfig resolves, it is malformed, or it has no mion entry, so a
// project without the plugin never warns. The build path surfaces these on
// stderr; an unknown key is otherwise silently ignored.
func unknownPluginKeys(absCwd, tsconfigFlag string) []string {
	parsed, ok := parseTsconfig(buildTsconfigPath(absCwd, tsconfigFlag))
	if !ok {
		return nil
	}
	raw, found := mionPluginEntry(parsed)
	var entry map[string]json.RawMessage
	if !found || json.Unmarshal(raw, &entry) != nil {
		return nil
	}
	var unknown []string
	for key := range entry {
		if !knownPluginKey(key) {
			unknown = append(unknown, key)
		}
	}
	sort.Strings(unknown)
	return unknown
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

// resolveClientRoutes picks the flag, then the tsconfig key, then the default `bundle`; ok is false for an unknown mode.
func resolveClientRoutes(flag, key string) (constants.ClientRoutesMode, bool) {
	mode := constants.ClientRoutesMode(strings.TrimSpace(flag))
	if mode == constants.ClientRoutesUnset {
		mode = constants.ClientRoutesMode(strings.TrimSpace(key))
	}
	if !mode.Valid() {
		return mode, false
	}
	if mode == constants.ClientRoutesUnset {
		mode = constants.ClientRoutesBundle
	}
	return mode, true
}

// projectCwd is in the ONE canonical symlink space: os.Getwd prefers a valid $PWD, so it is symlink-spelled under a
// shell but kernel-resolved after a spawn with a cwd option. Canonicalizing here and in mustAbs makes RootDir and an
// absolute file argument comparable.
func projectCwd(what string) string {
	cwd, err := os.Getwd()
	if err != nil {
		Fatal("%s: getwd: %v", what, err)
	}
	return canonicalize(cwd)
}

// canonicalize: a symlink-spelled path (macOS /var/folders for /private/var/folders) shares no prefix with RootDir,
// so MirrorRel collapses it to its base name and two same-named sources share one mirror.
// Resolves the longest EXISTING prefix, so a not-yet-created leaf (an `--out` target) keeps its spelling.
func canonicalize(abs string) string {
	tail := ""
	for current := abs; ; {
		resolved, err := filepath.EvalSymlinks(current)
		if err == nil {
			return filepath.Join(resolved, tail)
		}
		parent := filepath.Dir(current)
		if parent == current {
			return abs
		}
		tail = filepath.Join(filepath.Base(current), tail)
		current = parent
	}
}
