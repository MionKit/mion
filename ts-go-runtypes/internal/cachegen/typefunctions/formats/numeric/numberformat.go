package numeric

import (
	"math"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// numberFormatEmitter implements the format named "numberFormat", FormatNumber<P> in `@mionjs/run-types/formats`.
// `float`, like isCurrency, only steers mocks and never fails validation: a float legally holds whole values (2.0).
type numberFormatEmitter struct{}

// numberFormatName is the canonical FormatAnnotation.name the JS-side FormatNumber alias brands under.
const numberFormatName = "numberFormat"

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
