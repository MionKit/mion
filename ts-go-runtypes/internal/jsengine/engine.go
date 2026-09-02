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
	// TimedOut is the sidecar's explanation when evaluating one sample ran
	// out of the match budget, on the quiet retry too. It is a verdict about
	// the host (load) as much as about the pattern (catastrophic
	// backtracking), so callers raise the TRANSIENT FMT007 for it and never
	// persist it. Empty when every sample was judged.
	TimedOut string
	// Offenders are the samples that do NOT match the compiled pattern.
	Offenders []string
}

// GenerateRequest describes one pattern's sample-generation ask.
type GenerateRequest struct {
	Source string
	Flags  string
	// Count is how many samples generation aims for; Retries the per-sample
	// draw multiplier (whole budget = Count × Retries).
	Count   int
	Retries int
	// MinLength / MaxLength are UTF-16 length bounds every value must
	// satisfy (0 = unbounded).
	MinLength int
	MaxLength int
	// SeedKey, when non-nil, pins the run key mixed into the per-pattern
	// PRNG seed: same key, same pool, on every machine and every build —
	// the literal `mock.seed` reproducibility lane. Nil uses the engine's
	// own per-session RANDOM key: pools then come out different on every
	// fresh build while staying stable (memoized) within one session, so
	// watch-mode rebuilds never reshuffle mid-session.
	SeedKey *uint32
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
	// TimedOut mirrors TestResult.TimedOut for the generate op: a drawn
	// candidate's self-check ran out of the match budget, retry included.
	TimedOut string
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
	// GeneratePattern asks the JS engine for req.Count samples matching
	// req.Source+req.Flags. The PRNG seed mixes the run key (req.SeedKey
	// when pinned, else the engine's per-session random key) with the
	// pattern content, so a pinned key is reproducible across builds and
	// an unpinned one re-rolls per session — while identical asks within
	// one session always memoize to the same pool. Error semantics mirror
	// TestPattern: non-nil error = the engine itself could not run, and
	// the pattern-level outcomes live in the result.
	GeneratePattern(req GenerateRequest) (GenerateResult, error)
}
