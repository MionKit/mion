package runtype

import (
	"testing"

	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// The full cross-checker projection path (real types materialized by two
// pool checkers deduping to one wire id) is exercised end-to-end by the
// parallel-scan equivalence tests in internal/compiler/resolver. These tests pin
// the AssignIDUnder primitive itself: fast-path routing, bound-state
// restore, computer memoization, and lifecycle on Clear/Rebind.

// TestAssignIDUnder_FastPathMatchesAssignID pins that a nil checker and
// the bound checker both take the plain assignID path — same id, no
// foreign-computer allocation.
func TestAssignIDUnder_FastPathMatchesAssignID(t *testing.T) {
	cache := NewCache(nil, Options{})
	direct := cache.AssignID(nil)
	viaNil := cache.AssignIDUnder(nil, nil)
	if direct != viaNil {
		t.Fatalf("AssignIDUnder(nil, …) = %q, want AssignID result %q", viaNil, direct)
	}
	if cache.foreignComputers != nil {
		t.Fatalf("fast path must not allocate foreignComputers")
	}
	if size := cache.Size(); size != 1 {
		t.Fatalf("nil-type intern should dedup to one entry, got %d", size)
	}
}

// TestAssignIDUnder_RestoresBoundState pins that the foreign-checker path
// swaps the bound checker/computer for the projection and restores both
// afterwards, and that the same foreign checker reuses its memoized
// Computer on later calls.
func TestAssignIDUnder_RestoresBoundState(t *testing.T) {
	cache := NewCache(nil, Options{})
	boundChecker := cache.typeChecker
	boundComputer := cache.idComputer

	// A nil tsType never dereferences the checker (internEmpty path), so a
	// zero-value checker is a safe stand-in for "some other pool checker".
	foreign := new(checker.Checker)
	id := cache.AssignIDUnder(foreign, nil)
	if id == "" {
		t.Fatalf("expected an interned id for the nil-type sentinel")
	}
	if cache.typeChecker != boundChecker || cache.idComputer != boundComputer {
		t.Fatalf("bound checker/computer not restored after AssignIDUnder")
	}
	firstComputer := cache.foreignComputers[foreign]
	if firstComputer == nil {
		t.Fatalf("foreign computer not memoized")
	}
	cache.AssignIDUnder(foreign, nil)
	if cache.foreignComputers[foreign] != firstComputer {
		t.Fatalf("foreign computer not reused on second call")
	}
}

// TestAssignIDUnder_ForeignSharesStructuralDedup pins that an entry minted
// under a foreign checker lands in the same structural table the bound
// path reads — the cross-checker dedup contract at the cache level.
func TestAssignIDUnder_ForeignSharesStructuralDedup(t *testing.T) {
	cache := NewCache(nil, Options{})
	foreign := new(checker.Checker)
	foreignID := cache.AssignIDUnder(foreign, nil)
	boundID := cache.AssignID(nil)
	if foreignID != boundID {
		t.Fatalf("foreign-path id %q != bound-path id %q for the same shape", foreignID, boundID)
	}
	if node := cache.NodeByID(foreignID); node == nil || node.Kind != reflection.KindUnknown {
		t.Fatalf("canonical node missing or wrong kind for %q", foreignID)
	}
}

// TestAssignIDUnder_LifecycleDropsForeignComputers pins that Clear and
// Rebind drop the per-checker computer memo (its keys point into dead
// checker state after a Program swap, same rationale as byPtr).
func TestAssignIDUnder_LifecycleDropsForeignComputers(t *testing.T) {
	foreign := new(checker.Checker)

	cleared := NewCache(nil, Options{})
	cleared.AssignIDUnder(foreign, nil)
	if cleared.foreignComputers == nil {
		t.Fatalf("setup: foreign computer expected before Clear")
	}
	cleared.Clear()
	if cleared.foreignComputers != nil {
		t.Fatalf("Clear must drop foreignComputers")
	}

	rebound := NewCache(nil, Options{})
	rebound.AssignIDUnder(foreign, nil)
	rebound.Rebind(nil)
	if rebound.foreignComputers != nil {
		t.Fatalf("Rebind must drop foreignComputers")
	}
}
