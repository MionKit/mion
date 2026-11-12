// enrich_config.go is the enrich-only half of the tsconfig plugin reader: the enrichgen aliases, the `i18n`
// key, and the per-target enrichment config resolution.
package cli

import (
	"os"
	"path/filepath"

	"github.com/mionkit/mion/ts-go-runtypes/pkg/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/pkg/enrichment/enrichgen"
)

// The enrichment layout constants, the enrichConfig type, its path helpers, and
// the pure scaffold planner now live in the shared pkg/enrichment/enrichgen
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

// i18nPluginConfig is the plugin's `i18n` object, e.g. { "sourceLocale": "en", "locales": ["es", "pl"], "strict": false }.
// sourceLocale picks the scaffold's plural arms and is never in locales; strict fails `enrich --i18n --no-emit` findings.
// The runtime is always lenient, and <genDir>/enriched/i18n/<locale>/ is convention, never configurable.
type i18nPluginConfig struct {
	SourceLocale string   `json:"sourceLocale"`
	Locales      []string `json:"locales"`
	Strict       bool     `json:"strict"`
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
			Fatal("tsconfig %s: cannot parse", tsconfigPath)
		}
		plugin, ok, err := findTsRuntypesPlugin(pluginTsconfig)
		if err != nil {
			Fatal("tsconfig %s: %v", tsconfigPath, err)
		}
		if ok {
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
			"# Translations\n\nPer-locale translations of the FriendlyText mirrors, one folder per locale.\nManaged with `mion enrich --i18n <locale>`. Commit these files.\n"},
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

// pluginI18nSourceLocale / pluginI18nLocales project the tsconfig plugin's i18n
// block onto the resolver Options defaults (project serve mode); the serve
// --enrich-locales / --enrich-source-locale flags override them.
func pluginI18nSourceLocale(plugin tsRuntypesPlugin) string {
	if plugin.I18n == nil {
		return ""
	}
	return plugin.I18n.SourceLocale
}

func pluginI18nLocales(plugin tsRuntypesPlugin) []string {
	if plugin.I18n == nil {
		return nil
	}
	return plugin.I18n.Locales
}
