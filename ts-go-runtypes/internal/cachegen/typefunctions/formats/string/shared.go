package string

import (
	"sort"
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsquote"
)

// formatErrWithType is FormatErrCall plus an OPTIONAL `errorType`, "" leaving the field off.
// The composite formats (domain / email) use it to say WHICH PART of the value a sub-constraint error belongs to.
func formatErrWithType(pathExpr, errorsArr, fmtName, paramName, paramValLiteral, errorTypeExpr string) string {
	extra := ""
	if errorTypeExpr != "" {
		extra = formats.FormatErrorTypeProp(errorTypeExpr)
	}
	return formats.FormatErrCallWith(pathExpr, errorsArr, "string", fmtName, paramName, paramValLiteral, extra)
}

// regexpEscape escapes the precise set the char-class / value-set regex sources need, so a literal char matches
// verbatim instead of acting as a metachar.
// NOT regexp.QuoteMeta: it escapes a different set and would diverge from the JS runtime engine.
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

// defaultFormatMessages is the error `val` for a complex (pattern / char-class / value-set) param that carries
// no custom errorMessage.
var defaultFormatMessages = map[string]string{
	"allowedChars":     "Invalid characters",
	"disallowedChars":  "Invalid characters",
	"allowedValues":    "Invalid value",
	"disallowedValues": "Invalid value",
	"pattern":          "Invalid pattern",
}

// messageLiteral resolves the error `val` for a complex param: its custom message when set, else the default.
// Every format param is part of the structural key (typeid/formats.go), so a custom message always yields its
// own cache entry. Most params carry it under `errorMessage`, a FormatPattern under `message`.
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

// jsParamsLiteral renders a params map as a JS object literal, keys sorted so the output is stable.
// The supported value shapes mirror what the typeid scanner extracts: string, bool, float64, map and []any.
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
	written := 0
	for _, key := range keys {
		// A pure validator fn never reads the `transform` block, so shipping it would only add dead bytes.
		if key == formats.TransformParamsKey {
			continue
		}
		if written > 0 {
			builder.WriteByte(',')
		}
		written++
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
