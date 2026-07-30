package string

import (
	"strings"
	"unicode/utf16"

	"github.com/mionkit/ts-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/jsquote"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// recoverPattern extracts a regex source+flags from a format's `pattern`
// param. The param is always a resolved literal object {source, flags,
// …} — produced either by registerFormatPattern (user formats, recovered
// from the call AST by the typeid scanner) or by an inline string-literal
// source (the built-in formats, .d.ts-safe). Returns ok=false when there
// is no usable pattern param.
func recoverPattern(params map[string]any) (source, flags string, ok bool) {
	raw, present := params["pattern"]
	if !present {
		return "", "", false
	}
	pattern, isMap := raw.(map[string]any)
	if !isMap {
		return "", "", false
	}
	src, isString := pattern["source"].(string)
	if !isString {
		return "", "", false
	}
	flagStr, _ := pattern["flags"].(string)
	return src, flagStr, true
}

// recoverSamples extracts the mockSamples as a list of strings. Looks
// inside the pattern object first (the FormatPattern form, where samples
// live with the regex they validate), then falls back to a top-level
// mockSamples (the built-in string-source form). Accepts both the array
// form and a single allowed-chars string.
func recoverSamples(params map[string]any) []string {
	if pattern, ok := params["pattern"].(map[string]any); ok {
		if samples := samplesFromValue(pattern["mockSamples"]); samples != nil {
			return samples
		}
	}
	return samplesFromValue(params["mockSamples"])
}

func samplesFromValue(raw any) []string {
	switch typed := raw.(type) {
	case []any:
		out := make([]string, 0, len(typed))
		for _, item := range typed {
			if str, ok := item.(string); ok {
				out = append(out, str)
			}
		}
		return out
	case string:
		return []string{typed}
	}
	return nil
}

// namedPatternValidate is the validate body for a pattern format (domain /
// email / url): the AND of any length bounds and the regex test, plus
// build-time mockSample validation. Empty when neither is present.
func namedPatternValidate(ctx formats.EmitContext, annotation *protocol.FormatAnnotation, vλl string) string {
	if annotation == nil {
		return ""
	}
	validateSampleBounds(ctx, annotation.Params)
	conditions := lengthConditions(annotation.Params, vλl)
	if source, flags, ok := recoverPattern(annotation.Params); ok {
		validateSamples(ctx, source, flags, recoverSamples(annotation.Params))
		conditions = append(conditions, emitPatternTest(ctx, source, flags, vλl))
	}
	return strings.Join(conditions, " && ")
}

// namedPatternErrors is the validationErrors body for a pattern format. One
// push per failing length bound, plus one for the pattern, each tagged
// with the format name.
func namedPatternErrors(ctx formats.EmitContext, annotation *protocol.FormatAnnotation, vλl, pathExpr, errorsArr, name string) string {
	if annotation == nil {
		return ""
	}
	statements := lengthErrorStatements(ctx, annotation.Params, vλl, pathExpr, errorsArr, name)
	if source, flags, ok := recoverPattern(annotation.Params); ok {
		test := emitPatternTest(ctx, source, flags, vλl)
		statements = append(statements,
			"if (!("+test+")) "+formats.FormatErrCall(pathExpr, errorsArr, "string", name, "pattern", "'pattern'"))
	}
	return strings.Join(statements, ";")
}

// emitPatternTest hoists `const re_N = new RegExp(source, flags)` into
// the factory prologue and returns the `re_N.test(vλl)` expression.
// Mirrors the template-literal validate emitter's hoist pattern so the
// regex compiles once per factory, not per validator call.
func emitPatternTest(ctx formats.EmitContext, source, flags, vλl string) string {
	reVar := ctx.NextLocalVar("reFmt")
	if !ctx.HasContextItem(reVar) {
		construct := "const " + reVar + " = new RegExp(" + jsquote.Double(source) + ", " + jsquote.Double(flags) + ")"
		ctx.SetContextItem(reVar, construct)
	}
	return reVar + ".test(" + vλl + ")"
}

// validateSamples runs the pattern through the JS engine — the real
// `new RegExp` the emitted validator uses at runtime — compiling the
// source (a syntax error is CodeFMTInvalidParams: the emitted validator
// would throw at factory load) and checking every mockSample against it
// (mismatches are CodeFMTSampleMismatch, naming every offender). Runs
// even with zero samples: the compile check stands on its own. When the
// engine itself cannot run (no node/bun found, sidecar died) the pattern
// is unverifiable and CodeFMTMissingJsRuntime fails the build closed.
//
// A pattern that compiles clean but still has NO samples at emit time is
// one the resolver's enrichment pass could not fill: generation is
// disabled (patternSampleCount 0) or it failed. Both are
// CodeFMTSampleGenFailed here — the walk has the demanding call sites, so
// the squiggle lands on the user's createX<T>() call; the failure reason
// comes from the record the enrichment pass left (EmitContext.PatternGenFailure).
func validateSamples(ctx formats.EmitContext, source, flags string, samples []string) {
	engine := ctx.JSEngine()
	if engine == nil {
		ctx.EmitDiagnostic(diagnostics.CodeFMTMissingJsRuntime, source, "no JS engine configured")
		return
	}
	verdict, err := engine.TestPattern(source, flags, samples)
	if err != nil {
		ctx.EmitDiagnostic(diagnostics.CodeFMTMissingJsRuntime, source, err.Error())
		return
	}
	if verdict.CompileError != "" {
		ctx.EmitDiagnostic(diagnostics.CodeFMTInvalidParams, "pattern /"+source+"/"+flags+" does not compile as a JS RegExp: "+verdict.CompileError)
		return
	}
	// One diagnostic naming every mismatching sample: the walker dedups
	// per code per walk, so per-sample diagnostics would collapse to the
	// first offender anyway.
	if len(verdict.Offenders) > 0 {
		ctx.EmitDiagnostic(diagnostics.CodeFMTSampleMismatch, strings.Join(verdict.Offenders, ", "), source)
	}
	if len(samples) == 0 {
		if ctx.PatternSampleCount() <= 0 {
			ctx.EmitDiagnostic(diagnostics.CodeFMTSampleGenFailed, source, "sample generation is disabled (patternSampleCount 0)")
			return
		}
		// The resolver's enrichment pass already tried to generate for this
		// pattern and recorded why it could not — surface that reason here,
		// where the walk has the demanding call sites to anchor it.
		if reason := ctx.PatternGenFailure(source, flags); reason != "" {
			ctx.EmitDiagnostic(diagnostics.CodeFMTSampleGenFailed, source, reason)
			return
		}
		ctx.EmitDiagnostic(diagnostics.CodeFMTSampleGenFailed, source, "sample generation produced no values")
	}
}

// validateSampleBounds checks that the canonical VALUE samples the mock
// generator would draw from satisfy the format's statically checkable
// siblings, mirroring the runtime mock's own soundness rules
// (mocking/mockStringFormat.ts):
//
//   - length / minLength / maxLength are a FILTER at mock time
//     (filterSamplesByLength): the mock keeps the length-compatible samples
//     and picks among them, throwing only when EVERY sample is filtered out.
//     So a length violation is a build Error only in that all-violate case —
//     a partial list (e.g. `['aa', 'aaaaaa']` under minLength 5, where
//     'aaaaaa' survives) is valid, not a mistake. Lengths count UTF-16 code
//     units, matching the emitted `.length` validator (astral-safe).
//   - allowedChars / disallowedChars / disallowedValues are NOT filtered at
//     mock time, so the generator can pick ANY surviving sample: a single
//     violating survivor is a latent unsound mock (validate(mock()) may
//     fail). Those are flagged per offending sample.
//
// Every violation rides one CodeFMTSampleBounds diagnostic (composed
// message) — the walker dedups per code per walk. Independent of FMT001's
// pattern check; bounds apply even when no pattern is present.
func validateSampleBounds(ctx formats.EmitContext, params map[string]any) {
	pool := sampleDrawPool(params)
	if len(pool) == 0 {
		return
	}
	survivors := lengthSurvivors(params, pool)
	if len(survivors) == 0 {
		// Every sample fails the length bounds: the mock would throw. Name
		// each offender against the bound it trips.
		ctx.EmitDiagnostic(diagnostics.CodeFMTSampleBounds, strings.Join(lengthBoundViolations(params, pool), "; "))
		return
	}
	// The mock draws from the length survivors — check those against the
	// unfiltered char/value ops.
	if violations := charValueViolations(params, survivors); len(violations) > 0 {
		ctx.EmitDiagnostic(diagnostics.CodeFMTSampleBounds, strings.Join(violations, "; "))
	}
}

// lengthSurvivors returns the pool members that satisfy every length bound
// (length / minLength / maxLength), mirroring the runtime
// filterSamplesByLength. Returns the whole pool when no length bound is set.
func lengthSurvivors(params map[string]any, pool []string) []string {
	length, hasLength := formats.ReadNumberParam(params, "length")
	minLen, hasMin := formats.ReadNumberParam(params, "minLength")
	maxLen, hasMax := formats.ReadNumberParam(params, "maxLength")
	if !hasLength && !hasMin && !hasMax {
		return pool
	}
	return filterSamples(pool, func(sample string) bool {
		size := utf16Len(sample)
		if hasLength && size != int(length) {
			return false
		}
		if hasMin && size < int(minLen) {
			return false
		}
		if hasMax && size > int(maxLen) {
			return false
		}
		return true
	})
}

// sampleDrawPool returns the canonical VALUE samples the mock generator
// draws from for these params, mirroring mockStringParams' precedence
// (mocking/mockStringFormat.ts): allowedValues.val wins; otherwise the
// first present of the top-level mockSamples, the pattern's mockSamples,
// or disallowedValues' mockSamples. The char-pool formats (allowedChars /
// disallowedChars) build a value from a character set rather than picking
// a declared value, so — absent a shadowing top-level mockSamples — they
// contribute no value whose length can be checked and return nil.
func sampleDrawPool(params map[string]any) []string {
	if vals, _, ok := readValuesParam(params, "allowedValues"); ok {
		return vals
	}
	if samples := samplesFromValue(params["mockSamples"]); len(samples) > 0 {
		return samples
	}
	if pattern, ok := params["pattern"].(map[string]any); ok {
		if samples := samplesFromValue(pattern["mockSamples"]); len(samples) > 0 {
			return samples
		}
	}
	if disallowed, ok := params["disallowedValues"].(map[string]any); ok {
		if samples := samplesFromValue(disallowed["mockSamples"]); len(samples) > 0 {
			return samples
		}
	}
	return nil
}

// lengthBoundViolations returns one composed message per violated length
// bound, each naming every sample that trips it. Lengths count UTF-16
// code units so astral characters agree with the emitted `.length` check.
func lengthBoundViolations(params map[string]any, pool []string) []string {
	var messages []string
	if value, ok := formats.ReadNumberParam(params, "length"); ok {
		want := int(value)
		if offenders := filterSamples(pool, func(sample string) bool { return utf16Len(sample) != want }); len(offenders) > 0 {
			messages = append(messages, "sample(s) "+quoteJoin(offenders)+" are not exactly length "+formats.FormatNumber(value))
		}
	}
	if value, ok := formats.ReadNumberParam(params, "minLength"); ok {
		min := int(value)
		if offenders := filterSamples(pool, func(sample string) bool { return utf16Len(sample) < min }); len(offenders) > 0 {
			messages = append(messages, "sample(s) "+quoteJoin(offenders)+" are shorter than minLength "+formats.FormatNumber(value))
		}
	}
	if value, ok := formats.ReadNumberParam(params, "maxLength"); ok {
		max := int(value)
		if offenders := filterSamples(pool, func(sample string) bool { return utf16Len(sample) > max }); len(offenders) > 0 {
			messages = append(messages, "sample(s) "+quoteJoin(offenders)+" are longer than maxLength "+formats.FormatNumber(value))
		}
	}
	return messages
}

// charValueViolations returns one composed message per violated
// char/value sibling (allowedChars / disallowedChars / disallowedValues).
// Only one complex param can be present (FMT002 enforces it), so at most
// one of these applies. Uses plain Go string ops — no regex, so no RE2
// concern.
func charValueViolations(params map[string]any, pool []string) []string {
	var messages []string
	if val, _, ok := readCharParam(params, "allowedChars"); ok {
		allowed := runeSet(val)
		offenders := filterSamples(pool, func(sample string) bool { return !onlyRunes(sample, allowed) })
		if len(offenders) > 0 {
			messages = append(messages, "sample(s) "+quoteJoin(offenders)+" contain characters outside allowedChars "+jsquote.Double(val))
		}
	}
	if val, _, ok := readCharParam(params, "disallowedChars"); ok {
		offenders := filterSamples(pool, func(sample string) bool { return strings.ContainsAny(sample, val) })
		if len(offenders) > 0 {
			messages = append(messages, "sample(s) "+quoteJoin(offenders)+" contain disallowed characters from disallowedChars "+jsquote.Double(val))
		}
	}
	if vals, flags, ok := readValuesParam(params, "disallowedValues"); ok {
		ignoreCase := strings.Contains(flags, "i")
		offenders := filterSamples(pool, func(sample string) bool { return inValueSet(sample, vals, ignoreCase) })
		if len(offenders) > 0 {
			messages = append(messages, "sample(s) "+quoteJoin(offenders)+" are in the disallowedValues set")
		}
	}
	return messages
}

// filterSamples returns the members of pool for which predicate is true.
func filterSamples(pool []string, predicate func(string) bool) []string {
	var out []string
	for _, sample := range pool {
		if predicate(sample) {
			out = append(out, sample)
		}
	}
	return out
}

// utf16Len counts the UTF-16 code units in s — what JS `String.length`
// reports (an astral character is two units). Go's len() counts bytes and
// utf8.RuneCountInString counts code points; neither matches the emitted
// validator, so samples with astral characters would mis-validate.
func utf16Len(s string) int {
	return len(utf16.Encode([]rune(s)))
}

// quoteJoin renders a sample list as a comma-separated run of
// double-quoted JS string literals for a diagnostic message.
func quoteJoin(samples []string) string {
	quoted := make([]string, len(samples))
	for i, sample := range samples {
		quoted[i] = jsquote.Double(sample)
	}
	return strings.Join(quoted, ", ")
}

// runeSet returns the set of runes in val (an allowedChars character set).
func runeSet(val string) map[rune]bool {
	set := make(map[rune]bool, len(val))
	for _, r := range val {
		set[r] = true
	}
	return set
}

// onlyRunes reports whether every rune of sample is in allowed.
func onlyRunes(sample string, allowed map[rune]bool) bool {
	for _, r := range sample {
		if !allowed[r] {
			return false
		}
	}
	return true
}

// inValueSet reports whether sample equals any member of vals, honoring
// the ignoreCase flag (case-folded compare) the emitted validator uses.
func inValueSet(sample string, vals []string, ignoreCase bool) bool {
	for _, value := range vals {
		if sample == value || (ignoreCase && strings.EqualFold(sample, value)) {
			return true
		}
	}
	return false
}
