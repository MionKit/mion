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

// AddPureFnDependency is record-only: it appends the triple and
// dedupes. Build-time validation against the actual
// `registerPureFnFactory` registrations is the (unwired) purefunctions
// dep-validation API; until wired, an unregistered dep surfaces at runtime when
// `utl.getPureFn` throws.

func TestAddPureFnDependency_RecordsTriple(t *testing.T) {
	w := newTestWalker()
	w.AddPureFnDependency("rt", "asJSONString", "/abs/run-types-pure-fns.ts")
	if len(w.PureFnDependencies) != 1 {
		t.Fatalf("expected 1 dep, got %d (%v)", len(w.PureFnDependencies), w.PureFnDependencies)
	}
	got := w.PureFnDependencies[0]
	if got.Namespace != "rt" || got.FunctionName != "asJSONString" || got.FilePath != "/abs/run-types-pure-fns.ts" {
		t.Fatalf("triple mismatch: got %+v", got)
	}
}

func TestAddPureFnDependency_NoValidationAtCallSite(t *testing.T) {
	// The whole point of the optimization: appending is O(1) and does
	// NOT touch the filesystem. Pass a nonsense filePath — it should
	// still record cleanly.
	w := newTestWalker()
	w.AddPureFnDependency("rt", "asJSONString", "/this/path/does/not/exist.ts")
	if len(w.PureFnDependencies) != 1 {
		t.Fatalf("expected the triple to be recorded regardless of filePath validity, got %v", w.PureFnDependencies)
	}
}

func TestAddPureFnDependency_DedupesFullTriple(t *testing.T) {
	w := newTestWalker()
	for i := 0; i < 3; i++ {
		w.AddPureFnDependency("rt", "asJSONString", "/abs/pure-fns.ts")
	}
	if len(w.PureFnDependencies) != 1 {
		t.Fatalf("expected 1 dep after 3 identical appends, got %d (%v)", len(w.PureFnDependencies), w.PureFnDependencies)
	}
}

func TestAddPureFnDependency_DifferentFilePathIsDistinctEntry(t *testing.T) {
	// Same (ns, fn) but different filePath — both entries recorded.
	w := newTestWalker()
	w.AddPureFnDependency("rt", "asJSONString", "/a.ts")
	w.AddPureFnDependency("rt", "asJSONString", "/b.ts")
	if len(w.PureFnDependencies) != 2 {
		t.Fatalf("expected 2 distinct entries by filePath, got %d (%v)", len(w.PureFnDependencies), w.PureFnDependencies)
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
