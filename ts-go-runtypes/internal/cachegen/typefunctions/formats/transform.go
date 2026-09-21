package formats

import (
	"sort"
	"strconv"
	"strings"
)

// TransformParamsKey is the ONE params key every string-family format reads its value rewrite from.
// Only the formatTransform family (createFormatTransformFn / mion's sanitizeParams) applies it, never validate / parse / encode / decode.
const TransformParamsKey = "transform"

// stringTransformKeys lists the shared rewrites in APPLICATION order; every string-family format accepts these, creditCard adds `stripSeparators`.
// The replacements run BEFORE trim so a second pass changes nothing: a rewrite runs on the client and again on the server.
// Trimming first is not stable: removing a leading `-` can expose a tab the NEXT pass would trim (found by the transformIdempotence fuzz).
var stringTransformKeys = []string{"replace", "replaceAll", "trim", "lowercase", "uppercase", "capitalize"}

// ReadTransformParams returns params["transform"] as an object, or nil when
// absent or not an object.
func ReadTransformParams(params map[string]any) map[string]any {
	transform, _ := params[TransformParamsKey].(map[string]any)
	return transform
}

// EmitStringTransform chains the params["transform"] rewrites onto vλl, "" when none is set (see stringTransformKeys for the order).
// Every string-family FormatTransformer goes through here; creditcard.go prepends its separator strip.
func EmitStringTransform(params map[string]any, vλl string) string {
	return EmitStringTransformAfter(params, vλl, "")
}

// EmitStringTransformAfter is EmitStringTransform with a format-specific `prefix` chain applied FIRST, so the shared
// trim / case steps see its output.
func EmitStringTransformAfter(params map[string]any, vλl, prefix string) string {
	transform := ReadTransformParams(params)
	if transform == nil {
		return ""
	}
	expr := vλl + prefix
	if search, replace, ok := readReplaceParam(transform, "replace"); ok {
		expr += ".replace(" + search + ", " + replace + ")"
	}
	if search, replace, ok := readReplaceParam(transform, "replaceAll"); ok {
		expr += ".replaceAll(" + search + ", " + replace + ")"
	}
	if value, _ := ReadBoolParam(transform, "trim"); value {
		expr += ".trim()"
	}
	if value, _ := ReadBoolParam(transform, "lowercase"); value {
		expr += ".toLowerCase()"
	}
	if value, _ := ReadBoolParam(transform, "uppercase"); value {
		expr += ".toUpperCase()"
	}
	if value, _ := ReadBoolParam(transform, "capitalize"); value {
		expr = "(" + expr + ".charAt(0).toUpperCase() + " + expr + ".slice(1))"
	}
	if expr == vλl {
		return ""
	}
	return expr
}

// readReplaceParam returns a replace / replaceAll entry's searchValue and replaceValue as quoted JS string literals.
// On a malformed entry the emit skips it and ValidateTransformParams reports it.
func readReplaceParam(transform map[string]any, key string) (search, replace string, ok bool) {
	obj, isObj := transform[key].(map[string]any)
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

// ValidateTransformParams is the FMT002 shape check for params["transform"]; formatLabel ("FormatEmail") prefixes each message.
// The only guard against a typo inside the block: the TS-side exact-params check is shallow, so `{transform: {trimm: true}}` reaches the build unflagged.
func ValidateTransformParams(params map[string]any, formatLabel string, extraKeys ...string) []string {
	raw, present := params[TransformParamsKey]
	if !present {
		return nil
	}
	transform, isObj := raw.(map[string]any)
	if !isObj {
		return []string{formatLabel + ": `transform` must be an object"}
	}
	allowed := map[string]bool{}
	names := make([]string, 0, len(stringTransformKeys)+len(extraKeys))
	for _, key := range stringTransformKeys {
		allowed[key] = true
		names = append(names, key)
	}
	for _, key := range extraKeys {
		allowed[key] = true
		names = append(names, key)
	}
	keys := make([]string, 0, len(transform))
	for key := range transform {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	var messages []string
	for _, key := range keys {
		if !allowed[key] {
			messages = append(messages, formatLabel+": unknown `transform` key `"+key+"`; expected one of ["+strings.Join(names, ", ")+"]")
			continue
		}
		switch key {
		case "replace", "replaceAll":
			if _, _, ok := readReplaceParam(transform, key); !ok {
				messages = append(messages, formatLabel+": `transform."+key+"` needs string `searchValue` and `replaceValue`")
			}
		default:
			if _, isBool := ParamVal(transform[key]).(bool); !isBool {
				messages = append(messages, formatLabel+": `transform."+key+"` must be a boolean")
			}
		}
	}
	return messages
}
