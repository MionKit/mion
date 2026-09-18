package builtinpurefns

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"sort"
	"testing"
)

// TestTable_CoreBuiltinsPresent pins that the generated table carries the
// built-ins the type-fn emitters reach. A regeneration that drops one
// (e.g. a bad program build silently extracting zero) would fail here rather
// than surface later as a missing-import at a consumer.
func TestTable_CoreBuiltinsPresent(t *testing.T) {
	for _, key := range []string{purefnids.NewRunTypeErr, purefnids.HasUnknownKeysFromArray, purefnids.GetUnknownKeysFromArray, purefnids.CountEnumKeys, purefnids.IsUUID, purefnids.FindCycle} {
		if !Has(key) {
			t.Errorf("built-in table is missing %q (regenerate: pnpm miondevx core codegen builtinpurefns)", key)
		}
	}
	if Has("@mionjs/run-types/src/runtypes/pure-fns-utils#definitelyNotABuiltin") {
		t.Error("Has returned true for a non-existent key")
	}
}

// TestClosure_TransitiveDeps pins that Closure pulls the transitive built-in
// closure (isDateString_YMD -> isDateString) and reports a demanded-but-absent
// key as missing rather than silently dropping it.
func TestClosure_TransitiveDeps(t *testing.T) {
	entries, missing := Closure([]string{purefnids.IsDateStringYMD})
	if len(missing) != 0 {
		t.Fatalf("unexpected missing: %v", missing)
	}
	got := map[string]bool{}
	for _, entry := range entries {
		got[entry.Key()] = true
	}
	for _, want := range []string{purefnids.IsDateStringYMD, purefnids.IsDateString} {
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
	entries, missing := Closure([]string{purefnids.NewRunTypeErr, "@mionjs/run-types/src/runtypes/pure-fns-utils#totallyMadeUp"})
	if len(missing) != 1 || missing[0] != "@mionjs/run-types/src/runtypes/pure-fns-utils#totallyMadeUp" {
		t.Fatalf("expected […#totallyMadeUp] missing, got %v", missing)
	}
	if len(entries) != 1 || entries[0].Key() != purefnids.NewRunTypeErr {
		t.Fatalf("expected only newRunTypeErr served, got %d entries", len(entries))
	}
}

// TestClosure_Dedup pins that overlapping demand (two fns sharing a dep) yields
// each entry once.
func TestClosure_Dedup(t *testing.T) {
	entries, missing := Closure([]string{purefnids.IsDateStringYMD, purefnids.IsDateStringDMY})
	if len(missing) != 0 {
		t.Fatalf("unexpected missing: %v", missing)
	}
	seen := map[string]int{}
	for _, entry := range entries {
		seen[entry.Key()]++
	}
	if seen[purefnids.IsDateString] != 1 {
		t.Errorf("shared dep @mionjs/run-types/src/formats/datetime/dateTime-pure-fns#isDateString should appear once, got %d", seen[purefnids.IsDateString])
	}
}
