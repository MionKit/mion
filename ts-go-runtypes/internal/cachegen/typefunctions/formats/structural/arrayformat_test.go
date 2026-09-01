package structural

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

func arrAnnotation(params map[string]any) *reflection.FormatAnnotation {
	return &reflection.FormatAnnotation{Name: formattedArrayName, Params: params}
}

// TestFormattedArray_UniqueItemsGoesThroughThePureFn — the canonicalisation
// closure used to be rebuilt inside the emitted body on EVERY validator call.
// It now lives in `rt::uniqueItems`, constructed once per module.
func TestFormattedArray_UniqueItemsGoesThroughThePureFn(t *testing.T) {
	ctx := newStubCtx()
	emitter := formattedArrayEmitter{kind: reflection.KindArray}
	got := emitter.EmitValidateCheck(arrAnnotation(map[string]any{"uniqueItems": true}), "v", ctx)

	if got != "uniqueItems(v)" {
		t.Fatalf("check = %q, want a call to the pure-fn alias", got)
	}
	if len(ctx.pureFns) != 1 || ctx.pureFns[0] != "rt::uniqueItems" {
		t.Fatalf("pure fns = %v, want exactly [rt::uniqueItems]", ctx.pureFns)
	}
	for _, banned := range []string{"const canon", "JSON.stringify", "new Set("} {
		if strings.Contains(got, banned) {
			t.Errorf("emitted body must not inline %q; got %q", banned, got)
		}
	}
}

// TestFormattedArray_UniqueItemsPureFnIsCoreNamespace — `rt::`, not `rtFormats::`.
// The rtFormats modules only register when `@mionjs/run-types/formats` is imported,
// which a schema-door-only program never does; pure-fns-utils.ts is
// side-effect imported from the package entry, so it is always registered.
func TestFormattedArray_UniqueItemsPureFnIsCoreNamespace(t *testing.T) {
	if corePureFnNamespace != "rt" {
		t.Fatalf("namespace = %q, want rt", corePureFnNamespace)
	}
	if !strings.HasSuffix(uniqueItemsPureFnPath, "src/runtypes/pure-fns-utils.ts") {
		t.Errorf("path = %q, want the always-registered core module", uniqueItemsPureFnPath)
	}
}

// TestFormattedArray_BothLanesShareOnePureFnAlias — validate and the errors lane
// both route through the alias, and the errors lane keeps its keyword
// attribution.
func TestFormattedArray_BothLanesShareOnePureFnAlias(t *testing.T) {
	ctx := newStubCtx()
	emitter := formattedArrayEmitter{kind: reflection.KindArray}
	got := emitter.EmitValidationErrorsCheck(arrAnnotation(map[string]any{"uniqueItems": true}), "v", "pth", "er", ctx)

	if !strings.Contains(got, "uniqueItems(v)") {
		t.Errorf("errors lane must use the pure fn; got %q", got)
	}
	if !strings.Contains(got, "'uniqueItems'") {
		t.Errorf("errors lane must report under the uniqueItems keyword; got %q", got)
	}
}

// TestFormattedArray_LengthBoundsUnchanged — min/maxItems were already optimal
// (`v.length` is a field read, nothing to hoist); pin that they stayed inline.
func TestFormattedArray_LengthBoundsUnchanged(t *testing.T) {
	ctx := newStubCtx()
	emitter := formattedArrayEmitter{kind: reflection.KindArray}
	got := emitter.EmitValidateCheck(arrAnnotation(map[string]any{"minItems": 1.0, "maxItems": 4.0}), "v", ctx)

	if got != "v.length >= 1 && v.length <= 4" {
		t.Errorf("check = %q, want the inline length compares", got)
	}
	if len(ctx.order) != 0 || len(ctx.pureFns) != 0 {
		t.Errorf("length bounds should hoist nothing; items=%v pureFns=%v", ctx.order, ctx.pureFns)
	}
}

// TestFormattedArray_NoContextFallsBackInline — direct emitter callers pass no
// context and must still get a semantically identical check.
func TestFormattedArray_NoContextFallsBackInline(t *testing.T) {
	emitter := formattedArrayEmitter{kind: reflection.KindArray}
	got := emitter.EmitValidateCheck(arrAnnotation(map[string]any{"uniqueItems": true}), "v", nil)
	if !strings.Contains(got, "const canon") {
		t.Errorf("context-free emit must inline the canonical form; got %q", got)
	}
}
