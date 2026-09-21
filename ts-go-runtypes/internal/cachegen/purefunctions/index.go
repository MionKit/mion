package purefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// Index is a lookup-only view of an extraction result, keyed by pure-fn id: every successful
// registration the extractor saw. The resolver builds one after ExtractFromProgramCached and
// reuses it for dep validation, so every check is O(1).
//
// Not safe for concurrent use; build per-dump.
type Index struct {
	byKey map[string]Entry
	// LibraryDep, when set, reports an id owned by an installed package. Such an edge is
	// validated at SERVE time against that package's compiled files (the resolver's package
	// pure-fn step), so it is never a miss here.
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

// ValidatePureFnDependencies cross-checks every dep recorded by RT walkers against idx.
//
// The package's own pure fns are skipped: they are validated against the installed package at
// SERVE time instead (servePackagePureFns raises PFE9012 for one the package lacks). That check is
// graph-based, so it also covers warm disk-cache hits this sink-based pass never sees, and it is
// the only one that works for a consumer whose program sees run-types as a .d.ts.
//
// Returns one PFE9012 per unique missing id: the RT compiler may register the same dep from
// several emitters, and the editor's Problems panel should not show N copies of one complaint.
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
		// No Site: the dep comes from an RT walk, not a TS source position.
		diags = append(diags, diagnostics.New(
			diagnostics.CodeMissingPureFnDep,
			diagnostics.Site{},
			dep.ID,
		))
	}
	return diags
}
