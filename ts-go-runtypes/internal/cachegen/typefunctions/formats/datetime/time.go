package datetime

import (
	"strconv"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// timeEmitter implements the format named "time" — FormatStringTime<P>.
// The `format` param selects one of eight time-parsing pure fns; min/max
// bounds compare ms-of-day. Moved here from the string package.
type timeEmitter struct{}

func init() {
	formats.Register(timeEmitter{})
}

func (timeEmitter) Name() string                    { return "time" }
func (timeEmitter) Kind() reflection.ReflectionKind { return reflection.KindString }

// timeFormatPureFn maps a `format` param value to its validating pure fn.
func timeFormatPureFn(format string) (string, bool) {
	switch format {
	case "ISO", "HH:mm:ss[.mmm]TZ":
		return "isTimeString_ISO_TZ", true
	case "HH:mm:ss[.mmm]":
		return "isTimeString_ISO", true
	case "HH:mm:ss":
		return "isTimeString_HHmmss", true
	case "HH:mm":
		return "isTimeString_HHmm", true
	case "mm:ss":
		return "isTimeString_mmss", true
	case "HH":
		return "isHours", true
	case "mm":
		return "isMinutes", true
	case "ss":
		return "isSeconds", true
	}
	return "", false
}

// ValidateParams checks the `format` layout is supported and validates
// the optional min/max bounds (absolute literal in the layout, or a
// relative `now±P…` using only time components).
func (timeEmitter) ValidateParams(annotation *reflection.FormatAnnotation) []string {
	if annotation == nil {
		return nil
	}
	format, ok := readFormat(annotation.Params)
	if !ok {
		return []string{"FormatStringTime: `format` must be a string"}
	}
	if _, known := timeFormatPureFn(format); !known {
		return []string{"FormatStringTime: unknown `format` " + strconv.Quote(format)}
	}
	return validateMinMax(annotation.Params, timeKind, format)
}

func (timeEmitter) EmitValidateCheck(annotation *reflection.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	format, ok := readFormat(annotation.Params)
	if !ok {
		return ""
	}
	fnName, ok := timeFormatPureFn(format)
	if !ok {
		return ""
	}
	alias := pureFnAlias(ctx, fnName)
	check := alias + "(" + vλl + ")"
	if bounds := boundValidateChecks(ctx, annotation.Params, vλl, timeKind, format); bounds != "" {
		check = check + " && " + bounds
	}
	return check
}

func (timeEmitter) EmitValidationErrorsCheck(annotation *reflection.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	format, ok := readFormat(annotation.Params)
	if !ok {
		return ""
	}
	fnName, ok := timeFormatPureFn(format)
	if !ok {
		return ""
	}
	alias := pureFnAlias(ctx, fnName)
	call := alias + "(" + vλl + ")"
	stmt := "if (!(" + call + ")) " +
		formats.FormatErrCall(pathExpr, errorsArr, "string", "time", "format", strconv.Quote(format))
	if bounds := boundTypeErrorChecks(ctx, annotation.Params, vλl, pathExpr, errorsArr, "time", timeKind, format); bounds != "" {
		stmt = stmt + ";" + bounds
	}
	return stmt
}
