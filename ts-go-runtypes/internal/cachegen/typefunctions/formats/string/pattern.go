package string

import (
	"strings"
	"unicode/utf8"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsquote"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
	"github.com/mionkit/mion/ts-go-runtypes/internal/regexsafety"
)

// recoverPattern extracts a regex source and flags from a format's `pattern` param, always a resolved literal
// object from either registerFormatPattern or an inline string-literal source.
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

// recoverSamples reads the pattern object's own mockSamples first, where samples live with the regex they
// validate, then falls back to a top-level mockSamples. Both the array form and a single string are accepted.
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

// namedPatternValidate is the validate body for a pattern format (domain / email / url): the AND of the length
// bounds and the regex test, plus build-time mockSample validation.
func namedPatternValidate(ctx formats.EmitContext, annotation *reflection.FormatAnnotation, vλl string) string {
	if annotation == nil {
		return ""
	}
	validateSampleBounds(ctx, annotation.Params)
	conditions := lengthConditions(annotation.Params, vλl, ctx)
	if source, flags, ok := recoverPattern(annotation.Params); ok {
		validatePatternSafety(ctx, annotation.Params, source, flags)
		validateSamples(ctx, source, flags, recoverSamples(annotation.Params))
		conditions = append(conditions, emitPatternTest(ctx, source, flags, vλl))
	}
	return strings.Join(conditions, " && ")
}

// namedPatternErrors is the validationErrors twin of namedPatternValidate, each error tagged with the format name.
func namedPatternErrors(ctx formats.EmitContext, annotation *reflection.FormatAnnotation, vλl, pathExpr, errorsArr, name string) string {
	if annotation == nil {
		return ""
	}
	statements := lengthErrorStatements(ctx, annotation.Params, vλl, pathExpr, errorsArr, name, "")
	if source, flags, ok := recoverPattern(annotation.Params); ok {
		test := emitPatternTest(ctx, source, flags, vλl)
		statements = append(statements,
			"if (!("+test+")) "+formats.FormatErrCall(pathExpr, errorsArr, "string", name, "pattern", "'pattern'"))
	}
	return strings.Join(statements, ";")
}

// emitPatternTest hoists the RegExp into the factory prologue, as the template-literal validate emitter does,
// so it compiles once per factory rather than per validator call.
func emitPatternTest(ctx formats.EmitContext, source, flags, vλl string) string {
	reVar := ctx.NextLocalVar("reFmt")
	if !ctx.HasContextItem(reVar) {
		construct := "const " + reVar + " = new RegExp(" + jsquote.Double(source) + ", " + jsquote.Double(flags) + ")"
		ctx.SetContextItem(reVar, construct)
	}
	return reVar + ".test(" + vλl + ")"
}

// validatePatternSafety rejects a pattern a crafted input can make backtrack exponentially: the emitted
// validator runs it on every value, so a runaway pattern is a denial-of-service hole in whatever ships it.
// Static and pure Go on purpose: the other guard, the sidecar's per-sample time budget, needs a host that can
// interrupt a running match, and only V8 can, so it never fires under bun. This one also judges the pattern
// itself rather than the handful of samples it happens to carry.
// `unsafePattern: true` on the pattern params opts out, for a pattern the check reads wrongly.
func validatePatternSafety(ctx formats.EmitContext, params map[string]any, source, flags string) {
	if pattern, ok := params["pattern"].(map[string]any); ok {
		if optOut, present := formats.ReadBoolParam(pattern, "unsafePattern"); present && optOut {
			return
		}
	}
	if finding, found := regexsafety.Check(source, flags); found {
		ctx.EmitDiagnostic(diagnostics.CodeFMTPatternUnsafe, source, finding.Reason, finding.Excerpt)
	}
}

// validateSamples runs the pattern through the REAL `new RegExp` the emitted validator will use: a syntax error
// is CodeFMTInvalidParams, since the validator would throw at factory load, and a mismatching mockSample is
// CodeFMTSampleMismatch. It runs even with zero samples, because the compile check stands on its own.
// An engine that cannot run at all leaves the pattern unverifiable, so CodeFMTMissingJsRuntime fails closed.
// A pattern that compiles clean and still has NO samples is one the enrichment pass could not fill, either
// because generation is disabled or because it failed. Reporting both here puts the squiggle on the user's
// createX<T>() call, which only this walk knows.
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
	// Transient on purpose (diagnostics.IsTransient, so the disk cache skips the entry): a saturated host blows
	// the budget on a perfectly fine pattern, and the next build must judge it again, not replay this verdict.
	if verdict.TimedOut != "" {
		ctx.EmitDiagnostic(diagnostics.CodeFMTPatternTimeout, source, verdict.TimedOut)
		return
	}
	// One diagnostic naming every mismatch: the walker dedups per code per walk, so per-sample ones would
	// collapse to the first offender.
	if len(verdict.Offenders) > 0 {
		ctx.EmitDiagnostic(diagnostics.CodeFMTSampleMismatch, strings.Join(verdict.Offenders, ", "), source)
	}
	if len(samples) == 0 {
		if ctx.PatternSampleCount() <= 0 {
			ctx.EmitDiagnostic(diagnostics.CodeFMTSampleGenFailed, source, "sample generation is disabled (patternSampleCount 0)")
			return
		}
		// The enrichment pass recorded why it could not generate; report it here, where the walk has the
		// demanding call sites to anchor it.
		if failure := ctx.PatternGenFailure(source, flags); failure.Reason != "" {
			// Same transient lane as the validate-side timeout above.
			if failure.TimedOut {
				ctx.EmitDiagnostic(diagnostics.CodeFMTPatternTimeout, source, failure.Reason)
				return
			}
			ctx.EmitDiagnostic(diagnostics.CodeFMTSampleGenFailed, source, failure.Reason)
			return
		}
		ctx.EmitDiagnostic(diagnostics.CodeFMTSampleGenFailed, source, "sample generation produced no values")
	}
}

// validateSampleBounds checks the VALUE samples the mock generator would draw from against the format's
// statically checkable siblings, mirroring the runtime mock's own rules (mocking/mockStringFormat.ts):
//
//   - length / minLength / maxLength are a FILTER at mock time: the mock picks among the length-compatible
//     samples and throws only when EVERY sample is filtered out, so a violation is a build Error in that case
//     alone. A partial list like `['aa', 'aaaaaa']` under minLength 5 is valid, not a mistake.
//   - allowedChars / disallowedChars / disallowedValues are NOT filtered, so the generator can pick ANY
//     survivor: one violating survivor is a latent unsound mock, and each is flagged.
//
// Every violation rides one CodeFMTSampleBounds diagnostic, since the walker dedups per code per walk.
// Independent of FMT001's pattern check: bounds apply even when no pattern is present.
func validateSampleBounds(ctx formats.EmitContext, params map[string]any) {
	pool := sampleDrawPool(params)
	if len(pool) == 0 {
		return
	}
	survivors := lengthSurvivors(params, pool)
	if len(survivors) == 0 {
		// Every sample fails the length bounds, so the mock would throw; name each against the bound it trips.
		ctx.EmitDiagnostic(diagnostics.CodeFMTSampleBounds, strings.Join(lengthBoundViolations(params, pool), "; "))
		return
	}
	// The mock draws from the length survivors, so those are what the unfiltered char/value ops must accept.
	if violations := charValueViolations(params, survivors); len(violations) > 0 {
		ctx.EmitDiagnostic(diagnostics.CodeFMTSampleBounds, strings.Join(violations, "; "))
	}
}

// lengthSurvivors returns the pool members satisfying every length bound, mirroring the runtime
// filterSamplesByLength.
func lengthSurvivors(params map[string]any, pool []string) []string {
	length, hasLength := formats.ReadNumberParam(params, "length")
	minLen, hasMin := formats.ReadNumberParam(params, "minLength")
	maxLen, hasMax := formats.ReadNumberParam(params, "maxLength")
	if !hasLength && !hasMin && !hasMax {
		return pool
	}
	return filterSamples(pool, func(sample string) bool {
		size := codePointLen(sample)
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

// sampleDrawPool returns the VALUE samples the mock generator draws from, in mockStringParams' precedence
// (mocking/mockStringFormat.ts): allowedValues.val wins, else the first present of the top-level mockSamples,
// the pattern's, or disallowedValues'.
// allowedChars / disallowedChars build a value from a character set rather than picking a declared one, so
// absent a top-level mockSamples they contribute no value whose length can be checked.
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

// lengthBoundViolations returns one composed message per violated length bound, naming every sample that trips it.
func lengthBoundViolations(params map[string]any, pool []string) []string {
	var messages []string
	if value, ok := formats.ReadNumberParam(params, "length"); ok {
		want := int(value)
		if offenders := filterSamples(pool, func(sample string) bool { return codePointLen(sample) != want }); len(offenders) > 0 {
			messages = append(messages, "sample(s) "+quoteJoin(offenders)+" are not exactly length "+formats.FormatNumber(value))
		}
	}
	if value, ok := formats.ReadNumberParam(params, "minLength"); ok {
		min := int(value)
		if offenders := filterSamples(pool, func(sample string) bool { return codePointLen(sample) < min }); len(offenders) > 0 {
			messages = append(messages, "sample(s) "+quoteJoin(offenders)+" are shorter than minLength "+formats.FormatNumber(value))
		}
	}
	if value, ok := formats.ReadNumberParam(params, "maxLength"); ok {
		max := int(value)
		if offenders := filterSamples(pool, func(sample string) bool { return codePointLen(sample) > max }); len(offenders) > 0 {
			messages = append(messages, "sample(s) "+quoteJoin(offenders)+" are longer than maxLength "+formats.FormatNumber(value))
		}
	}
	return messages
}

// charValueViolations returns one composed message per violated char/value sibling; FMT002 allows only one
// complex param, so at most one applies. Plain Go string ops, no regex, so no RE2 concern.
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

// codePointLen counts code points, which is what the emitted length check counts (lengthConditions in
// stringformat.go, following JSON Schema, so '💩💩' is 2).
// Neither Go's len() (bytes) nor JS `String.length` (UTF-16 units) matches it, and either would report an
// astral sample as out of bounds while it validates fine at run time.
func codePointLen(s string) int {
	return utf8.RuneCountInString(s)
}

// quoteJoin renders a sample list as double-quoted JS string literals for a diagnostic message.
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

// inValueSet reports whether sample equals any member of vals, honouring the ignoreCase the emitted validator uses.
func inValueSet(sample string, vals []string, ignoreCase bool) bool {
	for _, value := range vals {
		if sample == value || (ignoreCase && strings.EqualFold(sample, value)) {
			return true
		}
	}
	return false
}
