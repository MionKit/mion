package runtype

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// A circular type referenced ONLY by a createX site emits NO reflection module
// anymore: the circular-reference guard became a compile-time option that bakes
// a path skeleton into the armed factory, so it needs no RunType graph at
// runtime. (Before, a createX-over-circular site rode the data bundle.)
func TestCircularCreateXEmitsNoBundle(t *testing.T) {
	dump := protocol.Dump{
		RunTypes: []*reflection.RunType{{ID: "circ", Kind: reflection.KindObject, IsCircular: true}},
		Sites:    []protocol.Site{{ID: "circ", FnId: "va1"}},
	}
	graph := CollectEntries(dump)
	if len(graph) != 0 {
		t.Fatalf("expected no runtype modules for a circular createX-only site, got %d", len(graph))
	}
}

// A non-circular type referenced only by a createX site emits NOTHING — the
// reflection runtype graph stays demand-driven (createX-only files pay zero
// reflection payload, the pre-existing contract).
func TestNonCircularCreateXEmitsNoBundle(t *testing.T) {
	dump := protocol.Dump{
		RunTypes: []*reflection.RunType{{ID: "plain", Kind: reflection.KindObject}},
		Sites:    []protocol.Site{{ID: "plain", FnId: "va1"}},
	}
	graph := CollectEntries(dump)
	if len(graph) != 0 {
		t.Fatalf("expected no runtype modules for a non-circular createX-only site, got %d", len(graph))
	}
}

// A reflection (getRunTypeId) site over a circular type STILL ships its graph
// via a facade + bundle — reflection payload is unchanged by the guard rework.
func TestCircularReflectionStillEmitsBundle(t *testing.T) {
	dump := protocol.Dump{
		RunTypes: []*reflection.RunType{{ID: "circ", Kind: reflection.KindObject, IsCircular: true}},
		Sites:    []protocol.Site{{ID: "circ"}}, // reflection-only (FnId empty)
	}
	graph := CollectEntries(dump)
	if len(graph) == 0 {
		t.Fatalf("expected reflection modules for a getRunTypeId circular site, got none")
	}
}
