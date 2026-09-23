package numeric

import (
	"math"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// numberFormatEmitter implements the format named "numberFormat", FormatNumber<P> in `@mionjs/run-types/formats`.
// `float` is a generation and presentation tag like isCurrency, never a failable constraint: an IEEE float legally
// holds whole values (2.0), so validation never rejects them. It steers mock generation toward fractional samples
// and keeps binary packing on the float64 arm.
// Its BinaryEncoder / BinaryDecoder pack an integer into the narrowest of int8/16/32 its min/max allows.
type numberFormatEmitter struct{}

// numberFormatName is the canonical FormatAnnotation.name the JS-side FormatNumber alias brands under.
const numberFormatName = "numberFormat"

// Safe-integer bounds, the integerType defaults when min/max are unset (JS Number.MIN/MAX_SAFE_INTEGER).
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

func (numberFormatEmitter) Kind() reflection.ReflectionKind {
	return reflection.KindNumber
}

// EmitValidateCheck returns the AND of every active number predicate, in the order integer, max, min, lt, gt,
// multipleOf. "" leaves the host its base Number.isFinite check.
// The `float` tag deliberately emits nothing: whole values are legal floats.
func (numberFormatEmitter) EmitValidateCheck(annotation *reflection.FormatAnnotation, vλl string, _ formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	return strings.Join(numberConditions(annotation.Params, vλl), " && ")
}

// numberConditions returns the validate boolean expressions for a number param map applied to `vλl`.
func numberConditions(params map[string]any, vλl string) []string {
	var conditions []string
	if value, ok := formats.ReadBoolParam(params, "integer"); ok && value {
		conditions = append(conditions, "Number.isInteger("+vλl+")")
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
		conditions = append(conditions, multipleOfCondition(vλl, value, multipleOfTolerance(params)))
	}
	return conditions
}

// EmitValidationErrorsCheck emits one `if (failed) <push error>` per active predicate, in the same order as
// EmitValidateCheck; integer tags the error `val` with `true`, the other params with the bound.
// `float` never produces an error.
func (numberFormatEmitter) EmitValidationErrorsCheck(annotation *reflection.FormatAnnotation, vλl, pathExpr, errorsArr string, _ formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	params := annotation.Params
	// isCurrency is presentation metadata, not a constraint: it rides every error so the friendly i18n renderer
	// can show the violated bound as money.
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
		statements = append(statements, "if (!"+multipleOfCondition(vλl, value, multipleOfTolerance(params))+") "+errCall("multipleOf", formats.FormatNumber(value)))
	}
	return strings.Join(statements, ";")
}

// EmitToBinary implements formats.BinaryEncoder: the narrowest setUint8/16/32 / setInt8/16/32 the range fits, or
// "" for floats, unconstrained integers and ranges wider than int32, which take the base float64 arm.
func (numberFormatEmitter) EmitToBinary(annotation *reflection.FormatAnnotation, vλl, ser string, _ formats.EmitContext) string {
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

// EmitFromBinary implements formats.BinaryDecoder, byte-symmetric with EmitToBinary: the RHS expression the host
// assigns to `ret`, or "" for the float64 fallback cases.
func (numberFormatEmitter) EmitFromBinary(annotation *reflection.FormatAnnotation, des string, _ formats.EmitContext) string {
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

// BinarySize implements formats.BinarySizer off the SAME integerType ladder EmitToBinary uses; everything that
// takes the base float64 arm is 8 bytes.
func (numberFormatEmitter) BinarySize(annotation *reflection.FormatAnnotation) formats.BinarySizeHint {
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

// integerKind enumerates the packed integer encodings in precedence order: unsigned first, narrowest first.
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

// integerType returns the FIRST matching encoding in unsigned-then-signed, narrowest-first order.
// min/max default to the safe-integer bounds, so an unbounded integer lands on float64.
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

// ValidateParams returns one message per violation, surfaced as CodeFMTInvalidParams.
// A `0` bound is falsy in the JS spelling these checks follow and so escapes them: that is what numberTruthy
// reproduces.
func (numberFormatEmitter) ValidateParams(annotation *reflection.FormatAnnotation) []string {
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

	// An edge given twice is redundant, one silently dominates. Uniform across the number / bigint / date families.
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

	multipleOf, hasMultipleOf := formats.ReadNumberParam(params, "multipleOf")
	if hasMultipleOf {
		if multipleOf <= 0 {
			errs = append(errs, label+": `multipleOf` must be greater than 0")
		}
		// A fractional step on an integer format could only ever match its whole multiples.
		if integer && !isWholeNumber(multipleOf) {
			errs = append(errs, label+": `multipleOf` must be a whole number when `integer` is set")
		}
	}
	if tolerance, ok := formats.ReadNumberParam(params, "multipleOfTolerance"); ok {
		if !hasMultipleOf || isWholeNumber(multipleOf) {
			errs = append(errs, label+": `multipleOfTolerance` needs a fractional `multipleOf`")
		}
		if tolerance <= 0 || tolerance >= 1 {
			errs = append(errs, label+": `multipleOfTolerance` must be greater than 0 and less than 1")
		}
	}
	return errs
}

// defaultMultipleOfTolerance is 4 × Number.EPSILON, above the ~1.5 epsilon of noise in `v / step`, below a real miss.
const defaultMultipleOfTolerance = 4 * 0x1p-52

func multipleOfTolerance(params map[string]any) float64 {
	if tolerance, ok := formats.ReadNumberParam(params, "multipleOfTolerance"); ok {
		return tolerance
	}
	return defaultMultipleOfTolerance
}

// multipleOfCondition keeps the exact modulo for a WHOLE step: cheaper, and right past 2^53 where every double is whole.
// A FRACTIONAL step cannot (`0.0075 % 0.0001` is 9.99e-5), so its tolerance is relative to the quotient.
// An overflowing quotient ends in NaN, which fails the comparison, so the value is rejected instead of raising.
// MIRROR of isMultipleOf in packages/run-types/src/mocking/isMultipleOf.ts.
func multipleOfCondition(vλl string, step, tolerance float64) string {
	literal := formats.FormatNumber(step)
	if isWholeNumber(step) {
		return "(" + vλl + " % " + literal + " === 0)"
	}
	quotient := vλl + " / " + literal
	return "(Math.abs(" + quotient + " - Math.round(" + quotient + ")) <= Math.abs(" + quotient + ") * " + formats.FormatNumber(tolerance) + ")"
}

func isWholeNumber(value float64) bool {
	return value == math.Trunc(value)
}

// numberTruthy returns 1 when the param is present AND non-zero, matching the JS `filter(Boolean)` drop of 0.
func numberTruthy(params map[string]any, key string) int {
	if value, ok := formats.ReadNumberParam(params, key); ok && value != 0 {
		return 1
	}
	return 0
}
