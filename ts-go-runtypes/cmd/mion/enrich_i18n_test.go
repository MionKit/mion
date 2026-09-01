package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment"
	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment/enrichgen"
	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment/mirror"
)

// These are focused unit tests of the translate driver's PURE helpers — target
// discovery, locale expansion, the closure→spec transformation, and the
// completeness findings. cmd tests build no checker Program (no precedent in
// this package), so the Program-driven pipeline (buildTranslationSpecs's
// resolve + EmitClosure arc, `gen --translate` end to end) is covered by the
// JS e2e suite: packages/run-types/test/suites/enrich/enrichTranslate.test.ts
// (rewritten src-derived in a later phase).

// translateFixture lays down a project with a src type + a friendly source
// mirror (the translate verbs' DISCOVERY input) and returns its config, the
// src path, and the mirror path.
func translateFixture(t *testing.T, strict bool) (enrichConfig, string, string) {
	t.Helper()
	dir := canonicalTempDir(t)
	t.Chdir(dir)
	strictJSON := "false"
	if strict {
		strictJSON = "true"
	}
	writeTestFile(t, filepath.Join(dir, "tsconfig.json"),
		`{ "compilerOptions": { "rootDir": "src", "plugins": [{ "name": "mion",
      "i18n": { "sourceLocale": "en", "locales": ["pl", "es"], "strict": `+strictJSON+` } }] } }`)
	source := filepath.Join(dir, "src", "models.ts")
	writeTestFile(t, source, "export interface User { name: string }\n")
	sourceMirror := filepath.Join(dir, "src", "__runtypes", "enriched", "friendly", "models.ts")
	writeTestFile(t, sourceMirror,
		"import type { User } from '../../../models';\n"+
			"import type { FriendlyText } from '@mionjs/run-types';\n\n"+
			"/** @rtType User#u1 @rtIds {name: n1} */\n"+
			"export const friendlyUser: FriendlyText<User> = {\n"+
			"  rt$label: 'User',\n"+
			"  name: {rt$label: 'Full name'},\n"+
			"};\n\n"+
			"export const pl_friendlyUser: FriendlyText<User> = {rt$label: ''};\n\n"+
			"export const friendlyHelper = {rt$label: ''};\n")
	return resolveEnrichConfigTest(source, ""), source, sourceMirror
}

// TestTranslateTargets_PositionalMapsToFriendlyMirror pins the target path
// math: a positional src resolves to its friendly-family mirror.
func TestTranslateTargets_PositionalMapsToFriendlyMirror(t *testing.T) {
	config, source, sourceMirror := translateFixture(t, false)

	tsconfigPath, parsed := resolveEnrichProject("")
	gotConfig, targets := translateTargets([]string{source}, "", tsconfigPath, parsed)
	if gotConfig.EnrichDir != config.EnrichDir {
		t.Errorf("EnrichDir = %q, want %q", gotConfig.EnrichDir, config.EnrichDir)
	}
	if len(targets) != 1 || targets[0] != tspath.NormalizePath(sourceMirror) {
		t.Errorf("targets = %v, want [%s]", targets, tspath.NormalizePath(sourceMirror))
	}
}

// TestResolveTranslateLocales expands a concrete tag as-is and fans `all` out
// over the tsconfig i18n.locales entries.
func TestResolveTranslateLocales(t *testing.T) {
	config, _, _ := translateFixture(t, false)

	if locales := resolveTranslateLocales("pt-BR", config); len(locales) != 1 || locales[0] != "pt-BR" {
		t.Errorf("concrete tag: %v", locales)
	}
	if locales := resolveTranslateLocales("all", config); len(locales) != 2 || locales[0] != "pl" || locales[1] != "es" {
		t.Errorf("all: %v", locales)
	}
}

// TestDiscoverTranslationTypes reads a friendly mirror for DISCOVERY only: the
// breadcrumb resolves the src decl file; friendly consts contribute their
// annotation type names; translation-named and annotation-less consts are
// skipped.
func TestDiscoverTranslationTypes(t *testing.T) {
	_, source, sourceMirror := translateFixture(t, false)

	discovery, ok := discoverTranslationTypes(sourceMirror)
	if !ok {
		t.Fatalf("discoverTranslationTypes failed")
	}
	if discovery.declFile != tspath.NormalizePath(source) {
		t.Errorf("declFile = %q, want %q", discovery.declFile, tspath.NormalizePath(source))
	}
	if len(discovery.typeNames) != 1 || discovery.typeNames[0] != "User" {
		t.Errorf("typeNames = %v, want [User] (translation var + annotation-less const skipped)", discovery.typeNames)
	}

	// A missing mirror is a skip, not a fatal.
	if _, ok := discoverTranslationTypes(filepath.Join(t.TempDir(), "absent.ts")); ok {
		t.Errorf("a missing mirror must not discover anything")
	}
}

// TestTranslationSpecs_TransformAndGrouping drives the pure closure→spec
// transformation: locale-prefixed vars, sibling references renamed inside
// EVERY body, decl-file grouping, and locale-sibling pathing for cross-file
// imports.
func TestTranslationSpecs_TransformAndGrouping(t *testing.T) {
	config, source, _ := translateFixture(t, false)
	geoSource := filepath.Join(filepath.Dir(source), "geo.ts")

	closure := []enrichment.NamedConst{
		{TypeName: "Address", DeclFile: geoSource, FriendlyVar: "friendlyAddress", MockVar: "mockAddress",
			Friendly: "{rt$label: ''}", Mock: "{}", TypeID: "a1"},
		{TypeName: "User", DeclFile: source, FriendlyVar: "friendlyUser", MockVar: "mockUser",
			Friendly: "{rt$label: '', home: friendlyAddress}", Mock: "{}", TypeID: "u1",
			ChildIDs: map[string]string{"home": "a1"}},
	}
	specs := enrichgen.TranslationSpecs(config, "pl", closure, source)
	if len(specs) != 2 {
		t.Fatalf("want one spec per decl-file group; got %d: %+v", len(specs), specs)
	}

	geoSpec, userSpec := specs[0], specs[1]
	wantGeoPath := config.TranslationPathFor("pl", config.MirrorPath(familyFriendly, geoSource))
	if geoSpec.MirrorPath != wantGeoPath || geoSpec.SourceFile != geoSource {
		t.Errorf("geo spec = %q / %q, want %q / %q", geoSpec.MirrorPath, geoSpec.SourceFile, wantGeoPath, geoSource)
	}
	if len(geoSpec.Consts) != 1 || geoSpec.Consts[0].FriendlyVar != "pl_friendlyAddress" {
		t.Errorf("geo consts = %+v", geoSpec.Consts)
	}
	if !geoSpec.WantFriendly || geoSpec.WantMock {
		t.Errorf("a translation spec is friendly-only: %+v", geoSpec)
	}
	if len(userSpec.Consts) != 1 || userSpec.Consts[0].FriendlyVar != "pl_friendlyUser" {
		t.Fatalf("user consts = %+v", userSpec.Consts)
	}
	// The sibling reference inside the body renamed to its locale twin; the
	// mock half rides along untouched.
	if got := userSpec.Consts[0].Friendly; got != "{rt$label: '', home: pl_friendlyAddress}" {
		t.Errorf("sibling reference not renamed: %q", got)
	}
	if userSpec.Consts[0].MockVar != "mockUser" || userSpec.Consts[0].Mock != "{}" {
		t.Errorf("mock half must ride along untouched: %+v", userSpec.Consts[0])
	}
	// Cross-file value imports resolve to LOCALE SIBLINGS.
	if userSpec.VarDeclFile["pl_friendlyAddress"] != geoSource {
		t.Errorf("VarDeclFile = %v", userSpec.VarDeclFile)
	}
	if got := userSpec.MirrorPathFor(geoSource); got != wantGeoPath {
		t.Errorf("MirrorPathFor(geo) = %q, want %q", got, wantGeoPath)
	}
}

// stubTranslationSpec hand-builds the src-derived desired side for the fixture
// (what buildTranslationSpecs emits for locale pl) so the findings tests need
// no Program.
func stubTranslationSpec(source, translationPath, friendlyBody string) mirror.Spec {
	return mirror.Spec{
		MirrorPath:   translationPath,
		SourceFile:   source,
		WantFriendly: true,
		WantMock:     false,
		VarDeclFile:  map[string]string{"pl_friendlyUser": source},
		MirrorPathFor: func(declFile string) string {
			return translationPath
		},
		Consts: []enrichment.NamedConst{{
			TypeName: "User", DeclFile: source, FriendlyVar: "pl_friendlyUser",
			Friendly: friendlyBody, TypeID: "u1", ChildIDs: map[string]string{"name": "n1"},
		}},
	}
}

// TestCheckTranslationFile_Findings covers the file-local findings: TR001
// missing file, TR002 blanks, TR004 carcasses — all spec-free (a nil spec
// skips only TR003), plus the strict severity flip.
func TestCheckTranslationFile_Findings(t *testing.T) {
	dir := canonicalTempDir(t)
	t.Chdir(dir)
	translationPath := filepath.Join(dir, "models.ts")

	// Missing file → TR001 (warning when not strict; Error under i18n.strict).
	findings := checkTranslationFile("pl", translationPath, nil, enrichment.Warning)
	if len(findings) != 1 || findings[0].Code != "TR001" || findings[0].Severity != enrichment.Warning {
		t.Fatalf("want one TR001 warning; got %+v", findings)
	}
	strict := checkTranslationFile("pl", translationPath, nil, enrichment.Error)
	if len(strict) != 1 || strict[0].Severity != enrichment.Error {
		t.Fatalf("strict severity must flip to Error; got %+v", strict)
	}

	// Blanks + a carcass in an existing file → TR002 + TR004, and no TR003
	// without a spec.
	writeTestFile(t, translationPath,
		"export const pl_friendlyUser = {\n"+
			"  rt$label: '',\n"+
			"  name: {rt$label: 'ok'}, /* @rtOrphanChild gone: 'x' */\n"+
			"};\n")
	findings = checkTranslationFile("pl", translationPath, nil, enrichment.Warning)
	codes := map[string]int{}
	for _, finding := range findings {
		codes[finding.Code]++
	}
	if codes["TR002"] != 1 {
		t.Errorf("want TR002 for @todo blanks; got %+v", findings)
	}
	if codes["TR004"] != 1 {
		t.Errorf("want TR004 for the carcass; got %+v", findings)
	}
	if codes["TR001"] != 0 || codes["TR003"] != 0 {
		t.Errorf("no TR001 (file exists) and no TR003 (nil spec); got %+v", findings)
	}
}

// TestCheckTranslationFile_OutOfDate: TR003 = a dry-run src-derived reconcile
// would change the file — driven by an already-built spec (the stub stands in
// for the Program-built desired side), flipping on after the desired side
// grows and off again after an update.
func TestCheckTranslationFile_OutOfDate(t *testing.T) {
	_, source, _ := translateFixture(t, false)
	translationPath := filepath.Join(filepath.Dir(source), "__runtypes", "enriched", "i18n", "pl", "models.ts")

	baseSpec := stubTranslationSpec(source, translationPath, "{rt$label: '', name: {rt$label: ''}}")
	if wrote := writeMirrorFile(baseSpec); !wrote {
		t.Fatalf("scaffold wrote nothing")
	}
	scaffolded, err := os.ReadFile(translationPath)
	if err != nil {
		t.Fatalf("translation file not written: %v", err)
	}
	if !strings.Contains(string(scaffolded), "export const pl_friendlyUser: FriendlyText<User>") {
		t.Errorf("translation consts annotate FriendlyText (Translation is retired):\n%s", scaffolded)
	}

	// In sync: no TR003.
	for _, finding := range checkTranslationFile("pl", translationPath, &baseSpec, enrichment.Warning) {
		if finding.Code == "TR003" {
			t.Fatalf("fresh scaffold must not be out of date: %+v", finding)
		}
	}

	// The src type gains a field → the desired side grows → TR003 until updated.
	grownSpec := stubTranslationSpec(source, translationPath, "{rt$label: '', name: {rt$label: ''}, email: {rt$label: ''}}")
	grownSpec.Consts[0].ChildIDs["email"] = "e1"
	sawOutOfDate := false
	for _, finding := range checkTranslationFile("pl", translationPath, &grownSpec, enrichment.Warning) {
		if finding.Code == "TR003" {
			sawOutOfDate = true
		}
	}
	if !sawOutOfDate {
		t.Fatalf("want TR003 after the desired side grew")
	}

	// Update, then clean again.
	if wrote := updateMirrorFile(grownSpec); !wrote {
		t.Fatalf("update should reconcile the added field")
	}
	updated, _ := os.ReadFile(translationPath)
	if !strings.Contains(string(updated), "email: {rt$label: ''}") {
		t.Errorf("added field not scaffolded:\n%s", updated)
	}
	for _, finding := range checkTranslationFile("pl", translationPath, &grownSpec, enrichment.Warning) {
		if finding.Code == "TR003" {
			t.Errorf("updated translation must be in sync; got %+v", finding)
		}
	}
}
