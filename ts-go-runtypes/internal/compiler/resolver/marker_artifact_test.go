package resolver_test

import (
	"path/filepath"
	"reflect"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/microsoft/typescript-go/shim/vfs/osvfs"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnindex"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// markerPackageRoot is the real @mionjs/run-types package: the artifact it publishes is the
// compiler's own contract, so these tests build the actual sources rather than a stand-in.
func markerPackageRoot(t *testing.T) string {
	t.Helper()
	root, err := filepath.Abs(filepath.Join("..", "..", "..", "..", "packages", "run-types"))
	if err != nil {
		t.Fatal(err)
	}
	return tspath.NormalizePath(root)
}

// A package's own build is the single producer of its built-in bodies, so generating over the
// marker package's sources must hand back an artifact holding EVERY id the compiler names.
// Before this, the whole-program filter that stops a consumer double-producing them also
// emptied the package's own artifact, which is why it had to ship its sources instead.
func TestMarkerArtifact_HoldsEveryBuiltinID(t *testing.T) {
	root := markerPackageRoot(t)
	scanned := purefnindex.ScanRegistrations(root, osvfs.FS())
	if len(scanned) == 0 {
		t.Fatalf("no registration module found under %s", root)
	}
	prog, err := program.NewInferred(program.Options{Cwd: root, SingleThreaded: true}, scanned)
	if err != nil {
		t.Fatal(err)
	}
	session, err := resolver.New(prog, resolver.Options{SingleThreaded: true, GenDir: t.TempDir(), TransformRelative: true})
	if err != nil {
		t.Fatal(err)
	}
	gen := session.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	index, err := purefnindex.ParseArtifactIndex([]byte(gen.PureFnArtifact[constants.PureFnArtifactIndexFile]))
	if err != nil {
		t.Fatalf("index: %v", err)
	}
	if index.Package != purefnindex.MarkerPackageName {
		t.Fatalf("index package = %q, want %q", index.Package, purefnindex.MarkerPackageName)
	}
	got := make([]string, 0, len(index.PureFns))
	for _, row := range index.PureFns {
		got = append(got, row.ID)
	}
	if !reflect.DeepEqual(got, purefnids.All()) {
		t.Errorf("artifact ids differ from the generated constants\ngot:  %v\nwant: %v", got, purefnids.All())
	}
	// Every listed id must have a module beside the index, and that module must read back.
	for _, id := range got {
		content, ok := gen.PureFnArtifact[purefnindex.ModulePath(id)]
		if !ok {
			t.Fatalf("%s listed in the index but no module written", id)
		}
		if _, err := purefnindex.ReadModule(id, content); err != nil {
			t.Fatalf("%s: %v", id, err)
		}
	}
}

// The filter is narrowed to the OWNING package, not removed: a consumer resolving the marker
// package through the `source` condition must still drop its built-ins, or the served table
// and the consumer's own extraction would both produce the same id.
func TestMarkerArtifact_ConsumerStillDropsBuiltins(t *testing.T) {
	outDir := t.TempDir()
	sources := map[string]string{
		"package.json": `{"name":"@acme/app"}`,
		"src/app.ts":   artifactSources,
	}
	gen := generateArtifact(t, sources, outDir, constants.ModuleModeDefault)
	index := parseIndex(t, gen)
	if index.Package != "@acme/app" {
		t.Fatalf("index package = %q, want @acme/app", index.Package)
	}
	for _, row := range index.PureFns {
		if purefnids.Has(row.ID) {
			t.Errorf("consumer artifact carries the built-in %s", row.ID)
		}
	}
}
