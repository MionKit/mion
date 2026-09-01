package typefunctions

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/diskcache"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// buildStringPropObjectFixture builds `{a: string}` — a validationErrors body
// over it reaches rt::newRunTypeErr (the only pure-fn edge), with no same-family
// child deps (the string prop inlines), so PureFnRefs is the sole persisted edge.
func buildStringPropObjectFixture() ([]*reflection.RunType, string) {
	stringRT := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	propA := &reflection.RunType{ID: "pA", Kind: reflection.KindPropertySignature, Name: "a", IsSafeName: true, Child: &reflection.RunType{ID: "str", Kind: reflection.KindRef}}
	obj := &reflection.RunType{ID: "obj1", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{{ID: "pA", Kind: reflection.KindRef}}}
	return []*reflection.RunType{obj, propA, stringRT}, "obj1"
}

// TestRenderFnModule_DiskCache_PureFnRefsRoundTrip — the pure-fn twin of the
// cross-family round-trip. A validationErrors entry reaches rt::newRunTypeErr;
// rendering once with a wired Store persists it as PureFnRefs, and a second
// render must HIT the disk cache (walker never runs) yet return the SAME
// pureFnDeps. Without the persistence a warm entry rebuilds empty SoftDeps and
// drops its built-in pure-fn import (a runtime getPureFn(...) === undefined).
func TestRenderFnModule_DiskCache_PureFnRefsRoundTrip(t *testing.T) {
	root := t.TempDir()
	store := diskcache.New(root, "fp1")
	lookup := newFakeLookup()
	lookup.set("obj1", "o:obj")

	runTypes, rootID := buildStringPropObjectFixture()
	refTable := buildRefTable(runTypes)
	settings := constants.CacheModules["validationErrors"]
	prefix := innerPrefix(settings)
	opts := RenderOpts{Store: store, Lookup: lookup, RefTable: refTable}

	first := renderEntryWithDeps(refTable[rootID], settings, ValidationErrorsEmitter{}, prefix, refTable, opts, "", nil, false)
	if first.argsText == "" {
		t.Fatal("first render produced empty args")
	}
	if !containsStr(first.pureFnDeps, "rt::newRunTypeErr") {
		t.Fatalf("fresh render missing pure-fn edge rt::newRunTypeErr (got %v)", first.pureFnDeps)
	}

	// The on-disk entry must persist the pure-fn edges as PureFnRefs, under v15.
	cachePath := filepath.Join(root, "fp1", rootID, settings.Tag+".json")
	raw, err := os.ReadFile(cachePath)
	if err != nil {
		t.Fatalf("expected cache file at %s: %v", cachePath, err)
	}
	var entry diskcache.RTEntry
	if err := json.Unmarshal(raw, &entry); err != nil {
		t.Fatalf("cache file is not valid JSON: %v", err)
	}
	if entry.Format != diskcache.FormatVersion {
		t.Errorf("cache Format: got %d want %d", entry.Format, diskcache.FormatVersion)
	}
	if !equalStrSlices(entry.PureFnRefs, []string{"rt::newRunTypeErr"}) {
		t.Fatalf("persisted PureFnRefs: got %v want [rt::newRunTypeErr]", entry.PureFnRefs)
	}

	// Second render: must HIT the disk cache and return the SAME pureFnDeps.
	// Mutate ArgsText to a sentinel to prove the walker did not re-run.
	entry.ArgsText = "'ve_obj1','CACHE_SENTINEL',undefined,true"
	mutated, _ := json.Marshal(entry)
	if err := os.WriteFile(cachePath, mutated, 0o644); err != nil {
		t.Fatal(err)
	}
	second := renderEntryWithDeps(refTable[rootID], settings, ValidationErrorsEmitter{}, prefix, refTable, opts, "", nil, false)
	if second.argsText != entry.ArgsText {
		t.Fatalf("second render did not hit the disk cache (args=%q)", second.argsText)
	}
	if !equalStrSlices(second.pureFnDeps, []string{"rt::newRunTypeErr"}) {
		t.Errorf("cache hit lost pure-fn edges: got %v want [rt::newRunTypeErr]", second.pureFnDeps)
	}
}

// TestRenderFnModule_DiskCache_PureFnRefsSurfaceOnSoftDeps — the warm collect
// must reproduce the same SoftDeps pure-fn edge as a cold collect, so a
// disk-cache hit still imports the built-in module.
func TestRenderFnModule_DiskCache_PureFnRefsSurfaceOnSoftDeps(t *testing.T) {
	root := t.TempDir()
	store := diskcache.New(root, "fp1")
	lookup := newFakeLookup()
	lookup.set("obj1", "o:obj")

	runTypes, rootID := buildStringPropObjectFixture()
	refTable := buildRefTable(runTypes)
	dump := protocol.Dump{
		RunTypes: runTypes,
		Sites:    []protocol.Site{{ID: rootID, Demand: []protocol.SiteDemand{{FamilyTag: "verr"}}}},
	}
	opts := RenderOpts{Store: store, Lookup: lookup, RefTable: refTable}
	rootKey := valErrKey(rootID)

	cold := FamilyByKey("validationErrors").Collect(dump, opts, nil)
	coldEntry := cold[rootKey]
	if coldEntry == nil {
		t.Fatalf("cold collect missing the root entry %q", rootKey)
	}
	if !containsStr(coldEntry.SoftDeps, "rt::newRunTypeErr") {
		t.Fatalf("cold SoftDeps missing pure-fn edge (got %v)", coldEntry.SoftDeps)
	}

	warm := FamilyByKey("validationErrors").Collect(dump, opts, nil)
	warmEntry := warm[rootKey]
	if warmEntry == nil {
		t.Fatalf("warm collect missing the root entry %q", rootKey)
	}
	if !equalStrSlices(sortedCopy(coldEntry.SoftDeps), sortedCopy(warmEntry.SoftDeps)) {
		t.Errorf("warm SoftDeps differ from cold:\ncold: %v\nwarm: %v", coldEntry.SoftDeps, warmEntry.SoftDeps)
	}
}

func valErrKey(id string) string {
	return innerPrefix(constants.CacheModules["validationErrors"]) + id
}
