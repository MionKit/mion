package resolver

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// recordFileIDs notes every wire id reachable from `sites` against `file`; that per-file map is what
// makes IncludeRunTypes / IncludeCacheSources mean "scanned files" (see scopedDump).
func (sess *Session) recordFileIDs(file string, sites []protocol.Site) {
	if file == "" || len(sites) == 0 {
		return
	}
	visited := make(map[string]struct{})
	var walk func(id string)
	walk = func(id string) {
		if id == "" {
			return
		}
		if _, seen := visited[id]; seen {
			return
		}
		visited[id] = struct{}{}
		sess.cache.RecordFileID(file, id)
		node := sess.cache.NodeByID(id)
		if node == nil {
			return
		}
		// An inline scalar RunType has no .ID and reaches no further node; walk("") returns at once.
		node.EachRefSlot(func(ref *reflection.RunType) { walk(ref.ID) })
	}
	for _, site := range sites {
		walk(site.ID)
	}
}

// scopedDump projects a protocol.Dump over the supplied files only, per call, never a session-wide
// accumulation; RunTypes come sorted by id from the cache. The full in-memory cache is dispatchDump.
func (sess *Session) scopedDump(files []string) protocol.Dump {
	// The projected nodes are the interned pointers, so fill pattern samples before they go on the
	// wire; this is the rtRenderOpts call's counterpart, idempotent and memoized down to a map pass.
	sess.enrichPatternSamples()
	ids := sess.cache.IDsForUnion(files)
	allowed := make(map[string]struct{}, len(files))
	for _, file := range files {
		allowed[file] = struct{}{}
	}
	sites := make([]protocol.Site, 0, len(sess.sites))
	for _, site := range sess.sites {
		if _, ok := allowed[site.File]; ok {
			sites = append(sites, site)
		}
	}
	runTypes := sess.cache.NodesForIDs(ids)
	return protocol.Dump{RunTypes: runTypes, Sites: sites}
}
