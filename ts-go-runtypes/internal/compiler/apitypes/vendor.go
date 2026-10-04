package apitypes

import (
	"encoding/json"
	"fmt"
	"maps"
	"path"
	"slices"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/vfs/osvfs"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnindex"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
)

type vendored struct {
	files    map[string]string
	dirs     map[string]string
	peers    []string
	warnings []string
}

// vendorPureFns copies other packages' pure fns from their installed artifacts, so a client need not install them.
// A mion package stays a peer, and so does one whose artifact cannot serve an id.
func vendorPureFns(serverRoot string, ids []string) vendored {
	out := vendored{files: map[string]string{}, dirs: map[string]string{}}
	store := purefnindex.NewStore(osvfs.FS())
	demands := make([]purefnindex.Demand, 0, len(ids))
	for _, id := range ids {
		demands = append(demands, purefnindex.Demand{ID: id, FromDir: serverRoot})
	}
	closure := store.Closure(demands)
	peers := map[string]bool{}
	keepPeer := func(id, reason string) {
		owner := purefnindex.PackageOfID(id)
		peers[owner] = true
		// A mion package is a peer by design, never a fallback worth a warning.
		if reason != "" && !strings.HasPrefix(owner, "@mionjs/") {
			out.warnings = append(out.warnings, fmt.Sprintf("the pure fn %s stays in %s, a peer dependency: %s", id, owner, reason))
		}
	}
	for _, id := range closure.Unresolved {
		keepPeer(id, "it is not installed beside the server")
	}
	for _, miss := range closure.Missing {
		keepPeer(miss.ID, "it ships no mion-pure-fns/ artifact with that function (build it with mion)")
	}
	rows := map[string][]purefnindex.ArtifactIndexRow{}
	modules := map[string]map[string]string{}
	for _, entry := range closure.Entries {
		id := entry.Key()
		owner := purefnindex.PackageOfID(id)
		if strings.HasPrefix(owner, "@mionjs/") {
			keepPeer(id, "")
			continue
		}
		text, ok := store.Package(closure.Roots[id]).ModuleText(id)
		if !ok {
			keepPeer(id, "it ships no mion-pure-fns/ artifact with that function (build it with mion)")
			continue
		}
		rows[owner] = append(rows[owner], purefnindex.ArtifactIndexRow{ID: id, BindingName: entry.BindingName})
		if modules[owner] == nil {
			modules[owner] = map[string]string{}
		}
		modules[owner][purefnindex.ModulePath(id)] = text
	}
	for owner, ownerRows := range rows {
		if peers[owner] {
			// One function it could not copy keeps the whole package a peer, which then serves the rest too.
			continue
		}
		dir := purefnindex.VendorDir + "/" + owner
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
	out.peers = slices.Sorted(maps.Keys(peers))
	sort.Strings(out.warnings)
	return out
}
