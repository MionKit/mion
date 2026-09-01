package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// temporal_binary.go maps the Temporal types with a compact numeric binary
// layout to the dedicated pack/unpack methods on the runtime serializer /
// deserializer (packages/run-types/src/runtypes/dataView.ts). Keeping
// the byte-level layout in those classes (rather than inlining it here)
// makes it testable TypeScript and lets the methods own buffer-capacity
// growth and the ISO-calendar discriminator.
//
// ZonedDateTime (time-zone id strings), Duration (calendar-relative
// components) and PlainMonthDay (month/day, no year) have no compact numeric
// form worth the complexity — temporalToBinary / temporalFromBinary return
// "" for them so the caller keeps the lossless serString(toJSON()) path.

// temporalToBinary returns the binary-encode statement for subKind, or "".
func temporalToBinary(subKind reflection.ReflectionSubKind, value, ser string) string {
	if method := temporalSerMethod(subKind); method != "" {
		return ser + "." + method + "(" + value + ")"
	}
	return ""
}

// temporalFromBinary returns the binary-decode statement (assigning to ret)
// for subKind, or "".
func temporalFromBinary(subKind reflection.ReflectionSubKind, ret, des string) string {
	if method := temporalDesMethod(subKind); method != "" {
		return ret + " = " + des + "." + method + "()"
	}
	return ""
}

// temporalSerMethod is the serializer method name for the numeric-packed
// Temporal subKinds, or "" for the string-fallback types.
func temporalSerMethod(subKind reflection.ReflectionSubKind) string {
	switch subKind {
	case reflection.SubKindTemporalInstant:
		return "serTemporalInstant"
	case reflection.SubKindTemporalPlainTime:
		return "serTemporalPlainTime"
	case reflection.SubKindTemporalPlainDate:
		return "serTemporalPlainDate"
	case reflection.SubKindTemporalPlainDateTime:
		return "serTemporalPlainDateTime"
	case reflection.SubKindTemporalPlainYearMonth:
		return "serTemporalPlainYearMonth"
	}
	return ""
}

// temporalDesMethod is the deserializer method name, byte-symmetric with
// temporalSerMethod.
func temporalDesMethod(subKind reflection.ReflectionSubKind) string {
	switch subKind {
	case reflection.SubKindTemporalInstant:
		return "desTemporalInstant"
	case reflection.SubKindTemporalPlainTime:
		return "desTemporalPlainTime"
	case reflection.SubKindTemporalPlainDate:
		return "desTemporalPlainDate"
	case reflection.SubKindTemporalPlainDateTime:
		return "desTemporalPlainDateTime"
	case reflection.SubKindTemporalPlainYearMonth:
		return "desTemporalPlainYearMonth"
	}
	return ""
}
