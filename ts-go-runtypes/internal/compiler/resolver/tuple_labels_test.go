package resolver_test

import (
	"path/filepath"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// Tuple labels and function param names are ID-RELEVANT: canonical nodes are
// shared singletons carrying `children[].name` / `parameters[].name`, so two
// same-shape types differing only in labels/param names must intern as
// DIFFERENT nodes — otherwise whichever call site is scanned first supplies
// the names for both (the mion route-param-names bug).
//
// Fixtures live in internal/testfixtures/tuplelabels/, one file per variant,
// each containing BOTH getRunTypeId call shapes (marker coverage rule) so the
// static and value-inferred forms are asserted to converge per variant.

func tupleLabelsDir(t *testing.T) string {
	t.Helper()
	abs, err := filepath.Abs("../../testfixtures/tuplelabels")
	if err != nil {
		t.Fatalf("abs: %v", err)
	}
	return abs
}

func tupleLabelsSession(t *testing.T) *resolver.Session {
	t.Helper()
	p, err := program.New(program.Options{
		Cwd:            tupleLabelsDir(t),
		TsconfigPath:   "tsconfig.json",
		SingleThreaded: true,
	})
	if err != nil {
		t.Fatalf("program.New: %v", err)
	}
	r, err := resolver.New(p, resolver.Options{})
	if err != nil {
		t.Fatalf("resolver.New: %v", err)
	}
	t.Cleanup(r.Close)
	return r
}

// scanRootID scans one fixture file and returns its reflection-root id,
// asserting the file's TWO marker sites (static + reflect forms) resolve to
// the SAME id (form equivalence per the marker coverage rule).
func scanRootID(t *testing.T, r *resolver.Session, file string) string {
	t.Helper()
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{file}})
	if resp.Error != "" {
		t.Fatalf("scanFiles %s: %s", file, resp.Error)
	}
	if len(resp.Sites) != 2 {
		t.Fatalf("scanFiles %s: expected 2 sites (static + reflect), got %d", file, len(resp.Sites))
	}
	if resp.Sites[0].ID != resp.Sites[1].ID {
		t.Fatalf("scanFiles %s: static and reflect forms diverged (%q vs %q)", file, resp.Sites[0].ID, resp.Sites[1].ID)
	}
	return resp.Sites[0].ID
}

// nodeByID fetches a node from the full dump.
func nodeByID(t *testing.T, r *resolver.Session, id string) *reflection.RunType {
	t.Helper()
	dump := r.Dispatch(protocol.Request{Op: protocol.OpDump}).RunTypes
	for _, node := range dump {
		if node.ID == id {
			return node
		}
	}
	t.Fatalf("node %q not found in dump", id)
	return nil
}

// firstChildName resolves the root's first tuple-member ref and returns its
// projected label name.
func firstChildName(t *testing.T, r *resolver.Session, rootID string) string {
	t.Helper()
	root := nodeByID(t, r, rootID)
	if len(root.Children) == 0 {
		t.Fatalf("root %q has no children", rootID)
	}
	member := nodeByID(t, r, root.Children[0].ID)
	return member.Name
}

// firstParamName resolves the root's first parameter ref and returns its name.
func firstParamName(t *testing.T, r *resolver.Session, rootID string) string {
	t.Helper()
	root := nodeByID(t, r, rootID)
	if len(root.Parameters) == 0 {
		t.Fatalf("root %q has no parameters", rootID)
	}
	param := nodeByID(t, r, root.Parameters[0].ID)
	return param.Name
}

func TestTupleLabels_DistinctIDsAndOwnLabels(t *testing.T) {
	r := tupleLabelsSession(t)
	idS := scanRootID(t, r, "labeled_s.ts")
	idName := scanRootID(t, r, "labeled_name.ts")
	idPlain := scanRootID(t, r, "unlabeled.ts")

	if idS == idName {
		t.Fatalf("[s: string] and [name: string] must not share an id (got %q)", idS)
	}
	if idS == idPlain || idName == idPlain {
		t.Fatalf("labeled and unlabeled [string] must not share ids (s=%q name=%q plain=%q)", idS, idName, idPlain)
	}

	if got := firstChildName(t, r, idS); got != "s" {
		t.Fatalf("labeled_s member name: want %q, got %q", "s", got)
	}
	if got := firstChildName(t, r, idName); got != "name" {
		t.Fatalf("labeled_name member name: want %q, got %q", "name", got)
	}
	if got := firstChildName(t, r, idPlain); got != "" {
		t.Fatalf("unlabeled member name: want empty, got %q", got)
	}
}

func TestTupleLabels_ScanOrderIndependent(t *testing.T) {
	// Order A: s first. Order B: name first. Ids and labels must not depend on
	// which site interned the shape first.
	rA := tupleLabelsSession(t)
	aS := scanRootID(t, rA, "labeled_s.ts")
	aName := scanRootID(t, rA, "labeled_name.ts")
	labelAS, labelAName := firstChildName(t, rA, aS), firstChildName(t, rA, aName)

	rB := tupleLabelsSession(t)
	bName := scanRootID(t, rB, "labeled_name.ts")
	bS := scanRootID(t, rB, "labeled_s.ts")
	labelBS, labelBName := firstChildName(t, rB, bS), firstChildName(t, rB, bName)

	if aS != bS || aName != bName {
		t.Fatalf("ids depend on scan order: s %q/%q, name %q/%q", aS, bS, aName, bName)
	}
	if labelAS != "s" || labelBS != "s" || labelAName != "name" || labelBName != "name" {
		t.Fatalf("labels depend on scan order: s %q/%q, name %q/%q", labelAS, labelBS, labelAName, labelBName)
	}
}

func TestFnParamNames_DistinctIDsAndOwnNames(t *testing.T) {
	r := tupleLabelsSession(t)
	idA := scanRootID(t, r, "fn_a.ts")
	idB := scanRootID(t, r, "fn_b.ts")
	if idA == idB {
		t.Fatalf("(a: string) => number and (b: string) => number must not share an id (got %q)", idA)
	}
	if got := firstParamName(t, r, idA); got != "a" {
		t.Fatalf("fn_a param name: want %q, got %q", "a", got)
	}
	if got := firstParamName(t, r, idB); got != "b" {
		t.Fatalf("fn_b param name: want %q, got %q", "b", got)
	}
}
