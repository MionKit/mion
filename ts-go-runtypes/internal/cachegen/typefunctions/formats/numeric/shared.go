// Package numeric holds the numberFormat (FormatNumber<P> + the int8/16/32 defaults) and bigintFormat
// (FormatBigInt<P> + the 64-bit defaults) emitters, together because they share one param surface
// (min/max/lt/gt/multipleOf) and the same error/literal helpers.
package numeric

import (
	"math/big"
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
)

// 64-bit range bounds for the bigint binary optimization, parsed once.
var (
	bigInt64Min  = mustBigInt("-9223372036854775808")
	bigInt64Max  = mustBigInt("9223372036854775807")
	bigUint64Min = mustBigInt("0")
	bigUint64Max = mustBigInt("18446744073709551615")
)

func mustBigInt(decimal string) *big.Int {
	value, _ := new(big.Int).SetString(decimal, 10)
	return value
}

// bigIntRawString returns a bigint param's raw decimal digits, unwrapping the `{val, …}` meta object.
// A param arrives as a string from tsgo's TypeToString, usually with a trailing `n`; the strip is defensive so
// both "123n" and "123" work. Full precision is preserved, never through float64.
func bigIntRawString(params map[string]any, key string) (string, bool) {
	raw, ok := params[key]
	if !ok {
		return "", false
	}
	switch typed := formats.ParamVal(raw).(type) {
	case string:
		// The digits are emitted unquoted as a bigint literal, so anything but `-?[0-9]+` is refused (FMT002).
		digits := strings.TrimSuffix(typed, "n")
		if !isDecimalInteger(digits) {
			return "", false
		}
		return digits, true
	case float64:
		// Defensive: a small bigint literal could arrive numeric.
		return strconv.FormatInt(int64(typed), 10), true
	}
	return "", false
}

// readBigIntParam parses a bigint param into a *big.Int, used ONLY for the 64-bit range decision (bigIntType).
func readBigIntParam(params map[string]any, key string) (*big.Int, bool) {
	rawString, ok := bigIntRawString(params, key)
	if !ok {
		return nil, false
	}
	value, ok := new(big.Int).SetString(rawString, 10)
	if !ok {
		return nil, false
	}
	return value, true
}

// bigIntLiteral renders a bigint param as a JS bigint literal for the emitted source, at full precision.
func bigIntLiteral(params map[string]any, key string) (string, bool) {
	rawString, ok := bigIntRawString(params, key)
	if !ok {
		return "", false
	}
	return rawString + "n", true
}

// isDecimalInteger mirrors typefunctions.IsDecimalInteger, copied because this package sits below it.
func isDecimalInteger(text string) bool {
	if text == "" || text == "-" {
		return false
	}
	for i, c := range text {
		if i == 0 && c == '-' {
			continue
		}
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

// malformedBigIntParams lists the present bigint params whose value is not a decimal integer, for FMT002.
func malformedBigIntParams(params map[string]any) []string {
	var bad []string
	for _, key := range []string{"max", "min", "lt", "gt", "multipleOf"} {
		if _, present := params[key]; !present {
			continue
		}
		if _, ok := bigIntRawString(params, key); !ok {
			bad = append(bad, key)
		}
	}
	return bad
}
