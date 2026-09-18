package resolver

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
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
	graph.Add(builtinSoftDepEntry("verr_root", []string{purefnids.NewRunTypeErr}))
	graph.Add(builtinSoftDepEntry("val_fmt", []string{purefnids.IsDateStringYMD}))

	var diags []diagnostics.Diagnostic
	(&Session{}).serveBuiltinPureFns(graph, &diags, constants.EmitCode)

	for _, key := range []string{purefnids.NewRunTypeErr, purefnids.IsDateStringYMD, purefnids.IsDateString} {
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

// TestServeBuiltin_UnknownIdIsNotDemanded — an id neither generated artifact
// knows belongs to the PROGRAM (a consumer's own pure fn), so the table step
// leaves it alone and the program graph serves it. Only an id the emitters are
// compiled against whose body the table lacks is a build error, and since both
// artifacts come out of one generator run that can only be a hand-edited table;
// `Closure` reporting it is covered in the builtinpurefns package.
func TestServeBuiltin_UnknownIdIsNotDemanded(t *testing.T) {
	graph := entrymodules.Graph{}
	graph.Add(builtinSoftDepEntry("verr_root", []string{purefnids.NewRunTypeErr, "@acme/app/src/fns#slugify"}))

	var diags []diagnostics.Diagnostic
	(&Session{}).serveBuiltinPureFns(graph, &diags, constants.EmitCode)

	if graph[purefnids.NewRunTypeErr] == nil {
		t.Error("the built-in should still be served alongside the consumer's own id")
	}
	if graph["@acme/app/src/fns#slugify"] != nil {
		t.Error("a consumer's own pure fn must not be served from the built-in table")
	}
	if len(diags) != 0 {
		t.Errorf("a consumer's own pure fn must not be flagged as a missing built-in, got %+v", diags)
	}
}

// TestServeBuiltin_UserPureFnKeyNotFlagged — a consumer's own pure fns live on
// KindPureFn entries and are served by the program graph, not the table, so an
// edge between two of them must never be misread as a missing built-in (the
// table gate is scoped to type-fn entries for exactly this reason).
func TestServeBuiltin_UserPureFnKeyNotFlagged(t *testing.T) {
	graph := entrymodules.Graph{}
	graph.Add(&entrymodules.Entry{Key: "@acme/app/src/fns#slugify", Kind: entrymodules.KindPureFn, ArgsText: "'@acme/app/src/fns#slugify'", SoftDeps: []string{"@acme/app/src/fns#lower"}})

	var diags []diagnostics.Diagnostic
	(&Session{}).serveBuiltinPureFns(graph, &diags, constants.EmitCode)

	for _, diag := range diags {
		if diag.Code == diagnostics.CodeMissingPureFnDep {
			t.Errorf("a consumer's own pure fn must not trip the missing-built-in check, got %+v", diag)
		}
	}
}
