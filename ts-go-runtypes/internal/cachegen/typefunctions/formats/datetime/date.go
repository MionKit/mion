package datetime

import (
	"strconv"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// dateEmitter implements the format named "date" — FormatStringDate<P>.
// The `format` param selects one of six date-parsing pure fns
// (pf_isDateString_YMD / _DMY / _MDY / _YM / _MD / _DM); optional
// min/max bounds AND a comparison against a baked epoch-ms (absolute) or
// pf_relativeNowKey (relative) value. Moved here from the string
// package so it can share bounds.go / literals.go with the time,
// dateTime and native-Date emitters.
type dateEmitter struct{}

func init() {
	formats.Register(dateEmitter{})
}

func (dateEmitter) Name() string                    { return "date" }
func (dateEmitter) Kind() reflection.ReflectionKind { return reflection.KindString }

// dateFormatPureFn maps a `format` param value to the validating pure-fn
// name. Returns ("", false) for an unrecognised format.
func dateFormatPureFn(format string) (string, bool) {
	switch format {
	case "ISO", "YYYY-MM-DD":
		return "isDateString_YMD", true
	case "DD-MM-YYYY":
		return "isDateString_DMY", true
	case "MM-DD-YYYY":
		return "isDateString_MDY", true
	case "YYYY-MM":
		return "isDateString_YM", true
	case "MM-DD":
		return "isDateString_MD", true
	case "DD-MM":
		return "isDateString_DM", true
	}
	return "", false
}

// readFormat extracts the `format` string param, defaulting to "ISO"
// when absent. Returns ("", false) only when present but non-string.
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

// ValidateParams checks the `format` layout is supported and validates
// the optional min/max bounds (absolute literal in the layout, or a
// relative `now±P…` using only date components; min<=max when both
// absolute). Surfaced as CodeFMTInvalidParams.
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
	fnName, ok := dateFormatPureFn(format)
	if !ok {
		return ""
	}
	alias := pureFnAlias(ctx, fnName)
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
	fnName, ok := dateFormatPureFn(format)
	if !ok {
		return ""
	}
	alias := pureFnAlias(ctx, fnName)
	call := alias + "(" + vλl + ")"
	stmt := "if (!(" + call + ")) " +
		formats.FormatErrCall(pathExpr, errorsArr, "string", "date", "format", strconv.Quote(format))
	if bounds := boundTypeErrorChecks(ctx, annotation.Params, vλl, pathExpr, errorsArr, "date", dateKind, format); bounds != "" {
		stmt = stmt + ";" + bounds
	}
	return stmt
}
