package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

func newTestWalker() *Walker {
	rt := &reflection.RunType{Kind: reflection.KindString, ID: "root"}
	return NewWalker(rt, "val_root", ValidateEmitter{})
}

func TestNewWalker_DepsSlicesNonNilEmpty(t *testing.T) {
	w := newTestWalker()
	if w.RTDependencies == nil {
		t.Fatal("RTDependencies must be initialized as non-nil empty slice (rendered as `[]`, not `null`)")
	}
	if len(w.RTDependencies) != 0 {
		t.Fatalf("expected RTDependencies len 0, got %d", len(w.RTDependencies))
	}
	if w.PureFnDependencies == nil {
		t.Fatal("PureFnDependencies must be initialized as non-nil empty slice")
	}
	if len(w.PureFnDependencies) != 0 {
		t.Fatalf("expected PureFnDependencies len 0, got %d", len(w.PureFnDependencies))
	}
}

func TestUpdateDependencies_AppendsOnce(t *testing.T) {
	w := newTestWalker()
	w.UpdateDependencies("childA", false)
	w.UpdateDependencies("childB", false)
	if len(w.RTDependencies) != 2 {
		t.Fatalf("expected 2 deps, got %d (%v)", len(w.RTDependencies), w.RTDependencies)
	}
	if w.RTDependencies[0] != "childA" || w.RTDependencies[1] != "childB" {
		t.Fatalf("expected [childA childB], got %v", w.RTDependencies)
	}
}

func TestUpdateDependencies_DedupesRepeats(t *testing.T) {
	w := newTestWalker()
	w.UpdateDependencies("childA", false)
	w.UpdateDependencies("childA", false)
	w.UpdateDependencies("childA", false)
	if len(w.RTDependencies) != 1 {
		t.Fatalf("expected 1 dep after repeated adds, got %d (%v)", len(w.RTDependencies), w.RTDependencies)
	}
}

func TestUpdateDependencies_SkipsNoopChildren(t *testing.T) {
	w := newTestWalker()
	w.UpdateDependencies("childNoop", true)
	w.UpdateDependencies("childReal", false)
	if len(w.RTDependencies) != 1 {
		t.Fatalf("expected only the non-noop child, got %v", w.RTDependencies)
	}
	if w.RTDependencies[0] != "childReal" {
		t.Fatalf("expected [childReal], got %v", w.RTDependencies)
	}
}

// AddPureFnDependency is record-only: it appends the id and dedupes. The
// dependency is checked against the registrations the build found later, by the
// resolver's own pass.

func TestAddPureFnDependency_RecordsID(t *testing.T) {
	w := newTestWalker()
	w.AddPureFnDependency("@acme/app/src/pure#pf_asJSONString")
	if len(w.PureFnDependencies) != 1 {
		t.Fatalf("expected 1 dep, got %d (%v)", len(w.PureFnDependencies), w.PureFnDependencies)
	}
	if got := w.PureFnDependencies[0]; got.ID != "@acme/app/src/pure#pf_asJSONString" {
		t.Fatalf("id mismatch: got %+v", got)
	}
}

func TestAddPureFnDependency_NoValidationAtCallSite(t *testing.T) {
	// The whole point of the optimization: appending is O(1) and does NOT touch
	// the filesystem, so an id nothing registers still records cleanly.
	w := newTestWalker()
	w.AddPureFnDependency("@acme/app/src/pure#pf_asJSONString")
	if len(w.PureFnDependencies) != 1 {
		t.Fatalf("expected the id to be recorded without any lookup, got %v", w.PureFnDependencies)
	}
}

func TestAddPureFnDependency_DedupesRepeatedID(t *testing.T) {
	w := newTestWalker()
	for i := 0; i < 3; i++ {
		w.AddPureFnDependency("@acme/app/src/pure#pf_asJSONString")
	}
	if len(w.PureFnDependencies) != 1 {
		t.Fatalf("expected 1 dep after 3 identical appends, got %d (%v)", len(w.PureFnDependencies), w.PureFnDependencies)
	}
}

func TestAddPureFnDependency_DifferentIDsAreDistinctEntries(t *testing.T) {
	// Two pure fns with the same NAME in different files are two ids, so both
	// are recorded: the file half is what tells them apart.
	w := newTestWalker()
	w.AddPureFnDependency("@acme/app/src/pure#pf_asJSONString")
	w.AddPureFnDependency("@acme/app/src/helpers#pf_asJSONString")
	if len(w.PureFnDependencies) != 2 {
		t.Fatalf("expected 2 distinct entries, got %d (%v)", len(w.PureFnDependencies), w.PureFnDependencies)
	}
}

// ---------------------------------------------------------------------------
// createFnInContext / wrapAsCtxFn — the context-function mechanism that
// replaces per-call IIFEs. A block lands in the factory prologue as
// `const ctxFn<N> = function(<params>){…}` (created once per
// materialization) and the expression slot receives `ctxFn<N>(<args>)`.
// ---------------------------------------------------------------------------

func TestCreateFnInContext_CodeSPrependsReturn(t *testing.T) {
	w := newTestWalker()
	call := w.createFnInContext("doThing(v)", CodeS, []string{"v"}, []string{"v"})
	if call != "ctxFn0(v)" {
		t.Fatalf("call expression mismatch: %q", call)
	}
	want := "const ctxFn0 = function(v){return doThing(v)}"
	if got := w.ContextLines(); !strings.Contains(got, want) {
		t.Fatalf("context line mismatch:\n got: %q\nwant substring: %q", got, want)
	}
}

func TestCreateFnInContext_CodeRBVerbatim(t *testing.T) {
	w := newTestWalker()
	body := "if (x) return 1; return 2;"
	call := w.createFnInContext(body, CodeRB, []string{"v"}, []string{"v"})
	if call != "ctxFn0(v)" {
		t.Fatalf("call expression mismatch: %q", call)
	}
	want := "const ctxFn0 = function(v){" + body + "}"
	if got := w.ContextLines(); !strings.Contains(got, want) {
		t.Fatalf("CodeRB body must move verbatim (no return prefix):\n got: %q\nwant substring: %q", got, want)
	}
	if strings.Contains(w.ContextLines(), "{return if") {
		t.Fatalf("CodeRB must not get a return prefix: %q", w.ContextLines())
	}
}

func TestCreateFnInContext_NamesIncrementAndDeclareInOrder(t *testing.T) {
	w := newTestWalker()
	first := w.createFnInContext("inner(v)", CodeS, []string{"v"}, []string{"v"})
	second := w.createFnInContext("if (ok(v)) return ctxFn0(v); return false;", CodeRB, []string{"v"}, []string{"v"})
	if first != "ctxFn0(v)" || second != "ctxFn1(v)" {
		t.Fatalf("expected ctxFn0/ctxFn1, got %q / %q", first, second)
	}
	lines := w.ContextLines()
	inner := strings.Index(lines, "const ctxFn0 = ")
	outer := strings.Index(lines, "const ctxFn1 = ")
	if inner < 0 || outer < 0 || inner > outer {
		t.Fatalf("nested ctxFns must declare in allocation order (inner first):\n%s", lines)
	}
}

func TestWrapAsCtxFn_PassesAllocatedAccessorCounters(t *testing.T) {
	w := newTestWalker()
	loopVar := w.nextLocalVar("i") // i0 — an allocated enclosing loop counter
	w.Vλl = "v[" + loopVar + "].name"
	out := w.wrapAsCtxFn(RTCode{Code: "for (const k0 in v[i0]) { if (!v[i0][k0]) return false; } return true;", Type: CodeRB})
	if out.Type != CodeE {
		t.Fatalf("wrapAsCtxFn must return a CodeE call, got %q", out.Type)
	}
	if out.Code != "ctxFn0(v,i0)" {
		t.Fatalf("call must pass the family arg + the allocated counter: %q", out.Code)
	}
	if !strings.Contains(w.ContextLines(), "const ctxFn0 = function(v,i0){for (const k0 in v[i0])") {
		t.Fatalf("ctxFn params must mirror the call args by name:\n%s", w.ContextLines())
	}
}

func TestWrapAsCtxFn_IgnoresLookalikePropertyNames(t *testing.T) {
	w := newTestWalker()
	// No `i` allocations this walk: a property merely NAMED i0 (dot or
	// bracket-quoted) must not become a parameter.
	w.Vλl = "v.i0"
	out := w.wrapAsCtxFn(RTCode{Code: "return !!v.i0;", Type: CodeRB})
	if out.Code != "ctxFn0(v)" {
		t.Fatalf("dot-property i0 must not be a param: %q", out.Code)
	}
	w2 := newTestWalker()
	w2.Vλl = "v['i0']"
	out2 := w2.wrapAsCtxFn(RTCode{Code: "return !!v['i0'];", Type: CodeRB})
	if out2.Code != "ctxFn0(v)" {
		t.Fatalf("unallocated bracket-key i0 must not be a param: %q", out2.Code)
	}
}

func TestWrapAsCtxFn_EmptyBodyStaysEmpty(t *testing.T) {
	w := newTestWalker()
	out := w.wrapAsCtxFn(RTCode{Code: "  ", Type: CodeS})
	if out.Code != "" || out.Type != CodeE {
		t.Fatalf("empty block must produce no call and no context line: %+v", out)
	}
	if strings.Contains(w.ContextLines(), "ctxFn") {
		t.Fatalf("no ctxFn may be registered for an empty block: %q", w.ContextLines())
	}
}
