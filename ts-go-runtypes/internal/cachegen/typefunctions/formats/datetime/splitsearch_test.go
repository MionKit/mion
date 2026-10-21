package datetime

import (
	"strconv"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsengine"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// Pins the dateTime separator search in every emitted lane: the error lane once spelled its own
// .indexOf("T"), so RFC 3339's `1963-06-19t08:30:06z` validated true and still drew a splitChar error.
// JS twin: packages/run-types/test/features/datetime-splitchar-lane-disagreement.test.ts.

// splitStubCtx is a minimal formats.EmitContext whose UsePureFn returns the id, the alias these expectations spell.
type splitStubCtx struct {
	items    map[string]string
	counters map[string]int
}

func newSplitStubCtx() *splitStubCtx {
	return &splitStubCtx{items: map[string]string{}, counters: map[string]int{}}
}

func (c *splitStubCtx) AddPureFnDependency(_ string) {}
func (c *splitStubCtx) UsePureFn(id string) string   { return id }
func (c *splitStubCtx) HasContextItem(key string) bool {
	_, ok := c.items[key]
	return ok
}
func (c *splitStubCtx) SetContextItem(key, value string)     { c.items[key] = value }
func (c *splitStubCtx) EmitDiagnostic(_ string, _ ...string) {}
func (c *splitStubCtx) JSEngine() jsengine.Engine            { return nil }
func (c *splitStubCtx) PatternSampleCount() int              { return 0 }
func (c *splitStubCtx) PatternGenFailure(_, _ string) formats.PatternGenFailure {
	return formats.PatternGenFailure{}
}
func (c *splitStubCtx) NextLocalVar(prefix string) string {
	name := prefix + strconv.Itoa(c.counters[prefix])
	c.counters[prefix]++
	return name
}

func dateTimeAnnotation(params map[string]any) *reflection.FormatAnnotation {
	return &reflection.FormatAnnotation{Name: "dateTime", Params: params}
}

func TestSplitSearch_CaseInsensitiveOnlyForALetter(t *testing.T) {
	cases := []struct {
		splitChar string
		want      string
	}{
		{"T", "v.search(/[Tt]/)"},
		{"t", "v.search(/[Tt]/)"},
		{" ", `v.indexOf(" ")`},
		{"_", `v.indexOf("_")`},
	}
	for _, tc := range cases {
		t.Run(tc.splitChar, func(t *testing.T) {
			if got := splitSearch("v", tc.splitChar); got != tc.want {
				t.Fatalf("splitSearch(%q) = %q, want %q", tc.splitChar, got, tc.want)
			}
		})
	}
}

// THE regression: a value the validate lane accepts must not draw an error from the error lane.
func TestDateTime_BothLanesUseTheSameSeparatorSearch(t *testing.T) {
	for _, splitChar := range []string{"T", "t", " ", "_"} {
		t.Run(splitChar, func(t *testing.T) {
			params := map[string]any{"splitChar": splitChar}
			annotation := dateTimeAnnotation(params)
			want := splitSearch("v", splitChar)

			validate := dateTimeEmitter{}.EmitValidateCheck(annotation, "v", newSplitStubCtx())
			if !strings.Contains(validate, want) {
				t.Fatalf("validate lane = %q, want it to locate the separator with %q", validate, want)
			}
			errors := dateTimeEmitter{}.EmitValidationErrorsCheck(annotation, "v", "pth", "errs", newSplitStubCtx())
			if !strings.Contains(errors, "const dtSplit="+want+";") {
				t.Fatalf("error lane = %q, want it to locate the separator with %q", errors, want)
			}
			// The bug's exact shape: the error lane spelling out its own search.
			if splitSearch("v", splitChar) != "v.indexOf("+strconv.Quote(splitChar)+")" &&
				strings.Contains(errors, "v.indexOf("+strconv.Quote(splitChar)+")") {
				t.Fatalf("error lane = %q, still carries the case-sensitive indexOf", errors)
			}
		})
	}
}

// The third lane: valueKeyExpr splits too, so a case-sensitive search there rejects a lowercase separator under any bound.
func TestDateTime_BoundKeyUsesTheSameSeparatorSearch(t *testing.T) {
	for _, splitChar := range []string{"T", "t", " ", "_"} {
		t.Run(splitChar, func(t *testing.T) {
			params := map[string]any{"splitChar": splitChar, "min": "1963-06-19" + splitChar + "08:30:06"}
			annotation := dateTimeAnnotation(params)
			want := splitSearch("v", splitChar)

			validate := dateTimeEmitter{}.EmitValidateCheck(annotation, "v", newSplitStubCtx())
			if strings.Count(validate, want) != 2 {
				t.Fatalf("validate lane = %q, want the structural check AND the bound key to split with %q", validate, want)
			}
			errors := dateTimeEmitter{}.EmitValidationErrorsCheck(annotation, "v", "pth", "errs", newSplitStubCtx())
			if strings.Count(errors, want) != 2 {
				t.Fatalf("error lane = %q, want the structural check AND the bound key to split with %q", errors, want)
			}
		})
	}
}

// The build-time twin: a bound literal parsed in Go must split where the emitted JS does.
func TestSplitIndex_MatchesSplitSearch(t *testing.T) {
	cases := []struct {
		value     string
		splitChar string
		index     int
		width     int
	}{
		{"1963-06-19T08:30:06", "T", 10, 1},
		{"1963-06-19t08:30:06", "T", 10, 1},
		{"1963-06-19T08:30:06", "t", 10, 1},
		{"1963-06-19t08:30:06", "t", 10, 1},
		{"29-02-2024 23:59", " ", 10, 1},
		{"29-02-2024T23:59", " ", -1, 0},
		{"1963-06-19", "T", -1, 0},
	}
	for _, tc := range cases {
		t.Run(tc.value+"|"+tc.splitChar, func(t *testing.T) {
			index, width := splitIndex(tc.value, tc.splitChar)
			if index != tc.index || width != tc.width {
				t.Fatalf("splitIndex(%q, %q) = (%d, %d), want (%d, %d)", tc.value, tc.splitChar, index, width, tc.index, tc.width)
			}
		})
	}
}

// A bound literal written with a lowercase separator is baked, not rejected.
func TestDateTimeEpochMs_AcceptsALowercaseSeparator(t *testing.T) {
	upper, ok := dateTimeEpochMs("1963-06-19T08:30:06", "T")
	if !ok {
		t.Fatalf("dateTimeEpochMs rejected the upper-case spelling")
	}
	lower, ok := dateTimeEpochMs("1963-06-19t08:30:06", "T")
	if !ok {
		t.Fatalf("dateTimeEpochMs rejected the lowercase spelling RFC 3339 allows")
	}
	if upper != lower {
		t.Fatalf("epoch ms = %v (lowercase) vs %v (upper-case), want the same instant", lower, upper)
	}
}

// The default splitChar is 'T', so an annotation with no splitChar param reaches the same case-insensitive search.
func TestDateTime_DefaultSplitCharSearchesBothCases(t *testing.T) {
	annotation := dateTimeAnnotation(map[string]any{})
	errors := dateTimeEmitter{}.EmitValidationErrorsCheck(annotation, "v", "pth", "errs", newSplitStubCtx())
	if !strings.Contains(errors, "const dtSplit=v.search(/[Tt]/);") {
		t.Fatalf("error lane = %q, want the default separator search v.search(/[Tt]/)", errors)
	}
}
