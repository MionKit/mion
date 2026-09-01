package resolver

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// recordFileIDs walks every RunType transitively reachable from `sites` and
// notes the visited wire ids against `file` in the per-file scope map. The
// resulting map drives the "scanned files" semantics for IncludeRunTypes /
// IncludeCacheSources — see scopedDump.
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
		// Walk every ref-carrying slot (see protocol.EachRefSlot for the
		// slot rationale). Inline scalar RunTypes (no .ID) don't reach
		// further nodes — walk("") returns immediately.
		node.EachRefSlot(func(ref *reflection.RunType) { walk(ref.ID) })
	}
	for _, site := range sites {
		walk(site.ID)
	}
}

// scopedDump builds a protocol.Dump covering only the supplied files —
// the request's per-call projection, not a session-wide accumulation.
// RunTypes are sorted by id (cache guarantees) and sites are filtered to
// the same file allowlist. Callers wanting the full in-memory cache use
// dispatchDump instead.
func (sess *Session) scopedDump(files []string) protocol.Dump {
	// The projected nodes are the interned nodes (pointers), so enrich
	// sample-less pattern annotations before they go on the wire — the
	// IncludeRunTypes-without-render lane's counterpart to the
	// rtRenderOpts call (idempotent + memoized, so double-running in one
	// dispatch costs a map pass).
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
