package resolver

import (
	"sort"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsengine"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// enrichPatternSamples fills auto-generated mockSamples into every
// sample-less pattern in the session cache's format annotations: for each
// params map (the annotation's own, or a nested sub-format map like a
// domain's names/tld or an email's localPart — the mock draws from those
// too) carrying a `pattern` object with a `source` but NO declared samples
// (neither pattern.mockSamples nor a sibling mockSamples), it asks the JS
// engine for PatternSampleCount values and writes them into the pattern
// object, so every downstream consumer (family emitters, the runtype
// module's writeFormatAnnotation, wire RunTypes) sees the enriched map.
//
// SEEDING — who decides whether a pool is reproducible: the literal
// `mock.seed` hints carried by the createMockDataFn call sites
// (protocol.Site.MockSeed, read through the CompTimeHints marker). A node
// demanded by seeded mock sites gets a run key mixed from their sorted
// distinct seeds — same seeds, same pool, on every machine and build. A
// node with NO seeded demand generates under the engine's per-session
// RANDOM key: a different pool on every fresh build, stable within one
// session (watch-mode rebuilds never reshuffle mid-session). When a node's
// seed basis changes mid-session (a newly scanned file adds a seeded
// site), the pool WE generated is regenerated under the new basis;
// declared samples are never touched.
//
// Runs single-threaded from rtRenderOpts / scopedDump, BEFORE the parallel
// family collects. The engine memoizes per (pattern, knobs, seed), so
// repeat dispatches re-ask nothing.
//
// This is the ONE deliberate exception to Cache.NodesView's read-only
// contract, and it is safe because the mutation is post-intern: the
// structural id was hashed at intern time, so typeIDs never depend on any
// of this, and re-scans reuse the interned node via byStructural without
// re-reading the params.
//
// Failures (unsupported construct, exhausted retry budget) leave the
// samples absent and are RECORDED in sess.patternGenFailures — the
// emit-time validateSamples lane reads that record and surfaces FMT005
// anchored at the demanding call sites (an engine-level error is left for
// the emitter's own TestPattern call to surface as FMT004).
func (sess *Session) enrichPatternSamples() {
	if sess == nil || sess.cache == nil {
		return
	}
	count := sess.opts.PatternSampleCount
	engine := sess.opts.JSEngine
	if count <= 0 || engine == nil {
		return
	}
	if sess.patternSeedBasis == nil {
		sess.patternSeedBasis = map[string]string{}
	}
	if sess.patternGenFailures == nil {
		sess.patternGenFailures = map[string]formats.PatternGenFailure{}
	}
	seedsByNode := sess.mockSeedBasis()
	for id, node := range sess.cache.NodesView() {
		if node == nil || node.FormatAnnotation == nil {
			continue
		}
		sess.enrichParamsTree(engine, node.FormatAnnotation.Params, id, seedsByNode[id], 0)
	}
}

// mockSeedBasis maps every node id to the sorted distinct mock.seed hints
// of the seeded mock call sites whose demanded type graph reaches it (the
// same subtree walk recordFileIDs performs). Nodes no seeded site reaches
// are absent — their pools use the engine's random session key.
func (sess *Session) mockSeedBasis() map[string][]string {
	var basis map[string]map[string]struct{}
	for _, site := range sess.sites {
		if site.MockSeed == "" || site.ID == "" {
			continue
		}
		if basis == nil {
			basis = map[string]map[string]struct{}{}
		}
		visited := map[string]struct{}{}
		var walk func(id string)
		walk = func(id string) {
			if id == "" {
				return
			}
			if _, seen := visited[id]; seen {
				return
			}
			visited[id] = struct{}{}
			set := basis[id]
			if set == nil {
				set = map[string]struct{}{}
				basis[id] = set
			}
			set[site.MockSeed] = struct{}{}
			node := sess.cache.NodeByID(id)
			if node == nil {
				return
			}
			node.EachRefSlot(func(ref *reflection.RunType) { walk(ref.ID) })
		}
		walk(site.ID)
	}
	if basis == nil {
		return nil
	}
	out := make(map[string][]string, len(basis))
	for id, set := range basis {
		seeds := make([]string, 0, len(set))
		for seed := range set {
			seeds = append(seeds, seed)
		}
		sort.Strings(seeds)
		out[id] = seeds
	}
	return out
}

// enrichParamsTree enriches one params-like map, then recurses into its
// map-valued children (sub-format params). Non-format maps are harmless
// no-ops: a `pattern` object has no nested `pattern` key, and the
// char/value op objects ({val, mockSamples, …}) have none either. Depth
// is bounded defensively — real annotations nest two levels at most.
func (sess *Session) enrichParamsTree(engine jsengine.Engine, params map[string]any, nodeID string, seeds []string, depth int) {
	if params == nil || depth > 8 {
		return
	}
	sess.enrichOneParams(engine, params, nodeID, seeds)
	for _, value := range params {
		if child, ok := value.(map[string]any); ok {
			sess.enrichParamsTree(engine, child, nodeID, seeds, depth+1)
		}
	}
}

// enrichOneParams generates and writes pattern.mockSamples for a single
// params map when it carries a sample-less pattern (or one whose pool WE
// generated under a different seed basis). Declared samples always win.
func (sess *Session) enrichOneParams(engine jsengine.Engine, params map[string]any, nodeID string, seeds []string) {
	pattern, ok := params["pattern"].(map[string]any)
	if !ok {
		return
	}
	source, ok := pattern["source"].(string)
	if !ok {
		return
	}
	basisKey := nodeID + "\x00" + source
	basisNow := "\x01" + joinSeeds(seeds)
	appliedBasis, generatedByUs := sess.patternSeedBasis[basisKey]
	if hasDeclaredSamples(pattern["mockSamples"]) || hasDeclaredSamples(params["mockSamples"]) {
		// Samples present: declared ones are never touched; a pool WE wrote
		// is refreshed only when its seed basis changed (a seeded mock site
		// appeared after the pool was drawn).
		if !generatedByUs || appliedBasis == basisNow {
			return
		}
	}
	flags, _ := pattern["flags"].(string)
	minLength, maxLength := formats.PatternSampleLengthHints(params)
	request := jsengine.GenerateRequest{
		Source:    source,
		Flags:     flags,
		Count:     sess.opts.PatternSampleCount,
		Retries:   sess.opts.PatternSampleRetries,
		MinLength: minLength,
		MaxLength: maxLength,
	}
	if len(seeds) > 0 {
		seedKey := jsengine.SeedKeyFromStrings(seeds)
		request.SeedKey = &seedKey
	}
	failureKey := source + "\x00" + flags
	result, err := engine.GeneratePattern(request)
	if err != nil {
		// Engine-level failure: leave it to the emitter's own TestPattern
		// call, which surfaces FMT004 with the same error.
		return
	}
	// A timed-out self-check is recorded as such: the emitter raises the
	// transient FMT007 for it (never cached) instead of a permanent FMT005.
	if result.TimedOut != "" {
		sess.patternGenFailures[failureKey] = formats.PatternGenFailure{Reason: result.TimedOut, TimedOut: true}
		return
	}
	if result.GenerateError != "" {
		sess.patternGenFailures[failureKey] = formats.PatternGenFailure{Reason: result.GenerateError}
		return
	}
	if result.CompileError != "" || len(result.Values) == 0 {
		// CompileError is FMT002's lane (the emitter re-compiles); an empty
		// clean result is a defensive impossibility — record nothing.
		return
	}
	values := make([]any, len(result.Values))
	for i, value := range result.Values {
		values[i] = value
	}
	pattern["mockSamples"] = values
	sess.patternSeedBasis[basisKey] = basisNow
	delete(sess.patternGenFailures, failureKey)
}

// joinSeeds renders a seed basis for change detection.
func joinSeeds(seeds []string) string {
	out := ""
	for _, seed := range seeds {
		out += seed + "\x01"
	}
	return out
}

// hasDeclaredSamples reports whether a mockSamples param value declares at
// least one sample (an array of samples, or the single char-set string
// form).
func hasDeclaredSamples(raw any) bool {
	switch typed := raw.(type) {
	case []any:
		return len(typed) > 0
	case string:
		return typed != ""
	}
	return false
}
