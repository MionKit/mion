package structural

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

func arrAnnotation(params map[string]any) *reflection.FormatAnnotation {
	return &reflection.FormatAnnotation{Name: formattedArrayName, Params: params}
}

// TestFormattedArray_UniqueItemsGoesThroughThePureFn — the canonicalisation
// closure used to be rebuilt inside the emitted body on EVERY validator call.
// It now lives in `rt::canonicalJson`, constructed once per module and reached
// as a DEPENDENCY of the family's own predicate — an array names
// `@mionjs/run-types/src/runtypes/pure-fns-utils#uniqueArrayItems`, never a shared one with a runtime kind test.
func TestFormattedArray_UniqueItemsGoesThroughThePureFn(t *testing.T) {
	ctx := newStubCtx()
	emitter := formattedArrayEmitter{kind: reflection.KindArray}
	got := emitter.EmitValidateCheck(arrAnnotation(map[string]any{"uniqueItems": true}), "v", ctx)

	if got != purefnids.NameOf(purefnids.UniqueArrayItems)+"(v)" {
		t.Fatalf("check = %q, want a call to the pure-fn alias", got)
	}
	if len(ctx.pureFns) != 1 || ctx.pureFns[0] != purefnids.UniqueArrayItems {
		t.Fatalf("pure fns = %v, want exactly ["+purefnids.UniqueArrayItems+"]", ctx.pureFns)
	}
	for _, banned := range []string{"const canon", "JSON.stringify", "new Set("} {
		if strings.Contains(got, banned) {
			t.Errorf("emitted body must not inline %q; got %q", banned, got)
		}
	}
}

// TestFormattedArray_UniqueItemsPureFnsAreDistinct — the three uniqueItems walks
// live in pure-fns-utils, which the package entry side-effect imports, so they are
// registered even for a program that never imports `@mionjs/run-types/formats`.
func TestFormattedArray_UniqueItemsPureFnsAreDistinct(t *testing.T) {
	for _, id := range []string{purefnids.UniqueArrayItems, purefnids.UniqueSetMembers, purefnids.UniqueMapEntries} {
		if !purefnids.Has(id) {
			t.Errorf("id = %q, want a package-owned pure fn the entry side-effect registers", id)
		}
	}
	// One pure fn per family, and no two the same: sharing one would put a
	// runtime kind test back in the hot path and make every type import all
	// three walks.
	seen := map[string]bool{}
	for _, id := range []string{purefnids.UniqueArrayItems, purefnids.UniqueSetMembers, purefnids.UniqueMapEntries} {
		if seen[id] {
			t.Errorf("two families share the uniqueItems pure fn %q", id)
		}
		seen[id] = true
	}
}

// TestFormattedArray_BothLanesShareOnePureFnAlias — validate and the errors lane
// both route through the alias, and the errors lane keeps its keyword
// attribution.
func TestFormattedArray_BothLanesShareOnePureFnAlias(t *testing.T) {
	ctx := newStubCtx()
	emitter := formattedArrayEmitter{kind: reflection.KindArray}
	got := emitter.EmitValidationErrorsCheck(arrAnnotation(map[string]any{"uniqueItems": true}), "v", "pth", "er", ctx)

	if !strings.Contains(got, "uniqueArrayItems(v)") {
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
