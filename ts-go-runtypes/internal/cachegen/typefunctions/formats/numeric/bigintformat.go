package numeric

import (
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// bigintFormatEmitter implements the format named "bigintFormat", FormatBigInt<P> in `@mionjs/run-types/formats`.
// Surface: min / max / lt / gt, multipleOf, emitted with bigint literals (`100n`).
// Its BinaryEncoder / BinaryDecoder pack the value into 8 bytes when min AND max both fit signed or unsigned
// 64-bit, and fall back to the base string serialization otherwise.
// There is deliberately NO float64 path and NO sub-8-byte path.
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

// EmitToBinary implements formats.BinaryEncoder; UInt64 takes precedence over Int64 when both fit.
func (bigintFormatEmitter) EmitToBinary(annotation *reflection.FormatAnnotation, vλl, ser string, _ formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	isInt64, isUint64 := bigIntType(annotation.Params)
	if isUint64 {
		return ser + ".view.setBigUint64(" + ser + ".index, " + vλl + ", 1, " + ser + ".index += 8)"
	}
	if isInt64 {
		return ser + ".view.setBigInt64(" + ser + ".index, " + vλl + ", 1, " + ser + ".index += 8)"
	}
	return ""
}

// EmitFromBinary implements formats.BinaryDecoder, byte-symmetric with EmitToBinary.
func (bigintFormatEmitter) EmitFromBinary(annotation *reflection.FormatAnnotation, des string, _ formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	isInt64, isUint64 := bigIntType(annotation.Params)
	if isUint64 {
		return des + ".view.getBigUint64(" + des + ".index, 1, " + des + ".index += 8)"
	}
	if isInt64 {
		return des + ".view.getBigInt64(" + des + ".index, 1, " + des + ".index += 8)"
	}
	return ""
}

// BinarySize implements formats.BinarySizer off the SAME bigIntType check EmitToBinary uses.
// The base string arm's width is value-dependent, so it gets no fixed hint.
func (bigintFormatEmitter) BinarySize(annotation *reflection.FormatAnnotation) formats.BinarySizeHint {
	if annotation == nil {
		return formats.BinarySizeHint{}
	}
	isInt64, isUint64 := bigIntType(annotation.Params)
	if isInt64 || isUint64 {
		return formats.BinarySizeHint{Fixed: 8}
	}
	return formats.BinarySizeHint{}
}

// bigIntType reports whether the bounds fit 64-bit; both min AND max must be set for either flag to be true.
func bigIntType(params map[string]any) (isBigInt64, isBigUint64 bool) {
	min, hasMin := readBigIntParam(params, "min")
	max, hasMax := readBigIntParam(params, "max")
	if !hasMin || !hasMax {
		return false, false
	}
	isBigInt64 = min.Cmp(bigInt64Min) >= 0 && max.Cmp(bigInt64Max) <= 0
	isBigUint64 = min.Cmp(bigUint64Min) >= 0 && max.Cmp(bigUint64Max) <= 0
	return isBigInt64, isBigUint64
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
