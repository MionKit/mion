package apitypes

import (
	"encoding/json"
	"fmt"
	"path"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/vfs/osvfs"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnindex"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
)

// vendorDir holds the other packages' pure fns a types package ships, hidden so its own artifact walk skips them.
const vendorDir = constants.ApiTypesManifestDir + "/vendor"

type vendored struct {
	files    map[string]string
	dirs     map[string]string
	peers    []string
	warnings []string
}

// vendorPureFns copies the pure fns other packages own, with their dependencies, out of each package's installed
// artifact, so a client need not install those packages. A mion package stays a peer, and so does one whose
// artifact cannot serve an id.
func vendorPureFns(serverRoot string, ids []string) vendored {
	out := vendored{files: map[string]string{}, dirs: map[string]string{}}
	store := purefnindex.NewStore(osvfs.FS())
	rows := map[string][]purefnindex.ArtifactIndexRow{}
	modules := map[string]map[string]string{}
	peers := map[string]bool{}
	type demand struct{ id, fromDir string }
	queue := make([]demand, 0, len(ids))
	for _, id := range ids {
		queue = append(queue, demand{id: id, fromDir: serverRoot})
	}
	seen := map[string]bool{}
	for len(queue) > 0 {
		next := queue[0]
		queue = queue[1:]
		owner := purefnindex.PackageOfID(next.id)
		if seen[next.id] || owner == "" {
			continue
		}
		seen[next.id] = true
		if strings.HasPrefix(owner, "@mionjs/") {
			peers[owner] = true
			continue
		}
		reason := ""
		root, found := store.ResolvePackage(owner, next.fromDir)
		var idx *purefnindex.PackageIndex
		if found {
			idx = store.Package(root)
		}
		row, hasRow := purefnRow(idx, next.id)
		text, hasText := "", false
		if hasRow {
			text, hasText = idx.ModuleText(next.id)
		}
		switch {
		case !found:
			reason = "it is not installed beside the server"
		case !hasRow || !hasText:
			reason = "it ships no mion-pure-fns/ artifact with that function (build it with mion)"
		}
		if reason != "" {
			peers[owner] = true
			out.warnings = append(out.warnings, fmt.Sprintf("the pure fn %s stays in %s, a peer dependency: %s", next.id, owner, reason))
			continue
		}
		rows[owner] = append(rows[owner], purefnindex.ArtifactIndexRow{ID: next.id, BindingName: row.BindingName})
		if modules[owner] == nil {
			modules[owner] = map[string]string{}
		}
		modules[owner][purefnindex.ModulePath(next.id)] = text
		for _, dependency := range row.PureFnDependencies {
			queue = append(queue, demand{id: dependency, fromDir: root})
		}
	}
	for owner, ownerRows := range rows {
		if peers[owner] {
			// One function it could not copy keeps the whole package a peer, which then serves the rest too.
			continue
		}
		dir := vendorDir + "/" + owner
		sort.Slice(ownerRows, func(i, j int) bool { return ownerRows[i].ID < ownerRows[j].ID })
		index := purefnindex.ArtifactIndex{Format: purefnindex.ArtifactFormat, Package: owner, PureFns: ownerRows}
		artifactDir := path.Join(dir, constants.PureFnArtifactDir)
		out.files[path.Join(artifactDir, constants.PureFnArtifactIndexFile)] = string(index.Render())
		for rel, text := range modules[owner] {
			out.files[path.Join(artifactDir, rel)] = text
		}
		packageJSON, _ := json.Marshal(map[string]string{"name": owner})
		out.files[path.Join(dir, "package.json")] = string(packageJSON) + "\n"
		out.dirs[owner] = "./" + dir
	}
	out.peers = sortedKeys(peers)
	sort.Strings(out.warnings)
	return out
}

func purefnRow(idx *purefnindex.PackageIndex, id string) (purefunctions.Entry, bool) {
	if idx == nil {
		return purefunctions.Entry{}, false
	}
	return idx.Row(id)
}
