package datetime

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// dateTimeEmitter implements the format named "dateTime" —
// FormatStringDateTime<P>. Composes the date + time validators (split on
// `splitChar`, default 'T') and adds optional top-level min/max bounds
// (a dateTime bound may use both date and time duration components).
// Moved here from the string package.
type dateTimeEmitter struct{}

func init() {
	formats.Register(dateTimeEmitter{})
}

func (dateTimeEmitter) Name() string                    { return "dateTime" }
func (dateTimeEmitter) Kind() reflection.ReflectionKind { return reflection.KindString }

// splitSearch locates the date/time separator. A LETTER separator is matched
// case-insensitively: RFC 3339 allows `1963-06-19t08:30:06z` as readily as the
// upper-case spelling, and a plain indexOf would miss it. Anything else keeps
// the exact single-character search.
func splitSearch(vλl, splitChar string) string {
	lower := strings.ToLower(splitChar)
	upper := strings.ToUpper(splitChar)
	if lower == upper {
		return vλl + ".indexOf(" + strconv.Quote(splitChar) + ")"
	}
	return vλl + ".search(/[" + upper + lower + "]/)"
}

// dateTimeParts resolves the date pure-fn, time pure-fn, and split char.
func dateTimeParts(params map[string]any) (dateFn, timeFn, splitChar string, ok bool) {
	splitChar = "T"
	if raw, present := params["splitChar"]; present {
		if value, isString := raw.(string); isString && value != "" {
			splitChar = value
		}
	}
	dateFormat := nestedFormat(params, "date", "ISO")
	timeFormat := nestedFormat(params, "time", "ISO")
	dateFn, dok := dateFormatPureFn(dateFormat)
	timeFn, tok := timeFormatPureFn(timeFormat)
	if !dok || !tok {
		return "", "", "", false
	}
	return dateFn, timeFn, splitChar, true
}

// nestedFormat reads params[key].format, defaulting to `fallback`.
func nestedFormat(params map[string]any, key, fallback string) string {
	raw, ok := params[key]
	if !ok {
		return fallback
	}
	nested, ok := raw.(map[string]any)
	if !ok {
		return fallback
	}
	value, ok := nested["format"]
	if !ok {
		return fallback
	}
	if str, isString := value.(string); isString {
		return str
	}
	return fallback
}

// ValidateParams checks the nested date/time layouts resolve and
// validates the optional top-level min/max bounds (dateTimeKind: both
// component groups allowed). The splitChar is the layout key for the
// best-effort static bound parse.
func (dateTimeEmitter) ValidateParams(annotation *reflection.FormatAnnotation) []string {
	if annotation == nil {
		return nil
	}
	_, _, splitChar, ok := dateTimeParts(annotation.Params)
	if !ok {
		return []string{"FormatStringDateTime: unknown date or time `format`"}
	}
	return validateMinMax(annotation.Params, dateTimeKind, splitChar)
}

func (dateTimeEmitter) EmitValidateCheck(annotation *reflection.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	dateFn, timeFn, splitChar, ok := dateTimeParts(annotation.Params)
	if !ok {
		return ""
	}
	dateAlias := pureFnAlias(ctx, dateFn)
	timeAlias := pureFnAlias(ctx, timeFn)
	// IIFE: bind the split position once, bail on -1, then AND the two
	// sub-validators over the substrings.
	structural := "((dtp) => dtp !== -1 && " +
		dateAlias + "(" + vλl + ".substring(0,dtp)) && " +
		timeAlias + "(" + vλl + ".substring(dtp+1)))(" + splitSearch(vλl, splitChar) + ")"
	if bounds := boundValidateChecks(ctx, annotation.Params, vλl, dateTimeKind, splitChar); bounds != "" {
		return "(" + structural + " && " + bounds + ")"
	}
	return structural
}

func (dateTimeEmitter) EmitValidationErrorsCheck(annotation *reflection.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	dateFn, timeFn, splitChar, ok := dateTimeParts(annotation.Params)
	if !ok {
		return ""
	}
	dateAlias := pureFnAlias(ctx, dateFn)
	timeAlias := pureFnAlias(ctx, timeFn)
	split := strconv.Quote(splitChar)
	errFor := func(paramName string) string {
		return formats.FormatErrCall(pathExpr, errorsArr, "string", "dateTime", paramName, split)
	}
	stmt := "const dtSplit=" + vλl + ".indexOf(" + split + ");" +
		"if (dtSplit===-1) " + errFor("splitChar") + ";" +
		"else {" +
		"if (!(" + dateAlias + "(" + vλl + ".substring(0,dtSplit)))) " + errFor("date") + ";" +
		"if (!(" + timeAlias + "(" + vλl + ".substring(dtSplit+1)))) " + errFor("time") + ";" +
		"}"
	if bounds := boundTypeErrorChecks(ctx, annotation.Params, vλl, pathExpr, errorsArr, "dateTime", dateTimeKind, splitChar); bounds != "" {
		stmt = stmt + ";" + bounds
	}
	return stmt
}
