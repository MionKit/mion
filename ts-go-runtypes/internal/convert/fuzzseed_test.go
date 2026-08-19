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
// (packages/ts-runtypes/test/fuzz/core/fuzzPolicy.ts).
//
// No sweep carries a pinned seed. Each derives its entry seed from the package
// VERSION, so a run is reproducible within a release (a red build replays
// exactly) while every version bump rotates the ground the sweeps explore.
// RT_FUZZ_SEED still overrides for replay, and the seed is logged next to the
// command that reproduces it.
//
// Read from version.json rather than constants.Version: that is the literal
// string "dev" in anything but a release build, so seeding from it would be a
// pinned constant wearing a disguise.

// FNV-1a over "<version>:<lane>", matching the JS hashString so both sides
// derive seeds the same way.
func entrySeed(t *testing.T, lane string) int64 {
	t.Helper()
	if raw := os.Getenv("RT_FUZZ_SEED"); raw != "" {
		parsed, parseErr := strconv.ParseInt(raw, 10, 64)
		if parseErr != nil {
			t.Fatalf("RT_FUZZ_SEED: %v", parseErr)
		}
		t.Logf("[%s-fuzz] seed %d from RT_FUZZ_SEED (replay: RT_FUZZ_SEED=%d)", lane, parsed, parsed)
		return parsed
	}
	version := packageVersion(t)
	digest := fnv.New32a()
	digest.Write([]byte(version + ":" + lane))
	seed := int64(digest.Sum32())
	t.Logf("[%s-fuzz] seed %d from version %s (replay: RT_FUZZ_SEED=%d)", lane, seed, version, seed)
	return seed
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
