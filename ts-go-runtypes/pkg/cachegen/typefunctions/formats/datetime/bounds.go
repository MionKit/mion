// Package datetime holds the date / time / dateTime string-format emitters, kept out of the string package so
// they can share the min/max bound logic, plus the native `Date` format emitter. bounds.go is the codegen-free
// core: it validates a bound string (absolute literal OR a relative `now±P…` ISO-8601 duration) and enforces the
// per-kind component restriction, a date format taking only date components, a time format only time ones.
package datetime

import (
	"strconv"
	"strings"
)

// boundKind selects which duration components and which absolute-literal layouts a bound may use.
type boundKind int

const (
	dateKind boundKind = iota
	timeKind
	dateTimeKind
)

// relativeDuration captures which component groups an ISO-8601 duration uses; only presence is needed, to apply
// the per-kind restriction. Ordering invariants are checked while parsing.
type relativeDuration struct {
	sign        int // +1 for now+P…, -1 for now-P…, +1 for bare `now`
	bare        bool
	hasDatePart bool
	hasTimePart bool
	// raw is the original spec, passed verbatim to the runtime pure fn so JS owns the calendar arithmetic.
	raw string
}

// parseRelative parses a `now`, `now+P…`, or `now-P…` spec; isRelative false means the caller treats it as an
// absolute literal. A malformed relative spec answers isRelative true with err set, so the caller emits a
// diagnostic instead of falling through to absolute-literal parsing.
func parseRelative(spec string) (parsed relativeDuration, isRelative bool, err string) {
	if !strings.HasPrefix(spec, "now") {
		return relativeDuration{}, false, ""
	}
	rest := spec[len("now"):]
	if rest == "" {
		return relativeDuration{sign: 1, bare: true, raw: spec}, true, ""
	}
	sign := 0
	switch rest[0] {
	case '+':
		sign = 1
	case '-':
		sign = -1
	default:
		// 'nowP1Y' starts with 'now', so the author meant relative; flag it rather than read it as a literal.
		return relativeDuration{raw: spec}, true, "relative bound must be 'now', 'now+P…' or 'now-P…'"
	}
	duration := rest[1:]
	hasDate, hasTime, durErr := parseISODuration(duration)
	if durErr != "" {
		return relativeDuration{raw: spec}, true, durErr
	}
	return relativeDuration{sign: sign, hasDatePart: hasDate, hasTimePart: hasTime, raw: spec}, true, ""
}

// parseISODuration validates an ISO-8601 duration (`P[n]Y[n]M[n]W[n]D` then optional `T[n]H[n]M[n]S`).
// `M` is months before the `T` and minutes after it, so splitting on `T` first is what makes the per-kind
// restriction precise.
func parseISODuration(duration string) (hasDate, hasTime bool, err string) {
	if !strings.HasPrefix(duration, "P") {
		return false, false, "duration must start with 'P' (ISO-8601)"
	}
	body := duration[1:]
	if body == "" {
		return false, false, "duration 'P' must specify at least one component"
	}
	datePart := body
	timePart := ""
	if idx := strings.IndexByte(body, 'T'); idx >= 0 {
		datePart = body[:idx]
		timePart = body[idx+1:]
		if timePart == "" {
			return false, false, "duration 'T' must be followed by a time component"
		}
	}
	if datePart != "" {
		if msg := scanComponents(datePart, "YMWD"); msg != "" {
			return false, false, msg
		}
		hasDate = true
	}
	if timePart != "" {
		if msg := scanComponents(timePart, "HMS"); msg != "" {
			return false, false, msg
		}
		hasTime = true
	}
	if !hasDate && !hasTime {
		return false, false, "duration specifies no components"
	}
	return hasDate, hasTime, ""
}

// scanComponents verifies `part` is a sequence of `<number><designator>` pairs, each designator in `allowed`,
// in any order and at most once. Returns a message on the first problem.
func scanComponents(part, allowed string) string {
	seen := map[byte]bool{}
	i := 0
	for i < len(part) {
		start := i
		for i < len(part) && part[i] >= '0' && part[i] <= '9' {
			i++
		}
		if i == start {
			return "duration component missing a number before '" + string(part[i]) + "'"
		}
		if i >= len(part) {
			return "duration number '" + part[start:i] + "' has no unit designator"
		}
		designator := part[i]
		if strings.IndexByte(allowed, designator) < 0 {
			return "duration uses '" + string(designator) + "' which is not valid here"
		}
		if seen[designator] {
			return "duration repeats the '" + string(designator) + "' component"
		}
		seen[designator] = true
		i++
	}
	return ""
}

// validateBound validates one bound for `kind`: an absolute literal against the field's own layout, a relative
// spec against the per-kind component restriction.
func validateBound(bound, paramName string, kind boundKind, layout string) []string {
	if bound == "" {
		return nil
	}
	parsed, isRelative, relErr := parseRelative(bound)
	if isRelative {
		if relErr != "" {
			return []string{prefix(kind) + ": `" + paramName + "` " + strconv.Quote(bound) + " is not a valid relative bound — " + relErr}
		}
		return restrictComponents(parsed, paramName, kind)
	}
	if !isValidLiteral(bound, kind, layout) {
		return []string{prefix(kind) + ": `" + paramName + "` " + strconv.Quote(bound) + " is not a valid " + layoutLabel(kind, layout) + " value"}
	}
	return nil
}

// restrictComponents enforces that a relative duration only uses components belonging to `kind`; bare `now` is always fine.
func restrictComponents(parsed relativeDuration, paramName string, kind boundKind) []string {
	if parsed.bare {
		return nil
	}
	switch kind {
	case dateKind:
		if parsed.hasTimePart {
			return []string{prefix(kind) + ": `" + paramName + "` " + strconv.Quote(parsed.raw) +
				" uses time components, which are not allowed for a date format (only Y/M/W/D)"}
		}
	case timeKind:
		if parsed.hasDatePart {
			return []string{prefix(kind) + ": `" + paramName + "` " + strconv.Quote(parsed.raw) +
				" uses date components, which are not allowed for a time format (only T-section H/M/S)"}
		}
	}
	return nil
}

// validateMinMax validates the min/max/gt/lt bounds individually, then their combination.
// An edge given twice (min AND gt) is rejected because one silently dominates, mirroring the number/bigint families.
// Lower must not exceed upper; a pair involving a relative bound is skipped, its ordering depends on the runtime clock.
func validateMinMax(params map[string]any, kind boundKind, layout string) []string {
	var errs []string
	for _, key := range []string{"min", "max", "gt", "lt"} {
		if bound, has := stringParam(params, key); has {
			errs = append(errs, validateBound(bound, key, kind, layout)...)
		}
	}
	if len(errs) != 0 {
		return errs
	}
	if hasBound(params, "min") && hasBound(params, "gt") {
		errs = append(errs, prefix(kind)+": cannot specify both `min` and `gt` (a lower bound is inclusive or exclusive, not both)")
	}
	if hasBound(params, "max") && hasBound(params, "lt") {
		errs = append(errs, prefix(kind)+": cannot specify both `max` and `lt` (an upper bound is inclusive or exclusive, not both)")
	}
	if len(errs) != 0 {
		return errs
	}
	lowerKeys := []string{"min", "gt"}
	upperKeys := []string{"max", "lt"}
	for _, lowerKey := range lowerKeys {
		for _, upperKey := range upperKeys {
			if msg := orderingErr(params, kind, layout, lowerKey, upperKey); msg != "" {
				errs = append(errs, msg)
			}
		}
	}
	return errs
}

func hasBound(params map[string]any, key string) bool {
	bound, has := stringParam(params, key)
	return has && bound != ""
}

// orderingErr reports lowerKey exceeding upperKey, only when both are present, absolute and comparable.
func orderingErr(params map[string]any, kind boundKind, layout, lowerKey, upperKey string) string {
	lowerStr, hasLower := stringParam(params, lowerKey)
	upperStr, hasUpper := stringParam(params, upperKey)
	if !hasLower || !hasUpper {
		return ""
	}
	if _, lowerRel, _ := parseRelative(lowerStr); lowerRel {
		return ""
	}
	if _, upperRel, _ := parseRelative(upperStr); upperRel {
		return ""
	}
	lowerCmp, okLower := comparableLiteral(lowerStr, kind, layout)
	upperCmp, okUpper := comparableLiteral(upperStr, kind, layout)
	if !okLower || !okUpper || lowerCmp <= upperCmp {
		return ""
	}
	return prefix(kind) + ": `" + lowerKey + "` " + strconv.Quote(lowerStr) +
		" cannot be greater than `" + upperKey + "` " + strconv.Quote(upperStr)
}

func prefix(kind boundKind) string {
	switch kind {
	case dateKind:
		return "FormatStringDate"
	case timeKind:
		return "FormatStringTime"
	default:
		return "FormatStringDateTime"
	}
}

func stringParam(params map[string]any, key string) (string, bool) {
	raw, ok := params[key]
	if !ok {
		return "", false
	}
	value, isString := raw.(string)
	return value, isString
}
