package numeric

import (
	"strings"

	"github.com/mionkit/ts-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// numberFormatEmitter implements the format with name "numberFormat" —
// FormatNumber<P> in `ts-runtypes/formats`. Mirrors
// NumberRunTypeFormat (ref: packages/type-formats/src/number/numberFormat.runtype.ts).
//
// Surface: integer / float, min / max / lt / gt, multipleOf — emitted in
// emitIsType order. Beyond validate / validationErrors / validateParams it
// also implements formats.BinaryEncoder / BinaryDecoder: the binary
// serializer packs an integer into the narrowest of int8/16/32 (signed
// or unsigned) its min/max allows, falling back to the base float64 arm
// otherwise (emitToBinary, numberFormat.runtype.ts:133-191).
type numberFormatEmitter struct{}

// numberFormatName is the canonical FormatAnnotation.name the JS-side
// FormatNumber alias brands under (the NumberRunTypeFormat.id).
const numberFormatName = "numberFormat"

// Safe-integer bounds — the getIntegerType defaults when min/max are
// unset (uses Number.MIN/MAX_SAFE_INTEGER, numberFormat.runtype.ts:288-289).
const (
	minSafeInteger = -9007199254740991
	maxSafeInteger = 9007199254740991
)

func init() {
	formats.Register(numberFormatEmitter{})
}

func (numberFormatEmitter) Name() string {
	return numberFormatName
}

func (numberFormatEmitter) Kind() protocol.ReflectionKind {
	return protocol.KindNumber
}

// EmitValidateCheck returns the AND of every active number predicate, in
// emitIsType order (numberFormat.runtype.ts:40-81): integer/float,
// max, min, lt, gt, multipleOf. Returns "" when no params constrain the
// value — the host keeps its base Number.isFinite check.
func (numberFormatEmitter) EmitValidateCheck(annotation *protocol.FormatAnnotation, vλl string, _ formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	return strings.Join(numberConditions(annotation.Params, vλl), " && ")
}

// numberConditions returns the validate boolean expressions for a number
// param map applied to `vλl`.
func numberConditions(params map[string]any, vλl string) []string {
	var conditions []string
	if value, ok := formats.ReadBoolParam(params, "integer"); ok && value {
		conditions = append(conditions, "Number.isInteger("+vλl+")")
	} else if value, ok := formats.ReadBoolParam(params, "float"); ok && value {
		conditions = append(conditions, "!Number.isInteger("+vλl+")")
	}
	if value, ok := formats.ReadNumberParam(params, "max"); ok {
		conditions = append(conditions, vλl+" <= "+formats.FormatNumber(value))
	}
	if value, ok := formats.ReadNumberParam(params, "min"); ok {
		conditions = append(conditions, vλl+" >= "+formats.FormatNumber(value))
	}
	if value, ok := formats.ReadNumberParam(params, "lt"); ok {
		conditions = append(conditions, vλl+" < "+formats.FormatNumber(value))
	}
	if value, ok := formats.ReadNumberParam(params, "gt"); ok {
		conditions = append(conditions, vλl+" > "+formats.FormatNumber(value))
	}
	if value, ok := formats.ReadNumberParam(params, "multipleOf"); ok {
		conditions = append(conditions, multipleOfCondition(vλl, value))
	}
	return conditions
}

// EmitValidationErrorsCheck emits one `if (failed) <push error>` statement per
// active predicate, in emitIsTypeErrors order
// (numberFormat.runtype.ts:83-125). integer/float tag the error `val`
// with the literal `true`; the range/multipleOf params tag it with the
// bound.
func (numberFormatEmitter) EmitValidationErrorsCheck(annotation *protocol.FormatAnnotation, vλl, pathExpr, errorsArr string, _ formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	params := annotation.Params
	// isCurrency is PURE PRESENTATION METADATA (no failable constraint): it is
	// echoed verbatim onto every error this field emits, so the friendly i18n
	// renderer can render the violated bound as money
	// (Intl.NumberFormat(locale, {style: 'currency', currency})).
	extra := ""
	if isCurrency, ok := formats.ReadBoolParam(params, "isCurrency"); ok && isCurrency {
		extra = ",isCurrency:true"
	}
	errCall := func(paramName, paramValLiteral string) string {
		return formats.FormatErrCallWith(pathExpr, errorsArr, "number", numberFormatName, paramName, paramValLiteral, extra)
	}
	var statements []string
	if value, ok := formats.ReadBoolParam(params, "integer"); ok && value {
		statements = append(statements, "if (!Number.isInteger("+vλl+")) "+errCall("integer", "true"))
	} else if value, ok := formats.ReadBoolParam(params, "float"); ok && value {
		statements = append(statements, "if (Number.isInteger("+vλl+")) "+errCall("float", "true"))
	}
	if value, ok := formats.ReadNumberParam(params, "max"); ok {
		statements = append(statements, "if ("+vλl+" > "+formats.FormatNumber(value)+") "+errCall("max", formats.FormatNumber(value)))
	}
	if value, ok := formats.ReadNumberParam(params, "min"); ok {
		statements = append(statements, "if ("+vλl+" < "+formats.FormatNumber(value)+") "+errCall("min", formats.FormatNumber(value)))
	}
	if value, ok := formats.ReadNumberParam(params, "lt"); ok {
		statements = append(statements, "if ("+vλl+" >= "+formats.FormatNumber(value)+") "+errCall("lt", formats.FormatNumber(value)))
	}
	if value, ok := formats.ReadNumberParam(params, "gt"); ok {
		statements = append(statements, "if ("+vλl+" <= "+formats.FormatNumber(value)+") "+errCall("gt", formats.FormatNumber(value)))
	}
	if value, ok := formats.ReadNumberParam(params, "multipleOf"); ok {
		statements = append(statements, "if (!"+multipleOfCondition(vλl, value)+") "+errCall("multipleOf", formats.FormatNumber(value)))
	}
	return strings.Join(statements, ";")
}

// EmitToBinary implements formats.BinaryEncoder — emitToBinary
// (numberFormat.runtype.ts:133-161). Returns "" (→ base float64 arm) for
// floats, unconstrained integers, and integer ranges wider than int32;
// otherwise the narrowest setUint8/16/32 / setInt8/16/32 the range fits.
func (numberFormatEmitter) EmitToBinary(annotation *protocol.FormatAnnotation, vλl, ser string, _ formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	params := annotation.Params
	if isFloat, ok := formats.ReadBoolParam(params, "float"); ok && isFloat {
		return "" // float → base float64 arm
	}
	if isInt, ok := formats.ReadBoolParam(params, "integer"); !ok || !isInt {
		return "" // not an integer brand → base float64 arm
	}
	switch integerType(params) {
	case intUint8:
		return ser + ".view.setUint8(" + ser + ".index++, " + vλl + ")"
	case intUint16:
		return ser + ".view.setUint16(" + ser + ".index, " + vλl + ", 1, " + ser + ".index += 2)"
	case intUint32:
		return ser + ".view.setUint32(" + ser + ".index, " + vλl + ", 1, " + ser + ".index += 4)"
	case intInt8:
		return ser + ".view.setInt8(" + ser + ".index++, " + vλl + ")"
	case intInt16:
		return ser + ".view.setInt16(" + ser + ".index, " + vλl + ", 1, " + ser + ".index += 2)"
	case intInt32:
		return ser + ".view.setInt32(" + ser + ".index, " + vλl + ", 1, " + ser + ".index += 4)"
	default:
		return "" // wider than int32 → base float64 arm
	}
}

// EmitFromBinary implements formats.BinaryDecoder — emitFromBinary
// (numberFormat.runtype.ts:163-191). Byte-symmetric with EmitToBinary;
// returns the RHS expression the host assigns to `ret`, or "" for the
// float64 fallback cases.
func (numberFormatEmitter) EmitFromBinary(annotation *protocol.FormatAnnotation, des string, _ formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	params := annotation.Params
	if isFloat, ok := formats.ReadBoolParam(params, "float"); ok && isFloat {
		return ""
	}
	if isInt, ok := formats.ReadBoolParam(params, "integer"); !ok || !isInt {
		return ""
	}
	switch integerType(params) {
	case intUint8:
		return des + ".view.getUint8(" + des + ".index++)"
	case intUint16:
		return des + ".view.getUint16(" + des + ".index, 1, " + des + ".index += 2)"
	case intUint32:
		return des + ".view.getUint32(" + des + ".index, 1, " + des + ".index += 4)"
	case intInt8:
		return des + ".view.getInt8(" + des + ".index++)"
	case intInt16:
		return des + ".view.getInt16(" + des + ".index, 1, " + des + ".index += 2)"
	case intInt32:
		return des + ".view.getInt32(" + des + ".index, 1, " + des + ".index += 4)"
	default:
		return ""
	}
}

// BinarySize implements formats.BinarySizer: the exact wire width the
// packed integer occupies, from the SAME integerType ladder EmitToBinary
// uses. Floats, non-integers, unconstrained integers and ranges wider than
// int32 all ride the base float64 arm — 8 bytes.
func (numberFormatEmitter) BinarySize(annotation *protocol.FormatAnnotation) formats.BinarySizeHint {
	if annotation == nil {
		return formats.BinarySizeHint{Fixed: 8}
	}
	params := annotation.Params
	if isFloat, ok := formats.ReadBoolParam(params, "float"); ok && isFloat {
		return formats.BinarySizeHint{Fixed: 8}
	}
	if isInt, ok := formats.ReadBoolParam(params, "integer"); !ok || !isInt {
		return formats.BinarySizeHint{Fixed: 8}
	}
	switch integerType(params) {
	case intUint8, intInt8:
		return formats.BinarySizeHint{Fixed: 1}
	case intUint16, intInt16:
		return formats.BinarySizeHint{Fixed: 2}
	case intUint32, intInt32:
		return formats.BinarySizeHint{Fixed: 4}
	default:
		return formats.BinarySizeHint{Fixed: 8}
	}
}

// integerKind enumerates the packed integer encodings, in the
// switch(true) precedence (unsigned first, narrowest first).
type integerKind int

const (
	intFloat64 integerKind = iota
	intUint8
	intUint16
	intUint32
	intInt8
	intInt16
	intInt32
)

// integerType ports getIntegerType (numberFormat.runtype.ts:286-297)
// + the switch(true) ordering in emitToBinary: it returns the FIRST
// matching encoding in unsigned-then-signed, narrowest-first order.
// Defaults min/max to the safe-integer bounds so an unbounded integer
// (FormatInteger / FormatPositiveInt) lands on float64.
func integerType(params map[string]any) integerKind {
	min := float64(minSafeInteger)
	if value, ok := formats.ReadNumberParam(params, "min"); ok {
		min = value
	}
	max := float64(maxSafeInteger)
	if value, ok := formats.ReadNumberParam(params, "max"); ok {
		max = value
	}
	switch {
	case min >= 0 && max <= 255:
		return intUint8
	case min >= 0 && max <= 65535:
		return intUint16
	case min >= 0 && max <= 4294967295:
		return intUint32
	case min >= -128 && max <= 127:
		return intInt8
	case min >= -32768 && max <= 32767:
		return intInt16
	case min >= -2147483648 && max <= 2147483647:
		return intInt32
	default:
		return intFloat64
	}
}

// ValidateParams ports NumberRunTypeFormat.validateParams
// (numberFormat.runtype.ts:234-283) to the build-time AOT path. Returns
// one message per violation (surfaced as CodeFMTInvalidParams). The
// `[x, y].filter(Boolean)` mutual-exclusivity / range checks are kept
// spec-faithful: a `0` bound is falsy per the reference and so escapes these
// checks — replicated here via numberTruthy for byte-for-byte parity.
func (numberFormatEmitter) ValidateParams(annotation *protocol.FormatAnnotation) []string {
	const label = "NumberFormat"
	if annotation == nil {
		return nil
	}
	params := annotation.Params
	var errs []string

	integer, _ := formats.ReadBoolParam(params, "integer")
	float, _ := formats.ReadBoolParam(params, "float")
	if integer && float {
		errs = append(errs, label+": cannot specify both `integer` and `float`")
	}

	// A lower bound is EITHER inclusive (`min`) OR exclusive (`gt`), never
	// both — they express the same edge two ways, so specifying both is
	// always redundant (one silently dominates). Same for the upper bound
	// (`max`/`lt`). Uniform across number / bigint / date families.
	if numberTruthy(params, "min")+numberTruthy(params, "gt") > 1 {
		errs = append(errs, label+": cannot specify more than one of `min` or `gt`")
	}
	if numberTruthy(params, "max")+numberTruthy(params, "lt") > 1 {
		errs = append(errs, label+": cannot specify more than one of `max` or `lt`")
	}

	min, hasMin := formats.ReadNumberParam(params, "min")
	max, hasMax := formats.ReadNumberParam(params, "max")
	if hasMin && min != 0 && hasMax && max != 0 && min > max {
		errs = append(errs, label+": `min` cannot be greater than `max`")
	}
	gt, hasGt := formats.ReadNumberParam(params, "gt")
	lt, hasLt := formats.ReadNumberParam(params, "lt")
	if hasGt && gt != 0 && hasLt && lt != 0 && gt >= lt {
		errs = append(errs, label+": `gt` cannot be greater than or equal to `lt`")
	}

	if multipleOf, ok := formats.ReadNumberParam(params, "multipleOf"); ok {
		if multipleOf <= 0 {
			errs = append(errs, label+": `multipleOf` must be greater than 0")
		}
		// A fractional `multipleOf` used to be rejected here over floating-point
		// precision. JSON Schema allows any positive number (`multipleOf: 0.01`
		// on a money field is the obvious case) and defines the rule as "division
		// by this value results in an integer", so multipleOfCondition emits that
		// division directly rather than a modulo that cannot express it.
		if float {
			errs = append(errs, label+": `multipleOf` cannot be used with the `float` constraint")
		}
	}
	return errs
}

// multipleOfCondition emits the "is a multiple of" predicate. An INTEGER divisor
// keeps the modulo: it is exact on doubles, cheaper than a division, and stays
// right for magnitudes past 2^53 where a quotient is integral simply because
// every double that large is. A FRACTIONAL divisor cannot use it — `0.0075 %
// 0.0001` is 9.99e-5, not 0 — so it takes JSON Schema's own wording, "division
// by this value results in an integer". That also gives the spec's answer for an
// overflowing divisor: `1e308 / 0.123456789` is Infinity, which is not an
// integer, so the value is rejected instead of raising.
func multipleOfCondition(vλl string, value float64) string {
	literal := formats.FormatNumber(value)
	if value == float64(int64(value)) {
		return "(" + vλl + " % " + literal + " === 0)"
	}
	return "Number.isInteger(" + vλl + " / " + literal + ")"
}

// numberTruthy returns 1 when the param is present AND its value is
// non-zero (the `[…].filter(Boolean)` drops 0), else 0.
func numberTruthy(params map[string]any, key string) int {
	if value, ok := formats.ReadNumberParam(params, key); ok && value != 0 {
		return 1
	}
	return 0
}
