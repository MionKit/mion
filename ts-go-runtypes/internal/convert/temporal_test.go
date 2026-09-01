package convert_test

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/convert"
	"github.com/mionkit/mion/ts-go-runtypes/internal/testfixtures"
)

// withTemporal wraps a main.ts source with the shared Temporal ambient (the
// same fixture the resolver suites mount), so `Temporal.*` resolves without a
// tsconfig lib list.
func withTemporal(source string) map[string]string {
	return map[string]string{"main.ts": source, "temporal.d.ts": testfixtures.TemporalDTS}
}

func TestChain_TemporalUnbranded(t *testing.T) {
	source := "export type Meeting = {at: Temporal.Instant; day?: Temporal.PlainDate};\n"
	builderForm := convertAndCheckIDsIn(t, withTemporal(source), convert.TargetBuilders)
	if !strings.Contains(builderForm, "TFT.instant()") || !strings.Contains(builderForm, "RT.optional(TFT.plainDate())") {
		t.Errorf("temporal members should print the TFT builders:\n%s", builderForm)
	}
	if !strings.Contains(builderForm, "import * as TFT from '@mionjs/run-types/formats/temporal';") {
		t.Errorf("the temporal subpath import should be added:\n%s", builderForm)
	}
	typeForm := convertAndCheckIDsIn(t, withTemporal(builderForm), convert.TargetType)
	if !strings.Contains(typeForm, "at: Temporal.Instant") || !strings.Contains(typeForm, "day?: Temporal.PlainDate") {
		t.Errorf("type target should restore the qualified Temporal spellings:\n%s", typeForm)
	}
}

func TestChain_TemporalAllEight(t *testing.T) {
	source := "export type Every = {\n" +
		"  a: Temporal.Instant;\n" +
		"  b: Temporal.ZonedDateTime;\n" +
		"  c: Temporal.PlainDate;\n" +
		"  d: Temporal.PlainTime;\n" +
		"  e: Temporal.PlainDateTime;\n" +
		"  f: Temporal.PlainYearMonth;\n" +
		"  g: Temporal.PlainMonthDay;\n" +
		"  h: Temporal.Duration;\n" +
		"};\n"
	builderForm := convertAndCheckIDsIn(t, withTemporal(source), convert.TargetBuilders)
	for _, expected := range []string{"TFT.instant()", "TFT.zonedDateTime()", "TFT.plainDate()", "TFT.plainTime()",
		"TFT.plainDateTime()", "TFT.plainYearMonth()", "TFT.plainMonthDay()", "TFT.duration()"} {
		if !strings.Contains(builderForm, expected) {
			t.Errorf("builder form missing %q:\n%s", expected, builderForm)
		}
	}
	convertAndCheckIDsIn(t, withTemporal(builderForm), convert.TargetType)
}

func TestChain_TemporalBranded(t *testing.T) {
	source := "import * as TFT from '@mionjs/run-types/formats/temporal';\n" +
		"export type Day = TFT.PlainDate<{min: '2020-01-01'}>;\n" +
		"type When = TFT.Instant<{min: 'now', max: 'now+P1Y'}>;\n"
	builderForm := convertAndCheckIDsIn(t, withTemporal(source), convert.TargetBuilders)
	if !strings.Contains(builderForm, "TFT.plainDate({min: '2020-01-01'})") {
		t.Errorf("branded temporal should print the TFT param builder:\n%s", builderForm)
	}
	typeForm := convertAndCheckIDsIn(t, withTemporal(builderForm), convert.TargetType)
	if !strings.Contains(typeForm, "export type Day = TFT.PlainDate<{min: '2020-01-01'}>;") {
		t.Errorf("type target should restore the brand alias:\n%s", typeForm)
	}
}

func TestTemporalAnyGuard_AllTargets(t *testing.T) {
	// WITHOUT the ambient, `Temporal.Instant` resolves to `any`; a
	// declaration that WOULD convert must refuse with CNV007 instead of
	// cementing the destroyed type into the source. (A declaration already
	// in the target form is skipped byte-identical, so nothing needs
	// guarding there — the guard covers every declaration that rewrites.)
	typeFormSource := "export type Meeting = {at: Temporal.Instant};\ntype Plain = string;\n"
	builderFormSource := "import {type InferType, getRunType} from '@mionjs/run-types';\n" +
		"export const meetingRT = getRunType<{at: Temporal.Instant}>();\n" +
		"export type Meeting = InferType<typeof meetingRT>;\n"
	cases := []struct {
		target  convert.Target
		source  string
		keeping string
	}{
		{convert.TargetBuilders, typeFormSource, "export type Meeting = {at: Temporal.Instant};"},
		{convert.TargetType, builderFormSource, "export const meetingRT = getRunType<{at: Temporal.Instant}>();"},
	}
	for _, testCase := range cases {
		output, diags := convertOne(t, testCase.source, convert.Options{Target: testCase.target})
		foundGuard := false
		for _, diagnostic := range diags {
			if diagnostic.Code == convert.CodeTemporalNotLoaded {
				foundGuard = true
			}
		}
		if !foundGuard {
			t.Fatalf("--to %s: expected CNV007 for the any-resolved Temporal type, got %+v", testCase.target, diags)
		}
		if !strings.Contains(output, testCase.keeping) {
			t.Errorf("--to %s: the guarded declaration must stay untouched:\n%s", testCase.target, output)
		}
	}
}
