package convert

// The gate under the one-object column spelling on the Go side.
//
// A column type takes its builder config and its modifier calls in the SAME
// props object (`Varchar<'name', {length: 100; notNull: true}>`), and this
// package splits that object by drizzleModNames in both directions: printing
// the type form from a builder chain, and reading a builder chain back out of
// a type. Its twin is colModNames in packages/drizzle-orm/src/typeColumns.ts,
// gated the same way by colMods.spec.ts. If a drizzle upgrade adds a modifier
// and only one of the two lists learns about it, the two roads stop agreeing
// silently, so both are checked against the generated manifests instead of
// against each other.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"testing"
)

type manifestEntry struct {
	Kind      string   `json:"kind"`
	Status    string   `json:"status"`
	Modifiers []string `json:"modifiers"`
}

type manifestFile struct {
	Entries []manifestEntry `json:"entries"`
}

func TestDrizzleModNamesMatchManifests(t *testing.T) {
	_, self, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed to locate the package directory")
	}
	repoRoot := filepath.Join(filepath.Dir(self), "..", "..", "..")
	recorded := map[string]bool{}
	for _, dialect := range []string{"pg", "mysql", "sqlite"} {
		path := filepath.Join(repoRoot, "packages", "drizzle-orm-"+dialect+"-core", "manifests", dialect+".manifest.json")
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
		var manifest manifestFile
		if err := json.Unmarshal(raw, &manifest); err != nil {
			t.Fatalf("parse %s: %v", path, err)
		}
		for _, entry := range manifest.Entries {
			if entry.Kind != "column" || entry.Status != "migrated" {
				continue
			}
			for _, modifier := range entry.Modifiers {
				recorded[modifier] = true
			}
		}
	}
	if len(recorded) == 0 {
		t.Fatal("no modifiers read from the manifests — this gate is checking nothing")
	}
	if missing := diffNames(recorded, drizzleModNames); len(missing) > 0 {
		t.Errorf("modifiers the manifests record but drizzleModNames omits: %v (add them here AND to colModNames)", missing)
	}
	if extra := diffNames(drizzleModNames, recorded); len(extra) > 0 {
		t.Errorf("names in drizzleModNames that no dialect records: %v", extra)
	}
}

func diffNames(from, minus map[string]bool) []string {
	var names []string
	for name := range from {
		if !minus[name] {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	return names
}
