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

// The seeding policy every randomized sweep shares, Go and JS alike (JS half: packages/run-types/test/fuzz/core/fuzzPolicy.ts).
// No sweep pins a seed: each derives it from the package VERSION, so a run replays within a release and every bump rotates the ground explored.
// The version comes from version.json, not constants.Version, which is the literal string "dev" in anything but a release build.

// FuzzSeed returns one sweep's entry seed plus where it came from, for the log line that tells a reader how to replay.
func FuzzSeed(lane string) (int64, string, error) {
	if raw := os.Getenv("MION_FUZZ_SEED"); raw != "" {
		// Base 0, not 10: the JS lanes print their replay seed in hex, which a decimal-only parse would reject.
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

// RepoVersion reads version.json, the one string every sweep seeds from; located from this file, so the caller's cwd cannot change it.
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
