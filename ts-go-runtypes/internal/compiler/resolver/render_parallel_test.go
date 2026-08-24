package resolver_test

import (
	"sort"
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// Parallel-render equivalence suite (track B). Renders are checker-free
// pure functions of the dump, so — unlike the scan track — equivalence
// here is byte-exact with no normalization caveats. Parallel SCAN is
// disabled on every resolver below to isolate the render axis; the
// fixtures (shared with the scan suite) cover both marker forms and emit
// RT-render diagnostics from multiple families.

// setupRenderResolver builds a resolver with serial scanning and the
// requested render mode.
func setupRenderResolver(t testing.TB, sources map[string]string, disableParallelRender bool) *resolver.Session {
	t.Helper()
	return setupInlineWith(t, sources, func(_ *program.Options, resolverOpts *resolver.Options) {
		resolverOpts.DisableParallelScan = true
		resolverOpts.DisableParallelRender = disableParallelRender
	})
}

// TestParallelRender_EquivalentToSerial pins every rendered cache source,
// the diagnostics (order included — multiple families contribute
// RT-render warnings via the i_dropped fixture), and the rest of the
// scanFiles response byte-equal between sequential and parallel renders.
func TestParallelRender_EquivalentToSerial(t *testing.T) {
	sources := parallelFixtureSources()
	files := parallelFixtureFiles()

	serial := setupRenderResolver(t, sources, true)
	parallel := setupRenderResolver(t, sources, false)

	serialResponse := serial.Dispatch(scanAllRequest(files))
	parallelResponse := parallel.Dispatch(scanAllRequest(files))

	// Sanity: the validate family and at least one other demanded family must
	// have produced entries (the fixture demands createValidateFn +
	// createJsonDecoderFn, whose strip strategy seeds restoreFromJson).
	if !hasFamilyEntry(parallelResponse, "validate") || !hasFamilyEntry(parallelResponse, "restoreFromJson") {
		t.Fatalf("expected validate + restoreFromJson entries to render")
	}

	serialJSON := responseJSON(t, serialResponse)
	parallelJSON := responseJSON(t, parallelResponse)
	if serialJSON != parallelJSON {
		t.Fatalf("parallel render diverged from serial.\nserial:   %s\nparallel: %s", serialJSON, parallelJSON)
	}
}

// TestParallelRender_DumpEquivalence pins the OpDump branch (no filter ⇒
// every family renders) byte-equal across render modes.
func TestParallelRender_DumpEquivalence(t *testing.T) {
	sources := parallelFixtureSources()

	serial := setupRenderResolver(t, sources, true)
	parallel := setupRenderResolver(t, sources, false)

	serialJSON := stripCwd(t, serial, responseJSON(t, serial.Dispatch(protocol.Request{Op: protocol.OpDump})))
	parallelJSON := stripCwd(t, parallel, responseJSON(t, parallel.Dispatch(protocol.Request{Op: protocol.OpDump})))
	if serialJSON != parallelJSON {
		t.Fatalf("parallel dump render diverged from serial")
	}
}

// TestParallelRender_Deterministic pins that two fresh parallel-render
// sessions produce byte-identical output.
func TestParallelRender_Deterministic(t *testing.T) {
	sources := parallelFixtureSources()
	files := parallelFixtureFiles()

	first := setupRenderResolver(t, sources, false)
	second := setupRenderResolver(t, sources, false)
	firstJSON := responseJSON(t, first.Dispatch(scanAllRequest(files)))
	secondJSON := responseJSON(t, second.Dispatch(scanAllRequest(files)))
	if firstJSON != secondJSON {
		t.Fatalf("two parallel-render sessions diverged")
	}
}

// TestParallelRender_MetricsPerFamily pins that the parallel join records
// a RenderMs entry for exactly the same families the sequential loop
// times (values legitimately differ — and overlap wall-clock).
func TestParallelRender_MetricsPerFamily(t *testing.T) {
	sources := parallelFixtureSources()
	files := parallelFixtureFiles()

	serial := setupRenderResolver(t, sources, true)
	parallel := setupRenderResolver(t, sources, false)

	request := scanAllRequest(files)
	request.IncludeMetrics = true
	serialResponse := serial.Dispatch(request)
	parallelResponse := parallel.Dispatch(request)
	if serialResponse.Metrics == nil || parallelResponse.Metrics == nil {
		t.Fatalf("expected metrics on both responses")
	}
	if got, want := renderMsKeys(parallelResponse.Metrics), renderMsKeys(serialResponse.Metrics); got != want {
		t.Fatalf("RenderMs key sets diverged: parallel %s, serial %s", got, want)
	}
}

func renderMsKeys(metrics *protocol.Metrics) string {
	keys := make([]string, 0, len(metrics.RenderMs))
	for key := range metrics.RenderMs {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return strings.Join(keys, ",")
}
