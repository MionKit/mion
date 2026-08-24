package resolver

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
)

// White-box unit coverage for serveBuiltinPureFns — the resolver step that
// delivers package-owned pure-fn bodies from the generated table and turns a
// demanded-but-absent built-in into a PFE9012. serveBuiltinPureFns reads only
// (graph, diagSink), so a zero Session is enough.

func builtinSoftDepEntry(key string, softDeps []string) *entrymodules.Entry {
	return &entrymodules.Entry{Key: key, Kind: entrymodules.KindTypeFn, FamilyTag: "verr", ArgsText: "'" + key + "'", SoftDeps: softDeps}
}

// TestServeBuiltin_ServesDemandedAndTransitive — a type-fn entry that soft-deps a
// built-in gets that built-in served as a pure-fn module, and the table's
// transitive closure rides along (isDateString_YMD -> isDateString).
func TestServeBuiltin_ServesDemandedAndTransitive(t *testing.T) {
	graph := entrymodules.Graph{}
	graph.Add(builtinSoftDepEntry("verr_root", []string{"rt::newRunTypeErr"}))
	graph.Add(builtinSoftDepEntry("val_fmt", []string{"rtFormats::isDateString_YMD"}))

	var diags []diagnostics.Diagnostic
	(&Session{}).serveBuiltinPureFns(graph, &diags)

	for _, key := range []string{"rt::newRunTypeErr", "rtFormats::isDateString_YMD", "rtFormats::isDateString"} {
		entry := graph[key]
		if entry == nil {
			t.Fatalf("built-in %q was not served", key)
		}
		if entry.Kind != entrymodules.KindPureFn {
			t.Errorf("served %q kind = %d, want KindPureFn", key, entry.Kind)
		}
	}
	if len(diags) != 0 {
		t.Errorf("no diagnostics expected for present built-ins, got %+v", diags)
	}
}

// TestServeBuiltin_MissingIsPFE9012 — a type-fn entry soft-depping a
// `rt::`-namespaced key the table does not carry is a build error (the exemption
// flip: built-ins are validated against the table, not taken on faith).
func TestServeBuiltin_MissingIsPFE9012(t *testing.T) {
	graph := entrymodules.Graph{}
	graph.Add(builtinSoftDepEntry("verr_root", []string{"rt::newRunTypeErr", "rt::totallyMadeUp"}))

	var diags []diagnostics.Diagnostic
	(&Session{}).serveBuiltinPureFns(graph, &diags)

	if graph["rt::newRunTypeErr"] == nil {
		t.Error("the present built-in should still be served alongside the missing one")
	}
	found := false
	for _, diag := range diags {
		if diag.Code == diagnostics.CodeMissingPureFnDep && len(diag.Args) > 0 && diag.Args[0] == "rt::totallyMadeUp" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected %s for rt::totallyMadeUp, got %+v", diagnostics.CodeMissingPureFnDep, diags)
	}
}

// TestServeBuiltin_AnonymousUserKeyNotFlagged — the anonymous pure-fn lane keys
// its entries `rt::<hash>` (same namespace as the built-ins) but they live on
// KindPureFn entries and are served by the program graph, not the table. A
// pure-fn entry soft-depping such a key must NOT be misread as a missing
// built-in (the isBuiltinPureFnKey gate is scoped to type-fn entries for exactly
// this reason).
func TestServeBuiltin_AnonymousUserKeyNotFlagged(t *testing.T) {
	graph := entrymodules.Graph{}
	graph.Add(&entrymodules.Entry{Key: "rt::abc123def456", Kind: entrymodules.KindPureFn, ArgsText: "'rt::abc123def456'", SoftDeps: []string{"rt::xyz789hash012"}})

	var diags []diagnostics.Diagnostic
	(&Session{}).serveBuiltinPureFns(graph, &diags)

	for _, diag := range diags {
		if diag.Code == diagnostics.CodeMissingPureFnDep {
			t.Errorf("anonymous user key must not trip the missing-built-in check, got %+v", diag)
		}
	}
}
