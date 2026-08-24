package datetime

import (
	"strconv"
	"strings"
	"time"
)

// literals.go validates an ABSOLUTE min/max bound against the field's
// own layout and produces a numeric COMPARISON KEY on the same scale the
// JS runtime pure fns use, so a Go-baked absolute bound and a
// JS-computed relative (`now±P…`) bound compare against the same value.
//
// Scales (must match dateTime-pure-fns.ts exactly):
//   - date / dateTime / native Date → epoch milliseconds (UTC).
//   - time                          → milliseconds-of-day.
//
// Canonical fills for partial layouts (documented + mirrored in JS):
//   - missing year (MM-DD / DD-MM) → 2000
//   - missing day  (YYYY-MM)       → 1
// Go uses time.Date(...).UnixMilli() which is proleptic-Gregorian, the
// same calendar JS Date.UTC uses, so the epoch math is identical.

const defaultFillYear = 2000

// layoutLabel is the human-facing name of the expected literal shape.
func layoutLabel(kind boundKind, layout string) string {
	switch kind {
	case dateKind:
		return normalizeDateLayout(layout)
	case timeKind:
		return layout
	default:
		return "dateTime"
	}
}

func normalizeDateLayout(layout string) string {
	if layout == "ISO" || layout == "" {
		return "YYYY-MM-DD"
	}
	return layout
}

// isValidLiteral reports whether `value` is a valid absolute literal.
func isValidLiteral(value string, kind boundKind, layout string) bool {
	_, ok := comparableLiteral(value, kind, layout)
	return ok
}

// comparableLiteral parses an absolute literal and returns its
// comparison key (epoch ms for date/dateTime, ms-of-day for time).
func comparableLiteral(value string, kind boundKind, layout string) (float64, bool) {
	switch kind {
	case dateKind:
		return dateEpochMs(value, layout)
	case timeKind:
		return timeOfDayMs(value, layout)
	default:
		return dateTimeEpochMs(value, layout)
	}
}

// dateLayoutOrder returns the Y/M/D token order for a date layout.
func dateLayoutOrder(layout string) ([]string, bool) {
	switch normalizeDateLayout(layout) {
	case "YYYY-MM-DD":
		return []string{"Y", "M", "D"}, true
	case "DD-MM-YYYY":
		return []string{"D", "M", "Y"}, true
	case "MM-DD-YYYY":
		return []string{"M", "D", "Y"}, true
	case "YYYY-MM":
		return []string{"Y", "M"}, true
	case "MM-DD":
		return []string{"M", "D"}, true
	case "DD-MM":
		return []string{"D", "M"}, true
	}
	return nil, false
}

// dateEpochMs parses a date literal and returns its UTC epoch ms,
// applying range + leap-year validation (mirrors pf_isDateString).
func dateEpochMs(value, layout string) (float64, bool) {
	order, ok := dateLayoutOrder(layout)
	if !ok {
		return 0, false
	}
	parts := strings.Split(value, "-")
	if len(parts) != len(order) {
		return 0, false
	}
	year, month, day := defaultFillYear, 0, 1
	haveYear, haveDay := false, false
	for i, token := range order {
		switch token {
		case "Y":
			if len(parts[i]) != 4 {
				return 0, false
			}
			n, err := strconv.Atoi(parts[i])
			if err != nil || n < 0 || n > 9999 {
				return 0, false
			}
			year, haveYear = n, true
		case "M":
			n, ok := parseSegment(parts[i], 1, 12)
			if !ok {
				return 0, false
			}
			month = n
		case "D":
			n, ok := parseSegment(parts[i], 1, 31)
			if !ok {
				return 0, false
			}
			day, haveDay = n, true
		}
	}
	if haveDay && !validDayForMonth(year, haveYear, month, day) {
		return 0, false
	}
	return epochMs(year, month, day, 0), true
}

// validDayForMonth applies month-length + leap-year rules. When the year
// is absent (MM-DD), Feb 29 is allowed (can't disprove without a year).
func validDayForMonth(year int, haveYear bool, month, day int) bool {
	switch month {
	case 2:
		if day > 29 {
			return false
		}
		if haveYear && day == 29 && !(year%4 == 0 && (year%100 != 0 || year%400 == 0)) {
			return false
		}
	case 4, 6, 9, 11:
		if day > 30 {
			return false
		}
	}
	return true
}

// epochMs builds a UTC epoch-ms value from calendar fields + an intra-day
// ms offset. time.Date with time.UTC is proleptic Gregorian, matching JS
// Date.UTC.
func epochMs(year, month, day, intraDayMs int) float64 {
	base := time.Date(year, time.Month(month), day, 0, 0, 0, 0, time.UTC).UnixMilli()
	return float64(base + int64(intraDayMs))
}

// timeOfDayMs parses a time literal in `layout` → ms-of-day.
func timeOfDayMs(value, layout string) (float64, bool) {
	switch layout {
	case "ISO", "HH:mm:ss[.mmm]TZ":
		return isoTimeMs(value, true)
	case "HH:mm:ss[.mmm]":
		return isoTimeMs(value, false)
	case "HH:mm:ss":
		return fixedTimeMs(value, 3, false)
	case "HH:mm":
		return fixedTimeMs(value, 2, false)
	case "mm:ss":
		return fixedTimeMs(value, 2, true)
	case "HH":
		return scaledSegment(value, 0, 23, 3600000)
	case "mm":
		return scaledSegment(value, 0, 59, 60000)
	case "ss":
		return scaledSegment(value, 0, 59, 1000)
	}
	return 0, false
}

// isoTimeMs parses HH:mm:ss[.mmm] with an optional Z/±HH:mm tz (when
// withTZ). The tz offset is validated but NOT folded into the key —
// comparison is wall-clock (documented; the JS side does the same).
func isoTimeMs(value string, withTZ bool) (float64, bool) {
	body := value
	if withTZ {
		trimmed, ok := stripTimeZone(value)
		if !ok {
			return 0, false
		}
		body = trimmed
	}
	parts := strings.Split(body, ":")
	if len(parts) != 3 {
		return 0, false
	}
	hours, ok := parseSegment(parts[0], 0, 23)
	if !ok {
		return 0, false
	}
	mins, ok := parseSegment(parts[1], 0, 59)
	if !ok {
		return 0, false
	}
	secMs, ok := parseSecondsWithMs(parts[2])
	if !ok {
		return 0, false
	}
	return float64(hours*3600000+mins*60000) + secMs, true
}

func stripTimeZone(value string) (string, bool) {
	if strings.HasSuffix(value, "Z") || strings.HasSuffix(value, "z") {
		return value[:len(value)-1], true
	}
	for _, sep := range []byte{'+', '-'} {
		if idx := strings.LastIndexByte(value, sep); idx > 0 {
			seg := strings.Split(value[idx+1:], ":")
			if len(seg) != 2 {
				return "", false
			}
			if _, ok := parseSegment(seg[0], 0, 23); !ok {
				return "", false
			}
			if _, ok := parseSegment(seg[1], 0, 59); !ok {
				return "", false
			}
			return value[:idx], true
		}
	}
	return "", false
}

func fixedTimeMs(value string, segCount int, minutesFirst bool) (float64, bool) {
	parts := strings.Split(value, ":")
	if len(parts) != segCount {
		return 0, false
	}
	if segCount == 3 {
		hours, ok := parseSegment(parts[0], 0, 23)
		if !ok {
			return 0, false
		}
		mins, ok := parseSegment(parts[1], 0, 59)
		if !ok {
			return 0, false
		}
		secs, ok := parseSegment(parts[2], 0, 59)
		if !ok {
			return 0, false
		}
		return float64(hours*3600000 + mins*60000 + secs*1000), true
	}
	if minutesFirst {
		mins, ok := parseSegment(parts[0], 0, 59)
		if !ok {
			return 0, false
		}
		secs, ok := parseSegment(parts[1], 0, 59)
		if !ok {
			return 0, false
		}
		return float64(mins*60000 + secs*1000), true
	}
	hours, ok := parseSegment(parts[0], 0, 23)
	if !ok {
		return 0, false
	}
	mins, ok := parseSegment(parts[1], 0, 59)
	if !ok {
		return 0, false
	}
	return float64(hours*3600000 + mins*60000), true
}

func scaledSegment(value string, lo, hi, scale int) (float64, bool) {
	n, ok := parseSegment(value, lo, hi)
	if !ok {
		return 0, false
	}
	return float64(n * scale), true
}

func parseSegment(seg string, lo, hi int) (int, bool) {
	if len(seg) == 0 || len(seg) > 2 {
		return 0, false
	}
	n, err := strconv.Atoi(seg)
	if err != nil || n < lo || n > hi {
		return 0, false
	}
	return n, true
}

func parseSecondsWithMs(seg string) (float64, bool) {
	parts := strings.Split(seg, ".")
	if len(parts) > 2 {
		return 0, false
	}
	secs, ok := parseSegment(parts[0], 0, 59)
	if !ok {
		return 0, false
	}
	ms := 0
	if len(parts) == 2 {
		if len(parts[1]) != 3 {
			return 0, false
		}
		n, err := strconv.Atoi(parts[1])
		if err != nil || n < 0 || n > 999 {
			return 0, false
		}
		ms = n
	}
	return float64(secs*1000 + ms), true
}

// dateTimeEpochMs validates a full datetime literal and returns UTC epoch
// ms. Split on `splitChar` (default 'T'); the static guard parses both
// halves as ISO (nested-layout-aware comparison is the emitter's job —
// this is a best-effort build-time ordering check).
func dateTimeEpochMs(value, splitChar string) (float64, bool) {
	sep := splitChar
	if sep == "" {
		sep = "T"
	}
	idx := strings.Index(value, sep)
	if idx < 0 {
		return 0, false
	}
	dateMs, ok := dateEpochMs(value[:idx], "ISO")
	if !ok {
		return 0, false
	}
	timeMs, ok := lenientTimeMs(value[idx+len(sep):])
	if !ok {
		return 0, false
	}
	return dateMs + timeMs, true
}

// lenientTimeMs tries each time layout for the time half of a dateTime
// literal — the static bound check doesn't know the nested `time.format`
// (only splitChar reaches comparableLiteral), so a valid value in ANY
// recognised time layout is accepted. Codegen still validates against the
// declared nested layout at runtime; this is only the build-time ordering
// guard.
func lenientTimeMs(value string) (float64, bool) {
	for _, layout := range []string{"HH:mm:ss[.mmm]TZ", "HH:mm:ss[.mmm]", "HH:mm:ss", "HH:mm", "mm:ss", "HH"} {
		if ms, ok := timeOfDayMs(value, layout); ok {
			return ms, true
		}
	}
	return 0, false
}
