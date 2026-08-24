package resolver

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/compiler/entrymodules"
)

// White-box unit coverage for pruneUnreachableTypeFnEntries — the e2e tests
// in prune_test.go pin the end-to-end contract through real scans; these pin
// the graph semantics the helper must hold under shapes the demand machinery
// doesn't produce today (so a future producer can't silently regress them).

func typeFnEntry(key string, deps, softDeps []string) *entrymodules.Entry {
	return &entrymodules.Entry{Key: key, Kind: entrymodules.KindTypeFn, FamilyTag: "pj", ArgsText: "'" + key + "'", Deps: deps, SoftDeps: softDeps}
}

// TestPruneUnit_DropsOrphanChainsTransitively — an unreferenced entry takes
// its whole private dependency chain with it, while a demanded root keeps its
// own chain alive through the same edge kinds.
func TestPruneUnit_DropsOrphanChainsTransitively(t *testing.T) {
	graph := entrymodules.Graph{}
	graph.Add(typeFnEntry("root", []string{"childA"}, nil))
	graph.Add(typeFnEntry("childA", []string{"childB"}, nil))
	graph.Add(typeFnEntry("childB", nil, nil))
	graph.Add(typeFnEntry("orphan1", []string{"orphan2"}, nil))
	graph.Add(typeFnEntry("orphan2", nil, nil))

	pruneUnreachableTypeFnEntries(graph, []string{"root"})

	for _, key := range []string{"root", "childA", "childB"} {
		if graph[key] == nil {
			t.Errorf("demanded chain member %q must survive", key)
		}
	}
	for _, key := range []string{"orphan1", "orphan2"} {
		if graph[key] != nil {
			t.Errorf("orphan chain member %q must be pruned transitively", key)
		}
	}
}

// TestPruneUnit_SoftDepsCarryLiveness — soft edges (cross-family `val_`
// lookups, composite→primitive refs) keep their targets emitted exactly like
// hard deps: the module closure must load them.
func TestPruneUnit_SoftDepsCarryLiveness(t *testing.T) {
	graph := entrymodules.Graph{}
	graph.Add(typeFnEntry("decoder", nil, []string{"val_member"}))
	graph.Add(typeFnEntry("val_member", nil, nil))
	graph.Add(typeFnEntry("val_orphan", nil, nil))

	pruneUnreachableTypeFnEntries(graph, []string{"decoder"})

	if graph["val_member"] == nil {
		t.Error("soft-dep target of a live entry must survive")
	}
	if graph["val_orphan"] != nil {
		t.Error("unreferenced sibling must still be pruned")
	}
}

// TestPruneUnit_NonTypeFnKindsAreRoots — runtype bundle/facades, pure fns,
// and missing stubs never prune (their loading is driven by bindings outside
// the fn-site demand list), and a type-fn entry reachable only through a
// non-typefn root's edges stays live.
func TestPruneUnit_NonTypeFnKindsAreRoots(t *testing.T) {
	graph := entrymodules.Graph{}
	graph.Add(&entrymodules.Entry{Key: "runtypes", Kind: entrymodules.KindRunTypeBundle, ArgsText: "'runtypes'"})
	graph.Add(&entrymodules.Entry{Key: "facade1", Kind: entrymodules.KindRunTypeFacade, Deps: []string{"runtypes"}})
	graph.Add(&entrymodules.Entry{Key: "pf/ns/fn", Kind: entrymodules.KindPureFn, ArgsText: "'pf/ns/fn'", Deps: []string{"viaPureFn"}})
	graph.Add(&entrymodules.Entry{Key: "stub1", Kind: entrymodules.KindMissing})
	graph.Add(typeFnEntry("viaPureFn", nil, nil))

	pruneUnreachableTypeFnEntries(graph, nil)

	for _, key := range []string{"runtypes", "facade1", "pf/ns/fn", "stub1", "viaPureFn"} {
		if graph[key] == nil {
			t.Errorf("%q must survive the prune", key)
		}
	}
}

// TestPruneUnit_DemandedOrphanSurvives — a rewrite-injected binding resolves
// even when nothing else references it (the createValidateFn<any> shape).
func TestPruneUnit_DemandedOrphanSurvives(t *testing.T) {
	graph := entrymodules.Graph{}
	graph.Add(typeFnEntry("demandedNoop", nil, nil))
	graph.Add(typeFnEntry("orphanNoop", nil, nil))

	pruneUnreachableTypeFnEntries(graph, []string{"demandedNoop", "neverRendered"})

	if graph["demandedNoop"] == nil {
		t.Error("demanded entry must survive even with zero referencers")
	}
	if graph["orphanNoop"] != nil {
		t.Error("undemanded unreferenced entry must be pruned")
	}
}
