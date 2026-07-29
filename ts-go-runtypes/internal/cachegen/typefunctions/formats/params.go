package formats

import "strconv"

// ParamVal unwraps the `{val, errorMessage, desc}` param meta-object
// (utils.ts paramVal): returns raw["val"] for map-shaped params, raw
// unchanged otherwise. The current TS param surfaces declare plain
// literals, so the unwrap is defensive parity — kept in ONE place
// instead of a copy inside every reader.
func ParamVal(raw any) any {
	if obj, isMap := raw.(map[string]any); isMap {
		return obj["val"]
	}
	return raw
}

// ReadNumberParam extracts a numeric param value, unwrapping the meta
// object first. Accepts float64 (the canonical JSON-decoded form), int
// variants, and stringified numbers. Returns (0, false) when the key is
// absent or carries a non-numeric value. Shared by every format family
// that reads numeric params (string lengths, numeric bounds).
func ReadNumberParam(params map[string]any, key string) (float64, bool) {
	raw, ok := params[key]
	if !ok {
		return 0, false
	}
	switch typed := ParamVal(raw).(type) {
	case float64:
		return typed, true
	case float32:
		return float64(typed), true
	case int:
		return float64(typed), true
	case int32:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case string:
		if value, err := strconv.ParseFloat(typed, 64); err == nil {
			return value, true
		}
	}
	return 0, false
}

// PatternSampleLengthHints projects a format's declared length bounds
// onto the pattern sample generator's (minLength, maxLength) hints: an
// exact `length` pins both ends; otherwise minLength / maxLength pass
// through (0 = unbounded). Lengths count UTF-16 code units on both sides.
// This is the ONE hints derivation, shared by the resolver's enrichment
// pass and the pattern emitter's FMT005 replay — both feed
// Engine.GeneratePattern, whose memo keys must match exactly, so the two
// call sites can never compute bounds two different ways.
func PatternSampleLengthHints(params map[string]any) (int, int) {
	if length, ok := ReadNumberParam(params, "length"); ok && length > 0 {
		return int(length), int(length)
	}
	minLength := 0
	if value, ok := ReadNumberParam(params, "minLength"); ok && value > 0 {
		minLength = int(value)
	}
	maxLength := 0
	if value, ok := ReadNumberParam(params, "maxLength"); ok && value > 0 {
		maxLength = int(value)
	}
	return minLength, maxLength
}

// ReadBoolParam reads a boolean param, unwrapping the meta object.
// Returns (value, present); present is false when the key is absent or
// its (unwrapped) value isn't a bool.
func ReadBoolParam(params map[string]any, key string) (value, present bool) {
	raw, ok := params[key]
	if !ok {
		return false, false
	}
	boolVal, isBool := ParamVal(raw).(bool)
	if !isBool {
		return false, false
	}
	return boolVal, true
}
