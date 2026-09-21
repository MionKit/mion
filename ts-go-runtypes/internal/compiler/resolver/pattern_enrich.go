package resolver

import (
	"sort"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsengine"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// enrichPatternSamples fills auto-generated mockSamples into every sample-less pattern in the session
// cache's format annotations, a pattern nested in a sub-format map (a domain's names/tld, an email's
// localPart) included, so every downstream consumer sees the enriched map. SEEDING decides whether a
// pool is reproducible: a node demanded by seeded mock sites (the `mock.seed` hints on createMockDataFn
// call sites, protocol.Site.MockSeed) draws under a key mixed from their sorted distinct seeds, the same
// pool on every machine and build, while a node with NO seeded demand draws under the engine's
// per-session RANDOM key, stable within one session so watch-mode rebuilds never reshuffle; when a
// node's seed basis changes mid-session the pool WE generated is regenerated under the new basis, and
// declared samples are never touched. Runs single-threaded from rtRenderOpts / scopedDump, BEFORE the
// parallel family collects, and the engine memoizes per (pattern, knobs, seed), so repeat dispatches
// re-ask nothing. This is the ONE deliberate exception to Cache.NodesView's read-only contract, safe
// because the mutation is post-intern: the structural id was hashed at intern time, so typeIDs never
// depend on any of this. A failure leaves the samples absent and is RECORDED in sess.patternGenFailures,
// which the emit-time validateSamples lane reads to surface FMT005 at the demanding call sites; an
// engine-level error is left for the emitter's own TestPattern call to surface as FMT004.
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

// mockSeedBasis maps a node id to the sorted distinct mock.seed hints of the seeded sites whose demanded
// graph reaches it (the subtree walk recordFileIDs performs); an absent node uses the engine's random key.
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

// enrichParamsTree enriches one params-like map, then recurses into its map-valued children (sub-format
// params). A non-format map is a harmless no-op, having no nested `pattern` key. Depth is bounded
// defensively: real annotations nest two levels at most.
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

// enrichOneParams writes pattern.mockSamples for one params map carrying a sample-less pattern, or one
// whose pool WE generated under a different seed basis; declared samples always win.
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
		// A pool WE wrote is refreshed only when its seed basis changed; declared samples are never touched.
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
		// An engine-level failure is left to the emitter's own TestPattern call, which raises FMT004.
		return
	}
	// A timed-out self-check is recorded as such: the emitter raises the transient FMT007 (never cached)
	// for it instead of a permanent FMT005.
	if result.TimedOut != "" {
		sess.patternGenFailures[failureKey] = formats.PatternGenFailure{Reason: result.TimedOut, TimedOut: true}
		return
	}
	if result.GenerateError != "" {
		sess.patternGenFailures[failureKey] = formats.PatternGenFailure{Reason: result.GenerateError}
		return
	}
	if result.CompileError != "" || len(result.Values) == 0 {
		// CompileError is FMT002's lane (the emitter re-compiles); an empty clean result is a defensive
		// impossibility, so record nothing.
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

// hasDeclaredSamples accepts either an array of samples or the single char-set string form.
func hasDeclaredSamples(raw any) bool {
	switch typed := raw.(type) {
	case []any:
		return len(typed) > 0
	case string:
		return typed != ""
	}
	return false
}
