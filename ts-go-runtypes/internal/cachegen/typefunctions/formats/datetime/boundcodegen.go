package datetime

import (
	"strconv"

	"github.com/mionkit/ts-runtypes/internal/cachegen/typefunctions/formats"
)

// boundcodegen.go emits the runtime min/max comparison for a validated
// date/time/dateTime/native-Date value. Absolute bounds are baked as a
// precomputed number on the runtime scale (epoch ms for date/dateTime/
// Date, ms-of-day for time); relative `now±P…` bounds emit a call to
// pf_relativeNowKey(spec, scale) so JS owns the calendar arithmetic at
// check time. The value side uses pf_dateStrToMs / pf_timeStrToMs to
// convert the string to the same scale; the native-Date emitter passes
// the Date's getTime() directly (see nativeDate.go) and so does NOT use
// these string converters.

// scaleFor returns the relativeNowKey scale arg for a bound kind. Date
// values are floored to UTC midnight (dateStrToMs), so a date relative
// bound must floor `now` to midnight too ('epochDate') — otherwise a
// value exactly "now-P1Y" (midnight) would fall below a bound that still
// carries the current time-of-day. dateTime keeps the full instant.
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

// boundExpr renders the JS expression a bound compares against: a baked
// number for an absolute literal, or pf_relativeNowKey(spec, scale) for
// a relative spec. ok=false when the bound is absent.
func boundExpr(ctx formats.EmitContext, params map[string]any, key string, kind boundKind, layout string) (string, bool) {
	bound, present := stringParam(params, key)
	if !present || bound == "" {
		return "", false
	}
	if _, isRelative, relErr := parseRelative(bound); isRelative {
		if relErr != "" {
			return "", false // already reported by ValidateParams
		}
		alias := pureFnAlias(ctx, "relativeNowKey")
		return alias + "(" + strconv.Quote(bound) + "," + scaleFor(kind) + ")", true
	}
	keyVal, ok := comparableLiteral(bound, kind, layout)
	if !ok {
		return "", false
	}
	return strconv.FormatInt(int64(keyVal), 10), true
}

// valueKeyExpr renders the JS expression converting the (validated)
// value string to the comparison scale. For time → ms-of-day; for date
// → UTC epoch ms; for dateTime → date epoch ms + time ms-of-day, split on
// splitChar, mirroring the Go-side dateTimeEpochMs bake (NOT Date.parse,
// which would interpret a 'T'-joined value in local time and diverge from
// the UTC-baked absolute bounds).
func valueKeyExpr(ctx formats.EmitContext, vλl string, kind boundKind, layout string) string {
	if kind == timeKind {
		alias := pureFnAlias(ctx, "timeStrToMs")
		return alias + "(" + vλl + "," + strconv.Quote(layout) + ")"
	}
	if kind == dateKind {
		alias := pureFnAlias(ctx, "dateStrToMs")
		return alias + "(" + vλl + "," + strconv.Quote(layout) + ")"
	}
	// dateTime — layout here is the splitChar; nested layouts default to
	// ISO for the comparison (the static bake uses the same default).
	dateAlias := pureFnAlias(ctx, "dateStrToMs")
	timeAlias := pureFnAlias(ctx, "timeStrToMs")
	split := strconv.Quote(layout)
	return "((dtp) => " + dateAlias + "(" + vλl + ".substring(0,dtp),'ISO') + " +
		timeAlias + "(" + vλl + ".substring(dtp+1),'ISO'))(" + vλl + ".indexOf(" + split + "))"
}

// boundOps is the ordered set of bound params and the operator the value
// must satisfy to PASS. min/max are inclusive (>= / <=); gt/lt are the
// exclusive twins (> / <), mirroring the numeric format family. Whatever
// bounds survive validation AND together — at most one lower (min XOR gt)
// and one upper (max XOR lt), since the same edge can't be both (rejected
// in ValidateParams).
var boundOps = []struct {
	key string
	op  string
}{
	{"min", ">="},
	{"max", "<="},
	{"gt", ">"},
	{"lt", "<"},
}

// boundValidateChecks returns the AND-able expression for the min/max/gt/lt
// comparisons, or "" when no bound is set. The value is converted once
// (cheap; the JS engine can CSE identical calls).
func boundValidateChecks(ctx formats.EmitContext, params map[string]any, vλl string, kind boundKind, layout string) string {
	return boundValidateChecksFromKey(ctx, params, valueKeyExpr(ctx, vλl, kind, layout), kind, layout)
}

// boundValidateChecksFromKey is boundValidateChecks with a caller-supplied
// value key expression — used by the native Date emitter, whose value key
// is the Date's getTime() rather than a parsed string.
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
