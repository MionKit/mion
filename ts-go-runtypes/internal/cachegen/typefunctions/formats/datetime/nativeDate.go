package datetime

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// nativeDateEmitter implements the format named "nativeDate", FormatDate<P>, branding the native JS `Date`.
// Its bounds allow both date AND time duration components, since a Date carries both, and they are added on top
// of the base-kind Date check (instanceof + non-NaN); Date serialises through the existing default serialisers.
// Kind is KindClass because splitBuiltinClassBrand (internal/cachegen/runtype/intersection_collapse.go) lifts the
// brand off the `Date & {brand}` intersection onto a KindClass / SubKindDate node.
type nativeDateEmitter struct{}

func init() {
	formats.Register(nativeDateEmitter{})
}

func (nativeDateEmitter) Name() string                    { return "nativeDate" }
func (nativeDateEmitter) Kind() reflection.ReflectionKind { return reflection.KindClass }

// ValidateParams validates the min/max bounds with dateTimeKind; the layout key "T" is only read by the
// best-effort static ordering parse for absolute dateTime literals.
func (nativeDateEmitter) ValidateParams(annotation *reflection.FormatAnnotation) []string {
	if annotation == nil {
		return nil
	}
	return validateMinMax(annotation.Params, dateTimeKind, "T")
}

// EmitValidateCheck adds only the bound guard: the host class arm emits the base Date check itself.
func (nativeDateEmitter) EmitValidateCheck(annotation *reflection.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	return nativeDateBoundChecks(ctx, annotation.Params, vλl)
}

func (nativeDateEmitter) EmitValidationErrorsCheck(annotation *reflection.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	// The value key is the Date's epoch ms directly, so no string parsing is needed.
	return boundTypeErrorChecksFromKey(ctx, annotation.Params, vλl+".getTime()", pathExpr, errorsArr, "Date", "nativeDate", dateTimeKind, "T")
}

// nativeDateBoundChecks builds the AND-able min/max/gt/lt expression over a Date value's getTime().
func nativeDateBoundChecks(ctx formats.EmitContext, params map[string]any, vλl string) string {
	return boundValidateChecksFromKey(ctx, params, vλl+".getTime()", dateTimeKind, "T")
}
