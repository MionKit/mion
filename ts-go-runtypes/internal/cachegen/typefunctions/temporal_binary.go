package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// Maps the Temporal types with a compact numeric layout to the pack/unpack methods on the runtime
// serializer / deserializer (packages/run-types/src/runtypes/dataView.ts), which own the byte layout,
// buffer growth and the ISO-calendar discriminator. ZonedDateTime, Duration and PlainMonthDay have no
// compact numeric form: both functions return "" for them so the caller keeps serString(toJSON()).

// temporalToBinary returns the binary-encode statement for subKind, or "".
func temporalToBinary(subKind reflection.ReflectionSubKind, value, ser string) string {
	if method := temporalSerMethod(subKind); method != "" {
		return ser + "." + method + "(" + value + ")"
	}
	return ""
}

// temporalFromBinary returns the binary-decode statement (assigning to ret) for subKind, or "".
func temporalFromBinary(subKind reflection.ReflectionSubKind, ret, des string) string {
	if method := temporalDesMethod(subKind); method != "" {
		return ret + " = " + des + "." + method + "()"
	}
	return ""
}

// temporalSerMethod is the serializer method name for the numeric-packed Temporal subKinds, else "".
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

// temporalDesMethod is the deserializer method name, byte-symmetric with temporalSerMethod.
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
