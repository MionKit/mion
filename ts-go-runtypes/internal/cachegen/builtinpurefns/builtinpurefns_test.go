package builtinpurefns

import (
	"context"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
)

// markerPackageRoot is the in-repo marker package: the same directory a consumer
// would have under node_modules, minus the packing.
func markerPackageRoot(t *testing.T) string {
	t.Helper()
	root, err := filepath.Abs(filepath.Join("..", "..", "..", "..", "packages", "run-types"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "package.json")); err != nil {
		t.Fatalf("marker package not found at %s: %v", root, err)
	}
	return root
}

func newTestLoader(t *testing.T) *Loader {
	t.Helper()
	return New(markerPackageRoot(t), Host{SingleThreaded: true})
}

func closure(t *testing.T, loader *Loader, demanded ...string) ([]string, []string) {
	t.Helper()
	entries, missing, err := loader.Closure(demanded)
	if err != nil {
		t.Fatalf("Closure(%v): %v", demanded, err)
	}
	ids := make([]string, 0, len(entries))
	for _, entry := range entries {
		if strings.TrimSpace(entry.Code) == "" {
			t.Errorf("%s came back with an empty body", entry.ID)
		}
		ids = append(ids, entry.ID)
	}
	return ids, missing
}

// TestClosure_EveryGeneratedIdResolves is the drift check the deleted table's
// `--check` lane used to give. An id is a hash of the body that ships, so a body
// edited without regenerating the constants leaves the emitters naming an id
// nothing produces; here that fails instead of reaching a consumer as a missing
// import.
func TestClosure_EveryGeneratedIdResolves(t *testing.T) {
	all := purefnids.All()
	if len(all) == 0 {
		t.Fatal("purefnids.All() is empty")
	}
	_, missing := closure(t, newTestLoader(t), all...)
	if len(missing) != 0 {
		named := make([]string, 0, len(missing))
		for _, id := range missing {
			named = append(named, purefnids.NameOf(id)+" ("+id+")")
		}
		t.Errorf("%d generated id(s) no longer resolve from the marker sources:\n  %s\nregenerate: pnpm miondevx core codegen builtinpurefns",
			len(missing), strings.Join(named, "\n  "))
	}
}

// TestClosure_CoreBuiltinsServed pins the built-ins the type-fn emitters reach,
// naming them so a failure says which function moved rather than which hash.
func TestClosure_CoreBuiltinsServed(t *testing.T) {
	core := []string{purefnids.NewRunTypeErr, purefnids.HasUnknownKeysFromArray, purefnids.GetUnknownKeysFromArray, purefnids.CountEnumKeys, purefnids.IsUUID, purefnids.FindCycle}
	ids, missing := closure(t, newTestLoader(t), core...)
	if len(missing) != 0 {
		t.Fatalf("unexpected missing: %v", missing)
	}
	served := map[string]bool{}
	for _, id := range ids {
		served[id] = true
	}
	for _, want := range core {
		if !served[want] {
			t.Errorf("built-in %s (%s) was not served", purefnids.NameOf(want), want)
		}
	}
}

// TestClosure_FindCycleIsServed is its own case on purpose: circular-pure-fns.ts
// is side-effect imported by NOTHING, so it is reachable only because the package
// declares it in `mion.pureFns`. Discovering the sources by following imports
// dropped it silently, which is the failure this pins.
func TestClosure_FindCycleIsServed(t *testing.T) {
	ids, missing := closure(t, newTestLoader(t), purefnids.FindCycle)
	if len(missing) != 0 || len(ids) == 0 {
		t.Fatalf("findCycle was not served: ids=%v missing=%v", ids, missing)
	}
}

// TestClosure_TransitiveDeps pins that the closure pulls a dependency's module
// too: the dependent's body calls `utl.getPureFn('<dep id>')`, so a dep that is
// not delivered throws at the first call.
func TestClosure_TransitiveDeps(t *testing.T) {
	ids, missing := closure(t, newTestLoader(t), purefnids.IsDateStringYMD)
	if len(missing) != 0 {
		t.Fatalf("unexpected missing: %v", missing)
	}
	served := map[string]bool{}
	for _, id := range ids {
		served[id] = true
	}
	for _, want := range []string{purefnids.IsDateStringYMD, purefnids.IsDateString} {
		if !served[want] {
			sort.Strings(ids)
			t.Errorf("closure of isDateString_YMD missing %s (%s); got %v", purefnids.NameOf(want), want, ids)
		}
	}
}

// TestClosure_MissingReported pins the build-error path: a demanded id the sources
// do not register comes back in `missing` (upstream turns that into PFE9012)
// instead of being silently dropped.
func TestClosure_MissingReported(t *testing.T) {
	const madeUp = "@mionjs/run-types#totallyMadeUp"
	ids, missing := closure(t, newTestLoader(t), purefnids.NewRunTypeErr, madeUp)
	if len(missing) != 1 || missing[0] != madeUp {
		t.Fatalf("expected [%s] missing, got %v", madeUp, missing)
	}
	if len(ids) != 1 || ids[0] != purefnids.NewRunTypeErr {
		t.Fatalf("expected only newRunTypeErr served, got %v", ids)
	}
}

// TestClosure_Dedup pins that overlapping demand (two fns sharing a dep) yields
// each entry once.
func TestClosure_Dedup(t *testing.T) {
	ids, missing := closure(t, newTestLoader(t), purefnids.IsDateStringYMD, purefnids.IsDateStringDMY)
	if len(missing) != 0 {
		t.Fatalf("unexpected missing: %v", missing)
	}
	seen := map[string]int{}
	for _, id := range ids {
		seen[id]++
	}
	if seen[purefnids.IsDateString] != 1 {
		t.Errorf("shared dep isDateString should appear once, got %d", seen[purefnids.IsDateString])
	}
}

// TestClosure_ExtractsOnce pins the memo: a session builds one Program for the
// marker sources, so a second demand must ride what the first extracted.
func TestClosure_ExtractsOnce(t *testing.T) {
	loader := newTestLoader(t)
	closure(t, loader, purefnids.IsDateStringYMD)
	first := len(loader.byID)
	closure(t, loader, purefnids.NewRunTypeErr)
	if len(loader.byID) != first {
		t.Errorf("second closure re-extracted: %d entries then %d", first, len(loader.byID))
	}
}

// TestClosure_ServedEntriesCarryNoRewriteSpans pins the projection. A served
// entry's call site is inside the INSTALLED package, so a rewrite span reaching a
// consumer's build would dangle an import into a dependency and strip the
// registration the runtime falls back on.
func TestClosure_ServedEntriesCarryNoRewriteSpans(t *testing.T) {
	entries, _, err := newTestLoader(t).Closure([]string{purefnids.NewRunTypeErr})
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if entry.FilePath != "" || entry.FactoryArgStart != 0 || entry.FactoryArgEnd != 0 || entry.IDInjectPos != 0 || entry.IDInjectText != "" {
			t.Errorf("%s carries source positions: file=%q factoryArg=%d..%d idInject=%d %q",
				entry.ID, entry.FilePath, entry.FactoryArgStart, entry.FactoryArgEnd, entry.IDInjectPos, entry.IDInjectText)
		}
		if entry.BindingName == "" {
			t.Errorf("%s lost its BindingName, which is how a diagnostic names it", entry.ID)
		}
	}
}

// TestClosure_UnreadableSourcesError pins the loud failure: a package whose
// sources are not there produces an error, never an empty closure that would
// degrade to a runtime "Pure function not found".
func TestClosure_UnreadableSourcesError(t *testing.T) {
	loader := New(t.TempDir(), Host{SingleThreaded: true})
	_, _, err := loader.Closure([]string{purefnids.NewRunTypeErr})
	if err == nil {
		t.Fatal("expected an error for a package root with no sources")
	}
	if !strings.Contains(err.Error(), "package.json") {
		t.Errorf("error should name what it could not read, got: %v", err)
	}
}

// TestSourceFiles_RequiresTheDeclaration pins that the list is the package's to
// declare: a manifest without it is an error rather than an empty extraction that
// would report every built-in missing.
func TestSourceFiles_RequiresTheDeclaration(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "package.json"), []byte(`{"name":"@acme/lib"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := SourceFiles(root, nil); err == nil {
		t.Fatal("expected an error for a manifest with no mion.pureFns")
	} else if !strings.Contains(err.Error(), "mion.pureFns") {
		t.Errorf("error should name the missing field, got: %v", err)
	}
}

// TestSourceFiles_MatchesTheManifest pins that the declared list is what gets
// read, resolved under the package root.
func TestSourceFiles_MatchesTheManifest(t *testing.T) {
	root := markerPackageRoot(t)
	files, err := SourceFiles(root, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) == 0 {
		t.Fatal("no pure-fn sources declared")
	}
	for _, file := range files {
		if !strings.HasPrefix(file, root) {
			t.Errorf("%s is not under the package root %s", file, root)
		}
		if _, err := os.Stat(file); err != nil {
			t.Errorf("declared source does not exist: %v", err)
		}
	}
}

// TestBothLanesAgreeOnIds is the invariant the shared resolver exists for. An id
// is a hash of the body that ships, so two resolvers hashing the same sources must
// land on the same strings: if the session's lane and the package's own lane ever
// disagreed, one function would split into two entries and a consumer would import
// a module nothing registers.
func TestBothLanesAgreeOnIds(t *testing.T) {
	root := markerPackageRoot(t)
	files, err := SourceFiles(root, nil)
	if err != nil {
		t.Fatal(err)
	}

	// Stand in for a session whose program already holds the sources.
	prog, err := program.NewInferred(program.Options{Cwd: root, SingleThreaded: true}, files)
	if err != nil {
		t.Fatal(err)
	}
	typeChecker, release := prog.TS.GetTypeChecker(context.Background())
	defer release()
	markerOpts := marker.WithDefaults(marker.Options{})
	markerOpts.FS = prog.FS
	markerOpts.Cwd = prog.Cwd
	viaSession := New(root, Host{
		Program:    prog,
		Checker:    typeChecker,
		MarkerOpts: markerOpts,
		Cache:      purefunctions.NewFileCache(),
	})

	all := purefnids.All()
	sessionIDs, sessionMissing := closure(t, viaSession, all...)
	ownIDs, ownMissing := closure(t, New(root, Host{SingleThreaded: true}), all...)
	if len(sessionMissing) != 0 || len(ownMissing) != 0 {
		t.Fatalf("missing ids: session=%v own=%v", sessionMissing, ownMissing)
	}
	sort.Strings(sessionIDs)
	sort.Strings(ownIDs)
	if strings.Join(sessionIDs, "\n") != strings.Join(ownIDs, "\n") {
		t.Errorf("the two lanes disagree on ids:\nsession: %v\nown:     %v", sessionIDs, ownIDs)
	}
}
