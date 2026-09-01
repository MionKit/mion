package formats

import (
	"sort"
	"strconv"
	"strings"
)

// TransformParamsKey is the ONE params key every string-family format reads its
// value rewrite from (`String<{transform: {trim: true}}>`,
// `Transform<Email, {lowercase: true}>`). The rewrite is applied only by the
// formatTransform family (createFormatTransformFn / mion's sanitizeParams),
// never by validate / parse / encode / decode, so nothing else reads it.
const TransformParamsKey = "transform"

// stringTransformKeys lists the shared rewrites, in APPLICATION order. Every
// string-family format accepts these; creditCard adds `stripSeparators`.
//
// The replacements run BEFORE trim on purpose: a rewrite is applied on the
// client and again on the server (mion's sanitize lane), so it must be stable
// under a second pass. Trimming first is not: removing a leading `-` afterwards
// can expose a tab or a non-breaking space that only the NEXT pass would trim
// (found by the transformIdempotence fuzz). Replacing first, then trimming,
// leaves nothing for a second pass to change.
var stringTransformKeys = []string{"replace", "replaceAll", "trim", "lowercase", "uppercase", "capitalize"}

// ReadTransformParams returns params["transform"] as an object, or nil when
// absent or not an object.
func ReadTransformParams(params map[string]any) map[string]any {
	transform, _ := params[TransformParamsKey].(map[string]any)
	return transform
}

// EmitStringTransform chains the shared rewrites declared under
// params["transform"] onto vλl, in order: replace, replaceAll, trim, lowercase,
// uppercase, capitalize (see stringTransformKeys for why trim comes after the
// replacements). Returns "" (identity) when none is set. Every string-family
// FormatTransformer goes through here; creditcard.go prepends its separator strip.
func EmitStringTransform(params map[string]any, vλl string) string {
	return EmitStringTransformAfter(params, vλl, "")
}

// EmitStringTransformAfter is EmitStringTransform with a format-specific rewrite
// `prefix` (a JS method chain such as `.replace(/[ -]/g,”)`) applied FIRST, so
// the shared trim / case steps see its output. Returns "" when nothing applies.
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

// readReplaceParam reads a replace / replaceAll entry ({searchValue,
// replaceValue}) and returns both as quoted JS string literals. ok is false when
// the key is absent or malformed, so the emit skips it and ValidateTransformParams
// reports it.
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

// ValidateTransformParams is the FMT002 shape check for params["transform"]:
// it must be an object, every key must be a shared rewrite or one of extraKeys,
// the flags must be booleans, and replace / replaceAll must carry string
// searchValue AND replaceValue. formatLabel ("FormatEmail") prefixes each
// message. nil when the key is absent or the object is valid. This is the only
// guard against a typo inside the block: the TS-side exact-params check is
// shallow, so `{transform: {trimm: true}}` reaches the build unflagged.
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
