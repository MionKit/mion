package convert_test

import (
	"encoding/json"
	"hash/fnv"
	"os"
	"path/filepath"
	"strconv"
	"testing"
)

// The seeding policy the Go fuzz sweeps share with the JS lanes
// (packages/run-types/test/fuzz/core/fuzzPolicy.ts).
//
// No sweep carries a pinned seed. Each derives its entry seed from the package
// VERSION, so a run is reproducible within a release (a red build replays
// exactly) while every version bump rotates the ground the sweeps explore.
// MION_FUZZ_SEED still overrides for replay, and the seed is logged next to the
// command that reproduces it.
//
// Read from version.json rather than constants.Version: that is the literal
// string "dev" in anything but a release build, so seeding from it would be a
// pinned constant wearing a disguise.

// FNV-1a over "<version>:<lane>", matching the JS hashString so both sides
// derive seeds the same way.
func entrySeed(t *testing.T, lane string) int64 {
	t.Helper()
	if raw := os.Getenv("MION_FUZZ_SEED"); raw != "" {
		// Base 0, not 10: the JS lanes accept decimal OR 0x-prefixed hex and
		// PRINT their replay command in hex, so a decimal-only parse here
		// rejects the very seed a JS finding tells you to replay with.
		parsed, parseErr := strconv.ParseInt(raw, 0, 64)
		if parseErr != nil {
			t.Fatalf("MION_FUZZ_SEED: %v", parseErr)
		}
		t.Logf("[%s-fuzz] seed %d from MION_FUZZ_SEED (replay: MION_FUZZ_SEED=%d)", lane, parsed, parsed)
		return parsed
	}
	version := packageVersion(t)
	digest := fnv.New32a()
	digest.Write([]byte(version + ":" + lane))
	seed := int64(digest.Sum32())
	t.Logf("[%s-fuzz] seed %d from version %s (replay: MION_FUZZ_SEED=%d)", lane, seed, version, seed)
	return seed
}

// A seed spelled the way the JS lanes spell it must replay here. Their
// fuzzPolicy.ts accepts decimal or 0x-hex and renders every replay command in
// hex, so copying a JS finding's command into a Go sweep has to work; a
// decimal-only parse used to fail it with "invalid syntax". CI never caught it
// because the workflows seed from github.run_id, which is decimal.
func TestEntrySeed_AcceptsTheSpellingsTheJSLanesEmit(t *testing.T) {
	for _, probe := range []struct {
		name string
		raw  string
		want int64
	}{
		{"hex as the JS lanes print it", "0x90f3baf6", 0x90f3baf6},
		{"decimal as the workflows set it", "2431106294", 2431106294},
		{"uppercase hex", "0XFF", 255},
	} {
		t.Run(probe.name, func(t *testing.T) {
			t.Setenv("MION_FUZZ_SEED", probe.raw)
			if got := entrySeed(t, "probe"); got != probe.want {
				t.Fatalf("MION_FUZZ_SEED=%s: seed = %d, want %d", probe.raw, got, probe.want)
			}
		})
	}
}

// The lockstep version every package and the published binary share. `go test`
// runs with the package dir as cwd, so version.json is three levels up.
func packageVersion(t *testing.T) string {
	t.Helper()
	raw, readErr := os.ReadFile(filepath.Join("..", "..", "..", "version.json"))
	if readErr != nil {
		t.Fatalf("version.json: %v", readErr)
	}
	var versionFile struct {
		Version string `json:"version"`
	}
	if unmarshalErr := json.Unmarshal(raw, &versionFile); unmarshalErr != nil {
		t.Fatalf("version.json: %v", unmarshalErr)
	}
	if versionFile.Version == "" {
		t.Fatal(`version.json: no "version" field to seed from`)
	}
	return versionFile.Version
}
