package resolver

import (
	"github.com/mionkit/ts-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/ts-runtypes/internal/jsengine"
)

// enrichPatternSamples fills auto-generated mockSamples into every
// sample-less pattern in the session cache's format annotations: for each
// params map (the annotation's own, or a nested sub-format map like a
// domain's names/tld or an email's localPart — the mock draws from those
// too) carrying a `pattern` object with a `source` but NO declared samples
// (neither pattern.mockSamples nor a sibling mockSamples), it asks the JS
// engine for PatternSampleCount deterministic values and writes them into
// the pattern object, so every downstream consumer (family emitters, the
// runtype module's writeFormatAnnotation, wire RunTypes) sees the enriched
// map.
//
// Runs single-threaded from rtRenderOpts / scopedDump, BEFORE the parallel
// family collects. Idempotent: enriched patterns carry samples and are
// skipped on the next dispatch; the engine memoizes per (pattern, knobs),
// so re-asking is a map hit.
//
// This is the ONE deliberate exception to Cache.NodesView's read-only
// contract, and it is safe because the mutation is post-intern: the
// structural id was hashed at intern time, so typeIDs never depend on the
// generation knobs, and re-scans reuse the interned node via byStructural
// without re-reading the params.
//
// Failures (engine down, unsupported construct, exhausted retry budget)
// leave the samples absent and emit NOTHING here — a nested format node
// has no provenance. The emit-time validateSamples lane replays the
// memoized GeneratePattern call and surfaces FMT005/FMT004 anchored at the
// demanding call sites.
func (sess *Session) enrichPatternSamples() {
	if sess == nil || sess.cache == nil {
		return
	}
	count := sess.opts.PatternSampleCount
	engine := sess.opts.JSEngine
	if count <= 0 || engine == nil {
		return
	}
	for _, node := range sess.cache.NodesView() {
		if node == nil || node.FormatAnnotation == nil {
			continue
		}
		sess.enrichParamsTree(engine, node.FormatAnnotation.Params, 0)
	}
}

// enrichParamsTree enriches one params-like map, then recurses into its
// map-valued children (sub-format params). Non-format maps are harmless
// no-ops: a `pattern` object has no nested `pattern` key, and the
// char/value op objects ({val, mockSamples, …}) have none either. Depth
// is bounded defensively — real annotations nest two levels at most.
func (sess *Session) enrichParamsTree(engine jsengine.Engine, params map[string]any, depth int) {
	if params == nil || depth > 8 {
		return
	}
	sess.enrichOneParams(engine, params)
	for _, value := range params {
		if child, ok := value.(map[string]any); ok {
			sess.enrichParamsTree(engine, child, depth+1)
		}
	}
}

// enrichOneParams generates and writes pattern.mockSamples for a single
// params map when it carries a sample-less pattern. Declared samples
// (pattern-level or sibling-level) always win.
func (sess *Session) enrichOneParams(engine jsengine.Engine, params map[string]any) {
	pattern, ok := params["pattern"].(map[string]any)
	if !ok {
		return
	}
	source, ok := pattern["source"].(string)
	if !ok {
		return
	}
	if hasDeclaredSamples(pattern["mockSamples"]) || hasDeclaredSamples(params["mockSamples"]) {
		return
	}
	flags, _ := pattern["flags"].(string)
	minLength, maxLength := formats.PatternSampleLengthHints(params)
	result, err := engine.GeneratePattern(source, flags, sess.opts.PatternSampleCount, sess.opts.PatternSampleRetries, minLength, maxLength)
	if err != nil || result.CompileError != "" || result.GenerateError != "" || len(result.Values) == 0 {
		return
	}
	values := make([]any, len(result.Values))
	for i, value := range result.Values {
		values[i] = value
	}
	pattern["mockSamples"] = values
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
