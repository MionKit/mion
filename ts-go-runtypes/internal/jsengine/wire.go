package jsengine

import (
	"hash/fnv"
	"strconv"
)

// Wire shapes for the sidecar's newline-delimited JSON protocol, shared
// by the native subprocess transport (sidecar.go) and the WASM host hook
// transport (wasm.go) so the two can never drift. Field names follow the
// JSON tags per house style.
type sidecarJob struct {
	ID      int      `json:"id"`
	Op      string   `json:"op"`
	Source  string   `json:"source"`
	Flags   string   `json:"flags"`
	Samples []string `json:"samples"`
	// generate-op fields; omitted on validate jobs so their wire shape
	// stays byte-identical to the pre-generate protocol.
	Count       int    `json:"count,omitempty"`
	Seed        uint32 `json:"seed,omitempty"`
	MaxAttempts int    `json:"maxAttempts,omitempty"`
	MinLength   int    `json:"minLength,omitempty"`
	MaxLength   int    `json:"maxLength,omitempty"`
}

type sidecarResult struct {
	ID            int      `json:"id"`
	CompileError  string   `json:"compileError"`
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

// generateSeed derives the per-pattern PRNG seed the sidecar's seeded
// stream starts from: FNV-1a/32 over source\x00flags\x00count. Purely
// content-derived — no time, no host state — so a pattern generates the
// same samples on every machine, build, and rebuild.
func generateSeed(source, flags string, count int) uint32 {
	hash := fnv.New32a()
	hash.Write([]byte(source))
	hash.Write([]byte{0})
	hash.Write([]byte(flags))
	hash.Write([]byte{0})
	hash.Write([]byte(strconv.Itoa(count)))
	return hash.Sum32()
}

// generateBudget clamps the knobs and returns the effective (count,
// maxAttempts) pair: the whole retry budget is count × retries draws,
// floored so even degenerate configs allow one draw per wanted sample.
func generateBudget(count, retries int) (int, int) {
	if count < 1 {
		count = 1
	}
	if retries < 1 {
		retries = 1
	}
	return count, count * retries
}

// generateJobFor builds the one true generate-op wire job (ID assigned by
// the transport): both transports call this, so seed and budget can never
// be computed two different ways.
func generateJobFor(source, flags string, count, retries, minLength, maxLength int) sidecarJob {
	count, maxAttempts := generateBudget(count, retries)
	return sidecarJob{
		Op:          "generate",
		Source:      source,
		Flags:       flags,
		Count:       count,
		Seed:        generateSeed(source, flags, count),
		MaxAttempts: maxAttempts,
		MinLength:   minLength,
		MaxLength:   maxLength,
	}
}
