package string

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// TestNamedFormats_TransformIsOptIn — email / domain / url / ip used to
// lowercase unconditionally, with nothing in the type saying so. Now they are
// identity until the type declares `transform: {lowercase: true}`, the same
// `transform` key every string-family format reads.
func TestNamedFormats_TransformIsOptIn(t *testing.T) {
	emitters := map[string]formats.FormatTransformer{
		"email":        emailEmitter{},
		"domain":       domainEmitter{},
		"url":          urlEmitter{},
		"ip":           ipEmitter{},
		"stringFormat": stringFormatEmitter{},
	}
	for name, emitter := range emitters {
		t.Run(name, func(t *testing.T) {
			plain := &reflection.FormatAnnotation{Name: name, Params: map[string]any{"maxLength": float64(64)}}
			if got := emitter.EmitFormatTransform(plain, "v", nil); got != "" {
				t.Errorf("%s with no transform block must be identity; got %q", name, got)
			}
			flat := &reflection.FormatAnnotation{Name: name, Params: map[string]any{"lowercase": true}}
			if got := emitter.EmitFormatTransform(flat, "v", nil); got != "" {
				t.Errorf("%s must ignore the old flat `lowercase` flag; got %q", name, got)
			}
			lowered := &reflection.FormatAnnotation{Name: name, Params: map[string]any{
				"transform": map[string]any{"lowercase": true, "trim": true}}}
			if got := emitter.EmitFormatTransform(lowered, "v", nil); got != "v.trim().toLowerCase()" {
				t.Errorf("%s opt-in = %q", name, got)
			}
			if got := emitter.EmitFormatTransform(nil, "v", nil); got != "" {
				t.Errorf("%s nil annotation must be identity; got %q", name, got)
			}
		})
	}
}

// TestNamedFormats_ValidateTransformBlock — every string-family ValidateParams
// runs the shared shape check, so a typo inside `transform` is an FMT002 for
// each of them, not just for String.
func TestNamedFormats_ValidateTransformBlock(t *testing.T) {
	validators := map[string]formats.ParamValidator{
		"email":        emailEmitter{},
		"domain":       domainEmitter{},
		"url":          urlEmitter{},
		"ip":           ipEmitter{},
		"stringFormat": stringFormatEmitter{},
		"creditCard":   creditCardEmitter{},
	}
	for name, validator := range validators {
		t.Run(name, func(t *testing.T) {
			bad := &reflection.FormatAnnotation{Name: name, Params: map[string]any{
				"transform": map[string]any{"lowercas": true}}}
			messages := validator.ValidateParams(bad)
			if len(messages) != 1 || !strings.Contains(messages[0], "unknown `transform` key `lowercas`") {
				t.Errorf("%s: want one unknown-key message; got %v", name, messages)
			}
			good := &reflection.FormatAnnotation{Name: name, Params: map[string]any{
				"transform": map[string]any{"lowercase": true}}}
			if messages := validator.ValidateParams(good); len(messages) != 0 {
				t.Errorf("%s: a valid block must pass; got %v", name, messages)
			}
		})
	}
}

// TestIP_TransformNeverReachesPureFn — the `transform` block belongs to the
// formatTransform family; the validator's pure-fn params literal must not ship it.
func TestIP_TransformNeverReachesPureFn(t *testing.T) {
	literal := jsParamsLiteral(map[string]any{"version": "any", "transform": map[string]any{"lowercase": true}})
	if strings.Contains(literal, "transform") {
		t.Errorf("params literal must drop the transform block; got %s", literal)
	}
	if literal != `{"version":"any"}` {
		t.Errorf("params literal = %s", literal)
	}
}
