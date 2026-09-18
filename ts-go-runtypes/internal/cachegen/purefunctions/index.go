package purefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// Index is a lookup-only view of an extraction result, keyed by pure-fn id:
// every successful registration the extractor saw, the same map shape consumers
// see in virtual:runtypes-pure-fns. The resolver builds one after
// ExtractFromProgramCached and reuses it for dep validation, so every check is
// O(1).
//
// Not safe for concurrent use; build per-dump.
type Index struct {
	byKey map[string]Entry
	// LibraryDep, when set, reports an id owned by an installed package. Such
	// an edge is validated at SERVE time against that package's compiled files
	// (the resolver's package pure-fn step), the same reason the package's own
	// built-ins are skipped below, so it is never a miss here.
	LibraryDep func(id string) bool
}

// NewIndex builds the lookup view from an extraction result.
func NewIndex(entries []Entry) *Index {
	idx := &Index{byKey: make(map[string]Entry, len(entries))}
	for _, entry := range entries {
		idx.byKey[entry.Key()] = entry
	}
	return idx
}

// Get returns the Entry registered under id if any, plus an ok flag.
func (idx *Index) Get(id string) (Entry, bool) {
	entry, ok := idx.byKey[id]
	return entry, ok
}

// ValidatePureFnDependencies cross-checks every dep recorded by RT walkers
// against idx, an O(1) map lookup each.
//
// The package's own pure fns are skipped: they are validated against the
// installed package at SERVE time instead (servePackagePureFns delivers each
// demanded one and raises PFE9012 for one the package lacks). That check is
// graph-based, so it also covers warm disk-cache hits this sink-based pass never
// sees, and it is the only one that can work for a consumer whose program sees
// run-types as a .d.ts with no registrations in it.
//
// Returns one PFE9012 diagnostic per unique missing id. Repeated references to
// the same missing id collapse to a single diagnostic — the RT compiler may
// register the same dep from multiple emitters and we don't want N copies of the
// same complaint in the editor's Problems panel.
func ValidatePureFnDependencies(deps []protocol.PureFnDep, idx *Index) []diagnostics.Diagnostic {
	if idx == nil {
		return nil
	}
	var diags []diagnostics.Diagnostic
	seenMisses := make(map[string]bool, len(deps))
	for _, dep := range deps {
		if purefnids.Has(dep.ID) {
			continue
		}
		if _, found := idx.Get(dep.ID); found {
			continue
		}
		if idx.LibraryDep != nil && idx.LibraryDep(dep.ID) {
			continue
		}
		if seenMisses[dep.ID] {
			continue
		}
		seenMisses[dep.ID] = true
		// No Site — the dep was collected from a RT walk, not a TS source
		// position. Future enhancement: have the rt walker thread the source
		// position of the utl.getPureFn(...) call through to here.
		diags = append(diags, diagnostics.New(
			diagnostics.CodeMissingPureFnDep,
			diagnostics.Site{},
			dep.ID,
		))
	}
	return diags
}
