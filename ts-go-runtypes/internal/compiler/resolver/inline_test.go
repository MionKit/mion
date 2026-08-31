package resolver_test

import (
	"sort"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/constants"
	"github.com/mionkit/ts-runtypes/internal/jsengine"
	"github.com/mionkit/ts-runtypes/internal/reflection"
	"github.com/mionkit/ts-runtypes/internal/testfixtures"
)

// realMarkerOverlay returns the REAL `@mionjs/run-types` package (package.json
// + built dist .d.ts tree) as node_modules-relative overlay entries, so inline
// snippets resolve the marker module the way a consumer install does — no
// hand-written stand-in to drift. Fails the test with an actionable message
// when the marker dist is unbuilt.
func realMarkerOverlay(t testing.TB) map[string]string {
	t.Helper()
	files, err := testfixtures.RealMarkerPackage()
	if err != nil {
		t.Fatalf("real marker package unavailable: %v", err)
	}
	return files
}

// withRealMarker merges the real marker package into a caller's relative
// sources map — for tests that drive the SERVER path (OpSetSources) directly
// and therefore build their Sources maps by hand.
func withRealMarker(t testing.TB, sources map[string]string) map[string]string {
	t.Helper()
	merged := make(map[string]string, len(sources)+80)
	for rel, content := range realMarkerOverlay(t) {
		merged[rel] = content
	}
	for rel, content := range sources {
		merged[rel] = content
	}
	return merged
}

// setupInline builds a Session over an in-memory overlay of TypeScript
// sources. Mirrors withInlineSources in helpers/inline.ts so Go tests can
// keep their snippet right next to the assertions instead of jumping to a
// fixture file. Single-threaded (one pool checker, serial scan) — the
// shape every pre-parallel test was written against.
func setupInline(t testing.TB, sources map[string]string) *resolver.Session {
	t.Helper()
	return setupInlineWith(t, sources, func(programOpts *program.Options, resolverOpts *resolver.Options) {
		programOpts.SingleThreaded = true
		resolverOpts.SingleThreaded = true
	})
}

// setupInlineWith is setupInline with an options hook: mutate receives the
// program + resolver options after defaults are filled, letting parallel
// tests build multi-checker programs (leave SingleThreaded false) or flip
// the Disable* toggles. Overlay file names are registered in sorted order
// so the Program's file list — and therefore the pool's round-robin
// file→checker association — is deterministic across runs (Go map
// iteration order is not).
func setupInlineWith(t testing.TB, sources map[string]string, mutate func(*program.Options, *resolver.Options)) *resolver.Session {
	t.Helper()
	cwd := tspath.NormalizePath(t.TempDir())
	overlay := make(map[string]string, len(sources)+2)
	relNames := make([]string, 0, len(sources)+2)
	if _, ok := sources["runtypes.d.ts"]; !ok {
		// The real marker package, resolved like a consumer install. Not
		// added to relNames — module resolution pulls the files in through
		// the `@mionjs/run-types` import; they are never program roots. A
		// test that supplies its own "runtypes.d.ts" ambient (the deliberate
		// shape-probe suites) keeps that instead.
		for rel, content := range realMarkerOverlay(t) {
			overlay[tspath.ResolvePath(cwd, rel)] = content
		}
	}
	if _, ok := sources["temporal.d.ts"]; !ok {
		overlay[tspath.ResolvePath(cwd, "temporal.d.ts")] = testfixtures.TemporalDTS
		relNames = append(relNames, "temporal.d.ts")
	}
	for rel, code := range sources {
		overlay[tspath.ResolvePath(cwd, rel)] = code
		relNames = append(relNames, rel)
	}
	sort.Strings(relNames)
	fileNames := make([]string, 0, len(relNames))
	for _, rel := range relNames {
		fileNames = append(fileNames, tspath.ResolvePath(cwd, rel))
	}
	programOpts := program.Options{Cwd: cwd, Overlay: overlay}
	// The real sidecar engine (host node) is the default so pattern-bearing
	// fixtures validate exactly as a real build would; tests exercising the
	// missing-runtime path override JSEngine in their mutate hook. The
	// sample-generation knobs default to the binary defaults for the same
	// reason (a real build always carries them); tests exercising the
	// disabled lane set PatternSampleCount to 0 explicitly.
	resolverOpts := resolver.Options{
		Cwd:                  cwd,
		JSEngine:             jsengine.NewSidecar(""),
		PatternSampleCount:   constants.DefaultPatternSampleCount,
		PatternSampleRetries: constants.DefaultPatternSampleRetries,
	}
	if mutate != nil {
		mutate(&programOpts, &resolverOpts)
	}
	p, err := program.NewInferred(programOpts, fileNames)
	if err != nil {
		t.Fatalf("program.NewInferred: %v", err)
	}
	r, err := resolver.New(p, resolverOpts)
	if err != nil {
		t.Fatalf("resolver.New: %v", err)
	}
	t.Cleanup(r.Close)
	return r
}

// resolveInline pins code to test.ts in an in-memory program, scans it,
// and returns the resolver plus the RunType entry for the first call site.
// Tests that need to dump the full type list after the scan use the
// returned resolver; tests that only check the root type ignore it.
func resolveInline(t *testing.T, code string) (*resolver.Session, *reflection.RunType) {
	t.Helper()
	r := setupInline(t, map[string]string{"test.ts": code})
	tn := resolveFile(t, r, "test.ts")
	return r, tn
}
