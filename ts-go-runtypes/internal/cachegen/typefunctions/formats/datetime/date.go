package datetime

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"strconv"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// dateEmitter implements the format named "date", FormatStringDate<P>: the `format` param selects one of six
// date-parsing pure fns, and the optional min/max bounds compare against a baked epoch-ms or relativeNowKey.
type dateEmitter struct{}

func init() {
	formats.Register(dateEmitter{})
}

func (dateEmitter) Name() string                    { return "date" }
func (dateEmitter) Kind() reflection.ReflectionKind { return reflection.KindString }

// dateFormatPureFn maps a `format` param value to the id of the pure fn that validates it.
func dateFormatPureFn(format string) (string, bool) {
	switch format {
	case "ISO", "YYYY-MM-DD":
		return purefnids.IsDateStringYMD, true
	case "DD-MM-YYYY":
		return purefnids.IsDateStringDMY, true
	case "MM-DD-YYYY":
		return purefnids.IsDateStringMDY, true
	case "YYYY-MM":
		return purefnids.IsDateStringYM, true
	case "MM-DD":
		return purefnids.IsDateStringMD, true
	case "DD-MM":
		return purefnids.IsDateStringDM, true
	}
	return "", false
}

// readFormat extracts the `format` string param, defaulting to "ISO" when absent; false only when non-string.
func readFormat(params map[string]any) (string, bool) {
	raw, ok := params["format"]
	if !ok {
		return "ISO", true
	}
	if value, isString := raw.(string); isString {
		return value, true
	}
	return "", false
}

// ValidateParams checks the `format` layout is supported and validates the min/max bounds, a relative one using
// only date components. Surfaced as CodeFMTInvalidParams.
func (dateEmitter) ValidateParams(annotation *reflection.FormatAnnotation) []string {
	if annotation == nil {
		return nil
	}
	format, ok := readFormat(annotation.Params)
	if !ok {
		return []string{"FormatStringDate: `format` must be a string"}
	}
	if _, known := dateFormatPureFn(format); !known {
		return []string{"FormatStringDate: unknown `format` " + strconv.Quote(format)}
	}
	return validateMinMax(annotation.Params, dateKind, format)
}

func (dateEmitter) EmitValidateCheck(annotation *reflection.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	format, ok := readFormat(annotation.Params)
	if !ok {
		return ""
	}
	fnID, ok := dateFormatPureFn(format)
	if !ok {
		return ""
	}
	alias := pureFnAlias(ctx, fnID)
	check := alias + "(" + vλl + ")"
	if bounds := boundValidateChecks(ctx, annotation.Params, vλl, dateKind, format); bounds != "" {
		check = check + " && " + bounds
	}
	return check
}

func (dateEmitter) EmitValidationErrorsCheck(annotation *reflection.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	format, ok := readFormat(annotation.Params)
	if !ok {
		return ""
	}
	fnID, ok := dateFormatPureFn(format)
	if !ok {
		return ""
	}
	alias := pureFnAlias(ctx, fnID)
	call := alias + "(" + vλl + ")"
	stmt := "if (!(" + call + ")) " +
		formats.FormatErrCall(pathExpr, errorsArr, "string", "date", "format", strconv.Quote(format))
	if bounds := boundTypeErrorChecks(ctx, annotation.Params, vλl, pathExpr, errorsArr, "date", dateKind, format); bounds != "" {
		stmt = stmt + ";" + bounds
	}
	return stmt
}
