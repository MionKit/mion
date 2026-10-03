package apitypes

import (
	"encoding/json"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/vfs/osvfs"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnindex"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/apitypes/apitypesmeta"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
)

// mionPeers are the packages every client of a mion API builds against.
var mionPeers = []string{"@mionjs/core", "@mionjs/router", "@mionjs/run-types"}

// PackageInput is everything a types-only package is made of.
type PackageInput struct {
	ServerRoot string // the directory of the server's package.json
	Name       string // "" for `<server name>-types`
	Version    string // "" for the server's version
	Trimmed    *Output
	// PureFnArtifact is the server's `mion-pure-fns/` content, path inside the directory to text.
	PureFnArtifact map[string]string
	Manifest       string
	Compiler       string
}

type serverPackage struct {
	Name                 string            `json:"name"`
	Version              string            `json:"version"`
	License              string            `json:"license,omitempty"`
	Author               json.RawMessage   `json:"author,omitempty"`
	Repository           json.RawMessage   `json:"repository,omitempty"`
	Homepage             string            `json:"homepage,omitempty"`
	Dependencies         map[string]string `json:"dependencies"`
	PeerDependencies     map[string]string `json:"peerDependencies"`
	DevDependencies      map[string]string `json:"devDependencies"`
	OptionalDependencies map[string]string `json:"optionalDependencies"`
}

// typesPackage is the package.json written, fields in the order a reader expects them.
type typesPackage struct {
	Name             string            `json:"name"`
	Version          string            `json:"version"`
	Description      string            `json:"description"`
	License          string            `json:"license,omitempty"`
	Author           json.RawMessage   `json:"author,omitempty"`
	Repository       json.RawMessage   `json:"repository,omitempty"`
	Homepage         string            `json:"homepage,omitempty"`
	Types            string            `json:"types"`
	Exports          map[string]any    `json:"exports"`
	Files            []string          `json:"files"`
	Mion             map[string]string `json:"mion"`
	PeerDependencies map[string]string `json:"peerDependencies"`
}

// BuildPackage returns the package's files by slash path relative to its root.
func BuildPackage(input PackageInput) (map[string]string, error) {
	content, err := os.ReadFile(filepath.Join(input.ServerRoot, "package.json"))
	if err != nil {
		return nil, fmt.Errorf("api types: read the server package.json: %w", err)
	}
	var server serverPackage
	if err := json.Unmarshal(content, &server); err != nil {
		return nil, fmt.Errorf("api types: parse the server package.json: %w", err)
	}
	if server.Name == "" {
		return nil, fmt.Errorf("api types: the server package.json has no name: its pure fn ids and the marker need one")
	}
	files := map[string]string{}
	for rel, text := range input.Trimmed.Files {
		files[rel] = text
	}
	artifact, artifactPeers, err := reachedArtifact(input.PureFnArtifact, input.Trimmed.Files)
	if err != nil {
		return nil, err
	}
	for rel, text := range artifact {
		files[path.Join(constants.PureFnArtifactDir, filepath.ToSlash(rel))] = text
	}
	files[path.Join(constants.ApiTypesManifestDir, constants.ApiModuleDir, constants.ApiManifestFile)] = input.Manifest
	files[constants.ApiTypesMarkerFile] = apitypesmeta.Marker{
		Format: apitypesmeta.MarkerFormat, Package: server.Name, Compiler: input.Compiler, BuildVersion: input.Trimmed.BuildVersion,
	}.Render()

	peers := map[string]string{}
	for _, name := range append(append(append([]string(nil), mionPeers...), input.Trimmed.Externals...), artifactPeers...) {
		if name != server.Name {
			peers[name] = rangeOf(input.ServerRoot, name, server)
		}
	}
	topLevel := map[string]bool{}
	for rel := range files {
		topLevel[strings.SplitN(rel, "/", 2)[0]] = true
	}
	published := make([]string, 0, len(topLevel))
	for entry := range topLevel {
		published = append(published, entry)
	}
	sort.Strings(published)
	entry := "./" + input.Trimmed.Entry
	pkg := typesPackage{
		Name: input.Name, Version: input.Version,
		Description: "Types-only client package for " + server.Name + ", built by `mion api-types`.",
		License:     server.License, Author: server.Author, Repository: server.Repository, Homepage: server.Homepage,
		Types: entry,
		// "./*" lets a client that writes its own .d.ts name a type from any kept file (TS2883 otherwise).
		Exports:          map[string]any{".": map[string]string{"types": entry}, "./*": map[string]string{"types": "./*.d.ts"}},
		Files:            published,
		Mion:             map[string]string{"apiTypes": "./" + constants.ApiTypesMarkerFile},
		PeerDependencies: peers,
	}
	if pkg.Name == "" {
		pkg.Name = server.Name + "-types"
	}
	if pkg.Version == "" {
		pkg.Version = server.Version
	}
	if pkg.Version == "" {
		pkg.Version = "0.0.0"
	}
	encoded, _ := json.MarshalIndent(pkg, "", "  ")
	files["package.json"] = string(encoded) + "\n"
	return files, nil
}

// reachedArtifact keeps the ids the kept declarations name and every override (it changes its type's id wherever a
// client meets it), plus their dependencies; other packages those depend on are returned as peers.
func reachedArtifact(artifact, declarations map[string]string) (map[string]string, []string, error) {
	indexText, ok := artifact[constants.PureFnArtifactIndexFile]
	if !ok {
		return nil, nil, nil
	}
	index, err := purefnindex.ParseArtifactIndex([]byte(indexText))
	if err != nil {
		return nil, nil, fmt.Errorf("api types: the server's %s/%s: %w", constants.PureFnArtifactDir, constants.PureFnArtifactIndexFile, err)
	}
	listed := map[string]bool{}
	var pending []string
	for _, row := range index.PureFns {
		listed[row.ID] = true
		for _, text := range declarations {
			if strings.Contains(text, row.ID) {
				pending = append(pending, row.ID)
				break
			}
		}
	}
	for _, override := range index.Overrides {
		pending = append(pending, override.ID)
	}
	reached := map[string]bool{}
	owners := map[string]bool{}
	for len(pending) > 0 {
		id := pending[0]
		pending = pending[1:]
		if reached[id] || !listed[id] {
			continue
		}
		reached[id] = true
		entry, err := purefnindex.ReadModule(id, artifact[purefnindex.ModulePath(id)])
		if err != nil {
			return nil, nil, fmt.Errorf("api types: the server's pure fn %s: %w", id, err)
		}
		for _, dependency := range entry.PureFnDependencies {
			pending = append(pending, dependency)
			if owner := purefnindex.PackageOfID(dependency); owner != "" && owner != index.Package {
				owners[owner] = true
			}
		}
	}
	if len(reached) == 0 {
		return nil, nil, nil
	}
	kept := map[string]string{}
	rows := index.PureFns[:0:0]
	for _, row := range index.PureFns {
		if reached[row.ID] {
			rows = append(rows, row)
			kept[purefnindex.ModulePath(row.ID)] = artifact[purefnindex.ModulePath(row.ID)]
		}
	}
	index.PureFns = rows
	kept[constants.PureFnArtifactIndexFile] = string(index.Render())
	peers := make([]string, 0, len(owners))
	for owner := range owners {
		peers = append(peers, owner)
	}
	sort.Strings(peers)
	return kept, peers, nil
}

// rangeOf: a range only the workspace understands (`workspace:`, `catalog:`, `link:`, `file:`) becomes ^installed, else "*".
func rangeOf(serverRoot, name string, server serverPackage) string {
	for _, table := range []map[string]string{server.Dependencies, server.PeerDependencies, server.OptionalDependencies, server.DevDependencies} {
		declared, ok := table[name]
		if !ok {
			continue
		}
		if !strings.Contains(declared, ":") {
			return declared
		}
		if installed := installedVersion(serverRoot, name); installed != "" {
			return "^" + installed
		}
		return "*"
	}
	return "*"
}

// installedVersion walks node_modules upward from dir, as node resolves a package.
func installedVersion(dir, name string) string {
	for current := dir; ; current = filepath.Dir(current) {
		if content, err := os.ReadFile(filepath.Join(current, "node_modules", filepath.FromSlash(name), "package.json")); err == nil {
			var pkg struct {
				Version string `json:"version"`
			}
			if json.Unmarshal(content, &pkg) == nil && pkg.Version != "" {
				return pkg.Version
			}
		}
		if filepath.Dir(current) == current {
			return ""
		}
	}
}

// WritePackage replaces outDir, refusing a non-empty one it did not write, so a wrong --out never wipes a project.
func WritePackage(outDir string, files map[string]string) error {
	if entries, err := os.ReadDir(outDir); err == nil && len(entries) > 0 {
		if apitypesmeta.ReadPackage(outDir, osvfs.FS()).MarkerPath == "" {
			return fmt.Errorf("api types: %s is not empty and was not written by `mion api-types`; pick another --out or empty it", outDir)
		}
		if err := os.RemoveAll(outDir); err != nil {
			return fmt.Errorf("api types: clean %s: %w", outDir, err)
		}
	}
	for rel, text := range files {
		target := filepath.Join(outDir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return fmt.Errorf("api types: mkdir %s: %w", target, err)
		}
		if err := os.WriteFile(target, []byte(text), 0o644); err != nil {
			return fmt.Errorf("api types: write %s: %w", target, err)
		}
	}
	return nil
}
