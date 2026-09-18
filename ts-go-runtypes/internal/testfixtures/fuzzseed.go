package testfixtures

import (
	"encoding/json"
	"fmt"
	"hash/fnv"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
)

// The seeding policy every randomized sweep in this repo shares, Go and JS
// alike (the JS half is packages/run-types/test/fuzz/core/fuzzPolicy.ts).
//
// No sweep carries a pinned seed. Each derives its entry seed from the package
// VERSION, so a run is reproducible within a release (a red build replays
// exactly) while every version bump rotates the ground the sweeps explore.
// MION_FUZZ_SEED still overrides for replay.
//
// The version comes from version.json rather than constants.Version: that is
// the literal string "dev" in anything but a release build, so seeding from it
// would be a pinned constant wearing a disguise.

// FuzzSeed returns the entry seed for one sweep plus a one-line description of
// where it came from, for the log line that tells a reader how to replay.
func FuzzSeed(lane string) (int64, string, error) {
	if raw := os.Getenv("MION_FUZZ_SEED"); raw != "" {
		// Base 0, not 10: the JS lanes accept decimal OR 0x-prefixed hex and
		// PRINT their replay command in hex, so a decimal-only parse here
		// rejects the very seed a JS finding tells you to replay with.
		seed, err := strconv.ParseInt(raw, 0, 64)
		if err != nil {
			return 0, "", fmt.Errorf("MION_FUZZ_SEED: %w", err)
		}
		return seed, fmt.Sprintf("[%s-fuzz] seed %d from MION_FUZZ_SEED (replay: MION_FUZZ_SEED=%d)", lane, seed, seed), nil
	}
	version, err := RepoVersion()
	if err != nil {
		return 0, "", err
	}
	digest := fnv.New32a()
	digest.Write([]byte(version + ":" + lane))
	seed := int64(digest.Sum32())
	return seed, fmt.Sprintf("[%s-fuzz] seed %d from version %s (replay: MION_FUZZ_SEED=%d)", lane, seed, version, seed), nil
}

// RepoVersion reads the repo's version.json, the one string every sweep seeds
// from. Located from this file rather than the caller's working directory, so
// it reads the same in every package.
func RepoVersion() (string, error) {
	_, self, _, ok := runtime.Caller(0)
	if !ok {
		return "", fmt.Errorf("testfixtures: runtime.Caller failed to locate the package directory")
	}
	raw, err := os.ReadFile(filepath.Join(filepath.Dir(self), "..", "..", "..", "version.json"))
	if err != nil {
		return "", fmt.Errorf("version.json: %w", err)
	}
	var versionFile struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(raw, &versionFile); err != nil {
		return "", fmt.Errorf("version.json: %w", err)
	}
	if versionFile.Version == "" {
		return "", fmt.Errorf(`version.json: no "version" field to seed from`)
	}
	return versionFile.Version, nil
}
