// Package string holds the emitters for the string-format family: the StringFormat base plus UUID / IP / Domain
// / Email / URL / creditCard, each in its own file, each registering via init().
package string

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// stringFormatEmitter implements the format named "stringFormat", FormatString<P> in `@mionjs/run-types/formats`.
// Surface: maxLength, minLength, length, pattern, allowedChars, disallowedChars, allowedValues, disallowedValues.
// The value rewrite under the `transform` key is applied by the formatTransform RT-fn alone, never by
// validate / validationErrors.
type stringFormatEmitter struct{}

// formatName is the canonical FormatAnnotation.name the JS side registers under.
const formatName = "stringFormat"

func init() {
	formats.Register(stringFormatEmitter{})
}

func (stringFormatEmitter) Name() string {
	return formatName
}

func (stringFormatEmitter) Kind() reflection.ReflectionKind {
	return reflection.KindString
}

// EmitValidateCheck returns the AND of every active format predicate, "" leaving the host its base-kind check.
func (stringFormatEmitter) EmitValidateCheck(annotation *reflection.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	params := annotation.Params
	if len(params) == 0 {
		return ""
	}
	return strings.Join(stringConditions(ctx, params, vλl), " && ")
}

// contentMediaTypeJSON is the one media type the parse check understands.
// JSON Schema's `contentMediaType` is open-ended; anything else is accepted and ignored, since it describes the
// payload rather than constraining the string.
const contentMediaTypeJSON = "application/json"

// jsonParseCheck builds the content predicate: JSON.parse on the raw string, or on the base64-decoded bytes when
// `contentEncoding` says so, since per 2020-12 contentMediaType describes the DECODED content.
// `atob` throws on malformed base64 and the try/catch turns that into `false`, so the decode doubles as the
// encoding check.
func jsonParseCheck(params map[string]any, vλl string) string {
	decoded := vλl
	if encoding, _ := params["contentEncoding"].(string); encoding == "base64" {
		decoded = "atob(" + vλl + ")"
	}
	return "((s) => {try {JSON.parse(" + strings.Replace(decoded, vλl, "s", 1) + ");return true;} catch {return false;}})(" + vλl + ")"
}

// wantsJSONContent reports whether the params ask for the JSON parse check.
func wantsJSONContent(params map[string]any) bool {
	mediaType, _ := params["contentMediaType"].(string)
	return mediaType == contentMediaTypeJSON
}

// stringConditions returns every validate boolean expression for a StringFormat param map applied to `vλl`.
// Shared by the stringFormat emitter and the domain/email decomposition sub-checks, each part being validated as
// a sub-format over its own variable.
func stringConditions(ctx formats.EmitContext, params map[string]any, vλl string) []string {
	// Checked against the statically knowable sibling bounds, whether or not a pattern is present.
	validateSampleBounds(ctx, params)
	var conditions []string
	// The content check leads: parse first, then the sibling string keywords.
	if wantsJSONContent(params) {
		conditions = append(conditions, jsonParseCheck(params, vλl))
	}
	conditions = append(conditions, lengthConditions(params, vλl, ctx)...)
	// `isRegex` routes to the pure-fn engine: whether a string COMPILES as a regex is not something a pattern can ask.
	if isRegex, _ := params["isRegex"].(bool); isRegex {
		conditions = append(conditions, formats.PureFnAlias(ctx, purefnids.IsEcmaRegex)+"("+vλl+")")
	}
	// `pattern` backs FormatAlpha / FormatNumeric and any FormatString carrying a registerFormatPattern result.
	if source, flags, ok := recoverPattern(params); ok {
		validatePatternSafety(ctx, params, source, flags)
		validateSamples(ctx, source, flags, recoverSamples(params))
		conditions = append(conditions, emitPatternTest(ctx, source, flags, vλl))
	}
	if val, flags, ok := readCharParam(params, "allowedChars"); ok {
		conditions = append(conditions, emitPatternTest(ctx, allowedCharsSource(val), flags, vλl))
	}
	if val, flags, ok := readCharParam(params, "disallowedChars"); ok {
		conditions = append(conditions, "!"+emitPatternTest(ctx, disallowedCharsSource(val), flags, vλl))
	}
	if vals, flags, ok := readValuesParam(params, "allowedValues"); ok {
		conditions = append(conditions, emitPatternTest(ctx, valuesSource(vals), flags, vλl))
	}
	if vals, flags, ok := readValuesParam(params, "disallowedValues"); ok {
		conditions = append(conditions, "!"+emitPatternTest(ctx, valuesSource(vals), flags, vλl))
	}
	return conditions
}

// lengthConditions returns the JS boolean expressions for whichever of maxLength / minLength / length are set.
// The bounds count CODE POINTS, which is JSON Schema's rule: '💩💩' is two code points with a `.length` of 4.
// The count is bracketed by `.length` on both sides, never greater and never less than half, so a plain `.length`
// decides everything outside the band [N, 2N] and only a value inside it pays for the exact count:
//
//	maxLength → `.length <= N` proves it fits, `.length > 2N` proves it doesn't
//	minLength → `.length < N` proves it misses, `.length >= 2N` proves it doesn't
//	length    → `.length` outside [N, 2N] can't count to exactly N
func lengthConditions(params map[string]any, vλl string, ctx formats.EmitContext) []string {
	var conditions []string
	codePointLength := func() string { return formats.PureFnAlias(ctx, purefnids.CodePointLength) + "(" + vλl + ")" }
	if value, ok := formats.ReadNumberParam(params, "maxLength"); ok {
		bound := formats.FormatNumber(value)
		doubled := formats.FormatNumber(2 * value)
		conditions = append(conditions, "("+vλl+".length <= "+bound+" || ("+vλl+".length <= "+doubled+" && "+codePointLength()+" <= "+bound+"))")
	}
	if value, ok := formats.ReadNumberParam(params, "minLength"); ok {
		bound := formats.FormatNumber(value)
		doubled := formats.FormatNumber(2 * value)
		conditions = append(conditions, "("+vλl+".length >= "+bound+" && ("+vλl+".length >= "+doubled+" || "+codePointLength()+" >= "+bound+"))")
	}
	if value, ok := formats.ReadNumberParam(params, "length"); ok {
		bound := formats.FormatNumber(value)
		doubled := formats.FormatNumber(2 * value)
		conditions = append(conditions, "("+vλl+".length >= "+bound+" && "+vλl+".length <= "+doubled+" && "+codePointLength()+" === "+bound+")")
	}
	return conditions
}

// readCharParam reads a `{val: string, ignoreCase?}` param object, returning the char set and the regex flags.
func readCharParam(params map[string]any, key string) (val, flags string, ok bool) {
	obj, isMap := params[key].(map[string]any)
	if !isMap {
		return "", "", false
	}
	val, isString := obj["val"].(string)
	if !isString || val == "" {
		return "", "", false
	}
	if ignore, _ := obj["ignoreCase"].(bool); ignore {
		flags = "i"
	}
	return val, flags, true
}

// readValuesParam reads a `{val: string[], ignoreCase?}` param object; typeid lowers the tuple to a []any of
// strings. An empty list answers ok=false.
func readValuesParam(params map[string]any, key string) (vals []string, flags string, ok bool) {
	obj, isMap := params[key].(map[string]any)
	if !isMap {
		return nil, "", false
	}
	rawVals, isArray := obj["val"].([]any)
	if !isArray {
		return nil, "", false
	}
	vals = make([]string, 0, len(rawVals))
	for _, item := range rawVals {
		if str, isString := item.(string); isString {
			vals = append(vals, str)
		}
	}
	if len(vals) == 0 {
		return nil, "", false
	}
	if ignore, _ := obj["ignoreCase"].(bool); ignore {
		flags = "i"
	}
	return vals, flags, true
}

// allowedCharsSource builds `^[<escaped chars>]+$`, so the value must consist entirely of the allowed characters.
func allowedCharsSource(val string) string {
	return "^[" + regexpEscape(val) + "]+$"
}

// disallowedCharsSource builds an unanchored `[<escaped chars>]`, matching if ANY disallowed char is present,
// which is why the validate condition negates it.
func disallowedCharsSource(val string) string {
	return "[" + regexpEscape(val) + "]"
}

// valuesSource builds `^(?:<esc v1>|<esc v2>…)$`, shared by allowedValues (asserted) and disallowedValues (negated).
func valuesSource(vals []string) string {
	escaped := make([]string, len(vals))
	for i, value := range vals {
		escaped[i] = regexpEscape(value)
	}
	return "^(?:" + strings.Join(escaped, "|") + ")$"
}

// lengthErrorStatements returns the error statements for `isRegex` and whichever length bounds are set;
// fmtName tags the emitted format error (stringFormat / domain / email / url …).
// The failure conditions are the negation of lengthConditions and keep the same `.length` short-circuit, so the
// exact code-point count is asked for only to confirm a failure.
func lengthErrorStatements(ctx formats.EmitContext, params map[string]any, vλl, pathExpr, errorsArr, fmtName, errorTypeExpr string) []string {
	var statements []string
	if isRegex, _ := params["isRegex"].(bool); isRegex {
		statements = append(statements,
			"if (!"+formats.PureFnAlias(ctx, purefnids.IsEcmaRegex)+"("+vλl+")) "+
				formatErrWithType(pathExpr, errorsArr, fmtName, "isRegex", "true", errorTypeExpr))
	}
	codePointLength := formats.PureFnAlias(ctx, purefnids.CodePointLength) + "(" + vλl + ")"
	if value, ok := formats.ReadNumberParam(params, "maxLength"); ok {
		bound := formats.FormatNumber(value)
		doubled := formats.FormatNumber(2 * value)
		statements = append(statements,
			"if ("+vλl+".length > "+bound+" && ("+vλl+".length > "+doubled+" || "+codePointLength+" > "+bound+")) "+formatErrWithType(pathExpr, errorsArr, fmtName, "maxLength", bound, errorTypeExpr))
	}
	if value, ok := formats.ReadNumberParam(params, "minLength"); ok {
		bound := formats.FormatNumber(value)
		doubled := formats.FormatNumber(2 * value)
		statements = append(statements,
			"if ("+vλl+".length < "+bound+" || ("+vλl+".length < "+doubled+" && "+codePointLength+" < "+bound+")) "+formatErrWithType(pathExpr, errorsArr, fmtName, "minLength", bound, errorTypeExpr))
	}
	if value, ok := formats.ReadNumberParam(params, "length"); ok {
		bound := formats.FormatNumber(value)
		doubled := formats.FormatNumber(2 * value)
		statements = append(statements,
			"if ("+vλl+".length < "+bound+" || "+vλl+".length > "+doubled+" || "+codePointLength+" !== "+bound+") "+formatErrWithType(pathExpr, errorsArr, fmtName, "length", bound, errorTypeExpr))
	}
	return statements
}

// EmitValidationErrorsCheck emits one `if (failed) er.push(…)` per active predicate, each pushing a
// TypeFormatError shaped `{name: 'stringFormat', formatPath: [...pth, '<param>'], val: <bound>}`.
func (stringFormatEmitter) EmitValidationErrorsCheck(annotation *reflection.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	params := annotation.Params
	if len(params) == 0 {
		return ""
	}
	return strings.Join(stringErrorStatements(ctx, params, vλl, pathExpr, errorsArr, formatName, ""), ";")
}

// stringErrorStatements returns the `if (fail) <push error>` statements for every active StringFormat param.
// A length param tags the error `val` with the bound; pattern and the four char/value params tag it with the
// resolved message.
// fmtName lets the domain/email decomposition reuse this over its own variable and sub-params, and errorTypeExpr
// (a JS expression, or "") lets it say WHICH PART of the value each error belongs to.
func stringErrorStatements(ctx formats.EmitContext, params map[string]any, vλl, pathExpr, errorsArr, fmtName, errorTypeExpr string) []string {
	var statements []string
	if wantsJSONContent(params) {
		statements = append(statements,
			"if (!("+jsonParseCheck(params, vλl)+")) "+
				formatErrWithType(pathExpr, errorsArr, fmtName, "contentMediaType", strconv.Quote(contentMediaTypeJSON), errorTypeExpr))
	}
	statements = append(statements, lengthErrorStatements(ctx, params, vλl, pathExpr, errorsArr, fmtName, errorTypeExpr)...)
	if source, flags, ok := recoverPattern(params); ok {
		test := emitPatternTest(ctx, source, flags, vλl)
		statements = append(statements,
			"if (!("+test+")) "+formatErrWithType(pathExpr, errorsArr, fmtName, "pattern", messageLiteral(params, "pattern"), errorTypeExpr))
	}
	if val, flags, ok := readCharParam(params, "allowedChars"); ok {
		test := emitPatternTest(ctx, allowedCharsSource(val), flags, vλl)
		statements = append(statements,
			"if (!("+test+")) "+formatErrWithType(pathExpr, errorsArr, fmtName, "allowedChars", messageLiteral(params, "allowedChars"), errorTypeExpr))
	}
	if val, flags, ok := readCharParam(params, "disallowedChars"); ok {
		test := emitPatternTest(ctx, disallowedCharsSource(val), flags, vλl)
		statements = append(statements,
			"if ("+test+") "+formatErrWithType(pathExpr, errorsArr, fmtName, "disallowedChars", messageLiteral(params, "disallowedChars"), errorTypeExpr))
	}
	if vals, flags, ok := readValuesParam(params, "allowedValues"); ok {
		test := emitPatternTest(ctx, valuesSource(vals), flags, vλl)
		statements = append(statements,
			"if (!("+test+")) "+formatErrWithType(pathExpr, errorsArr, fmtName, "allowedValues", messageLiteral(params, "allowedValues"), errorTypeExpr))
	}
	if vals, flags, ok := readValuesParam(params, "disallowedValues"); ok {
		test := emitPatternTest(ctx, valuesSource(vals), flags, vλl)
		statements = append(statements,
			"if ("+test+") "+formatErrWithType(pathExpr, errorsArr, fmtName, "disallowedValues", messageLiteral(params, "disallowedValues"), errorTypeExpr))
	}
	return statements
}

// EmitFormatTransform implements formats.FormatTransformer over the `transform` key; the shared chain lives in
// formats.EmitStringTransform and "" is identity.
func (stringFormatEmitter) EmitFormatTransform(annotation *reflection.FormatAnnotation, vλl string, _ formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	return formats.EmitStringTransform(annotation.Params, vλl)
}

// ValidateParams checks length mutual-exclusivity, bound ordering, the value-set caps, the single-complex-param
// rule and the disallowed* mockSamples requirement, one message per violation (CodeFMTInvalidParams).
func (stringFormatEmitter) ValidateParams(annotation *reflection.FormatAnnotation) []string {
	if annotation == nil {
		return nil
	}
	params := annotation.Params
	var errs []string
	_, hasLength := formats.ReadNumberParam(params, "length")
	maxLen, hasMax := formats.ReadNumberParam(params, "maxLength")
	minLen, hasMin := formats.ReadNumberParam(params, "minLength")
	if hasLength && (hasMax || hasMin) {
		errs = append(errs, "StringFormat: `length` cannot be combined with `maxLength` or `minLength`")
	}
	if hasMax && hasMin && maxLen < minLen {
		errs = append(errs, "StringFormat: `maxLength` cannot be less than `minLength`")
	}
	if vals, _, ok := readValuesParam(params, "allowedValues"); ok && len(vals) > 100 {
		errs = append(errs, "StringFormat: `allowedValues` cannot have more than 100 values")
	}
	if vals, _, ok := readValuesParam(params, "disallowedValues"); ok && len(vals) > 100 {
		errs = append(errs, "StringFormat: `disallowedValues` cannot have more than 100 values")
	}
	complexCount := 0
	for _, key := range []string{"pattern", "allowedChars", "disallowedChars", "allowedValues", "disallowedValues"} {
		if _, present := params[key]; present {
			complexCount++
		}
	}
	if complexCount > 1 {
		errs = append(errs, "StringFormat: only one of [pattern, allowedChars, disallowedChars, allowedValues, disallowedValues] can be used at once")
	}
	if _, present := params["disallowedChars"]; present && !paramHasMockSamples(params, "disallowedChars") {
		errs = append(errs, "StringFormat: `disallowedChars` requires `mockSamples`")
	}
	if _, present := params["disallowedValues"]; present && !paramHasMockSamples(params, "disallowedValues") {
		errs = append(errs, "StringFormat: `disallowedValues` requires `mockSamples`")
	}
	errs = append(errs, formats.ValidateTransformParams(params, "StringFormat")...)
	return errs
}

// paramHasMockSamples reports a non-empty `mockSamples`, either a char-set string or an array of samples.
func paramHasMockSamples(params map[string]any, key string) bool {
	obj, ok := params[key].(map[string]any)
	if !ok {
		return false
	}
	switch samples := obj["mockSamples"].(type) {
	case string:
		return samples != ""
	case []any:
		return len(samples) > 0
	}
	return false
}
