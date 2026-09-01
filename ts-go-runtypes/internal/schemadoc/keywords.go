// The JSON-Schema-specific keyword helpers: the wire half of a format family,
// the standard-keyword projections, and the dialect suffixes. Moved verbatim
// from internal/convert's schema printer so the runtime document renderer and
// the convert printer read ONE vocabulary.
package schemadoc

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// DefaultedStructuralParams returns the structural params whose value IS the
// 2020-12 default for their keyword. Those cannot ride the standard keyword and
// come back: a schema saying `minItems: 0` validates exactly like one that
// omits it, so the door reads the keyword as absent (deliberately — that IS the
// standard's meaning) and the brand would lose the param. They ride rtFormatParams
// instead, which leaves the standard keywords' semantics untouched.
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

// RTFormatParamsSuffix renders the rtFormatParams keyword for a defaulted
// param set, or "" when there is nothing to carry.
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

// PrintBigintParamsAsDigits spells a bigint family's params for the schema
// target: the same keys, each value as bare digits with the `n` suffix
// stripped, which is the form `${infer … extends bigint}` matches on the door
// side. A non-string param value has no digits to carry, so it reports false.
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

// FormatWireParts spells the WIRE half of a format family: the base JSON type
// plus the standard `format` where the family maps onto a registered one. This
// is the half a plain 2020-12 validator reads.
//
// Deliberately NO `jsType`, even for the families whose base is not a JSON type
// (bigint, the native Date, Temporal). CORE-PRECEDENCE reads jsType BEFORE
// rtFormat, so a node carrying both would resolve to the bare JS type and drop
// its format brand — `TF.BigInt<{min: 0n}>` came back as plain `bigint`. The
// family name is the complete answer on its own, and RunTypes knows each
// family's base, so the annotation would be redundant even if it were safe.
func FormatWireParts(family FormatFamily, annotation *reflection.FormatAnnotation) string {
	switch family.Base {
	case "number":
		return "type: 'number'"
	case "bigint":
		// A bigint travels as a decimal string, so the wire is a string and the
		// jsType is what says it decodes back to a bigint.
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

// StandardParamKeywords projects the params that HAVE a standard 2020-12
// keyword onto it. Only the exact correspondences appear: a keyword whose
// meaning differs even slightly would make a plain validator enforce something
// the type does not say, which is worse than saying nothing.
//
// Deliberately skipped: the bigint family (its bounds are digit strings here,
// and `minimum` on a string means nothing) and every non-validating param
// (mockSamples, trim, …).
//
// `pattern` is mirrored, under the rule in patternWireSource. It used to be
// skipped on the grounds that the param is a {source, flags} bag rather than
// the plain string the keyword wants — but `source` IS that string, and
// dropping it broke CORE-INERT outright: reading `{type: 'string', pattern: …,
// minLength: 3}` and writing it back kept the length and lost the regex, so
// deleting the extension keywords from the result accepted values the input
// rejected.
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
		// Sorted position: `pattern` sits between `multipleOf` and the rest by
		// the same key order the numeric loop uses.
		parts = append(parts, fmt.Sprintf("pattern: %s", QuoteSingle(source)))
		sort.Strings(parts)
	}
	if len(parts) == 0 {
		return ""
	}
	return strings.Join(parts, ", ")
}

// patternWireSource returns the regex source a `pattern` param can safely put on
// the standard `pattern` keyword, and false when it cannot.
//
// A 2020-12 `pattern` is a bare ECMA-262 source with NO flags, so the flags a
// RunTypes pattern carries decide whether the keyword can say the same thing:
//
//   - "" — the keyword is exactly the param. Mirrored.
//   - "u" — what the DOOR itself lifts a bare standard `pattern` to (see
//     the historical door lowering: unicode mode is the default other
//     2020-12 validators compile under). Mirroring reproduces the source
//     document byte for byte, so this is the round-trip case and it is mirrored
//     — EXCEPT when the source uses a unicode property escape. `\p{L}` read
//     without `u` degrades to a literal `p{L}` match, which would reject nearly
//     every value the type accepts, and over-rejecting is the one failure this
//     mirroring must never introduce.
//   - anything else (i, m, s, y, g) — a standard validator cannot express it.
//     Case-insensitivity in particular would silently become case-SENSITIVE and
//     reject values the type accepts, so the pattern stays in rtFormatParams
//     alone and the standard reading simply says less.
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

// StandardFormatName maps a RunTypes format family onto the registered 2020-12
// `format` value describing the SAME wire shape, or "" when the registry has no
// honest word for it. Only exact matches appear: claiming a format that a
// validator would then enforce differently is worse than saying nothing.
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

// WireKeyPattern is the standard `propertyNames` pattern an index-signature
// KEY implies about the JSON: object keys are always strings, so a numeric
// key IS a constraint on those strings.
func WireKeyPattern(key *reflection.RunType) string {
	if key == nil {
		return ""
	}
	if key.Kind == reflection.KindNumber {
		// A numeric index accepts the JSON keys that are canonical decimal
		// integers, which is what `String(n)` produces for one.
		return `^(?:0|[1-9][0-9]*)$`
	}
	return ""
}

// TemplateWirePattern derives the standard `pattern` for a template literal
// type: the literal chunks, anchored and escaped, with every placeholder a
// wildcard.
//
// The placeholders stay wildcards ON PURPOSE. A regex narrower than the
// placeholder's own type would REJECT strings the type accepts, and the surface
// is wider than it looks — TypeScript takes `v0x10`, `v007`, `v.5` and `v1e3`
// for “ `v${number}` “ (only `NaN`, `Infinity` and numeric separators are
// out). Over-rejecting would make the schema disagree with the type it decodes
// to, which is worse than under-constraining, so the pattern pins what is
// certain (the literal text around the holes) and `tsTemplate` carries the rest.
func TemplateWirePattern(texts []string) string {
	var pattern strings.Builder
	pattern.WriteString("^")
	for i, text := range texts {
		if i > 0 {
			// `[\s\S]` rather than `.` — ECMA-262 `.` skips line terminators,
			// and a placeholder can hold a newline.
			pattern.WriteString(`[\s\S]*`)
		}
		pattern.WriteString(EscapeRegexLiteral(text))
	}
	pattern.WriteString("$")
	return pattern.String()
}

// EscapeRegexLiteral escapes a literal chunk for use inside an ECMA-262 regular
// expression. Go's regexp.QuoteMeta is close but not usable here: it escapes
// with Go's own metacharacter set and the result is read by JavaScript, so the
// set is spelled out. `/` is deliberately NOT in it — a JSON Schema pattern is a
// string, never a `/…/` literal, so escaping it would only add noise.
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

// TemplateParts pulls the (texts, placeholders) pair off a template literal
// node's payload, checking the n+1 / n pairing the spelling depends on.
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

// TemplateSpanSchemaText renders one placeholder as an ordinary schema. Only
// the kinds TypeScript can interpolate into a template literal type get a
// spelling — `unknown` and anything else hands the whole node to the caller's
// escape.
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
