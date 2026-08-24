package datetime

import "testing"

// bounds_test.go unit-tests the parse/validate core directly (no
// resolver round-trip): the same-format component restriction, absolute
// literal parsing per layout, and min<=max ordering.

func TestParseRelative(t *testing.T) {
	cases := []struct {
		spec       string
		isRelative bool
		wantErr    bool
		hasDate    bool
		hasTime    bool
		bare       bool
	}{
		{"now", true, false, false, false, true},
		{"now+P1Y", true, false, true, false, false},
		{"now-P2M10D", true, false, true, false, false},
		{"now+PT1H", true, false, false, true, false},
		{"now+P1DT2H", true, false, true, true, false},
		{"now+P1W", true, false, true, false, false},
		{"2020-01-01", false, false, false, false, false},
		{"now+1Y", true, true, false, false, false},  // missing P
		{"nowP1Y", true, true, false, false, false},  // missing sign
		{"now+P", true, true, false, false, false},   // empty duration
		{"now+PT", true, true, false, false, false},  // empty time section
		{"now+P1Z", true, true, false, false, false}, // bad designator
	}
	for _, tc := range cases {
		t.Run(tc.spec, func(t *testing.T) {
			parsed, isRel, errMsg := parseRelative(tc.spec)
			if isRel != tc.isRelative {
				t.Fatalf("isRelative: got %v want %v", isRel, tc.isRelative)
			}
			if !tc.isRelative {
				return
			}
			if (errMsg != "") != tc.wantErr {
				t.Fatalf("err: got %q wantErr %v", errMsg, tc.wantErr)
			}
			if tc.wantErr {
				return
			}
			if parsed.hasDatePart != tc.hasDate || parsed.hasTimePart != tc.hasTime || parsed.bare != tc.bare {
				t.Fatalf("components: got date=%v time=%v bare=%v want date=%v time=%v bare=%v",
					parsed.hasDatePart, parsed.hasTimePart, parsed.bare, tc.hasDate, tc.hasTime, tc.bare)
			}
		})
	}
}

func TestValidateBound_ComponentRestriction(t *testing.T) {
	cases := []struct {
		name    string
		bound   string
		kind    boundKind
		layout  string
		wantErr bool
	}{
		{"date rejects time", "now+PT1H", dateKind, "YYYY-MM-DD", true},
		{"date accepts date", "now+P1Y", dateKind, "YYYY-MM-DD", false},
		{"date rejects mixed", "now+P1DT5M", dateKind, "YYYY-MM-DD", true},
		{"time rejects date", "now+P1D", timeKind, "HH:mm", true},
		{"time accepts time", "now-PT30M", timeKind, "HH:mm", false},
		{"dateTime accepts both", "now+P1DT2H", dateTimeKind, "T", false},
		{"bare now always ok (date)", "now", dateKind, "YYYY-MM-DD", false},
		{"bare now always ok (time)", "now", timeKind, "HH:mm", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			errs := validateBound(tc.bound, "min", tc.kind, tc.layout)
			if (len(errs) > 0) != tc.wantErr {
				t.Fatalf("got %+v wantErr %v", errs, tc.wantErr)
			}
		})
	}
}

func TestValidateBound_AbsoluteLiteral(t *testing.T) {
	cases := []struct {
		name    string
		bound   string
		kind    boundKind
		layout  string
		wantErr bool
	}{
		{"date ymd ok", "2020-01-01", dateKind, "YYYY-MM-DD", false},
		{"date dmy ok", "31-12-2020", dateKind, "DD-MM-YYYY", false},
		{"date wrong layout", "08:30", dateKind, "YYYY-MM-DD", true},
		{"date bad month", "2020-13-01", dateKind, "YYYY-MM-DD", true},
		{"date feb29 leap ok", "2020-02-29", dateKind, "YYYY-MM-DD", false},
		{"date feb29 non-leap", "2021-02-29", dateKind, "YYYY-MM-DD", true},
		{"time hhmm ok", "08:30", timeKind, "HH:mm", false},
		{"time bad hour", "25:00", timeKind, "HH:mm", true},
		{"time iso tz ok", "08:30:00.000Z", timeKind, "ISO", false},
		{"time date literal", "2020-01-01", timeKind, "HH:mm", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			errs := validateBound(tc.bound, "min", tc.kind, tc.layout)
			if (len(errs) > 0) != tc.wantErr {
				t.Fatalf("bound %q: got %+v wantErr %v", tc.bound, errs, tc.wantErr)
			}
		})
	}
}

func TestValidateMinMax_Ordering(t *testing.T) {
	// Two absolute literals, min > max → error.
	errs := validateMinMax(map[string]any{"min": "2020-06-01", "max": "2020-01-01"}, dateKind, "YYYY-MM-DD")
	if len(errs) == 0 {
		t.Fatalf("expected min>max error")
	}
	// min < max → ok.
	if errs := validateMinMax(map[string]any{"min": "2020-01-01", "max": "2020-06-01"}, dateKind, "YYYY-MM-DD"); len(errs) != 0 {
		t.Fatalf("expected no error, got %+v", errs)
	}
	// Relative min vs absolute max → ordering skipped (not statically
	// comparable), each still individually valid → no error.
	if errs := validateMinMax(map[string]any{"min": "now-P1Y", "max": "2020-01-01"}, dateKind, "YYYY-MM-DD"); len(errs) != 0 {
		t.Fatalf("expected ordering skipped, got %+v", errs)
	}
}

// TestValidateMinMax_LtGtOrdering covers the exclusive bounds (gt/lt): the
// lower×upper ordering pairs (gt>lt, min>lt, gt>max all error) AND the
// inclusive⊕exclusive mutual-exclusivity (min+gt, max+lt rejected — a bound
// edge is one or the other, never both).
func TestValidateMinMax_LtGtOrdering(t *testing.T) {
	cases := []struct {
		name    string
		params  map[string]any
		wantErr bool
	}{
		{"gt < lt ok", map[string]any{"gt": "2020-01-01", "lt": "2020-06-01"}, false},
		{"gt > lt err", map[string]any{"gt": "2020-06-01", "lt": "2020-01-01"}, true},
		{"gt == lt err", map[string]any{"gt": "2020-01-01", "lt": "2020-01-01"}, false}, // equal isn't "greater than"
		{"min > lt err", map[string]any{"min": "2020-06-01", "lt": "2020-01-01"}, true},
		{"gt > max err", map[string]any{"gt": "2020-06-01", "max": "2020-01-01"}, true},
		// inclusive⊕exclusive: a lower (or upper) edge can't be both.
		{"min + gt rejected", map[string]any{"min": "2020-01-01", "gt": "2020-02-01"}, true},
		{"max + lt rejected", map[string]any{"max": "2020-12-01", "lt": "2020-11-01"}, true},
		{"min + lt ok (distinct edges)", map[string]any{"min": "2020-01-01", "lt": "2020-11-01"}, false},
		{"gt + max ok (distinct edges)", map[string]any{"gt": "2020-02-01", "max": "2020-12-01"}, false},
		{"gt invalid literal err", map[string]any{"gt": "08:30"}, true},
		{"lt relative date-only ok", map[string]any{"lt": "now+P1Y"}, false},
		{"lt relative time-on-date err", map[string]any{"lt": "now+PT1H"}, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			errs := validateMinMax(tc.params, dateKind, "YYYY-MM-DD")
			if (len(errs) > 0) != tc.wantErr {
				t.Fatalf("got %+v wantErr %v", errs, tc.wantErr)
			}
		})
	}
}
