package datetime

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"strconv"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
)

// boundcodegen.go emits the runtime min/max comparison for a validated date/time/dateTime/native-Date value.
// Absolute bounds are baked as a number on the runtime scale (epoch ms, ms-of-day for time); relative `now±P…`
// bounds emit relativeNowKey(spec, scale) so JS owns the calendar arithmetic at check time.

// scaleFor returns the relativeNowKey scale arg for a bound kind.
// dateStrToMs floors a date value to UTC midnight, so a date relative bound floors `now` too ('epochDate'), or a
// value of exactly "now-P1Y" would fall below a bound still carrying the current time-of-day.
// dateTime keeps the full instant ('epoch').
func scaleFor(kind boundKind) string {
	switch kind {
	case timeKind:
		return "'timeOfDay'"
	case dateKind:
		return "'epochDate'"
	default:
		return "'epoch'"
	}
}

// boundExpr renders what a bound compares against: a baked number for an absolute literal, relativeNowKey(spec, scale) for a relative one.
func boundExpr(ctx formats.EmitContext, params map[string]any, key string, kind boundKind, layout string) (string, bool) {
	bound, present := stringParam(params, key)
	if !present || bound == "" {
		return "", false
	}
	if _, isRelative, relErr := parseRelative(bound); isRelative {
		if relErr != "" {
			return "", false // already reported by ValidateParams
		}
		alias := pureFnAlias(ctx, purefnids.RelativeNowKey)
		return alias + "(" + strconv.Quote(bound) + "," + scaleFor(kind) + ")", true
	}
	keyVal, ok := comparableLiteral(bound, kind, layout)
	if !ok {
		return "", false
	}
	return strconv.FormatInt(int64(keyVal), 10), true
}

// valueKeyExpr mirrors the Go-side dateTimeEpochMs bake, never Date.parse: that reads a 'T'-joined value as local time and would diverge from the UTC-baked bounds.
func valueKeyExpr(ctx formats.EmitContext, vλl string, kind boundKind, layout string) string {
	if kind == timeKind {
		alias := pureFnAlias(ctx, purefnids.TimeStrToMs)
		return alias + "(" + vλl + "," + strconv.Quote(layout) + ")"
	}
	if kind == dateKind {
		alias := pureFnAlias(ctx, purefnids.DateStrToMs)
		return alias + "(" + vλl + "," + strconv.Quote(layout) + ")"
	}
	// dateTime: layout here is the splitChar, and the static bake defaults the nested layouts to ISO too.
	dateAlias := pureFnAlias(ctx, purefnids.DateStrToMs)
	timeAlias := pureFnAlias(ctx, purefnids.TimeStrToMs)
	return "((dtp) => " + dateAlias + "(" + vλl + ".substring(0,dtp),'ISO') + " +
		timeAlias + "(" + vλl + ".substring(dtp+1),'ISO'))(" + splitSearch(vλl, layout) + ")"
}

// boundOps is the ordered set of bound params and the operator the value must satisfy to PASS; gt/lt are the
// exclusive twins of min/max, mirroring the numeric format family.
// Surviving bounds AND together, at most one per edge: validateMinMax rejects min with gt, and max with lt.
var boundOps = []struct {
	key string
	op  string
}{
	{"min", ">="},
	{"max", "<="},
	{"gt", ">"},
	{"lt", "<"},
}

// boundValidateChecks returns the AND-able expression for the min/max/gt/lt comparisons, "" when no bound is set.
func boundValidateChecks(ctx formats.EmitContext, params map[string]any, vλl string, kind boundKind, layout string) string {
	return boundValidateChecksFromKey(ctx, params, valueKeyExpr(ctx, vλl, kind, layout), kind, layout)
}

// boundValidateChecksFromKey is boundValidateChecks with a caller-supplied value key, for the native Date
// emitter whose key is the Date's getTime() rather than a parsed string.
func boundValidateChecksFromKey(ctx formats.EmitContext, params map[string]any, valueKey string, kind boundKind, layout string) string {
	var checks string
	for _, bound := range boundOps {
		expr, has := boundExpr(ctx, params, bound.key, kind, layout)
		if !has {
			continue
		}
		check := "(" + valueKey + " " + bound.op + " " + expr + ")"
		if checks == "" {
			checks = check
		} else {
			checks = checks + " && " + check
		}
	}
	return checks
}

// boundTypeErrorChecks emits error-push statements (one per failed bound),
// tagging formatPath ['min'] / ['max'] / ['gt'] / ['lt'].
func boundTypeErrorChecks(ctx formats.EmitContext, params map[string]any, vλl, pathExpr, errorsArr, fmtName string, kind boundKind, layout string) string {
	expected := "string"
	if kind == dateTimeKind && fmtName == "nativeDate" {
		expected = "Date"
	}
	return boundTypeErrorChecksFromKey(ctx, params, valueKeyExpr(ctx, vλl, kind, layout), pathExpr, errorsArr, expected, fmtName, kind, layout)
}

// boundTypeErrorChecksFromKey is boundTypeErrorChecks with a
// caller-supplied value key expression (native Date passes getTime()).
func boundTypeErrorChecksFromKey(ctx formats.EmitContext, params map[string]any, valueKey, pathExpr, errorsArr, expected, fmtName string, kind boundKind, layout string) string {
	var stmts string
	for _, bound := range boundOps {
		expr, has := boundExpr(ctx, params, bound.key, kind, layout)
		if !has {
			continue
		}
		boundVal, _ := stringParam(params, bound.key)
		stmt := "if (!(" + valueKey + " " + bound.op + " " + expr + ")) " +
			formats.FormatErrCall(pathExpr, errorsArr, expected, fmtName, bound.key, strconv.Quote(boundVal))
		if stmts == "" {
			stmts = stmt
		} else {
			stmts = stmts + ";" + stmt
		}
	}
	return stmts
}
