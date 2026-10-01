package formats_test

import (
	"reflect"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	_ "github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats/all"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

func TestScanErrorKeys_ReadsWhatFormatErrCallWrites(t *testing.T) {
	code := formats.FormatErrCall("pth", "er", "number", "numberFormat", "max", "10") + ";" +
		formats.FormatErrCallWith("pth", "er", "string", "email", "@", "'@'", formats.FormatErrorTypeProp("'format'")) + ";" +
		formats.FormatErrCall("pth", "er", "number", "numberFormat", "max", "10")
	if got, want := formats.ScanErrorKeys(code), []string{"@", "max"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("ScanErrorKeys = %v, want %v", got, want)
	}
}

func TestErrorKeysForParams(t *testing.T) {
	cases := []struct {
		name   string
		kind   reflection.ReflectionKind
		format string
		params map[string]any
		want   []string
	}{
		{"credit card names the format itself", reflection.KindString, "creditCard", map[string]any{"separators": " -"}, []string{"creditCard"}},
		{"credit card networks", reflection.KindString, "creditCard", map[string]any{"networks": []any{"visa"}}, []string{"creditCard", "networks"}},
		{"integer only when true", reflection.KindNumber, "numberFormat", map[string]any{"integer": false, "max": 5.0}, []string{"max"}},
		{"float and isCurrency never fail", reflection.KindNumber, "numberFormat", map[string]any{"float": true, "isCurrency": true}, []string{}},
		{"hostname idna folds length", reflection.KindString, "domain", map[string]any{"idna": "ascii", "maxLength": 253.0}, []string{"idna"}},
		{"email rfc folds length", reflection.KindString, "email", map[string]any{"emailRfc": "ascii", "maxLength": 254.0}, []string{"emailRfc"}},
		{"ip version defaults", reflection.KindString, "ip", map[string]any{"allowPort": true}, []string{"version"}},
		{"date format defaults", reflection.KindString, "date", map[string]any{}, []string{"format"}},
		{"unknown format", reflection.KindString, "noSuchFormat", map[string]any{"max": 1.0}, nil},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			got := formats.ErrorKeysForParams(testCase.kind, testCase.format, testCase.params)
			if len(got) == 0 && len(testCase.want) == 0 {
				return
			}
			if !reflect.DeepEqual(got, testCase.want) {
				t.Fatalf("ErrorKeysForParams = %v, want %v", got, testCase.want)
			}
		})
	}
}

// TestErrorKeySamples_EveryFormat fails for a newly registered format until it gets samples.
func TestErrorKeySamples_EveryFormat(t *testing.T) {
	for _, emitter := range formats.Registered() {
		if !formats.HasErrorKeySamples(emitter.Name()) {
			t.Errorf("format %q has no error-key samples: add them to errorKeySamples in formats/errorkeys_samples.go", emitter.Name())
			continue
		}
		if len(formats.AllErrorKeys(emitter.Name())) == 0 {
			t.Errorf("format %q: its samples emit no error key; add a sample that reaches its validation errors", emitter.Name())
		}
	}
}

func TestErrorKeySamples_ExclusionsHaveReasons(t *testing.T) {
	for _, emitter := range formats.Registered() {
		for param, reason := range formats.ExcludedParams(emitter.Name()) {
			if reason == "" {
				t.Errorf("format %q excludes %q without a reason", emitter.Name(), param)
			}
		}
	}
}

// TestErrorKeySamples_NoStaleFormat fails when samples outlive a removed or renamed format.
func TestErrorKeySamples_NoStaleFormat(t *testing.T) {
	registered := map[string]bool{}
	for _, emitter := range formats.Registered() {
		registered[emitter.Name()] = true
	}
	for _, name := range formats.SampledFormatNames() {
		if !registered[name] {
			t.Errorf("errorkeys_samples.go names %q, which no emitter registers: remove it", name)
		}
	}
}
