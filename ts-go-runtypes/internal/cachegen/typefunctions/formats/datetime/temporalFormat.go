package datetime

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// temporalFormatEmitter implements the FormatTemporalX<{min,max}> family —
// min/max bound constraints over the orderable builtin Temporal types (every
// type with a static `compare` except Duration, a length). ONE emitter is
// registered per orderable type (init below), each carrying its
// reflection.TemporalInfo so it knows its qualified constructor
// (`Temporal.PlainDate`), its `Temporal.Now.*` accessor, and which duration
// components a relative `now±P` bound may use.
//
// Unlike the string date/time formats — which had to invent a numeric key
// scale because `Date` only compares via getTime() — every orderable Temporal
// type has a uniform static `compare`, so a bound check is simply
// `Temporal.X.compare(v, bound) >= 0` (min) / `<= 0` (max). The bound is an
// absolute Temporal literal (`Temporal.X.from('…')`, validated at runtime by
// from()) or a relative `now±P…` evaluated against `Temporal.Now.*` +
// `Temporal.Duration.from`.
type temporalFormatEmitter struct {
	info reflection.TemporalInfo
}

func init() {
	for _, info := range reflection.OrderableTemporalInfos() {
		formats.Register(temporalFormatEmitter{info: info})
	}
}

func (e temporalFormatEmitter) Name() string                    { return e.info.FormatName }
func (e temporalFormatEmitter) Kind() reflection.ReflectionKind { return reflection.KindClass }

// relBoundKind maps the registry's RelComponentKind string to the shared
// boundKind so relative bounds reuse the string-date component restriction.
func (e temporalFormatEmitter) relBoundKind() boundKind {
	switch e.info.RelComponentKind {
	case "time":
		return timeKind
	case "dateTime":
		return dateTimeKind
	default:
		return dateKind
	}
}

// ValidateParams validates the relative `now±P…` bounds: grammar + the
// per-type duration-component restriction (e.g. an Instant bound may only use
// time components — calendar units throw in `.add()` at runtime; a PlainDate
// bound only date components). Absolute literals are NOT parsed here —
// Temporal's grammar is rich (tz + calendar annotations) and
// `Temporal.X.from(...)` validates them when the cache module loads, throwing
// loudly on a malformed literal.
func (e temporalFormatEmitter) ValidateParams(annotation *reflection.FormatAnnotation) []string {
	if annotation == nil {
		return nil
	}
	var errs []string
	for _, key := range []string{"min", "max", "gt", "lt"} {
		bound, ok := stringParam(annotation.Params, key)
		if !ok || bound == "" {
			continue
		}
		parsed, isRelative, relErr := parseRelative(bound)
		if !isRelative {
			continue // absolute literal — validated at runtime by from()
		}
		if relErr != "" {
			errs = append(errs, "Format"+temporalTitle(e.info)+": `"+key+"` "+strconv.Quote(bound)+
				" is not a valid relative bound — "+relErr)
			continue
		}
		errs = append(errs, restrictComponents(parsed, key, e.relBoundKind())...)
	}
	// A bound edge is inclusive (`min`/`max`) OR exclusive (`gt`/`lt`),
	// never both — same rule as the string-date + number/bigint families.
	if hasBound(annotation.Params, "min") && hasBound(annotation.Params, "gt") {
		errs = append(errs, "Format"+temporalTitle(e.info)+": cannot specify both `min` and `gt` (a lower bound is inclusive or exclusive, not both)")
	}
	if hasBound(annotation.Params, "max") && hasBound(annotation.Params, "lt") {
		errs = append(errs, "Format"+temporalTitle(e.info)+": cannot specify both `max` and `lt` (an upper bound is inclusive or exclusive, not both)")
	}
	return errs
}

// temporalBoundOps maps each bound param to the sign the static `compare`
// result must satisfy to PASS: min `>= 0`, max `<= 0`, gt `> 0`, lt `< 0`.
// Surviving bounds AND together — at most one lower (min XOR gt) and one
// upper (max XOR lt); the same edge can't be both (see ValidateParams).
var temporalBoundOps = []struct {
	key string
	op  string
}{
	{"min", ">="},
	{"max", "<="},
	{"gt", ">"},
	{"lt", "<"},
}

// temporalTitle renders the user-facing format name for diagnostics, e.g.
// "TemporalPlainDate".
func temporalTitle(info reflection.TemporalInfo) string {
	return "Temporal" + info.Name
}

// temporalBoundExpr renders the JS expression a bound compares against: an
// absolute `Temporal.X.from('lit')` or a relative
// `Temporal.Now.X()[.add|.subtract](Temporal.Duration.from('P…'))`.
func (e temporalFormatEmitter) temporalBoundExpr(bound string) string {
	if !strings.HasPrefix(bound, "now") {
		return e.info.Builtin + ".from(" + strconv.Quote(bound) + ")"
	}
	rest := bound[len("now"):]
	if rest == "" {
		return e.info.NowExpr // bare `now`
	}
	op := "add"
	if rest[0] == '-' {
		op = "subtract"
	}
	duration := rest[1:]
	return e.info.NowExpr + "." + op + "(Temporal.Duration.from(" + strconv.Quote(duration) + "))"
}

// boundCompare builds `Temporal.X.compare(v, <bound>) <op> 0`.
func (e temporalFormatEmitter) boundCompare(vλl, bound, op string) string {
	return e.info.Builtin + ".compare(" + vλl + ", " + e.temporalBoundExpr(bound) + ") " + op + " 0"
}

func (e temporalFormatEmitter) EmitValidateCheck(annotation *reflection.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	var checks []string
	for _, bound := range temporalBoundOps {
		if value, ok := stringParam(annotation.Params, bound.key); ok && value != "" {
			checks = append(checks, "("+e.boundCompare(vλl, value, bound.op)+")")
		}
	}
	return strings.Join(checks, " && ")
}

func (e temporalFormatEmitter) EmitValidationErrorsCheck(annotation *reflection.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	var stmts []string
	for _, bound := range temporalBoundOps {
		if value, ok := stringParam(annotation.Params, bound.key); ok && value != "" {
			stmts = append(stmts, "if (!("+e.boundCompare(vλl, value, bound.op)+")) "+
				formats.FormatErrCall(pathExpr, errorsArr, e.info.Builtin, e.info.FormatName, bound.key, strconv.Quote(value)))
		}
	}
	return strings.Join(stmts, ";")
}
