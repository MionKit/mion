package typefunctions

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/diskcache"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// fakeLookup satisfies diskcache.HashLookup with two in-memory maps. Used by
// disk-cache integration tests so they can run without a real
// runtype.Cache (which would require a tsgo checker to populate).
type fakeLookup struct {
	structuralByHash map[string]string
	hashByStructural map[string]string
}

func newFakeLookup() *fakeLookup {
	return &fakeLookup{
		structuralByHash: map[string]string{},
		hashByStructural: map[string]string{},
	}
}

func (f *fakeLookup) set(hash, structural string) {
	f.structuralByHash[hash] = structural
	f.hashByStructural[structural] = hash
}

func (f *fakeLookup) StructuralForHash(hash string) string {
	return f.structuralByHash[hash]
}

func (f *fakeLookup) HashForStructural(structural string) string {
	return f.hashByStructural[structural]
}

// TestRenderFnModule_DiskCache_RoundTrip — a render with a wired disk
// cache must:
//  1. produce identical output across two consecutive runs (the
//     deterministic-output invariant survives the cache layer);
//  2. populate <store>/<typeID>/<fnTag>.json on the first run;
//  3. surface the cached Line on the second run — verified by mutating
//     the on-disk Line and confirming the marker leaks into the
//     second render's output (proves the read path is exercised, not
//     bypassed).
func TestRenderFnModule_DiskCache_RoundTrip(t *testing.T) {
	root := t.TempDir()
	store := diskcache.New(root, "fp1")
	lookup := newFakeLookup()
	lookup.set("abc123", "1:atomic")

	dump := protocol.Dump{
		RunTypes: []*reflection.RunType{
			{ID: "abc123", Kind: reflection.KindString},
		},
	}
	opts := RenderOpts{Store: store, Lookup: lookup}

	first := joinEntries(t, FamilyByKey("validate").Collect(dump, opts, nil))

	cachePath := filepath.Join(root, "fp1", "abc123", "val.json")
	raw, err := os.ReadFile(cachePath)
	if err != nil {
		t.Fatalf("expected cache file at %s, got %v", cachePath, err)
	}
	var entry diskcache.RTEntry
	if err := json.Unmarshal(raw, &entry); err != nil {
		t.Fatalf("cache file is not valid JSON: %v", err)
	}
	if entry.Format != diskcache.FormatVersion {
		t.Errorf("cache file Format: got %d want %d", entry.Format, diskcache.FormatVersion)
	}
	if entry.StructuralID != "1:atomic" {
		t.Errorf("cache StructuralID: got %q want %q", entry.StructuralID, "1:atomic")
	}
	if !strings.Contains(entry.ArgsText, valKey("abc123")) {
		t.Errorf("cache ArgsText missing innerName %q: %q", valKey("abc123"), entry.ArgsText)
	}

	second := joinEntries(t, FamilyByKey("validate").Collect(dump, opts, nil))
	if first != second {
		t.Errorf("cache round-trip changed output:\nfirst:\n%s\nsecond:\n%s", first, second)
	}

	// Mutate the cached ArgsText and re-render. The marker must appear in
	// the output, proving the read path is actually consulted on
	// subsequent renders (instead of every call recomputing fresh).
	entry.ArgsText = "'val_abc123','CACHE_MARKER_SENTINEL',undefined,true"
	mutated, _ := json.Marshal(entry)
	if err := os.WriteFile(cachePath, mutated, 0o644); err != nil {
		t.Fatal(err)
	}
	third := joinEntries(t, FamilyByKey("validate").Collect(dump, opts, nil))
	if !strings.Contains(third, "CACHE_MARKER_SENTINEL") {
		t.Errorf("cache read path not exercised — sentinel missing from third render:\n%s", third)
	}
}

// TestRenderFnModule_DiskCache_ChildHashDriftMiss — a cached entry
// whose child ref points at a stale hash must be treated as a miss.
// The renderer then falls back to a fresh compile and (since the
// child is unknown to the dump) emits a different result.
func TestRenderFnModule_DiskCache_ChildHashDriftMiss(t *testing.T) {
	root := t.TempDir()
	store := diskcache.New(root, "fp1")
	lookup := newFakeLookup()
	lookup.set("abc123", "1:atomic")
	lookup.set("childHash", "2:atomic")

	// Pre-seed a cache entry whose ChildRefs references a hash that the
	// current lookup does NOT have — simulating cross-build drift.
	cachePath := filepath.Join(root, "fp1", "abc123", "val.json")
	if err := os.MkdirAll(filepath.Dir(cachePath), 0o755); err != nil {
		t.Fatal(err)
	}
	stale := diskcache.RTEntry{
		Format:       diskcache.FormatVersion,
		StructuralID: "1:atomic",
		ArgsText:     "'val_abc123','STALE_MARKER',undefined,true",
		ChildRefs: []diskcache.ChildRef{
			// "ghostStructural" was never registered with the lookup
			// → HashForStructural returns "" → cache miss.
			{StructuralID: "ghostStructural", Hash: "ghostHash"},
		},
	}
	raw, _ := json.Marshal(stale)
	if err := os.WriteFile(cachePath, raw, 0o644); err != nil {
		t.Fatal(err)
	}

	dump := protocol.Dump{
		RunTypes: []*reflection.RunType{
			{ID: "abc123", Kind: reflection.KindString},
		},
	}
	out := joinEntries(t, FamilyByKey("validate").Collect(dump, RenderOpts{Store: store, Lookup: lookup}, nil))
	if strings.Contains(out, "STALE_MARKER") {
		t.Errorf("stale cache should have been rejected, but STALE_MARKER appears in:\n%s", out)
	}

	// After the miss, the renderer should have rewritten the cache
	// file with fresh content (no ghost child).
	rewritten, err := os.ReadFile(cachePath)
	if err != nil {
		t.Fatal(err)
	}
	var fresh diskcache.RTEntry
	if err := json.Unmarshal(rewritten, &fresh); err != nil {
		t.Fatal(err)
	}
	if len(fresh.ChildRefs) != 0 {
		t.Errorf("rewritten entry should have no child refs, got %+v", fresh.ChildRefs)
	}
	if strings.Contains(fresh.ArgsText, "STALE_MARKER") {
		t.Errorf("rewritten entry still has stale marker: %q", fresh.ArgsText)
	}
}

// TestRenderFnModule_DiskCache_HeaderStructuralMismatch — when the
// current dict assigns a different structural id to the cached typeID
// (collision-extension drift), the cache must miss and recompile.
func TestRenderFnModule_DiskCache_HeaderStructuralMismatch(t *testing.T) {
	root := t.TempDir()
	store := diskcache.New(root, "fp1")
	lookup := newFakeLookup()
	// Current build maps abc123 → "1:atomic", but the cache file
	// claims abc123 → "9:something-else". Mismatch → miss.
	lookup.set("abc123", "1:atomic")

	cachePath := filepath.Join(root, "fp1", "abc123", "val.json")
	_ = os.MkdirAll(filepath.Dir(cachePath), 0o755)
	stale := diskcache.RTEntry{
		Format:       diskcache.FormatVersion,
		StructuralID: "9:something-else",
		ArgsText:     "'val_abc123','STALE_MARKER',undefined,true",
	}
	raw, _ := json.Marshal(stale)
	_ = os.WriteFile(cachePath, raw, 0o644)

	dump := protocol.Dump{
		RunTypes: []*reflection.RunType{{ID: "abc123", Kind: reflection.KindString}},
	}
	out := joinEntries(t, FamilyByKey("validate").Collect(dump, RenderOpts{Store: store, Lookup: lookup}, nil))
	if strings.Contains(out, "STALE_MARKER") {
		t.Errorf("header structural-id mismatch should miss, got:\n%s", out)
	}
}
