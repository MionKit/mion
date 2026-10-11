package string

import (
	"slices"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// TestStringErrors_NoLengthBoundReachesNoCodePointLength: found by the typed-emit fuzz lane, an errors check with no
// length bound bound codePointLength anyway and shipped a lookup nothing read.
func TestStringErrors_NoLengthBoundReachesNoCodePointLength(t *testing.T) {
	annotation := func(params map[string]any) *reflection.FormatAnnotation {
		return &reflection.FormatAnnotation{Name: "stringFormat", Params: params}
	}
	ctx := newCardStubCtx()
	stringFormatEmitter{}.EmitValidationErrorsCheck(annotation(map[string]any{"isRegex": true}), "v", "pth", "er", ctx)
	if slices.Contains(ctx.pureFns, purefnids.CodePointLength) {
		t.Errorf("no length bound, yet the check reached for codePointLength: %v", ctx.pureFns)
	}
	bounded := newCardStubCtx()
	stringFormatEmitter{}.EmitValidationErrorsCheck(annotation(map[string]any{"maxLength": float64(3)}), "v", "pth", "er", bounded)
	if !slices.Contains(bounded.pureFns, purefnids.CodePointLength) {
		t.Errorf("a length bound must reach for codePointLength: %v", bounded.pureFns)
	}
}
