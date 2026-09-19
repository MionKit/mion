package resolver_test

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnindex"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// The package's pure-fn artifact: every generate renders the package's OWN
// registrations into <genDir>/types/mion-pure-fns.json and hands the same
// bytes back on the response, for the adapter to place next to the bundle.

const artifactSources = `import {registerPureFn, registerPureFnFactory} from '@mionjs/run-types';
export const slugify = registerPureFn((s: string): string => s.toLowerCase());
export const title = registerPureFnFactory(function (utl) {
  return function _title(s: string): string { return utl.getPureFn(slugify)(s) + '!'; };
});
`

func generateArtifact(t *testing.T, sources map[string]string, outDir string) (protocol.Response, []byte) {
	t.Helper()
	r := setupGen(t, sources, outDir)
	gen := r.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	onDisk, err := os.ReadFile(filepath.Join(outDir, "types", constants.PureFnArtifactFileName))
	if err != nil && !os.IsNotExist(err) {
		t.Fatal(err)
	}
	return gen, onDisk
}

func TestPureFnArtifact_GenerateWritesAndReturnsIt(t *testing.T) {
	outDir := t.TempDir()
	sources := map[string]string{"package.json": `{"name":"@acme/app"}`, "src/text.ts": artifactSources}
	gen, onDisk := generateArtifact(t, sources, outDir)
	if gen.PureFnArtifact == "" || string(onDisk) != gen.PureFnArtifact {
		t.Fatalf("response and disk must carry the same artifact:\nresponse: %q\ndisk: %q", gen.PureFnArtifact, onDisk)
	}
	artifact, err := purefnindex.ParseArtifact(onDisk)
	if err != nil {
		t.Fatal(err)
	}
	if artifact.Package != "@acme/app" || len(artifact.PureFns) != 2 {
		t.Fatalf("artifact = %+v", artifact)
	}
	if artifact.PureFns[0].ID > artifact.PureFns[1].ID {
		t.Error("rows must be sorted by id")
	}
	names := map[string]purefnindex.ArtifactRow{}
	for _, row := range artifact.PureFns {
		names[row.BindingName] = row
		if !strings.HasPrefix(row.ID, "@acme/app"+constants.PureFnHashPrefix) || row.File != "src/text.ts" {
			t.Errorf("row = %+v", row)
		}
	}
	if !strings.Contains(names["title"].Code, "getPureFn('"+names["slugify"].ID+"')") || len(names["title"].PureFnDependencies) != 1 {
		t.Errorf("title must carry its lowered dep: %+v", names["title"])
	}
	// The artifact is data, never a module: not in the manifest, not GC'd.
	for _, basename := range gen.Generated {
		if strings.Contains(basename, "mion-pure-fns") {
			t.Errorf("the artifact leaked into the module manifest: %s", basename)
		}
	}
	again, onDiskAgain := generateArtifact(t, sources, outDir)
	if again.PureFnArtifact != gen.PureFnArtifact || !bytes.Equal(onDisk, onDiskAgain) {
		t.Error("the artifact must be byte-stable across runs")
	}
}

// A package that registers nothing gets no file, and a stale one from an
// earlier build is removed; a nameless cwd owns no id and gets none either.
func TestPureFnArtifact_NoRowsMeansNoFile(t *testing.T) {
	outDir := t.TempDir()
	if _, onDisk := generateArtifact(t, map[string]string{"package.json": `{"name":"@acme/app"}`, "src/text.ts": artifactSources}, outDir); onDisk == nil {
		t.Fatal("first build must write the artifact")
	}
	const typesOnly = `import {getRunTypeId} from '@mionjs/run-types';
export const id = getRunTypeId<{a: number}>();
`
	gen, onDisk := generateArtifact(t, map[string]string{"package.json": `{"name":"@acme/app"}`, "src/types.ts": typesOnly}, outDir)
	if gen.PureFnArtifact != "" || onDisk != nil {
		t.Errorf("no pure fn, no file: response=%q disk=%q", gen.PureFnArtifact, onDisk)
	}
	gen, onDisk = generateArtifact(t, map[string]string{"src/text.ts": artifactSources}, t.TempDir())
	if gen.PureFnArtifact != "" || onDisk != nil {
		t.Errorf("a nameless package owns no id: response=%q disk=%q", gen.PureFnArtifact, onDisk)
	}
}

// Only the building package's rows go in: a sibling package the program
// reaches through its sources belongs to its own artifact.
func TestPureFnArtifact_OwnPackageOnly(t *testing.T) {
	outDir := t.TempDir()
	sources := map[string]string{
		"package.json": `{"name":"@acme/app"}`,
		"src/text.ts":  artifactSources,
		"src/uses.ts": `import {registerPureFnFactory} from '@mionjs/run-types';
import {pad} from '../packages/util/src/pad.ts';
export const padded = registerPureFnFactory(function (utl) {
  return function _padded(s: string): string { return utl.getPureFn(pad)(s); };
});
`,
		"packages/util/package.json": `{"name":"@acme/util"}`,
		"packages/util/src/pad.ts": `import {registerPureFn} from '@mionjs/run-types';
export const pad = registerPureFn((s: string): string => s.padStart(4, '0'));
`,
	}
	_, onDisk := generateArtifact(t, sources, outDir)
	artifact, err := purefnindex.ParseArtifact(onDisk)
	if err != nil {
		t.Fatal(err)
	}
	if len(artifact.PureFns) != 3 {
		t.Errorf("expected the three @acme/app rows, got %+v", artifact.PureFns)
	}
	for _, row := range artifact.PureFns {
		if purefnindex.PackageOfID(row.ID) != "@acme/app" {
			t.Errorf("a foreign row leaked in: %+v", row)
		}
		for _, dep := range row.PureFnDependencies {
			if purefnindex.PackageOfID(dep) == "@acme/util" {
				return // the dep edge crosses packages; the row does not
			}
		}
	}
	t.Error("padded must depend on @acme/util's pad")
}

// Marker coverage rule: alongside the artifact, both getRunTypeId call shapes
// resolve to one cache entry.
func TestPureFnArtifact_GetRunTypeIdShapesAgree(t *testing.T) {
	sources := map[string]string{
		"package.json": `{"name":"@acme/app"}`,
		"src/text.ts":  artifactSources,
		"static.ts": `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<{slug: string}>();
`,
		"reflect.ts": `import {getRunTypeId} from '@mionjs/run-types';
const value: {slug: string} = {slug: 'x'};
getRunTypeId(value);
`,
	}
	r := setupGen(t, sources, t.TempDir())
	a := resolveFile(t, r, "static.ts")
	b := resolveFile(t, r, "reflect.ts")
	if a.ID == "" || a.ID != b.ID {
		t.Errorf("getRunTypeId<T>() and getRunTypeId(value) must agree: %q vs %q", a.ID, b.ID)
	}
}
