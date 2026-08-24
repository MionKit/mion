package builtinpurefns

import (
	"sort"
	"testing"
)

// TestTable_CoreBuiltinsPresent pins that the generated table carries the core
// `rt::` built-ins the type-fn emitters reach. A regeneration that drops one
// (e.g. a bad program build silently extracting zero) would fail here rather
// than surface later as a missing-import at a consumer.
func TestTable_CoreBuiltinsPresent(t *testing.T) {
	for _, key := range []string{"rt::newRunTypeErr", "rt::hasUnknownKeysFromArray", "rt::getUnknownKeysFromArray", "rt::countEnumKeys", "rtFormats::isUUID", "rt::findCycle"} {
		if !Has(key) {
			t.Errorf("built-in table is missing %q (regenerate: pnpm rtx core codegen builtinpurefns)", key)
		}
	}
	if Has("rt::definitelyNotABuiltin") {
		t.Error("Has returned true for a non-existent key")
	}
}

// TestClosure_TransitiveDeps pins that Closure pulls the transitive built-in
// closure (isDateString_YMD -> isDateString) and reports a demanded-but-absent
// key as missing rather than silently dropping it.
func TestClosure_TransitiveDeps(t *testing.T) {
	entries, missing := Closure([]string{"rtFormats::isDateString_YMD"})
	if len(missing) != 0 {
		t.Fatalf("unexpected missing: %v", missing)
	}
	got := map[string]bool{}
	for _, entry := range entries {
		got[entry.Key()] = true
	}
	for _, want := range []string{"rtFormats::isDateString_YMD", "rtFormats::isDateString"} {
		if !got[want] {
			keys := make([]string, 0, len(got))
			for key := range got {
				keys = append(keys, key)
			}
			sort.Strings(keys)
			t.Errorf("closure of isDateString_YMD missing %q; got %v", want, keys)
		}
	}
}

// TestClosure_MissingReported pins the build-error path: a demanded key absent
// from the table comes back in `missing` (upstream turns that into a diagnostic).
func TestClosure_MissingReported(t *testing.T) {
	entries, missing := Closure([]string{"rt::newRunTypeErr", "rt::totallyMadeUp"})
	if len(missing) != 1 || missing[0] != "rt::totallyMadeUp" {
		t.Fatalf("expected [rt::totallyMadeUp] missing, got %v", missing)
	}
	if len(entries) != 1 || entries[0].Key() != "rt::newRunTypeErr" {
		t.Fatalf("expected only rt::newRunTypeErr served, got %d entries", len(entries))
	}
}

// TestClosure_Dedup pins that overlapping demand (two fns sharing a dep) yields
// each entry once.
func TestClosure_Dedup(t *testing.T) {
	entries, missing := Closure([]string{"rtFormats::isDateString_YMD", "rtFormats::isDateString_DMY"})
	if len(missing) != 0 {
		t.Fatalf("unexpected missing: %v", missing)
	}
	seen := map[string]int{}
	for _, entry := range entries {
		seen[entry.Key()]++
	}
	if seen["rtFormats::isDateString"] != 1 {
		t.Errorf("shared dep rtFormats::isDateString should appear once, got %d", seen["rtFormats::isDateString"])
	}
}
