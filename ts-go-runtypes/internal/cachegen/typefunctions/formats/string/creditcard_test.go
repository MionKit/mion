package string

import (
	"strconv"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsengine"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// cardStubCtx is a minimal formats.EmitContext for direct emitter tests: it
// records every pure fn the emitted body reaches for, which is what these tests
// are actually about.
type cardStubCtx struct {
	items    map[string]string
	counters map[string]int
	pureFns  []string
}

func newCardStubCtx() *cardStubCtx {
	return &cardStubCtx{items: map[string]string{}, counters: map[string]int{}}
}

func (c *cardStubCtx) AddPureFnDependency(_, _, _ string) {}

func (c *cardStubCtx) UsePureFn(namespace, fnName, _ string) string {
	c.pureFns = append(c.pureFns, namespace+"::"+fnName)
	return "pf_" + fnName
}

func (c *cardStubCtx) HasContextItem(key string) bool {
	_, ok := c.items[key]
	return ok
}

func (c *cardStubCtx) SetContextItem(key, value string) { c.items[key] = value }

func (c *cardStubCtx) EmitDiagnostic(_ string, _ ...string) {}
func (c *cardStubCtx) JSEngine() jsengine.Engine            { return nil }
func (c *cardStubCtx) PatternSampleCount() int              { return 0 }
func (c *cardStubCtx) PatternGenFailure(_, _ string) formats.PatternGenFailure {
	return formats.PatternGenFailure{}
}

func (c *cardStubCtx) NextLocalVar(prefix string) string {
	name := prefix + strconv.Itoa(c.counters[prefix])
	c.counters[prefix]++
	return name
}

func cardAnnotation(params map[string]any) *reflection.FormatAnnotation {
	return &reflection.FormatAnnotation{Name: "creditCard", Params: params}
}

// TestCreditCard_NoNetworksSkipsTheNetworkTable — THE load-bearing test of the
// two-pure-fn split. A format that names no network must reach for
// isCreditCard alone; pulling matchesCardNetwork in would ship the whole
// per-network prefix table to a call site that has no use for it.
func TestCreditCard_NoNetworksSkipsTheNetworkTable(t *testing.T) {
	ctx := newCardStubCtx()
	got := creditCardEmitter{}.EmitValidateCheck(cardAnnotation(map[string]any{}), "v", ctx)

	// isCreditCard returns the failure MODE, so "valid" is the empty string.
	if got != "pf_isCreditCard(v,{})===''" {
		t.Fatalf("check = %q, want the base check alone", got)
	}
	if len(ctx.pureFns) != 1 || ctx.pureFns[0] != "rtFormats::isCreditCard" {
		t.Fatalf("pure fns = %v, want exactly [rtFormats::isCreditCard]", ctx.pureFns)
	}
}

// TestCreditCard_NetworksAddTheNetworkCheck — the other half: naming a network
// ANDs in matchesCardNetwork, and the networks list reaches the pure fn.
func TestCreditCard_NetworksAddTheNetworkCheck(t *testing.T) {
	ctx := newCardStubCtx()
	params := map[string]any{"networks": []any{"visa", "mastercard"}}
	got := creditCardEmitter{}.EmitValidateCheck(cardAnnotation(params), "v", ctx)

	for _, want := range []string{"pf_isCreditCard(v,", "pf_matchesCardNetwork(v,", `"visa"`, `"mastercard"`, " && "} {
		if !strings.Contains(got, want) {
			t.Errorf("check missing %q; got %q", want, got)
		}
	}
	if len(ctx.pureFns) != 2 {
		t.Fatalf("pure fns = %v, want both the base and the network fn", ctx.pureFns)
	}
}

// TestCreditCard_ParamsLiteralDropsMockSamples — mockSamples exist for the mock
// generator, not the validator, so they must not be folded into every emitted
// call site.
func TestCreditCard_ParamsLiteralDropsMockSamples(t *testing.T) {
	ctx := newCardStubCtx()
	params := map[string]any{"separators": " -", "mockSamples": []any{"4111111111111111"}}
	got := creditCardEmitter{}.EmitValidateCheck(cardAnnotation(params), "v", ctx)

	if strings.Contains(got, "mockSamples") || strings.Contains(got, "4111111111111111") {
		t.Errorf("emitted check must not carry mockSamples; got %q", got)
	}
	if !strings.Contains(got, `"separators":" -"`) {
		t.Errorf("emitted check must carry separators; got %q", got)
	}
}

// TestCreditCard_ErrorsLaneReportsTheFailureMode — the error carries WHICH check
// failed in its `type`, which is the whole reason the base pure fn returns a
// mode rather than a boolean. A network miss names the networks the field takes.
func TestCreditCard_ErrorsLaneReportsTheFailureMode(t *testing.T) {
	ctx := newCardStubCtx()
	got := creditCardEmitter{}.EmitValidationErrorsCheck(
		cardAnnotation(map[string]any{"networks": []any{"amex"}}), "v", "pth", "er", ctx)
	for _, want := range []string{`'creditCard'`, `["amex"]`, `errorType:"network"`, "else if (!pf_matchesCardNetwork"} {
		if !strings.Contains(got, want) {
			t.Errorf("errors lane missing %q; got %q", want, got)
		}
	}

	// The mode is computed ONCE into a local and used as both `val` and `type`.
	anyCtx := newCardStubCtx()
	anyGot := creditCardEmitter{}.EmitValidationErrorsCheck(cardAnnotation(map[string]any{}), "v", "pth", "er", anyCtx)
	for _, want := range []string{"const ccMode0=pf_isCreditCard(", "val:ccMode0", "errorType:ccMode0"} {
		if !strings.Contains(anyGot, want) {
			t.Errorf("errors lane missing %q; got %q", want, anyGot)
		}
	}
	// No networks declared → no network branch and no network pure fn.
	if strings.Contains(anyGot, "matchesCardNetwork") {
		t.Errorf("a format naming no network must not reach the network table; got %q", anyGot)
	}
}

// strip is the nested `transform: {stripSeparators: …}` block the tests spell.
func strip(on bool) map[string]any { return map[string]any{"stripSeparators": on} }

// TestCreditCard_TransformIsOptIn — accepting a grouped number and REWRITING it
// are two decisions. Declaring `separators` only does the first; the transform
// stays identity until `transform: {stripSeparators: true}` asks for the second.
func TestCreditCard_TransformIsOptIn(t *testing.T) {
	emitter := creditCardEmitter{}
	for _, params := range []map[string]any{
		{},
		{"separators": " -"},
		{"transform": strip(false), "separators": " -"},
		{"transform": strip(true)},
		{"transform": strip(true), "separators": ""},
		// The OLD flat spelling is not a transform any more.
		{"stripSeparators": true, "separators": " -"},
	} {
		if got := emitter.EmitFormatTransform(cardAnnotation(params), "v", nil); got != "" {
			t.Errorf("params %v should emit no transform; got %q", params, got)
		}
	}

	got := emitter.EmitFormatTransform(cardAnnotation(map[string]any{"transform": strip(true), "separators": " -"}), "v", nil)
	// The dash is escaped so it cannot act as a range inside the class.
	if got != `v.replace(/[ \-]/g,'')` {
		t.Errorf("transform = %q, want a class over the declared separators", got)
	}
	// Same declaration spelled the other way round must emit the same regex.
	other := emitter.EmitFormatTransform(cardAnnotation(map[string]any{"transform": strip(true), "separators": "- "}), "v", nil)
	if other != got {
		t.Errorf("separator order must not change the emitted regex: %q vs %q", got, other)
	}
	// The strip runs first, the shared string rewrites compose after it.
	combined := emitter.EmitFormatTransform(cardAnnotation(map[string]any{
		"transform": map[string]any{"trim": true, "stripSeparators": true}, "separators": " -"}), "v", nil)
	if combined != `v.replace(/[ \-]/g,'').trim()` {
		t.Errorf("strip + trim = %q", combined)
	}
	trimOnly := emitter.EmitFormatTransform(cardAnnotation(map[string]any{"transform": map[string]any{"trim": true}}), "v", nil)
	if trimOnly != "v.trim()" {
		t.Errorf("trim alone = %q", trimOnly)
	}
}

func TestCreditCard_ValidateParams(t *testing.T) {
	cases := []struct {
		name    string
		params  map[string]any
		wantErr bool
	}{
		{"no params", map[string]any{}, false},
		{"known networks", map[string]any{"networks": []any{"visa", "amex"}}, false},
		{"unknown network", map[string]any{"networks": []any{"visa", "switch"}}, true},
		{"empty networks", map[string]any{"networks": []any{}}, true},
		{"networks not a list", map[string]any{"networks": "visa"}, true},
		{"separators", map[string]any{"separators": " -"}, false},
		// '' is the digits-only opt-out from the ' -' default, not a mistake.
		{"empty separators opts out", map[string]any{"separators": ""}, false},
		{"separators not a string", map[string]any{"separators": 7}, true},
		{"digit separator", map[string]any{"separators": "-0"}, true},
		{"stripSeparators", map[string]any{"transform": strip(true), "separators": " -"}, false},
		{"stripSeparators off", map[string]any{"transform": strip(false)}, false},
		{"stripSeparators not a boolean", map[string]any{"transform": map[string]any{"stripSeparators": "yes"}}, true},
		{"transform not an object", map[string]any{"transform": true}, true},
		{"unknown transform key", map[string]any{"transform": map[string]any{"stripSeparator": true}}, true},
		{"shared rewrite inside transform", map[string]any{"transform": map[string]any{"trim": true, "stripSeparators": true}}, false},
		// Asking to strip when nothing is accepted can never do anything.
		{"stripSeparators with nothing to strip", map[string]any{"transform": strip(true), "separators": ""}, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			messages := creditCardEmitter{}.ValidateParams(cardAnnotation(tc.params))
			if tc.wantErr && len(messages) == 0 {
				t.Errorf("params %v should be rejected", tc.params)
			}
			if !tc.wantErr && len(messages) != 0 {
				t.Errorf("params %v should be accepted; got %v", tc.params, messages)
			}
		})
	}
}
