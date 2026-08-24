package purefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/ts-runtypes/internal/constants"
)

func TestCollectEntries_EmptyInput(t *testing.T) {
	if graph := CollectEntries(nil, constants.EmitBoth); len(graph) != 0 {
		t.Fatalf("expected empty graph for nil entries, got %d", len(graph))
	}
}

func TestCollectEntries_SingleEntry(t *testing.T) {
	graph := CollectEntries([]Entry{{
		Namespace:    "rt",
		FunctionName: "asJSONString",
		ParamNames:   []string{},
		Code:         "return function _f() {};",
		BodyHash:     "aBcDeFgHiJkLmN",
	}}, constants.EmitBoth)
	entry := graph["rt::asJSONString"]
	if entry == nil {
		t.Fatalf("expected an entry keyed by 'rt::asJSONString', got %v", graph)
	}
	if entry.Kind != entrymodules.KindPureFn {
		t.Errorf("Kind: got %v want KindPureFn", entry.Kind)
	}
	// 6-arg tail: key, bodyHash, paramNames, code, pureFnDependencies, createPureFn.
	// createPureFn is the inline `function(utl){<code>}` literal templated from `code`.
	// EmitBoth ships both the code string AND the live literal (the body twice).
	want := "'rt::asJSONString','aBcDeFgHiJkLmN',[],'return function _f() {};',[],function(){return function _f() {};}"
	if entry.ArgsText != want {
		t.Errorf("ArgsText mismatch:\n got: %s\nwant: %s", entry.ArgsText, want)
	}
	if len(entry.Deps) != 0 {
		t.Errorf("no-dep entry should have empty Deps, got %v", entry.Deps)
	}
}

func TestCollectEntries_WithDependencies(t *testing.T) {
	graph := CollectEntries([]Entry{{
		Namespace:          "rt",
		FunctionName:       "consumer",
		ParamNames:         []string{"x"},
		Code:               "return function _f(x){return utl.getPureFn('rt::dep')(x);};",
		BodyHash:           "h1",
		PureFnDependencies: []string{"rt::dep", "other::helper"},
	}}, constants.EmitBoth)
	entry := graph["rt::consumer"]
	if entry == nil {
		t.Fatal("missing entry")
	}
	if !strings.Contains(entry.ArgsText, `['rt::dep','other::helper']`) {
		t.Errorf("dep array not rendered correctly:\n%s", entry.ArgsText)
	}
	if len(entry.SoftDeps) != 2 || entry.SoftDeps[0] != "rt::dep" || entry.SoftDeps[1] != "other::helper" {
		t.Errorf("module SoftDeps should carry the pure-fn dep keys, got %v", entry.SoftDeps)
	}
}

func TestCollectEntries_QuoteEscapes(t *testing.T) {
	graph := CollectEntries([]Entry{{
		Namespace:    "test",
		FunctionName: "withQuote",
		ParamNames:   []string{"x"},
		Code:         "return 'has \\'inner\\'';",
		BodyHash:     "abc1234567890_",
	}}, constants.EmitBoth)
	entry := graph["test::withQuote"]
	if entry == nil {
		t.Fatal("missing entry")
	}
	if !strings.Contains(entry.ArgsText, `['x']`) {
		t.Errorf("paramNames not rendered correctly:\n%s", entry.ArgsText)
	}
	if !strings.Contains(entry.ArgsText, `\\`) {
		t.Errorf("backslashes not escaped in code field:\n%s", entry.ArgsText)
	}
}

func TestCollectEntries_RenderedModuleShape(t *testing.T) {
	graph := CollectEntries([]Entry{
		{Namespace: "a", FunctionName: "x", Code: "return 1;", BodyHash: "h1", ParamNames: []string{}},
		{Namespace: "b", FunctionName: "y", Code: "return utl.usePureFn('a::x')();", BodyHash: "h2",
			ParamNames: []string{}, PureFnDependencies: []string{"a::x"}},
	}, constants.EmitBoth)
	modules, err := entrymodules.RenderGrouped(graph, nil)
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	consumer, ok := modules["pf/b/y"]
	if !ok {
		t.Fatalf("expected module basename pf/b/y, got %v", keysOf(modules))
	}
	if !strings.Contains(consumer, "import {__rt_pf$2Fa$2Fx} from 'rtmod:/pf/a/x.js';") {
		t.Errorf("pure-fn dep import missing:\n%s", consumer)
	}
	if !strings.Contains(consumer, "export const __rt_pf$2Fb$2Fy=[2,()=>[__rt_pf$2Fa$2Fx],,'b::y',") {
		t.Errorf("tuple head should be [2,()=>[__rt_<dep>],<hole>,'<key>',…]:\n%s", consumer)
	}
}

func TestReplacements_SwapsFactoryArgForBinding(t *testing.T) {
	entries := []Entry{{
		Namespace:       "rt",
		FunctionName:    "foo",
		FilePath:        "/abs/a.ts",
		FactoryArgStart: 50,
		FactoryArgEnd:   100,
	}}
	got := Replacements(entries, false)
	if len(got) != 1 {
		t.Fatalf("expected 1 replacement, got %d (%+v)", len(got), got)
	}
	if got[0].File != "/abs/a.ts" || got[0].Start != 50 || got[0].End != 100 {
		t.Errorf("unexpected replacement bounds: %+v", got[0])
	}
	if got[0].Text != "__rt_pf$2Frt$2Ffoo" {
		t.Errorf("Text should be the entry-module binding, got %q", got[0].Text)
	}
	if got[0].ImportFrom != "rtmod:/pf/rt/foo.js" {
		t.Errorf("ImportFrom should be the virtual specifier, got %q", got[0].ImportFrom)
	}
}

func TestReplacements_SkipsEntriesWithoutBounds(t *testing.T) {
	// Synthetic entries (e.g. those built in fixtures above) lack
	// FactoryArgStart/End. Replacements must skip them so we don't
	// emit zero-width or nonsensical rewrites.
	entries := []Entry{
		{Namespace: "a", FunctionName: "b", FilePath: "/x.ts"},                      // missing bounds
		{Namespace: "c", FunctionName: "d", FactoryArgStart: 10, FactoryArgEnd: 20}, // missing FilePath
	}
	if got := Replacements(entries, false); len(got) != 0 {
		t.Errorf("expected zero replacements for malformed entries, got %+v", got)
	}
}

// TestCollectEntries_EmitModeGating pins the emitMode contract on the two
// mode-varying slots (code + createPureFn), mirroring the type-fn precedent
// (typefunctions codeArg/createRTFnArg). The `code` body deliberately contains
// no `function(` token so the only live-literal marker in functions/both mode
// is the createPureFn `function(){…}` prologue itself.
func TestCollectEntries_EmitModeGating(t *testing.T) {
	entry := Entry{
		Namespace:    "app",
		FunctionName: "answer",
		ParamNames:   []string{},
		Code:         "return 42;",
		BodyHash:     "h0",
	}
	const codeSlot = "'return 42;'"              // the quoted body-string slot
	const liveLiteral = "function(){return 42;}" // the createPureFn prologue

	cases := []struct {
		mode         constants.EmitMode
		wantCodeSlot bool
		wantLive     bool
	}{
		{constants.EmitCode, true, false},
		{constants.EmitFunctions, false, true},
		{constants.EmitBoth, true, true},
		{constants.EmitMode(""), true, false}, // zero value behaves as EmitCode
	}
	for _, tc := range cases {
		graph := CollectEntries([]Entry{entry}, tc.mode)
		got := graph["app::answer"]
		if got == nil {
			t.Fatalf("mode %q: missing entry", tc.mode)
		}
		hasCode := strings.Contains(got.ArgsText, codeSlot)
		hasLive := strings.Contains(got.ArgsText, liveLiteral)
		if hasCode != tc.wantCodeSlot {
			t.Errorf("mode %q: code-string slot present=%v, want %v\n%s", tc.mode, hasCode, tc.wantCodeSlot, got.ArgsText)
		}
		if hasLive != tc.wantLive {
			t.Errorf("mode %q: live literal present=%v, want %v\n%s", tc.mode, hasLive, tc.wantLive, got.ArgsText)
		}
	}
}

// TestCollectEntries_EmitCodeTrimsTrailingFactory: code mode drops the trailing
// createPureFn slot entirely (a trimmed hole), so the tuple ends at
// pureFnDependencies — the runtime rebuilds the factory from code + paramNames.
func TestCollectEntries_EmitCodeTrimsTrailingFactory(t *testing.T) {
	graph := CollectEntries([]Entry{{
		Namespace:    "app",
		FunctionName: "answer",
		ParamNames:   []string{},
		Code:         "return 42;",
		BodyHash:     "h0",
	}}, constants.EmitCode)
	got := graph["app::answer"].ArgsText
	want := "'app::answer','h0',[],'return 42;',[]"
	if got != want {
		t.Errorf("EmitCode ArgsText mismatch:\n got: %s\nwant: %s", got, want)
	}
}

// TestCollectEntries_EmitFunctionsHolesOutCode: functions mode drops the code
// STRING (an in-place hole, `,,`, kept because createPureFn follows) and ships
// the live literal. Also covers a param-bearing composing factory (paramNames
// = ['utl'] → `function(utl){…}`).
func TestCollectEntries_EmitFunctionsHolesOutCode(t *testing.T) {
	graph := CollectEntries([]Entry{{
		Namespace:    "app",
		FunctionName: "compose",
		ParamNames:   []string{"utl"},
		Code:         "return utl.getPureFn('rt::dep');",
		BodyHash:     "h1",
	}}, constants.EmitFunctions)
	got := graph["app::compose"].ArgsText
	want := "'app::compose','h1',['utl'],,[],function(utl){return utl.getPureFn('rt::dep');}"
	if got != want {
		t.Errorf("EmitFunctions ArgsText mismatch:\n got: %s\nwant: %s", got, want)
	}
}

// TestCollectEntries_EmitModeByteStable: each mode is deterministic across
// repeated collection — no per-run state leaks into the emitted bytes.
func TestCollectEntries_EmitModeByteStable(t *testing.T) {
	entries := []Entry{{Namespace: "rt", FunctionName: "newRunTypeErr", ParamNames: []string{}, Code: "return 1;", BodyHash: "h"}}
	for _, mode := range []constants.EmitMode{constants.EmitCode, constants.EmitFunctions, constants.EmitBoth} {
		first := CollectEntries(entries, mode)["rt::newRunTypeErr"].ArgsText
		second := CollectEntries(entries, mode)["rt::newRunTypeErr"].ArgsText
		if first != second {
			t.Errorf("mode %q not byte-stable:\n first: %s\nsecond: %s", mode, first, second)
		}
	}
}

func keysOf(m map[string]string) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
