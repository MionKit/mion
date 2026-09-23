// Package enrichgen is the disk-free core of the enrichment lane: config resolution, mirror paths, spec planner.
// The CLI `enrich` verb and the `OpEnrich` daemon op both call it, so they cannot drift; the daemon never writes.
// The caller injects existing content and sibling sources, which is what keeps that parity honest.
package enrichgen

import (
	"path/filepath"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
)

// DefaultGenDirName is the output root when neither --gen-dir nor a tsconfig `genDir` supplies one.
// Everything under genDir is convention, never configuration: `types/` regenerated and gitignored, `enriched/` committed.
const DefaultGenDirName = ".mion"

// EnrichedSubdir is the committed half of genDir: mirrors live at <genDir>/enriched/<family>/... by convention.
const EnrichedSubdir = "enriched"

// FamilyFriendly / FamilyMock own one mirror subtree each, so a source file maps to one mirror file PER family.
// The family is a PATH segment, never a filename infix, so forceTSExt stays family-blind.
const (
	FamilyFriendly = "friendly"
	FamilyMock     = "mock"
)

// DefaultI18nDirName is the translation subtree beside the family subtrees, one path segment per locale.
const DefaultI18nDirName = "i18n"

// DefaultSourceLocale is the language source FriendlyText maps are assumed to be authored in.
const DefaultSourceLocale = "en"

// Config is the resolved enrichment configuration: --gen-dir wins over the tsconfig `genDir`, then the built-in default.
// EnrichDir is derived as <genDir>/enriched, convention not config; RootDir is the source root the mirror tree shadows.
// Every path is absolute and normalized to OS separators.
type Config struct {
	ProjectRoot string
	RootDir     string
	EnrichDir   string
	// TsconfigPath is the ONE tsconfig this run reads: explicit --tsconfig, else the tsc-style upward walk, else "".
	TsconfigPath string

	// Parsed is the ONE tsgo InferredConfig this run resolved, carried so the caller need not re-parse; nil when none.
	Parsed *program.InferredConfig

	// i18n knobs; the defaults are dormant: SourceLocale 'en', I18nDir <EnrichDir>/i18n, no locales, lenient check.
	SourceLocale string
	I18nDir      string
	I18nLocales  []string
	I18nStrict   bool

	// HashLength is the project's short-id length for type hashes, 0 meaning the binary default 7.
	// It reaches the enrich lane's resolver.Options so enrich's @rtType ids match the ones a build folds into every typeID.
	HashLength int

	// Carried for the caller; the scaffold planner does not read these.
	ModuleMode string
	EmitMode   string
	InlineMode string
}

// PluginSettings carries the mion plugin values the caller already read, so this package needs no tsconfig parser of its own.
type PluginSettings struct {
	GenDir     string
	HashLength int
	ModuleMode string
	EmitMode   string
	InlineMode string
	I18n       *I18nSettings
}

// I18nSettings is the resolved `i18n` plugin object, mirroring the tsconfig shape.
type I18nSettings struct {
	SourceLocale string
	Locales      []string
	Strict       bool
}

// ResolveConfig computes the Config for a target file; genDirFlag, the --gen-dir value, wins over the tsconfig `genDir`.
// With a tsconfig, ProjectRoot is its dir and RootDir is tsgo's parsed rootDir; with none, both are the target's dir.
// The default genDir is <srcDir>/.mion, srcDir inferred by program.InferSrcDir exactly as the resolver does.
// Pure: no disk I/O, no fatal.
func ResolveConfig(absTargetFile, genDirFlag, tsconfigPath string, parsed *program.InferredConfig, plugin PluginSettings) Config {
	targetDir := filepath.Dir(absTargetFile)

	config := Config{
		ProjectRoot:  targetDir,
		RootDir:      targetDir,
		SourceLocale: DefaultSourceLocale,
		Parsed:       parsed,
	}

	genDir := ""
	defaultGenDirBase := targetDir
	if tsconfigPath != "" {
		tsconfigDir := filepath.Dir(tsconfigPath)
		config.TsconfigPath = tsconfigPath
		config.ProjectRoot = tsconfigDir
		config.RootDir = tsconfigDir
		// The resolver's own inference, so the CLI writes mirrors where the bundler plugin reads them.
		defaultGenDirBase = parsed.SrcDir(tsconfigDir)

		// From the ONE tsgo parse the caller already did, never a second one; tsgo followed `extends`, so this is TypeScript's view.
		if parsed != nil {
			if rootDir := strings.TrimSpace(parsed.RootDir()); rootDir != "" {
				config.RootDir = resolveUnder(tsconfigDir, rootDir)
			}
		}

		// The plugin entry is OUR params, read by the caller off the SAME resolved file.
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

	// Everything BELOW genDir is convention, never configuration (see MirrorPath / TranslationPathFor).
	if flagValue := strings.TrimSpace(genDirFlag); flagValue != "" {
		genDir = flagValue
	}
	if genDir != "" {
		genDir = resolveUnder(config.ProjectRoot, genDir)
	} else {
		genDir = filepath.Join(defaultGenDirBase, DefaultGenDirName)
	}
	config.EnrichDir = filepath.Join(genDir, EnrichedSubdir)
	config.I18nDir = filepath.Join(config.EnrichDir, DefaultI18nDirName)

	return config
}

// GenDir returns the RunTypes output root, the parent of EnrichDir, that the types/ and enriched/ trees hang off.
func (config Config) GenDir() string {
	return filepath.Dir(config.EnrichDir)
}

// MirrorPath is <EnrichDir>/<family>/<absSourceFile relative to RootDir>, extension forced to ".ts".
// A source outside RootDir falls back to its base name, so the mirror never lands outside the tree.
func (config Config) MirrorPath(family, absSourceFile string) string {
	return filepath.Clean(filepath.Join(config.EnrichDir, family, config.MirrorRel(absSourceFile)))
}

// LegacyMirrorPath is the pre-split COMBINED mirror location, read only: it is migrated from, never written to again.
func (config Config) LegacyMirrorPath(absSourceFile string) string {
	return filepath.Clean(filepath.Join(config.EnrichDir, config.MirrorRel(absSourceFile)))
}

// MirrorRel is the source path relative to RootDir, its base name when outside it, extension forced to ".ts".
func (config Config) MirrorRel(absSourceFile string) string {
	rel, err := filepath.Rel(config.RootDir, absSourceFile)
	if err != nil || strings.HasPrefix(rel, "..") {
		rel = filepath.Base(absSourceFile)
	}
	return forceTSExt(rel)
}

// TranslationPathFor is <I18nDir>/<locale>/<friendlyMirrorPath relative to the friendly family root>.
// The locale is a PATH segment, never a filename infix, so a region tag like pt-BR needs no re-parse.
func (config Config) TranslationPathFor(locale, friendlyMirrorPath string) string {
	friendlyRoot := filepath.Join(config.EnrichDir, FamilyFriendly)
	rel, err := filepath.Rel(friendlyRoot, friendlyMirrorPath)
	if err != nil || strings.HasPrefix(rel, "..") {
		rel = filepath.Base(friendlyMirrorPath)
	}
	return filepath.Clean(filepath.Join(config.I18nDir, locale, rel))
}

// forceTSExt replaces the extension with ".ts", a ".d.ts" included: the mirror is always a runtime .ts file.
func forceTSExt(path string) string {
	trimmed := strings.TrimSuffix(path, ".d.ts")
	if trimmed == path {
		trimmed = strings.TrimSuffix(path, filepath.Ext(path))
	}
	return trimmed + ".ts"
}

// resolveUnder joins a relative path under base, cleaned and OS-separator normalized.
func resolveUnder(base, path string) string {
	if filepath.IsAbs(path) {
		return filepath.Clean(path)
	}
	return filepath.Clean(filepath.Join(base, path))
}
