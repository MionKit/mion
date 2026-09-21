package jsengine

import (
	cryptorand "crypto/rand"
	"encoding/binary"
	"hash/fnv"
	"strconv"
	"time"
)

// Wire shapes for the sidecar's newline-delimited JSON protocol, shared by the native subprocess transport (sidecar.go)
// and the WASM host hook transport (wasm.go), so the two can never drift.
type sidecarJob struct {
	ID      int      `json:"id"`
	Op      string   `json:"op"`
	Source  string   `json:"source"`
	Flags   string   `json:"flags"`
	Samples []string `json:"samples"`
	// generate-op fields, omitted on validate jobs so their wire shape stays byte-identical to the pre-generate protocol.
	Count       int    `json:"count,omitempty"`
	Seed        uint32 `json:"seed,omitempty"`
	MaxAttempts int    `json:"maxAttempts,omitempty"`
	MinLength   int    `json:"minLength,omitempty"`
	MaxLength   int    `json:"maxLength,omitempty"`
}

type sidecarResult struct {
	ID            int      `json:"id"`
	CompileError  string   `json:"compileError"`
	TimedOut      string   `json:"timedOut"`
	Offenders     []string `json:"offenders"`
	Values        []string `json:"values"`
	GenerateError string   `json:"generateError"`
	Error         string   `json:"error"`
}

type sidecarResponse struct {
	V       int             `json:"v"`
	Results []sidecarResult `json:"results"`
	Error   string          `json:"error"`
}

// generateSeed is FNV-1a/32 over runKey\x00source\x00flags\x00count: the pattern content keeps distinct patterns on distinct streams,
// and the run key decides reproducibility (a pinned mock.seed key repeats, the random per-session key re-rolls).
func generateSeed(runKey uint32, source, flags string, count int) uint32 {
	hash := fnv.New32a()
	hash.Write([]byte(strconv.FormatUint(uint64(runKey), 10)))
	hash.Write([]byte{0})
	hash.Write([]byte(source))
	hash.Write([]byte{0})
	hash.Write([]byte(flags))
	hash.Write([]byte{0})
	hash.Write([]byte(strconv.Itoa(count)))
	return hash.Sum32()
}

// SeedKeyFromStrings folds the sorted, deduplicated mock.seed texts of every call site demanding a node into the run key
// GeneratePattern pins; several distinct seeds sharing one node mix into a single still-deterministic key.
func SeedKeyFromStrings(seeds []string) uint32 {
	hash := fnv.New32a()
	for _, seed := range seeds {
		hash.Write([]byte(seed))
		hash.Write([]byte{0})
	}
	return hash.Sum32()
}

// newSessionKey rolls the per-session random run key, the "no seed anywhere" default that makes unpinned pools differ per build.
// crypto/rand works native and under js/wasm (crypto.getRandomValues); the clock fallback covers exotic hosts.
func newSessionKey() uint32 {
	var buf [4]byte
	if _, err := cryptorand.Read(buf[:]); err == nil {
		return binary.LittleEndian.Uint32(buf[:])
	}
	return uint32(time.Now().UnixNano())
}

// generateBudget floors the knobs at one, so even a degenerate config allows one draw per wanted sample (budget = count × retries).
func generateBudget(count, retries int) (int, int) {
	if count < 1 {
		count = 1
	}
	if retries < 1 {
		retries = 1
	}
	return count, count * retries
}

// generateJobFor is the one generate-op job builder both transports call, so seed and budget can never be computed two different ways.
func generateJobFor(req GenerateRequest, runKey uint32) sidecarJob {
	count, maxAttempts := generateBudget(req.Count, req.Retries)
	return sidecarJob{
		Op:          "generate",
		Source:      req.Source,
		Flags:       req.Flags,
		Count:       count,
		Seed:        generateSeed(runKey, req.Source, req.Flags, count),
		MaxAttempts: maxAttempts,
		MinLength:   req.MinLength,
		MaxLength:   req.MaxLength,
	}
}

func resolveRunKey(req GenerateRequest, sessionKey uint32) uint32 {
	if req.SeedKey != nil {
		return *req.SeedKey
	}
	return sessionKey
}
