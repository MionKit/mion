package apitypes

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/vfs/osvfs"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/apitypes/apitypesmeta"
)

func writeFile(t *testing.T, path, text string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
}

// TestBuildPackage_ManifestMarkerAndPeers: no JS entry, the marker field, and every peer with the server's range.
func TestBuildPackage_ManifestMarkerAndPeers(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "package.json"), `{"name": "@acme/api", "version": "1.2.3", "license": "MIT",
  "dependencies": {"@mionjs/router": "workspace:*", "ext-pkg": "^2.0.0"},
  "peerDependencies": {"@mionjs/core": "^0.12.0"}}`)
	writeFile(t, filepath.Join(root, "node_modules/@mionjs/router/package.json"), `{"name": "@mionjs/router", "version": "0.12.5"}`)
	files, err := BuildPackage(PackageInput{
		ServerRoot: root,
		Trimmed:    &Output{Files: map[string]string{"index.d.ts": "export {};\n"}, Entry: "index.d.ts", BuildVersion: "v1", Externals: []string{"@mionjs/router", "ext-pkg", "@types/node"}},
		Manifest:   "{}\n",
		Compiler:   "9.9.9",
	})
	if err != nil {
		t.Fatal(err)
	}
	var pkg struct {
		Name, Version, Types, License string
		Main                          string
		Exports                       map[string]map[string]string
		Files                         []string
		Mion                          struct{ ApiTypes string }
		PeerDependencies              map[string]string
	}
	if err := json.Unmarshal([]byte(files["package.json"]), &pkg); err != nil {
		t.Fatal(err)
	}
	if pkg.Name != "@acme/api-types" || pkg.Version != "1.2.3" || pkg.Types != "./index.d.ts" || pkg.Main != "" || pkg.License != "MIT" {
		t.Errorf("package.json: %s", files["package.json"])
	}
	if pkg.Exports["."]["types"] != "./index.d.ts" || len(pkg.Exports["."]) != 1 || pkg.Exports["./*"]["types"] != "./*.d.ts" {
		t.Errorf("exports must hold only types: %v", pkg.Exports)
	}
	if pkg.Mion.ApiTypes != "./mion-api.json" || strings.Join(pkg.Files, ",") != ".mion,index.d.ts,mion-api.json" {
		t.Errorf("mion field %q files %v", pkg.Mion.ApiTypes, pkg.Files)
	}
	want := map[string]string{"@mionjs/router": "^0.12.5", "@mionjs/core": "^0.12.0", "@mionjs/run-types": "*", "ext-pkg": "^2.0.0", "@types/node": "*"}
	for name, wanted := range want {
		if pkg.PeerDependencies[name] != wanted {
			t.Errorf("peer %s = %q, want %q (all: %v)", name, pkg.PeerDependencies[name], wanted, pkg.PeerDependencies)
		}
	}
	var marker apitypesmeta.Marker
	if err := json.Unmarshal([]byte(files["mion-api.json"]), &marker); err != nil || marker.Package != "@acme/api" || marker.Compiler != "9.9.9" || marker.BuildVersion != "v1" {
		t.Errorf("marker %s (%v)", files["mion-api.json"], err)
	}
	if files[".mion/api/manifest.json"] != "{}\n" {
		t.Errorf("the manifest must ship for api-check")
	}
	writeFile(t, filepath.Join(root, "out", "package.json"), files["package.json"])
	writeFile(t, filepath.Join(root, "out", "mion-api.json"), files["mion-api.json"])
	if info := apitypesmeta.ReadPackage(filepath.Join(root, "out"), osvfs.FS()); !info.TypesOnly || info.Marker == nil || info.Marker.Package != "@acme/api" {
		t.Errorf("a client must read the package as types-only with a marker: %+v", info)
	}
}

// TestBuildPackage_NeedsAServerName: pure fn ids and the marker carry the server name.
func TestBuildPackage_NeedsAServerName(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "package.json"), `{"version": "1.0.0"}`)
	if _, err := BuildPackage(PackageInput{ServerRoot: root, Trimmed: &Output{Entry: "index.d.ts"}}); err == nil || !strings.Contains(err.Error(), "no name") {
		t.Fatalf("got %v", err)
	}
}

// TestWritePackage_RefusesAForeignDirectory: a wrong --out never wipes a project.
func TestWritePackage_RefusesAForeignDirectory(t *testing.T) {
	out := t.TempDir()
	writeFile(t, filepath.Join(out, "package.json"), `{"name": "my-app"}`)
	if err := WritePackage(out, map[string]string{"index.d.ts": "x"}); err == nil || !strings.Contains(err.Error(), "not written by") {
		t.Fatalf("got %v", err)
	}
	if _, err := os.Stat(filepath.Join(out, "package.json")); err != nil {
		t.Fatal("the foreign package.json must survive")
	}
	writeFile(t, filepath.Join(out, "package.json"), `{"name": "x-types", "mion": {"apiTypes": "./mion-api.json"}}`)
	writeFile(t, filepath.Join(out, "stale.d.ts"), "old")
	if err := WritePackage(out, map[string]string{"index.d.ts": "new"}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(out, "stale.d.ts")); !os.IsNotExist(err) {
		t.Error("a previous output is replaced whole")
	}
}
