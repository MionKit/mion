// Package numeric holds the Go-side emitters for the numeric-format
// family — numberFormat (FormatNumber<P> + the int8/16/32 defaults) and
// bigintFormat (FormatBigInt<P> + the 64-bit defaults). Both live here
// because they share the same param surface (min/max/lt/gt/multipleOf)
// and the same error/literal helpers. Each format registers via init().
package numeric

import (
	"math/big"
	"strconv"
	"strings"

	"github.com/mionkit/ts-runtypes/internal/cachegen/typefunctions/formats"
)

// 64-bit range bounds for the bigint binary optimization, parsed once.
// Mirror BIGINT64_MIN/MAX + BIGUINT64_MIN/MAX
// (bigIntFormat.runtype.ts:27-31).
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

// bigIntRawString returns a bigint param's raw decimal digits (trailing
// `n` stripped), unwrapping the `{val, …}` meta object. Bigint params
// arrive as strings via tsgo's TypeToString — typically with a trailing
// `n` (e.g. "9223372036854775807n"); the strip is defensive so both
// "123n" and "123" work. Full precision is preserved (never via float64).
func bigIntRawString(params map[string]any, key string) (string, bool) {
	raw, ok := params[key]
	if !ok {
		return "", false
	}
	switch typed := formats.ParamVal(raw).(type) {
	case string:
		return strings.TrimSuffix(typed, "n"), true
	case float64:
		// Defensive: a small bigint literal could arrive numeric.
		return strconv.FormatInt(int64(typed), 10), true
	}
	return "", false
}

// readBigIntParam parses a bigint param into a *big.Int — used ONLY for
// the 64-bit range decision (bigIntType). Returns (nil, false) when
// absent or unparseable.
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

// bigIntLiteral renders a bigint param as a JS bigint literal (raw
// decimal + `n`) for emitted source — validate comparisons and error `val`.
// Keeps full precision; never round-trips through float64.
func bigIntLiteral(params map[string]any, key string) (string, bool) {
	rawString, ok := bigIntRawString(params, key)
	if !ok {
		return "", false
	}
	return rawString + "n", true
}
