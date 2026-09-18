package resolver

import (
	"path/filepath"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/builtinpurefns"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

// White-box unit coverage for serveBuiltinPureFns — the resolver step that
// extracts package-owned pure-fn bodies from the marker package's own sources
// and turns a demanded-but-absent built-in into a PFE9012. It reads only
// (graph, diagSink) plus the session's loader, so a Session carrying just the
// loader is enough; resolving the package root out of a Program is covered by
// the end-to-end delivery tests.

// sessionServingBuiltins is a Session whose built-in loader is already bound to
// the in-repo marker package, standing in for the root a real session resolves.
func sessionServingBuiltins(t *testing.T) *Session {
	t.Helper()
	root, err := filepath.Abs(filepath.Join("..", "..", "..", "..", "packages", "run-types"))
	if err != nil {
		t.Fatal(err)
	}
	return &Session{
		builtinPureFns:     builtinpurefns.New(root, builtinpurefns.Host{SingleThreaded: true}),
		builtinPureFnsDone: true,
	}
}

func builtinSoftDepEntry(key string, softDeps []string) *entrymodules.Entry {
	return &entrymodules.Entry{Key: key, Kind: entrymodules.KindTypeFn, FamilyTag: "verr", ArgsText: "'" + key + "'", SoftDeps: softDeps}
}

// TestServeBuiltin_ServesDemandedAndTransitive — a type-fn entry that soft-deps a
// built-in gets that built-in served as a pure-fn module, and the extracted
// transitive closure rides along (isDateString_YMD -> isDateString).
func TestServeBuiltin_ServesDemandedAndTransitive(t *testing.T) {
	graph := entrymodules.Graph{}
	graph.Add(builtinSoftDepEntry("verr_root", []string{purefnids.NewRunTypeErr}))
	graph.Add(builtinSoftDepEntry("val_fmt", []string{purefnids.IsDateStringYMD}))

	var diags []diagnostics.Diagnostic
	sessionServingBuiltins(t).serveBuiltinPureFns(graph, &diags, constants.EmitCode)

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

// TestServeBuiltin_UnknownIdIsNotDemanded — an id the generated id set does not
// know belongs to the PROGRAM (a consumer's own pure fn), so this step leaves it
// alone and the program graph serves it. Only an id the emitters are compiled
// against that the marker sources no longer register is a build error;
// `Closure` reporting it is covered in the builtinpurefns package.
func TestServeBuiltin_UnknownIdIsNotDemanded(t *testing.T) {
	graph := entrymodules.Graph{}
	graph.Add(builtinSoftDepEntry("verr_root", []string{purefnids.NewRunTypeErr, "@acme/app/src/fns#slugify"}))

	var diags []diagnostics.Diagnostic
	sessionServingBuiltins(t).serveBuiltinPureFns(graph, &diags, constants.EmitCode)

	if graph[purefnids.NewRunTypeErr] == nil {
		t.Error("the built-in should still be served alongside the consumer's own id")
	}
	if graph["@acme/app/src/fns#slugify"] != nil {
		t.Error("a consumer's own pure fn must not be served as a built-in")
	}
	if len(diags) != 0 {
		t.Errorf("a consumer's own pure fn must not be flagged as a missing built-in, got %+v", diags)
	}
}

// TestServeBuiltin_UserPureFnKeyNotFlagged — a consumer's own pure fns live on
// KindPureFn entries and are served by the program graph, so an edge between two
// of them must never be misread as a missing built-in.
func TestServeBuiltin_UserPureFnKeyNotFlagged(t *testing.T) {
	graph := entrymodules.Graph{}
	graph.Add(&entrymodules.Entry{Key: "@acme/app/src/fns#slugify", Kind: entrymodules.KindPureFn, ArgsText: "'@acme/app/src/fns#slugify'", SoftDeps: []string{"@acme/app/src/fns#lower"}})

	var diags []diagnostics.Diagnostic
	sessionServingBuiltins(t).serveBuiltinPureFns(graph, &diags, constants.EmitCode)

	for _, diag := range diags {
		if diag.Code == diagnostics.CodeMissingPureFnDep {
			t.Errorf("a consumer's own pure fn must not trip the missing-built-in check, got %+v", diag)
		}
	}
}

// TestServeBuiltin_UnreachableSourcesIsCFG004 — a program that demands a built-in
// but reaches no marker package fails the build with the code that names the
// broken install. Never silence: without a body the emitted validator would
// throw "Pure function not found" at the first call instead.
func TestServeBuiltin_UnreachableSourcesIsCFG004(t *testing.T) {
	graph := entrymodules.Graph{}
	graph.Add(builtinSoftDepEntry("verr_root", []string{purefnids.NewRunTypeErr}))

	var diags []diagnostics.Diagnostic
	(&Session{}).serveBuiltinPureFns(graph, &diags, constants.EmitCode)

	if len(diags) != 1 || diags[0].Code != diagnostics.CodeBuiltinPureFnSourceUnreadable {
		t.Fatalf("expected one CFG004, got %+v", diags)
	}
}
