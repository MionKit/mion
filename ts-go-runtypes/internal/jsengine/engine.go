// Package jsengine runs JS-regex jobs for the resolver by driving a real
// JS engine: the bundled sidecar under a host node/bun in native builds
// (sidecar.go), the JS host itself under WASM (wasm.go). It exists because
// a pattern's mockSamples have exactly one job — satisfying the JS runtime
// validator — and Go's RE2 only approximates JS regex semantics: no
// lookarounds or backreferences, and divergent `.` / case-folding /
// code-unit behavior even on the shared syntax subset.
package jsengine

// TestResult is one pattern's verdict from the JS engine.
type TestResult struct {
	// CompileError is the JS SyntaxError message when the pattern does not
	// compile under `new RegExp` — a regex typo in the type definition.
	CompileError string
	// Offenders are the samples that do NOT match the compiled pattern.
	Offenders []string
}

// GenerateResult is one pattern's generated-samples answer from the JS
// engine.
type GenerateResult struct {
	// CompileError is the JS SyntaxError message when the pattern does not
	// compile under `new RegExp` (same lane as TestResult.CompileError).
	CompileError string
	// GenerateError means the pattern compiles but produced no samples:
	// randexp cannot handle a construct, or the whole retry budget yielded
	// nothing that survives the self-check. The caller surfaces it as the
	// declare-mockSamples-explicitly diagnostic.
	GenerateError string
	// Values are the generated samples: every one matches the pattern and
	// its length bounds, deduped, deterministic for the same inputs (may
	// be fewer than requested for small finite languages).
	Values []string
}

// Engine answers pattern jobs. Implementations must be safe for
// concurrent use — render walks call TestPattern in parallel.
type Engine interface {
	// TestPattern compiles source+flags with the real JS engine and tests
	// every sample (an empty sample list is a pure compile check). A
	// non-nil error means the engine itself could not run (no runtime
	// found, sidecar died, timeout) — the pattern was NOT checked and the
	// caller surfaces the missing-runtime diagnostic.
	TestPattern(source, flags string, samples []string) (TestResult, error)
	// GeneratePattern asks the JS engine for count samples matching
	// source+flags. The PRNG seed is derived from (source, flags, count),
	// so output is fully deterministic; retries is the per-sample draw
	// multiplier (whole budget = count × retries); minLength/maxLength
	// are UTF-16 length bounds every value must satisfy (0 = unbounded).
	// Error semantics mirror TestPattern: non-nil error = the engine
	// itself could not run, and the pattern-level outcomes live in the
	// result.
	GeneratePattern(source, flags string, count, retries, minLength, maxLength int) (GenerateResult, error)
}
