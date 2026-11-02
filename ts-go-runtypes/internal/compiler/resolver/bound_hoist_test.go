package resolver_test

import (
	"regexp"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// bound_hoist_test.go pins that a validator parses each fixed bound once, in its factory prologue, never per
// call: Temporal literals, Temporal durations and the native-Date relative spec. Only `now` stays per call.
// It also pins that a rest tuple's validate ends in one `return true`.

// scanFamilySource returns the `family` entry source for a module calling createValidateFn or
// createGetValidationErrorsFn.
func scanFamilySource(t *testing.T, code, family string) string {
	t.Helper()
	session := setupInline(t, map[string]string{"a.ts": code})
	resp := session.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	return familyEntrySources(resp, family)
}

func scanValidateSource(t *testing.T, code string) string {
	t.Helper()
	return scanFamilySource(t, code, "validate")
}

// splitPrologue splits an entry source into the factory prologue (runs once) and the per-call function.
func splitPrologue(t *testing.T, src string) (prologue, body string) {
	t.Helper()
	idx := strings.Index(src, "function ")
	if idx == -1 {
		t.Fatalf("no function in:\n%s", src)
	}
	return src[:idx], src[idx:]
}

const temporalBoundsType = `TypeFormat<Temporal.Instant, 'temporalInstant', {min: '2020-01-01T00:00:00Z'; lt: 'now+PT1H'}>`

func assertTemporalBoundsHoisted(t *testing.T, src string) {
	t.Helper()
	prologue, body := splitPrologue(t, src)
	if !strings.Contains(prologue, `= Temporal.Instant.from("2020-01-01T00:00:00Z")`) ||
		!strings.Contains(prologue, `= Temporal.Duration.from("PT1H")`) {
		t.Fatalf("expected both bounds parsed in the prologue, got:\n%s", src)
	}
	if strings.Contains(body, ".from(") {
		t.Fatalf("a bound is still parsed per call:\n%s", body)
	}
	if !strings.Contains(body, "Temporal.Now.instant().add(") {
		t.Fatalf("relative bound must read the clock per call:\n%s", body)
	}
}

func TestBoundHoist_TemporalStatic(t *testing.T) {
	src := scanValidateSource(t, `import {createValidateFn} from '@mionjs/run-types';
`+typeFormatBrandDecl+`
export const _ = createValidateFn<`+temporalBoundsType+`>();
`)
	assertTemporalBoundsHoisted(t, src)
}

func TestBoundHoist_TemporalValueFirst(t *testing.T) {
	src := scanValidateSource(t, `import {createValidateFn} from '@mionjs/run-types';
`+typeFormatBrandDecl+`
declare const v: `+temporalBoundsType+`;
export const _ = createValidateFn(v);
`)
	assertTemporalBoundsHoisted(t, src)
}

const dateRelativeType = `TypeFormat<Date, 'nativeDate', {min: 'now-P1Y'}>`

// rNowCall matches the per-call invocation of a hoisted relative-now fn, e.g. `rNow0()`.
var rNowCall = regexp.MustCompile(`\brNow\d+\(\)`)

func assertDateRelativeHoisted(t *testing.T, src string) {
	t.Helper()
	prologue, body := splitPrologue(t, src)
	if strings.Contains(body, `("now-P1Y"`) {
		t.Fatalf("relative spec still parsed per call:\n%s", body)
	}
	if !rNowCall.MatchString(body) {
		t.Fatalf("expected the hoisted clock fn called per check, got:\n%s", src)
	}
	if !strings.Contains(prologue, `("now-P1Y"`) {
		t.Fatalf("expected the spec parsed in the prologue, got:\n%s", src)
	}
}

func TestBoundHoist_NativeDateRelativeStatic(t *testing.T) {
	src := scanValidateSource(t, `import {createValidateFn} from '@mionjs/run-types';
`+typeFormatBrandDecl+`
export const _ = createValidateFn<`+dateRelativeType+`>();
`)
	assertDateRelativeHoisted(t, src)
}

func TestBoundHoist_NativeDateRelativeValueFirst(t *testing.T) {
	src := scanValidateSource(t, `import {createValidateFn} from '@mionjs/run-types';
`+typeFormatBrandDecl+`
declare const v: `+dateRelativeType+`;
export const _ = createValidateFn(v);
`)
	assertDateRelativeHoisted(t, src)
}

// The validationErrors family hoists through its own emit path, so it is pinned separately.
func scanErrorsSource(t *testing.T, typeArg, valueDecl string) string {
	t.Helper()
	call := "createGetValidationErrorsFn<" + typeArg + ">()"
	if valueDecl != "" {
		call = "createGetValidationErrorsFn(v)"
	}
	return scanFamilySource(t, `import {createGetValidationErrorsFn} from '@mionjs/run-types';
`+typeFormatBrandDecl+valueDecl+`
export const _ = `+call+`;
`, "validationErrors")
}

func TestBoundHoist_TemporalErrorsStatic(t *testing.T) {
	assertTemporalBoundsHoisted(t, scanErrorsSource(t, temporalBoundsType, ""))
}

func TestBoundHoist_TemporalErrorsValueFirst(t *testing.T) {
	assertTemporalBoundsHoisted(t, scanErrorsSource(t, "", "declare const v: "+temporalBoundsType+";\n"))
}

func TestBoundHoist_NativeDateRelativeErrorsStatic(t *testing.T) {
	assertDateRelativeHoisted(t, scanErrorsSource(t, dateRelativeType, ""))
}

func TestBoundHoist_NativeDateRelativeErrorsValueFirst(t *testing.T) {
	assertDateRelativeHoisted(t, scanErrorsSource(t, "", "declare const v: "+dateRelativeType+";\n"))
}

// A rest tuple's block must end in one `return true`, with no dead `return v` left after the rest loop.
func assertRestTupleClean(t *testing.T, src string) {
	t.Helper()
	if strings.Contains(src, "return v") || strings.Count(src, "return true") != 1 {
		t.Fatalf("dead return after the rest loop:\n%s", src)
	}
}

func TestRestTupleValidate_NoDeadReturnStatic(t *testing.T) {
	src := scanValidateSource(t, `import {createValidateFn} from '@mionjs/run-types';
type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
export const _ = createValidateFn<Parameters<CallSig>>();
`)
	assertRestTupleClean(t, src)
}

func TestRestTupleValidate_NoDeadReturnValueFirst(t *testing.T) {
	src := scanValidateSource(t, `import {createValidateFn} from '@mionjs/run-types';
declare const v: [number, boolean, ...Date[]];
export const _ = createValidateFn(v);
`)
	assertRestTupleClean(t, src)
}
