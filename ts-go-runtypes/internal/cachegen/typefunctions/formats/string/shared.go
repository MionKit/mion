package string

import (
	"sort"
	"strconv"
	"strings"

	"github.com/mionkit/ts-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/ts-runtypes/internal/jsquote"
)

// pureFnAlias binds this package's pure-fn source path into the shared
// formats.PureFnAlias helper — used by every string-format emitter that
// dispatches to a pure fn (uuid / date / time / ip / domain / email / url).
func pureFnAlias(ctx formats.EmitContext, fnName string) string {
	return formats.PureFnAlias(ctx, fnName, typeFormatsPureFnFilePath)
}

// regexpEscape mirrors the utils.ts regexpEscape exactly —
// `val.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&')` — escaping the precise
// set the char-class / value-set regex sources need so a literal char
// (`.`, `-`, `|`, …) matches verbatim instead of acting as a metachar.
// NOT regexp.QuoteMeta: that escapes a different set and would diverge
// from both the reference emitted regex and the JS runtime engine.
func regexpEscape(val string) string {
	var builder strings.Builder
	builder.Grow(len(val))
	for _, r := range val {
		switch r {
		case '/', '-', '\\', '^', '$', '*', '+', '?', '.', '(', ')', '|', '[', ']', '{', '}':
			builder.WriteByte('\\')
		}
		builder.WriteRune(r)
	}
	return builder.String()
}

// defaultFormatMessages is the getDefaultMessage table
// (ref: stringFormat.runtype.ts:15-21): the error `val` used for a complex
// (pattern / char-class / value-set) param when it carries no custom
// errorMessage.
var defaultFormatMessages = map[string]string{
	"allowedChars":     "Invalid characters",
	"disallowedChars":  "Invalid characters",
	"allowedValues":    "Invalid value",
	"disallowedValues": "Invalid value",
	"pattern":          "Invalid pattern",
}

// messageLiteral resolves the error `val` for a complex param as a
// quoted JS string literal: the param's custom message when set, else the
// per-param default. Every format param is part of the structural key now
// (mockSamples/message included — see typeid/formats.go), so a custom
// message always yields a distinct cache entry — never a collision. Most
// params carry it under `errorMessage`; a FormatPattern carries it under
// `message` (registerFormatPattern's documented "surfaced in errors" field,
// previously unreachable because it was key-excluded).
func messageLiteral(params map[string]any, name string) string {
	messageKey := "errorMessage"
	if name == "pattern" {
		messageKey = "message"
	}
	if obj, ok := params[name].(map[string]any); ok {
		if msg, ok := obj[messageKey].(string); ok && msg != "" {
			return jsquote.Double(msg)
		}
	}
	return jsquote.Double(defaultFormatMessages[name])
}

// jsParamsLiteral renders a params map as a deterministic JS object
// literal (keys sorted for stable output). Used by emitters that pass
// the whole params object to a pure fn at the call site (ip, …).
// Supported value shapes mirror what the typeid scanner extracts:
// string, bool, float64 (numbers), nested maps, and []any arrays.
func jsParamsLiteral(params map[string]any) string {
	if len(params) == 0 {
		return "{}"
	}
	keys := make([]string, 0, len(params))
	for key := range params {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	var builder strings.Builder
	builder.WriteByte('{')
	for i, key := range keys {
		if i > 0 {
			builder.WriteByte(',')
		}
		builder.WriteString(strconv.Quote(key))
		builder.WriteByte(':')
		builder.WriteString(jsValueLiteral(params[key]))
	}
	builder.WriteByte('}')
	return builder.String()
}

func jsValueLiteral(value any) string {
	switch typed := value.(type) {
	case nil:
		return "null"
	case string:
		return strconv.Quote(typed)
	case bool:
		if typed {
			return "true"
		}
		return "false"
	case float64:
		if typed == float64(int64(typed)) {
			return strconv.FormatInt(int64(typed), 10)
		}
		return strconv.FormatFloat(typed, 'g', -1, 64)
	case int:
		return strconv.Itoa(typed)
	case map[string]any:
		return jsParamsLiteral(typed)
	case []any:
		var builder strings.Builder
		builder.WriteByte('[')
		for i, item := range typed {
			if i > 0 {
				builder.WriteByte(',')
			}
			builder.WriteString(jsValueLiteral(item))
		}
		builder.WriteByte(']')
		return builder.String()
	default:
		return strconv.Quote("")
	}
}
