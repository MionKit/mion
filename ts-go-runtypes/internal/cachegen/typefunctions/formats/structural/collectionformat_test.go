package structural

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

func setAnnotation(params map[string]any) *reflection.FormatAnnotation {
	return &reflection.FormatAnnotation{Name: formattedSetName, Params: params}
}

func mapAnnotation(params map[string]any) *reflection.FormatAnnotation {
	return &reflection.FormatAnnotation{Name: formattedMapName, Params: params}
}

func lookupCollection(t *testing.T, name string) formats.Emitter {
	t.Helper()
	emitter, ok := formats.Lookup(reflection.KindClass, name)
	if !ok {
		t.Fatalf("%s is not registered under KindClass", name)
	}
	return emitter
}

// TestCollectionFormats_RegisteredUnderKindClass — both families dispatch off
// the class node a branded Map / Set projects to.
func TestCollectionFormats_RegisteredUnderKindClass(t *testing.T) {
	for _, name := range []string{formattedSetName, formattedMapName} {
		if emitter := lookupCollection(t, name); emitter.Name() != name {
			t.Errorf("registered name = %q, want %q", emitter.Name(), name)
		}
	}
}

// TestCollectionFormats_SizeBoundsReadSize — the array keywords over `.size`,
// each bound alone and together, inline (nothing to hoist).
func TestCollectionFormats_SizeBoundsReadSize(t *testing.T) {
	cases := []struct {
		name   string
		params map[string]any
		want   string
	}{
		{"min", map[string]any{"minItems": 1.0}, "v.size >= 1"},
		{"max", map[string]any{"maxItems": 4.0}, "v.size <= 4"},
		{"both", map[string]any{"minItems": 1.0, "maxItems": 4.0}, "v.size >= 1 && v.size <= 4"},
	}
	for _, family := range []struct {
		name       string
		annotation func(map[string]any) *reflection.FormatAnnotation
	}{{formattedSetName, setAnnotation}, {formattedMapName, mapAnnotation}} {
		emitter := lookupCollection(t, family.name)
		for _, tc := range cases {
			ctx := newStubCtx()
			got := emitter.EmitValidateCheck(family.annotation(tc.params), "v", ctx)
			if got != tc.want {
				t.Errorf("%s/%s: check = %q, want %q", family.name, tc.name, got, tc.want)
			}
			if len(ctx.order) != 0 || len(ctx.pureFns) != 0 {
				t.Errorf("%s/%s: size bounds should hoist nothing; items=%v pureFns=%v", family.name, tc.name, ctx.order, ctx.pureFns)
			}
		}
	}
}

// TestFormattedSet_UniqueItemsGoesThroughThePureFn — the Set family calls the
// same `rt::uniqueItems` alias the array family does (it iterates with
// for…of, so a Set needs no adapter) and never inlines the canonical form.
func TestFormattedSet_UniqueItemsGoesThroughThePureFn(t *testing.T) {
	ctx := newStubCtx()
	emitter := lookupCollection(t, formattedSetName)
	got := emitter.EmitValidateCheck(setAnnotation(map[string]any{"uniqueItems": true, "maxItems": 3.0}), "v", ctx)

	if got != "v.size <= 3 && uniqueItems(v)" {
		t.Fatalf("check = %q, want the size bound and the pure-fn alias", got)
	}
	if len(ctx.pureFns) != 1 || ctx.pureFns[0] != "rt::uniqueItems" {
		t.Fatalf("pure fns = %v, want exactly [rt::uniqueItems]", ctx.pureFns)
	}
	if strings.Contains(got, "const canon") {
		t.Errorf("emitted body must not inline the canonical form; got %q", got)
	}
}

// TestFormattedMap_IgnoresUniqueItems — a Map's keys are unique by
// construction; the keyword is not part of its bag and the emitter stays
// total by ignoring it.
func TestFormattedMap_IgnoresUniqueItems(t *testing.T) {
	ctx := newStubCtx()
	emitter := lookupCollection(t, formattedMapName)
	got := emitter.EmitValidateCheck(mapAnnotation(map[string]any{"uniqueItems": true, "maxItems": 3.0}), "v", ctx)
	if got != "v.size <= 3" {
		t.Errorf("check = %q, want only the size bound", got)
	}
	if len(ctx.pureFns) != 0 {
		t.Errorf("a Map must not pull the uniqueItems pure fn; got %v", ctx.pureFns)
	}
}

// TestCollectionFormats_ErrorsLane — one canonical error per keyword, reported
// under the family name with the base kind word (`set` / `map`).
func TestCollectionFormats_ErrorsLane(t *testing.T) {
	ctx := newStubCtx()
	got := lookupCollection(t, formattedSetName).EmitValidationErrorsCheck(
		setAnnotation(map[string]any{"minItems": 1.0, "maxItems": 2.0, "uniqueItems": true}), "v", "pth", "er", ctx)
	want := "if (v.size < 1) er.push({expected:'set',path:[...pth],format:{name:'formattedSet',formatPath:['minItems'],val:1}});" +
		"if (v.size > 2) er.push({expected:'set',path:[...pth],format:{name:'formattedSet',formatPath:['maxItems'],val:2}});" +
		"if (!(uniqueItems(v))) er.push({expected:'set',path:[...pth],format:{name:'formattedSet',formatPath:['uniqueItems'],val:true}})"
	if got != want {
		t.Errorf("set errors = %q\nwant %q", got, want)
	}

	got = lookupCollection(t, formattedMapName).EmitValidationErrorsCheck(
		mapAnnotation(map[string]any{"maxItems": 2.0}), "v", "pth", "er", newStubCtx())
	want = "if (v.size > 2) er.push({expected:'map',path:[...pth],format:{name:'formattedMap',formatPath:['maxItems'],val:2}})"
	if got != want {
		t.Errorf("map errors = %q\nwant %q", got, want)
	}
}

// TestCollectionFormats_EmptyParamsEmitNothing — a brand with no literal keys
// (a `contains`-only Set) adds no check beyond the base validator.
func TestCollectionFormats_EmptyParamsEmitNothing(t *testing.T) {
	emitter := lookupCollection(t, formattedSetName)
	if got := emitter.EmitValidateCheck(setAnnotation(map[string]any{}), "v", newStubCtx()); got != "" {
		t.Errorf("validate = %q, want empty", got)
	}
	if got := emitter.EmitValidationErrorsCheck(setAnnotation(nil), "v", "pth", "er", newStubCtx()); got != "" {
		t.Errorf("errors = %q, want empty", got)
	}
}

// TestCollectionFormats_ValidateParams — the build-time contradiction names
// the type-first wrapper of the family.
func TestCollectionFormats_ValidateParams(t *testing.T) {
	cases := []struct {
		name string
		want string
	}{
		{formattedSetName, "FormattedSet: `maxItems` cannot be less than `minItems`"},
		{formattedMapName, "FormattedMap: `maxItems` cannot be less than `minItems`"},
	}
	for _, tc := range cases {
		validator := lookupCollection(t, tc.name).(formats.ParamValidator)
		annotation := &reflection.FormatAnnotation{Name: tc.name, Params: map[string]any{"minItems": 3.0, "maxItems": 1.0}}
		errs := validator.ValidateParams(annotation)
		if len(errs) != 1 || errs[0] != tc.want {
			t.Errorf("%s: errs = %v, want [%q]", tc.name, errs, tc.want)
		}
		annotation.Params = map[string]any{"minItems": 1.0, "maxItems": 3.0}
		if errs := validator.ValidateParams(annotation); len(errs) != 0 {
			t.Errorf("%s: consistent bounds must not error, got %v", tc.name, errs)
		}
	}
}
