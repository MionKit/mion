package typefunctions

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/cachegen/diskcache"
	"github.com/mionkit/ts-runtypes/internal/protocol"
	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// strictDump — `{a: string; b: number}`, the smallest shape that reaches the
// fused key check (all-required, no index signature, so it takes the O(1)
// key-count compare).
func strictDump() protocol.Dump {
	str := &reflection.RunType{ID: "str1", Kind: reflection.KindString}
	num := &reflection.RunType{ID: "num1", Kind: reflection.KindNumber}
	propA := &reflection.RunType{ID: "pa1", Kind: reflection.KindPropertySignature, Name: "a", IsSafeName: true, Child: &reflection.RunType{Kind: reflection.KindRef, ID: "str1"}}
	propB := &reflection.RunType{ID: "pb1", Kind: reflection.KindPropertySignature, Name: "b", IsSafeName: true, Child: &reflection.RunType{Kind: reflection.KindRef, ID: "num1"}}
	obj := &reflection.RunType{
		ID: "obj1", Kind: reflection.KindObjectLiteral,
		Children: []*reflection.RunType{
			{Kind: reflection.KindRef, ID: "pa1"},
			{Kind: reflection.KindRef, ID: "pb1"},
		},
	}
	return protocol.Dump{RunTypes: []*reflection.RunType{str, num, propA, propB, obj}}
}

// The fused validators ship as FAMILIES rather than variants, and being
// disk-cacheable is half the reason. A variant is never written to disk
// (module.go gates the write on an empty variant suffix), so a fused entry
// stored under its own tag is what proves the design actually landed.
//
// The other half is that the tags must not collide: vst.json and vest.json sit
// beside val.json for the same type id, each holding its own body.
func TestRenderFnModule_DiskCache_StrictFamiliesRoundTrip(t *testing.T) {
	for _, family := range []struct{ key, tag, mustContain string }{
		{"validateStrict", "vst", "countEnumKeys"},
		{"validationErrorsStrict", "vest", "newRunTypeErr"},
	} {
		t.Run(family.key, func(t *testing.T) {
			root := t.TempDir()
			store := diskcache.New(root, "fp1")
			lookup := newFakeLookup()
			lookup.set("obj1", "1:object")
			dump := strictDump()
			opts := RenderOpts{Store: store, Lookup: lookup}

			first := joinEntries(t, FamilyByKey(family.key).Collect(dump, opts, nil))
			if !strings.Contains(first, family.mustContain) {
				t.Fatalf("%s render is missing %q — the fusion did not reach the body:\n%s", family.key, family.mustContain, first)
			}

			cachePath := filepath.Join(root, "fp1", "obj1", family.tag+".json")
			raw, err := os.ReadFile(cachePath)
			if err != nil {
				t.Fatalf("expected a cache file at %s, got %v", cachePath, err)
			}
			var entry diskcache.RTEntry
			if err := json.Unmarshal(raw, &entry); err != nil {
				t.Fatalf("cache file is not valid JSON: %v", err)
			}
			if entry.Format != diskcache.FormatVersion {
				t.Errorf("cache Format: got %d want %d", entry.Format, diskcache.FormatVersion)
			}
			if entry.StructuralID != "1:object" {
				t.Errorf("cache StructuralID: got %q want %q", entry.StructuralID, "1:object")
			}

			// A plain validate render must NOT be served from the fused entry.
			if _, err := os.Stat(filepath.Join(root, "fp1", "obj1", "val.json")); err == nil {
				t.Errorf("the fused render wrote a plain val.json — the tags collided")
			}

			second := joinEntries(t, FamilyByKey(family.key).Collect(dump, opts, nil))
			if first != second {
				t.Errorf("cache round-trip changed output:\nfirst:\n%s\nsecond:\n%s", first, second)
			}

			// Prove the read path is consulted rather than every render
			// recomputing: a mutated cache line must leak into the next render.
			entry.ArgsText = "'" + family.tag + "_obj1','CACHE_MARKER_SENTINEL',undefined,true"
			mutated, _ := json.Marshal(entry)
			if err := os.WriteFile(cachePath, mutated, 0o644); err != nil {
				t.Fatal(err)
			}
			third := joinEntries(t, FamilyByKey(family.key).Collect(dump, opts, nil))
			if !strings.Contains(third, "CACHE_MARKER_SENTINEL") {
				t.Errorf("cache read path not exercised — sentinel missing:\n%s", third)
			}
		})
	}
}

// The plain and fused families cache the SAME type id side by side, each under
// its own tag and each holding its own body. If either overwrote the other, a
// build that used both would silently serve one where it meant the other.
func TestRenderFnModule_DiskCache_StrictAndPlainCoexist(t *testing.T) {
	root := t.TempDir()
	store := diskcache.New(root, "fp1")
	lookup := newFakeLookup()
	lookup.set("obj1", "1:object")
	dump := strictDump()
	opts := RenderOpts{Store: store, Lookup: lookup}

	plain := joinEntries(t, FamilyByKey("validate").Collect(dump, opts, nil))
	fused := joinEntries(t, FamilyByKey("validateStrict").Collect(dump, opts, nil))

	for _, tag := range []string{"val", "vst"} {
		if _, err := os.Stat(filepath.Join(root, "fp1", "obj1", tag+".json")); err != nil {
			t.Fatalf("expected a cache file for tag %q: %v", tag, err)
		}
	}
	if strings.Contains(plain, "countEnumKeys") {
		t.Errorf("the PLAIN validator picked up the key check:\n%s", plain)
	}
	if !strings.Contains(fused, "countEnumKeys") {
		t.Errorf("the FUSED validator lost the key check:\n%s", fused)
	}

	// Re-render both from the warm store: still their own bodies.
	if again := joinEntries(t, FamilyByKey("validate").Collect(dump, opts, nil)); again != plain {
		t.Errorf("warm plain render drifted:\n%s\n---\n%s", plain, again)
	}
	if again := joinEntries(t, FamilyByKey("validateStrict").Collect(dump, opts, nil)); again != fused {
		t.Errorf("warm fused render drifted:\n%s\n---\n%s", fused, again)
	}
}
