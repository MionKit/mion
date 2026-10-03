// Package apitypesmeta reads and writes what marks a types-only API package as built by `mion api-types`: the
// package.json `mion.apiTypes` field and the marker file it names. A leaf, so the pure-fn index can read it too.
package apitypesmeta

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/shim/tspath"
	vfspkg "github.com/microsoft/typescript-go/shim/vfs"
)

// MarkerFormat is the marker's `format`; a higher one is a newer compiler's and is refused, never misread.
const MarkerFormat = 1

// Marker is the content of constants.ApiTypesMarkerFile.
type Marker struct {
	Format int `json:"format"`
	// Package is the server package the types come from: its pure fn ids carry this name.
	Package      string `json:"package"`
	Compiler     string `json:"compiler"`
	BuildVersion string `json:"buildVersion"`
}

// Render writes the marker as indented JSON with a trailing newline.
func (marker Marker) Render() string {
	encoded, _ := json.MarshalIndent(marker, "", "  ")
	return string(encoded) + "\n"
}

// PackageInfo is what a client needs to know about an installed package to judge it as a types-only API package.
type PackageInfo struct {
	Name string
	// TypesOnly is a package.json with types and no JavaScript entry.
	TypesOnly bool
	// MarkerPath is the `mion.apiTypes` field as written; "" when absent.
	MarkerPath string
	// Marker is nil when the field is absent or the file cannot be used; Problem then says why.
	Marker  *Marker
	Problem string
}

type packageJSON struct {
	Name    string          `json:"name"`
	Main    string          `json:"main"`
	Module  string          `json:"module"`
	Browser json.RawMessage `json:"browser"`
	Exports json.RawMessage `json:"exports"`
	Mion    struct {
		ApiTypes string `json:"apiTypes"`
	} `json:"mion"`
}

// ReadPackage reads the package.json at root and, for a types-only package, its marker.
func ReadPackage(root string, fs vfspkg.FS) PackageInfo {
	content, ok := fs.ReadFile(tspath.CombinePaths(root, "package.json"))
	if !ok {
		return PackageInfo{}
	}
	var pkg packageJSON
	if json.Unmarshal([]byte(content), &pkg) != nil {
		return PackageInfo{}
	}
	info := PackageInfo{Name: pkg.Name, MarkerPath: pkg.Mion.ApiTypes}
	info.TypesOnly = pkg.Main == "" && pkg.Module == "" && len(pkg.Browser) == 0 && exportsTypesOnly(pkg.Exports) &&
		(len(pkg.Exports) > 0 || !hasRootIndex(root, fs))
	if info.MarkerPath == "" {
		info.Problem = "its package.json has no `mion.apiTypes` field"
		return info
	}
	markerFile := tspath.ResolvePath(root, info.MarkerPath)
	markerText, ok := fs.ReadFile(markerFile)
	if !ok {
		info.Problem = fmt.Sprintf("the marker %s its package.json names is missing", info.MarkerPath)
		return info
	}
	var marker Marker
	switch {
	case json.Unmarshal([]byte(markerText), &marker) != nil || marker.Package == "" || marker.Format < 1 || marker.Compiler == "":
		info.Problem = fmt.Sprintf("the marker %s is not a mion API marker", info.MarkerPath)
	case marker.Format > MarkerFormat:
		info.Problem = fmt.Sprintf("the marker %s has format %d, newer than this compiler reads (%d)", info.MarkerPath, marker.Format, MarkerFormat)
	default:
		info.Marker = &marker
	}
	return info
}

// hasRootIndex: with no `main` and no `exports`, Node and bundlers load the root index, so the package has JS.
func hasRootIndex(root string, fs vfspkg.FS) bool {
	for _, name := range []string{"index.js", "index.mjs", "index.cjs"} {
		if fs.FileExists(tspath.CombinePaths(root, name)) {
			return true
		}
	}
	return false
}

// exportsTypesOnly reports an `exports` map whose every target sits under a `types` condition or is a .d.ts; an
// absent map counts as types-only, since `main` and `module` were checked already.
func exportsTypesOnly(raw json.RawMessage) bool {
	if len(raw) == 0 {
		return true
	}
	var value any
	if json.Unmarshal(raw, &value) != nil {
		return false
	}
	return targetsTypesOnly(value, false)
}

func targetsTypesOnly(value any, underTypes bool) bool {
	switch typed := value.(type) {
	case nil:
		return true
	case string:
		return underTypes || strings.HasSuffix(typed, ".d.ts") || strings.HasSuffix(typed, ".d.mts") || strings.HasSuffix(typed, ".d.cts")
	case []any:
		for _, entry := range typed {
			if !targetsTypesOnly(entry, underTypes) {
				return false
			}
		}
		return true
	case map[string]any:
		for key, entry := range typed {
			if !targetsTypesOnly(entry, underTypes || key == "types") {
				return false
			}
		}
		return true
	}
	return false
}
