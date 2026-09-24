package numeric

import (
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// bigintFormatEmitter implements the format named "bigintFormat", FormatBigInt<P> in `@mionjs/run-types/formats`.
// Surface: min / max / lt / gt, multipleOf, emitted with bigint literals (`100n`).
type bigintFormatEmitter struct{}

// bigintFormatName is the canonical FormatAnnotation.name the JS-side FormatBigInt alias brands under.
const bigintFormatName = "bigintFormat"

func init() {
	formats.Register(bigintFormatEmitter{})
}

func (bigintFormatEmitter) Name() string {
	return bigintFormatName
}

func (bigintFormatEmitter) Kind() reflection.ReflectionKind {
	return reflection.KindBigInt
}

// EmitValidateCheck returns the AND of every active bigint predicate, in the order max, min, lt, gt, multipleOf.
// "" leaves the host its base `typeof v === 'bigint'`.
func (bigintFormatEmitter) EmitValidateCheck(annotation *reflection.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	reportMalformedBigIntParams(annotation.Params, ctx)
	return strings.Join(bigintConditions(annotation.Params, vλl), " && ")
}

// bigintConditions returns the validate boolean expressions for a bigint param map applied to `vλl`.
func bigintConditions(params map[string]any, vλl string) []string {
	var conditions []string
	if literal, ok := bigIntLiteral(params, "max"); ok {
		conditions = append(conditions, vλl+" <= "+literal)
	}
	if literal, ok := bigIntLiteral(params, "min"); ok {
		conditions = append(conditions, vλl+" >= "+literal)
	}
	if literal, ok := bigIntLiteral(params, "lt"); ok {
		conditions = append(conditions, vλl+" < "+literal)
	}
	if literal, ok := bigIntLiteral(params, "gt"); ok {
		conditions = append(conditions, vλl+" > "+literal)
	}
	if literal, ok := bigIntLiteral(params, "multipleOf"); ok {
		conditions = append(conditions, "("+vλl+" % "+literal+" === 0n)")
	}
	return conditions
}

// EmitValidationErrorsCheck emits one `if (failed) <push error>` per active predicate, in the same order as
// EmitValidateCheck; the error `val` carries the bigint literal.
func (bigintFormatEmitter) EmitValidationErrorsCheck(annotation *reflection.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	params := annotation.Params
	reportMalformedBigIntParams(params, ctx)
	var statements []string
	if literal, ok := bigIntLiteral(params, "max"); ok {
		statements = append(statements,
			"if ("+vλl+" > "+literal+") "+formats.FormatErrCall(pathExpr, errorsArr, "bigint", bigintFormatName, "max", literal))
	}
	if literal, ok := bigIntLiteral(params, "min"); ok {
		statements = append(statements,
			"if ("+vλl+" < "+literal+") "+formats.FormatErrCall(pathExpr, errorsArr, "bigint", bigintFormatName, "min", literal))
	}
	if literal, ok := bigIntLiteral(params, "lt"); ok {
		statements = append(statements,
			"if ("+vλl+" >= "+literal+") "+formats.FormatErrCall(pathExpr, errorsArr, "bigint", bigintFormatName, "lt", literal))
	}
	if literal, ok := bigIntLiteral(params, "gt"); ok {
		statements = append(statements,
			"if ("+vλl+" <= "+literal+") "+formats.FormatErrCall(pathExpr, errorsArr, "bigint", bigintFormatName, "gt", literal))
	}
	if literal, ok := bigIntLiteral(params, "multipleOf"); ok {
		statements = append(statements,
			"if (("+vλl+" % "+literal+" !== 0n)) "+formats.FormatErrCall(pathExpr, errorsArr, "bigint", bigintFormatName, "multipleOf", literal))
	}
	return strings.Join(statements, ";")
}

// ValidateParams enforces that {min,gt} and {max,lt} are mutually exclusive, min<=max, gt<lt and multipleOf>0.
// A `0n` bound is falsy in the JS spelling these checks follow and so escapes them: that is what bigTruthy and
// the explicit non-zero guards reproduce.
func (bigintFormatEmitter) ValidateParams(annotation *reflection.FormatAnnotation) []string {
	if annotation == nil {
		return nil
	}
	params := annotation.Params
	var errs []string

	if bigTruthy(params, "min")+bigTruthy(params, "gt") > 1 {
		errs = append(errs, "BigIntFormat: cannot specify more than one of `min` or `gt`")
	}
	if bigTruthy(params, "max")+bigTruthy(params, "lt") > 1 {
		errs = append(errs, "BigIntFormat: cannot specify more than one of `max` or `lt`")
	}

	min, hasMin := readBigIntParam(params, "min")
	max, hasMax := readBigIntParam(params, "max")
	if hasMin && min.Sign() != 0 && hasMax && max.Sign() != 0 && min.Cmp(max) > 0 {
		errs = append(errs, "BigIntFormat: `min` cannot be greater than `max`")
	}
	gt, hasGt := readBigIntParam(params, "gt")
	lt, hasLt := readBigIntParam(params, "lt")
	if hasGt && gt.Sign() != 0 && hasLt && lt.Sign() != 0 && gt.Cmp(lt) >= 0 {
		errs = append(errs, "BigIntFormat: `gt` cannot be greater than or equal to `lt`")
	}

	if multipleOf, ok := readBigIntParam(params, "multipleOf"); ok && multipleOf.Sign() <= 0 {
		errs = append(errs, "BigIntFormat: `multipleOf` must be greater than 0")
	}
	return errs
}

// bigTruthy returns 1 when the bigint param is present AND non-zero, matching the JS `filter(Boolean)` drop of 0n.
func bigTruthy(params map[string]any, key string) int {
	if value, ok := readBigIntParam(params, key); ok && value.Sign() != 0 {
		return 1
	}
	return 0
}

// reportMalformedBigIntParams: bigIntRawString drops a non-decimal-integer param from the emitted checks, so the
// build reports it instead of silently weakening the validator.
func reportMalformedBigIntParams(params map[string]any, ctx formats.EmitContext) {
	if ctx == nil {
		return
	}
	for _, key := range malformedBigIntParams(params) {
		ctx.EmitDiagnostic(diagnostics.CodeFMTInvalidParams, "bigint format param `"+key+"` is not a decimal integer")
	}
}
