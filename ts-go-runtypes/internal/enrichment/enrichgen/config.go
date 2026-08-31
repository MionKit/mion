// Package enrichgen holds the disk-free core of the enrichment scaffold /
// reconcile lane: enrichment-config resolution, the mirror-path layout, and the
// pure spec planner. It is shared by the CLI `enrich` verb (cmd/mion) and
// the `OpEnrich` daemon op (internal/compiler/resolver) so the two compute
// byte-identical mirror files — the CLI writes them, the daemon returns their
// content. Nothing here touches the filesystem: existing content and sibling
// sources are injected by the caller (CLI reads disk, daemon reads the Program
// FS), which is what keeps CLI ≡ daemon parity honest.
package enrichgen

import (
	"path/filepath"
	"strings"

	"github.com/mionkit/ts-runtypes/internal/compiler/program"
)

// DefaultGenDirName is the conventional RunTypes output root when neither a
// --gen-dir flag nor a tsconfig `genDir` supplies one: `__runtypes` under the
// project's source root. EVERYTHING under genDir is convention, never
// configuration: `types/` (regenerated, gitignored), `enriched/friendly/`,
// `enriched/mock/`, `enriched/i18n/<locale>/` (committed).
const DefaultGenDirName = "__runtypes"

// EnrichedSubdir is the committed half of genDir — the enrichment mirrors live
// at <genDir>/enriched/<family>/... by convention.
const EnrichedSubdir = "enriched"

// Family path segments under the enrich root. Each enrichment family owns its
// own mirror subtree (<EnrichDir>/<family>/<rel>), so one source file maps to
// one mirror file PER FAMILY: friendly/models/user.ts holds friendlyUser,
// mock/models/user.ts holds mockUser. The segment lives in the PATH (never a
// filename infix) so forceTSExt stays family-blind.
const (
	FamilyFriendly = "friendly"
	FamilyMock     = "mock"
)

// DefaultI18nDirName is the translation subtree's dir name under the enrich root
// (a PARALLEL sibling of the friendly/ + mock/ family subtrees); each locale
// owns a path segment under it: <EnrichDir>/i18n/<locale>/<rel>.
const DefaultI18nDirName = "i18n"

// DefaultSourceLocale is the language source FriendlyText maps are assumed to be
// authored in when tsconfig `i18n.sourceLocale` is absent.
const DefaultSourceLocale = "en"

// Config is the resolved enrichment configuration for an enrich target. It is
// the merge of (in precedence order) the --gen-dir CLI flag and the tsconfig
// `compilerOptions.plugins[name=mion]` `genDir` entry, then the built-in
// default; EnrichDir is derived as <genDir>/enriched (convention, not config).
//
// Paths are absolute and normalized to OS separators. EnrichDir is the absolute
// mirror root; RootDir is the absolute source root the mirror tree shadows;
// ProjectRoot is the directory the mirror root is resolved under (the tsconfig
// dir, or the target file's dir when no tsconfig is found).
type Config struct {
	ProjectRoot string
	RootDir     string
	EnrichDir   string
	// TsconfigPath is the ONE resolved tsconfig this run reads — explicit
	// --tsconfig, else the tsc-style upward walk, else "" (no config anywhere).
	TsconfigPath string

	// Parsed is the ONE tsgo InferredConfig this run resolved, carried so the
	// caller reuses it instead of re-parsing. Nil when no tsconfig resolved.
	Parsed *program.InferredConfig

	// i18n knobs (the tsconfig plugin `i18n` object). Defaults are dormant:
	// SourceLocale 'en', I18nDir <EnrichDir>/i18n, no locales, lenient check.
	SourceLocale string
	I18nDir      string
	I18nLocales  []string
	I18nStrict   bool

	// HashLength is the project's short-id length for type hashes (tsconfig plugin
	// `hashLength`, 0 = the binary default 7). It rides into the enrich lane's
	// resolver.Options so enrich's hash-sensitive @rtType ids match a build's — the
	// same value the serve / compile lanes fold into every typeID.
	HashLength int

	// The remaining plugin options are stored for completeness but not acted on
	// by the scaffold planner yet.
	ModuleMode string
	EmitMode   string
	InlineMode string
}

// PluginSettings carries the mion plugin values the caller already read
// — the CLI via its JSONC side-read of the tsconfig, the daemon from its session
// options. ResolveConfig folds them into the Config so this package needs no
// tsconfig parser of its own (and never touches disk).
type PluginSettings struct {
	GenDir     string
	HashLength int
	ModuleMode string
	EmitMode   string
	InlineMode string
	I18n       *I18nSettings
}

// I18nSettings is the resolved `i18n` plugin object (sourceLocale / locales /
// strict), mirroring the tsconfig shape.
type I18nSettings struct {
	SourceLocale string
	Locales      []string
	Strict       bool
}

// ResolveConfig computes the enrichment Config for a target file. genDirFlag is
// the --gen-dir CLI value (empty when unset) and takes precedence over the
// tsconfig `genDir` (carried on plugin), which takes precedence over the default.
//
// When tsconfigPath resolves, ProjectRoot is the tsconfig dir, RootDir is
// compilerOptions.rootDir as tsgo parsed it (extends-aware; defaulting to the
// tsconfig dir when unset), genDir comes from the plugin entry (defaulting to
// <RootDir>/__runtypes). With no config anywhere, ProjectRoot and RootDir both
// default to the target file's directory. Pure: no disk I/O, no fatal.
func ResolveConfig(absTargetFile, genDirFlag, tsconfigPath string, parsed *program.InferredConfig, plugin PluginSettings) Config {
	targetDir := filepath.Dir(absTargetFile)

	config := Config{
		ProjectRoot:  targetDir,
		RootDir:      targetDir,
		SourceLocale: DefaultSourceLocale,
		Parsed:       parsed,
	}

	genDir := ""
	if tsconfigPath != "" {
		tsconfigDir := filepath.Dir(tsconfigPath)
		config.TsconfigPath = tsconfigPath
		config.ProjectRoot = tsconfigDir
		config.RootDir = tsconfigDir

		// TypeScript-owned values come from the ONE tsgo parse the caller already
		// did, threaded in — never a second parse. tsgo followed `extends`, so
		// this is exactly TypeScript's view.
		if parsed != nil {
			if rootDir := strings.TrimSpace(parsed.RootDir()); rootDir != "" {
				config.RootDir = resolveUnder(tsconfigDir, rootDir)
			}
		}

		// The mion plugin entry is OUR params; the caller already read it
		// off the SAME resolved file and handed us the values.
		genDir = strings.TrimSpace(plugin.GenDir)
		config.HashLength = plugin.HashLength
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

	// genDir resolution: the --gen-dir flag wins, then tsconfig `genDir`, then the
	// convention default `__runtypes` under the source root. Everything BELOW
	// genDir is convention, never configuration: mirrors live at
	// <genDir>/enriched/<family>/... and translations at
	// <genDir>/enriched/i18n/<locale>/... (see MirrorPath / TranslationPathFor).
	if flagValue := strings.TrimSpace(genDirFlag); flagValue != "" {
		genDir = flagValue
	}
	if genDir != "" {
		genDir = resolveUnder(config.ProjectRoot, genDir)
	} else {
		genDir = filepath.Join(config.RootDir, DefaultGenDirName)
	}
	config.EnrichDir = filepath.Join(genDir, EnrichedSubdir)
	config.I18nDir = filepath.Join(config.EnrichDir, DefaultI18nDirName)

	return config
}

// GenDir returns the RunTypes output root (the parent of EnrichDir) — the
// <genDir> the caller's types/ + enriched/ trees hang off.
func (config Config) GenDir() string {
	return filepath.Dir(config.EnrichDir)
}

// MirrorPath computes one family's mirror file for a source file under this
// config: <EnrichDir>/<family>/<absSourceFile relative to RootDir>, extension
// forced to ".ts". When absSourceFile is not under RootDir it falls back to the
// source's base name directly under the family dir so the mirror never lands
// outside the tree.
func (config Config) MirrorPath(family, absSourceFile string) string {
	return filepath.Clean(filepath.Join(config.EnrichDir, family, config.MirrorRel(absSourceFile)))
}

// LegacyMirrorPath is the pre-split COMBINED mirror location (no family segment)
// a source file used to map to. Read-only: consulted solely to migrate an old
// combined mirror into the per-family files; nothing is ever written there again.
func (config Config) LegacyMirrorPath(absSourceFile string) string {
	return filepath.Clean(filepath.Join(config.EnrichDir, config.MirrorRel(absSourceFile)))
}

// MirrorRel is the source file's mirror-relative sub-path: relative to RootDir
// (base name when outside it), extension forced to ".ts".
func (config Config) MirrorRel(absSourceFile string) string {
	rel, err := filepath.Rel(config.RootDir, absSourceFile)
	if err != nil || strings.HasPrefix(rel, "..") {
		rel = filepath.Base(absSourceFile)
	}
	return forceTSExt(rel)
}

// TranslationPathFor computes one locale's translation file for a friendly
// source mirror: <I18nDir>/<locale>/<mirror's path relative to the friendly
// family root>. The locale is a PATH SEGMENT (never a filename infix), so
// forceTSExt never sees it and a region tag like pt-BR needs no re-parse.
func (config Config) TranslationPathFor(locale, friendlyMirrorPath string) string {
	friendlyRoot := filepath.Join(config.EnrichDir, FamilyFriendly)
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
