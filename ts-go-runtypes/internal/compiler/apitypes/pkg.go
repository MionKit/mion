package apitypes

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnindex"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/apitypes/apitypesmeta"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
)

// MionPeers are the packages every client of a mion API builds against.
var MionPeers = []string{"@mionjs/core", "@mionjs/router", "@mionjs/run-types"}

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
	for rel, text := range input.PureFnArtifact {
		files[path.Join(constants.PureFnArtifactDir, filepath.ToSlash(rel))] = text
	}
	files[path.Join(constants.ApiTypesManifestDir, constants.ApiModuleDir, constants.ApiManifestFile)] = input.Manifest
	files[constants.ApiTypesMarkerFile] = apitypesmeta.Marker{
		Format: apitypesmeta.MarkerFormat, Package: server.Name, Compiler: input.Compiler, BuildVersion: input.Trimmed.BuildVersion,
	}.Render()

	peers, err := peerDependencies(input, server)
	if err != nil {
		return nil, err
	}
	name := input.Name
	if name == "" {
		name = server.Name + "-types"
	}
	version := input.Version
	if version == "" {
		version = server.Version
	}
	if version == "" {
		version = "0.0.0"
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
	manifest := orderedJSON{
		{"name", name},
		{"version", version},
		{"description", "Types-only client package for " + server.Name + ", built by `mion api-types`."},
		{"license", server.License},
		{"author", server.Author},
		{"repository", server.Repository},
		{"homepage", server.Homepage},
		{"types", entry},
		// "./*" lets a client that writes its own .d.ts name a type from any kept file (TS2883 otherwise).
		{"exports", map[string]any{".": map[string]string{"types": entry}, "./*": map[string]string{"types": "./*.d.ts"}}},
		{"files", published},
		{"mion", map[string]string{"apiTypes": apitypesmeta.MarkerFileName()}},
		{"peerDependencies", peers},
	}
	files["package.json"] = manifest.render()
	return files, nil
}

// peerDependencies lists the mion packages, every package the kept declarations import and every package a shipped
// pure fn depends on, each with the server's own range.
func peerDependencies(input PackageInput, server serverPackage) (map[string]string, error) {
	names := map[string]bool{}
	for _, peer := range MionPeers {
		names[peer] = true
	}
	for _, external := range input.Trimmed.Externals {
		names[external] = true
	}
	if indexText, ok := input.PureFnArtifact[constants.PureFnArtifactIndexFile]; ok {
		index, err := purefnindex.ParseArtifactIndex([]byte(indexText))
		if err != nil {
			return nil, fmt.Errorf("api types: the server's %s/%s: %w", constants.PureFnArtifactDir, constants.PureFnArtifactIndexFile, err)
		}
		for _, row := range index.PureFns {
			entry, err := purefnindex.ReadModule(row.ID, input.PureFnArtifact[purefnindex.ModulePath(row.ID)])
			if err != nil {
				return nil, fmt.Errorf("api types: the server's pure fn %s: %w", row.ID, err)
			}
			for _, dependency := range entry.PureFnDependencies {
				if owner := purefnindex.PackageOfID(dependency); owner != "" {
					names[owner] = true
				}
			}
		}
	}
	delete(names, server.Name)
	peers := map[string]string{}
	for name := range names {
		peers[name] = rangeOf(input.ServerRoot, name, server)
	}
	return peers, nil
}

// rangeOf is the server's range for name; a workspace range becomes a caret on the installed version, none is "*".
func rangeOf(serverRoot, name string, server serverPackage) string {
	for _, table := range []map[string]string{server.Dependencies, server.PeerDependencies, server.OptionalDependencies, server.DevDependencies} {
		declared, ok := table[name]
		if !ok {
			continue
		}
		if !strings.HasPrefix(declared, "workspace:") {
			return declared
		}
		if installed := installedVersion(serverRoot, name); installed != "" {
			return "^" + installed
		}
		return "*"
	}
	if installed := installedVersion(serverRoot, name); installed != "" {
		return "^" + installed
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

// WritePackage replaces outDir with files. It refuses a non-empty directory it did not write before, so a wrong
// --out never wipes a project.
func WritePackage(outDir string, files map[string]string) error {
	if entries, err := os.ReadDir(outDir); err == nil && len(entries) > 0 {
		previous, readErr := os.ReadFile(filepath.Join(outDir, "package.json"))
		var pkg struct {
			Mion struct {
				ApiTypes string `json:"apiTypes"`
			} `json:"mion"`
		}
		if readErr != nil || json.Unmarshal(previous, &pkg) != nil || pkg.Mion.ApiTypes == "" {
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

// orderedJSON renders an object in the given key order, skipping empty values, so package.json reads naturally.
type orderedJSON []struct {
	key   string
	value any
}

func (object orderedJSON) render() string {
	var buffer bytes.Buffer
	buffer.WriteString("{\n")
	first := true
	for _, field := range object {
		if isEmpty(field.value) {
			continue
		}
		encoded, _ := json.MarshalIndent(field.value, "  ", "  ")
		if !first {
			buffer.WriteString(",\n")
		}
		first = false
		key, _ := json.Marshal(field.key)
		buffer.WriteString("  " + string(key) + ": " + string(encoded))
	}
	buffer.WriteString("\n}\n")
	return buffer.String()
}

func isEmpty(value any) bool {
	switch typed := value.(type) {
	case nil:
		return true
	case string:
		return typed == ""
	case json.RawMessage:
		return len(typed) == 0
	}
	return false
}
