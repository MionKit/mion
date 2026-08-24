package resolver_test

import (
	"strings"
	"testing"

	_ "github.com/mionkit/ts-runtypes/internal/cachegen/typefunctions/formats/all"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// temporal_format_test.go covers the FormatTemporalX<{min,max}> family: the
// brand lifts off `Temporal.X & {brand}` onto a KindClass node carrying both
// the Temporal SubKind AND the FormatAnnotation; the emitter validates
// relative bounds (per-type component restriction) and emits compare() checks.

// scanTemporalFormat builds getRunTypeId<TypeFormat<Temporal.<typ>, fmt, P>>()
// and returns the validate source + FMT002 diagnostics.
func scanTemporalFormat(t *testing.T, typ, formatName, params string) (string, []diagnostics.Diagnostic) {
	t.Helper()
	code := `import {createValidateFn} from '@ts-runtypes/core';
` + typeFormatBrandDecl + `
export const _ = createValidateFn<TypeFormat<Temporal.` + typ + `, '` + formatName + `', ` + params + `>>();
`
	r := setupInline(t, map[string]string{"a.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"a.ts"},
		IncludeEntryModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	var diags []diagnostics.Diagnostic
	for _, d := range resp.Diagnostics {
		if d.Code == diagnostics.CodeFMTInvalidParams {
			diags = append(diags, d)
		}
	}
	return familyEntrySources(resp, "validate"), diags
}

func TestTemporalFormat_EmitsCompareCheck(t *testing.T) {
	src, diags := scanTemporalFormat(t, "PlainDate", "temporalPlainDate", `{min: '2020-01-01'; max: '2020-12-31'}`)
	if len(diags) != 0 {
		t.Fatalf("valid bounds diagnosed: %+v", diags)
	}
	if !strings.Contains(src, "Temporal.PlainDate.compare(") {
		t.Fatalf("expected compare() in validate, got:\n%s", src)
	}
	// strconv.Quote emits double quotes.
	if !strings.Contains(src, `Temporal.PlainDate.from("2020-01-01")`) {
		t.Fatalf("expected absolute bound from(), got:\n%s", src)
	}
	if !strings.Contains(src, "instanceof Temporal.PlainDate") {
		t.Fatalf("expected base instanceof, got:\n%s", src)
	}
}

// TestTemporalFormat_EmitsExclusiveCompareCheck locks the exclusive bounds:
// gt compares `> 0` and lt compares `< 0` (vs `>= 0`/`<= 0` for min/max).
func TestTemporalFormat_EmitsExclusiveCompareCheck(t *testing.T) {
	src, diags := scanTemporalFormat(t, "PlainDate", "temporalPlainDate", `{gt: '2020-01-01'; lt: '2020-12-31'}`)
	if len(diags) != 0 {
		t.Fatalf("valid bounds diagnosed: %+v", diags)
	}
	if !strings.Contains(src, `Temporal.PlainDate.from("2020-01-01")) > 0`) {
		t.Fatalf("expected exclusive `> 0` for gt, got:\n%s", src)
	}
	if !strings.Contains(src, `Temporal.PlainDate.from("2020-12-31")) < 0`) {
		t.Fatalf("expected exclusive `< 0` for lt, got:\n%s", src)
	}
}

func TestTemporalFormat_RelativeBoundEmitsNow(t *testing.T) {
	src, diags := scanTemporalFormat(t, "PlainDate", "temporalPlainDate", `{min: 'now-P1Y'}`)
	if len(diags) != 0 {
		t.Fatalf("valid relative bound diagnosed: %+v", diags)
	}
	if !strings.Contains(src, "Temporal.Now.plainDateISO()") || !strings.Contains(src, `.subtract(Temporal.Duration.from("P1Y"))`) {
		t.Fatalf("expected Now+subtract(Duration), got:\n%s", src)
	}
}

func TestTemporalFormat_ParamValidation(t *testing.T) {
	cases := []struct {
		name        string
		typ         string
		formatName  string
		params      string
		wantErr     bool
		msgContains string
	}{
		// PlainDate: date components only.
		{"date relative date ok", "PlainDate", "temporalPlainDate", `{min: 'now-P1Y'}`, false, ""},
		{"date relative time rejected", "PlainDate", "temporalPlainDate", `{min: 'now+PT1H'}`, true, "time components"},
		{"date bare now ok", "PlainDate", "temporalPlainDate", `{max: 'now'}`, false, ""},
		// Instant: time components only (calendar units throw at runtime).
		{"instant relative time ok", "Instant", "temporalInstant", `{min: 'now-PT1H'}`, false, ""},
		{"instant relative date rejected", "Instant", "temporalInstant", `{min: 'now+P1D'}`, true, "date components"},
		// PlainTime: time only.
		{"time relative date rejected", "PlainTime", "temporalPlainTime", `{max: 'now+P1D'}`, true, "date components"},
		// PlainDateTime: both allowed.
		{"datetime relative both ok", "PlainDateTime", "temporalPlainDateTime", `{min: 'now-P1DT2H'}`, false, ""},
		// malformed duration.
		{"malformed duration", "PlainDate", "temporalPlainDate", `{min: 'now+P'}`, true, "valid relative"},
		// absolute literal: not validated Go-side (runtime from()).
		{"absolute not diagnosed", "PlainDate", "temporalPlainDate", `{min: 'whatever-runtime-checks'}`, false, ""},
		// exclusive bounds gt/lt: same per-type component restriction as min/max.
		{"gt/lt relative ok", "PlainDate", "temporalPlainDate", `{gt: 'now-P1Y'; lt: 'now+P1Y'}`, false, ""},
		{"lt relative time rejected on date", "PlainDate", "temporalPlainDate", `{lt: 'now+PT1H'}`, true, "time components"},
		{"instant gt relative date rejected", "Instant", "temporalInstant", `{gt: 'now+P1D'}`, true, "date components"},
		// inclusive⊕exclusive: a bound edge is one or the other.
		{"min + gt rejected", "PlainDate", "temporalPlainDate", `{min: '2020-01-01'; gt: '2020-02-01'}`, true, "both `min` and `gt`"},
		{"max + lt rejected", "PlainDate", "temporalPlainDate", `{max: '2020-12-01'; lt: '2020-11-01'}`, true, "both `max` and `lt`"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, diags := scanTemporalFormat(t, tc.typ, tc.formatName, tc.params)
			if (len(diags) > 0) != tc.wantErr {
				t.Fatalf("params %s: got %+v wantErr %v", tc.params, diags, tc.wantErr)
			}
			if tc.wantErr && tc.msgContains != "" {
				found := false
				for _, d := range diags {
					if len(d.Args) > 0 && strings.Contains(d.Args[0], tc.msgContains) {
						found = true
					}
				}
				if !found {
					t.Fatalf("expected message containing %q, got %+v", tc.msgContains, diags)
				}
			}
		})
	}
}
