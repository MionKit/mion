package main

import (
	"path/filepath"
	"reflect"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment/mirror"
)

// checkMirrorFileTest is what runMirrorDriftCheck does per mirror file, with the tsconfig read from the t.Chdir'd cwd.
func checkMirrorFileTest(mirrorFile string) []driftFinding {
	tsconfigPath, parsed := resolveEnrichProject("")
	return checkMirrorFile(mirrorFile, "", tsconfigPath, parsed)
}

// TestParseBreadcrumb verifies the source breadcrumb is extracted (skipping the
// mion DSL import) and the type names + specifier are returned. The
// parser moved to the shared mirror package (the resolver's checkEnrich pass
// uses it too); this pins the CLI-visible behavior through the new API.
func TestParseBreadcrumb(t *testing.T) {
	tests := []struct {
		name      string
		contents  string
		wantNames []string
		wantSpec  string
		wantOK    bool
	}{
		{
			name: "source breadcrumb after dsl import",
			contents: "import type { User, Post } from '../../src/models/user';\n" +
				"import type { FriendlyText, MockData } from '@mionjs/run-types';\n\n" +
				"export const friendlyUser = {};\n",
			wantNames: []string{"User", "Post"},
			wantSpec:  "../../src/models/user",
			wantOK:    true,
		},
		{
			name: "dsl import first still skipped",
			contents: "import type { FriendlyText, MockData } from '@mionjs/run-types';\n" +
				"import type { Address } from './address';\n",
			wantNames: []string{"Address"},
			wantSpec:  "./address",
			wantOK:    true,
		},
		{
			name:      "aliased import uses original name",
			contents:  "import type { Address as Addr } from './address';\n",
			wantNames: []string{"Address"},
			wantSpec:  "./address",
			wantOK:    true,
		},
		{
			name:     "no source breadcrumb",
			contents: "import type { FriendlyText } from '@mionjs/run-types';\nexport const x = {};\n",
			wantOK:   false,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			breadcrumb, ok := mirror.ParseBreadcrumb(test.contents)
			if ok != test.wantOK {
				t.Fatalf("ok = %v, want %v", ok, test.wantOK)
			}
			if !ok {
				return
			}
			if !reflect.DeepEqual(breadcrumb.TypeNames, test.wantNames) {
				t.Errorf("names = %v, want %v", breadcrumb.TypeNames, test.wantNames)
			}
			if breadcrumb.Spec != test.wantSpec {
				t.Errorf("spec = %q, want %q", breadcrumb.Spec, test.wantSpec)
			}
			if breadcrumb.Start < 0 || breadcrumb.End <= breadcrumb.Start {
				t.Errorf("breadcrumb range [%d,%d) must cover the import statement", breadcrumb.Start, breadcrumb.End)
			}
		})
	}
}

// TestSourceDeclaresType verifies the textual declaration scan across the
// declaration forms enrich tracks.
func TestSourceDeclaresType(t *testing.T) {
	src := "export interface User { name: string }\n" +
		"type Alias = string;\n" +
		"export abstract class Base {}\n" +
		"enum Color { Red }\n" +
		"declare type Ambient = number;\n"
	declared := []string{"User", "Alias", "Base", "Color", "Ambient"}
	for _, name := range declared {
		if !mirror.SourceDeclaresType(src, name) {
			t.Errorf("SourceDeclaresType should find %q", name)
		}
	}
	for _, name := range []string{"Missing", "Use", "Use"} {
		if mirror.SourceDeclaresType(src, name) {
			t.Errorf("SourceDeclaresType should NOT find %q", name)
		}
	}
	// A substring of a declared name must not match (word boundary).
	if mirror.SourceDeclaresType(src, "Use") {
		t.Errorf("SourceDeclaresType matched a substring of 'User'")
	}
}

// TestSourceDeclaresType_ReExports is the A5 regression: a LIVE type made
// available via a re-export / value binding must NOT be seen as "no longer
// declared" (which would destructively orphan it). Covers named re-exports
// (with/without `as`, with/without `from`), value bindings, and the wildcard
// re-export (UNKNOWN → conservatively KEEP).
func TestSourceDeclaresType_ReExports(t *testing.T) {
	keepCases := []struct {
		name   string
		src    string
		typeNm string
	}{
		{"named re-export from", "export { Name } from './x';\n", "Name"},
		{"named re-export local", "import { Name } from './x';\nexport { Name };\n", "Name"},
		{"aliased re-export exported side", "export { Internal as Name } from './x';\n", "Name"},
		{"aliased re-export local side", "export { Name as Public } from './x';\n", "Name"},
		{"type-only re-export", "export type { Name } from './x';\n", "Name"},
		{"multi-name clause", "export { A, Name, B } from './x';\n", "Name"},
		{"value const binding", "export const Name = makeIt();\n", "Name"},
		{"function binding", "export function Name() {}\n", "Name"},
		{"namespace binding", "export namespace Name {}\n", "Name"},
		{"wildcard re-export keeps everything", "export * from './barrel';\n", "Whatever"},
		{"wildcard with namespace alias", "export * as ns from './barrel';\n", "Whatever"},
	}
	for _, test := range keepCases {
		t.Run(test.name, func(t *testing.T) {
			if !mirror.SourceDeclaresType(test.src, test.typeNm) {
				t.Errorf("SourceDeclaresType(%q, %q) = false, want true (would destructively orphan a live type)", test.src, test.typeNm)
			}
		})
	}

	// Negative: a clause re-exporting OTHER names must not match (no false keep),
	// and a substring of a re-exported name must not match (word boundary).
	dropCases := []struct {
		name   string
		src    string
		typeNm string
	}{
		{"clause without the name", "export { Other, AlsoOther } from './x';\n", "Name"},
		{"substring of an exported name", "export { UserProfile } from './x';\n", "User"},
		{"aliased substring", "export { X as UserProfile } from './x';\n", "User"},
	}
	for _, test := range dropCases {
		t.Run(test.name, func(t *testing.T) {
			if mirror.SourceDeclaresType(test.src, test.typeNm) {
				t.Errorf("SourceDeclaresType(%q, %q) = true, want false", test.src, test.typeNm)
			}
		})
	}
}

// TestResolveBreadcrumb verifies the specifier resolves relative to the mirror
// file's directory, probing .ts then .d.ts.
func TestResolveBreadcrumb(t *testing.T) {
	dir := canonicalTempDir(t)
	t.Chdir(dir)
	mirrorFile := filepath.Join(dir, "rt", "gen", "models", "user.ts")
	mustMkdirAll(t, filepath.Dir(mirrorFile))
	source := filepath.Join(dir, "src", "models", "user.ts")
	writeTestFile(t, source, "export interface User {}")

	// The breadcrumb (relative, ext-stripped) from the mirror back to the source.
	spec := mirror.ImportSpecifier(mirrorFile, source)
	got := mirror.ResolveBreadcrumb(mirrorFile, spec)
	if filepath.Clean(got) != filepath.Clean(source) {
		t.Errorf("ResolveBreadcrumb(%q, %q) = %q, want %q", mirrorFile, spec, got, source)
	}
}

// TestCheckMirrorFile_Clean: a mirror whose breadcrumb resolves to a source that
// still declares the type, at the correct per-family mirror location, yields no
// findings.
func TestCheckMirrorFile_Clean(t *testing.T) {
	dir := canonicalTempDir(t)
	t.Chdir(dir)
	writeTestFile(t, filepath.Join(dir, "tsconfig.json"), `{ "compilerOptions": { "rootDir": "src" } }`)
	writeTestFile(t, filepath.Join(dir, "src", "models", "user.ts"), "export interface User { name: string }")
	mirror := filepath.Join(dir, "src", ".mion", "enriched", "friendly", "models", "user.ts")
	writeTestFile(t, mirror, "import type { User } from '../../../../models/user';\n"+
		"import type { FriendlyText } from '@mionjs/run-types';\n\nexport const friendlyUser = {};\n")

	findings := checkMirrorFileTest(mirror)
	if len(findings) != 0 {
		t.Errorf("clean mirror should have no findings; got %+v", findings)
	}
}

// TestCheckMirrorFile_NodeModulesSourceClean: the check anchors its config at the mirror, like the write lane;
// anchoring at a node_modules source re-derives the dependency's config and flags the write lane's output.
func TestCheckMirrorFile_NodeModulesSourceClean(t *testing.T) {
	dir := canonicalTempDir(t)
	t.Chdir(dir)
	writeTestFile(t, filepath.Join(dir, "tsconfig.json"), `{ "compilerOptions": { "rootDir": "src" } }`)
	pkg := filepath.Join(dir, "node_modules", "@x", "pkg")
	writeTestFile(t, filepath.Join(pkg, "tsconfig.json"), `{ "compilerOptions": { "rootDir": "src" } }`)
	writeTestFile(t, filepath.Join(pkg, "src", "stringFormats.ts"), "export interface String {}")
	mirror := filepath.Join(dir, "src", ".mion", "enriched", "friendly", "stringFormats.ts")
	writeTestFile(t, mirror, "import type { String } from '../../../../node_modules/@x/pkg/src/stringFormats';\n"+
		"import type { FriendlyText } from '@mionjs/run-types';\n\nexport const friendlyString = {};\n")

	findings := checkMirrorFileTest(mirror)
	if len(findings) != 0 {
		t.Errorf("node_modules-sourced mirror at the project location should have no findings; got %+v", findings)
	}
}

// TestCheckMirrorFile_I18nLocaleMirrorClean: a locale translation mirror at its
// canonical home (<i18n>/<locale>/<friendly-relative path>) yields no findings —
// the check knows the i18n subtree instead of treating it as a combined mirror.
func TestCheckMirrorFile_I18nLocaleMirrorClean(t *testing.T) {
	dir := canonicalTempDir(t)
	t.Chdir(dir)
	writeTestFile(t, filepath.Join(dir, "tsconfig.json"), `{ "compilerOptions": { "rootDir": "src" } }`)
	writeTestFile(t, filepath.Join(dir, "src", "models", "user.ts"), "export interface User { name: string }")
	mirror := filepath.Join(dir, "src", ".mion", "enriched", "i18n", "es", "models", "user.ts")
	writeTestFile(t, mirror, "import type { User } from '../../../../../models/user';\n"+
		"import type { Translation } from '@mionjs/run-types';\n\nexport const es_friendlyUser = {};\n")

	findings := checkMirrorFileTest(mirror)
	if len(findings) != 0 {
		t.Errorf("locale mirror at the canonical location should have no findings; got %+v", findings)
	}
}

// TestCheckMirrorFile_I18nRelocatedDrifts: a locale mirror moved off its
// canonical home still drifts (one enrich-mirror-moved) — the i18n arm detects real drift, it
// doesn't blanket-pass the subtree.
func TestCheckMirrorFile_I18nRelocatedDrifts(t *testing.T) {
	dir := canonicalTempDir(t)
	t.Chdir(dir)
	writeTestFile(t, filepath.Join(dir, "tsconfig.json"), `{ "compilerOptions": { "rootDir": "src" } }`)
	writeTestFile(t, filepath.Join(dir, "src", "models", "user.ts"), "export interface User { name: string }")
	// Canonical home is i18n/es/models/user.ts — this one lost its models/ segment.
	mirror := filepath.Join(dir, "src", ".mion", "enriched", "i18n", "es", "user.ts")
	writeTestFile(t, mirror, "import type { User } from '../../../../models/user';\n"+
		"import type { Translation } from '@mionjs/run-types';\n\nexport const es_friendlyUser = {};\n")

	findings := checkMirrorFileTest(mirror)
	if len(findings) != 1 || findings[0].Code != "enrich-mirror-moved" {
		t.Fatalf("relocated locale mirror should yield exactly one enrich-mirror-moved; got %+v", findings)
	}
}

// TestCheckMirrorFile_NoFamilySegmentDrifts: a mirror moved out of its family
// dir (no family segment in its path) is flagged enrich-mirror-moved.
func TestCheckMirrorFile_NoFamilySegmentDrifts(t *testing.T) {
	dir := canonicalTempDir(t)
	t.Chdir(dir)
	writeTestFile(t, filepath.Join(dir, "tsconfig.json"), `{ "compilerOptions": { "rootDir": "src" } }`)
	writeTestFile(t, filepath.Join(dir, "src", "models", "user.ts"), "export interface User { name: string }")
	mirror := filepath.Join(dir, "src", ".mion", "enriched", "models", "user.ts")
	writeTestFile(t, mirror, "import type { User } from '../../../models/user';\n"+
		"import type { FriendlyText, MockData } from '@mionjs/run-types';\n\nexport const friendlyUser = {};\n")

	findings := checkMirrorFileTest(mirror)
	if len(findings) != 1 || findings[0].Code != "enrich-mirror-moved" {
		t.Fatalf("a mirror with no family segment should yield exactly one enrich-mirror-moved; got %+v", findings)
	}
}

// TestCheckMirrorFile_EnrichMirrorSourceMissing: a deleted source produces an error.
func TestCheckMirrorFile_EnrichMirrorSourceMissing(t *testing.T) {
	dir := canonicalTempDir(t)
	t.Chdir(dir)
	mirror := filepath.Join(dir, "src", ".mion", "enriched", "models", "user.ts")
	writeTestFile(t, mirror, "import type { User } from '../../../models/user';\n")

	findings := checkMirrorFileTest(mirror)
	if len(findings) != 1 || findings[0].Code != "enrich-mirror-source-missing" {
		t.Fatalf("want one enrich-mirror-source-missing finding; got %+v", findings)
	}
}

// TestCheckMirrorFile_EnrichMirrorTypeMissing: a source that no longer declares the type errors.
func TestCheckMirrorFile_EnrichMirrorTypeMissing(t *testing.T) {
	dir := canonicalTempDir(t)
	t.Chdir(dir)
	writeTestFile(t, filepath.Join(dir, "tsconfig.json"), `{ "compilerOptions": { "rootDir": "src" } }`)
	writeTestFile(t, filepath.Join(dir, "src", "models", "user.ts"), "export interface Renamed {}")
	mirror := filepath.Join(dir, "src", ".mion", "enriched", "models", "user.ts")
	writeTestFile(t, mirror, "import type { User } from '../../../models/user';\n")

	findings := checkMirrorFileTest(mirror)
	codes := map[string]bool{}
	for _, finding := range findings {
		codes[finding.Code] = true
	}
	if !codes["enrich-mirror-type-missing"] {
		t.Errorf("want a enrich-mirror-type-missing finding; got %+v", findings)
	}
}

// TestIsUnder covers the source-vs-mirror gate that lets `enrich <source> --no-emit`
// redirect to the source's mirror instead of misreading the source as a mirror.
func TestIsUnder(t *testing.T) {
	dir := filepath.FromSlash("/repo/runtypes/generated")
	tests := []struct {
		name string
		path string
		want bool
	}{
		{"the dir itself", dir, true},
		{"a mirror inside", filepath.Join(dir, "models", "user.ts"), true},
		{"a source outside", filepath.FromSlash("/repo/src/models/user.ts"), false},
		{"a sibling prefix-sharing dir", filepath.FromSlash("/repo/runtypes/generated-x/a.ts"), false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := isUnder(dir, test.path); got != test.want {
				t.Errorf("isUnder(%q, %q) = %v, want %v", dir, test.path, got, test.want)
			}
		})
	}
}
