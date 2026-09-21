package schemadoc

// The JSON-Schema-specific keyword helpers: the wire half of a format family, the standard-keyword
// projections and the dialect suffixes, so the document renderer and the convert printer read ONE vocabulary.

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// DefaultedStructuralParams returns the structural params whose value IS the 2020-12 default for their
// keyword. Those cannot ride the standard keyword and come back: `minItems: 0` validates like one that
// omits it, so the door reads the keyword as absent (that IS the standard's meaning) and the brand would
// lose the param. They ride rtFormatParams instead, leaving the standard keywords' semantics untouched.
func DefaultedStructuralParams(params map[string]any) map[string]any {
	out := map[string]any{}
	for key, value := range params {
		switch key {
		case "minItems", "minProperties":
			if number, ok := value.(float64); ok && number == 0 {
				out[key] = value
			}
			if number, ok := value.(int); ok && number == 0 {
				out[key] = value
			}
		case "uniqueItems":
			if flag, ok := value.(bool); ok && !flag {
				out[key] = value
			}
		}
	}
	return out
}

// RTFormatParamsSuffix renders the rtFormatParams keyword for a defaulted param set, "" when empty.
func RTFormatParamsSuffix(params map[string]any) string {
	if len(params) == 0 {
		return ""
	}
	keys := make([]string, 0, len(params))
	for key := range params {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		valueText, ok := ParamValueText(params[key], false)
		if !ok {
			return ""
		}
		parts = append(parts, fmt.Sprintf("%s: %s", key, valueText))
	}
	return ", rtFormatParams: {" + strings.Join(parts, ", ") + "}"
}

// PrintBigintParamsAsDigits spells a bigint family's params for the schema target: each value as bare
// digits, the form `${infer … extends bigint}` matches on the door side. A non-string value reports false.
func PrintBigintParamsAsDigits(params map[string]any) (string, bool) {
	keys := make([]string, 0, len(params))
	for key := range params {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		digits, ok := params[key].(string)
		if !ok {
			return "", false
		}
		parts = append(parts, fmt.Sprintf("%s: %s", key, QuoteSingle(strings.TrimSuffix(digits, "n"))))
	}
	return "{" + strings.Join(parts, ", ") + "}", true
}

// FormatWireParts spells the WIRE half of a format family, the half a plain 2020-12 validator reads:
// base JSON type plus the standard `format` where the family maps onto a registered one. Deliberately
// NO `jsType`, even where the base is not a JSON type: CORE-PRECEDENCE reads jsType BEFORE rtFormat, so
// a node carrying both resolves to the bare JS type and drops its brand (`TF.BigInt<{min: 0n}>` came
// back as plain `bigint`), and the family name is the complete answer on its own.
func FormatWireParts(family FormatFamily, annotation *reflection.FormatAnnotation) string {
	switch family.Base {
	case "number":
		return "type: 'number'"
	case "bigint":
		// A bigint travels as a decimal string, so the wire type is a string.
		return "type: 'string', pattern: '^-?[0-9]+$'"
	}
	if info, isTemporal := reflection.TemporalInfoByFormatName(annotation.Name); isTemporal {
		wire := ""
		if format := info.WireFormat(); format != "" {
			wire = fmt.Sprintf("format: %s, ", QuoteSingle(format))
		} else if pattern := info.WirePattern(); pattern != "" {
			wire = fmt.Sprintf("pattern: %s, ", QuoteSingle(pattern))
		}
		return strings.TrimSuffix(fmt.Sprintf("type: 'string', %s", wire), ", ")
	}
	if annotation.Name == "nativeDate" {
		return "type: 'string', format: 'date-time'"
	}
	if standard := StandardFormatName(annotation.Name); standard != "" {
		return fmt.Sprintf("type: 'string', format: %s", QuoteSingle(standard))
	}
	return "type: 'string'"
}

// StandardParamKeywords projects the params that HAVE an exact standard 2020-12 keyword onto it: a
// keyword whose meaning differs even slightly would make a plain validator enforce something the type
// does not say. Skipped: the bigint family (its bounds are digit strings, and `minimum` on a string
// means nothing) and every non-validating param. `pattern` IS mirrored, under the rule in
// patternWireSource; dropping it broke CORE-INERT, the rewritten schema accepting what the input rejected.
func StandardParamKeywords(params map[string]any, family FormatFamily) string {
	if family.BigintParams {
		return ""
	}
	standard := map[string]string{
		"minLength": "minLength", "maxLength": "maxLength",
		"min": "minimum", "max": "maximum",
		"gt": "exclusiveMinimum", "lt": "exclusiveMaximum",
		"multipleOf": "multipleOf",
	}
	keys := make([]string, 0, len(params))
	for key := range params {
		if _, ok := standard[key]; ok {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		number, isNumber := params[key].(float64)
		if !isNumber {
			continue
		}
		numberText, ok := FormatNumberLiteral(number)
		if !ok {
			continue
		}
		parts = append(parts, fmt.Sprintf("%s: %s", standard[key], numberText))
	}
	if source, ok := patternWireSource(params["pattern"]); ok {
		// Re-sorted so `pattern` lands in the same key order the numeric loop used.
		parts = append(parts, fmt.Sprintf("pattern: %s", QuoteSingle(source)))
		sort.Strings(parts)
	}
	if len(parts) == 0 {
		return ""
	}
	return strings.Join(parts, ", ")
}

// patternWireSource returns the regex source a `pattern` param can safely put on the standard `pattern`
// keyword, false when it cannot. A 2020-12 `pattern` is a bare ECMA-262 source with NO flags, so the
// param's flags decide:
//
//   - "" — the keyword is exactly the param. Mirrored.
//   - "u" — what the DOOR lifts a bare standard `pattern` to, so mirroring reproduces the source
//     document byte for byte. EXCEPT with a unicode property escape: `\p{L}` read without `u` matches
//     a literal `p{L}` and would reject nearly every value the type accepts.
//   - i, m, s, y, g — a standard validator cannot express them (case-insensitivity would silently
//     become case-SENSITIVE), so the pattern stays in rtFormatParams alone.
//
// Saying less is always sound; saying something stricter than the type is not.
func patternWireSource(param any) (string, bool) {
	bag, isBag := param.(map[string]any)
	if !isBag {
		return "", false
	}
	source, hasSource := bag["source"].(string)
	if !hasSource || source == "" {
		return "", false
	}
	flags, _ := bag["flags"].(string)
	switch flags {
	case "":
		return source, true
	case "u":
		if strings.Contains(source, `\p{`) || strings.Contains(source, `\P{`) {
			return "", false
		}
		return source, true
	default:
		return "", false
	}
}

// StandardFormatName maps a format family onto the registered 2020-12 `format` describing the SAME wire
// shape, "" when the registry has no word for it. Only exact matches: claiming a format a validator
// would enforce differently is worse than saying nothing.
func StandardFormatName(name string) string {
	switch name {
	case "email":
		return "email"
	case "uuid":
		return "uuid"
	case "domain":
		return "hostname"
	case "url":
		return "uri"
	case "date":
		return "date"
	case "time":
		return "time"
	case "dateTime":
		return "date-time"
	}
	return ""
}

// WireKeyPattern is the `propertyNames` pattern an index-signature KEY implies: JSON keys are always
// strings, so a numeric key IS a constraint on those strings.
func WireKeyPattern(key *reflection.RunType) string {
	if key == nil {
		return ""
	}
	if key.Kind == reflection.KindNumber {
		// A numeric index accepts the canonical decimal integers `String(n)` produces.
		return `^(?:0|[1-9][0-9]*)$`
	}
	return ""
}

// TemplateWirePattern derives the standard `pattern` for a template literal type: the literal chunks,
// anchored and escaped, with every placeholder a wildcard. The wildcards are ON PURPOSE: a regex
// narrower than the placeholder's type would REJECT strings the type accepts, and the surface is wider
// than it looks (TypeScript takes `v0x10`, `v007`, `v.5` and `v1e3` for `v${number}`). So the pattern
// pins only what is certain, the literal text around the holes, and `tsTemplate` carries the rest.
func TemplateWirePattern(texts []string) string {
	var pattern strings.Builder
	pattern.WriteString("^")
	for i, text := range texts {
		if i > 0 {
			// `[\s\S]` rather than `.`: ECMA-262 `.` skips line terminators, and a placeholder can hold a newline.
			pattern.WriteString(`[\s\S]*`)
		}
		pattern.WriteString(EscapeRegexLiteral(text))
	}
	pattern.WriteString("$")
	return pattern.String()
}

// EscapeRegexLiteral escapes a literal chunk for an ECMA-262 regular expression. regexp.QuoteMeta
// escapes Go's own metacharacter set and the result is read by JavaScript, so the set is spelled out
// here. `/` is deliberately NOT in it: a JSON Schema pattern is a string, never a `/…/` literal.
func EscapeRegexLiteral(text string) string {
	var escaped strings.Builder
	for _, char := range text {
		if strings.ContainsRune(`\.+*?()|[]{}^$`, char) {
			escaped.WriteRune('\\')
		}
		escaped.WriteRune(char)
	}
	return escaped.String()
}

// TemplateParts pulls the (texts, placeholders) pair off a template literal node's payload, checking
// the n+1 / n pairing the spelling depends on.
func TemplateParts(node *reflection.RunType) ([]string, []map[string]any, bool) {
	payload, ok := node.Literal.(map[string]any)
	if !ok {
		return nil, nil, false
	}
	inner, ok := payload["templateLiteral"].(map[string]any)
	if !ok {
		return nil, nil, false
	}
	rawTexts, textsOK := inner["texts"].([]any)
	rawPlaceholders, placeholdersOK := inner["placeholders"].([]any)
	if !textsOK || !placeholdersOK || len(rawTexts) != len(rawPlaceholders)+1 {
		return nil, nil, false
	}
	texts := make([]string, 0, len(rawTexts))
	for _, rawText := range rawTexts {
		text, textOK := rawText.(string)
		if !textOK {
			return nil, nil, false
		}
		texts = append(texts, text)
	}
	placeholders := make([]map[string]any, 0, len(rawPlaceholders))
	for _, rawPlaceholder := range rawPlaceholders {
		placeholder, placeholderOK := rawPlaceholder.(map[string]any)
		if !placeholderOK {
			return nil, nil, false
		}
		placeholders = append(placeholders, placeholder)
	}
	return texts, placeholders, true
}

// TemplateSpanSchemaText renders one placeholder as an ordinary schema. Only the kinds TypeScript can
// interpolate into a template literal type get a spelling; anything else falls to the caller's escape.
func TemplateSpanSchemaText(span map[string]any) (string, bool) {
	kind, ok := SpanKind(span["kind"])
	if !ok {
		return "", false
	}
	switch kind {
	case reflection.KindString:
		return "{type: 'string'}", true
	case reflection.KindNumber:
		return "{type: 'number'}", true
	case reflection.KindBigInt:
		return "{jsType: 'bigint'}", true
	case reflection.KindLiteral:
		switch literal := span["literal"].(type) {
		case string:
			return fmt.Sprintf("{const: %s}", QuoteSingle(literal)), true
		case float64:
			numberText, numberOK := FormatNumberLiteral(literal)
			if !numberOK {
				return "", false
			}
			return fmt.Sprintf("{const: %s}", numberText), true
		case bool:
			return fmt.Sprintf("{const: %s}", strconv.FormatBool(literal)), true
		}
	}
	return "", false
}
