package main

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/enrichment/mirror"
)

// TestStripJSONC verifies comment + trailing-comma stripping is string-aware.
func TestStripJSONC(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"line comment", "{\n  // hi\n  \"a\": 1\n}", "{\n  \n  \"a\": 1\n}"},
		{"block comment", "{ /* hi */ \"a\": 1 }", "{  \"a\": 1 }"},
		{"trailing comma object", "{ \"a\": 1, }", "{ \"a\": 1 }"},
		{"trailing comma array", "[ 1, 2, ]", "[ 1, 2 ]"},
		{"slash in string kept", "{ \"a\": \"http://x\" }", "{ \"a\": \"http://x\" }"},
		{"comma in string kept", "{ \"a\": \"x,\" }", "{ \"a\": \"x,\" }"},
		{"escaped quote in string", "{ \"a\": \"x\\\"//\" }", "{ \"a\": \"x\\\"//\" }"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := stripJSONC(test.in); got != test.want {
				t.Errorf("stripJSONC(%q) = %q, want %q", test.in, got, test.want)
			}
		})
	}
}

// TestResolveEnrichConfig_NoTsconfig: with no tsconfig anywhere up the tree,
// projectRoot and rootDir both fall back to the file's dir and the enrich root to the
// default (resolved under the file's dir).
func TestResolveEnrichConfig_NoTsconfig(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	target := filepath.Join(dir, "models", "user.ts")
	mustMkdirAll(t, filepath.Dir(target))

	config := resolveEnrichConfigTest(target, "")
	if config.ProjectRoot != filepath.Join(dir, "models") {
		t.Errorf("ProjectRoot = %q, want %q", config.ProjectRoot, filepath.Join(dir, "models"))
	}
	if config.RootDir != filepath.Join(dir, "models") {
		t.Errorf("RootDir = %q, want %q", config.RootDir, filepath.Join(dir, "models"))
	}
	wantEnrich := filepath.Join(dir, "models", defaultGenDirName, enrichedSubdir)
	if config.EnrichDir != wantEnrich {
		t.Errorf("EnrichDir = %q, want %q", config.EnrichDir, wantEnrich)
	}
}

// TestResolveEnrichConfig_TsconfigPlugin: the plugins[name=ts-runtypes] entry
// supplies genDir; rootDir comes from compilerOptions.rootDir; projectRoot is
// the tsconfig dir.
func TestResolveEnrichConfig_TsconfigPlugin(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	writeTestFile(t, filepath.Join(dir, "tsconfig.json"), `{
  // ts-runtypes config
  "compilerOptions": {
    "rootDir": "src",
    "plugins": [
      { "name": "other" },
      {
        "name": "ts-runtypes",
        "genDir": "rt/gen",
        "moduleMode": "allSingle",
        "emitMode": "both",
        "inlineMode": "allInternal",
      },
    ],
  },
}`)
	target := filepath.Join(dir, "src", "models", "user.ts")
	mustMkdirAll(t, filepath.Dir(target))

	config := resolveEnrichConfigTest(target, "")
	if config.ProjectRoot != dir {
		t.Errorf("ProjectRoot = %q, want %q", config.ProjectRoot, dir)
	}
	if config.RootDir != filepath.Join(dir, "src") {
		t.Errorf("RootDir = %q, want %q", config.RootDir, filepath.Join(dir, "src"))
	}
	if config.EnrichDir != filepath.Join(dir, "rt/gen", enrichedSubdir) {
		t.Errorf("EnrichDir = %q, want %q", config.EnrichDir, filepath.Join(dir, "rt/gen", enrichedSubdir))
	}
	if config.ModuleMode != "allSingle" || config.EmitMode != "both" || config.InlineMode != "allInternal" {
		t.Errorf("plugin modes not stored: %+v", config)
	}
}

// TestResolveEnrichConfig_FlagWins: --gen-dir overrides both tsconfig and
// default.
func TestResolveEnrichConfig_FlagWins(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	writeTestFile(t, filepath.Join(dir, "tsconfig.json"), `{
  "compilerOptions": { "plugins": [ { "name": "ts-runtypes", "genDir": "rt/gen" } ] }
}`)
	target := filepath.Join(dir, "user.ts")

	config := resolveEnrichConfigTest(target, "flag/dir")
	if config.EnrichDir != filepath.Join(dir, "flag/dir", enrichedSubdir) {
		t.Errorf("EnrichDir = %q, want %q (flag should win)", config.EnrichDir, filepath.Join(dir, "flag/dir", enrichedSubdir))
	}
}

// TestResolveEnrichConfig_GarbageTsconfig: an unparseable DISCOVERED tsconfig is
// fatal — strict like tsc, never a silent fall-back to defaults that could
// resolve types differently. resolveEnrichConfig calls fatal() (os.Exit), so
// the assertion runs in a re-exec'd subprocess (same pattern as
// TestUpdate_FatalOnUnparseableFile).
func TestResolveEnrichConfig_GarbageTsconfig(t *testing.T) {
	if childDir := os.Getenv("RT_CFGFAIL_DIR"); childDir != "" {
		// Discovery anchors at the process cwd (exactly tsc) — enter the
		// fixture dir so the garbage config is the one discovered.
		if err := os.Chdir(childDir); err != nil {
			return
		}
		// The discover + tsgo parse now lives in resolveEnrichProject — the
		// garbage discovered tsconfig makes ParseInferredConfig fatal there.
		resolveEnrichProject("")
		return // unreachable if fatal fired
	}

	dir := t.TempDir()
	writeTestFile(t, filepath.Join(dir, "tsconfig.json"), `this is not json at all {{{`)

	cmd := exec.Command(os.Args[0], "-test.run=TestResolveEnrichConfig_GarbageTsconfig")
	cmd.Env = append(os.Environ(), "RT_CFGFAIL_DIR="+dir)
	output, err := cmd.CombinedOutput()
	var exitErr *exec.ExitError
	if !errors.As(err, &exitErr) {
		t.Fatalf("garbage tsconfig must be fatal; got err=%v, output:\n%s", err, output)
	}
	if !strings.Contains(string(output), "tsconfig parse failed") {
		t.Errorf("fatal output should carry tsgo's parse diagnostic; got:\n%s", output)
	}
}

// TestMirrorPath verifies the per-family mirror path math, including the
// family path segment, the .d.ts → .ts collapse, and the under-rootDir
// relativization — plus the legacy (pre-split, no-family) path the migration
// reads.
func TestMirrorPath(t *testing.T) {
	config := enrichConfig{
		ProjectRoot: "/proj",
		RootDir:     "/proj/src",
		EnrichDir:   "/proj/runtypes/generated",
	}
	tests := []struct {
		name   string
		family string
		src    string
		want   string
	}{
		{"friendly under root", familyFriendly, "/proj/src/models/user.ts", "/proj/runtypes/generated/friendly/models/user.ts"},
		{"mock under root", familyMock, "/proj/src/models/user.ts", "/proj/runtypes/generated/mock/models/user.ts"},
		{"d.ts collapses to ts", familyFriendly, "/proj/src/types/api.d.ts", "/proj/runtypes/generated/friendly/types/api.ts"},
		{"top-level file", familyMock, "/proj/src/index.ts", "/proj/runtypes/generated/mock/index.ts"},
		{"outside root falls back to base", familyFriendly, "/elsewhere/foo.ts", "/proj/runtypes/generated/friendly/foo.ts"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := config.mirrorPath(test.family, test.src); got != test.want {
				t.Errorf("mirrorPath(%q, %q) = %q, want %q", test.family, test.src, got, test.want)
			}
		})
	}

	if got, want := config.legacyMirrorPath("/proj/src/models/user.ts"), "/proj/runtypes/generated/models/user.ts"; got != want {
		t.Errorf("legacyMirrorPath = %q, want %q", got, want)
	}
}

// TestTranslationPathFor: the locale is a path segment under the i18n dir,
// mirroring the friendly family subtree — region tags (pt-BR) ride verbatim.
func TestTranslationPathFor(t *testing.T) {
	config := enrichConfig{
		ProjectRoot: "/proj",
		RootDir:     "/proj/src",
		EnrichDir:   "/proj/runtypes/generated",
		I18nDir:     "/proj/runtypes/generated/i18n",
	}
	tests := []struct {
		name   string
		locale string
		mirror string
		want   string
	}{
		{"plain locale", "pl", "/proj/runtypes/generated/friendly/models/user.ts", "/proj/runtypes/generated/i18n/pl/models/user.ts"},
		{"region tag", "pt-BR", "/proj/runtypes/generated/friendly/models/user.ts", "/proj/runtypes/generated/i18n/pt-BR/models/user.ts"},
		{"top-level mirror", "es", "/proj/runtypes/generated/friendly/index.ts", "/proj/runtypes/generated/i18n/es/index.ts"},
		{"outside friendly root falls back to base", "es", "/elsewhere/user.ts", "/proj/runtypes/generated/i18n/es/user.ts"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := config.translationPathFor(test.locale, test.mirror); got != test.want {
				t.Errorf("translationPathFor(%q, %q) = %q, want %q", test.locale, test.mirror, got, test.want)
			}
		})
	}
}

// TestResolveEnrichConfig_I18n: the tsconfig plugin i18n object populates the
// config; defaults stay dormant without it.
func TestResolveEnrichConfig_I18n(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	writeTestFile(t, filepath.Join(dir, "tsconfig.json"), `{
  "compilerOptions": {
    "rootDir": "src",
    "plugins": [{
      "name": "ts-runtypes",
      "genDir": "rt",
      "i18n": {
        "sourceLocale": "pl",
        "locales": ["es", "pt-BR"],
        "strict": true
      }
    }]
  }
}`)
	target := filepath.Join(dir, "src", "user.ts")

	config := resolveEnrichConfigTest(target, "")
	if config.SourceLocale != "pl" {
		t.Errorf("SourceLocale = %q, want pl", config.SourceLocale)
	}
	if want := filepath.Join(dir, "rt", enrichedSubdir, "i18n"); config.I18nDir != want {
		t.Errorf("I18nDir = %q, want default %q", config.I18nDir, want)
	}
	if len(config.I18nLocales) != 2 || config.I18nLocales[0] != "es" || config.I18nLocales[1] != "pt-BR" {
		t.Errorf("I18nLocales = %v", config.I18nLocales)
	}
	if !config.I18nStrict {
		t.Errorf("I18nStrict = false, want true")
	}

	// No i18n object → dormant defaults.
	writeTestFile(t, filepath.Join(dir, "tsconfig.json"),
		`{ "compilerOptions": { "plugins": [{ "name": "ts-runtypes" }] } }`)
	dormant := resolveEnrichConfigTest(target, "")
	if dormant.SourceLocale != "en" || len(dormant.I18nLocales) != 0 || dormant.I18nStrict {
		t.Errorf("dormant i18n defaults wrong: %+v", dormant)
	}
	if want := filepath.Join(dir, defaultGenDirName, enrichedSubdir, "i18n"); dormant.I18nDir != want {
		t.Errorf("dormant I18nDir = %q, want %q", dormant.I18nDir, want)
	}

	// The i18n location is CONVENTION: a legacy `i18n.dir` key is ignored and
	// translations stay at <genDir>/enriched/i18n.
	writeTestFile(t, filepath.Join(dir, "tsconfig.json"),
		`{ "compilerOptions": { "plugins": [{ "name": "ts-runtypes", "i18n": { "dir": "translations" } }] } }`)
	custom := resolveEnrichConfigTest(target, "")
	if want := filepath.Join(dir, defaultGenDirName, enrichedSubdir, "i18n"); custom.I18nDir != want {
		t.Errorf("legacy i18n.dir must be ignored; I18nDir = %q, want %q", custom.I18nDir, want)
	}
}

// TestMirrorFamilyOf reads a mirror file's family off its path segment under
// the enrich root; a legacy combined location (or a file outside the root) has
// no family.
func TestMirrorFamilyOf(t *testing.T) {
	enrichDir := "/proj/runtypes/generated"
	tests := []struct {
		name   string
		path   string
		family string
		ok     bool
	}{
		{"friendly file", "/proj/runtypes/generated/friendly/models/user.ts", familyFriendly, true},
		{"mock file", "/proj/runtypes/generated/mock/user.ts", familyMock, true},
		{"legacy combined", "/proj/runtypes/generated/models/user.ts", "", false},
		{"outside root", "/elsewhere/user.ts", "", false},
		{"friendly-named leaf at root", "/proj/runtypes/generated/friendly.ts", "", false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			family, ok := mirrorFamilyOf(enrichDir, test.path)
			if family != test.family || ok != test.ok {
				t.Errorf("mirrorFamilyOf(%q) = (%q, %v), want (%q, %v)", test.path, family, ok, test.family, test.ok)
			}
		})
	}
}

// TestImportSpecifier verifies relative module specifier computation: forward
// slashes, leading ./, stripped extension.
func TestImportSpecifier(t *testing.T) {
	tests := []struct {
		name   string
		from   string
		target string
		want   string
	}{
		{"sibling", "/a/b/mirror.ts", "/a/b/other.ts", "./other"},
		{"up two then source", "/proj/rt/gen/models/user.ts", "/proj/src/models/user.ts", "../../../src/models/user"},
		{"d.ts target stripped", "/a/b/mirror.ts", "/a/c/api.d.ts", "../c/api"},
		{"same dir mirror to mirror", "/rt/models/user.ts", "/rt/models/address.ts", "./address"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := mirror.ImportSpecifier(test.from, test.target); got != test.want {
				t.Errorf("ImportSpecifier(%q, %q) = %q, want %q", test.from, test.target, got, test.want)
			}
		})
	}
}

// resolveEnrichConfigTest resolves + parses the tsconfig from the (t.Chdir'd)
// cwd and builds the enrich config, mirroring what an enrich verb does — the
// test twin of resolveEnrichProject followed by resolveEnrichConfig, so the
// config is parsed exactly once.
func resolveEnrichConfigTest(target, genDirFlag string) enrichConfig {
	tsconfigPath, parsed := resolveEnrichProject("")
	return resolveEnrichConfig(target, genDirFlag, tsconfigPath, parsed)
}

func writeTestFile(t *testing.T, path, content string) {
	t.Helper()
	mustMkdirAll(t, filepath.Dir(path))
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func mustMkdirAll(t *testing.T, dir string) {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", dir, err)
	}
}
