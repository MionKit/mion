package resolver_test

import (
	"strings"
	"testing"

	_ "github.com/mionkit/ts-runtypes/internal/cachegen/typefunctions/formats/all"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
)

// datetime_bound_validation_test.go is the ESSENTIAL acceptance suite for
// the date/time min/max bounds feature: it proves the SAME-FORMAT rule is
// enforced (a date format rejects time duration components and vice-versa,
// and absolute literals must parse in the field's own layout), that
// malformed durations/literals are rejected, that min>max is caught, and
// — critically — that VALID bounds emit no diagnostic. The Go binary owns
// param validation, so this is where the matrix lives.

// boundCase drives one row of the matrix.
type boundCase struct {
	name        string
	format      string // the format literal, e.g. "date", "time", "dateTime"
	params      string // the inline params object after the format name
	wantErr     bool   // expect at least one FMT002
	msgContains string // when wantErr, a substring the message should contain
}

// scanBoundCase builds a getRunTypeId<TypeFormat<string, format, params>>()
// snippet and returns the FMT002 diagnostics.
func scanBoundCase(t *testing.T, format, params string) []diagnostics.Diagnostic {
	t.Helper()
	code := `import {createValidateFn} from '@ts-runtypes/core';
` + typeFormatBrandDecl + `
export const _ = createValidateFn<TypeFormat<string, '` + format + `', ` + params + `>>();
`
	return scanForFormatParamDiagnostics(t, code)
}

func TestDateTimeBounds_Matrix(t *testing.T) {
	cases := []boundCase{
		// ── date: time components rejected in relative bounds ──
		{"date_rel_time_component_min", "date", `{format: 'YYYY-MM-DD'; min: 'now+PT1H'}`, true, "time components"},
		{"date_rel_time_component_max", "date", `{format: 'YYYY-MM-DD'; max: 'now-PT30M'}`, true, "time components"},
		{"date_rel_mixed_T_section", "date", `{format: 'YYYY-MM-DD'; min: 'now+P1DT5M'}`, true, "time components"},
		// ── date: valid relative (date components only) ──
		{"date_rel_date_components_ok", "date", `{format: 'YYYY-MM-DD'; min: 'now-P1Y'; max: 'now+P2M10D'}`, false, ""},
		{"date_rel_bare_now_ok", "date", `{format: 'YYYY-MM-DD'; max: 'now'}`, false, ""},
		// ── date: absolute literal must match layout ──
		{"date_abs_ok", "date", `{format: 'YYYY-MM-DD'; min: '2020-01-01'}`, false, ""},
		{"date_abs_wrong_layout", "date", `{format: 'YYYY-MM-DD'; min: '08:30'}`, true, "valid"},
		{"date_abs_datetime_literal", "date", `{format: 'YYYY-MM-DD'; min: '2020-01-01T00:00'}`, true, "valid"},
		{"date_abs_bad_calendar", "date", `{format: 'YYYY-MM-DD'; min: '2020-13-01'}`, true, "valid"},
		{"date_abs_dmy_ok", "date", `{format: 'DD-MM-YYYY'; min: '01-01-2020'}`, false, ""},
		// ── date: min > max ──
		{"date_min_gt_max", "date", `{format: 'YYYY-MM-DD'; min: '2020-06-01'; max: '2020-01-01'}`, true, "greater than"},
		{"date_min_lt_max_ok", "date", `{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-06-01'}`, false, ""},

		// ── time: date components rejected in relative bounds ──
		{"time_rel_date_component_max", "time", `{format: 'HH:mm'; max: 'now+P1D'}`, true, "date components"},
		{"time_rel_date_component_year", "time", `{format: 'HH:mm'; min: 'now-P1Y'}`, true, "date components"},
		// ── time: valid relative (time components only) ──
		{"time_rel_time_components_ok", "time", `{format: 'HH:mm:ss'; min: 'now-PT1H'; max: 'now+PT30M'}`, false, ""},
		{"time_rel_bare_now_ok", "time", `{format: 'HH:mm'; min: 'now'}`, false, ""},
		// ── time: absolute literal must match layout ──
		{"time_abs_ok", "time", `{format: 'HH:mm'; min: '08:30'}`, false, ""},
		{"time_abs_date_literal", "time", `{format: 'HH:mm'; min: '2020-01-01'}`, true, "valid"},
		{"time_abs_bad_clock", "time", `{format: 'HH:mm'; min: '25:00'}`, true, "valid"},
		{"time_min_gt_max", "time", `{format: 'HH:mm'; min: '18:00'; max: '06:00'}`, true, "greater than"},

		// ── dateTime: BOTH component kinds accepted (positive control) ──
		{"datetime_rel_both_ok", "dateTime", `{date: {format: 'YYYY-MM-DD'}; time: {format: 'HH:mm'}; min: 'now-P1DT2H'}`, false, ""},
		{"datetime_abs_ok", "dateTime", `{date: {format: 'YYYY-MM-DD'}; time: {format: 'HH:mm:ss'}; min: '2020-01-01T08:30:00'}`, false, ""},

		// ── malformed durations ──
		{"rel_missing_P", "date", `{format: 'YYYY-MM-DD'; min: 'now+1Y'}`, true, "valid relative"},
		{"rel_no_sign", "date", `{format: 'YYYY-MM-DD'; min: 'nowP1Y'}`, true, "valid relative"},
		{"rel_empty_P", "date", `{format: 'YYYY-MM-DD'; min: 'now+P'}`, true, "valid relative"},

		// ── exclusive bounds gt/lt: same validation surface as min/max ──
		{"date_gt_lt_ok", "date", `{format: 'YYYY-MM-DD'; gt: '2020-01-01'; lt: '2020-12-31'}`, false, ""},
		{"date_gt_gt_lt", "date", `{format: 'YYYY-MM-DD'; gt: '2020-06-01'; lt: '2020-01-01'}`, true, "greater than"},
		{"date_min_gt_lt", "date", `{format: 'YYYY-MM-DD'; min: '2020-06-01'; lt: '2020-01-01'}`, true, "greater than"},
		{"date_gt_gt_max", "date", `{format: 'YYYY-MM-DD'; gt: '2020-06-01'; max: '2020-01-01'}`, true, "greater than"},
		// inclusive⊕exclusive: a lower (or upper) edge is one or the other.
		{"date_min_and_gt_rejected", "date", `{format: 'YYYY-MM-DD'; min: '2020-01-01'; gt: '2020-02-01'}`, true, "both `min` and `gt`"},
		{"date_max_and_lt_rejected", "date", `{format: 'YYYY-MM-DD'; max: '2020-12-01'; lt: '2020-11-01'}`, true, "both `max` and `lt`"},
		{"date_min_lt_distinct_ok", "date", `{format: 'YYYY-MM-DD'; min: '2020-01-01'; lt: '2020-11-01'}`, false, ""},
		{"date_gt_max_distinct_ok", "date", `{format: 'YYYY-MM-DD'; gt: '2020-02-01'; max: '2020-12-01'}`, false, ""},
		{"date_gt_wrong_layout", "date", `{format: 'YYYY-MM-DD'; gt: '08:30'}`, true, "valid"},
		{"date_gt_rel_date_ok", "date", `{format: 'YYYY-MM-DD'; gt: 'now-P1Y'}`, false, ""},
		{"date_lt_rel_time_rejected", "date", `{format: 'YYYY-MM-DD'; lt: 'now+PT1H'}`, true, "time components"},
		{"time_gt_lt_ok", "time", `{format: 'HH:mm'; gt: '08:00'; lt: '17:00'}`, false, ""},
		{"time_lt_rel_date_rejected", "time", `{format: 'HH:mm'; lt: 'now+P1D'}`, true, "date components"},
		{"datetime_gt_lt_ok", "dateTime", `{date: {format: 'YYYY-MM-DD'}; time: {format: 'HH:mm'}; gt: '2020-01-01T08:00'; lt: '2020-12-31T17:00'}`, false, ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			diags := scanBoundCase(t, tc.format, tc.params)
			if tc.wantErr {
				if len(diags) == 0 {
					t.Fatalf("expected an %s diagnostic, got none", diagnostics.CodeFMTInvalidParams)
				}
				if tc.msgContains != "" {
					found := false
					for _, d := range diags {
						if len(d.Args) > 0 && strings.Contains(d.Args[0], tc.msgContains) {
							found = true
							break
						}
					}
					if !found {
						t.Fatalf("expected a message containing %q, got %+v", tc.msgContains, diagArgs(diags))
					}
				}
			} else if len(diags) != 0 {
				t.Fatalf("expected NO diagnostic, got %+v", diagArgs(diags))
			}
		})
	}
}

func diagArgs(diags []diagnostics.Diagnostic) []string {
	var out []string
	for _, d := range diags {
		if len(d.Args) > 0 {
			out = append(out, d.Args[0])
		}
	}
	return out
}
