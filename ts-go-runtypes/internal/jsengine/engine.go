// Package jsengine runs JS-regex jobs on a real JS engine: the bundled sidecar under a host node/bun natively (sidecar.go),
// the JS host itself under WASM (wasm.go). A pattern's mockSamples exist only to satisfy the JS runtime validator, and Go's RE2
// only approximates JS regex semantics: no lookarounds or backreferences, divergent `.`, case-folding and code-unit behavior.
package jsengine

// TestResult is one pattern's verdict from the JS engine.
type TestResult struct {
	// CompileError is the JS SyntaxError when the pattern does not compile under `new RegExp`: a regex typo in the type definition.
	CompileError string
	// TimedOut is set when a sample ran out of the match budget, quiet retry included; empty when every sample was judged.
	// It is about host load as much as about the pattern, so callers raise the TRANSIENT FMT007 for it and never persist it.
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
	// SeedKey pins the run key mixed into the per-pattern PRNG seed: same key, same pool, on every machine and build (the `mock.seed` lane).
	// Nil uses the engine's per-session RANDOM key: pools differ per fresh build but are memoized within a session, so watch-mode never reshuffles.
	SeedKey *uint32
}

// GenerateResult is one pattern's generated-samples answer from the JS engine.
type GenerateResult struct {
	// CompileError is the JS SyntaxError when the pattern does not compile (same lane as TestResult.CompileError).
	CompileError string
	// GenerateError means the pattern compiles but produced no samples: randexp cannot handle a construct, or nothing survived the self-check.
	// The caller surfaces it as the declare-mockSamples-explicitly diagnostic.
	GenerateError string
	// TimedOut mirrors TestResult.TimedOut: a drawn candidate's self-check ran out of the match budget, retry included.
	TimedOut string
	// Values each match the pattern and its length bounds, deduped and deterministic per input; fewer than requested for a small finite language.
	Values []string
}

// Engine answers pattern jobs; implementations must be safe for concurrent use, render walks call TestPattern in parallel.
type Engine interface {
	// TestPattern tests every sample against source+flags; an empty sample list is a pure compile check.
	// A non-nil error means the engine itself could not run, so the pattern was NOT checked and the caller reports the missing runtime.
	TestPattern(source, flags string, samples []string) (TestResult, error)
	// GeneratePattern asks for req.Count samples; the PRNG seed mixes the run key with the pattern content, so a pinned key
	// reproduces across builds, an unpinned one re-rolls per session, and identical asks within one session memoize to one pool.
	// Error semantics mirror TestPattern: a non-nil error is the engine failing to run, pattern-level outcomes live in the result.
	GeneratePattern(req GenerateRequest) (GenerateResult, error)
}
