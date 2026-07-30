// Package string holds the Go-side emitters for the string-format
// family (StringFormat base + UUID / Date / Time / IP / Domain /
// Email / URL / DefaultStringFormats). Each format ships in its own
// file and registers via init().
package string

import (
	"strconv"
	"strings"

	"github.com/mionkit/ts-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// stringFormatEmitter implements the format with name "stringFormat" —
// FormatString<P> in `ts-runtypes/formats`. Mirrors the reference
// StringRunTypeFormat (ref: packages/type-formats/src/string/stringFormat.runtype.ts)
// but extracts literal params from the wire-format FormatAnnotation
// instead of the deepkit-decoded `{val, mockSamples, …}` wrapper
// shape.
//
// Surface: maxLength, minLength, length, pattern, allowedChars,
// disallowedChars, allowedValues, disallowedValues — the full
// StringValidators set, emitted in emitIsType order. The
// format-transformer arm (trim / lowercase / uppercase / capitalize)
// is applied by the separate `format` RT-fn, not by validate/validationErrors.
type stringFormatEmitter struct{}

// formatName is the canonical FormatAnnotation.name the JS-side
// StringRunTypeFormat registers under. Kept as a package-level
// constant so the test suite can reference it without hardcoding the
// string.
const formatName = "stringFormat"

func init() {
	formats.Register(stringFormatEmitter{})
}

func (stringFormatEmitter) Name() string {
	return formatName
}

func (stringFormatEmitter) Kind() protocol.ReflectionKind {
	return protocol.KindString
}

// EmitValidateCheck returns the AND of every active format predicate.
// Returns "" when no params constrain the value — the host emitter then
// keeps its base-kind check as the only validator.
func (stringFormatEmitter) EmitValidateCheck(annotation *protocol.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	params := annotation.Params
	if len(params) == 0 {
		return ""
	}
	return strings.Join(stringConditions(ctx, params, vλl), " && ")
}

// stringConditions returns every validate boolean expression for a
// StringFormat param map applied to `vλl`, in emitIsType order:
// maxLength, minLength, length, pattern, allowedChars, disallowedChars,
// allowedValues, disallowedValues (stringFormat.runtype.ts:53-79).
// Shared by the stringFormat emitter and the domain/email decomposition
// sub-checks (each name/tld/localPart part is validated as a sub-format
// over its own variable).
func stringConditions(ctx formats.EmitContext, params map[string]any, vλl string) []string {
	// Build-time mockSample validation against the statically checkable
	// sibling bounds (length + char/value ops); independent of whether a
	// pattern is present.
	validateSampleBounds(ctx, params)
	conditions := lengthConditions(params, vλl)
	// `pattern` adds a regex test (and triggers build-time mockSample
	// validation). Backs FormatAlpha / FormatNumeric and any user
	// FormatString carrying a registerFormatPattern result.
	if source, flags, ok := recoverPattern(params); ok {
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

// lengthConditions returns the JS boolean expressions for whichever of
// maxLength / minLength / length are set. Shared by the stringFormat
// emitter and the named-pattern (domain/email/url) emitters.
func lengthConditions(params map[string]any, vλl string) []string {
	var conditions []string
	if value, ok := formats.ReadNumberParam(params, "maxLength"); ok {
		conditions = append(conditions, vλl+".length <= "+formats.FormatNumber(value))
	}
	if value, ok := formats.ReadNumberParam(params, "minLength"); ok {
		conditions = append(conditions, vλl+".length >= "+formats.FormatNumber(value))
	}
	if value, ok := formats.ReadNumberParam(params, "length"); ok {
		conditions = append(conditions, vλl+".length === "+formats.FormatNumber(value))
	}
	return conditions
}

// readCharParam reads a `{val: string, ignoreCase?}` param object
// (allowedChars / disallowedChars). Returns the char-set string, the
// regex flags ("i" when ignoreCase, else ""), and ok=false when the key
// is absent or malformed.
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

// readValuesParam reads a `{val: string[], ignoreCase?}` param object
// (allowedValues / disallowedValues). The `val` tuple arrives as a
// []any of strings (typeid lowers tuple literals that way). Returns
// ok=false when absent, malformed, or empty.
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

// allowedCharsSource builds the getAllowedCharsRegexp source —
// `^[<escaped chars>]+$` — so the value must consist entirely of the
// allowed characters.
func allowedCharsSource(val string) string {
	return "^[" + regexpEscape(val) + "]+$"
}

// disallowedCharsSource builds the getDisallowedCharsRegexp source —
// an unanchored `[<escaped chars>]` that matches if ANY disallowed char
// is present (the validate condition negates it).
func disallowedCharsSource(val string) string {
	return "[" + regexpEscape(val) + "]"
}

// valuesSource builds the getAllowed/DisallowedValuesRegexp source —
// `^(?:<esc v1>|<esc v2>…)$` — an exact-match alternation over the value
// set. Shared by allowedValues (asserted) and disallowedValues (negated).
func valuesSource(vals []string) string {
	escaped := make([]string, len(vals))
	for i, value := range vals {
		escaped[i] = regexpEscape(value)
	}
	return "^(?:" + strings.Join(escaped, "|") + ")$"
}

// lengthErrorStatements returns the `if (fail) pf_formatErr(...)`
// statements for whichever length bounds are set. fmtName tags the
// emitted format error (stringFormat / domain / email / url …).
func lengthErrorStatements(ctx formats.EmitContext, params map[string]any, vλl, pathExpr, errorsArr, fmtName string) []string {
	var statements []string
	if value, ok := formats.ReadNumberParam(params, "maxLength"); ok {
		statements = append(statements,
			"if ("+vλl+".length > "+formats.FormatNumber(value)+") "+formats.FormatErrCall(pathExpr, errorsArr, "string", fmtName, "maxLength", formats.FormatNumber(value)))
	}
	if value, ok := formats.ReadNumberParam(params, "minLength"); ok {
		statements = append(statements,
			"if ("+vλl+".length < "+formats.FormatNumber(value)+") "+formats.FormatErrCall(pathExpr, errorsArr, "string", fmtName, "minLength", formats.FormatNumber(value)))
	}
	if value, ok := formats.ReadNumberParam(params, "length"); ok {
		statements = append(statements,
			"if ("+vλl+".length !== "+formats.FormatNumber(value)+") "+formats.FormatErrCall(pathExpr, errorsArr, "string", fmtName, "length", formats.FormatNumber(value)))
	}
	return statements
}

// EmitValidationErrorsCheck emits one `if (failed) er.push(…)` statement
// per active length predicate. Each pushes a TypeFormatError with
// the canonical shape:
//
//	{name: 'stringFormat', formatPath: [...pth, '<param>'], val: <bound>}
//
// Matches the emitIsTypeErrors output (modulo the wrapper-shape
// param unwrap) so the JS-side runtime sees the same diagnostics
// regardless of which compiler produced the validator.
func (stringFormatEmitter) EmitValidationErrorsCheck(annotation *protocol.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	params := annotation.Params
	if len(params) == 0 {
		return ""
	}
	return strings.Join(stringErrorStatements(ctx, params, vλl, pathExpr, errorsArr, formatName), ";")
}

// stringErrorStatements returns the `if (fail) <push error>` statements
// for every active StringFormat param, in emitIsTypeErrors order
// (stringFormat.runtype.ts:80-127). Length params tag the error `val`
// with the bound; pattern + the four char/value params tag it with the
// resolved message (custom errorMessage or the default). fmtName tags
// the emitted format error so domain/email decomposition can reuse this
// over their own variable + sub-params.
func stringErrorStatements(ctx formats.EmitContext, params map[string]any, vλl, pathExpr, errorsArr, fmtName string) []string {
	statements := lengthErrorStatements(ctx, params, vλl, pathExpr, errorsArr, fmtName)
	if source, flags, ok := recoverPattern(params); ok {
		test := emitPatternTest(ctx, source, flags, vλl)
		statements = append(statements,
			"if (!("+test+")) "+formats.FormatErrCall(pathExpr, errorsArr, "string", fmtName, "pattern", messageLiteral(params, "pattern")))
	}
	if val, flags, ok := readCharParam(params, "allowedChars"); ok {
		test := emitPatternTest(ctx, allowedCharsSource(val), flags, vλl)
		statements = append(statements,
			"if (!("+test+")) "+formats.FormatErrCall(pathExpr, errorsArr, "string", fmtName, "allowedChars", messageLiteral(params, "allowedChars")))
	}
	if val, flags, ok := readCharParam(params, "disallowedChars"); ok {
		test := emitPatternTest(ctx, disallowedCharsSource(val), flags, vλl)
		statements = append(statements,
			"if ("+test+") "+formats.FormatErrCall(pathExpr, errorsArr, "string", fmtName, "disallowedChars", messageLiteral(params, "disallowedChars")))
	}
	if vals, flags, ok := readValuesParam(params, "allowedValues"); ok {
		test := emitPatternTest(ctx, valuesSource(vals), flags, vλl)
		statements = append(statements,
			"if (!("+test+")) "+formats.FormatErrCall(pathExpr, errorsArr, "string", fmtName, "allowedValues", messageLiteral(params, "allowedValues")))
	}
	if vals, flags, ok := readValuesParam(params, "disallowedValues"); ok {
		test := emitPatternTest(ctx, valuesSource(vals), flags, vλl)
		statements = append(statements,
			"if ("+test+") "+formats.FormatErrCall(pathExpr, errorsArr, "string", fmtName, "disallowedValues", messageLiteral(params, "disallowedValues")))
	}
	return statements
}

// EmitFormatTransform implements formats.FormatTransformer — the value
// mutation applied by the `format` RT-fn. Chains the active transformer
// operations in order (stringFormat.runtype.ts:44-51): trim,
// replace, replaceAll, lowercase, uppercase, capitalize. Returns "" when
// none are set (identity).
func (stringFormatEmitter) EmitFormatTransform(annotation *protocol.FormatAnnotation, vλl string, _ formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	params := annotation.Params
	expr := vλl
	if boolParam(params, "trim") {
		expr += ".trim()"
	}
	if search, replace, ok := readReplaceParam(params, "replace"); ok {
		expr += ".replace(" + search + ", " + replace + ")"
	}
	if search, replace, ok := readReplaceParam(params, "replaceAll"); ok {
		expr += ".replaceAll(" + search + ", " + replace + ")"
	}
	if boolParam(params, "lowercase") {
		expr += ".toLowerCase()"
	}
	if boolParam(params, "uppercase") {
		expr += ".toUpperCase()"
	}
	if boolParam(params, "capitalize") {
		expr = "(" + expr + ".charAt(0).toUpperCase() + " + expr + ".slice(1))"
	}
	if expr == vλl {
		return ""
	}
	return expr
}

// readReplaceParam reads a replace / replaceAll param ({searchValue,
// replaceValue}) and returns both as quoted JS string literals. Returns
// ok=false when the key is absent or malformed (so the transform skips
// it). String literals match the reference intent — its emitFormat interpolates
// the raw values, which only works for already-quoted literals.
func readReplaceParam(params map[string]any, key string) (search, replace string, ok bool) {
	obj, isObj := params[key].(map[string]any)
	if !isObj {
		return "", "", false
	}
	searchValue, hasSearch := obj["searchValue"].(string)
	replaceValue, hasReplace := obj["replaceValue"].(string)
	if !hasSearch || !hasReplace {
		return "", "", false
	}
	return strconv.Quote(searchValue), strconv.Quote(replaceValue), true
}

// boolParam reads a boolean transformer flag (trim / lowercase / …),
// defaulting to false when absent or non-bool.
func boolParam(params map[string]any, key string) bool {
	value, _ := formats.ReadBoolParam(params, key)
	return value
}

// ValidateParams ports the StringRunTypeFormat.validateParams
// (stringFormat.runtype.ts:167-237) to the build-time AOT path: length
// mutual-exclusivity, bound ordering, value-set caps, single-complex-param,
// and the disallowed* mockSamples requirement. Returns one message per
// violation (surfaced as CodeFMTInvalidParams).
func (stringFormatEmitter) ValidateParams(annotation *protocol.FormatAnnotation) []string {
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
	return errs
}

// paramHasMockSamples reports whether a complex param object carries a
// non-empty `mockSamples` (a char-set string or an array of samples).
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
