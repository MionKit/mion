package apitypes

import (
	"encoding/json"
	"maps"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/vfs/osvfs"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnindex"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/apitypes/apitypesmeta"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
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
	files, _, err := BuildPackage(PackageInput{
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
	if _, _, err := BuildPackage(PackageInput{ServerRoot: root, Trimmed: &Output{Entry: "index.d.ts"}}); err == nil || !strings.Contains(err.Error(), "no name") {
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

// artifactOf renders a server artifact the way a build writes it: the index plus each entry's module.
func artifactOf(t *testing.T, overrides []purefnindex.ArtifactOverrideRow, entries ...purefunctions.Entry) map[string]string {
	t.Helper()
	return packageArtifactOf(t, "@acme/api", overrides, entries...)
}

// packageArtifactOf is artifactOf for any package.
func packageArtifactOf(t *testing.T, packageName string, overrides []purefnindex.ArtifactOverrideRow, entries ...purefunctions.Entry) map[string]string {
	t.Helper()
	files := map[string]string{constants.PureFnArtifactIndexFile: string(purefnindex.RenderArtifactIndex(packageName, "/srv", entries, overrides))}
	graph := purefunctions.CollectEntries(entries, constants.EmitCode)
	graph.AddMissingStubs(nil)
	modules, err := entrymodules.RenderGrouped(graph, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		files[purefnindex.ModulePath(entry.ID)] = modules[entrymodules.ModuleName(entry.ID, entrymodules.KindPureFn)]
	}
	return files
}

// TestReachedArtifact_ShipsOnlyWhatAClientCanDemand: overrides and ids the declarations name, with their deps;
// a pure fn only server code uses stays home, and so does the peer only it needed.
func TestReachedArtifact_ShipsOnlyWhatAClientCanDemand(t *testing.T) {
	const (
		overrideID = "@acme/api#pf_override000000"
		namedID    = "@acme/api#pf_named000000000"
		depID      = "@acme/api#pf_dep0000000000"
		serverID   = "@acme/api#pf_server0000000"
		foreignID  = "@acme/text#pf_slug00000000000"
	)
	entries := []purefunctions.Entry{
		{ID: overrideID, BindingName: "noteValidate", ParamNames: []string{"utl"}, Code: "return (v) => typeof v === 'string';"},
		{ID: namedID, BindingName: "shout", ParamNames: []string{"utl"}, Code: "return (s) => utl.getPureFn('" + depID + "')(s);", PureFnDependencies: []string{depID}},
		{ID: depID, BindingName: "upper", ParamNames: []string{"utl"}, Code: "return (s) => s.toUpperCase();"},
		{ID: serverID, BindingName: "audit", ParamNames: []string{"utl"}, Code: "return (s) => utl.getPureFn('" + foreignID + "')(s);", PureFnDependencies: []string{foreignID}},
	}
	artifact := artifactOf(t, []purefnindex.ArtifactOverrideRow{{BaseKey: "note", Family: "validate", ID: overrideID}}, entries...)
	kept, peers, err := reachedArtifact(artifact, map[string]string{"index.d.ts": "export declare const shout: PureFnId<'" + namedID + "'>;\n"})
	if err != nil {
		t.Fatal(err)
	}
	index, err := purefnindex.ParseArtifactIndex([]byte(kept[constants.PureFnArtifactIndexFile]))
	if err != nil {
		t.Fatal(err)
	}
	var ids []string
	for _, row := range index.PureFns {
		ids = append(ids, row.ID)
	}
	if strings.Join(ids, ",") != strings.Join([]string{depID, namedID, overrideID}, ",") || len(index.Overrides) != 1 {
		t.Errorf("kept rows %v overrides %v", ids, index.Overrides)
	}
	if _, shipped := kept[purefnindex.ModulePath(serverID)]; shipped || len(peers) != 0 {
		t.Errorf("the server-only pure fn and its peer must stay home: modules %v, peers %v", kept, peers)
	}
	if none, _, _ := reachedArtifact(artifactOf(t, nil, entries[3]), map[string]string{"index.d.ts": "export {};\n"}); none != nil {
		t.Errorf("an artifact nothing reaches ships no directory, got %v", none)
	}
}

// TestRangeOf_WorkspaceOnlyRanges: a range only the workspace understands never ships.
func TestRangeOf_WorkspaceOnlyRanges(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "node_modules/@mionjs/router/package.json"), `{"version": "0.12.5"}`)
	server := serverPackage{Dependencies: map[string]string{"@mionjs/router": "catalog:", "ext": "link:../ext", "plain": "^1.0.0"}}
	for name, want := range map[string]string{"@mionjs/router": "^0.12.5", "ext": "*", "plain": "^1.0.0", "undeclared": "*"} {
		if got := rangeOf(root, name, server); got != want {
			t.Errorf("rangeOf(%s) = %q, want %q", name, got, want)
		}
	}
}

// TestBuildPackage_ShipsOtherPackagesPureFns: a dep another package owns is copied in with its own deps, so that
// package is no peer; a mion package, and one that ships no artifact, stay peers.
func TestBuildPackage_ShipsOtherPackagesPureFns(t *testing.T) {
	const (
		namedID  = "@acme/api#pf_named000000000"
		slugID   = "@acme/text#pf_slug00000000000"
		lowerID  = "@acme/case#pf_lower0000000000"
		coreID   = "@mionjs/core#pf_core00000000000"
		sourceID = "@acme/raw#pf_raw000000000000"
	)
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "package.json"), `{"name": "@acme/api", "version": "1.0.0"}`)
	install := func(name string, entries ...purefunctions.Entry) {
		dir := filepath.Join(root, "node_modules", filepath.FromSlash(name))
		writeFile(t, filepath.Join(dir, "package.json"), `{"name": "`+name+`"}`)
		for rel, text := range packageArtifactOf(t, name, nil, entries...) {
			writeFile(t, filepath.Join(dir, "dist", constants.PureFnArtifactDir, filepath.FromSlash(rel)), text)
		}
	}
	install("@acme/text", purefunctions.Entry{ID: slugID, BindingName: "slug", ParamNames: []string{"utl"}, Code: "return (s) => utl.getPureFn('" + lowerID + "')(s);", PureFnDependencies: []string{lowerID}})
	install("@acme/case", purefunctions.Entry{ID: lowerID, BindingName: "lower", ParamNames: []string{"utl"}, Code: "return (s) => s.toLowerCase();"})
	writeFile(t, filepath.Join(root, "node_modules", "@acme", "raw", "package.json"), `{"name": "@acme/raw"}`)
	named := purefunctions.Entry{ID: namedID, BindingName: "shout", ParamNames: []string{"utl"}, Code: "return 1;", PureFnDependencies: []string{slugID, coreID, sourceID}}
	files, warnings, err := BuildPackage(PackageInput{
		ServerRoot:     root,
		Trimmed:        &Output{Files: map[string]string{"index.d.ts": "export declare const shout: PureFnId<'" + namedID + "'>;\n"}, Entry: "index.d.ts", BuildVersion: "v1"},
		PureFnArtifact: artifactOf(t, nil, named),
		Manifest:       "{}\n",
		Compiler:       "9.9.9",
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{".mion/vendor/@acme/text/package.json", ".mion/vendor/@acme/text/mion-pure-fns/index.json",
		".mion/vendor/@acme/text/mion-pure-fns/" + purefnindex.ModulePath(slugID), ".mion/vendor/@acme/case/mion-pure-fns/" + purefnindex.ModulePath(lowerID)} {
		if files[path] == "" {
			t.Errorf("missing %s in %v", path, slices.Sorted(maps.Keys(files)))
		}
	}
	var marker apitypesmeta.Marker
	if err := json.Unmarshal([]byte(files["mion-api.json"]), &marker); err != nil || marker.Format != apitypesmeta.MarkerFormatVendored ||
		marker.Vendored["@acme/text"] != "./.mion/vendor/@acme/text" || marker.Vendored["@acme/case"] != "./.mion/vendor/@acme/case" {
		t.Errorf("the marker must list the vendored packages: %s (%v)", files["mion-api.json"], err)
	}
	var pkg struct{ PeerDependencies map[string]string }
	if err := json.Unmarshal([]byte(files["package.json"]), &pkg); err != nil {
		t.Fatal(err)
	}
	if _, peer := pkg.PeerDependencies["@acme/text"]; peer || pkg.PeerDependencies["@acme/raw"] == "" || pkg.PeerDependencies["@mionjs/core"] == "" {
		t.Errorf("peers %v: a copied package is none, an unbuilt one and a mion one are", pkg.PeerDependencies)
	}
	if len(warnings) != 1 || !strings.Contains(warnings[0], "@acme/raw") {
		t.Errorf("the unbuilt package must be named in a warning, got %v", warnings)
	}
}
